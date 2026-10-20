/** Full-register backup, verification and operational restore. */

type TableSpec = {
  name: string;
  key: string;
  order: string;
  columns: readonly string[];
  restore?: boolean;
};

export const snapshotTables: readonly TableSpec[] = [
  {name: 'hubs', key: 'hubs', order: 'created_at', columns: ['id', 'name', 'created_at', 'updated_at'], restore: true},
  {name: 'hub_units', key: 'hubUnits', order: 'unit_code', columns: ['id', 'hub_id', 'unit_code', 'capacity', 'status', 'notes'], restore: true},
  {name: 'vendors', key: 'vendors', order: 'id', columns: ['id', 'payload', 'updated_at'], restore: true},
  {name: 'allocations', key: 'allocations', order: 'hub,unit', columns: ['hub', 'unit', 'vendor_id', 'hub_id'], restore: true},
  {name: 'allocation_history', key: 'allocationHistory', order: 'created_at', columns: ['id', 'hub_id', 'unit_code', 'vendor_id', 'action', 'actor', 'created_at', 'note'], restore: true},
  {name: 'events', key: 'events', order: 'created_at', columns: ['id', 'vendor_id', 'kind', 'amount', 'note', 'due', 'created_at', 'actor', 'resolved', 'gps_lat', 'gps_lng', 'gps_accuracy', 'owner', 'severity', 'case_status', 'checklist', 'evidence', 'follow_up_of', 'snapshot', 'receipt_no', 'pay_method', 'pay_ref', 'cashier', 'reconciled', 'reversal_of', 'reconciliation_ref'], restore: true},
  {name: 'pitches', key: 'pitches', order: 'pitch_code', columns: ['id', 'vendor_id', 'pitch_code', 'ward', 'area', 'activity', 'lat', 'lng', 'accuracy', 'verified_at'], restore: true},
  {name: 'permits', key: 'permits', order: 'created_at', columns: ['id', 'vendor_id', 'permit_number', 'card_serial', 'status', 'note', 'actor', 'created_at'], restore: true},
  {name: 'permit_documents', key: 'permitDocuments', order: 'created_at', columns: ['id', 'vendor_id', 'kind', 'card_serial', 'permit_expires', 'note', 'actor', 'actor_id', 'created_at'], restore: true},
  {name: 'renewal_reminders', key: 'renewalReminders', order: 'expires', columns: ['id', 'vendor_id', 'expires', 'days_left', 'status', 'note', 'actor', 'created_at'], restore: true},
  {name: 'fee_schedules', key: 'feeSchedules', order: 'effective_from', columns: ['id', 'category', 'amount_cents', 'effective_from', 'effective_to', 'applicability', 'approval_ref', 'created_at'], restore: true},
  {name: 'requirements', key: 'requirements', order: 'rule_ref', columns: ['id', 'rule_ref', 'category', 'document_label', 'validity_months'], restore: true},
  {name: 'attachments', key: 'attachments', order: 'created_at', columns: ['key', 'kind', 'vendor_id', 'label', 'name', 'created_by', 'created_at'], restore: true},
  {name: 'notice_deliveries', key: 'noticeDeliveries', order: 'created_at', columns: ['id', 'event_id', 'method', 'status', 'detail', 'actor', 'created_at', 'recipient', 'provider_ref', 'failure_reason', 'idempotency_key'], restore: true},
  {name: 'import_rows', key: 'importRows', order: 'created_at', columns: ['id', 'batch_id', 'payload', 'status', 'note', 'created_at'], restore: true},
  {name: 'audit_log', key: 'auditLog', order: 'seq', columns: ['id', 'entity', 'entity_id', 'action', 'before_json', 'after_json', 'actor', 'created_at', 'actor_id', 'seq']},
  {name: 'audit_chain', key: 'auditChain', order: 'id', columns: ['id', 'last_hash', 'last_seq', 'rows_sealed', 'updated_at']},
  {name: 'integrity_issues', key: 'integrityIssues', order: 'detected_at', columns: ['id', 'entity', 'entity_id', 'parent_id', 'issue', 'payload', 'detected_at', 'resolved_at']},
  {name: 'submission_keys', key: 'submissionKeys', order: 'created_at', columns: ['user_id', 'idempotency_key', 'event_id', 'created_at']},
  {name: 'app_meta', key: 'appMeta', order: 'key', columns: ['key', 'value'], restore: true},
  {name: 'users', key: 'users', order: 'created_at', columns: ['id', 'name', 'email', 'password_hash', 'role', 'active', 'created_at', 'must_change_password']},
] as const;

