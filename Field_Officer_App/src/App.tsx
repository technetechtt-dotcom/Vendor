import {useEffect, useRef, useState} from 'react';
import {ScanLine, Search, X, MapPin, ShieldCheck, Wallet, ChevronLeft, Camera, Check, LocateFixed, Wifi, Building2, ClipboardCheck, Loader2, Mail, Copy, LogOut} from 'lucide-react';
import {Vendor, Entry, money, balance, permit, getRegisterBase, saveRegisterBase, getToken, getSession, saveSession, clearSession, authHeaders, photoUrl, noticeEmail, noticeText, FieldAccount} from './register';

type VisitGPS = {lat: number; lng: number; accuracy: number};

const date = (value: string) => new Date(value.length === 10 ? value + 'T12:00:00' : value).toLocaleDateString('en-ZA', {day: 'numeric', month: 'short', year: 'numeric'});

export function App() {
  const [serverDraft, setServerDraft] = useState(getRegisterBase);
  const [session, setSession] = useState<FieldAccount | null>(getSession);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [id, setId] = useState('');
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [events, setEvents] = useState<Entry[]>([]);
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
      setVendor(body.vendor);
      setEvents(body.events);
      setTab('Profile');
      setVisit(false);
    } catch (cause) {
      setVendor(null);
      setError(cause instanceof Error ? cause.message : 'Could not load the vendor. Check the register address and your connection.');
    } finally {
      setBusy(false);
    }
  }

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
    setBusy(true);
    setError('');
    const details = note.trim() + (gps
      ? `\nVisit GPS: ${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}; device accuracy approximately ${Math.round(gps.accuracy)} m. This is the visit position, not a change to the registered pitch.`
      : '\nVisit GPS not captured.');
    try {
      const response = await fetch(`${base}/api/register`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({action: 'event', vendorId: vendor.id, kind, note: details, due, amount: 0}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      try {
        const next = await fetch(`${base}/api/register?vendorId=${encodeURIComponent(vendor.id)}`, {cache: 'no-store', headers: authHeaders()});
        const nextBody = await next.json();
        if (next.ok) setEvents(nextBody.events);
      } catch { /* The write succeeded; do not offer a duplicate submission. */ }
      setVisit(false);
      setNote('');
      setDue('');
      setGPS(null);
      setNotice('Visit saved to the vendor register.');
      setTab('Compliance');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save. Your notes remain here; reconnect and try again.');
    } finally {
      setBusy(false);
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
    const base = getRegisterBase();
    const token = getToken();
    if (!base || !token) {
      setAuthReady(true);
      return;
    }
    fetch(`${base}/api/auth`, {headers: authHeaders(), cache: 'no-store'})
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Sign in again.');
        setSession(body.user);
        saveSession(token, body.user);
      })
      .catch(() => {
        clearSession();
        setSession(null);
      })
      .finally(() => setAuthReady(true));
  }, []);

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
      saveSession(body.token, body.user);
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
    setSession(null);
    setVendor(null);
    setNotice('');
  }

  const open = events.filter(entry => ['Warning', 'Violation'].includes(entry.kind) && !entry.resolved);
  const portrait = vendor?.photo ? photoUrl(vendor.photo) : '';

  return (
    <div className="field-app">
      <header className="field-header">
        <div className="field-wordmark"><Building2 size={25} /><div>Sol Plaatje <span>LED FIELD VISITS</span></div></div>
        {session && <button className="icon-button" aria-label="Sign out" onClick={signOut}><LogOut size={19} /></button>}
      </header>
      <main className="field-main">
        <div className="field-eyebrow"><span><ShieldCheck size={14} />{session ? session.name : 'Sign in required'}</span><span><Wifi size={14} />{session ? 'Signed in' : 'Not signed in'}</span></div>
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
            <small>Use the account created by the super user. On this computer the register address is http://127.0.0.1:5173.</small>
          </form>
        ) : !vendor ? (
          <>
            <div className="field-intro">
              <span className="field-scan-icon"><ScanLine size={35} /></span>
              <p className="eyebrow">ON-SITE VENDOR VERIFICATION</p>
              <h1>A card. A scan.<br />The complete vendor record.</h1>
              <p>Check the current registration, location, fee balance and compliance history during your site visit.</p>
            </div>
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
            <button className="field-back" onClick={() => { setVendor(null); setVisit(false); setError(''); setNotice(''); }}><ChevronLeft size={17} />Scan another card</button>
            <div className="field-vendor-head">
              {portrait ? <img src={portrait} alt={vendor.name} /> : <span>{vendor.name.split(' ').slice(0, 2).map(part => part[0]).join('')}</span>}
              <div><p className="mono">{vendor.id}</p><h1>{vendor.business}</h1><p>{vendor.name}</p></div>
            </div>
            {vendor.sample && <div className="field-sample">Sample vendor · not a municipal record or valid permit</div>}
            <div className="field-status-row">
              <span className={'badge ' + (permit(vendor) === 'Approved' ? 'good' : permit(vendor) === 'Pending review' ? 'amber' : 'bad')}>{permit(vendor)}</span>
              <span className="badge neutral">{vendor.type} trader</span>
              <span className="muted">Expires {date(vendor.expires)}</span>
            </div>
            <div className="field-tabs">
              {['Profile', 'Fees', 'Compliance'].map(name => (
                <button key={name} className={name === tab ? 'active' : ''} onClick={() => setTab(name)}>
                  {name === 'Fees' ? <Wallet size={16} /> : name === 'Compliance' ? <ShieldCheck size={16} /> : <MapPin size={16} />} {name}
                </button>
              ))}
            </div>
            {tab === 'Profile' && (
              <section className="field-panel">
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
                {(vendor.files || []).length > 0 && <><h3>Uploaded documents</h3>{(vendor.files || []).map(file => <button type="button" className="secondary field-wide" key={file.id} onClick={async () => { const base = getRegisterBase(); const response = await fetch(base + file.url, {cache: 'no-store', headers: authHeaders()}); if (!response.ok) { setError('Could not open this document.'); return; } const blob = await response.blob(); window.open(URL.createObjectURL(blob)); }}>{file.label}</button>)}</>}
              </section>
            )}
            {tab === 'Fees' && (
              <>
                <div className="field-balance"><span>Recorded account balance</span><strong>{money(balance(vendor.id, events))}</strong><p>{balance(vendor.id, events) > 0 ? 'Outstanding fees' : balance(vendor.id, events) < 0 ? 'Credit balance' : 'Account settled'}</p></div>
                <section className="field-panel">
                  <h2>Charges & received payments</h2>
                  {events.filter(entry => ['Charge', 'Payment'].includes(entry.kind)).map(entry => (
                    <div className="field-entry" key={entry.id}><div><strong>{entry.kind}</strong><b>{money(entry.amount)}</b></div><p>{entry.note}</p><small>{date(entry.createdAt)}{entry.due ? ' · Due ' + date(entry.due) : ''}</small></div>
                  ))}
                  {!events.some(entry => ['Charge', 'Payment'].includes(entry.kind)) && <p className="muted">No charges or payments recorded.</p>}
                </section>
                <p className="field-help">Fee balance is separate from permit approval. Field visits do not process payments.</p>
              </>
            )}
            {tab === 'Compliance' && (
              <section className="field-panel">
                <div className="field-section-title"><h2>Compliance & visits</h2><span>{open.length} open cases</span></div>
                {events.filter(entry => ['Inspection', 'Warning', 'Violation', 'Resolution'].includes(entry.kind)).map(entry => (
                  <div className="field-entry" key={entry.id}>
                    <div><span className={'badge ' + (entry.resolved ? 'good' : entry.kind === 'Violation' ? 'bad' : entry.kind === 'Warning' ? 'amber' : 'neutral')}>{entry.resolved ? 'Resolved ' + entry.kind : entry.kind}</span><span>{date(entry.createdAt)}</span></div>
                    <p>{entry.note}</p>
                    <small>{entry.actor}{entry.due ? ' · Follow up ' + date(entry.due) : ''}</small>
                    {['Warning', 'Violation'].includes(entry.kind) && (
                      <>
                        <div className="notice-actions">
                          <a href={noticeEmail(vendor, entry)}><Mail size={16} />Email notice</a>
                          <button onClick={async () => { try { await navigator.clipboard.writeText(noticeText(vendor, entry)); setNotice('Notice copied. Paste it into your official email.'); } catch { setError('Copy unavailable. Use the email action or select the notice text.'); } }}><Copy size={16} />Copy notice</button>
                        </div>
                        <p className="notice-help">Opens an email draft{vendor.email ? ' addressed to ' + vendor.email : '. Add the recipient in your email app'}. The official sends it; email delivery is not tracked.</p>
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
