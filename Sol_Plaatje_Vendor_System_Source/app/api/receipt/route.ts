import {database} from '../../../lib/server';
import {ensureAccounts, passwordPending, sessionUser} from '../../../lib/accounts';
import {noticePdf} from '../../../lib/notices';

export async function GET(req: Request) {
  try {
    const db = database();
    await ensureAccounts(db);
    const account = await sessionUser(db, req);
    if (!account) return Response.json({error: 'Sign in required.'}, {status: 401});
    if (passwordPending(account)) return Response.json({error: 'Change your password before continuing.'}, {status: 403});
    const eventId = new URL(req.url).searchParams.get('eventId') || '';
    const event = await db.prepare('SELECT id,vendor_id,kind,amount,note,created_at,actor,receipt_no,pay_method,pay_ref,cashier,reversal_of FROM events WHERE id=?').bind(eventId).first<any>();
    if (!event || event.kind !== 'Payment') return Response.json({error: 'Payment receipt not found.'}, {status: 404});
    const row = await db.prepare('SELECT payload FROM vendors WHERE id=?').bind(event.vendor_id).first<{payload: string}>();
    const vendor = row ? JSON.parse(row.payload) : {business: event.vendor_id, name: ''};
    const amount = (event.amount / 100).toLocaleString('en-ZA', {style: 'currency', currency: 'ZAR'});
    const lines = [
      'SOL PLAATJE MUNICIPALITY',
      'Local Economic Development',
      'Payment receipt',
      '',
      'Receipt ' + (event.receipt_no || 'not numbered'),
      'Vendor ' + (vendor.business || event.vendor_id),
      'Trader ' + (vendor.name || ''),
      'Vendor ID ' + event.vendor_id,
      'Amount ' + amount,
      'Method ' + (event.pay_method || 'Not recorded'),
      'Reference ' + (event.pay_ref || 'Not recorded'),
      'Cashier ' + (event.cashier || event.actor),
      'Recorded ' + event.created_at,
      '',
      event.note,
      '',
      'This receipt records a ledger entry. It is not a bank confirmation.',
    ];
    const pdf = noticePdf(lines);
    return new Response(pdf, {headers: {'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="receipt-${eventId.slice(0, 8)}.pdf"`, 'Cache-Control': 'private, no-store'}});
  } catch (error) {
    console.error(error);
    return Response.json({error: 'The receipt could not be prepared.'}, {status: 503});
  }
}