type SqlStatement = {
  bind(...args: unknown[]): SqlStatement;
  all<T = Record<string, unknown>>(): Promise<{results: T[]}>;
  run(): Promise<unknown>;
};

type Sql = {
  prepare(query: string): SqlStatement;
  batch(statements: SqlStatement[]): Promise<unknown>;
};

type StoredObject = {key: string; contentType: string; base64: string};
type ObjectBody = {arrayBuffer(): Promise<ArrayBuffer>; httpMetadata?: {contentType?: string}};
type ObjectStore = {
  get(key: string): Promise<ObjectBody | null>;
  put(key: string, value: Uint8Array, options?: {httpMetadata?: {contentType?: string}}): Promise<unknown>;
  delete(key: string): Promise<unknown>;
};

export type Snapshot = {
  format: string;
  version: number;
  generatedAt: string;
  generatedBy: string;
  manifest: Record<string, number>;
  checksum: string;
  records: Record<string, unknown[]>;
  objects: StoredObject[];
  notes: string[];
};

function redact(table: string, row: Record<string, unknown>) {
  if (table === 'users') {
    const {password_hash: _passwordHash, ...rest} = row;
    return {...rest, password_hash: 'not exported'};
  }
  return row;
}

function bytesToBase64(bytes: Uint8Array) {
  let result = '';
  const size = 0x8000;
  for (let start = 0; start < bytes.length; start += size) result += String.fromCharCode(...bytes.subarray(start, start + size));
  return btoa(result);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function checksum(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function checksumInput(records: Record<string, unknown[]>, objects: StoredObject[], version: number) {
  return version >= 2 ? JSON.stringify({records, objects}) : JSON.stringify(records);
}

export async function buildSnapshot(db: Sql, store: ObjectStore, actor: string, stamp: string): Promise<Snapshot> {
  const records: Record<string, unknown[]> = {};
  const manifest: Record<string, number> = {};
  for (const table of snapshotTables) {
    const rows = await db.prepare(`SELECT * FROM ${table.name} ORDER BY ${table.order}`).all<Record<string, unknown>>();
    const cleaned = rows.results.map(row => redact(table.name, row));
    records[table.key] = cleaned;
    manifest[table.name] = cleaned.length;
  }
  const objects: StoredObject[] = [];
  for (const attachment of (records.attachments || []) as Record<string, unknown>[]) {
    const key = String(attachment.key || '');
    if (!key) continue;
    const object = await store.get(key);
    if (!object) throw new Error(`Uploaded file ${key} is registered but missing from object storage.`);
    const bytes = new Uint8Array(await object.arrayBuffer());
    objects.push({key, contentType: object.httpMetadata?.contentType || 'application/octet-stream', base64: bytesToBase64(bytes)});
  }
  manifest.stored_objects = objects.length;
  const version = 2;
  return {
    format: 'sol-plaatje-vendor-register', version, generatedAt: stamp, generatedBy: actor, manifest,
    checksum: await checksum(checksumInput(records, objects, version)), records, objects,
    notes: [
      'Uploaded photographs and documents are included in this backup.',
      'Password hashes and live sign-in tokens are deliberately excluded. A restore keeps the current user accounts and sessions.',
      'The append-only audit trail is retained on restore and receives a new restore entry.',
      'This export contains personal data. Store it encrypted, restrict access, and delete copies when the retention period ends.',
    ],
  };
}

function relationMismatches(document: Snapshot) {
  const records = document.records;
  const vendors = new Set(((records.vendors || []) as Record<string, unknown>[]).map(row => String(row.id || '')));
  const hubs = new Set(((records.hubs || []) as Record<string, unknown>[]).map(row => String(row.id || '')));
  const units = new Set(((records.hubUnits || []) as Record<string, unknown>[]).map(row => `${row.hub_id}:${row.unit_code}`));
  const events = new Set(((records.events || []) as Record<string, unknown>[]).map(row => String(row.id || '')));
  const mismatches: string[] = [];
  const vendorChildren = ['allocations', 'allocationHistory', 'events', 'permits', 'permitDocuments', 'renewalReminders'] as const;
  for (const key of vendorChildren) for (const row of (records[key] || []) as Record<string, unknown>[]) {
    if (!vendors.has(String(row.vendor_id || ''))) mismatches.push(`${key}: missing vendor ${row.vendor_id || '(blank)'}`);
  }
  for (const key of ['pitches', 'attachments'] as const) for (const row of (records[key] || []) as Record<string, unknown>[]) {
    if (row.vendor_id && !vendors.has(String(row.vendor_id))) mismatches.push(`${key}: missing vendor ${row.vendor_id}`);
  }
  for (const row of (records.hubUnits || []) as Record<string, unknown>[]) {
    if (!hubs.has(String(row.hub_id || ''))) mismatches.push(`hubUnits: missing hub ${row.hub_id}`);
  }
  for (const row of (records.allocationHistory || []) as Record<string, unknown>[]) {
    if (row.hub_id && !hubs.has(String(row.hub_id))) mismatches.push(`allocationHistory: missing hub ${row.hub_id}`);
  }
  for (const row of (records.allocations || []) as Record<string, unknown>[]) {
    if (!hubs.has(String(row.hub_id || ''))) mismatches.push(`allocations: missing hub ${row.hub_id || '(blank)'}`);
    if (!units.has(`${row.hub_id}:${row.unit}`)) mismatches.push(`allocations: missing unit ${row.hub_id}:${row.unit}`);
  }
  for (const row of (records.noticeDeliveries || []) as Record<string, unknown>[]) {
    if (!events.has(String(row.event_id || ''))) mismatches.push(`noticeDeliveries: missing event ${row.event_id || '(blank)'}`);
  }
  return mismatches.slice(0, 50);
}

export async function verifySnapshot(input: unknown) {
  const document = input as Snapshot;
  if (!document || document.format !== 'sol-plaatje-vendor-register') throw new Error('This file is not a vendor register export.');
  if (!document.records || typeof document.records !== 'object') throw new Error('The export has no records section.');
  const version = Number(document.version || 1);
  if (version !== 1 && version !== 2) throw new Error('This backup version is not supported.');
  if (Array.isArray(document.records)) throw new Error('The records section must contain named tables.');
  for (const table of snapshotTables) {
    const rows = document.records[table.key];
    if (version === 2 && !Array.isArray(rows)) throw new Error(`The backup is missing table ${table.name}.`);
    if (rows !== undefined && (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row)))) throw new Error(`Invalid rows in ${table.name}.`);
  }
  if (version === 2 && !Array.isArray(document.objects)) throw new Error('The backup has no stored files section.');
  const objects = Array.isArray(document.objects) ? document.objects : [];
  const keys = new Set<string>();
  for (const object of objects) {
    if (!object || typeof object.key !== 'string' || !object.key || keys.has(object.key) || typeof object.base64 !== 'string' || typeof object.contentType !== 'string') throw new Error('Invalid or duplicate stored file in backup.');
    try { base64ToBytes(object.base64); } catch { throw new Error(`Stored file ${object.key} is not valid base64.`); }
    keys.add(object.key);
  }
  const expected = await checksum(checksumInput(document.records, objects, version));
  const manifest: Record<string, number> = document.manifest || {};
  const counts: Record<string, number> = {};
  const mismatches: string[] = [];
  for (const table of snapshotTables) {
    const rows = document.records[table.key];
    counts[table.name] = Array.isArray(rows) ? rows.length : 0;
    if (version === 2 && !Number.isInteger(manifest[table.name])) mismatches.push(`${table.name}: manifest count missing`);
    if (manifest[table.name] !== undefined && manifest[table.name] !== counts[table.name]) mismatches.push(`${table.name}: manifest ${manifest[table.name]}, found ${counts[table.name]}`);
  }
  counts.stored_objects = objects.length;
  for (const row of (version >= 2 ? document.records.attachments || [] : []) as Record<string, unknown>[]) {
    if (!keys.has(String(row.key || ''))) mismatches.push(`attachments: missing stored file ${row.key}`);
  }
  if (version >= 2 && manifest.stored_objects !== objects.length) mismatches.push(`stored objects: manifest ${manifest.stored_objects}, found ${objects.length}`);
  mismatches.push(...relationMismatches(document));
  return {
    ok: expected === document.checksum && mismatches.length === 0,
    restorable: version >= 2 && expected === document.checksum && mismatches.length === 0,
    checksumMatches: expected === document.checksum,
    generatedAt: document.generatedAt || '', generatedBy: document.generatedBy || '', version, counts, mismatches,
    notes: Array.isArray(document.notes) ? document.notes : [],
    confirmation: `RESTORE ${String(document.checksum || '').slice(0, 8).toUpperCase()}`,
  };
}

