import {readJsonObject} from '../../../lib/request';
import {bucket, database} from '../../../lib/server';
import {passwordPending, sessionUser} from '../../../lib/accounts';
import {buildSnapshot, restoreSnapshot, verifySnapshot} from '../../../lib/backup';
import {writeAudit} from '../../../lib/workflows';
import {mutationOriginError} from '../../../lib/cors';

function json(body: unknown, status = 200, extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set('Cache-Control', 'no-store');
  return Response.json(body, {status, headers});
}

async function superUser(req: Request) {
  const db = database();
  const account = await sessionUser(db, req);
  if (!account) return json({error: 'Sign in required.'}, 401);
  if (passwordPending(account)) return json({error: 'Change your password before continuing.'}, 403);
  if (account.role !== 'superuser') return json({error: 'Only the super user can export, verify or restore a register backup.'}, 403);
  return {db, account};
}

export async function GET(req: Request) {
  try {
    const viewer = await superUser(req);
    if (viewer instanceof Response) return viewer;
    const stamp = new Date().toISOString();
    const snapshot = await buildSnapshot(viewer.db, bucket(), viewer.account.name, stamp);
    // A backup is a read of everything: record that it happened.
    await writeAudit(viewer.db, 'backup', stamp, 'exported', null, {manifest: snapshot.manifest, checksum: snapshot.checksum}, viewer.account.name, stamp);
    const filename = `vendor-register-backup-${stamp.slice(0, 19).replace(/[:T]/g, '-')}.json`;
    return new Response(JSON.stringify(snapshot, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Backup-Checksum': snapshot.checksum,
        'X-Backup-Rows': String(Object.values(snapshot.manifest).reduce((total, count) => total + count, 0)),
      },
    });
  } catch (error) {
    console.error(error);
    return json({error: 'The backup could not be prepared.'}, 503);
  }
}

export async function POST(req: Request) {
  const rejected = mutationOriginError(req);
  if (rejected) return rejected;
  try {
    const viewer = await superUser(req);
    if (viewer instanceof Response) return viewer;
    const body = await readJsonObject(req);
    if (!body || !['verify', 'restore'].includes(String(body.action))) return json({error: 'Unknown action.'}, 400);
    const document = body.document;
    if (!document || typeof document !== 'object') return json({error: 'Attach the exported backup document to verify.'}, 400);
    const result = await verifySnapshot(document);
    const stamp = new Date().toISOString();
    if (body.action === 'verify') {
      await writeAudit(viewer.db, 'backup', String((document as Record<string, unknown>).generatedAt || stamp), 'verified', null, {ok: result.ok, counts: result.counts}, viewer.account.name, stamp, viewer.account.id);
      return json(result);
    }
    if (!result.restorable) return json({error: 'Only a verified version 2 backup can be restored.', ...result}, 400);
    if (String(body.confirmation || '') !== result.confirmation) return json({error: `Type ${result.confirmation} to confirm this restore.`}, 400);
    const restored = await restoreSnapshot(viewer.db, bucket(), document);
    await writeAudit(viewer.db, 'backup', String((document as Record<string, unknown>).generatedAt || stamp), 'restored', null, {checksum: restored.checksum, counts: restored.counts, objects: restored.objects}, viewer.account.name, stamp, viewer.account.id);
    return json({ok: true, ...restored});
  } catch (error) {
    return json({error: error instanceof Error ? error.message : 'The backup could not be verified.'}, 400);
  }
}
