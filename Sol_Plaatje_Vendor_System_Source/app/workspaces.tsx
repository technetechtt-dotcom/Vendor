'use client';
import {useEffect, useState} from 'react';
import {money, balance, permit, Vendor, Entry} from '../lib/data';

type Hub = {id: string; name: string};
type Unit = {id: string; hubId: string; hub: string; unitCode: string; capacity: number; status: string; notes: string};
type Pitch = {id: string; vendorId: string; pitchCode: string; ward: string; area: string; activity: string; lat: string; lng: string; accuracy: string; verifiedAt: string};
type Tariff = {id: string; category: string; amountCents: number; effectiveFrom: string; effectiveTo: string; applicability: string; approvalRef: string};
type PermitRow = {id: string; vendorId: string; permitNumber: string; cardSerial: string; status: string; note: string; actor: string; createdAt: string};
type Delivery = {id: string; eventId: string; method: string; status: string; detail?: string; actor: string; createdAt: string};
type Audit = {id: string; entity: string; entityId: string; action: string; actor: string; createdAt: string; beforeJson: string; afterJson: string};
type ImportRow = {id: string; batchId: string; payload: string; status: string; note: string; createdAt: string};
type History = {id: string; hubId: string; unitCode: string; vendorId: string; action: string; actor: string; createdAt: string; note: string};
type Requirement = {id: string; ruleRef: string; category: string; documentLabel: string; validityMonths: number};

export type Operations = {
  units: Unit[];
  pitches: Pitch[];
  tariffs: Tariff[];
  permits: PermitRow[];
  requirements: Requirement[];
  allocationHistory: History[];
  imports: ImportRow[];
  audit: Audit[];
  settings: {documentNote?: string};
};

const date = (value: string) => value ? new Date(value.length === 10 ? value + 'T12:00:00' : value).toLocaleDateString('en-ZA', {day: 'numeric', month: 'short', year: 'numeric'}) : 'Not recorded';

export function Workspaces({page, vendors, entries, hubs, deliveries, operations, senderConnected, save, reload, onOpen}: {
  page: string;
  vendors: Vendor[];
  entries: Entry[];
  hubs: Hub[];
  deliveries: Delivery[];
  operations: Operations;
  senderConnected: boolean;
  save: (body: any) => Promise<boolean>;
  reload: () => Promise<void>;
  onOpen: (vendor: Vendor, tab?: string) => void;
}) {
  const vendorName = (id: string) => vendors.find(vendor => vendor.id === id)?.business || id;
  if (page === 'Follow-ups') return <FollowUps entries={entries} vendors={vendors} save={save} onOpen={onOpen} />;
  if (page === 'Unit inventory') return <Inventory hubs={hubs} units={operations.units} pitches={operations.pitches} history={operations.allocationHistory} vendorName={vendorName} save={save} />;
  if (page === 'Permits & cards') return <Permits vendors={vendors} permits={operations.permits} save={save} onOpen={onOpen} />;
  if (page === 'Tariffs & reports') return <Tariffs vendors={vendors} entries={entries} tariffs={operations.tariffs} save={save} />;
  if (page === 'Notice queue') return <NoticeQueue entries={entries} vendors={vendors} deliveries={deliveries} senderConnected={senderConnected} reload={reload} onOpen={onOpen} />;
  if (page === 'Audit') return <AuditList rows={operations.audit} />;
  if (page === 'Settings') return <SettingsPanel settings={operations.settings} requirements={operations.requirements} senderConnected={senderConnected} save={save} />;
  if (page === 'Import') return <ImportPanel rows={operations.imports} save={save} />;
  if (page === 'Sessions') return <SessionsPanel />;
  return null;
}

