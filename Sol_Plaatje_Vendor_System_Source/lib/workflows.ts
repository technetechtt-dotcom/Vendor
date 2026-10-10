interface SqlStatement {
  bind(...args: unknown[]): SqlStatement;
  first<T = any>(): Promise<T | null>;
  all<T = any>(): Promise<{results: T[]}>;
  run(): Promise<unknown>;
}

interface Sql {
  prepare(query: string): SqlStatement;
  batch(statements: SqlStatement[]): Promise<unknown>;
}

const eventSelect = `id,vendor_id AS vendorId,kind,amount,note,due,created_at AS createdAt,actor,resolved,gps_lat AS gpsLat,gps_lng AS gpsLng,gps_accuracy AS gpsAccuracy,owner,severity,case_status AS caseStatus,checklist,evidence,follow_up_of AS followUpOf,snapshot,receipt_no AS receiptNo,pay_method AS payMethod,pay_ref AS payRef,cashier,reconciled,reversal_of AS reversalOf`;

export {eventSelect};

function text(value: unknown, max: number) {
  return String(value || '').trim().slice(0, max);
}

function dateOk(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function writeAudit(db: Sql, entity: string, entityId: string, action: string, before: unknown, after: unknown, actor: string, stamp: string) {
  await db.prepare('INSERT INTO audit_log(id,entity,entity_id,action,before_json,after_json,actor,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), entity, entityId, action, JSON.stringify(before ?? '').slice(0, 4000), JSON.stringify(after ?? '').slice(0, 4000), actor, stamp).run();
}

export async function officeBundle(db: Sql) {
  const [units, pitches, tariffs, permits, requirements, history, imports, audit, settings] = await Promise.all([
    db.prepare('SELECT u.id,u.hub_id AS hubId,h.name AS hub,u.unit_code AS unitCode,u.capacity,u.status,u.notes FROM hub_units u LEFT JOIN hubs h ON h.id=u.hub_id ORDER BY h.name,u.unit_code').all<any>(),
    db.prepare('SELECT id,vendor_id AS vendorId,pitch_code AS pitchCode,ward,area,activity,lat,lng,accuracy,verified_at AS verifiedAt FROM pitches ORDER BY area,pitch_code').all<any>(),
    db.prepare('SELECT id,category,amount_cents AS amountCents,effective_from AS effectiveFrom,effective_to AS effectiveTo,applicability,approval_ref AS approvalRef,created_at AS createdAt FROM fee_schedules ORDER BY effective_from DESC').all<any>(),
    db.prepare('SELECT id,vendor_id AS vendorId,permit_number AS permitNumber,card_serial AS cardSerial,status,note,actor,created_at AS createdAt FROM permits ORDER BY created_at DESC').all<any>(),
    db.prepare('SELECT id,rule_ref AS ruleRef,category,document_label AS documentLabel,validity_months AS validityMonths FROM requirements ORDER BY category,document_label').all<any>(),
    db.prepare('SELECT id,hub_id AS hubId,unit_code AS unitCode,vendor_id AS vendorId,action,actor,created_at AS createdAt,note FROM allocation_history ORDER BY created_at DESC LIMIT 200').all<any>(),
    db.prepare('SELECT id,batch_id AS batchId,payload,status,note,created_at AS createdAt FROM import_rows ORDER BY created_at DESC LIMIT 200').all<any>(),
    db.prepare('SELECT id,entity,entity_id AS entityId,action,before_json AS beforeJson,after_json AS afterJson,actor,created_at AS createdAt FROM audit_log ORDER BY created_at DESC LIMIT 200').all<any>(),
    db.prepare("SELECT value FROM app_meta WHERE key='operations'").first<{value: string}>(),
  ]);
  return {
    units: units.results,
    pitches: pitches.results,
    tariffs: tariffs.results,
    permits: permits.results,
    requirements: requirements.results,
    allocationHistory: history.results,
    imports: imports.results,
    audit: audit.results,
    settings: settings?.value ? JSON.parse(settings.value) : {documentNote: ''},
  };
}

export async function allocationPlan(db: Sql, vendor: any, hubId: string, actor: string, stamp: string) {
  const previous = await db.prepare('SELECT hub,unit,hub_id AS hubId FROM allocations WHERE vendor_id=?').bind(vendor.id).first<any>();
  const statements: SqlStatement[] = [db.prepare('DELETE FROM allocations WHERE vendor_id=?').bind(vendor.id)];
  const changed = !previous || vendor.type !== 'Formal' || previous.unit !== vendor.unit || previous.hub !== vendor.hub;
  if (previous && changed) {
    statements.push(db.prepare("UPDATE hub_units SET status='available' WHERE hub_id=? AND unit_code=? AND status='occupied'").bind(previous.hubId || '', previous.unit));
    statements.push(db.prepare('INSERT INTO allocation_history(id,hub_id,unit_code,vendor_id,action,actor,created_at,note) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), previous.hubId || '', previous.unit, vendor.id, 'released', actor, stamp, 'Allocation released'));
  }
  if (vendor.type === 'Formal') {
    statements.push(db.prepare('INSERT INTO allocations(hub,unit,vendor_id,hub_id) VALUES(?,?,?,?)').bind(vendor.hub, vendor.unit, vendor.id, hubId));
    statements.push(db.prepare("INSERT INTO hub_units(id,hub_id,unit_code,capacity,status,notes) VALUES(?,?,?,1,'occupied','') ON CONFLICT(hub_id,unit_code) DO UPDATE SET status='occupied'").bind(crypto.randomUUID(), hubId, vendor.unit));
    if (changed) statements.push(db.prepare('INSERT INTO allocation_history(id,hub_id,unit_code,vendor_id,action,actor,created_at,note) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), hubId, vendor.unit, vendor.id, previous ? 'transferred' : 'allocated', actor, stamp, previous ? `From ${previous.hub} ${previous.unit}` : 'Allocated'));
  }
  return statements;
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

export async function applyOperation(db: Sql, account: {id: string; name: string; role: string}, body: any, stamp: string) {
  const actor = account.name;
  if (body.action === 'discard-uploads') {
    const keys = Array.isArray(body.keys) ? body.keys.filter((key: unknown) => typeof key === 'string' && /^[a-f0-9-]{36}$/.test(key)) : [];
    const removed: string[] = [];
    for (const key of keys) {
      const row = await db.prepare("SELECT key FROM attachments WHERE key=? AND vendor_id='' AND created_by=?").bind(key, account.id).first<any>();
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
    const existing = body.id ? await db.prepare('SELECT id FROM hub_units WHERE id=?').bind(body.id).first<any>() : await db.prepare('SELECT id FROM hub_units WHERE hub_id=? AND unit_code=?').bind(hubId, unitCode).first<any>();
    if (existing) await db.prepare('UPDATE hub_units SET hub_id=?,unit_code=?,capacity=?,status=?,notes=? WHERE id=?').bind(hubId, unitCode, capacity, status, text(body.notes, 300), existing.id).run();
    else await db.prepare('INSERT INTO hub_units(id,hub_id,unit_code,capacity,status,notes) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(), hubId, unitCode, capacity, status, text(body.notes, 300)).run();
    await writeAudit(db, 'hub-unit', hubId + ':' + unitCode, 'saved', null, {status, capacity}, actor, stamp);
    return {ok: true};
  }
  if (body.action === 'pitch') {
    const pitchCode = text(body.pitchCode, 40);
    const lat = text(body.lat, 40);
    const lng = text(body.lng, 40);
    if (!pitchCode) throw new Error('Enter a pitch reference.');
    if ((lat || lng) && (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng)))) throw new Error('Enter valid GPS coordinates.');
    const id = text(body.id, 80) || crypto.randomUUID();
    const existing = await db.prepare('SELECT id FROM pitches WHERE id=?').bind(id).first();
    const values = [text(body.vendorId, 40), pitchCode, text(body.ward, 80), text(body.area, 160), text(body.activity, 120), lat, lng, text(body.accuracy, 40), text(body.verifiedAt, 30)];
    if (existing) await db.prepare('UPDATE pitches SET vendor_id=?,pitch_code=?,ward=?,area=?,activity=?,lat=?,lng=?,accuracy=?,verified_at=? WHERE id=?').bind(...values, id).run();
    else await db.prepare('INSERT INTO pitches(vendor_id,pitch_code,ward,area,activity,lat,lng,accuracy,verified_at,id) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(...values, id).run();
    await writeAudit(db, 'pitch', id, 'saved', null, {pitchCode, area: values[3]}, actor, stamp);
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
    await writeAudit(db, 'tariff', id, 'saved', null, {category, amount, approval}, actor, stamp);
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
    const serial = text(body.cardSerial, 40);
    if (['issued', 'replacement'].includes(status) && !serial) throw new Error('Enter the card serial number.');
    const expires = text(body.expires, 10);
    if (status === 'renewed' && (!dateOk(expires) || expires < vendor.issued)) throw new Error('Enter the new expiry date.');
    if (status === 'approved') vendor.status = 'Approved';
    if (status === 'renewed') { vendor.status = 'Approved'; vendor.expires = expires; }
    if (status === 'revoked') vendor.status = 'Suspended';
    await db.prepare('UPDATE vendors SET payload=?,updated_at=? WHERE id=?').bind(JSON.stringify(vendor), stamp, vendor.id).run();
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO permits(id,vendor_id,permit_number,card_serial,status,note,actor,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .bind(id, vendor.id, vendor.id, serial, status, note, actor, stamp).run();
    await db.prepare('INSERT INTO events(id,vendor_id,kind,amount,note,due,created_at,actor,resolved) VALUES(?,?,?,?,?,?,?,?,0)')
      .bind(crypto.randomUUID(), vendor.id, 'Permit', 0, status + ': ' + note, '', stamp, actor).run();
    await writeAudit(db, 'permit', vendor.id, status, null, {serial, expires: vendor.expires}, actor, stamp);
    return {ok: true};
  }
  if (body.action === 'requirement') {
    const ruleRef = text(body.ruleRef, 80);
    const label = text(body.documentLabel, 80);
    if (!ruleRef || !label) throw new Error('Enter the municipal rule reference and the document it requires.');
    const months = Number(body.validityMonths || 0);
    if (!Number.isInteger(months) || months < 0 || months > 120) throw new Error('Enter validity in months, or 0 if it does not expire.');
    await db.prepare('INSERT INTO requirements(id,rule_ref,category,document_label,validity_months) VALUES(?,?,?,?,?)')
      .bind(crypto.randomUUID(), ruleRef, text(body.category, 80), label, months).run();
    return {ok: true};
  }
  if (body.action === 'assign') {
    const id = text(body.id, 80);
    const owner = text(body.owner, 80);
    const severity = text(body.severity, 20);
    if (!owner) throw new Error('Enter who owns the follow-up.');
    if (severity && !['Low', 'Medium', 'High'].includes(severity)) throw new Error('Choose a severity.');
    const open = await db.prepare("SELECT id FROM events WHERE id=? AND kind IN ('Warning','Violation','Inspection') AND resolved=0").bind(id).first();
    if (!open) throw new Error('That case is no longer open.');
    await db.prepare("UPDATE events SET owner=?,severity=?,case_status='open' WHERE id=?").bind(owner, severity, id).run();
    await writeAudit(db, 'case', id, 'assigned', null, {owner, severity}, actor, stamp);
    return {ok: true};
  }
  if (body.action === 'reconcile') {
    const id = text(body.id, 80);
    const row = await db.prepare("SELECT id FROM events WHERE id=? AND kind='Payment'").bind(id).first();
    if (!row) throw new Error('Payment not found.');
    await db.prepare('UPDATE events SET reconciled=1 WHERE id=?').bind(id).run();
    await writeAudit(db, 'payment', id, 'reconciled', null, {reconciled: true}, actor, stamp);
    return {ok: true};
  }
  if (body.action === 'reverse') {
    const id = text(body.id, 80);
    const note = text(body.note, 500);
    if (note.length < 3) throw new Error('Record why this entry is being reversed.');
    const original = await db.prepare("SELECT id,vendor_id,kind,amount FROM events WHERE id=? AND kind IN ('Charge','Payment')").bind(id).first<any>();
    if (!original) throw new Error('Only a charge or payment can be reversed.');
    const already = await db.prepare('SELECT id FROM events WHERE reversal_of=?').bind(id).first();
    if (already) throw new Error('This entry has already been reversed.');
    const reversalId = crypto.randomUUID();
    await db.prepare('INSERT INTO events(id,vendor_id,kind,amount,note,due,created_at,actor,resolved,reversal_of,cashier) VALUES(?,?,?,?,?,?,?,?,0,?,?)')
      .bind(reversalId, original.vendor_id, 'Reversal', original.amount, 'Reversal of ' + original.kind + ' ' + original.id + ': ' + note, '', stamp, actor, original.id, actor).run();
    await writeAudit(db, 'payment', original.id, 'reversed', null, {reversalId}, actor, stamp);
    return {ok: true, id: reversalId};
  }
  if (body.action === 'settings') {
    const documentNote = text(body.documentNote, 1000);
    await db.prepare("INSERT INTO app_meta(key,value) VALUES('operations',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify({documentNote})).run();
    await writeAudit(db, 'settings', 'operations', 'saved', null, {documentNote}, actor, stamp);
    return {ok: true};
  }
  if (body.action === 'import') {
    const csv = String(body.csv || '');
    if (csv.length < 5 || csv.length > 200000) throw new Error('Paste the legacy rows to review.');
    const lines = csv.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const headers = lines.shift()?.split(',').map(cell => cell.trim().toLowerCase()) || [];
    const required = ['name', 'business', 'type'];
    if (required.some(column => !headers.includes(column))) throw new Error('The first row must include name, business and type.');
    const batch = crypto.randomUUID();
    for (const line of lines.slice(0, 300)) {
      const cells = line.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''));
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
    await writeAudit(db, 'import', batch, 'staged', null, {rows: lines.length}, actor, stamp);
    return {ok: true, batchId: batch};
  }
  if (body.action === 'approve-import') {
    const id = text(body.id, 80);
    const row = await db.prepare("SELECT payload,status FROM import_rows WHERE id=?").bind(id).first<any>();
    if (!row || row.status !== 'pending') throw new Error('Only a pending row can be approved.');
    const record = JSON.parse(row.payload);
    const vendor = {
      id: 'SPM-' + new Date().getFullYear() + '-' + crypto.randomUUID().slice(0, 8).toUpperCase(),
      name: record.name, business: record.business, type: record.type, sector: record.sector || '', hub: record.hub || '', unit: record.unit || '',
      address: record.address || '', lat: record.lat || '', lng: record.lng || '', phone: record.phone || '', email: record.email || '',
      issued: record.issued || stamp.slice(0, 10), expires: record.expires || stamp.slice(0, 10), status: 'Pending review', documents: [], files: [], photo: '', sample: false,
    };
    if (vendor.type === 'Formal') {
      const hub = await db.prepare('SELECT id FROM hubs WHERE name=?').bind(vendor.hub).first<{id: string}>();
      if (!hub || !vendor.unit) throw new Error('The formal row needs a known hub and unit.');
      const plan = await allocationPlan(db, vendor, hub.id, actor, stamp);
      await db.batch([db.prepare('INSERT INTO vendors(id,payload,updated_at) VALUES(?,?,?)').bind(vendor.id, JSON.stringify(vendor), stamp), ...plan]);
    } else {
      await db.prepare('INSERT INTO vendors(id,payload,updated_at) VALUES(?,?,?)').bind(vendor.id, JSON.stringify(vendor), stamp).run();
      if (vendor.unit || vendor.address) await db.prepare('INSERT INTO pitches(id,vendor_id,pitch_code,ward,area,activity,lat,lng,accuracy,verified_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), vendor.id, vendor.unit, '', vendor.address, vendor.sector, vendor.lat, vendor.lng, '', '').run();
    }
    await db.prepare("UPDATE import_rows SET status='approved', note=? WHERE id=?").bind('Imported as ' + vendor.id, id).run();
    await writeAudit(db, 'import', id, 'approved', null, {vendorId: vendor.id}, actor, stamp);
    return {ok: true, id: vendor.id};
  }
  return null;
}
