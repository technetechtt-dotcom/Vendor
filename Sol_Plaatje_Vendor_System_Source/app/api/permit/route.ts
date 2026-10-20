import {mutationOriginError} from '../../../lib/cors';
import {database} from '../../../lib/server';
import {ensureAccounts, passwordPending, sessionUser} from '../../../lib/accounts';
import {can} from '../../../lib/capabilities';
import {noticePdf} from '../../../lib/notices';
import {Vendor} from '../../../lib/data';
import {writeAudit} from '../../../lib/workflows';

function json(body: unknown, status = 200) {
  return Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});
}

function stamp() {
  return new Date().toISOString();
}

/**
 * Permit certificate. Printing one is recorded as a permit document, so the
 * office can see when a certificate was produced and for which expiry date.
 */
export async function GET(req: Request) {
  try {
    const db = database();
    await ensureAccounts(db);
    const account = await sessionUser(db, req);
    if (!account) return json({error: 'Sign in required.'}, 401);
    if (passwordPending(account)) return json({error: 'Change your password before continuing.'}, 403);
    if (!can(account.role, 'permits.write') && account.role !== 'field') return json({error: 'Your role cannot produce permit certificates.'}, 403);

    const params = new URL(req.url).searchParams;
    const vendorId = String(params.get('vendorId') || '');
    const record = params.get('record') !== 'no';
    const row = await db.prepare('SELECT payload FROM vendors WHERE id=? COLLATE NOCASE').bind(vendorId).first<{payload: string}>();
    if (!row) return json({error: 'Vendor not found.'}, 404);
    const vendor = JSON.parse(row.payload) as Vendor;

    const permits = await db.prepare("SELECT card_serial AS cardSerial,status,created_at AS createdAt FROM permits WHERE vendor_id=? ORDER BY created_at").bind(vendor.id).all<any>();
    let currentSerial = '';
    let cardState = 'No card serial is on record.';
    for (const permit of permits.results) {
      if (permit.status === 'revoked') currentSerial = '';
      else if ((permit.status === 'issued' || permit.status === 'replacement') && permit.cardSerial) currentSerial = String(permit.cardSerial);
    }
    if (currentSerial) cardState = 'Card serial ' + currentSerial;
    if (vendor.status === 'Suspended') cardState += ' — the permit is suspended.';

    const status = vendor.expires && vendor.expires < new Date().toISOString().slice(0, 10) ? 'Expired' : vendor.status;
    if (vendor.sample) return json({error: 'Sample records cannot produce permit certificates.'}, 409);
    if (status !== 'Approved') return json({error: 'Approve the vendor and record a current permit expiry before producing a certificate.'}, 409);
    const lines = [
      'SOL PLAATJE MUNICIPALITY',
      'Local Economic Development Office',
      'TRADING PERMIT CERTIFICATE',
      vendor.sample ? 'SAMPLE — NOT A VALID PERMIT' : '',
      '',
      'Permit holder: ' + vendor.name,
      'Business / trading name: ' + vendor.business,
      'Vendor ID: ' + vendor.id,
      'Trading type: ' + vendor.type,
      'Sector / products: ' + vendor.sector,
      vendor.type === 'Formal'
        ? 'Allocated trading space: ' + vendor.hub + ', unit ' + (vendor.unit || 'not recorded')
        : 'Trading pitch: ' + (vendor.unit || 'not recorded') + (vendor.address ? ' — ' + vendor.address : ''),
      vendor.type === 'Informal' ? 'Recorded coordinates: ' + (vendor.lat || 'not recorded') + ', ' + (vendor.lng || 'not recorded') : '',
      '',
      'Permit issue date: ' + (vendor.issued || 'not recorded'),
      'Permit expiry date: ' + (vendor.expires || 'not recorded'),
      'Permit status at issue: ' + status,
      cardState,
      '',
      'Conditions',
      '1. This permit is valid only at the trading space recorded above.',
      '2. Trading outside the recorded space, or after the expiry date, is not permitted.',
      '3. The permit holder must keep the recorded registration details current.',
      '4. The municipality may inspect the trading space and suspend or revoke this permit after a recorded finding.',
      '',
      'Issued by: ' + account.name,
      'Produced: ' + new Date().toLocaleString('en-ZA', {timeZone: 'Africa/Johannesburg'}),
      'Certificate reference: ' + vendor.id + '-PERMIT-' + (vendor.expires || 'no-expiry'),
      '',
      'This certificate is printed from the vendor register. Confirm the register record on screen before issuing it.',
    ].filter(line => line !== undefined && line !== null);

    if (record) {
      await db.prepare('INSERT INTO permit_documents(id,vendor_id,kind,card_serial,permit_expires,note,actor,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .bind(crypto.randomUUID(), vendor.id, 'certificate', currentSerial, vendor.expires || '', 'Permit certificate produced', account.name, account.id, stamp()).run();
      await writeAudit(db, 'permit-document', vendor.id, 'certificate produced', null, {cardSerial: currentSerial, expires: vendor.expires || '', status}, account.name, stamp(), account.id);
    }

    return new Response(noticePdf(lines as string[]), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="permit-${vendor.id}.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error(error);
    return json({error: 'The permit certificate could not be prepared.'}, 503);
  }
}

/** Card and permit lifecycle events that are not a permit decision. */
export async function POST(req: Request) {
  const rejected = mutationOriginError(req);
  if (rejected) return rejected;
  try {
    const db = database();
    await ensureAccounts(db);
    const account = await sessionUser(db, req);
    if (!account) return json({error: 'Sign in required.'}, 401);
    if (passwordPending(account)) return json({error: 'Change your password before continuing.'}, 403);
    if (!can(account.role, 'permits.write')) return json({error: 'Your role cannot record card events.'}, 403);
    const body: any = await req.json().catch(() => null);
    if (!body || body.action !== 'card-event') return json({error: 'Unknown action.'}, 400);
    const vendorId = String(body.vendorId || '');
    const kind = String(body.kind || '');
    if (!['printed', 'handed-over', 'reported-lost'].includes(kind)) return json({error: 'Choose a card event.'}, 400);
    const note = String(body.note || '').trim().slice(0, 300);
    if (kind === 'reported-lost' && note.length < 3) return json({error: 'Record how the card was lost or what was reported.'}, 400);
    const vendor = await db.prepare('SELECT id,payload FROM vendors WHERE id=?').bind(vendorId).first<{id: string; payload: string}>();
    if (!vendor) return json({error: 'Vendor not found.'}, 404);
    const profile = JSON.parse(vendor.payload) as Vendor;
    const permits = await db.prepare("SELECT card_serial AS cardSerial,status FROM permits WHERE vendor_id=? ORDER BY created_at").bind(vendorId).all<{cardSerial: string; status: string}>();
    let currentSerial = '';
    for (const permit of permits.results) {
      if (permit.status === 'revoked') currentSerial = '';
      else if (['issued', 'replacement'].includes(permit.status) && permit.cardSerial) currentSerial = permit.cardSerial;
    }
    const requestedSerial = String(body.cardSerial || '').toUpperCase().replace(/[^0-9A-Z .$/+%-]/g, '').slice(0, 40);
    const serial = requestedSerial || currentSerial;
    const currentStatus = profile.expires && profile.expires < new Date().toISOString().slice(0, 10) ? 'Expired' : profile.status;
    if (profile.sample || currentStatus !== 'Approved' || !currentSerial) return json({error: 'Approve the vendor and issue a current card before recording card handling.'}, 409);
    if (serial !== currentSerial) return json({error: 'The card serial must match the current issued card.'}, 409);
    const at = stamp();
    await db.prepare('INSERT INTO permit_documents(id,vendor_id,kind,card_serial,permit_expires,note,actor,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), vendorId, kind, serial, '', note, account.name, account.id, at).run();
    await writeAudit(db, 'permit-document', vendorId, kind, null, {cardSerial: serial, note}, account.name, at, account.id);
    return json({ok: true});
  } catch (error) {
    console.error(error);
    return json({error: 'The card event could not be recorded.'}, 503);
  }
}