function FollowUps({entries, vendors, save, onOpen}: {entries: Entry[]; vendors: Vendor[]; save: (body: any) => Promise<boolean>; onOpen: (vendor: Vendor, tab?: string) => void}) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = entries.filter(entry => ['Warning', 'Violation'].includes(entry.kind) && !entry.resolved).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  return <section className="panel"><div className="panel-head"><div><h2>Follow-up tasks</h2><p>Open warnings and violations, with the officer who owns the next visit.</p></div></div>{rows.map(entry => {
    const vendor = vendors.find(item => item.id === entry.vendorId);
    const overdue = entry.due && entry.due < today;
    return <div className="follow-up-case" key={entry.id}><form className="case-row" onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); if (await save({action: 'assign', id: entry.id, owner: data.get('owner'), severity: data.get('severity')})) form.reset(); }}><span className={'case-icon ' + (entry.kind === 'Violation' ? 'red' : '')} /><div className="case-main"><div><strong>{vendor?.business || entry.vendorId}</strong><span className={'badge ' + (overdue ? 'bad' : 'amber')}>{overdue ? 'Overdue' : entry.kind}</span></div><p>{entry.note}</p><small>{date(entry.createdAt)} · {entry.actor}{entry.owner ? ' · Owner ' + entry.owner : ' · No owner'}{entry.due ? ' · Follow up ' + date(entry.due) : ' · No follow-up date'}{entry.severity ? ' · ' + entry.severity : ''}</small><div className="form-grid"><label>Owner<input name="owner" defaultValue={entry.owner || ''} required /></label><label>Severity<select name="severity" defaultValue={entry.severity || 'Medium'}><option>Low</option><option>Medium</option><option>High</option></select></label></div></div><div className="actions"><button className="secondary" type="submit">Assign</button>{vendor && <button className="secondary" type="button" onClick={() => onOpen(vendor, 'Compliance')}>Open case</button>}</div></form><form className="case-row" onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); if (await save({action: 'schedule', id: entry.id, due: data.get('due'), plan: data.get('plan')})) form.reset(); }}><div className="case-main"><p>{entry.due && entry.due < today ? 'Scheduled task overdue ' + date(entry.due) : entry.due ? 'Scheduled task ' + date(entry.due) : 'No visit scheduled yet.'}{entry.checklist ? ' · ' + entry.checklist : ''}</p><label>What the next visit should check<textarea name="plan" required minLength={3} defaultValue={entry.checklist || ''} /></label><label>Follow-up date<input name="due" type="date" required defaultValue={entry.due || ''} /></label><label>Case status<select name="status" defaultValue={entry.caseStatus || 'open'} onChange={event => { void save({action: 'transition', id: entry.id, caseStatus: event.target.value}); }}><option value="open">Open</option><option value="follow-up">Follow-up</option><option value="escalated">Escalated</option></select></label></div><button className="secondary" type="submit">Save scheduled task</button></form><form className="case-row" onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); if (await save({action: 'event', vendorId: entry.vendorId, kind: 'Inspection', note: String(data.get('findings') || ''), due: '', amount: 0, followUpOf: entry.id, idempotencyKey: crypto.randomUUID().replace(/-/g, '').slice(0, 24)})) form.reset(); }}><div className="case-main"><label>Completed visit findings<textarea name="findings" required minLength={3} placeholder="What was found on the visit that already happened" /></label>{entries.filter(item => item.followUpOf === entry.id && item.kind === 'Inspection').map(item => <p key={item.id}>Completed inspection · {date(item.createdAt)} · {item.actor}<br />{item.note}</p>)}</div><button className="secondary" type="submit">Record completed inspection</button></form></div>;
  })}{!rows.length && <div className="empty">No open follow-ups.</div>}</section>;
}

function DatasetNotice({label}: {label: string}) {
  return <p className="hint">These {label} are only what staff have entered here. Their presence does not confirm that the municipality’s verified operational dataset is complete.</p>;
}

