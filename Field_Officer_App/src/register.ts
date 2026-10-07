export type Vendor = {
  id: string; name: string; business: string; type: 'Formal' | 'Informal'; sector: string;
  hub: string; unit: string; address: string; lat: string; lng: string; phone: string;
  email: string; issued: string; expires: string; status: string; documents: string[];
  photo: string; sample?: boolean;
  files?: {id: string; label: string; name: string; url: string; contentType: string}[];
};
export type Entry = {
  id: string; vendorId: string; kind: string; amount: number; note: string; due: string;
  createdAt: string; actor: string; resolved: number;
};

const STORAGE_KEY = 'solplaatje.field.registerBase';
const TOKEN_KEY = 'solplaatje.field.token';
const USER_KEY = 'solplaatje.field.user';

export type FieldAccount = {id: string; name: string; email: string; role: string};

export const money = (cents: number) => new Intl.NumberFormat('en-ZA', {style: 'currency', currency: 'ZAR', maximumFractionDigits: 2}).format(cents / 100);
export const balance = (id: string, events: Entry[]) => events.filter(event => event.vendorId === id).reduce((total, event) => total + (event.kind === 'Charge' ? event.amount : event.kind === 'Payment' ? -event.amount : 0), 0);
export const permit = (vendor: Vendor) => vendor.expires && vendor.expires < new Date().toISOString().slice(0, 10) ? 'Expired' : vendor.status;

export function getRegisterBase() {
  return localStorage.getItem(STORAGE_KEY) || '';
}

export function saveRegisterBase(raw: string) {
  const value = raw.trim();
  if (!value) throw new Error('Enter the vendor register address.');
  const withProtocol = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  const url = new URL(withProtocol);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Use an http or https address.');
  const base = url.origin;
  localStorage.setItem(STORAGE_KEY, base);
  return base;
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function getSession(): FieldAccount | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function saveSession(token: string, user: FieldAccount) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function authHeaders(json = false): HeadersInit {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

export function photoUrl(photo: string) {
  if (!photo) return '';
  if (/^https?:\/\//i.test(photo)) return photo;
  const base = getRegisterBase();
  return base ? base + (photo.startsWith('/') ? photo : `/${photo}`) : photo;
}

export function noticeText(vendor: Vendor, entry: Entry) {
  return [
    'SOL PLAATJE MUNICIPALITY',
    'LOCAL ECONOMIC DEVELOPMENT OFFICE',
    `${entry.kind.toUpperCase()} NOTICE`,
    vendor.sample ? 'SAMPLE NOTICE — NOT A MUNICIPAL ENFORCEMENT NOTICE' : '',
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
  ].filter(line => line !== undefined).join('\n');
}

export function noticeEmail(vendor: Vendor, entry: Entry) {
  const recipient = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(vendor.email) ? vendor.email : '';
  return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(`Sol Plaatje LED ${entry.kind.toLowerCase()} — ${vendor.id}`)}&body=${encodeURIComponent(noticeText(vendor, entry))}`;
}
