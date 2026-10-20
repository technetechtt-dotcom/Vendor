import {database, noticeWebhook} from '../../../lib/server';
import {passwordPending, sessionUser} from '../../../lib/accounts';
import {fieldCorsHeaders, withFieldCors, mutationOriginError} from '../../../lib/cors';
import {noticePdf, noticeText, noticeVendor} from '../../../lib/notices';
import {submissionKey} from '../../../lib/submissions';
import {Vendor, Entry} from '../../../lib/data';
import {can} from '../../../lib/capabilities';

const handovers = ['draft', 'handover', 'acknowledged'];

function json(body: unknown, status = 200) {
  return Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});
}

async function viewer(req: Request) {
  const db = database();
  const account = await sessionUser(db, req);
  if (!account) return json({error: 'Sign in required.'}, 401);
  if (passwordPending(account)) return json({error: 'Change your password before continuing.'}, 403);
  return account;
}

async function noticeCase(db: ReturnType<typeof database>, eventId: string) {
  const event = await db.prepare('SELECT id,vendor_id,kind,amount,note,due,created_at,actor,resolved,snapshot FROM events WHERE id=?').bind(eventId).first<{id: string; vendor_id: string; kind: string; amount: number; note: string; due: string; created_at: string; actor: string; resolved: number; snapshot: string}>();
  if (!event || !['Warning', 'Violation'].includes(event.kind)) return null;
  const row = await db.prepare('SELECT payload FROM vendors WHERE id=?').bind(event.vendor_id).first<{payload: string}>();
  if (!row) return null;
  const vendor = JSON.parse(row.payload) as Vendor;
  const entry: Entry = {id: event.id, vendorId: event.vendor_id, kind: event.kind, amount: event.amount, note: event.note, due: event.due, createdAt: event.created_at, actor: event.actor, resolved: event.resolved, snapshot: event.snapshot || ''};
  return {vendor: noticeVendor(vendor, entry), entry};
}