function Inventory({hubs, units, pitches, history, vendorName, save}: {hubs: Hub[]; units: Unit[]; pitches: Pitch[]; history: History[]; vendorName: (id: string) => string; save: (body: any) => Promise<boolean>}) {
  return <><section className="panel"><h2>Hub inventories</h2><DatasetNotice label="hub units and pitches" /><p>{units.length} unit record{units.length === 1 ? '' : 's'} and {pitches.length} pitch record{pitches.length === 1 ? '' : 's'} are stored. Empty counts mean the verified municipal inventory has not been loaded.</p></section><form className="panel" onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); if (await save({action: 'unit', hubId: data.get('hubId'), unitCode: data.get('unitCode'), capacity: Number(data.get('capacity') || 1), status: data.get('status'), notes: data.get('notes')})) form.reset(); }}><div className="panel-head"><div><h2>Hub unit</h2><p>Capacity and whether the unit is available, occupied, reserved or unavailable.</p></div></div><div className="form-grid"><label>Hub<select name="hubId" required>{hubs.map(hub => <option key={hub.id} value={hub.id}>{hub.name}</option>)}</select></label><label>Unit code<input name="unitCode" required maxLength={40} /></label><label>Capacity<input name="capacity" type="number" min={1} defaultValue={1} required /></label><label>Status<select name="status"><option>available</option><option>occupied</option><option>reserved</option><option>unavailable</option></select></label><label>Notes<input name="notes" maxLength={300} /></label></div><div className="modal-foot"><button className="primary" type="submit">Save unit</button></div></form><section className="panel"><div className="table-wrap"><table><thead><tr><th>Hub</th><th>Unit</th><th>Capacity</th><th>Status</th><th>Notes</th></tr></thead><tbody>{units.map(unit => <tr key={unit.id}><td>{unit.hub || unit.hubId}</td><td>{unit.unitCode}</td><td>{unit.capacity}</td><td>{unit.status}</td><td>{unit.notes}</td></tr>)}</tbody></table>{!units.length && <div className="empty">No units recorded yet. Allocating a trader creates an occupied unit.</div>}</div></section><section className="panel"><h2>Allocation history</h2>{history.map(item => <div className="history" key={item.id}><span className="timeline-dot" /><div><strong>{item.action}</strong><p>{vendorName(item.vendorId)} · unit {item.unitCode}. {item.note}</p><small>{date(item.createdAt)} · {item.actor}</small></div></div>)}{!history.length && <p className="muted">No allocation changes recorded yet.</p>}</section><PitchForm pitches={pitches} save={save} /></>;
}

function PitchForm({pitches, save}: {pitches: Pitch[]; save: (body: any) => Promise<boolean>}) {
  const [editing, setEditing] = useState<Pitch | null>(null);
  return <><section className="panel"><div className="panel-head"><div><h2>Recorded pitches</h2><p>Saving a pitch with a vendor ID also updates that vendor’s map coordinates.</p></div></div><div className="table-wrap"><table><thead><tr><th>Pitch</th><th>Vendor</th><th>Area</th><th>GPS</th><th></th></tr></thead><tbody>{pitches.map(pitch => <tr key={pitch.id}><td>{pitch.pitchCode}</td><td>{pitch.vendorId || 'Not linked'}</td><td>{pitch.area}</td><td>{pitch.lat && pitch.lng ? pitch.lat + ', ' + pitch.lng : 'Not recorded'}</td><td><button className="secondary" type="button" onClick={() => setEditing(pitch)}>Edit</button></td></tr>)}</tbody></table>{!pitches.length && <div className="empty">No pitches recorded yet.</div>}</div></section><form className="panel" key={editing?.id || 'new'} onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); if (await save({action: 'pitch', id: editing?.id || '', pitchCode: data.get('pitchCode'), ward: data.get('ward'), area: data.get('area'), activity: data.get('activity'), lat: data.get('lat'), lng: data.get('lng'), accuracy: data.get('accuracy'), verifiedAt: data.get('verifiedAt'), vendorId: data.get('vendorId')})) { setEditing(null); form.reset(); } }}><div className="panel-head"><div><h2>{editing ? 'Edit trading pitch' : 'Trading pitch'}</h2><p>Ward, permitted activity and the GPS check for a street pitch.</p></div></div><div className="form-grid"><label>Pitch reference<input name="pitchCode" required defaultValue={editing?.pitchCode || ''} /></label><label>Vendor ID<input name="vendorId" defaultValue={editing?.vendorId || ''} /></label><label>Ward<input name="ward" defaultValue={editing?.ward || ''} /></label><label>Area<input name="area" defaultValue={editing?.area || ''} /></label><label>Permitted activity<input name="activity" defaultValue={editing?.activity || ''} /></label><label>Latitude<input name="lat" defaultValue={editing?.lat || ''} /></label><label>Longitude<input name="lng" defaultValue={editing?.lng || ''} /></label><label>GPS accuracy<input name="accuracy" placeholder="metres" defaultValue={editing?.accuracy || ''} /></label><label>Verified on<input name="verifiedAt" type="date" defaultValue={editing?.verifiedAt || ''} /></label></div><div className="modal-foot"><button className="primary" type="submit">{editing ? 'Update pitch' : 'Save pitch'}</button>{editing && <button className="secondary" type="button" onClick={() => setEditing(null)}>Cancel edit</button>}</div></form></>;
}

