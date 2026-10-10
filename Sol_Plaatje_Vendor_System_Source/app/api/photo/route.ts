import {bucket, database} from '../../../lib/server';
import {ensureAccounts, passwordPending, sessionUser} from '../../../lib/accounts';
import {fieldCorsHeaders, withFieldCors} from '../../../lib/cors';

const types = ['image/jpeg', 'image/png', 'image/webp'];

function denied(status: number, error: string) {
  return Response.json({error}, {status, headers: {'Cache-Control': 'no-store'}});
}

async function viewer(req: Request) {
  const db = database();
  await ensureAccounts(db);
  const account = await sessionUser(db, req);
  if (!account) return denied(401, 'Sign in required.');
  if (passwordPending(account)) return denied(403, 'Change your password before continuing.');
  return account;
}

function imageHeaders(contentType: string) {
  return {'Content-Type': contentType, 'Cache-Control': 'private, no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff'};
}

async function handlePost(req: Request) {
  const account = await viewer(req);
  if (account instanceof Response) return account;
  if (account.role === 'field') return denied(403, 'Field officers cannot upload photographs.');
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) return denied(403, 'Invalid request origin.');
  const form = await req.formData();
  const file = form.get('photo');
  if (!(file instanceof File) || !types.includes(file.type) || file.size > 3 * 1024 * 1024) return denied(400, 'Use a JPG, PNG or WebP image under 3 MB.');
  const key = crypto.randomUUID();
  await bucket().put(key, await file.arrayBuffer(), {httpMetadata: {contentType: file.type}});
  await database().prepare('INSERT INTO attachments(key,kind,vendor_id,label,name,created_by,created_at) VALUES(?,?,?,?,?,?,?)').bind(key, 'photo', '', 'Profile picture', file.name.slice(0, 180), account.id, new Date().toISOString()).run();
  return Response.json({photo: '/api/photo?key=' + key, key});
}

async function handleGet(req: Request) {
  const account = await viewer(req);
  if (account instanceof Response) return account;
  const key = new URL(req.url).searchParams.get('key');
  if (!key || !/^[a-f0-9-]{36}$/.test(key)) return new Response('Not found', {status: 404, headers: {'Cache-Control': 'no-store'}});
  const object = await bucket().get(key);
  if (!object) return new Response('Not found', {status: 404, headers: {'Cache-Control': 'no-store'}});
  return new Response(object.body, {headers: imageHeaders(object.httpMetadata?.contentType || 'image/jpeg')});
}

export function OPTIONS(req: Request) {
  const headers = fieldCorsHeaders(req);
  if (!headers) return new Response(null, {status: 403});
  return new Response(null, {status: 204, headers});
}

export function POST(req: Request) {
  return handlePost(req).then(res => withFieldCors(req, res)).catch(error => {
    console.error(error);
    return withFieldCors(req, denied(503, 'The photo could not be uploaded. Try again.'));
  });
}

export function GET(req: Request) {
  return handleGet(req).then(res => withFieldCors(req, res)).catch(() => withFieldCors(req, new Response('Unavailable', {status: 503, headers: {'Cache-Control': 'no-store'}})));
}
