import {database} from './server';
import {sessionUser, passwordPending} from './accounts';
import {mutationOriginError} from './cors';

const LIFETIME_MS = 5 * 60 * 1000;
/** Serialize operational writes, including restore, across all Worker instances. */
export async function acquireOperationLease(db: Pick<D1Database, 'prepare'>, time = Date.now()) {
  const token = crypto.randomUUID();
  const result = await db.prepare("INSERT INTO operation_leases(name,token,expires_at) VALUES('register',?,?) ON CONFLICT(name) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE operation_leases.expires_at<=?")
    .bind(token, new Date(time + LIFETIME_MS).toISOString(), new Date(time).toISOString()).run();
  return result.meta.changes === 1 ? token : null;
}
export async function releaseOperationLease(db: Pick<D1Database, 'prepare'>, token: string) {
  await db.prepare("DELETE FROM operation_leases WHERE name='register' AND token=?").bind(token).run();
}
export async function withOperationalLease(req: Request, operation: () => Promise<Response>) {
  const rejected = mutationOriginError(req, true);
  if (rejected) return rejected;
  try {
    const db = database();
    const account = await sessionUser(db, req);
    // Let the handler produce its existing sign-in/password response.
    if (!account || passwordPending(account)) return operation();
    const token = await acquireOperationLease(db);
    if (!token) return Response.json({error: 'Another register change or restore is in progress. Keep your form open and retry shortly.'}, {status: 503, headers: {'Cache-Control': 'no-store', 'Retry-After': '3'}});
    try {return await operation();}
    finally {await releaseOperationLease(db, token).catch(error => console.error('Operational lease cleanup failed', error));}
  } catch (error) {
    console.error('Operational write unavailable', error);
    return Response.json({error: 'Register changes are temporarily unavailable. Keep your form open and try again.'}, {status: 503, headers: {'Cache-Control': 'no-store'}});
  }
}