function Permits({vendors, permits, save, onOpen}: {vendors: Vendor[]; permits: PermitRow[]; save: (body: any) => Promise<boolean>; onOpen: (vendor: Vendor, tab?: string) => void}) {
  const today = new Date();
  const soon = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const expiring = vendors.filter(vendor => vendor.expires && vendor.expires <= soon);
  return <><section className="panel"><div className="panel-head"><div><h2>Renewals due</h2><p>Permits that expire within 60 days, or have already expired.</p></div></div>{expiring.map(vendor => <div className="case-row" key={vendor.id}><div className="case-main"><strong>{vendor.business}</strong><p>{permit(vendor)} · expires {date(vendor.expires)}</p></div><button className="secondary" type="button" onClick={() => onOpen(vendor, 'Profile')}>Open vendor</button></div>)}{!expiring.length && <div className="empty">No permits expire in the next 60 days.</div>}</section><PermitAction vendors={vendors} save={save} /><section className="panel"><h2>Card and permit history</h2><div className="table-wrap"><table><thead><tr><th>Vendor</th><th>Action</th><th>Card serial</th><th>Note</th><th>When</th></tr></thead><tbody>{permits.map(item => <tr key={item.id}><td>{item.permitNumber}</td><td>{item.status}</td><td>{item.cardSerial || 'Not recorded'}</td><td>{item.note}</td><td>{date(item.createdAt)} · {item.actor}</td></tr>)}</tbody></table>{!permits.length && <div className="empty">No separate review, issue or revocation has been recorded yet.</div>}</div></section></>;
}

function PermitAction({vendors, save}: {vendors: Vendor[]; save: (body: any) => Promise<boolean>}) {
  return <form className="panel" onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); if (await save({action: 'permit', vendorId: data.get('vendorId'), status: data.get('status'), note: data.get('note'), cardSerial: data.get('cardSerial'), expires: data.get('expires')})) form.reset(); }}><div className="panel-head"><div><h2>Record a permit decision</h2><p>Review, approval, card issue, replacement, renewal or revocation. Each one stays in the history.</p></div></div><div className="form-grid"><label>Vendor<select name="vendorId" required>{vendors.map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.business} · {vendor.id}</option>)}</select></label><label>Action<select name="status"><option value="review">Review</option><option value="approved">Approve</option><option value="issued">Issue card</option><option value="replacement">Replace card</option><option value="renewed">Renew</option><option value="revoked">Revoke</option></select></label><label>Card serial<input name="cardSerial" /></label><label>New expiry<input name="expires" type="date" /></label><label>Decision note<input name="note" required minLength={3} /></label></div><div className="modal-foot"><button className="primary" type="submit">Save decision</button></div></form>;
}

