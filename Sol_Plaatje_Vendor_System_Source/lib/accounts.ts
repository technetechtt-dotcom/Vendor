export const BOOTSTRAP_EMAIL = 'superuser@solplaatje.local';
export const BOOTSTRAP_PASSWORD = 'SolPlaatje#2026';
const BOOTSTRAP_NAME = 'LED Super User';
const SESSION_DAYS = 12;

const defaultHubs: [string, string][] = [
  ['hub-craven', 'Craven Street Container Hub'],
  ['hub-arena', 'Arena Container Hub'],
  ['hub-platfontein', 'Platfontein Container Hub'],
  ['hub-greenpoint', 'Greenpoint Container Hub'],
  ['hub-galeshewe', 'Galeshewe SMME Village'],
];

export type Account = {id: string; name: string; email: string; role: string; active: number};

type Sql = {
  prepare: (query: string) => {
    bind: (...args: unknown[]) => SqlStatement;
    first: <T = any>() => Promise<T | null>;
    all: <T = any>() => Promise<{results: T[]}>;
    run: () => Promise<unknown>;
  };
};

type SqlStatement = {
  first: <T = any>() => Promise<T | null>;
  all: <T = any>() => Promise<{results: T[]}>;
  run: () => Promise<unknown>;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations}, key, 256);
  return new Uint8Array(bits);
}

function sameBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, 100000);
  return `pbkdf2$100000$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, rounds, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2' || !rounds || !salt || !hash) return false;
  const iterations = Number(rounds);
  if (!Number.isInteger(iterations) || iterations < 10000) return false;
  const actual = await pbkdf2(password, base64ToBytes(salt), iterations);
  return sameBytes(actual, base64ToBytes(hash));
}

export function publicAccount(account: Account) {
  return {id: account.id, name: account.name, email: account.email, role: account.role};
}

export async function ensureAccounts(db: Sql) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY NOT NULL,
    name text NOT NULL,
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    role text NOT NULL,
    active integer NOT NULL DEFAULT 1,
    created_at text NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
    token text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    expires_at text NOT NULL,
    created_at text NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS hubs (
    id text PRIMARY KEY NOT NULL,
    name text NOT NULL UNIQUE,
    created_at text NOT NULL,
    updated_at text NOT NULL
  )`).run();
  const hubCount = await db.prepare('SELECT COUNT(*) AS n FROM hubs').first<{n: number}>();
  if (!hubCount?.n) {
    for (let index = 0; index < defaultHubs.length; index++) {
      const [id, name] = defaultHubs[index];
      const stamp = `2026-01-01T00:00:0${index}Z`;
      await db.prepare('INSERT OR IGNORE INTO hubs(id,name,created_at,updated_at) VALUES(?,?,?,?)').bind(id, name, stamp, stamp).run();
    }
  }
  const userCount = await db.prepare('SELECT COUNT(*) AS n FROM users').first<{n: number}>();
  if (!userCount?.n) {
    await db.prepare('INSERT OR IGNORE INTO users(id,name,email,password_hash,role,active,created_at) VALUES(?,?,?,?,?,?,?)')
      .bind('user-superuser', BOOTSTRAP_NAME, BOOTSTRAP_EMAIL, await hashPassword(BOOTSTRAP_PASSWORD), 'superuser', 1, new Date().toISOString())
      .run();
  }
}

export async function bootstrapStillActive(db: Sql) {
  const row = await db.prepare('SELECT password_hash FROM users WHERE email=?').bind(BOOTSTRAP_EMAIL).first<{password_hash: string}>();
  return !!row && await verifyPassword(BOOTSTRAP_PASSWORD, row.password_hash);
}

function sessionToken(req: Request) {
  const header = req.headers.get('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  const cookie = req.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;\s*)led_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export async function sessionUser(db: Sql, req: Request): Promise<Account | null> {
  const token = sessionToken(req);
  if (!token || token.length > 200) return null;
  const row = await db.prepare(`SELECT u.id,u.name,u.email,u.role,u.active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?`)
    .bind(token, new Date().toISOString()).first<Account>();
  if (!row || !row.active) return null;
  return row;
}

export async function openSession(db: Sql, userId: string) {
  const token = bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  const created = new Date();
  const expires = new Date(created.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.prepare('INSERT INTO sessions(token,user_id,expires_at,created_at) VALUES(?,?,?,?)').bind(token, userId, expires.toISOString(), created.toISOString()).run();
  return {token, maxAge: SESSION_DAYS * 24 * 60 * 60};
}

export function sessionCookie(token: string, maxAge: number) {
  const value = token ? `led_session=${encodeURIComponent(token)}` : 'led_session=';
  return `${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
}

export async function clearSessions(db: Sql, userId: string) {
  await db.prepare('DELETE FROM sessions WHERE user_id=?').bind(userId).run();
}
