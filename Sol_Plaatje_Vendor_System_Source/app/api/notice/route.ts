import {database, noticeWebhook} from '../../../lib/server';
import {ensureAccounts, passwordPending, sessionUser} from '../../../lib/accounts';
import {fieldCorsHeaders, withFieldCors} from '../../../lib/cors';
import {noticePdf, noticeText} from '../../../lib/notices';
import {Vendor, Entry} from '../../../lib/data';

const handovers = ['draft', 'handover', 'acknowledged'];

function json(body: unknown, status = 200) {
  return Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});
}

async function viewer(req: Request) {
  const db = database();
  await ensureAccounts(db);
  const account = await sessionUser(db, req);
  if (!account) return json({error: 'Sign in required.'}, 401);
  if (passwordPending(account)) return json({error: 'Change your password before continuing.'}, 403);
  return account;
}

async function noticeCase(db: ReturnType<typeof database>, eventId: string) {
  const event = await db.prepare('SELECT id,vendor_id,kind,amount,note,due,created_at,actor,resolved FROM events WHERE id=?').bind(eventId).first<any>();
  if (!event || !['Warning', 'Violation'].includes(event.kind)) return null;
  const row = await db.prepare('SELECT payload FROM vendors WHERE id=?').bind(event.vendor_id).first<{payload: string}>();
  if (!row) return null;
  const vendor = JSON.parse(row.payload) as Vendor;
  const entry: Entry = {id: event.id, vendorId: event.vendor_id, kind: event.kind, amount: event.amount, note: event.note, due: event.due, createdAt: event.created_at, actor: event.actor, resolved: event.resolved};
  return {vendor, entry};
}

async function record(db: ReturnType<typeof database>, eventId: string, method: string, status: string, detail: string, actor: string) {
  await db.prepare('INSERT INTO notice_deliveries(id,event_id,method,status,detail,actor,created_at) VALUES(?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), eventId, method, status, detail.slice(0, 300), actor, new Date().toISOString()).run();
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
  const account = await viewer(req);
  if (account instanceof Response) return account;
  const body: any = await req.json();
  const eventId = String(body.eventId || '');
  const found = await noticeCase(database(), eventId);
  if (!found) return json({error: 'Notice not found.'}, 404);
  const db = database();
  if (body.action === 'deliver') {
    const method = String(body.method || '');
    if (!handovers.includes(method)) return json({error: 'Choose a delivery record.'}, 400);
    const status = method === 'draft' ? 'draft opened' : method === 'handover' ? 'handed to trader' : 'trader acknowledged';
    await record(db, eventId, method, status, status, account.name);
    return json({ok: true, message: method === 'draft' ? 'Draft opened. This is not a delivery confirmation.' : 'Delivery record saved.'});
  }
  if (body.action === 'send') {
    const webhook = noticeWebhook();
    if (!webhook || !webhookAllowed(webhook)) return json({error: 'Municipal email is not connected. Download the PDF or use the email draft.'}, 409);
    const payload = {reference: found.entry.id, kind: found.entry.kind, vendorId: found.vendor.id, vendorName: found.vendor.name, business: found.vendor.business, email: found.vendor.email, text: noticeText(found.vendor, found.entry)};
    try {
      const response = await fetch(webhook, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
      if (!response.ok) {
        await record(db, eventId, 'municipal', 'rejected', 'HTTP ' + response.status, account.name);
        return json({error: 'The municipal notice service did not accept this notice.'}, 502);
      }
      await record(db, eventId, 'municipal', 'accepted by sender', 'HTTP ' + response.status, account.name);
      return json({ok: true, message: 'The municipal sender accepted the notice. This confirms acceptance, not that the trader opened it.'});
    } catch (error) {
      console.error(error);
      await record(db, eventId, 'municipal', 'failed', 'The municipal sender could not be reached', account.name);
      return json({error: 'The municipal sender could not be reached. The email draft is still available.'}, 502);
    }
  }
  if (body.action === 'escalate') {
    const note = String(body.note || '').trim();
    if (note.length < 3 || note.length > 1000) return json({error: 'Enter why this case is being escalated.'}, 400);
    if (found.entry.resolved) return json({error: 'This case is already resolved.'}, 409);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.batch([
      db.prepare('INSERT INTO events(id,vendor_id,kind,amount,note,due,created_at,actor,resolved) VALUES(?,?,?,?,?,?,?,?,0)').bind(id, found.vendor.id, 'Escalation', 0, 'Case ' + found.entry.id + ': ' + note, found.entry.due || '', now, account.name),
      db.prepare('INSERT INTO notice_deliveries(id,event_id,method,status,detail,actor,created_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(), eventId, 'escalated', 'recorded', note.slice(0, 300), account.name, now),
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