function Tariffs({vendors, entries, tariffs, save}: {vendors: Vendor[]; entries: Entry[]; tariffs: Tariff[]; save: (body: any) => Promise<boolean>}) {
  const payments = entries.filter(entry => entry.kind === 'Payment');
  const reversals = entries.filter(entry => entry.kind === 'Reversal');
  return <><section className="panel"><h2>Fee approvals on record</h2><DatasetNotice label="approved fees" /><p>{tariffs.length ? tariffs.length + ' fee schedule row' + (tariffs.length === 1 ? '' : 's') + ' stored.' : 'No approved fees have been entered. Charges stay manual until a verified municipal fee is recorded.'}</p></section><form className="panel" onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const amount = Math.round(Number(data.get('amount') || 0) * 100); if (await save({action: 'tariff', category: data.get('category'), amountCents: amount, effectiveFrom: data.get('effectiveFrom'), effectiveTo: data.get('effectiveTo'), applicability: data.get('applicability'), approvalRef: data.get('approvalRef')})) form.reset(); }}><div className="panel-head"><div><h2>Approved fee</h2><p>Record only a fee the municipality has already approved. This screen does not invent a tariff.</p></div></div><div className="form-grid"><label>Category<input name="category" required /></label><label>Amount (ZAR)<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Effective from<input name="effectiveFrom" type="date" required /></label><label>Effective to<input name="effectiveTo" type="date" /></label><label>Applies to<input name="applicability" /></label><label>Approval reference<input name="approvalRef" required /></label></div><div className="modal-foot"><button className="primary" type="submit">Save fee</button></div></form><section className="panel"><div className="table-wrap"><table><thead><tr><th>Category</th><th>Amount</th><th>Effective</th><th>Approval</th></tr></thead><tbody>{tariffs.map(item => <tr key={item.id}><td>{item.category}<small>{item.applicability}</small></td><td>{money(item.amountCents)}</td><td>{date(item.effectiveFrom)}{item.effectiveTo ? ' – ' + date(item.effectiveTo) : ''}</td><td>{item.approvalRef}</td></tr>)}</tbody></table>{!tariffs.length && <div className="empty">No approved fees have been entered.</div>}</div></section><section className="panel"><h2>Receipts and reconciliation</h2>{payments.map(entry => { const reversed = reversals.find(item => item.reversalOf === entry.id); return <div className="ledger" key={entry.id}><div><strong>{money(entry.amount)}</strong><span>{reversed ? 'Reversed' : entry.reconciled ? 'Reconciled' : 'Not reconciled'}</span></div><p>{entry.note}</p><small>{entry.receiptNo ? 'Receipt ' + entry.receiptNo + ' · ' : ''}{entry.payMethod || 'Method not recorded'}{entry.payRef ? ' · ' + entry.payRef : ''} · {entry.cashier || entry.actor} · {date(entry.createdAt)}</small><div className="actions"><a className="secondary" href={'/api/receipt?eventId=' + encodeURIComponent(entry.id)}>{reversed ? 'Download reversed receipt' : 'Download receipt'}</a>{!reversed && !entry.reconciled && <button className="secondary" type="button" onClick={() => save({action: 'reconcile', id: entry.id})}>Mark reconciled</button>}{reversed && <small>Reversal {reversed.id}</small>}<button className="secondary" type="button" onClick={() => { const note = window.prompt('Why is this payment being reversed?'); if (note && note.trim().length > 2) save({action: 'reverse', id: entry.id, note: note.trim()}); }}>Reverse</button></div></div>; })}{!payments.length && <p className="muted">No payments recorded.</p>}{reversals.length > 0 && <h3>Reversals</h3>}{reversals.map(entry => <div className="ledger" key={entry.id}><p>{entry.note}</p><small>{money(entry.amount)} · {date(entry.createdAt)} · {entry.actor}</small></div>)}<p className="hint">Outstanding across the register: {money(vendors.reduce((total, vendor) => total + Math.max(0, balance(vendor.id, entries)), 0))}.</p></section></>;
}

