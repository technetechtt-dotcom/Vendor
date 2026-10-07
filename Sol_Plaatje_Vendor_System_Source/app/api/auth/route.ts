import {database} from '../../../lib/server';
import {bootstrapStillActive, clearSessions, ensureAccounts, hashPassword, openSession, publicAccount, sessionCookie, sessionUser, verifyPassword} from '../../../lib/accounts';
import {fieldCorsHeaders, withFieldCors} from '../../../lib/cors';

const roles = ['superuser', 'office', 'field'];

function json(body: unknown, status = 200, extra?: HeadersInit) {
  const headers = new Headers(extra);
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
  return Response.json(body, {status, headers});
}

async function handleGet(req: Request) {
  const db = database();
  await ensureAccounts(db);
  const account = await sessionUser(db, req);
  if (!account) return json({error: 'Sign in required.', bootstrap: await bootstrapStillActive(db)}, 401);
  return json({user: publicAccount(account)});
}

async function handlePost(req: Request) {
  const db = database();
  await ensureAccounts(db);
  const body: any = await req.json();
  if (body.action === 'login') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const row = await db.prepare('SELECT id,name,email,role,active,password_hash FROM users WHERE email=?').bind(email).first<any>();
    if (!row || !row.active || !(await verifyPassword(password, row.password_hash))) return json({error: 'The email or password is not correct.'}, 401);
    const session = await openSession(db, row.id);
    const account = {id: row.id, name: row.name, email: row.email, role: row.role};
    return json({user: publicAccount(account), token: session.token}, 200, {'Set-Cookie': sessionCookie(session.token, session.maxAge)});
  }
  const account = await sessionUser(db, req);
  if (!account) return json({error: 'Sign in required.'}, 401);
  if (body.action === 'logout') {
    const header = req.headers.get('authorization') || '';
    const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
    const cookie = (req.headers.get('cookie') || '').match(/(?:^|;\s*)led_session=([^;]+)/);
    const token = bearer || (cookie ? decodeURIComponent(cookie[1]) : '');
    if (token) await db.prepare('DELETE FROM sessions WHERE token=?').bind(token).run();
    return json({ok: true}, 200, {'Set-Cookie': sessionCookie('', 0)});
  }
  if (account.role !== 'superuser') return json({error: 'Only the super user can manage accounts.'}, 403);
  if (body.action === 'users') {
    const rows = await db.prepare('SELECT id,name,email,role,active,created_at AS createdAt FROM users ORDER BY created_at').all<any>();
    return json({users: rows.results});
  }
  if (body.action === 'save-user') {
    const input = body.user || {};
    const name = String(input.name || '').trim().replace(/\s+/g, ' ');
    const email = String(input.email || '').trim().toLowerCase();
    const role = String(input.role || '');
    const active = input.active === false || input.active === 0 ? 0 : 1;
    const password = String(input.password || '');
    if (name.length < 2 || name.length > 80) return json({error: 'Enter the person’s name.'}, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({error: 'Enter a valid email address.'}, 400);
    if (!roles.includes(role)) return json({error: 'Choose a role.'}, 400);
    const existing = input.id ? await db.prepare('SELECT id,role,active FROM users WHERE id=?').bind(input.id).first<any>() : null;
    if (input.id && !existing) return json({error: 'User no longer exists.'}, 404);
    const duplicate = await db.prepare('SELECT id FROM users WHERE email=? AND id<>?').bind(email, existing?.id || '').first<any>();
    if (duplicate) return json({error: 'That email address is already in use.'}, 409);
    if (!existing && password.length < 8) return json({error: 'Set a password of at least 8 characters.'}, 400);
    if (password && password.length < 8) return json({error: 'Set a password of at least 8 characters.'}, 400);
    if (existing?.role === 'superuser' && (role !== 'superuser' || !active)) {
      const others = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='superuser' AND active=1 AND id<>?").bind(existing.id).first<any>();
      if (!others?.n) return json({error: 'Keep at least one active super user.'}, 400);
    }
    const now = new Date().toISOString();
    if (!existing) {
      await db.prepare('INSERT INTO users(id,name,email,password_hash,role,active,created_at) VALUES(?,?,?,?,?,?,?)')
        .bind(crypto.randomUUID(), name, email, await hashPassword(password), role, active, now).run();
      return json({ok: true});
    }
    if (password) {
      await db.prepare('UPDATE users SET name=?,email=?,role=?,active=?,password_hash=? WHERE id=?').bind(name, email, role, active, await hashPassword(password), existing.id).run();
      await clearSessions(db, existing.id);
    } else {
      await db.prepare('UPDATE users SET name=?,email=?,role=?,active=? WHERE id=?').bind(name, email, role, active, existing.id).run();
      if (!active) await clearSessions(db, existing.id);
    }
    return json({ok: true});
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
    return withFieldCors(req, json({error: 'Sign-in is unavailable. Please try again.'}, 503));
  });
}

export function POST(req: Request) {
  return handlePost(req).then(res => withFieldCors(req, res)).catch(error => {
    console.error(error);
    return withFieldCors(req, json({error: 'Sign-in is unavailable. Please try again.'}, 503));
  });
}
