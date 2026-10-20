/** Encrypted offline store. Keys and decoded records exist only while unlocked. */
export const VAULT_KEY = 'solplaatje.field.encryptedVault';
const LEGACY_KEYS = ['visitDrafts', 'visitQueue', 'vendorCache', 'visitHistory', 'token', 'user'].map(key => 'solplaatje.field.' + key);
const ITERATIONS = 600_000;
type Envelope = {version: 1; iterations: number; salt: string; iv: string; ciphertext: string};
type DeviceEnvelope = {version: 1; device: string};
type DeviceVault = {seal(input: {value: string}): Promise<{value: string}>; open(input: {value: string}): Promise<{value: string}>};
let values: Record<string, string> = {};
let key: CryptoKey | null = null;
let salt = '';
let pending: Promise<void> = Promise.resolve();
let failure: Error | null = null;
let epoch = 0;

const encode = (bytes: Uint8Array) => {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
};
const decode = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));
async function deviceVault(): Promise<DeviceVault | null> {
  if (!(globalThis as {Capacitor?: {isNativePlatform?: () => boolean}}).Capacitor?.isNativePlatform?.()) return null;
  const {registerPlugin} = await import('@capacitor/core');
  return registerPlugin<DeviceVault>('DeviceVault');
}
async function derive(pin: string, saltBytes: Uint8Array<ArrayBuffer>, iterations: number) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256'}, material, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
}
async function persist(snapshot: Record<string, string>, activeKey: CryptoKey, activeSalt: string, expectedEpoch: number) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(VAULT_KEY)}, activeKey, new TextEncoder().encode(JSON.stringify(snapshot)));
  const envelope: Envelope = {version: 1, iterations: ITERATIONS, salt: activeSalt, iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext))};
  const device = await deviceVault();
  const serialized = JSON.stringify(envelope);
  const stored = device ? JSON.stringify({version: 1, device: (await device.seal({value: serialized})).value} satisfies DeviceEnvelope) : serialized;
  if (epoch !== expectedEpoch) return;
  localStorage.setItem(VAULT_KEY, stored);
}
function enqueue() {
  if (!key) throw new Error('Unlock the phone before saving offline data.');
  const activeKey = key, activeSalt = salt, snapshot = {...values}, expectedEpoch = epoch;
  pending = pending.catch(() => {}).then(() => persist(snapshot, activeKey, activeSalt, expectedEpoch)).catch(cause => {
    failure = cause instanceof Error ? cause : new Error('Encrypted phone storage is unavailable.');
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('field-storage-error', {detail: failure.message}));
    throw failure;
  });
  // UI writes are synchronous; explicit durability boundaries call flush below.
  void pending.catch(() => {});
}
export function hasPrivateVault() {return Boolean(localStorage.getItem(VAULT_KEY));}
export function privateStorageReady() {return Boolean(key);}
export const privateStorage = {
  getItem(name: string) {return key ? values[name] ?? null : null;},
  setItem(name: string, value: string) {
    if (!key) throw new Error('Unlock the phone before saving offline data.');
    if (values[name] === value) return;
    values[name] = value;
    enqueue();
  },
  removeItem(name: string) {
    if (!key) throw new Error('Unlock the phone before clearing offline data.');
    if (!(name in values)) return;
    delete values[name];
    enqueue();
  },
};
export async function flushPrivateStorage() {
  for (;;) {
    const current = pending;
    await current;
    if (current === pending) break;
  }
  if (failure) throw failure;
}
export async function createPrivateVault(pin: string) {
  if (!/^\d{6,12}$/.test(pin)) throw new Error('Choose a PIN of 6 to 12 digits.');
  if (hasPrivateVault()) throw new Error('Unlock or reset this phone before changing its PIN.');
  const migrated: Record<string, string> = {};
  for (const name of LEGACY_KEYS) {
    const value = localStorage.getItem(name);
    if (value !== null) migrated[name] = value;
  }
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const candidate = await derive(pin, saltBytes, ITERATIONS);
  const newSalt = encode(saltBytes);
  await persist(migrated, candidate, newSalt, epoch);
  key = candidate; salt = newSalt; values = migrated; failure = null;
  for (const name of LEGACY_KEYS) localStorage.removeItem(name);
}
export async function unlockPrivateVault(pin: string) {
  const stored = localStorage.getItem(VAULT_KEY);
  if (!stored) return false;
  let parsed = JSON.parse(stored) as Envelope | DeviceEnvelope;
  if ('device' in parsed) {
    const device = await deviceVault();
    if (!device) throw new Error('This vault belongs to its original Android device.');
    parsed = JSON.parse((await device.open({value: parsed.device})).value) as Envelope;
  }
  if (parsed.version !== 1 || parsed.iterations !== ITERATIONS || !parsed.salt || !parsed.iv || !parsed.ciphertext) throw new Error('The encrypted phone data is invalid. Reset only after recovering unsent records.');
  const candidate = await derive(pin, decode(parsed.salt), parsed.iterations);
  let plaintext: ArrayBuffer;
  try {plaintext = await crypto.subtle.decrypt({name: 'AES-GCM', iv: decode(parsed.iv), additionalData: new TextEncoder().encode(VAULT_KEY)}, candidate, decode(parsed.ciphertext));}
  catch {return false;}
  const decoded: unknown = JSON.parse(new TextDecoder().decode(plaintext));
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded) || Object.values(decoded).some(value => typeof value !== 'string')) throw new Error('The encrypted phone data is invalid.');
  key = candidate; salt = parsed.salt; values = decoded as Record<string, string>; failure = null;
  return true;
}
export async function lockPrivateStorage() {
  try {await flushPrivateStorage();}
  finally {epoch++; key = null; salt = ''; values = {};}
}
export async function erasePrivateStorage() {
  epoch++;
  await pending.catch(() => {});
  key = null; salt = ''; values = {}; failure = null; pending = Promise.resolve();
  localStorage.removeItem(VAULT_KEY);
  for (const name of LEGACY_KEYS) localStorage.removeItem(name);
}
