import {database} from '../../../lib/server';
import {checkPassword, clearOtherSessions, clearSessions, clientIp, ensureAccounts, hashPassword, isLocalHost, openSession, passwordPending, publicAccount, requestIsSecure, sessionCookie, sessionToken, sessionUser} from '../../../lib/accounts';
import {fieldCorsHeaders, withFieldCors} from '../../../lib/cors';

const roles = ['superuser', 'office', 'field'];
const WINDOW_MS = 15 * 60 * 1000;

function json(body: unknown, status = 200, extra?: HeadersInit) {
  const headers = new Headers(extra);
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
  return Response.json(body, {status, headers});
}

function deviceLabel(req: Request) {
  return (req.headers.get('user-agent') || 'Unknown device').slice(0, 160);
}

function secureCookie(req: Request, token: string, maxAge: number) {
  return sessionCookie(token, maxAge, requestIsSecure(req));
}

function cleartextBlocked(req: Request) {
  return !requestIsSecure(req) && !isLocalHost(new URL(req.url).hostname);
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function userCount(db: ReturnType<typeof database>) {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM users').first<{n: number}>();
  return Number(row?.n || 0);
}

async function setupRequired(db: ReturnType<typeof database>) {
  return (await userCount(db)) === 0;
}

async function tooManyAttempts(db: ReturnType<typeof database>, email: string, ip: string) {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const byEmail = email ? await db.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE email=? AND created_at>?').bind(email, since).first<{n: number}>() : null;
  if (Number(byEmail?.n || 0) >= 5) return true;
  const byIp = await db.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip=? AND created_at>?').bind(ip, since).first<{n: number}>();
  return Number(byIp?.n || 0) >= 30;
}

async function recordAttempt(db: ReturnType<typeof database>, email: string, ip: string) {
  await db.prepare('INSERT INTO login_attempts(id,email,ip,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(), email || '-', ip, new Date().toISOString()).run();
}

async function handleGet(req: Request) {
  const db = database();
  await ensureAccounts(db);
  const account = await sessionUser(db, req);
  if (!account) return json({user: null, setupRequired: await setupRequired(db)});
  return json({user: publicAccount(account)});
}

async function handleSetup(req: Request, db: ReturnType<typeof database>, body: any) {
  if (cleartextBlocked(req)) return json({error: 'Administrator setup requires a secure https connection.'}, 400);
  if (!(await setupRequired(db))) return json({error: 'An administrator already exists. Sign in instead.'}, 409);
  await db.prepare("DELETE FROM app_meta WHERE key='administrator'").run();
  try {
    await db.prepare("INSERT INTO app_meta(key,value) VALUES('administrator',?)").bind(new Date().toISOString()).run();
  } catch {
    return json({error: 'Administrator setup is already in progress.'}, 409);
  }
  const name = String(body.name || '').trim().replace(/\s+/g, ' ');
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (name.length < 2 || name.length > 80) return json({error: 'Enter the administrator’s name.'}, 400);
  if (!validEmail(email)) return json({error: 'Enter a valid email address.'}, 400);
  if (password.length < 12) return json({error: 'Choose a password of at least 12 characters.'}, 400);
  if (password.toLowerCase() === email) return json({error: 'Do not use the email address as the password.'}, 400);
  if (await userCount(db)) return json({error: 'An administrator already exists. Sign in instead.'}, 409);
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO users(id,name,email,password_hash,role,active,created_at,must_change_password) VALUES(?,?,?,?,?,?,?,0)')
    .bind(id, name, email, await hashPassword(password), 'superuser', 1, new Date().toISOString()).run();
  const session = await openSession(db, id, deviceLabel(req));
  return json({user: publicAccount({id, name, email, role: 'superuser', active: 1, mustChangePassword: 0}), token: session.token}, 200, {'Set-Cookie': secureCookie(req, session.token, session.maxAge)});
}

async function handlePost(req: Request) {
  const db = database();
  await ensureAccounts(db);
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({error: 'Sign-in details could not be read. Try again.'}, 400);
  }
  if (body.action === 'setup') return handleSetup(req, db, body);
  if (body.action === 'login') {
    if (cleartextBlocked(req)) return json({error: 'Sign in requires a secure https connection.'}, 400);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const ip = clientIp(req);
    if (await tooManyAttempts(db, email, ip)) return json({error: 'Too many sign-in attempts. Try again in 15 minutes.'}, 429);
    const row = await db.prepare('SELECT id,name,email,role,active,password_hash,must_change_password AS mustChangePassword FROM users WHERE email=?').bind(email).first<any>();
    const valid = await checkPassword(password, row?.active ? row.password_hash : undefined);
    if (!row || !row.active || !valid) {
      await recordAttempt(db, email, ip);
      return json({error: 'The email or password is not correct.'}, 401);
    }
    await db.prepare('DELETE FROM login_attempts WHERE email=?').bind(email).run();
    const session = await openSession(db, row.id, deviceLabel(req));
    const account = {id: row.id, name: row.name, email: row.email, role: row.role, active: row.active, mustChangePassword: row.mustChangePassword};
    return json({user: publicAccount(account), token: session.token}, 200, {'Set-Cookie': secureCookie(req, session.token, session.maxAge)});
  }
  const account = await sessionUser(db, req);
  if (!account) return json({error: 'Sign in required.'}, 401);
  if (body.action === 'logout') {
    const token = sessionToken(req);
    if (token) await db.prepare('DELETE FROM sessions WHERE token=?').bind(token).run();
    return json({ok: true}, 200, {'Set-Cookie': sessionCookie('', 0, requestIsSecure(req))});
  }
  if (body.action === 'change-password') {
    const current = String(body.currentPassword || '');
    const next = String(body.password || '');
    if (next.length < 8) return json({error: 'Choose a password of at least 8 characters.'}, 400);
    if (next === current) return json({error: 'Choose a different password.'}, 400);
    if (next.toLowerCase() === account.email) return json({error: 'Do not use the email address as the password.'}, 400);
    const row = await db.prepare('SELECT password_hash FROM users WHERE id=?').bind(account.id).first<{password_hash: string}>();
    if (!(await checkPassword(current, row?.password_hash))) return json({error: 'The current password is not correct.'}, 401);
    await db.prepare('UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?').bind(await hashPassword(next), account.id).run();
    await clearOtherSessions(db, account.id, sessionToken(req));
    return json({user: publicAccount({...account, mustChangePassword: 0})});
  }
  if (passwordPending(account)) return json({error: 'Change your password before continuing.'}, 403);
  if (body.action === 'sessions') {
    const userId = account.role === 'superuser' ? String(body.userId || account.id) : account.id;
    const rows = await db.prepare('SELECT token,created_at AS createdAt,expires_at AS expiresAt,device FROM sessions WHERE user_id=? AND expires_at>? ORDER BY created_at DESC').bind(userId, new Date().toISOString()).all<any>();
    const current = sessionToken(req);
    return json({sessions: rows.results.map(row => ({createdAt: row.createdAt, expiresAt: row.expiresAt, device: row.device || 'Unknown device', current: row.token === current}))});
  }
  if (body.action === 'revoke-sessions') {
    const target = String(body.userId || account.id);
    if (account.role !== 'superuser' && target !== account.id) return json({error: 'You can only sign out your own other devices.'}, 403);
    const exists = await db.prepare('SELECT id FROM users WHERE id=?').bind(target).first();
    if (!exists) return json({error: 'User no longer exists.'}, 404);
    if (target === account.id) await clearOtherSessions(db, target, sessionToken(req));
    else await clearSessions(db, target);
    return json({ok: true});
  }
  if (account.role !== 'superuser') return json({error: 'Only the super user can manage accounts.'}, 403);
  if (body.action === 'users') {
    const rows = await db.prepare('SELECT id,name,email,role,active,must_change_password AS mustChangePassword,created_at AS createdAt FROM users ORDER BY created_at').all<any>();
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
    if (!validEmail(email)) return json({error: 'Enter a valid email address.'}, 400);
    if (!roles.includes(role)) return json({error: 'Choose a role.'}, 400);
    const existing = input.id ? await db.prepare('SELECT id,role,active FROM users WHERE id=?').bind(input.id).first<any>() : null;
    if (input.id && !existing) return json({error: 'User no longer exists.'}, 404);
    const duplicate = await db.prepare('SELECT id FROM users WHERE email=? AND id<>?').bind(email, existing?.id || '').first<any>();
    if (duplicate) return json({error: 'That email address is already in use.'}, 409);
    if (!existing && password.length < 8) return json({error: 'Set a password of at least 8 characters.'}, 400);
    if (password && (password.length < 8 || password.toLowerCase() === email)) return json({error: 'Set a password of at least 8 characters that is not the email address.'}, 400);
    if (existing?.role === 'superuser' && (role !== 'superuser' || !active)) {
      const others = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='superuser' AND active=1 AND id<>?").bind(existing.id).first<any>();
      if (!others?.n) return json({error: 'Keep at least one active super user.'}, 400);
    }
    const now = new Date().toISOString();
    if (!existing) {
      await db.prepare('INSERT INTO users(id,name,email,password_hash,role,active,created_at,must_change_password) VALUES(?,?,?,?,?,?,?,1)')
        .bind(crypto.randomUUID(), name, email, await hashPassword(password), role, active, now).run();
      return json({ok: true});
    }
    if (password) {
      const own = existing.id === account.id;
      await db.prepare('UPDATE users SET name=?,email=?,role=?,active=?,password_hash=?,must_change_password=? WHERE id=?').bind(name, email, role, active, await hashPassword(password), own ? 0 : 1, existing.id).run();
      if (own) await clearOtherSessions(db, existing.id, sessionToken(req));
      else await clearSessions(db, existing.id);
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