const deleteOrder = ['submission_keys', 'notice_deliveries', 'permit_documents', 'renewal_reminders', 'permits', 'allocation_history', 'allocations', 'pitches', 'events', 'hub_units', 'attachments', 'fee_schedules', 'requirements', 'import_rows', 'vendors', 'hubs'] as const;

export async function restoreSnapshot(db: Sql, store: ObjectStore, input: unknown) {
  const document = input as Snapshot;
  const verification = await verifySnapshot(document);
  if (!verification.restorable) throw new Error('The backup is not a verified version 2 backup and cannot be restored.');
  const attachmentRows = (document.records.attachments || []) as Record<string, unknown>[];
  const objectByKey = new Map(document.objects.map(object => [object.key, object]));
  for (const row of attachmentRows) {
    const key = String(row.key || '');
    if (key && !objectByKey.has(key)) throw new Error(`The backup is missing uploaded file ${key}.`);
  }
  const current = await db.prepare('SELECT key FROM attachments').all<{key: string}>();
  // Preserve existing bytes until the database transaction succeeds.
  const previous = new Map<string, {bytes: Uint8Array; contentType: string} | null>();
  const rollbackObjects = async () => {
    for (const [key, object] of previous) {
      if (object) await store.put(key, object.bytes, {httpMetadata: {contentType: object.contentType}});
      else await store.delete(key);
    }
  };
  try {
    for (const object of document.objects) {
      const old = await store.get(object.key);
      previous.set(object.key, old ? {bytes: new Uint8Array(await old.arrayBuffer()), contentType: old.httpMetadata?.contentType || 'application/octet-stream'} : null);
      await store.put(object.key, base64ToBytes(object.base64), {httpMetadata: {contentType: object.contentType || 'application/octet-stream'}});
    }
  } catch (cause) { await rollbackObjects(); throw cause; }
  const statements: SqlStatement[] = deleteOrder.map(name => db.prepare(`DELETE FROM ${name}`));
  statements.push(db.prepare("DELETE FROM app_meta WHERE key<>'administrator'"));
  for (const table of snapshotTables.filter(item => item.restore)) {
    const rows = Array.isArray(document.records[table.key]) ? document.records[table.key] as Record<string, unknown>[] : [];
    for (const row of rows) {
      if (table.name === 'app_meta' && row.key === 'administrator') continue;
      const placeholders = table.columns.map(() => '?').join(',');
      statements.push(db.prepare(`INSERT INTO ${table.name}(${table.columns.join(',')}) VALUES(${placeholders})`).bind(...table.columns.map(column => row[column] ?? '')));
    }
  }
  try { await db.batch(statements); } catch (cause) { await rollbackObjects(); throw cause; }
  const restoredKeys = new Set(document.objects.map(object => object.key));
  const cleanupPending: string[] = [];
  for (const row of current.results) if (!restoredKeys.has(row.key)) {
    try { await store.delete(row.key); } catch { cleanupPending.push(row.key); }
  }
  return {counts: verification.counts, objects: document.objects.length, checksum: document.checksum, cleanupPending};
}
