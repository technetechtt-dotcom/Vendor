import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {runScenarios} from './scenarios.mjs';

const moduleUrls = new Map();
function moduleUrl(file) {
  if (file.pathname.endsWith('/lib/server.ts')) return 'data:text/javascript;base64,' + Buffer.from(`export const database=()=>globalThis.__vendorTestEnvironment.db; export const bucket=()=>globalThis.__vendorTestEnvironment.store; export const bootstrapToken=()=>globalThis.__vendorTestEnvironment.bootstrap||''; export const noticeWebhook=()=>'';`).toString('base64');
  if (moduleUrls.has(file.href)) return moduleUrls.get(file.href);
  const source = ts.transpileModule(readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
  const require = createRequire(file);
  const ast = ts.createSourceFile(file.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edits = [];
  function visit(node) {
    const spec = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier
      : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : null;
    if (spec && ts.isStringLiteral(spec)) {
      const name = spec.text;
      let resolved = name;
      if (name.startsWith('.')) resolved = moduleUrl(new URL(name.endsWith('.ts') || name.endsWith('.mjs') ? name : name + '.ts', file));
      else if (!name.startsWith('node:')) resolved = pathToFileURL(require.resolve(name)).href;
      edits.push([spec.getStart(ast), spec.end, JSON.stringify(resolved)]);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  let resolved = source;
  for (const [start, end, text] of edits.sort((a,b) => b[0]-a[0])) resolved = resolved.slice(0,start)+text+resolved.slice(end);
  const url = 'data:text/javascript;base64,' + Buffer.from(resolved).toString('base64');
  moduleUrls.set(file.href, url);
  return url;
}
async function loadModule(path) {return import(moduleUrl(new URL(path, import.meta.url)));}
const {buildSnapshot, verifySnapshot, restoreSnapshot} = await loadModule('../lib/backup.ts');
const {mutationOriginError} = await loadModule('../lib/cors.ts');

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(name => name.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
  const db = {
    prepare(query) {
      const statement = {query, args: [], bind(...args) {this.args = args; return this;}, async all() {return {results: sqlite.prepare(query).all(...this.args)};}, async first(column) {const row = sqlite.prepare(query).get(...this.args); return column ? row?.[column] ?? null : row ?? null;}, async run() {const result = sqlite.prepare(query).run(...this.args); return {success:true,meta:{changes:Number(result.changes)}};}};
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

function fakeStorage() {
  const values = new Map();
  globalThis.localStorage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key)};
  globalThis.sessionStorage = {getItem: () => null, setItem() {}, removeItem() {}};
  return values;
}

test('field vault migrates plaintext, encrypts credentials and reopens after locking', async () => {
  const values = fakeStorage();
  const vault = await loadModule('../../Field_Officer_App/src/secure-storage.ts');
  const register = await loadModule('../../Field_Officer_App/src/register.ts');
  const draftKey = 'solplaatje.field.visitDrafts';
  localStorage.setItem(draftKey, JSON.stringify({vendor: 'Private vendor', note: 'private evidence'}));
  localStorage.setItem('solplaatje.field.token', 'private-session-token');
  localStorage.setItem('solplaatje.field.user', JSON.stringify({id: 'u1', name: 'Private officer', email: 'test@example.invalid', role: 'field'}));
  await register.setPin('12345678');
  const cipher = localStorage.getItem(vault.VAULT_KEY);
  assert.ok(cipher);
  for (const secret of ['Private vendor', 'private evidence', 'private-session-token', '12345678']) assert.equal(cipher.includes(secret), false);
  assert.equal(localStorage.getItem(draftKey), null);
  assert.equal(localStorage.getItem('solplaatje.field.token'), null);
  vault.privateStorage.setItem('first', 'one');
  vault.privateStorage.setItem('second', 'two');
  await vault.flushPrivateStorage();
  await vault.lockPrivateStorage();
  assert.equal(vault.privateStorage.getItem(draftKey), null);
  assert.equal(await vault.unlockPrivateVault('87654321'), false);
  assert.equal(await vault.unlockPrivateVault('12345678'), true);
  assert.equal(JSON.parse(vault.privateStorage.getItem(draftKey)).vendor, 'Private vendor');
  assert.equal(vault.privateStorage.getItem('first'), 'one');
  assert.equal(vault.privateStorage.getItem('second'), 'two');
  await register.hydrateSession();
  assert.equal(register.getToken(), 'private-session-token');
  await register.resetPhone();
  assert.equal(values.has(vault.VAULT_KEY), false);
});

test('failed initial encryption preserves legacy records and reset cannot resurrect pending writes', async () => {
  const values = fakeStorage();
  const vault = await loadModule('../../Field_Officer_App/src/secure-storage.ts');
  const draftKey = 'solplaatje.field.visitDrafts';
  values.set(draftKey, 'legacy-private-record');
  const setItem = localStorage.setItem;
  localStorage.setItem = (key, value) => {if (key === vault.VAULT_KEY) throw new Error('storage full'); setItem(key, value);};
  await assert.rejects(vault.createPrivateVault('12345678'), /storage full/);
  assert.equal(values.get(draftKey), 'legacy-private-record');
  localStorage.setItem = setItem;
  await vault.createPrivateVault('12345678');
  vault.privateStorage.setItem('pending', 'private');
  await vault.erasePrivateStorage();
  await vault.flushPrivateStorage();
  assert.equal(values.has(vault.VAULT_KEY), false);
  assert.equal(vault.privateStorageReady(), false);
});

test('authenticated acceptance flow exercises all roles and operational route handlers', async (context) => {
  context.mock.method(console, 'error', () => {});
  const environment = fixture();
  globalThis.__vendorTestEnvironment = environment;
  const routes = {};
  for (const name of ['auth', 'register', 'notice', 'permit', 'renewals', 'backup', 'releases']) routes['/api/' + name] = await loadModule('../app/api/' + name + '/route.ts');
  try {
    const result = await runScenarios(async request => {
      const route = routes[new URL(request.url).pathname];
      assert.ok(route, 'route exists');
      return route[request.method](request);
    });
    assert.equal(result.checks.length, 16);
  } finally {environment.sqlite.close(); delete globalThis.__vendorTestEnvironment;}
});