function NoticeQueue({entries, vendors, deliveries, senderConnected, reload, onOpen}: {entries: Entry[]; vendors: Vendor[]; deliveries: Delivery[]; senderConnected: boolean; reload: () => Promise<void>; onOpen: (vendor: Vendor, tab?: string) => void}) {
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  async function retry(eventId: string) {
    if (busy) return;
    setBusy(eventId);
    setMessage('');
    try {
      const response = await fetch('/api/notice', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'send', eventId, idempotencyKey: crypto.randomUUID().replace(/-/g, '').slice(0, 24)})});
      const body: any = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'The notice was not sent.');
      setMessage(body.status ? body.status + '. ' + (body.message || '') : (body.message || 'The sender responded.'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The notice could not be sent.');
    } finally {
      setBusy('');
      try { await reload(); } catch { setMessage(current => current || 'The queue could not be refreshed.'); }
    }
  }
  return <section className="panel"><div className="panel-head"><div><h2>Notice delivery</h2><p>{senderConnected ? 'The municipal sender is connected. Acceptance is not proof the trader opened the message.' : 'The municipal sender is not connected. Handover, acknowledgement and PDF downloads are still recorded.'}</p>{message && <p className="hint">{message}</p>}</div></div>{deliveries.map(item => {
    const entry = entries.find(event => event.id === item.eventId);
    const vendor = vendors.find(record => record.id === entry?.vendorId);
    const failed = item.status === 'failed' || item.status === 'rejected';
    return <div className="case-row" key={item.id}><div className="case-main"><strong>{vendor?.business || 'Notice'}</strong><p>{item.method} · {item.status}{item.detail ? ' · ' + item.detail : ''}</p><small>{date(item.createdAt)} · {item.actor}</small></div>{vendor && <button className="secondary" type="button" onClick={() => onOpen(vendor, 'Compliance')}>Open</button>}{failed && senderConnected && <button className="secondary" type="button" disabled={busy === item.eventId} onClick={() => retry(item.eventId)}>Retry send</button>}</div>;
  })}{!deliveries.length && <div className="empty">No delivery records yet.</div>}</section>;
}

function AuditList({rows}: {rows: Audit[]}) {
  const [query, setQuery] = useState('');
  const [more, setMore] = useState<Audit[]>([]);
  const [hasMore, setHasMore] = useState(rows.length >= 200);
  const [loading, setLoading] = useState(false);
  const visible = [...rows, ...more];
  const filtered = visible.filter(row => !query || [row.entity, row.entityId, row.action, row.actor, row.beforeJson, row.afterJson].join(' ').toLowerCase().includes(query.toLowerCase()));
  async function loadOlder() {
    setLoading(true);
    try {
      const response = await fetch('/api/register?auditOffset=' + visible.length);
      const body: any = await response.json();
      if (Array.isArray(body.audit)) setMore(current => [...current, ...body.audit]);
      setHasMore(Boolean(body.hasMore));
    } finally { setLoading(false); }
  }
  return <section className="panel"><div className="panel-head"><div><h2>Audit history</h2><p>Changes to vendors, hubs, permits, payments and imports.</p></div><label className="search">Search<input value={query} onChange={event => setQuery(event.target.value)} aria-label="Search audit history" /></label></div>{filtered.map(row => <div className="history" key={row.id}><span className="timeline-dot" /><div><strong>{row.entity} · {row.action}</strong><p>{row.entityId}</p><small>{date(row.createdAt)} · {row.actor}</small>{row.beforeJson && row.beforeJson !== '""' && <p>Before: {row.beforeJson}</p>}{row.afterJson && row.afterJson !== '""' && <p>After: {row.afterJson}</p>}</div></div>)}{hasMore && <button className="secondary" type="button" disabled={loading} onClick={loadOlder}>{loading ? 'Loading older records…' : 'Load older records'}</button>}{!filtered.length && <div className="empty">No matching audit records.</div>}</section>;
}

