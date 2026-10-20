import {withOperationalLease} from '../../../lib/write-lease';
import {readJsonObject} from '../../../lib/request';
import {mutationOriginError} from '../../../lib/cors';
import {database} from '../../../lib/server';
import {passwordPending, sessionUser} from '../../../lib/accounts';
import {can} from '../../../lib/capabilities';
import {noticeWebhook} from '../../../lib/server';
import {writeAudit} from '../../../lib/workflows';
import {Vendor} from '../../../lib/data';

function json(body: unknown, status = 200) {
  return Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});
}

export function daysUntil(date: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Number.NaN;
  const [y1, m1, d1] = date.split('-').map(Number);
  const [y2, m2, d2] = today.split('-').map(Number);
  return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86400000);
}

const WINDOW_DAYS = 60;

async function scan(db: ReturnType<typeof database>, actor: string, actorId: string, stamp: string) {
  const today = stamp.slice(0, 10);
  const rows = await db.prepare('SELECT id,payload FROM vendors').all<{id: string; payload: string}>();
  const reminders: {vendorId: string; business: string; expires: string; daysLeft: number; status: string; recorded: boolean}[] = [];
  for (const row of rows.results) {
    const vendor = JSON.parse(row.payload) as Vendor;
    if (!vendor.expires) continue;
    const left = daysUntil(vendor.expires, today);
    if (!Number.isFinite(left) || left > WINDOW_DAYS) continue;
    const status = left < 0 ? 'expired' : vendor.status === 'Suspended' ? 'suspended' : vendor.status === 'Approved' ? 'due' : 'pending-review';
    const existing = await db.prepare('SELECT id FROM renewal_reminders WHERE vendor_id=? AND expires=?').bind(vendor.id, vendor.expires).first<{id: string}>();
    reminders.push({vendorId: vendor.id, business: vendor.business, expires: vendor.expires, daysLeft: left, status, recorded: Boolean(existing)});
  }
  reminders.sort((a, b) => a.daysLeft - b.daysLeft);
  return {today, windowDays: WINDOW_DAYS, reminders};
}

/**
 * Renewal reminders. A scheduled call (or the office pressing Scan) records one
 * reminder per vendor per expiry date, so the same renewal is never queued twice
 * and the task list shows who has to act.
 */
async function handlePost(req: Request) {
  const rejected = mutationOriginError(req);
  if (rejected) return rejected;
  try {
    const db = database();
    const account = await sessionUser(db, req);
    if (!account) return json({error: 'Sign in required.'}, 401);
    if (passwordPending(account)) return json({error: 'Change your password before continuing.'}, 403);
    if (!can(account.role, 'permits.write')) return json({error: 'Your role cannot run the renewal scan.'}, 403);
    const body = await readJsonObject(req);
    const scanOnly = body?.action === 'preview';
    const at = new Date().toISOString();
    const result = await scan(db, account.name, account.id, at);
    if (scanOnly) return json({ok: true, ...result, created: 0});

    let created = 0;
    const notified: string[] = [];
    for (const reminder of result.reminders) {
      if (reminder.recorded) continue;
      try {
        await db.prepare('INSERT INTO renewal_reminders(id,vendor_id,expires,days_left,status,note,actor,created_at) VALUES(?,?,?,?,?,?,?,?)')
          .bind(crypto.randomUUID(), reminder.vendorId, reminder.expires, reminder.daysLeft, reminder.status, 'Permit renewal reminder', account.name, at).run();
      } catch (error) {
        if (/UNIQUE/i.test(String(error))) continue;
        throw error;
      }
      // A reminder is a task in the vendor's history, not a permit decision.
      await db.prepare('INSERT INTO events(id,vendor_id,kind,amount,note,due,created_at,actor,resolved,case_status,owner) VALUES(?,?,?,?,?,?,?,?,0,?,?)')
        .bind(crypto.randomUUID(), reminder.vendorId, 'Renewal reminder', 0,
          `Permit expires ${reminder.expires} (${reminder.daysLeft < 0 ? Math.abs(reminder.daysLeft) + ' days overdue' : reminder.daysLeft + ' days left'}). Review the permit, the fee position and the verification documents, then renew, suspend or close the record.`,
          reminder.expires, at, 'Renewal scan', 'follow-up', account.name).run();
      await writeAudit(db, 'renewal', reminder.vendorId, 'reminder created', null, {expires: reminder.expires, daysLeft: reminder.daysLeft, status: reminder.status}, account.name, at, account.id);
      created += 1;
      if (noticeWebhook()) notified.push(reminder.vendorId);
    }
    if (created) await writeAudit(db, 'renewal', result.today, 'scan completed', null, {created, window: WINDOW_DAYS}, account.name, at, account.id);
    return json({ok: true, ...result, created, senderConnected: Boolean(noticeWebhook()), notifySupported: notified.length > 0, reminders: result.reminders});
  } catch (error) {
    console.error(error);
    return json({error: 'The renewal scan could not be completed.'}, 503);
  }
}

export function POST(req: Request) {return withOperationalLease(req, () => handlePost(req));}
