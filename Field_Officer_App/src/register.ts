import {createPrivateVault, unlockPrivateVault, privateStorage, privateStorageReady, hasPrivateVault, flushPrivateStorage, erasePrivateStorage} from './secure-storage';
export type Vendor = {
  id: string; name: string; business: string; type: 'Formal' | 'Informal'; sector: string;
  hub: string; unit: string; address: string; lat: string; lng: string; phone: string;
  email: string; issued: string; expires: string; status: string; documents: string[];
  photo: string; sample?: boolean;
  files?: {id: string; label: string; name: string; url: string; contentType: string}[];
};
export type Entry = {
  id: string; vendorId: string; kind: string; amount: number; note: string; due: string;
  createdAt: string; actor: string; resolved: number; snapshot?: string;
  gpsLat?: string; gpsLng?: string; gpsAccuracy?: string; owner?: string; reversalOf?: string;
};

const STORAGE_KEY = 'solplaatje.field.registerBase';
const TOKEN_KEY = 'solplaatje.field.token';
const USER_KEY = 'solplaatje.field.user';
const PIN_KEY = 'solplaatje.field.pin';
const PIN_ATTEMPTS_KEY = 'solplaatje.field.pinAttempts';

/** Cached vendor records and offline evidence stay behind a device PIN. */
export function hasPin() {
  return hasPrivateVault() || Boolean(localStorage.getItem(PIN_KEY));
}

export function clearPin() {
  localStorage.removeItem(PIN_KEY);
  localStorage.removeItem(PIN_ATTEMPTS_KEY);
}

export async function resetPhone() {
  await erasePrivateStorage();
  memoryToken = ''; memoryUser = null;
  const preferences = await nativePreferences();
  if (preferences) {await preferences.remove({key: TOKEN_KEY}); await preferences.remove({key: USER_KEY});}
  sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY);
  clearPin();
}

/** Verify a PIN and, on success, restore the stored session for this run. */
export async function unlockWithPin(pin: string) {
  if (!await verifyPin(pin)) return false;
  await hydrateSession();
  return true;
}

async function pinHash(pin: string, salt: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function setPin(pin: string) {
  await hydrateSession();
  await createPrivateVault(pin.trim());
  await writeProtected(memoryToken, memoryUser);
  localStorage.setItem(PIN_KEY, JSON.stringify({version: 2}));
}

export async function verifyPin(pin: string) {
  let attempts: {failures: number; blockedUntil: number} = {failures: 0, blockedUntil: 0};
  try {attempts = JSON.parse(localStorage.getItem(PIN_ATTEMPTS_KEY) || 'null') || attempts;} catch { /* use initial count */ }
  if (attempts.blockedUntil > Date.now()) throw new Error(`Too many PIN attempts. Try again in ${Math.ceil((attempts.blockedUntil - Date.now()) / 1000)} seconds.`);
  let valid = false;
  if (hasPrivateVault()) valid = await unlockPrivateVault(pin.trim());
  else {
    const raw = localStorage.getItem(PIN_KEY);
    if (!raw) return false;
    try {
      const old = JSON.parse(raw) as {salt: string; hash: string};
      valid = Boolean(old.salt && old.hash && await pinHash(pin.trim(), old.salt) === old.hash);
    } catch {valid = false;}
  }
  if (valid) localStorage.removeItem(PIN_ATTEMPTS_KEY);
  else {
    const failures = attempts.failures + 1;
    localStorage.setItem(PIN_ATTEMPTS_KEY, JSON.stringify({failures, blockedUntil: failures >= 5 ? Date.now() + 60_000 : 0}));
  }
  return valid;
}

export type FieldAccount = {id: string; name: string; email: string; role: string; mustChangePassword?: boolean};
export type Delivery = {id: string; eventId: string; method: string; status: string; actor: string; createdAt: string};

let memoryToken = '';
let memoryUser: FieldAccount | null = null;

export const money = (cents: number) => new Intl.NumberFormat('en-ZA', {style: 'currency', currency: 'ZAR', maximumFractionDigits: 2}).format(cents / 100);
export const balance = (id: string, events: Entry[]) => events.filter(event => event.vendorId === id).reduce((total, event) => {
  if (event.kind === 'Charge') return total + event.amount;
  if (event.kind === 'Payment') return total - event.amount;
  if (event.kind === 'Reversal') {
    const original = events.find(item => item.id === event.reversalOf);
    return total + (original?.kind === 'Charge' ? -event.amount : event.amount);
  }
  return total;
}, 0);
export const permit = (vendor: Vendor) => vendor.expires && vendor.expires < new Date().toISOString().slice(0, 10) ? 'Expired' : vendor.status;
export type CardRow = {status: string; cardSerial?: string; createdAt: string};
export type CardVerdict = {valid: boolean; outcome: 'current' | 'legacy' | 'replaced' | 'revoked' | 'unrecognised' | 'missing-serial'; currentSerial: string; message: string};
function cardSerial(value: string) { return value.toUpperCase().replace(/[^0-9A-Z .$/+%-]/g, ''); }
export function decideCard(cards: CardRow[], scannedSerial = ''): CardVerdict {
  const ordered = [...cards].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  let currentSerial = '', revoked = false;
  const retired = new Set<string>();
  for (const card of ordered) {
    const serial = cardSerial(card.cardSerial || '');
    if (card.status === 'revoked') { if (currentSerial) retired.add(currentSerial); currentSerial = ''; revoked = true; }
    else if ((card.status === 'issued' || card.status === 'replacement') && serial) { if (currentSerial && currentSerial !== serial) retired.add(currentSerial); currentSerial = serial; revoked = false; }
  }
  const scanned = cardSerial(scannedSerial);
  if (revoked && !currentSerial) {
    if (!scanned || retired.has(scanned)) return {valid: false, outcome: 'revoked', currentSerial: '', message: 'This permit card has been revoked and is not a valid card.'};
    return {valid: false, outcome: 'unrecognised', currentSerial: '', message: 'This serial is not a card recorded for this vendor. The permit is revoked.'};
  }
  if (!scanned) {
    if (currentSerial) return {valid: false, outcome: 'missing-serial', currentSerial, message: 'This card has no serial. The current card is ' + currentSerial + '.'};
    if (retired.size) return {valid: false, outcome: 'revoked', currentSerial: '', message: 'Earlier cards were replaced or revoked, and no current card serial is on record.'};
    return {valid: true, outcome: 'legacy', currentSerial: '', message: 'No card serial is on record. The vendor ID is the only identifier on this card.'};
  }
  if (currentSerial && scanned === currentSerial) return {valid: true, outcome: 'current', currentSerial, message: 'This is the current card.'};
  if (retired.has(scanned)) return {valid: false, outcome: currentSerial ? 'replaced' : 'revoked', currentSerial, message: currentSerial ? 'This card was replaced. The current serial is ' + currentSerial + '.' : 'This card was replaced or revoked and is not valid.'};
  return {valid: false, outcome: 'unrecognised', currentSerial, message: 'This serial is not a card recorded for this vendor.'};
}

export function getRegisterBase() {
  return localStorage.getItem(STORAGE_KEY) || '';
}

function localHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '10.0.2.2') return true;
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  if (parts[0] === 10 || parts[0] === 127) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
}