function SettingsPanel({settings, requirements, senderConnected, save}: {settings: {documentNote?: string}; requirements: Requirement[]; senderConnected: boolean; save: (body: any) => Promise<boolean>}) {
  return <><section className="panel"><h2>Operational status</h2><p>Register database: available, because this workspace loaded.</p><p>Municipal notice sender: {senderConnected ? 'connected' : 'not connected'}. The sender address is set on the server. This screen cannot mark mail as sent.</p><p className="hint">Account recovery is done by the super user, who sets a temporary password from Users. There is no email reset.</p><DatasetNotice label="document rules" /><p>{requirements.length ? requirements.length + ' document rule' + (requirements.length === 1 ? '' : 's') + ' stored.' : 'No municipal document rules have been entered. Registration checklists fall back to the built-in labels until verified rules are recorded.'}</p></section><form className="panel" onSubmit={async event => { event.preventDefault(); const data = new FormData(event.currentTarget); await save({action: 'settings', documentNote: data.get('documentNote')}); }}><label>Document requirements note<textarea name="documentNote" rows={4} defaultValue={settings.documentNote || ''} /></label><button className="primary" type="submit">Save note</button></form><form className="panel" onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); if (await save({action: 'requirement', ruleRef: data.get('ruleRef'), category: data.get('category'), documentLabel: data.get('documentLabel'), validityMonths: Number(data.get('validityMonths') || 0)})) form.reset(); }}><div className="panel-head"><div><h2>Compliance requirement</h2><p>Record a rule reference the municipality already uses. This system does not supply by-laws.</p></div></div><div className="form-grid"><label>Rule reference<input name="ruleRef" required /></label><label>Trade category<input name="category" /></label><label>Document<input name="documentLabel" required /></label><label>Valid for months<input name="validityMonths" type="number" min={0} defaultValue={0} /></label></div><button className="primary" type="submit">Add requirement</button>{requirements.map(item => <p key={item.id}>{item.ruleRef} · {item.documentLabel}{item.category ? ' · ' + item.category : ''}{item.validityMonths ? ' · ' + item.validityMonths + ' months' : ''}</p>)}</form></>;
}

