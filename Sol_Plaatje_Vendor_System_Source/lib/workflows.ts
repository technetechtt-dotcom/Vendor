import {calendarDate, Vendor} from './data';
import {z} from 'zod';

type SqlStatement = D1PreparedStatement;
type Sql = Pick<D1Database, 'prepare' | 'batch'>;

const eventSelect = `id,vendor_id AS vendorId,kind,amount,note,due,created_at AS createdAt,actor,resolved,gps_lat AS gpsLat,gps_lng AS gpsLng,gps_accuracy AS gpsAccuracy,owner,severity,case_status AS caseStatus,checklist,evidence,follow_up_of AS followUpOf,snapshot,receipt_no AS receiptNo,pay_method AS payMethod,pay_ref AS payRef,cashier,reconciled,reversal_of AS reversalOf,reconciliation_ref AS reconciliationRef`;

export {eventSelect};

function text(value: unknown, max: number) {
  return String(value || '').trim().slice(0, max);
}

function dateOk(value: string) {
  return calendarDate(value);
}

/** Build the audit rows for an operation so they can join the same batch as the change. */
export function auditStatement(db: Sql, entity: string, entityId: string, action: string, before: unknown, after: unknown, actor: string, stamp: string, actorId = '') {
  return db.prepare('INSERT INTO audit_log(id,entity,entity_id,action,before_json,after_json,actor,created_at,actor_id,seq) VALUES(?,?,?,?,?,?,?,?,?,(SELECT COALESCE(MAX(seq),0)+1 FROM audit_log))')
    .bind(crypto.randomUUID(), entity, entityId, action, JSON.stringify(before ?? '').slice(0, 4000), JSON.stringify(after ?? '').slice(0, 4000), actor, stamp, String(actorId || '').slice(0, 80));
}

export async function writeAudit(db: Sql, entity: string, entityId: string, action: string, before: unknown, after: unknown, actor: string, stamp: string, actorId = '') {
  await auditStatement(db, entity, entityId, action, before, after, actor, stamp, actorId).run();
  await sealAuditTail(db);
}

const auditMaterial = (previous: string, row: {seq: number; id: string; entity: string; entityId: string; action: string; beforeJson: string; afterJson: string; actor: string; actorId: string; createdAt: string}) =>
  [previous, row.seq, row.id, row.entity, row.entityId, row.action, row.beforeJson, row.afterJson, row.actor, row.actorId || '', row.createdAt].join('\u0001');

async function digest(previous: string, row: {seq: number; id: string; entity: string; entityId: string; action: string; beforeJson: string; afterJson: string; actor: string; actorId: string; createdAt: string}) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(auditMaterial(previous, row)));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Recompute the whole chain and store the final hash. Every row participates,
 * so altering or deleting any audit record changes the recomputed hash and is
 * detected by checkAuditIntegrity(). Best effort: a problem here must never
 * block the real change that was already written.
 */
export async function sealAuditTail(db: Sql) {
  try {
    const rows = await db.prepare('SELECT id,seq,entity,entity_id AS entityId,action,before_json AS beforeJson,after_json AS afterJson,actor,actor_id AS actorId,created_at AS createdAt FROM audit_log ORDER BY seq').all<{id: string; seq: number; entity: string; entityId: string; action: string; beforeJson: string; afterJson: string; actor: string; actorId: string; createdAt: string}>();
    let hash = '';
    let lastSeq = 0;
    for (const row of rows.results) {
      hash = await digest(hash, row);
      lastSeq = Number(row.seq) || lastSeq;
    }
    await db.prepare('UPDATE audit_chain SET last_hash=?,last_seq=?,rows_sealed=?,updated_at=? WHERE id=1').bind(hash, lastSeq, rows.results.length, new Date().toISOString()).run();
    return rows.results.length;
  } catch {
    return 0;
  }
}

/** Recompute the chain and report whether any audit row was altered or removed. */
export async function checkAuditIntegrity(db: Sql) {
  const rows = await db.prepare('SELECT id,seq,entity,entity_id AS entityId,action,before_json AS beforeJson,after_json AS afterJson,actor,actor_id AS actorId,created_at AS createdAt FROM audit_log ORDER BY seq').all<{id: string; seq: number; entity: string; entityId: string; action: string; beforeJson: string; afterJson: string; actor: string; actorId: string; createdAt: string}>();
  const chain = await db.prepare('SELECT last_hash AS lastHash,last_seq AS lastSeq,rows_sealed AS rowsSealed,updated_at AS updatedAt FROM audit_chain WHERE id=1').first<{lastHash: string; lastSeq: number; rowsSealed: number; updatedAt: string}>();
  let hash = '';
  let lastSeq = 0;
  for (const row of rows.results) {
    hash = await digest(hash, row);
    lastSeq = Number(row.seq) || lastSeq;
  }
  const stored = chain?.lastHash || '';
  const intact = Boolean(stored) && stored === hash && rows.results.length === Number(chain?.rowsSealed ?? -1);
  return {
    rows: rows.results.length,
    sealedRows: Number(chain?.rowsSealed ?? 0),
    lastSeq,
    intact,
    sealed: Boolean(stored),
    sealedAt: chain?.updatedAt || '',
  };
}