export function saveRegisterBase(raw: string) {
  const value = raw.trim();
  if (!value) throw new Error('Enter the vendor register address.');
  let withProtocol = value;
  if (!/^https?:\/\//i.test(value)) {
    const host = value.split('/')[0].split(':')[0];
    withProtocol = `${localHost(host) ? 'http' : 'https'}://${value}`;
  }
  const url = new URL(withProtocol);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Use an http or https address.');
  if (url.protocol === 'http:' && !localHost(url.hostname)) throw new Error('Use https:// for a public vendor register address.');
  const base = url.origin;
  localStorage.setItem(STORAGE_KEY, base);
  return base;
}

async function nativePreferences() {
  const capacitor = (globalThis as {Capacitor?: {isNativePlatform?: () => boolean}}).Capacitor;
  if (!capacitor?.isNativePlatform?.()) return null;
  const module = await import('@capacitor/preferences');
  return module.Preferences;
}

async function writeProtected(token: string, user: FieldAccount | null) {
  if (!privateStorageReady()) throw new Error('Unlock or create the encrypted phone vault before signing in.');
  if (token) privateStorage.setItem(TOKEN_KEY, token); else privateStorage.removeItem(TOKEN_KEY);
  if (user) privateStorage.setItem(USER_KEY, JSON.stringify(user)); else privateStorage.removeItem(USER_KEY);
  await flushPrivateStorage();
  // Remove legacy plaintext credentials only after the encrypted commit succeeds.
  const preferences = await nativePreferences();
  if (preferences) {await preferences.remove({key: TOKEN_KEY}); await preferences.remove({key: USER_KEY});}
  localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY);
}

export async function hydrateSession() {
  if (hasPrivateVault() && !privateStorageReady()) return;
  const preferences = await nativePreferences();
  const oldToken = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || (preferences ? (await preferences.get({key: TOKEN_KEY})).value : '') || '';
  const oldUser = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY) || (preferences ? (await preferences.get({key: USER_KEY})).value : '') || '';
  memoryToken = privateStorage.getItem(TOKEN_KEY) || oldToken;
  const raw = privateStorage.getItem(USER_KEY) || oldUser;
  memoryUser = raw ? JSON.parse(raw) as FieldAccount : null;
  if (privateStorageReady() && (oldToken || oldUser)) await writeProtected(memoryToken, memoryUser);
}