function ImportPanel({rows, save}: {rows: ImportRow[]; save: (body: any) => Promise<boolean>}) {
  const [editing, setEditing] = useState<ImportRow | null>(null);
  const record = editing ? JSON.parse(editing.payload || '{}') : null;
  return <>
    <form className="panel" onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); if (await save({action: 'import', csv: data.get('csv')})) form.reset(); }}>
      <div className="panel-head"><div><h2>Legacy import</h2><p>Paste rows with a header: name, business, type, and optionally sector, hub, unit, address, lat, lng, phone, email, issued, expires. Nothing is added to the register until a pending row is approved. Rows that fail approval stay open for correction or an explicit reject.</p></div></div>
      <textarea name="csv" rows={8} required placeholder={'name,business,type,hub,unit\nAmahle Dube,Dube Stalls,Informal,,'} />
      <button className="primary" type="submit">Check rows</button>
    </form>
    <section className="panel">
      {rows.map(row => {
        const item = JSON.parse(row.payload || '{}');
        return <div className="case-row" key={row.id}>
          <div className="case-main"><strong>{item.business || 'Row'}</strong><p>{row.status}{row.note ? ' · ' + row.note : ''}</p><small>{item.name} · {item.type}</small></div>
          <div className="actions">
            {row.status === 'pending' && <button className="secondary" type="button" onClick={() => save({action: 'approve-import', id: row.id})}>Approve import</button>}
            {['pending', 'needs-correction', 'invalid', 'duplicate', 'rejected'].includes(row.status) && <button className="secondary" type="button" onClick={() => setEditing(row)}>{row.status === 'rejected' ? 'Correct and reopen' : 'Edit row'}</button>}
            {['pending', 'needs-correction', 'invalid', 'duplicate'].includes(row.status) && <button className="secondary" type="button" onClick={() => { const note = window.prompt('Why is this import row rejected?'); if (note && note.trim().length > 2) save({action: 'reject-import', id: row.id, note: note.trim()}); }}>Reject</button>}
          </div>
        </div>;
      })}
      {!rows.length && <div className="empty">No import batches yet.</div>}
    </section>
    {editing && record && <form className="panel" key={editing.id} onSubmit={async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      if (await save({action: 'edit-import', id: editing.id, reopen: editing.status === 'rejected' ? 'yes' : '', name: data.get('name'), business: data.get('business'), type: data.get('type'), sector: data.get('sector'), hub: data.get('hub'), unit: data.get('unit'), address: data.get('address'), lat: data.get('lat'), lng: data.get('lng'), phone: data.get('phone'), email: data.get('email'), issued: data.get('issued'), expires: data.get('expires')})) setEditing(null);
    }}>
      <div className="panel-head"><div><h2>Correct import row</h2><p>{editing.status === 'rejected' ? 'Saving reopens this rejected row for another approval attempt.' : 'Fix the fields that blocked approval, then approve again.'}</p></div><button className="secondary" type="button" onClick={() => setEditing(null)}>Close</button></div>
      <div className="form-grid">
        <label>Name<input name="name" required defaultValue={record.name || ''} /></label>
        <label>Business<input name="business" required defaultValue={record.business || ''} /></label>
        <label>Type<select name="type" defaultValue={record.type || 'Informal'}><option>Formal</option><option>Informal</option></select></label>
        <label>Sector<input name="sector" defaultValue={record.sector || ''} /></label>
        <label>Hub<input name="hub" defaultValue={record.hub || ''} /></label>
        <label>Unit / pitch<input name="unit" defaultValue={record.unit || ''} /></label>
        <label>Address<input name="address" defaultValue={record.address || ''} /></label>
        <label>Latitude<input name="lat" defaultValue={record.lat || ''} /></label>
        <label>Longitude<input name="lng" defaultValue={record.lng || ''} /></label>
        <label>Phone<input name="phone" defaultValue={record.phone || ''} /></label>
        <label>Email<input name="email" defaultValue={record.email || ''} /></label>
        <label>Issued<input name="issued" type="date" defaultValue={record.issued || ''} /></label>
        <label>Expires<input name="expires" type="date" defaultValue={record.expires || ''} /></label>
      </div>
      <div className="modal-foot"><button className="primary" type="submit">Save correction</button><button className="secondary" type="button" onClick={() => setEditing(null)}>Cancel</button></div>
    </form>}
  </>;
}

function SessionsPanel() {
  const [sessions, setSessions] = useState<{createdAt: string; expiresAt: string; device: string; current: boolean}[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { fetch('/api/auth', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'sessions'})}).then(response => response.json()).then((body: any) => { if (body.sessions) setSessions(body.sessions); else setError(body.error || 'Could not load sessions.'); }).catch(() => setError('Could not load sessions.')); }, []);
  return <section className="panel"><div className="panel-head"><div><h2>This account’s devices</h2><p>If a device is lost, sign it out. A forgotten password is replaced by the super user with a temporary password. There is no self-service email reset.</p></div></div>{error && <div className="field-alert" role="alert">{error}</div>}{sessions.map(session => <div className="history" key={session.createdAt + session.device}><span className="timeline-dot" /><div><strong>{session.current ? 'This device' : 'Other device'}</strong><p>{session.device || 'Unknown device'}</p><small>Signed in {date(session.createdAt)} · expires {date(session.expiresAt)}</small></div></div>)}{!sessions.length && !error && <p className="muted">No other session details were returned.</p>}</section>;
}
