import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

async function loadModule(path) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}
const {buildSnapshot, verifySnapshot, restoreSnapshot} = await loadModule('../lib/backup.ts');
const {mutationOriginError} = await loadModule('../lib/cors.ts');

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(name => name.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
  const db = {
    prepare(query) {
      const statement = {query, args: [], bind(...args) {this.args = args; return this;}, async all() {return {results: sqlite.prepare(query).all(...this.args)};}, async run() {return sqlite.prepare(query).run(...this.args);}};
      return statement;
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {for (const statement of statements) await statement.run(); sqlite.exec('COMMIT');}
      catch (error) {sqlite.exec('ROLLBACK'); throw error;}
    },
  };
  const files = new Map();
  const store = {
    async get(key) {const file = files.get(key); return file ? {arrayBuffer: async () => file.bytes.slice().buffer, httpMetadata: {contentType: file.type}} : null;},
    async put(key, value, options) {files.set(key, {bytes: new Uint8Array(value), type: options?.httpMetadata?.contentType});},
    async delete(key) {files.delete(key);},
  };
  return {sqlite, db, files, store};
}

test('all migrations apply and parent constraints reject invalid records', () => {
  const {sqlite} = fixture();
  assert.throws(() => sqlite.prepare("INSERT INTO events(id,vendor_id,kind,note,created_at,actor) VALUES('bad','missing','Inspection','test','2026-10-20','test')").run(), /Vendor does not exist/);
  assert.throws(() => sqlite.prepare("INSERT INTO hub_units(id,hub_id,unit_code) VALUES('bad','missing','1')").run(), /Hub does not exist/);
  sqlite.close();
});

test('backup round trip restores records, preserves accounts and clears stale replay keys', async () => {
  const {sqlite, db, store} = fixture();
  sqlite.prepare("INSERT INTO vendors(id,payload,updated_at) VALUES('v1','{}','2026-10-20')").run();
  sqlite.prepare("INSERT INTO users(id,name,email,password_hash,role,created_at) VALUES('u1','Test','test@example.invalid','private-hash','superuser','2026-10-20')").run();
  const snapshot = await buildSnapshot(db, store, 'Test', '2026-10-20T00:00:00Z');
  assert.equal((await verifySnapshot(snapshot)).restorable, true);
  sqlite.prepare("INSERT INTO vendors(id,payload,updated_at) VALUES('v2','{}','2026-10-20')").run();
  sqlite.prepare("INSERT INTO events(id,vendor_id,kind,note,created_at,actor) VALUES('e2','v2','Inspection','test','2026-10-20','Test')").run();
  sqlite.prepare("INSERT INTO submission_keys(user_id,idempotency_key,event_id,created_at) VALUES('u1','key-test','e2','2026-10-20')").run();
  await restoreSnapshot(db, store, snapshot);
  assert.deepEqual(sqlite.prepare('SELECT id FROM vendors').all().map(row => row.id), ['v1']);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM submission_keys').get().n, 0);
  assert.equal(sqlite.prepare("SELECT password_hash FROM users WHERE id='u1'").get().password_hash, 'private-hash');
  assert.equal(snapshot.records.users[0].password_hash, 'not exported');
  sqlite.close();
});

test('incomplete backup and unsupported version are rejected before any write', async () => {
  const {sqlite, db, store} = fixture();
  const snapshot = await buildSnapshot(db, store, 'Test', '2026-10-20T00:00:00Z');
  const incomplete = structuredClone(snapshot);
  delete incomplete.records.vendors;
  await assert.rejects(restoreSnapshot(db, store, incomplete), /missing table vendors/);
  await assert.rejects(verifySnapshot({...snapshot, version: 3}), /not supported/);
  sqlite.close();
});

test('failed database restore restores overwritten object bytes', async () => {
  const {sqlite, db, store, files} = fixture();
  const snapshot = await buildSnapshot(db, store, 'Test', '2026-10-20T00:00:00Z');
  snapshot.objects = [{key: 'same-key', contentType: 'text/plain', base64: btoa('backup')}];
  snapshot.manifest.stored_objects = 1;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({records: snapshot.records, objects: snapshot.objects})));
  snapshot.checksum = Buffer.from(digest).toString('hex');
  await store.put('same-key', new TextEncoder().encode('current'), {httpMetadata: {contentType: 'text/plain'}});
  await assert.rejects(restoreSnapshot({...db, async batch() {throw new Error('transaction failed');}}, store, snapshot), /transaction failed/);
  assert.equal(new TextDecoder().decode(files.get('same-key').bytes), 'current');
  sqlite.close();
});

test('cookie mutations reject foreign origins while native bearer requests work', () => {
  const request = (origin, bearer = '') => new Request('https://register.example/api/backup', {method: 'POST', headers: {origin, ...(bearer ? {authorization: bearer} : {})}});
  assert.equal(mutationOriginError(request('https://register.example')), null);
  assert.equal(mutationOriginError(request('https://attacker.example')).status, 403);
  assert.equal(mutationOriginError(request('http://localhost'), true).status, 403);
  assert.equal(mutationOriginError(request('capacitor://localhost', 'Bearer token'), true), null);
  assert.equal(mutationOriginError(request('capacitor://localhost', 'Bearer token')).status, 403);
});

test('field PIN throttles repeated failures and phone reset erases offline records', async () => {
  const values = new Map();
  globalThis.localStorage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key)};
  globalThis.sessionStorage = {getItem: () => null, setItem() {}, removeItem() {}};
  const {setPin, verifyPin, resetPhone, hasPin} = await loadModule('../../Field_Officer_App/src/register.ts');
  await setPin('123456');
  assert.equal(await verifyPin('123456'), true);
  for (let attempt = 0; attempt < 5; attempt++) assert.equal(await verifyPin('999999'), false);
  await assert.rejects(verifyPin('123456'), /Too many PIN attempts/);
  const keys = ['visitDrafts', 'visitQueue', 'vendorCache', 'visitHistory'].map(key => 'solplaatje.field.' + key);
  for (const key of keys) localStorage.setItem(key, 'personal data');
  await resetPhone();
  for (const key of keys) assert.equal(localStorage.getItem(key), null);
  assert.equal(hasPin(), false);
  delete globalThis.localStorage;
  delete globalThis.sessionStorage;
});