export function getToken() {
  return memoryToken;
}

export function getSession(): FieldAccount | null {
  return memoryUser;
}

export function saveSession(token: string, user: FieldAccount) {
  memoryToken = token;
  memoryUser = user;
  return writeProtected(token, user);
}

export async function clearSession() {
  memoryToken = ''; memoryUser = null;
  if (privateStorageReady()) await writeProtected('', null);
  else {
    const preferences = await nativePreferences();
    if (preferences) {await preferences.remove({key: TOKEN_KEY}); await preferences.remove({key: USER_KEY});}
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY);
  }
}

export function authHeaders(json = false): HeadersInit {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

/** Raised when the saved sign-in is no longer accepted, so the app can return to sign-in. */
export class SessionExpiredError extends Error {
  constructor(message = 'Your sign-in has expired. Sign in again to open this file.') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export async function openProtected(path: string) {
  const base = getRegisterBase();
  const response = await fetch(base + path, {cache: 'no-store', headers: authHeaders()});
  if (response.status === 401 || response.status === 403) {
    const body = await response.json().catch(() => ({} as {error?: string}));
    throw new SessionExpiredError(body?.error || undefined);
  }
  if (!response.ok) throw new Error('Could not open this file.');
  const blob = await response.blob();
  const filename = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '')?.[1] || 'document';
  await saveBlob(blob, filename);
}

async function saveBlob(blob: Blob, filename: string) {
  const file = new File([blob], filename, {type: blob.type || 'application/octet-stream'});
  const native = (globalThis as {Capacitor?: {isNativePlatform?: () => boolean}}).Capacitor?.isNativePlatform?.();
  if (native) {
    const [{Filesystem, Directory}, {Share}] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const written = await Filesystem.writeFile({path: filename, data, directory: Directory.Cache});
    await Share.share({title: filename, url: written.uri, dialogTitle: 'Share notice'});
    return;
  }
  if (navigator.share && navigator.canShare?.({files: [file]})) {
    await navigator.share({files: [file], title: filename});
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function noticeVendor(vendor: Vendor, entry: Entry): Vendor {
  if (!entry.snapshot) return vendor;
  try {
    const snap = JSON.parse(entry.snapshot) as Partial<Vendor>;
    return {...vendor, ...snap, id: vendor.id};
  } catch {
    return vendor;
  }
}

export function noticeText(vendor: Vendor, entry: Entry) {
  vendor = noticeVendor(vendor, entry);
  return [
    'SOL PLAATJE MUNICIPALITY',
    'LOCAL ECONOMIC DEVELOPMENT OFFICE',
    `${entry.kind.toUpperCase()} NOTICE`,
    vendor.sample ? 'SAMPLE NOTICE - NOT A MUNICIPAL ENFORCEMENT NOTICE' : '',
    entry.kind === 'Violation'
      ? 'APPROVED TEMPLATE - VIOLATION NOTICE\nThe LED Office records that a site visit found a trading condition was not met. The findings below are the official record of what was observed and the action the trader must take. This notice does not set a fine, cancel a permit, or confirm that an email was delivered.'
      : entry.kind === 'Warning'
        ? 'APPROVED TEMPLATE - WARNING NOTICE\nThe LED Office records that a site visit requires the trader to correct the findings below before the follow-up date. This notice does not set a fine or confirm that an email was delivered.'
        : '',
    '',
    `Notice reference: ${entry.id}`,
    `Recorded: ${new Date(entry.createdAt).toLocaleString('en-ZA', {timeZone: 'Africa/Johannesburg'})}`,
    `Officer / recorded by: ${entry.actor}`,
    `Vendor ID: ${vendor.id}`,
    `Vendor: ${vendor.name}`,
    `Business: ${vendor.business}`,
    `Trading type: ${vendor.type}`,
    `Location: ${vendor.type === 'Formal' ? `${vendor.hub} — Unit ${vendor.unit}` : `${vendor.address} — Pitch ${vendor.unit}`}`,
    '',
    'FINDINGS AND ACTION REQUIRED',
    entry.note,
    '',
    `Follow-up date: ${entry.due || 'Not specified'}`,
    `Case status: ${entry.resolved ? 'Resolved' : 'Open'}`,
    '',
    'Please contact the LED Office to discuss this notice or provide the requested information.',
    'An email draft is a fallback. It is not a delivery record until an official records handover, acknowledgement, or an accepted municipal send.',
  ].filter(line => line !== undefined).join('\n');
}

export function noticeEmail(vendor: Vendor, entry: Entry) {
  const recipient = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(vendor.email) ? vendor.email : '';
  return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(`Sol Plaatje LED ${entry.kind.toLowerCase()} — ${vendor.id}`)}&body=${encodeURIComponent(noticeText(vendor, entry))}`;
}