export async function officeBundle(db: Sql) {
  const [units, pitches, tariffs, permits, requirements, history, imports, audit, permitDocuments, renewals, settings, integrityIssues] = await Promise.all([
    db.prepare('SELECT u.id,u.hub_id AS hubId,h.name AS hub,u.unit_code AS unitCode,u.capacity,u.status,u.notes FROM hub_units u LEFT JOIN hubs h ON h.id=u.hub_id ORDER BY h.name,u.unit_code').all<{id: string; hubId: string; hub: string; unitCode: string; capacity: number; status: string; notes: string}>(),
    db.prepare('SELECT id,vendor_id AS vendorId,pitch_code AS pitchCode,ward,area,activity,lat,lng,accuracy,verified_at AS verifiedAt FROM pitches ORDER BY area,pitch_code').all<{id: string; vendorId: string; pitchCode: string; ward: string; area: string; activity: string; lat: string; lng: string; accuracy: string; verifiedAt: string}>(),
    db.prepare('SELECT id,category,amount_cents AS amountCents,effective_from AS effectiveFrom,effective_to AS effectiveTo,applicability,approval_ref AS approvalRef,created_at AS createdAt FROM fee_schedules ORDER BY effective_from DESC').all<{id: string; category: string; amountCents: number; effectiveFrom: string; effectiveTo: string; applicability: string; approvalRef: string; createdAt: string}>(),
    db.prepare('SELECT id,vendor_id AS vendorId,permit_number AS permitNumber,card_serial AS cardSerial,status,note,actor,created_at AS createdAt FROM permits ORDER BY created_at DESC').all<{id: string; vendorId: string; permitNumber: string; cardSerial: string; status: string; note: string; actor: string; createdAt: string}>(),
    db.prepare('SELECT id,rule_ref AS ruleRef,category,document_label AS documentLabel,validity_months AS validityMonths FROM requirements ORDER BY category,document_label').all<{id: string; ruleRef: string; category: string; documentLabel: string; validityMonths: number}>(),
    db.prepare('SELECT id,hub_id AS hubId,unit_code AS unitCode,vendor_id AS vendorId,action,actor,created_at AS createdAt,note FROM allocation_history ORDER BY created_at DESC LIMIT 200').all<{id: string; hubId: string; unitCode: string; vendorId: string; action: string; actor: string; createdAt: string; note: string}>(),
    db.prepare('SELECT id,batch_id AS batchId,payload,status,note,created_at AS createdAt FROM import_rows ORDER BY created_at DESC LIMIT 200').all<{id: string; batchId: string; payload: string; status: string; note: string; createdAt: string}>(),
    db.prepare('SELECT id,entity,entity_id AS entityId,action,before_json AS beforeJson,after_json AS afterJson,actor,actor_id AS actorId,created_at AS createdAt FROM audit_log ORDER BY created_at DESC LIMIT 200').all<{id: string; entity: string; entityId: string; action: string; beforeJson: string; afterJson: string; actor: string; actorId: string; createdAt: string}>(),
    db.prepare('SELECT id,vendor_id AS vendorId,kind,card_serial AS cardSerial,permit_expires AS permitExpires,note,actor,created_at AS createdAt FROM permit_documents ORDER BY created_at DESC LIMIT 200').all<{id: string; vendorId: string; kind: string; cardSerial: string; permitExpires: string; note: string; actor: string; createdAt: string}>(),
    db.prepare('SELECT id,vendor_id AS vendorId,expires,days_left AS daysLeft,status,note,actor,created_at AS createdAt FROM renewal_reminders ORDER BY expires LIMIT 200').all<{id: string; vendorId: string; expires: string; daysLeft: number; status: string; note: string; actor: string; createdAt: string}>(),
    db.prepare("SELECT value FROM app_meta WHERE key='operations'").first<{value: string}>(),
    db.prepare("SELECT id,entity,entity_id AS entityId,parent_id AS parentId,issue,payload,detected_at AS detectedAt,resolved_at AS resolvedAt FROM integrity_issues WHERE resolved_at='' ORDER BY detected_at DESC").all<{id: string; entity: string; entityId: string; parentId: string; issue: string; payload: string; detectedAt: string; resolvedAt: string}>(),
  ]);
  let auditIntegrity = await checkAuditIntegrity(db);
  if (!auditIntegrity.sealed) {
    await sealAuditTail(db);
    auditIntegrity = await checkAuditIntegrity(db);
  }
  return {
    units: units.results,
    pitches: pitches.results,
    tariffs: tariffs.results,
    permits: permits.results,
    requirements: requirements.results,
    allocationHistory: history.results,
    imports: imports.results,
    audit: audit.results,
    permitDocuments: permitDocuments.results,
    renewals: renewals.results,
    integrityIssues: integrityIssues.results,
    auditIntegrity,
    settings: settings?.value ? JSON.parse(settings.value) : {documentNote: ''},
  };
}

