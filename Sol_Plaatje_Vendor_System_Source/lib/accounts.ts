const SESSION_DAYS = 12;
const DUMMY_HASH = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export type Account = {id: string; name: string; email: string; role: string; active: number; mustChangePassword?: number};

type Sql = {
  prepare: (query: string) => {
    bind: (...args: unknown[]) => SqlStatement;
    first: <T = Record<string, unknown>>() => Promise<T | null>;
    all: <T = Record<string, unknown>>() => Promise<{results: T[]}>;
    run: () => Promise<unknown>;
  };
};

type SqlStatement = {
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<{results: T[]}>;
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

export async function checkPassword(password: string, stored: string | undefined) {
  return verifyPassword(password, stored || DUMMY_HASH);
}

export function publicAccount(account: Account) {
  return {id: account.id, name: account.name, email: account.email, role: account.role, mustChangePassword: Number(account.mustChangePassword) === 1};
}

export function passwordPending(account: Account) {
  return Number(account.mustChangePassword) === 1;
}


export function requestIsSecure(req: Request) {
  const forwarded = (req.headers.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  if (forwarded === 'https') return true;
  if (forwarded === 'http') return false;
  return new URL(req.url).protocol === 'https:';
}

export function isLocalHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '10.0.2.2') return true;
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  if (parts[0] === 10 || parts[0] === 127) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
}

export function clientIp(req: Request) {
  return (req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim().slice(0, 80) || 'local';
}

export function sessionToken(req: Request) {
  const header = req.headers.get('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  const cookie = req.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;\s*)led_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export async function sessionUser(db: Sql, req: Request): Promise<Account | null> {
  const token = sessionToken(req);
  if (!token || token.length > 200) return null;
  const row = await db.prepare(`SELECT u.id,u.name,u.email,u.role,u.active,u.must_change_password AS mustChangePassword FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?`)
    .bind(token, new Date().toISOString()).first<Account>();
  if (!row || !row.active) return null;
  return row;
}

export async function openSession(db: Sql, userId: string, device = '') {
  const token = bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  const created = new Date();
  const expires = new Date(created.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.prepare('INSERT INTO sessions(token,user_id,expires_at,created_at,device) VALUES(?,?,?,?,?)').bind(token, userId, expires.toISOString(), created.toISOString(), device.slice(0, 160)).run();
  return {token, maxAge: SESSION_DAYS * 24 * 60 * 60};
}

export function sessionCookie(token: string, maxAge: number, secure = false) {
  const value = token ? `led_session=${encodeURIComponent(token)}` : 'led_session=';
  return `${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export async function clearSessions(db: Sql, userId: string) {
  await db.prepare('DELETE FROM sessions WHERE user_id=?').bind(userId).run();
}

export async function clearOtherSessions(db: Sql, userId: string, token: string) {
  await db.prepare('DELETE FROM sessions WHERE user_id=? AND token<>?').bind(userId, token).run();
}
