import {privateStorage, privateStorageReady, flushPrivateStorage, lockPrivateStorage} from './secure-storage';
import {useEffect, useRef, useState} from 'react';
import {ScanLine, Search, X, MapPin, ShieldCheck, Wallet, ChevronLeft, Camera, Check, LocateFixed, Wifi, Building2, ClipboardCheck, Loader2, Mail, LogOut} from 'lucide-react';
import {Vendor, Entry, Delivery, money, balance, permit, decideCard, getRegisterBase, saveRegisterBase, getToken, getSession, saveSession, clearSession, authHeaders, noticeEmail, noticeText, hydrateSession, openProtected, SessionExpiredError, hasPin, setPin, unlockWithPin, resetPhone, FieldAccount} from './register';

type VisitGPS = {lat: number; lng: number; accuracy: number};
type QueueItem = {officialId: string; registerBase: string; payload: any; state: 'waiting' | 'rejected'; error: string};
type HistoryItem = {at: string; action: 'dismissed' | 'sent' | 'corrected' | 'cleared'; vendorId: string; kind: string; detail: string};

const date = (value: string) => new Date(value.length === 10 ? value + 'T12:00:00' : value).toLocaleDateString('en-ZA', {day: 'numeric', month: 'short', year: 'numeric'});

export function App() {
  const [serverDraft, setServerDraft] = useState(getRegisterBase);
  const [session, setSession] = useState<FieldAccount | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [id, setId] = useState('');
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [events, setEvents] = useState<Entry[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('Profile');
  const [visit, setVisit] = useState(false);
  const [kind, setKind] = useState('Inspection');
  const [note, setNote] = useState('');
  const [due, setDue] = useState('');
  const [gps, setGPS] = useState<VisitGPS | null>(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState('');
  const [scannerMessage, setScannerMessage] = useState('Starting the camera…');
  const video = useRef<HTMLVideoElement | null>(null);
  const visitKey = useRef('');
  const [portrait, setPortrait] = useState('');
  const [senderConnected, setSenderConnected] = useState(false);
  const [noticeBusy, setNoticeBusy] = useState('');
  const [queued, setQueued] = useState(0);
  const [rejected, setRejected] = useState<QueueItem[]>([]);
  const [held, setHeld] = useState<QueueItem[]>([]);
  const [waiting, setWaiting] = useState<QueueItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [recovery, setRecovery] = useState(false);
  const [cardWarning, setCardWarning] = useState('');
  const [pinReady, setPinReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [pinDraft, setPinDraft] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState('');
  const [recordStale, setRecordStale] = useState('');
  const activeVendor = useRef('');
  const noticeLock = useRef('');
  const syncLock = useRef(false);
  const correcting = useRef<{key: string; payload: any} | null>(null);

  useEffect(() => {
    const report = () => setError('Encrypted phone storage could not be saved. Keep the app open and check available space before retrying.');
    window.addEventListener('field-storage-error', report);
    return () => window.removeEventListener('field-storage-error', report);
  }, []);

  function accountScope() {
    return (getRegisterBase() || '') + '|' + (getSession()?.id || '');
  }
  function readDraftStore() {
    try { return JSON.parse(privateStorage.getItem('solplaatje.field.visitDrafts') || '{}'); } catch { return {}; }
  }
  function readDrafts() {
    const mine = readDraftStore()[accountScope()];
    return mine && typeof mine === 'object' && !Array.isArray(mine) && !('note' in mine) ? mine : {};
  }
  function writeDrafts(mine: Record<string, any>) {
    const all = readDraftStore();
    all[accountScope()] = mine;
    privateStorage.setItem('solplaatje.field.visitDrafts', JSON.stringify(all));
  }
  function stashDraft(vendorId?: string) {
    if (!vendorId || !getSession()?.id) return;
    const drafts = readDrafts();
    if (!note.trim() && !due && !gps) delete drafts[vendorId];
    else {
      if (!visitKey.current) visitKey.current = crypto.randomUUID();
      drafts[vendorId] = {note, due, kind, gps, key: visitKey.current};
    }
    writeDrafts(drafts);
  }
  function readQueue(): QueueItem[] {
    try {
      const parsed = JSON.parse(privateStorage.getItem('solplaatje.field.visitQueue') || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item: any) => item?.payload && item.officialId !== undefined ? item : {officialId: '', registerBase: '', payload: item, state: 'rejected' as const, error: 'This visit was saved before it was tied to an official and register. It was not sent.'});
    } catch { return []; }
  }
  function ownQueue(items = readQueue()) {
    const officialId = getSession()?.id || '';
    const base = getRegisterBase();
    return items.filter(item => item.officialId === officialId && item.registerBase === base);
  }
  function writeQueue(items: QueueItem[]) {
    if (!privateStorageReady()) return;
    privateStorage.setItem('solplaatje.field.visitQueue', JSON.stringify(items));
    const mine = ownQueue(items);
    setWaiting(mine.filter(item => item.state === 'waiting'));
    setQueued(mine.filter(item => item.state === 'waiting').length);
    setRejected(mine.filter(item => item.state === 'rejected'));
    setHeld(items.filter(item => !item.officialId || !item.registerBase));
    setHistory(readHistory());
  }
  function readCache(vendorId: string) {
    try { return JSON.parse(privateStorage.getItem('solplaatje.field.vendorCache') || '{}')[accountScope()]?.[vendorId] || null; } catch { return null; }
  }
  function writeCache(vendorId: string, value: unknown) {
    if (!getSession()?.id) return;
    const all = JSON.parse(privateStorage.getItem('solplaatje.field.vendorCache') || '{}');
    all[accountScope()] = {...(all[accountScope()] || {}), [vendorId]: value};
    privateStorage.setItem('solplaatje.field.vendorCache', JSON.stringify(all));
  }
  function readHistory(): HistoryItem[] {
    try {
      const all = JSON.parse(privateStorage.getItem('solplaatje.field.visitHistory') || '{}');
      return Array.isArray(all[accountScope()]) ? all[accountScope()] : [];
    } catch { return []; }
  }
  function pushHistory(item: Omit<HistoryItem, 'at'>) {
    const all = JSON.parse(privateStorage.getItem('solplaatje.field.visitHistory') || '{}');
    const mine = [{at: new Date().toISOString(), ...item}, ...(Array.isArray(all[accountScope()]) ? all[accountScope()] : [])].slice(0, 100);
    all[accountScope()] = mine;
    privateStorage.setItem('solplaatje.field.visitHistory', JSON.stringify(all));
    setHistory(mine);
  }
  function restoreDraft(vendorId: string) {
    const draft = readDrafts()[vendorId];
    setNote(draft?.note || '');
    setDue(draft?.due || '');
    setKind(draft?.kind || 'Inspection');
    setGPS(draft?.gps || null);
    visitKey.current = draft?.key || '';
    setVisit(Boolean(draft?.note || draft?.due || draft?.gps));
  }
  function applyRejectedVisit(payload: any) {
    const vendorId = payload?.vendorId || '';
    setKind(payload?.kind || 'Inspection');
    setNote(String(payload?.note || '').split('\nVisit GPS')[0]);
    setDue(payload?.due || '');
    visitKey.current = payload?.idempotencyKey || crypto.randomUUID();
    const lat = Number(payload?.gpsLat);
    const lng = Number(payload?.gpsLng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && String(payload?.gpsLat || '') && String(payload?.gpsLng || '')) {
      setGPS({lat, lng, accuracy: Number(payload?.gpsAccuracy) || 0});
    } else setGPS(null);
    setVisit(true);
    if (vendorId) {
      const drafts = readDrafts();
      delete drafts[vendorId];
      writeDrafts(drafts);
    }
  }
  function visitKeyOf(item: QueueItem) {
    return String(item.payload?.idempotencyKey || '');
  }
  function mergeVisit(items: QueueItem[], officialId: string, key: string, next: QueueItem | null) {
    const without = items.filter(item => !(item.officialId === officialId && visitKeyOf(item) === key));
    return next ? [...without, next] : without;
  }
  function classifySyncResponse(status: number, body: any): {state: 'waiting' | 'rejected'; error: string; sessionExpired?: boolean} {
    if (status === 401 || status === 403) return {state: 'waiting', error: 'Sign-in expired. Sign in again, then retry. The visit was not discarded.', sessionExpired: true};
    if (status === 429 || status >= 500) return {state: 'waiting', error: 'Temporary register problem (' + status + '). Kept waiting for retry.'};
    return {state: 'rejected', error: body?.error || ('The register rejected this visit (' + status + ').')};
  }
  async function syncQueue(manual = false) {
    if (syncLock.current || locked || !privateStorageReady()) return;
    const base = getRegisterBase();
    const officialId = getSession()?.id || '';
    if (!base || !getToken() || !officialId) return;
    syncLock.current = true;
    let sent = 0;
    let attempted = 0;
    let sessionStopped = false;
    try {
      const snapshot = readQueue().filter(item => item.officialId === officialId && item.registerBase === base && item.state === 'waiting' && item.payload?.action);
      for (const item of snapshot) {
        const key = visitKeyOf(item);
        if (!key) continue;
        const live = readQueue().find(row => row.officialId === officialId && visitKeyOf(row) === key);
        if (!live || live.state !== 'waiting') continue;
        attempted++;
        try {
          const response = await fetch(base + '/api/register', {method: 'POST', headers: authHeaders(true), body: JSON.stringify(live.payload)});
          const body = await response.json().catch(() => ({}));
          const current = readQueue();
          if (response.ok) {
            sent++;
            pushHistory({action: 'sent', vendorId: live.payload?.vendorId || '', kind: live.payload?.kind || 'Visit', detail: 'Accepted by the register.'});
            writeQueue(mergeVisit(current, officialId, key, null));
            continue;
          }
          const outcome = classifySyncResponse(response.status, body);
          writeQueue(mergeVisit(current, officialId, key, {...live, state: outcome.state, error: outcome.error}));
          if (outcome.sessionExpired) {
            sessionStopped = true;
            clearSession();
            setSession(null);
            setNotice('Sign-in expired. Visits still waiting on this phone are kept until you sign in again.');
            break;
          }
        } catch {
          const current = readQueue();
          const still = current.find(row => row.officialId === officialId && visitKeyOf(row) === key);
          if (still) writeQueue(mergeVisit(current, officialId, key, {...still, state: 'waiting', error: still.error || ''}));
        }
      }
      if (!sessionStopped && (manual || attempted)) {
        if (attempted && sent === attempted) setNotice('Queued visits were sent to the register.');
        else if (sent) setNotice(sent + ' queued visit' + (sent === 1 ? '' : 's') + ' sent. Rejected visits stay until you correct or dismiss them.');
        else if (manual && !attempted) setNotice('No waiting visits to retry.');
      }
    } finally {
      syncLock.current = false;
      writeQueue(readQueue());
    }
  }
  function openRecovery() {
    writeQueue(readQueue());
    setHistory(readHistory());
    setRecovery(true);
  }
  async function clearPhoneData() {
    const officialId = getSession()?.id || '';
    const base = getRegisterBase();
    const scope = accountScope();
    for (const key of ['solplaatje.field.visitDrafts', 'solplaatje.field.vendorCache', 'solplaatje.field.visitHistory']) {
      try {
        const all = JSON.parse(privateStorage.getItem(key) || '{}');
        if (all && typeof all === 'object' && !Array.isArray(all)) {
          delete all[scope];
          privateStorage.setItem(key, JSON.stringify(all));
        }
      } catch { /* keep going */ }
    }
    writeQueue(readQueue().filter(item => !(item.officialId === officialId && item.registerBase === base)));
    activeVendor.current = '';
    correcting.current = null;
    visitKey.current = '';
    setVendor(null);
    setEvents([]);
    setDeliveries([]);
    setNote('');
    setDue('');
    setGPS(null);
    setKind('Inspection');
    setVisit(false);
    setId('');
    setCardWarning('');
    setRecordStale('');
    setHistory([]);
    setError('');
    try {
      await flushPrivateStorage();
      setNotice('Phone copies for this official were cleared, including the open vendor, notes, GPS and any correction. Sign out other devices from the register if the phone is lost.');
    } catch {
      setNotice('');
      setError('Phone data could not be fully cleared because encrypted storage did not finish saving. Try again.');
    }
  }

  function requireServer() {
    const base = getRegisterBase();
    if (!base) {
      setError('Save the vendor register address before looking up a card.');
      return '';
    }
    return base;
  }

  async function lookup(raw: string) {
    setError('');
    setNotice('');
    setRecordStale('');
    const base = requireServer();
    if (!base) return;
    let value = raw.trim();
    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        value = url.searchParams.get('vendorId') || url.searchParams.get('id') || '';
      } catch {
        setError('This code is not a vendor ID. Enter the ID printed on the card.');
        return;
      }
    }
    let cardSerial = '';
    const plus = value.indexOf('+');
    if (plus > 0) { cardSerial = value.slice(plus + 1).toUpperCase().replace(/[^0-9A-Z .$/+%-]/g, ''); value = value.slice(0, plus); }
    value = value.toUpperCase();
    setId(value);
    if (!/^SPM-[A-Z0-9-]{3,60}$/.test(value)) {
      setError('Enter or scan the SPM vendor ID printed on the card.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`${base}/api/register?vendorId=${encodeURIComponent(value)}`, {cache: 'no-store', headers: authHeaders()});
      const body = await response.json();
      if (response.status === 401) { clearSession(); setSession(null); }
      if (!response.ok) throw new Error(body.error || 'Unable to load this vendor');
      const verdict = decideCard(Array.isArray(body.cards) ? body.cards : [], cardSerial);
      if (cardSerial && !verdict.valid) throw new Error(verdict.message);
      if (activeVendor.current && activeVendor.current !== body.vendor.id) stashDraft(activeVendor.current);
      activeVendor.current = body.vendor.id;
      setVendor(body.vendor);
      setEvents(body.events);
      setDeliveries(Array.isArray(body.deliveries) ? body.deliveries : []);
      setSenderConnected(Boolean(body.senderConnected));
      setTab('Profile');
      writeCache(body.vendor.id, {vendor: body.vendor, events: body.events, deliveries: body.deliveries || [], cards: body.cards || [], savedAt: new Date().toISOString()});
      if (correcting.current && correcting.current.payload?.vendorId === body.vendor.id) applyRejectedVisit(correcting.current.payload);
      else restoreDraft(body.vendor.id);
      const warn = (!verdict.valid || ['revoked', 'replaced', 'unrecognised', 'missing-serial'].includes(verdict.outcome)) ? verdict.message : '';
      setCardWarning(warn);
      setNotice(warn ? '' : (verdict.outcome === 'legacy' ? verdict.message : ''));
    } catch (cause) {
      if (cause instanceof TypeError) {
        const cached = readCache(value);
        if (cached?.vendor) {
          const verdict = decideCard(Array.isArray(cached.cards) ? cached.cards : [], cardSerial);
          if (cardSerial && !verdict.valid) {
            setVendor(null);
            setCardWarning(verdict.message);
            setError(verdict.message + ' Checked against the card history saved on this phone' + (cached.savedAt ? ' on ' + date(cached.savedAt) : '') + '.');
            return;
          }
          if (activeVendor.current && activeVendor.current !== cached.vendor.id) stashDraft(activeVendor.current);
          activeVendor.current = cached.vendor.id;
          setVendor(cached.vendor);
          setEvents(cached.events || []);
          setDeliveries(cached.deliveries || []);
          if (correcting.current && correcting.current.payload?.vendorId === cached.vendor.id) applyRejectedVisit(correcting.current.payload);
          else restoreDraft(cached.vendor.id);
          const warn = (!verdict.valid || ['revoked', 'replaced', 'unrecognised', 'missing-serial'].includes(verdict.outcome)) ? verdict.message : '';
          setCardWarning(warn);
          setRecordStale('Offline copy saved on this phone' + (cached.savedAt ? ' on ' + date(cached.savedAt) : '') + '. Card validity uses that saved card history. Do not treat this copy as the current register record.');
          setNotice('');
          return;
        }
      }
      setVendor(null);
      setCardWarning('');
      setRecordStale('');
      if (correcting.current) correcting.current = null;
      setError(cause instanceof Error ? cause.message : 'Could not load the vendor. Check the register address and your connection.');
    } finally {
      setBusy(false);
    }
  }

  async function refreshRecord(vendorId: string) {
    const base = getRegisterBase();
    if (!base) return;
    const response = await fetch(`${base}/api/register?vendorId=${encodeURIComponent(vendorId)}`, {cache: 'no-store', headers: authHeaders()});
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Could not refresh this vendor');
    setEvents(body.events);
    setDeliveries(Array.isArray(body.deliveries) ? body.deliveries : []);
  }

  useEffect(() => {
    if (!vendor) return;
    stashDraft(vendor.id);
  }, [vendor?.id, note, due, kind, gps]);

  useEffect(() => {
    if (locked || !privateStorageReady()) return;
    writeQueue(readQueue());
    void syncQueue(false);
    const onOnline = () => { void syncQueue(false); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [session?.id, locked, pinReady]);

  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    let handled = false;
    let controls: {stop: () => void} | undefined;
    setScannerMessage('Starting the camera…');
    (async () => {
      try {
        const {BrowserMultiFormatReader} = await import('@zxing/browser');
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromConstraints(
          {audio: false, video: {facingMode: {ideal: 'environment'}, width: {ideal: 1280}, height: {ideal: 720}}},
          video.current!,
          result => {
            if (result && !handled && !cancelled) {
              handled = true;
              setScanning(false);
              lookup(result.getText());
            }
          },
        );
        if (cancelled) controls.stop();
        else setScannerMessage('Keep the entire barcode inside the frame. Move back slightly if it is blurry.');
      } catch {
        if (!cancelled) setScannerMessage('Camera unavailable. Allow camera access for this app, or enter the vendor ID manually.');
      }
    })();
    return () => {
      cancelled = true;
      controls?.stop();
      const stream = video.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach(track => track.stop());
    };
  }, [scanning]);

  async function saveVisit(event: React.FormEvent) {
    event.preventDefault();
    if (!vendor) return;
    const base = requireServer();
    if (!base) return;
    if (!note.trim()) {
      setError('Enter the visit findings and action required.');
      return;
    }
    if (!visitKey.current) visitKey.current = crypto.randomUUID();
    setBusy(true);
    setError('');
    const details = note.trim() + (gps
      ? `\nVisit GPS: ${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}; device accuracy approximately ${Math.round(gps.accuracy)} m. This is the visit position, not a change to the registered pitch.`
      : '\nVisit GPS not captured.');
    const payload = {action: 'event', vendorId: vendor.id, kind, note: details, due, amount: 0, idempotencyKey: visitKey.current, gpsLat: gps ? String(gps.lat) : '', gpsLng: gps ? String(gps.lng) : '', gpsAccuracy: gps ? String(Math.round(gps.accuracy)) : ''};
    try {
      const officialId = getSession()?.id || '';
      if (!officialId) throw new Error('Sign in before saving this visit.');
      writeQueue(mergeVisit(readQueue(), officialId, payload.idempotencyKey, {officialId, registerBase: base, payload, state: 'waiting', error: ''}));
      await flushPrivateStorage();
      const response = await fetch(`${base}/api/register`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        const outcome = classifySyncResponse(response.status, body);
        if (outcome.sessionExpired) { clearSession(); setSession(null); }
        throw new Error(outcome.error || body.error);
      }
      try {
        const next = await fetch(`${base}/api/register?vendorId=${encodeURIComponent(vendor.id)}`, {cache: 'no-store', headers: authHeaders()});
        const nextBody = await next.json();
        if (next.ok) { setEvents(nextBody.events); setDeliveries(Array.isArray(nextBody.deliveries) ? nextBody.deliveries : []); }
      } catch { /* The write succeeded; do not offer a duplicate submission. */ }

      if (officialId && payload.idempotencyKey) writeQueue(mergeVisit(readQueue(), officialId, payload.idempotencyKey, null));
      if (correcting.current?.key === payload.idempotencyKey) {
        pushHistory({action: 'corrected', vendorId: vendor.id, kind: kind, detail: 'Corrected visit accepted by the register.'});
        correcting.current = null;
      }
      visitKey.current = '';
      const drafts = readDrafts();
      delete drafts[vendor.id];
      writeDrafts(drafts);
      setVisit(false);
      setNote('');
      setDue('');
      setGPS(null);
      setNotice('Visit saved to the vendor register.');
      setTab('Compliance');
    } catch (cause) {
      if (cause instanceof TypeError) {
        const officialId = getSession()?.id || '';
        if (officialId) {
          const queuedItem = {officialId, registerBase: base, payload, state: 'waiting' as const, error: ''};
          writeQueue(mergeVisit(readQueue(), officialId, payload.idempotencyKey, queuedItem));
        }
        const drafts = readDrafts();
        delete drafts[vendor.id];
        writeDrafts(drafts);
        setVisit(false);
        setNote('');
        setDue('');
        setGPS(null);
        visitKey.current = '';
        setNotice('Saved on this phone. It will be sent when the register can be reached. The next visit for this vendor is a separate record.');
        correcting.current = null;
      } else {
        const officialId = getSession()?.id || '';
        if (officialId) {
          const message = cause instanceof Error ? cause.message : 'Could not save.';
          const temporary = /temporary|expired|429|50\d/i.test(message);
          writeQueue(mergeVisit(readQueue(), officialId, payload.idempotencyKey, {officialId, registerBase: base, payload, state: temporary ? 'waiting' : 'rejected', error: message}));
        }
        setError(cause instanceof Error ? cause.message : 'Could not save. Your notes remain here; reconnect and try again.');
      }
    } finally {
      try {await flushPrivateStorage();} catch {setNotice(''); setError('Phone storage could not be saved. Keep this app open and retry; check the register before resubmitting.');}
      setBusy(false);
    }
  }

  async function postNotice(eventId: string, action: string, extra: Record<string, string> = {}) {
    if (noticeLock.current || !vendor) return;
    const base = getRegisterBase();
    if (!base) return;
    noticeLock.current = eventId;
    setNoticeBusy(eventId);
    setError('');
    try {
      const response = await fetch(`${base}/api/notice`, {method: 'POST', headers: authHeaders(true), body: JSON.stringify({action, eventId, idempotencyKey: crypto.randomUUID().replace(/-/g, '').slice(0, 24), ...extra})});
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not record this notice.');
      await refreshRecord(vendor.id);
      setNotice(body.message || 'Notice record saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record this notice.');
    } finally {
      noticeLock.current = '';
      setNoticeBusy('');
    }
  }

  function capture() {
    if (!navigator.geolocation) {
      setError('GPS unavailable. Continue without a visit position.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      position => {
        setGPS({lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy});
        setLocating(false);
      },
      () => {
        setError('Location unavailable. Allow location access or record the visit without GPS.');
        setLocating(false);
      },
      {enableHighAccuracy: true, timeout: 15000, maximumAge: 0},
    );
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (hasPin()) {setLocked(true); setAuthReady(false); return;}
      await hydrateSession();
      if (cancelled) return;
      setServerDraft(getRegisterBase());
      const base = getRegisterBase();
      const token = getToken();
      if (!base || !token) {
        setAuthReady(true);
        return;
      }
      try {
        const response = await fetch(`${base}/api/auth`, {headers: authHeaders(), cache: 'no-store'});
        const body = await response.json().catch(() => ({}));
        if (response.status === 401 || response.status === 403 || (response.ok && !body.user)) {
          clearSession();
          if (!cancelled) setSession(null);
        } else if (!response.ok) {
          if (!cancelled) {
            setSession(getSession());
            setError('The vendor register is unavailable. Your sign-in is still on this device.');
          }
        } else if (!cancelled) {
          setSession(body.user);
          await saveSession(token, body.user);
        }
      } catch {
        if (!cancelled) {
          const cached = getSession();
          if (cached) {
            setSession(cached);
            setError('The vendor register could not be reached. Your sign-in is still on this device.');
          } else setSession(null);
        }
      } finally {
        if (cancelled) return;
        // Records and evidence on this phone stay behind the device PIN.
        if (hasPin()) {
          setLocked(true);
          setAuthReady(false);
        } else {
          setPinReady(false);
          setAuthReady(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onHidden = () => { if (document.visibilityState === 'hidden' && hasPin()) {setLocked(true); void lockPrivateStorage().catch(() => setPinError('Phone storage could not be saved before locking. Check your saved visits after unlocking.'));} };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, []);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    setPinError('');
    try {
    if (await unlockWithPin(pinDraft)) {
      setLocked(false);
      setPinDraft('');
      setAuthReady(true);
      setSession(getSession());
      setPinReady(privateStorageReady());
    } else {
      setPinError('That PIN is not correct.');
      setPinDraft('');
    }
    } catch (cause) { setPinError(cause instanceof Error ? cause.message : 'Could not unlock this phone.'); }
  }

  async function createPin(event: React.FormEvent) {
    event.preventDefault();
    setPinError('');
    if (pinDraft !== pinConfirm) { setPinError('Enter the same PIN twice.'); return; }
    try {
      await setPin(pinDraft);
      setPinDraft('');
      setPinConfirm('');
      setPinReady(true);
      setSession(getSession());
      setNotice('Encrypted phone storage is ready. The PIN is required whenever the app is opened.');
    } catch (cause) {
      setPinError(cause instanceof Error ? cause.message : 'Choose a PIN of 6 to 12 digits.');
    }
  }

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    let base = '';
    try {
      base = saveRegisterBase(serverDraft);
      setServerDraft(base);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enter a valid register address.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`${base}/api/auth`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'login', email, password}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Sign-in failed');
      await saveSession(body.token, body.user);
      setSession(body.user);
      setPassword('');
    } catch (cause) {
      clearSession();
      setSession(null);
      setError(cause instanceof Error ? cause.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const base = getRegisterBase();
    if (base && getToken()) {
      await fetch(`${base}/api/auth`, {method: 'POST', headers: authHeaders(true), body: JSON.stringify({action: 'logout'})}).catch(() => {});
    }
    clearSession();
    // Keep the device vault and PIN so signing out cannot expose or discard unsent evidence.
    await flushPrivateStorage();
    await lockPrivateStorage();
    setLocked(true);
    setSession(null);
    setVendor(null);
    setRecordStale('');
    setPinReady(false);
    setPinDraft('');
    setPinConfirm('');
    setNotice('');
  }

  const open = events.filter(entry => ['Warning', 'Violation'].includes(entry.kind) && !entry.resolved);
  useEffect(() => {
    if (!vendor?.photo) { setPortrait(''); return; }
    let cancelled = false;
    let objectUrl = '';
    (async () => {
      try {
        const response = await fetch(getRegisterBase() + vendor.photo, {cache: 'no-store', headers: authHeaders()});
        if (!response.ok) return;
        objectUrl = URL.createObjectURL(await response.blob());
        if (!cancelled) setPortrait(objectUrl);
      } catch { if (!cancelled) setPortrait(''); }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [vendor?.id, vendor?.photo]);

  if (locked) {
    return (
      <div className="field-app field-locked">
        <main className="field-main">
          <div className="field-intro">
            <span className="field-scan-icon"><ShieldCheck size={34} /></span>
            <p className="eyebrow">DEVICE LOCK</p>
            <h1>Enter your PIN</h1>
            <p>Cached vendor records and unsent visit evidence stay on this phone. Your PIN decrypts the offline records on this phone. Android also protects them with a device-bound key. Keep the device screen lock enabled.</p>
          </div>
          <form className="field-server" onSubmit={unlock}>
            <label htmlFor="field-pin">PIN</label>
            <input id="field-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={12} value={pinDraft} onChange={event => setPinDraft(event.target.value)} required autoFocus />
            <button type="submit" disabled={pinDraft.length < 4}>Unlock</button>
          </form>
          <button className="secondary field-wide" type="button" onClick={async () => { if (!window.confirm('Erase all saved sign-ins, drafts, queued visits and cached records on this phone? Unsent visits will be lost.')) return; try { await resetPhone(); window.location.reload(); } catch { setPinError('Phone data could not be fully cleared. Try again.'); } }}>Forgot the PIN — clear this phone</button>
          {pinError && <div className="field-alert" role="alert">{pinError}</div>}
          <p className="field-help">Clearing the phone removes the saved sign-in, drafts, the send queue and cached vendor records from this device.</p>
        </main>
        <footer className="field-footer">Sol Plaatje Municipality · Local Economic Development</footer>
      </div>
    );
  }

  if (!pinReady) {
    return (
      <div className="field-app field-locked">
        <main className="field-main">
          <div className="field-intro">
            <span className="field-scan-icon"><ShieldCheck size={34} /></span>
            <p className="eyebrow">PROTECT THIS PHONE</p>
            <h1>Choose a device PIN</h1>
            <p>Choose a PIN to encrypt vendor records, saved sign-in and offline evidence on this phone. You will need it whenever the app is opened. Forgotten PINs cannot recover encrypted records.</p>
          </div>
          <form className="field-server" onSubmit={createPin}>
            <label htmlFor="new-pin">PIN (6 to 12 digits)</label>
            <input id="new-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={12} value={pinDraft} onChange={event => setPinDraft(event.target.value)} required />
            <label htmlFor="confirm-pin">Confirm PIN</label>
            <input id="confirm-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={12} value={pinConfirm} onChange={event => setPinConfirm(event.target.value)} required />
            <button type="submit" disabled={pinDraft.length < 6}>Set PIN and continue</button>
          </form>
          {pinError && <div className="field-alert" role="alert">{pinError}</div>}
          <p className="field-help">A PIN protects this phone only. It is not your register password and it does not change what you may record.</p>
        </main>
        <footer className="field-footer">Sol Plaatje Municipality · Local Economic Development</footer>
      </div>
    );
  }

  return (
    <div className="field-app">
      <header className="field-header">
        <div className="field-wordmark"><Building2 size={25} /><div>Sol Plaatje <span>LED FIELD VISITS</span></div></div>
        {session && <button className="icon-button" aria-label="Sign out" onClick={signOut}><LogOut size={19} /></button>}
      </header>
      <main className="field-main">
        <div className="field-eyebrow"><span><ShieldCheck size={14} />{session ? session.name : 'Sign in required'}</span><span><Wifi size={14} />{session ? 'Signed in' : 'Not signed in'}</span>{session && <button type="button" className="text-button" onClick={async () => { const base = getRegisterBase(); if (!base) return; const response = await fetch(`${base}/api/auth`, {method: 'POST', headers: authHeaders(true), body: JSON.stringify({action: 'revoke-sessions'})}); const body = await response.json().catch(() => ({})); setError(''); setNotice(response.ok ? 'Other devices were signed out.' : (body.error || 'Could not sign out other devices.')); }}>Sign out other devices</button>}</div>
        {error && <div className="field-alert" role="alert">{error}</div>}
        {notice && <div className="field-success" role="status"><Check size={17} />{notice}</div>}
        {!authReady ? <p className="muted">Checking your session…</p> : !session ? (
          <form className="field-server" onSubmit={signIn}>
            <label htmlFor="register-server">Vendor register address</label>
            <input id="register-server" className="block" inputMode="url" autoCapitalize="off" autoCorrect="off" value={serverDraft} onChange={event => setServerDraft(event.target.value)} placeholder="http://127.0.0.1:5173" required />
            <label htmlFor="officer-email">Email address</label>
            <input id="officer-email" className="block" type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required />
            <label htmlFor="officer-password">Password</label>
            <div>
              <input id="officer-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required />
              <button type="submit" disabled={busy}>{busy ? <Loader2 className="spin" size={18} /> : 'Sign in'}</button>
            </div>
            <small>Use the account created by the super user. On this computer the register address is http://127.0.0.1:5173. A public address must use https.</small>
          </form>
        ) : session.mustChangePassword ? (
          <form className="field-server" onSubmit={async event => {
            event.preventDefault();
            const next = (document.getElementById('new-password') as HTMLInputElement).value;
            const confirm = (document.getElementById('confirm-password') as HTMLInputElement).value;
            const current = (document.getElementById('current-password') as HTMLInputElement).value;
            if (next !== confirm) { setError('Enter the same new password twice.'); return; }
            setBusy(true);
            setError('');
            try {
              const response = await fetch(`${getRegisterBase()}/api/auth`, {method: 'POST', headers: authHeaders(true), body: JSON.stringify({action: 'change-password', currentPassword: current, password: next})});
              const body = await response.json();
              if (!response.ok) throw new Error(body.error || 'Could not change the password');
              await saveSession(getToken(), body.user);
              setSession(body.user);
              setNotice('Password updated.');
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Could not change the password');
            } finally {
              setBusy(false);
            }
          }}>
            <h1>Choose a new password</h1>
            <p>This account cannot open vendor records until the password is replaced.</p>
            <label htmlFor="current-password">Current password</label>
            <input id="current-password" className="block" type="password" autoComplete="current-password" required />
            <label htmlFor="new-password">New password</label>
            <input id="new-password" className="block" type="password" autoComplete="new-password" minLength={8} required />
            <label htmlFor="confirm-password">Confirm new password</label>
            <input id="confirm-password" className="block" type="password" autoComplete="new-password" minLength={8} required />
            <button type="submit" disabled={busy}>{busy ? <Loader2 className="spin" size={18} /> : 'Save password'}</button>
          </form>
        ) : recovery ? (
          <>
            <button className="field-back" type="button" onClick={() => setRecovery(false)}><ChevronLeft size={17} />Back to scan</button>
            <section className="field-panel">
              <h2>Offline visit recovery</h2>
              <p className="muted">Rejected visits stay here until a corrected submission succeeds or you dismiss them. Waiting visits retry when the register can be reached. Temporary server problems stay waiting.</p>
              <button className="secondary field-wide" type="button" disabled={busy} onClick={async () => { setBusy(true); setError(''); setNotice(''); try { await syncQueue(true); } finally { setBusy(false); } }}>Retry waiting visits</button>
            </section>
            {waiting.map(item => <section className="field-sample" key={'wait-' + (item.payload?.idempotencyKey || '') + item.officialId}><strong>Waiting to send</strong><p>{item.payload?.vendorId} · {item.payload?.kind}</p><p>{String(item.payload?.note || '').split('\nVisit GPS')[0]}</p></section>)}
            {rejected.map(item => <section className="field-alert" key={'rej-' + (item.payload?.idempotencyKey || item.error) + item.officialId}><strong>Rejected</strong><p>{item.error || 'The register rejected this visit.'}</p><p>{item.payload?.vendorId} · {item.payload?.kind}</p><p>{String(item.payload?.note || '').split('\nVisit GPS')[0]}</p><button type="button" onClick={() => { correcting.current = {key: String(item.payload?.idempotencyKey || ''), payload: item.payload}; setRecovery(false); setNotice('Loading the vendor, then restoring the rejected visit for correction.'); void lookup(String(item.payload?.vendorId || '')); }}>Correct</button><button type="button" onClick={() => { pushHistory({action: 'dismissed', vendorId: item.payload?.vendorId || '', kind: item.payload?.kind || 'Visit', detail: item.error || 'Dismissed without sending.'}); writeQueue(mergeVisit(readQueue(), item.officialId, visitKeyOf(item), null)); }}>Dismiss</button></section>)}
            {held.map(item => <section className="field-sample" key={'held-' + (item.payload?.idempotencyKey || item.error)}><strong>Not assigned to this official</strong><p>{item.error || 'This visit is not tied to the signed-in official and was not sent.'}</p><button type="button" onClick={() => { pushHistory({action: 'dismissed', vendorId: item.payload?.vendorId || '', kind: item.payload?.kind || 'Visit', detail: 'Dismissed unassigned visit.'}); writeQueue(readQueue().filter(row => !( !row.officialId && row.payload?.idempotencyKey === item.payload?.idempotencyKey && row.error === item.error))); }}>Dismiss</button></section>)}
            <section className="field-panel"><h2>Phone data on this device</h2><p className="muted">Drafts, the visit queue, cached vendor profiles and GPS findings stay in this browser’s local storage for the signed-in official and register address. They are not the municipal register. Keep the phone locked. If the phone is lost, revoke its sign-in from the office register and ask your device administrator to lock or erase that phone. Clearing a replacement phone does not erase the lost phone.</p><button className="secondary field-wide" type="button" onClick={() => { if (window.confirm('Clear drafts, queued visits, vendor cache and recovery history for this official on this phone?')) clearPhoneData(); }}>Clear phone data for this official</button></section>
            <section className="field-panel"><h2>Dismissal and send history</h2>{history.map(item => <div className="field-entry" key={item.at + item.action + item.vendorId}><div><strong>{item.action}</strong><b>{item.kind}</b></div><p>{item.vendorId}</p><p>{item.detail}</p><small>{date(item.at)}</small></div>)}{!history.length && <p className="muted">No dismissals or successful queue sends yet.</p>}</section>
          </>
        ) : !vendor ? (
          <>
            <div className="field-intro">
              <span className="field-scan-icon"><ScanLine size={35} /></span>
              <p className="eyebrow">ON-SITE VENDOR VERIFICATION</p>
              <h1>A card. A scan.<br />The complete vendor record.</h1>
              <p>Check the current registration, location, fee balance and compliance history during your site visit.</p>
            </div>

            <button className="secondary field-wide" type="button" onClick={() => openRecovery()}>Offline recovery{queued || rejected.length || held.length ? ' · ' + queued + ' waiting' + (rejected.length ? ' · ' + rejected.length + ' rejected' : '') + (held.length ? ' · ' + held.length + ' held' : '') : history.length ? ' · history' : ''}</button>
            <button className="field-scan-button" disabled={busy} onClick={() => { setError(''); setScanning(true); }}><Camera size={22} />Scan vendor ID card</button>
            <div className="field-divider"><span>or enter the vendor ID</span></div>
            <form className="field-search" onSubmit={event => { event.preventDefault(); lookup(id); }}>
              <label htmlFor="vendor-id">Vendor ID</label>
              <div>
                <input id="vendor-id" autoCapitalize="characters" autoComplete="off" value={id} onChange={event => setId(event.target.value)} placeholder="e.g. SPM-2026-0001" required />
                <button type="submit" disabled={busy} aria-label="Find vendor">{busy ? <Loader2 className="spin" size={20} /> : <Search size={21} />}</button>
              </div>
            </form>
            <section className="field-info">
              <ClipboardCheck size={23} />
              <div>
                <strong>One shared vendor record</strong>
                <p>Visit findings are saved to the vendor register. Barcode and QR scans are supported. Older cards must be linked to a registered vendor ID.</p>
              </div>
            </section>
          </>
        ) : (
          <>
            <button className="field-back" onClick={() => { stashDraft(vendor.id); activeVendor.current = ''; setVendor(null); setVisit(false); setNote(''); setDue(''); setGPS(null); visitKey.current = ''; setError(''); setNotice(''); setRecordStale(''); }}><ChevronLeft size={17} />Scan another card</button>
            <button className="secondary field-wide" type="button" onClick={() => { stashDraft(vendor.id); activeVendor.current = ''; setVendor(null); setVisit(false); setRecordStale(''); openRecovery(); }}>Offline recovery</button>
            <div className="field-vendor-head">
              {portrait ? <img src={portrait} alt={'Profile picture of ' + vendor.name} /> : <span>{vendor.name.split(' ').slice(0, 2).map(part => part[0]).join('')}</span>}
              <div><p className="mono">{vendor.id}</p><h1>{vendor.business}</h1><p>{vendor.name}</p></div>
            </div>
            {cardWarning && <div className="field-alert" role="alert"><strong>Card status</strong><p>{cardWarning}</p></div>}
            {recordStale && <div className="field-sample" role="status"><strong>Offline copy</strong><p>{recordStale}</p></div>}
            {vendor.sample && <div className="field-sample">Sample vendor · not a municipal record or valid permit</div>}
            <div className="field-status-row">
              <span className={'badge ' + (permit(vendor) === 'Approved' ? 'good' : permit(vendor) === 'Pending review' ? 'amber' : 'bad')}>{permit(vendor)}</span>
              <span className="badge neutral">{vendor.type} trader</span>
              <span className="muted">Expires {date(vendor.expires)}</span>
            </div>
            <div className="field-tabs" role="tablist" aria-label="Vendor record sections" onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const items=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];const current=items.indexOf(event.target as HTMLButtonElement);if(current<0)return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?items.length-1:(current+(event.key==='ArrowRight'?1:-1)+items.length)%items.length;items[next].focus();items[next].click();}}>
              {['Profile', 'Fees', 'Compliance'].map(name => (
                <button key={name} role="tab" id={'field-tab-'+name.toLowerCase()} aria-controls={'field-panel-'+name.toLowerCase()} aria-selected={name===tab} tabIndex={name===tab?0:-1} className={name === tab ? 'active' : ''} onClick={() => setTab(name)}>
                  {name === 'Fees' ? <Wallet size={16} /> : name === 'Compliance' ? <ShieldCheck size={16} /> : <MapPin size={16} />} {name}
                </button>
              ))}
            </div>
            {tab === 'Profile' && (
              <section className="field-panel" role="tabpanel" tabIndex={0} id="field-panel-profile" aria-labelledby="field-tab-profile">
                <h2>Registered trading location</h2>
                <p className="field-location">{vendor.type === 'Formal' ? vendor.hub : vendor.address || 'Street trading'}</p>
                <dl>
                  <dt>{vendor.type === 'Formal' ? 'Unit number' : 'Pitch reference'}</dt><dd>{vendor.unit || 'Not recorded'}</dd>
                  <dt>Products / sector</dt><dd>{vendor.sector}</dd>
                  <dt>Permit issued</dt><dd>{date(vendor.issued)}</dd>
                  <dt>Contact number</dt><dd>{vendor.phone || 'Not recorded'}</dd>
                  {vendor.type === 'Informal' && <><dt>Latitude</dt><dd>{vendor.lat}</dd><dt>Longitude</dt><dd>{vendor.lng}</dd></>}
                </dl>
                {vendor.lat && vendor.lng && <a className="secondary field-wide" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${vendor.lat},${vendor.lng}`}><MapPin size={17} />Open registered location</a>}
                <h3>Verification recorded by LED Office</h3>
                {vendor.documents.length ? vendor.documents.map(item => <div className="field-check" key={item}><Check size={16} />{item}</div>) : <p className="muted">No verification items recorded.</p>}
                {(vendor.files || []).length > 0 && <><h3>Uploaded documents</h3>{(vendor.files || []).map(file => <button type="button" className="secondary field-wide" key={file.id} onClick={async () => { try { await openProtected(file.url); } catch (cause) { if (cause instanceof SessionExpiredError) { clearSession(); setSession(null); setError(cause.message); } else { setError('Could not open this document.'); } } }}>{file.label}</button>)}</>}
              </section>
            )}
            {tab === 'Fees' && (
              <div role="tabpanel" tabIndex={0} id="field-panel-fees" aria-labelledby="field-tab-fees">
                <div className="field-balance"><span>Recorded account balance</span><strong>{money(balance(vendor.id, events))}</strong><p>{balance(vendor.id, events) > 0 ? 'Outstanding fees' : balance(vendor.id, events) < 0 ? 'Credit balance' : 'Account settled'}</p></div>
                <section className="field-panel">
                  <h2>Charges & received payments</h2>
                  {events.filter(entry => ['Charge', 'Payment', 'Reversal'].includes(entry.kind)).map(entry => (
                    <div className="field-entry" key={entry.id}><div><strong>{entry.kind}</strong><b>{money(entry.amount)}</b></div><p>{entry.note}</p><small>{date(entry.createdAt)}{entry.due ? ' · Due ' + date(entry.due) : ''}</small></div>
                  ))}
                  {!events.some(entry => ['Charge', 'Payment', 'Reversal'].includes(entry.kind)) && <p className="muted">No charges, payments or reversals recorded.</p>}
                </section>
                <p className="field-help">Fee balance is separate from permit approval. Field visits do not process payments.</p>
              </div>
            )}
            {tab === 'Compliance' && (
              <section className="field-panel" role="tabpanel" tabIndex={0} id="field-panel-compliance" aria-labelledby="field-tab-compliance">
                <div className="field-section-title"><h2>Compliance & visits</h2><span>{open.length} open cases</span></div>
                {events.filter(entry => ['Inspection', 'Warning', 'Violation', 'Resolution', 'Escalation'].includes(entry.kind)).map(entry => (
                  <div className="field-entry" key={entry.id}>
                    <div><span className={'badge ' + (entry.resolved ? 'good' : entry.kind === 'Violation' ? 'bad' : entry.kind === 'Warning' ? 'amber' : 'neutral')}>{entry.resolved ? 'Resolved ' + entry.kind : entry.kind}</span><span>{date(entry.createdAt)}</span></div>
                    <p>{entry.note}</p>
                    <small>{entry.actor}{entry.due ? ' · Follow up ' + date(entry.due) : ''}</small>
                    {['Warning', 'Violation'].includes(entry.kind) && (
                      <>
                        <div className="notice-actions">
                          <a href={noticeEmail(vendor, entry)} onClick={() => postNotice(entry.id, 'deliver', {method: 'draft'})}><Mail size={16} />Email draft</a>
                          <button type="button" disabled={noticeBusy === entry.id} onClick={async () => { setNoticeBusy(entry.id); try { await openProtected('/api/notice?eventId=' + encodeURIComponent(entry.id)); await refreshRecord(vendor.id); setNotice('PDF saved. Use the share sheet on Android, or the download on this browser. The download is recorded.'); } catch (cause) { if (cause instanceof SessionExpiredError) { clearSession(); setSession(null); setError(cause.message); } else { setError('Could not save the notice.'); } } finally { setNoticeBusy(''); } }}>Download or share PDF</button>
                          <button type="button" disabled={noticeBusy === entry.id} onClick={async () => { try { await navigator.clipboard.writeText(noticeText(vendor, entry)); setNotice('Notice copied. Paste it into your official email.'); } catch { setError('Copy unavailable. Use the email draft or PDF.'); } }}>Copy notice</button>
                          <button type="button" disabled={noticeBusy === entry.id} onClick={() => postNotice(entry.id, 'deliver', {method: 'handover'})}>Handed to trader</button>
                          <button type="button" disabled={noticeBusy === entry.id} onClick={() => postNotice(entry.id, 'deliver', {method: 'acknowledged'})}>Trader acknowledged</button>
                          <button type="button" disabled={noticeBusy === entry.id || !senderConnected} onClick={() => postNotice(entry.id, 'send')}>{senderConnected ? 'Municipal sender' : 'Municipal sender not connected'}</button>
                          {!entry.resolved && <button type="button" disabled={noticeBusy === entry.id} onClick={() => { const reason = window.prompt('Why is this case being escalated?'); if (!reason || !reason.trim()) return; const destination = window.prompt('Where should this case go?', 'LED Office') || 'LED Office'; postNotice(entry.id, 'escalate', {note: reason.trim(), destination}); }}>Escalate</button>}
                        </div>
                        <p className="notice-help">{senderConnected ? 'Municipal email can accept this notice. Acceptance is not proof the trader opened it.' : 'Municipal email is not connected. Use the PDF, handover or acknowledgement.'} The email draft is not marked as sent.</p>
                        {deliveries.filter(item => item.eventId === entry.id).map(item => <small className="notice-log" key={item.id}>{date(item.createdAt)} · {item.method} · {item.status} · {item.actor}</small>)}
                      </>
                    )}
                  </div>
                ))}
                {!events.some(entry => ['Inspection', 'Warning', 'Violation', 'Resolution'].includes(entry.kind)) && <p className="muted">No findings or site visits recorded.</p>}
              </section>
            )}
            {!visit ? (
              <button className="field-scan-button visit-button" onClick={() => { setVisit(true); setError(''); setNotice(''); }}><ClipboardCheck size={21} />Record this site visit</button>
            ) : (
              <section className="field-panel field-visit-form">
                <div className="field-section-title"><h2>Site visit findings</h2><button className="icon-button" aria-label="Close visit form" onClick={() => setVisit(false)}><X size={20} /></button></div>
                <form onSubmit={saveVisit}>
                  <label>Record type<select value={kind} onChange={event => setKind(event.target.value)}>{['Inspection', 'Warning', 'Violation'].map(option => <option key={option}>{option}</option>)}</select></label>
                  <label>Findings and action taken<textarea required maxLength={1700} rows={5} value={note} onChange={event => setNote(event.target.value)} placeholder="Describe what you observed and the action taken…" /></label>
                  <label>Follow-up date (optional)<input type="date" value={due} onChange={event => setDue(event.target.value)} /></label>
                  <button type="button" className="secondary field-wide" disabled={locating} onClick={capture}>{locating ? <Loader2 size={17} className="spin" /> : <LocateFixed size={17} />}Capture visit GPS</button>
                  {gps && <p className="field-gps">{gps.lat.toFixed(6)}, {gps.lng.toFixed(6)} · accuracy approximately {Math.round(gps.accuracy)} m</p>}
                  <p className="field-help">Saved as {session?.name}, with the server timestamp. Visit GPS does not change the trader’s registered pitch.</p>
                  <button className="primary field-wide" disabled={busy} type="submit">{busy ? <Loader2 size={18} className="spin" /> : <Check size={18} />}Save visit to vendor record</button>
                </form>
              </section>
            )}
          </>
        )}
        <footer className="field-footer">Sol Plaatje Municipality · Local Economic Development</footer>
      </main>
      {scanning && (
        <div className="field-camera-overlay" role="dialog" aria-modal="true" aria-label="Scan vendor card">
          <header><h2>Scan vendor ID</h2><button className="icon-button" aria-label="Close camera" onClick={() => setScanning(false)}><X /></button></header>
          <div className="field-camera"><video ref={video} autoPlay playsInline muted /><div className="scan-target"><ScanLine size={50} /></div></div>
          <p>{scannerMessage}</p>
          <p className="field-camera-hint">Scan the barcode on the new ID card, or a QR code containing its registered vendor ID.</p>
          <button className="secondary" onClick={() => setScanning(false)}>Enter ID instead</button>
        </div>
      )}
    </div>
  );
}