export function parseCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) {
      if (char === '"') {
        if (csv[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell.trim()); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && csv[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (cell || row.length) {
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
  }
  return rows;
}

const vendorSchema = z.object({
  id: z.string().max(80), name: z.string().trim().min(1).max(500), business: z.string().trim().min(1).max(500),
  type: z.enum(['Formal', 'Informal']), status: z.enum(['Approved', 'Pending review', 'Suspended']),
  sector: z.string().max(500), hub: z.string().max(500), unit: z.string().max(500), address: z.string().max(500),
  lat: z.string().max(500), lng: z.string().max(500), phone: z.string().max(500), email: z.string().max(500),
  issued: z.string().refine(calendarDate), expires: z.string().refine(calendarDate), photo: z.string().max(500),
  documents: z.array(z.string().max(80)), sample: z.boolean().optional(),
  files: z.array(z.object({id: z.string().uuid(), label: z.string().max(80), name: z.string().max(180), url: z.string(), contentType: z.string().max(100)}).refine(file => file.url === '/api/document?key=' + file.id)).max(12).optional(),
});
export function validateVendorShape(input: unknown): asserts input is Vendor {
  const result = vendorSchema.safeParse(input);
  if (!result.success) throw new Error('Invalid registration: ' + result.error.issues.map(issue => issue.path.join('.') + ' ' + issue.message).slice(0, 3).join('; '));
  const v = result.data;
  if (v.expires < v.issued) throw new Error('Expiry must follow the issue date.');
  if (v.type === 'Informal' && (!v.lat.trim() || !v.lng.trim() || !Number.isFinite(Number(v.lat)) || !Number.isFinite(Number(v.lng)) || Math.abs(Number(v.lat)) > 90 || Math.abs(Number(v.lng)) > 180)) throw new Error('Enter valid GPS coordinates for the informal trader.');
  if (v.type === 'Formal' && (!v.hub.trim() || !v.unit.trim())) throw new Error('Select a hub and enter the allocated unit.');
}

function claimExists(gate?: {id: string; note: string}) {
  return gate ? "EXISTS (SELECT 1 FROM import_rows WHERE id=? AND status='approved' AND note=?)" : '';
}

export async function allocationPlan(db: Sql, vendor: Vendor, hubId: string, actor: string, stamp: string, gate?: {id: string; note: string}) {
  const previous = await db.prepare('SELECT hub,unit,hub_id AS hubId FROM allocations WHERE vendor_id=?').bind(vendor.id).first<{hub: string; unit: string; hubId: string}>();
  const claim = claimExists(gate);
  const claimArgs = gate ? [gate.id, gate.note] : [];
  const available = `NOT EXISTS (SELECT 1 FROM hub_units WHERE hub_id=? AND unit_code=? AND status IN ('reserved','unavailable'))`;
  const keeping = Boolean(vendor.type === 'Formal' && previous && previous.unit === vendor.unit && (previous.hubId === hubId || previous.hub === vendor.hub));
  if (vendor.type === 'Formal') {
    const unit = await db.prepare('SELECT status FROM hub_units WHERE hub_id=? AND unit_code=?').bind(hubId, vendor.unit).first<{status: string}>();
    const holder = await db.prepare('SELECT vendor_id FROM allocations WHERE (hub_id=? OR hub=?) AND unit=?').bind(hubId, vendor.hub, vendor.unit).first<{vendor_id: string}>();
    if (holder && holder.vendor_id !== vendor.id) throw new Error('This hub unit is already allocated to another vendor.');
    if (unit && ['reserved', 'unavailable'].includes(unit.status) && !keeping) throw new Error('This unit is ' + unit.status + ' and cannot be allocated.');
    if (unit && unit.status === 'occupied' && !keeping && holder && holder.vendor_id !== vendor.id) throw new Error('This unit is already occupied.');
  }
  if (keeping) return [];
  const statements: SqlStatement[] = [db.prepare('DELETE FROM allocations WHERE vendor_id=?' + (claim ? ' AND ' + claim : '')).bind(vendor.id, ...claimArgs)];
  const changed = !previous || vendor.type !== 'Formal' || previous.unit !== vendor.unit || previous.hub !== vendor.hub;
  if (previous && changed) {
    statements.push(db.prepare("UPDATE hub_units SET status='available' WHERE hub_id=? AND unit_code=? AND status='occupied'" + (claim ? ' AND ' + claim : '')).bind(previous.hubId || '', previous.unit, ...claimArgs));
    statements.push(db.prepare('INSERT INTO allocation_history(id,hub_id,unit_code,vendor_id,action,actor,created_at,note) ' + (claim ? 'SELECT ?,?,?,?,?,?,?,? WHERE ' + claim : 'VALUES(?,?,?,?,?,?,?,?)')).bind(crypto.randomUUID(), previous.hubId || '', previous.unit, vendor.id, 'released', actor, stamp, 'Allocation released', ...claimArgs));
  }
  if (vendor.type === 'Formal') {
    statements.push(db.prepare("INSERT INTO hub_units(id,hub_id,unit_code,capacity,status,notes) SELECT ?,?,?,1,'occupied','' WHERE " + (claim ? claim + ' AND ' : '') + available + " ON CONFLICT(hub_id,unit_code) DO UPDATE SET status='occupied' WHERE hub_units.status NOT IN ('reserved','unavailable')").bind(crypto.randomUUID(), hubId, vendor.unit, ...claimArgs, hubId, vendor.unit));
    statements.push(db.prepare('INSERT INTO allocations(hub,unit,vendor_id,hub_id) SELECT ?,?,?,? WHERE ' + (claim ? claim + ' AND ' : '') + 'EXISTS (SELECT 1 FROM hub_units WHERE hub_id=? AND unit_code=?)').bind(vendor.hub, vendor.unit, vendor.id, hubId, ...claimArgs, hubId, vendor.unit));
    if (changed) statements.push(db.prepare('INSERT INTO allocation_history(id,hub_id,unit_code,vendor_id,action,actor,created_at,note) ' + (claim ? 'SELECT ?,?,?,?,?,?,?,? WHERE ' + claim : 'VALUES(?,?,?,?,?,?,?,?)')).bind(crypto.randomUUID(), hubId, vendor.unit, vendor.id, previous ? 'transferred' : 'allocated', actor, stamp, previous ? 'From ' + previous.hub + ' ' + previous.unit : 'Allocated', ...claimArgs));
  }
  return statements;
}

export async function renameHub(db: Sql, id: string, name: string, previousName: string, actor: string, stamp: string, actorId = '') {
  const rows = await db.prepare('SELECT id,payload FROM vendors').all<{id: string; payload: string}>();
  const updates: SqlStatement[] = [];
  for (const row of rows.results) {
    const vendor = JSON.parse(row.payload);
    if (vendor.hub !== previousName) continue;
    vendor.hub = name;
    updates.push(db.prepare('UPDATE vendors SET payload=?,updated_at=? WHERE id=?').bind(JSON.stringify(vendor), stamp, row.id));
  }
  await db.batch([
    db.prepare('UPDATE hubs SET name=?,updated_at=? WHERE id=?').bind(name, stamp, id),
    db.prepare('UPDATE allocations SET hub=?,hub_id=? WHERE hub_id=? OR hub=?').bind(name, id, id, previousName),
    ...updates,
    auditStatement(db, 'hub', id, 'renamed', previousName, name, actor, stamp, actorId),
  ]);
  await sealAuditTail(db);
}

export async function auditPage(db: Sql, offset: number) {
  const start = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  const size = 200;
  const rows = await db.prepare('SELECT id,entity,entity_id AS entityId,action,before_json AS beforeJson,after_json AS afterJson,actor,actor_id AS actorId,created_at AS createdAt FROM audit_log ORDER BY created_at DESC LIMIT ' + size + ' OFFSET ?').bind(start).all<{id: string; entity: string; entityId: string; action: string; beforeJson: string; afterJson: string; actor: string; actorId: string; createdAt: string}>();
  return {audit: rows.results, hasMore: rows.results.length === size};
}

export async function claimAttachments(db: Sql, vendorId: string, keys: string[]) {
  for (const key of keys) {
    if (!/^[a-f0-9-]{36}$/.test(key)) continue;
    await db.prepare("UPDATE attachments SET vendor_id=? WHERE key=? AND (vendor_id='' OR vendor_id=?)").bind(vendorId, key, vendorId).run();
  }
}

function moneyCents(value: unknown) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Enter an amount greater than zero.');
  return amount;
}

export async function applyOperation(db: Sql, account: {id: string; name: string; role: string}, body: Record<string, unknown>, stamp: string) {
  const actor = account.name;
  const actorId = account.id;
  if (body.action === 'discard-uploads') {
    const keys = Array.isArray(body.keys) ? body.keys.filter((key: unknown) => typeof key === 'string' && /^[a-f0-9-]{36}$/.test(key)) : [];
    const removed: string[] = [];
    for (const key of keys) {
      const row = await db.prepare("SELECT key FROM attachments WHERE key=? AND vendor_id='' AND created_by=?").bind(key, account.id).first<{key: string}>();
      if (!row) continue;
      await db.prepare('DELETE FROM attachments WHERE key=?').bind(key).run();
      removed.push(key);
    }
    return {ok: true, removed};
  }
  if (body.action === 'unit') {
    const hubId = text(body.hubId, 80);
    const unitCode = text(body.unitCode, 40);
    const status = text(body.status, 20);
    if (!hubId || !unitCode) throw new Error('Choose a hub and unit code.');
    if (!['available', 'occupied', 'reserved', 'unavailable'].includes(status)) throw new Error('Choose a unit status.');
    const hub = await db.prepare('SELECT id FROM hubs WHERE id=?').bind(hubId).first();
    if (!hub) throw new Error('Hub not found.');
    const capacity = Number(body.capacity || 1);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) throw new Error('Enter a capacity of at least 1.');
    const existing = body.id ? await db.prepare('SELECT id,hub_id AS hubId,unit_code AS unitCode,capacity,status,notes FROM hub_units WHERE id=?').bind(body.id).first<{id: string; hubId: string; unitCode: string; capacity: number; status: string; notes: string}>() : await db.prepare('SELECT id,hub_id AS hubId,unit_code AS unitCode,capacity,status,notes FROM hub_units WHERE hub_id=? AND unit_code=?').bind(hubId, unitCode).first<{id: string; hubId: string; unitCode: string; capacity: number; status: string; notes: string}>();
    const notes = text(body.notes, 300);
    const held = await db.prepare('SELECT a.vendor_id AS vendorId FROM allocations a WHERE a.hub_id=? AND a.unit=? LIMIT 1').bind(hubId, unitCode).first<{vendorId: string}>();
    if (existing) {
      await db.prepare('UPDATE hub_units SET hub_id=?,unit_code=?,capacity=?,status=?,notes=? WHERE id=?').bind(hubId, unitCode, capacity, status, notes, existing.id).run();
      await writeAudit(db, 'hub-unit', hubId + ':' + unitCode, 'saved', {capacity: existing.capacity, status: existing.status, notes: existing.notes, unitCode: existing.unitCode}, {capacity, status, notes, unitCode}, actor, stamp, actorId);
    } else {
      await db.prepare('INSERT INTO hub_units(id,hub_id,unit_code,capacity,status,notes) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(), hubId, unitCode, capacity, status, notes).run();
      await writeAudit(db, 'hub-unit', hubId + ':' + unitCode, 'created', null, {capacity, status, notes}, actor, stamp, actorId);
    }
    if (held?.vendorId) return {ok: true, warning: 'Unit ' + unitCode + ' is recorded against vendor ' + held.vendorId + '. Release the allocation before marking it available.'};
    return {ok: true};
  }
  if (body.action === 'unit-delete') {
    const id = text(body.id, 80);
    if (!id) throw new Error('Choose the unit to remove.');
    const unit = await db.prepare('SELECT id,hub_id AS hubId,unit_code AS unitCode,capacity,status,notes FROM hub_units WHERE id=?').bind(id).first<{id: string; hubId: string; unitCode: string; capacity: number; status: string; notes: string}>();
    if (!unit) throw new Error('That unit record no longer exists.');
    const holder = await db.prepare('SELECT a.vendor_id AS vendorId FROM allocations a WHERE a.hub_id=? AND a.unit=? LIMIT 1').bind(unit.hubId, unit.unitCode).first<{vendorId: string}>();
    if (holder?.vendorId) throw new Error('Unit ' + unit.unitCode + ' is allocated to ' + holder.vendorId + '. Release or transfer the allocation first.');
    if (unit.status === 'occupied') throw new Error('Unit ' + unit.unitCode + ' is marked occupied. Set it to available before removing it.');
    await db.prepare('DELETE FROM hub_units WHERE id=?').bind(id).run();
    await writeAudit(db, 'hub-unit', unit.hubId + ':' + unit.unitCode, 'removed', {capacity: unit.capacity, status: unit.status, notes: unit.notes}, null, actor, stamp, actorId);
    return {ok: true};
  }
  if (body.action === 'pitch') {
    const pitchCode = text(body.pitchCode, 40);
    const lat = text(body.lat, 40);
    const lng = text(body.lng, 40);
    const verifiedAt = text(body.verifiedAt, 30);
    const vendorId = text(body.vendorId, 40);
    if (!pitchCode) throw new Error('Enter a pitch reference.');
    if ((lat && !lng) || (!lat && lng)) throw new Error('Enter both latitude and longitude, or leave both blank.');
    if (lat || lng) {
      const latitude = Number(lat);
      const longitude = Number(lng);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('Latitude must be between -90 and 90, and longitude between -180 and 180.');
    }
    if (verifiedAt && !dateOk(verifiedAt)) throw new Error('Enter a real date for the GPS check.');
    if (vendorId && !await db.prepare('SELECT id FROM vendors WHERE id=?').bind(vendorId).first()) throw new Error('Link the pitch to a vendor that is already on the register.');
    const id = text(body.id, 80) || crypto.randomUUID();
    const existing = await db.prepare('SELECT id FROM pitches WHERE id=?').bind(id).first();
    const values = [vendorId, pitchCode, text(body.ward, 80), text(body.area, 160), text(body.activity, 120), lat, lng, text(body.accuracy, 40), verifiedAt];
    const statements: SqlStatement[] = [existing
      ? db.prepare('UPDATE pitches SET vendor_id=?,pitch_code=?,ward=?,area=?,activity=?,lat=?,lng=?,accuracy=?,verified_at=? WHERE id=?').bind(...values, id)
      : db.prepare('INSERT INTO pitches(vendor_id,pitch_code,ward,area,activity,lat,lng,accuracy,verified_at,id) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(...values, id)];
    let beforeLocation: unknown = null;
    if (vendorId && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && lat && lng) {
      const vendorRow = await db.prepare('SELECT payload FROM vendors WHERE id=?').bind(vendorId).first<{payload: string}>();
      if (vendorRow) {
        const vendor = JSON.parse(vendorRow.payload);
        beforeLocation = {lat: vendor.lat, lng: vendor.lng, address: vendor.address};
        vendor.lat = lat;
        vendor.lng = lng;
        if (values[3]) vendor.address = values[3];
        statements.push(db.prepare('UPDATE vendors SET payload=?,updated_at=? WHERE id=?').bind(JSON.stringify(vendor), stamp, vendorId));
      }
    }
    statements.push(db.prepare('INSERT INTO audit_log(id,entity,entity_id,action,before_json,after_json,actor,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), 'pitch', id, 'saved', JSON.stringify(beforeLocation ?? '').slice(0, 4000), JSON.stringify({pitchCode, area: values[3], lat, lng}).slice(0, 4000), actor, stamp));
    await db.batch(statements);
    return {ok: true};
  }
  if (body.action === 'tariff') {
    const category = text(body.category, 80);
    const from = text(body.effectiveFrom, 10);
    if (!category || !dateOk(from)) throw new Error('Enter the fee category and the date it takes effect.');
    const to = text(body.effectiveTo, 10);
    if (to && !dateOk(to)) throw new Error('Enter a valid end date.');
    const amount = moneyCents(body.amountCents);
    const approval = text(body.approvalRef, 120);
    if (!approval) throw new Error('Enter the municipal approval reference for this fee. Do not invent a tariff.');
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO fee_schedules(id,category,amount_cents,effective_from,effective_to,applicability,approval_ref,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .bind(id, category, amount, from, to, text(body.applicability, 160), approval, stamp).run();
    await writeAudit(db, 'tariff', id, 'saved', null, {category, amount, approval}, actor, stamp, actorId);
    return {ok: true};
  }
  if (body.action === 'permit') {
    const vendorId = text(body.vendorId, 40);
    const status = text(body.status, 20);
    const note = text(body.note, 500);
    if (!['review', 'approved', 'issued', 'replacement', 'revoked', 'renewed'].includes(status)) throw new Error('Choose a permit action.');
    if (note.length < 3) throw new Error('Record what was checked or decided.');
    const row = await db.prepare('SELECT payload FROM vendors WHERE id=?').bind(vendorId).first<{payload: string}>();
    if (!row) throw new Error('Vendor not found.');
    const vendor = JSON.parse(row.payload);
    const serial = text(body.cardSerial, 40).toUpperCase().replace(/[^0-9A-Z .$/+%-]/g, '');
    if (['issued', 'replacement'].includes(status) && !serial) throw new Error('Enter the card serial number.');
    if (['issued', 'replacement'].includes(status) && (vendor.status !== 'Approved' || (vendor.expires && vendor.expires < stamp.slice(0, 10)))) throw new Error('Approve the vendor and record a current permit expiry before issuing a card.');
    if (status === 'replacement' && !await db.prepare("SELECT id FROM permits WHERE vendor_id=? AND status IN ('issued','replacement') AND card_serial<>'' ORDER BY created_at DESC LIMIT 1").bind(vendorId).first()) throw new Error('Issue the first card before recording a replacement.');
    if (serial && await db.prepare("SELECT id FROM permits WHERE card_serial<>'' AND upper(card_serial)=?").bind(serial).first()) throw new Error('That card serial is already recorded. Issue or replacement needs a new serial.');
    const expires = text(body.expires, 10);
    if (status === 'renewed' && (!dateOk(expires) || expires < vendor.issued)) throw new Error('Enter the new expiry date.');
    if (status === 'approved') vendor.status = 'Approved';
    if (status === 'renewed') { vendor.status = 'Approved'; vendor.expires = expires; }
    if (status === 'revoked') vendor.status = 'Suspended';
    await db.prepare('UPDATE vendors SET payload=?,updated_at=? WHERE id=?').bind(JSON.stringify(vendor), stamp, vendor.id).run();
    const id = crypto.randomUUID();
    try {
      await db.prepare('INSERT INTO permits(id,vendor_id,permit_number,card_serial,status,note,actor,created_at) VALUES(?,?,?,?,?,?,?,?)')
        .bind(id, vendor.id, vendor.id, serial, status, note, actor, stamp).run();
    } catch (error) {
      if (/UNIQUE/i.test(String(error))) throw new Error('That card serial is already recorded. Issue or replacement needs a new serial.');
      throw error;
    }
    await db.prepare('INSERT INTO events(id,vendor_id,kind,amount,note,due,created_at,actor,resolved) VALUES(?,?,?,?,?,?,?,?,0)')
      .bind(crypto.randomUUID(), vendor.id, 'Permit', 0, status + ': ' + note, '', stamp, actor).run();
    await writeAudit(db, 'permit', vendor.id, status, {status: JSON.parse(row.payload).status, expires: JSON.parse(row.payload).expires}, {serial, expires: vendor.expires, status: vendor.status}, actor, stamp, actorId);
    return {ok: true};
  }
  if (body.action === 'requirement') {
    const ruleRef = text(body.ruleRef, 80);
    const label = text(body.documentLabel, 80);
    if (!ruleRef || !label) throw new Error('Enter the municipal rule reference and the document it requires.');
    const months = Number(body.validityMonths || 0);
    if (!Number.isInteger(months) || months < 0 || months > 120) throw new Error('Enter validity in months, or 0 if it does not expire.');
    const category = text(body.category, 80);
    const id = text(body.id, 80);
    if (id) {
      const existing = await db.prepare('SELECT id,rule_ref AS ruleRef,category,document_label AS documentLabel,validity_months AS validityMonths FROM requirements WHERE id=?').bind(id).first<{id: string; ruleRef: string; category: string; documentLabel: string; validityMonths: number}>();
      if (!existing) throw new Error('That compliance requirement no longer exists.');
      await db.prepare('UPDATE requirements SET rule_ref=?,category=?,document_label=?,validity_months=? WHERE id=?').bind(ruleRef, category, label, months, id).run();
      await writeAudit(db, 'requirement', id, 'updated', existing, {ruleRef, category, documentLabel: label, validityMonths: months}, actor, stamp, actorId);
      return {ok: true};
    }
    const created = crypto.randomUUID();
    await db.prepare('INSERT INTO requirements(id,rule_ref,category,document_label,validity_months) VALUES(?,?,?,?,?)')
      .bind(created, ruleRef, category, label, months).run();
    await writeAudit(db, 'requirement', created, 'created', null, {ruleRef, category, documentLabel: label, validityMonths: months}, actor, stamp, actorId);
    return {ok: true};
  }
  if (body.action === 'requirement-delete') {
    const id = text(body.id, 80);
    if (!id) throw new Error('Choose the compliance requirement to remove.');
    const existing = await db.prepare('SELECT id,rule_ref AS ruleRef,category,document_label AS documentLabel,validity_months AS validityMonths FROM requirements WHERE id=?').bind(id).first<{id: string; ruleRef: string; category: string; documentLabel: string; validityMonths: number}>();
    if (!existing) throw new Error('That compliance requirement no longer exists.');
    await db.prepare('DELETE FROM requirements WHERE id=?').bind(id).run();
    await writeAudit(db, 'requirement', id, 'removed', existing, null, actor, stamp, actorId);
    return {ok: true};
  }
  if (body.action === 'assign') {
    const id = text(body.id, 80);
    const owner = text(body.owner, 80);
    const severity = text(body.severity, 20);
    if (!owner) throw new Error('Enter who owns the follow-up.');
    if (severity && !['Low', 'Medium', 'High'].includes(severity)) throw new Error('Choose a severity.');
    const open = await db.prepare("SELECT id,owner,severity,case_status FROM events WHERE id=? AND kind IN ('Warning','Violation','Inspection') AND resolved=0").bind(id).first<{id: string; owner: string; severity: string; case_status: string}>();
    if (!open) throw new Error('That case is no longer open.');
    const caseStatus = open.case_status && ['open', 'follow-up', 'escalated'].includes(open.case_status) ? open.case_status : 'open';
    await db.prepare('UPDATE events SET owner=?,severity=?,case_status=? WHERE id=?').bind(owner, severity, caseStatus, id).run();
    await writeAudit(db, 'case', id, 'assigned', {owner: open.owner, severity: open.severity, caseStatus: open.case_status}, {owner, severity, caseStatus}, actor, stamp, actorId);
    return {ok: true};
  }
  if (body.action === 'reconcile') {
    const id = text(body.id, 80);
    const reference = text(body.reference, 120);
    if (reference.length < 3) throw new Error('Enter the bank statement, cash-up or reconciliation reference.');
    const row = await db.prepare("SELECT id,reconciled FROM events WHERE id=? AND kind='Payment'").bind(id).first<{id: string; reconciled: number}>();
    if (!row) throw new Error('Payment not found.');
    if (row.reconciled) throw new Error('This payment is already reconciled.');
    if (await db.prepare('SELECT id FROM events WHERE reversal_of=?').bind(id).first()) throw new Error('A reversed payment cannot be reconciled.');
    await db.prepare('UPDATE events SET reconciled=1,reconciliation_ref=? WHERE id=? AND reconciled=0').bind(reference, id).run();
    await writeAudit(db, 'payment', id, 'reconciled', {reconciled: false}, {reconciled: true, reference}, actor, stamp, actorId);
    return {ok: true};
  }
  if (body.action === 'reverse') {
    const id = text(body.id, 80);
    const note = text(body.note, 500);
    if (note.length < 3) throw new Error('Record why this entry is being reversed.');
    const original = await db.prepare("SELECT id,vendor_id,kind,amount FROM events WHERE id=? AND kind IN ('Charge','Payment')").bind(id).first<{id: string; vendor_id: string; kind: string; amount: number}>();
    if (!original) throw new Error('Only a charge or payment can be reversed.');
    const already = await db.prepare('SELECT id FROM events WHERE reversal_of=?').bind(id).first();
    if (already) throw new Error('This entry has already been reversed.');
    const reversalId = crypto.randomUUID();
    try {
      await db.prepare('INSERT INTO events(id,vendor_id,kind,amount,note,due,created_at,actor,resolved,reversal_of,cashier) VALUES(?,?,?,?,?,?,?,?,0,?,?)')
        .bind(reversalId, original.vendor_id, 'Reversal', original.amount, 'Reversal of ' + original.kind + ' ' + original.id + ': ' + note, '', stamp, actor, original.id, actor).run();
    } catch (error) {
      if (/UNIQUE/i.test(String(error))) throw new Error('This entry has already been reversed.');
      throw error;
    }
    await writeAudit(db, 'payment', original.id, 'reversed', {kind: original.kind, amount: original.amount}, {reversalId}, actor, stamp, actorId);
    return {ok: true, id: reversalId};
  }
  if (body.action === 'schedule') {
    const id = text(body.id, 80);
    const due = text(body.due, 10);
    const plan = text(body.plan, 500);
    if (!dateOk(due)) throw new Error('Enter a real date for the next visit.');
    if (plan.length < 3) throw new Error('Record what the next visit should check.');
    const open = await db.prepare("SELECT id,due,checklist FROM events WHERE id=? AND kind IN ('Warning','Violation') AND resolved=0").bind(id).first<{id: string; due: string; checklist: string}>();
    if (!open) throw new Error('That case is no longer open.');
    await db.prepare("UPDATE events SET due=?,checklist=?,case_status='follow-up' WHERE id=?").bind(due, plan, id).run();
    await writeAudit(db, 'case', id, 'scheduled', {due: open.due, plan: open.checklist}, {due, plan}, actor, stamp, actorId);
    return {ok: true};
  }
  if (body.action === 'transition') {
    const id = text(body.id, 80);
    const caseStatus = text(body.caseStatus, 20);
    if (!['open', 'follow-up', 'escalated'].includes(caseStatus)) throw new Error('Choose open, follow-up or escalated. Resolution is recorded on the case.');
    const row = await db.prepare("SELECT id,case_status FROM events WHERE id=? AND kind IN ('Warning','Violation') AND resolved=0").bind(id).first<{id: string; case_status: string}>();
    if (!row) throw new Error('That case is no longer open.');
    await db.prepare('UPDATE events SET case_status=? WHERE id=? AND resolved=0').bind(caseStatus, id).run();
    await writeAudit(db, 'case', id, 'transition', {caseStatus: row.case_status}, {caseStatus}, actor, stamp, actorId);
    return {ok: true};
  }
  if (body.action === 'settings') {
    const documentNote = text(body.documentNote, 1000);
    await db.prepare("INSERT INTO app_meta(key,value) VALUES('operations',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify({documentNote})).run();
    await writeAudit(db, 'settings', 'operations', 'saved', null, {documentNote}, actor, stamp, actorId);
    return {ok: true};
  }
  if (body.action === 'integrity-resolve') {
    const id = text(body.id, 80);
    const note = text(body.note, 500);
    if (note.length < 3) throw new Error('Record how this quarantined issue was reviewed or repaired.');
    const issue = await db.prepare("SELECT id,entity,entity_id AS entityId,parent_id AS parentId,issue,payload FROM integrity_issues WHERE id=? AND resolved_at=''").bind(id).first<{id: string; entity: string; entityId: string; parentId: string; issue: string; payload: string}>();
    if (!issue) throw new Error('That integrity issue is already resolved or unavailable.');
    await db.prepare("UPDATE integrity_issues SET resolved_at=? WHERE id=? AND resolved_at=''").bind(stamp, id).run();
    await writeAudit(db, 'integrity-issue', id, 'resolved', issue, {note}, actor, stamp, actorId);
    return {ok: true};
  }
  if (body.action === 'import') {
    const csv = String(body.csv || '');
    if (csv.length < 5 || csv.length > 200000) throw new Error('Paste the legacy rows to review.');
    const table = parseCsv(csv);
    const headers = (table.shift() || []).map(cell => cell.trim().toLowerCase());
    const required = ['name', 'business', 'type'];
    if (required.some(column => !headers.includes(column))) throw new Error('The first row must include name, business and type.');
    const batch = crypto.randomUUID();
    const lines = table.slice(0, 300);
    for (const cells of lines) {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => { record[header] = cells[index] || ''; });
      let status = 'pending';
      let note = '';
      if (!record.name || !record.business || !['Formal', 'Informal'].includes(record.type)) { status = 'invalid'; note = 'Name, business and type are required.'; }
      else if (record.type === 'Formal' && record.hub && record.unit) {
        const taken = await db.prepare('SELECT vendor_id FROM allocations WHERE hub=? AND unit=?').bind(record.hub, record.unit).first();
        if (taken) { status = 'duplicate'; note = 'That hub unit is already allocated.'; }
      }
      if (status === 'pending' && record.lat && !Number.isFinite(Number(record.lat))) { status = 'invalid'; note = 'Latitude is not a number.'; }
      await db.prepare('INSERT INTO import_rows(id,batch_id,payload,status,note,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(), batch, JSON.stringify(record), status, note, stamp).run();
    }
    await writeAudit(db, 'import', batch, 'staged', null, {rows: lines.length}, actor, stamp, actorId);
    return {ok: true, batchId: batch};
  }
  if (body.action === 'edit-import') {
    const id = text(body.id, 80);
    const row = await db.prepare('SELECT status,payload FROM import_rows WHERE id=?').bind(id).first<{status: string; payload: string}>();
    if (!row || row.status === 'approved') throw new Error('An approved import cannot be edited.');
    if (row.status === 'rejected' && text(body.reopen, 10) !== 'yes') throw new Error('A rejected row stays closed unless you choose to correct it.');
    const record = JSON.parse(row.payload);
    for (const key of ['name', 'business', 'type', 'sector', 'hub', 'unit', 'address', 'lat', 'lng', 'phone', 'email', 'issued', 'expires']) {
      if (typeof body[key] === 'string') record[key] = text(body[key], 500);
    }
    let status = 'pending';
    let note = 'Corrected and ready for approval.';
    const draft = {id: 'SPM-DRAFT', name: record.name || '', business: record.business || '', type: record.type || '', sector: record.sector || '', hub: record.hub || '', unit: record.unit || '', address: record.address || '', lat: record.lat || '', lng: record.lng || '', phone: record.phone || '', email: record.email || '', issued: record.issued || stamp.slice(0, 10), expires: record.expires || stamp.slice(0, 10), status: 'Pending review', documents: [], files: [], photo: ''};
    try { validateVendorShape(draft); }
    catch (error) { status = 'needs-correction'; note = error instanceof Error ? error.message : 'This row still needs correction.'; }
    await db.prepare("UPDATE import_rows SET payload=?,status=?,note=? WHERE id=? AND status<>'approved'").bind(JSON.stringify(record), status, note.slice(0, 300), id).run();
    await writeAudit(db, 'import', id, 'edited', {status: row.status}, {status, note}, actor, stamp, actorId);
    return {ok: true, status, note};
  }
  if (body.action === 'reject-import') {
    const id = text(body.id, 80);
    const note = text(body.note, 300);
    const row = await db.prepare('SELECT status FROM import_rows WHERE id=?').bind(id).first<{status: string}>();
    if (!row || row.status === 'approved') throw new Error('An approved import cannot be rejected.');
    if (note.length < 3) throw new Error('Record why this row is rejected.');
    await db.prepare("UPDATE import_rows SET status='rejected', note=? WHERE id=? AND status<>'approved'").bind(note, id).run();
    await writeAudit(db, 'import', id, 'rejected', {status: row.status}, {note}, actor, stamp, actorId);
    return {ok: true};
  }
  if (body.action === 'approve-import') {
    const id = text(body.id, 80);
    const row = await db.prepare("SELECT payload,status FROM import_rows WHERE id=?").bind(id).first<{payload: string; status: string}>();
    if (!row || row.status !== 'pending') throw new Error('Only a pending row can be approved.');
    const record = JSON.parse(row.payload);
    const vendor = {
      id: 'SPM-' + new Date().getFullYear() + '-' + crypto.randomUUID().slice(0, 8).toUpperCase(),
      name: record.name, business: record.business, type: record.type, sector: record.sector || '', hub: record.hub || '', unit: record.unit || '',
      address: record.address || '', lat: record.lat || '', lng: record.lng || '', phone: record.phone || '', email: record.email || '',
      issued: record.issued || stamp.slice(0, 10), expires: record.expires || stamp.slice(0, 10), status: 'Pending review', documents: [], files: [], photo: '', sample: false,
    };
    try { validateVendorShape(vendor); }
    catch (error) {
      const message = error instanceof Error ? error.message : 'This row needs correction.';
      await db.prepare("UPDATE import_rows SET status='needs-correction', note=? WHERE id=? AND status='pending'").bind(message.slice(0, 300), id).run();
      throw error;
    }
    let hubId = '';
    if (vendor.type === 'Formal') {
      const hub = await db.prepare('SELECT id FROM hubs WHERE name=?').bind(vendor.hub).first<{id: string}>();
      if (!hub) {
        await db.prepare("UPDATE import_rows SET status='needs-correction', note=? WHERE id=? AND status='pending'").bind('The formal row needs a known hub and unit.', id).run();
        throw new Error('The formal row needs a known hub and unit.');
      }
      hubId = hub.id;
    }
    const note = 'Imported as ' + vendor.id;
    const gate = {id, note};
    const plan = vendor.type === 'Formal' ? await allocationPlan(db, vendor, hubId, actor, stamp, gate) : [];
    const claim = "EXISTS (SELECT 1 FROM import_rows WHERE id=? AND status='approved' AND note=?)";
    const statements: SqlStatement[] = [
      db.prepare("UPDATE import_rows SET status='approved', note=? WHERE id=? AND status='pending'").bind(note, id),
      db.prepare('INSERT INTO vendors(id,payload,updated_at) SELECT ?,?,? WHERE ' + claim).bind(vendor.id, JSON.stringify(vendor), stamp, id, note),
      ...plan,
    ];
    if (vendor.type === 'Informal' && (vendor.unit || vendor.address)) statements.push(db.prepare('INSERT INTO pitches(id,vendor_id,pitch_code,ward,area,activity,lat,lng,accuracy,verified_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ' + claim).bind(crypto.randomUUID(), vendor.id, vendor.unit, '', vendor.address, vendor.sector, vendor.lat, vendor.lng, '', '', id, note));
    statements.push(db.prepare('INSERT INTO audit_log(id,entity,entity_id,action,before_json,after_json,actor,created_at) SELECT ?,?,?,?,?,?,?,? WHERE ' + claim).bind(crypto.randomUUID(), 'import', id, 'approved', JSON.stringify({status: 'pending'}).slice(0, 4000), JSON.stringify({vendorId: vendor.id}).slice(0, 4000), actor, stamp, id, note));
    statements.push(db.prepare("UPDATE import_rows SET status='needs-correction', note='The unit could not be allocated. Correct the hub and unit, or reject the row.' WHERE id=? AND status='approved' AND note=? AND NOT EXISTS (SELECT 1 FROM vendors WHERE id=?)").bind(id, note, vendor.id));
    await db.batch(statements);
    const done = await db.prepare('SELECT status,note FROM import_rows WHERE id=?').bind(id).first<{status: string; note: string}>();
    if (!done || done.note !== note) throw new Error('This row was already approved.');
    const saved = await db.prepare('SELECT id FROM vendors WHERE id=?').bind(vendor.id).first();
    if (!saved) throw new Error('The unit could not be allocated. The import row was not approved.');
    return {ok: true, id: vendor.id};
  }
  return null;
}