async function record(db: ReturnType<typeof database>, eventId: string, method: string, status: string, detail: string, actor: string, key = '', recipient = '') {
  const once = ['handover', 'acknowledged', 'escalated', 'municipal'];
  if (once.includes(method)) {
    const existing = await db.prepare('SELECT id,status FROM notice_deliveries WHERE event_id=? AND method=? ORDER BY created_at DESC').bind(eventId, method).first<{id: string; status: string}>();
    if (existing && !(method === 'municipal' && ['failed', 'rejected'].includes(existing.status))) return existing.id;
  }
  if (key) {
    const byKey = await db.prepare('SELECT id FROM notice_deliveries WHERE event_id=? AND idempotency_key=?').bind(eventId, key).first<{id: string}>();
    if (byKey) return byKey.id;
  }
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO notice_deliveries(id,event_id,method,status,detail,actor,created_at,recipient,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(id, eventId, method, status, detail.slice(0, 300), actor, new Date().toISOString(), recipient.slice(0, 160), key).run();
  return id;
}

function webhookAllowed(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

async function handleGet(req: Request) {
  const account = await viewer(req);
  if (account instanceof Response) return account;
  const eventId = new URL(req.url).searchParams.get('eventId') || '';
  const found = await noticeCase(database(), eventId);
  if (!found) return json({error: 'Notice not found.'}, 404);
  const text = noticeText(found.vendor, found.entry);
  await record(database(), eventId, 'pdf', 'downloaded', 'PDF downloaded by an official', account.name);
  const pdf = noticePdf(text.split('\n'));
  return new Response(pdf, {headers: {'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="notice-${eventId.slice(0, 8)}.pdf"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'}});
}

async function handlePost(req: Request) {
  const rejected = mutationOriginError(req, true);
  if (rejected) return rejected;
  const account = await viewer(req);
  if (account instanceof Response) return account;
  if (!can(account.role, 'compliance.write')) return json({error: 'Your role cannot change notice delivery or compliance cases.'}, 403);
  const body: Record<string, unknown> = await req.json();
  const eventId = String(body.eventId || '');
  const found = await noticeCase(database(), eventId);
  if (!found) return json({error: 'Notice not found.'}, 404);
  const db = database();
  const key = body.idempotencyKey ? submissionKey(body.idempotencyKey) : '';
  if (body.action === 'deliver') {
    const method = String(body.method || '');
    if (!handovers.includes(method)) return json({error: 'Choose a delivery record.'}, 400);
    const status = method === 'draft' ? 'draft opened' : method === 'handover' ? 'handed to trader' : 'trader acknowledged';
    await record(db, eventId, method, status, status, account.name, key, method === 'handover' ? 'trader' : '');
    return json({ok: true, message: method === 'draft' ? 'Draft opened. This is not a delivery confirmation.' : 'Delivery record saved.'});
  }
  if (body.action === 'send') {
    const webhook = noticeWebhook();
    if (!webhook || !webhookAllowed(webhook)) return json({error: 'Municipal email is not connected. Download the PDF or use the email draft.', status: 'not connected'}, 409);
    const claimTtlMs = 120000;
    const staleBefore = new Date(Date.now() - claimTtlMs).toISOString();
    await db.prepare("UPDATE notice_deliveries SET status='failed', detail='Send claim expired before the sender responded' WHERE method='municipal' AND status='sending' AND created_at<?").bind(staleBefore).run();
    const latest = await db.prepare("SELECT id,status,detail,created_at AS createdAt FROM notice_deliveries WHERE event_id=? AND method='municipal' ORDER BY created_at DESC").bind(eventId).first<{id: string; status: string; detail: string; createdAt: string}>();
    if (latest?.status === 'accepted by sender') return json({ok: true, duplicate: true, status: latest.status, message: 'The municipal sender already accepted this notice.'});
    if (latest?.status === 'sending') return json({ok: true, duplicate: true, status: 'sending', message: 'A municipal send is already in progress.'});
    const claimId = crypto.randomUUID();
    try {
      await db.prepare('INSERT INTO notice_deliveries(id,event_id,method,status,detail,actor,created_at,recipient,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?)')
        .bind(claimId, eventId, 'municipal', 'sending', 'Claimed before the sender is called', account.name, new Date().toISOString(), found.vendor.email.slice(0, 160), key).run();
    } catch (error) {
      if (!/UNIQUE/i.test(String(error))) throw error;
      const current = await db.prepare("SELECT status FROM notice_deliveries WHERE event_id=? AND method='municipal' AND status IN ('sending','accepted by sender') ORDER BY created_at DESC").bind(eventId).first<{status: string}>();
      return json({ok: true, duplicate: true, status: current?.status || 'sending', message: 'Another request already claimed this municipal send.'});
    }
    const payload = {reference: found.entry.id, idempotencyKey: found.entry.id, kind: found.entry.kind, vendorId: found.vendor.id, vendorName: found.vendor.name, business: found.vendor.business, email: found.vendor.email, text: noticeText(found.vendor, found.entry)};
    try {
      const response = await fetch(webhook, {method: 'POST', headers: {'Content-Type': 'application/json', 'Idempotency-Key': found.entry.id}, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000)});
      if (!response.ok) {
        await db.prepare('UPDATE notice_deliveries SET status=?,detail=? WHERE id=?').bind('rejected', 'HTTP ' + response.status, claimId).run();
        return json({error: 'The municipal notice service did not accept this notice.', status: 'rejected'}, 502);
      }
      await db.prepare('UPDATE notice_deliveries SET status=?,detail=? WHERE id=?').bind('accepted by sender', 'HTTP ' + response.status, claimId).run();
      return json({ok: true, status: 'accepted by sender', message: 'The municipal sender accepted the notice. This confirms acceptance, not that the trader opened it.'});
    } catch (error) {
      console.error(error);
      const timedOut = error instanceof Error && (/abort|timeout/i.test(error.name + error.message));
      await db.prepare('UPDATE notice_deliveries SET status=?,detail=? WHERE id=?').bind('failed', timedOut ? 'The municipal sender timed out' : 'The municipal sender could not be reached', claimId).run();
      return json({error: timedOut ? 'The municipal sender timed out. Retry when ready.' : 'The municipal sender could not be reached. The email draft is still available.', status: 'failed'}, 502);
    }
  }
  if (body.action === 'escalate') {
    const note = String(body.note || '').trim();
    if (note.length < 3 || note.length > 1000) return json({error: 'Enter why this case is being escalated.'}, 400);
    if (found.entry.resolved) return json({error: 'This case is already resolved.'}, 409);
    const existing = await db.prepare("SELECT id FROM notice_deliveries WHERE event_id=? AND method='escalated'").bind(eventId).first();
    if (existing) return json({ok: true, duplicate: true, message: 'Escalation already recorded.'});
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.batch([
      db.prepare('INSERT INTO events(id,vendor_id,kind,amount,note,due,created_at,actor,resolved) VALUES(?,?,?,?,?,?,?,?,0)').bind(id, found.vendor.id, 'Escalation', 0, 'Case ' + found.entry.id + ': ' + note, found.entry.due || '', now, account.name),
      db.prepare("UPDATE events SET case_status='escalated' WHERE id=? AND resolved=0").bind(eventId),
      db.prepare('INSERT INTO notice_deliveries(id,event_id,method,status,detail,actor,created_at,recipient,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), eventId, 'escalated', 'recorded', note.slice(0, 300), account.name, now, String(body.destination || 'LED Office').slice(0, 160), key),
    ]);
    return json({ok: true, message: 'Escalation recorded.'});
  }
  return json({error: 'Unknown action'}, 400);
}

export function OPTIONS(req: Request) {
  const headers = fieldCorsHeaders(req);
  if (!headers) return new Response(null, {status: 403});
  return new Response(null, {status: 204, headers});
}

export function GET(req: Request) {
  return handleGet(req).then(res => withFieldCors(req, res)).catch(error => {
    console.error(error);
    return withFieldCors(req, json({error: 'The notice could not be prepared.'}, 503));
  });
}

export function POST(req: Request) {
  return handlePost(req).then(res => withFieldCors(req, res)).catch(error => {
    console.error(error);
    return withFieldCors(req, json({error: 'The notice record could not be saved.'}, 503));
  });
}
