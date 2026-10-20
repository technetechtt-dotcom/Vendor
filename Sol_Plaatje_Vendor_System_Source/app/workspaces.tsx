'use client';
import {useEffect, useState} from 'react';
import {money, balance, permit, Vendor, Entry} from '../lib/data';
import {Reports} from './reports-ui';
import {Capability} from '../lib/capabilities';

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
type PermitDocument = {id: string; vendorId: string; kind: string; cardSerial: string; permitExpires: string; note: string; actor: string; createdAt: string};
type Renewal = {id: string; vendorId: string; expires: string; daysLeft: number; status: string; createdAt: string; recorded?: boolean};
type AuditIntegrity = {rows: number; sealedRows: number; intact: boolean; sealed: boolean; sealedAt: string};
type IntegrityIssue = {id: string; entity: string; entityId: string; parentId: string; issue: string; payload: string; detectedAt: string; resolvedAt: string};

export type Operations = {
  units: Unit[];
  pitches: Pitch[];
  tariffs: Tariff[];
  permits: PermitRow[];
  requirements: Requirement[];
  allocationHistory: History[];
  imports: ImportRow[];
  audit: Audit[];
  permitDocuments: PermitDocument[];
  renewals: Renewal[];
  auditIntegrity: AuditIntegrity;
  integrityIssues: IntegrityIssue[];
  settings: {documentNote?: string};
};

const date = (value: string) => value ? new Date(value.length === 10 ? value + 'T12:00:00' : value).toLocaleDateString('en-ZA', {day: 'numeric', month: 'short', year: 'numeric'}) : 'Not recorded';
const dateTime = (value: string) => value ? new Date(value).toLocaleString('en-ZA', {dateStyle: 'medium', timeStyle: 'short'}) : 'Not recorded';

function auditObject(value: string) {
  try {
    const parsed = JSON.parse(value || 'null');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

function auditValue(value: unknown) {
  if (value === undefined || value === null || value === '') return 'not recorded';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function auditChanges(row: Audit) {
  const before = auditObject(row.beforeJson);
  const after = auditObject(row.afterJson);
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .slice(0, 10)
    .map(key => ({key: key.replaceAll('_', ' '), before: auditValue(before[key]), after: auditValue(after[key])}));
}

export function Workspaces({page, vendors, entries, hubs, deliveries, operations, senderConnected, capabilities, save, reload, onOpen}: {
  page: string;
  vendors: Vendor[];
  entries: Entry[];
  hubs: Hub[];
  deliveries: Delivery[];
  operations: Operations;
  senderConnected: boolean;
  capabilities: Capability[];
  save: (body: any) => Promise<boolean>;
  reload: () => Promise<void>;
  onOpen: (vendor: Vendor, tab?: string) => void;
}) {
  const vendorName = (id: string) => vendors.find(vendor => vendor.id === id)?.business || id;
  const can = (capability: Capability) => capabilities.includes(capability);
  if (page === 'Follow-ups') return <FollowUps entries={entries} vendors={vendors} save={save} onOpen={onOpen} can={can} />;
  if (page === 'Reports') return <Reports vendors={vendors} entries={entries} tariffs={operations.tariffs} can={can} />;
  if (page === 'Unit inventory') return <Inventory hubs={hubs} units={operations.units} pitches={operations.pitches} history={operations.allocationHistory} vendorName={vendorName} save={save} can={can} />;
  if (page === 'Permits & cards') return <Permits vendors={vendors} permits={operations.permits} documents={operations.permitDocuments} renewals={operations.renewals} save={save} onOpen={onOpen} can={can} />;
  if (page === 'Tariffs & reconciliation') return <Tariffs vendors={vendors} entries={entries} tariffs={operations.tariffs} save={save} can={can} />;
  if (page === 'Notice queue') return <NoticeQueue entries={entries} vendors={vendors} deliveries={deliveries} senderConnected={senderConnected} reload={reload} onOpen={onOpen} />;
  if (page === 'Audit') return <AuditList rows={operations.audit} integrity={operations.auditIntegrity} issues={operations.integrityIssues} save={save} can={can} />;
  if (page === 'Settings') return <SettingsPanel settings={operations.settings} requirements={operations.requirements} senderConnected={senderConnected} save={save} can={can} />;
  if (page === 'Import') return <ImportPanel rows={operations.imports} save={save} can={can} />;
  if (page === 'Backup') return <BackupPanel can={can} />;
  if (page === 'Sessions') return <SessionsPanel />;
  return null;
}

function BackupPanel({can}: {can: (capability: Capability) => boolean}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [document, setDocument] = useState<Record<string, unknown> | null>(null);
  const [requiredPhrase, setRequiredPhrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const allowed = can('backup.read');
  async function download() {
    setBusy(true);
    setError('');
    setResult('');
    try {
      const response = await fetch('/api/backup');
      if (!response.ok) {
        const body: any = await response.json().catch(() => ({}));
        throw new Error(body.error || 'The backup could not be prepared.');
      }
      const rows = response.headers.get('X-Backup-Rows') || '?';
      const checksum = response.headers.get('X-Backup-Checksum') || '';
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = 'vendor-register-backup.json';
      link.click();
      URL.revokeObjectURL(url);
      setResult(`Backup downloaded: ${rows} records. Checksum ${checksum.slice(0, 16)}… Keep the file encrypted and store it off this server.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The backup could not be prepared.');
    } finally {
      setBusy(false);
    }
  }
  async function verify(file: File) {
    setBusy(true);
    setError('');
    setResult('');
    setDocument(null);
    setRequiredPhrase('');
    setConfirmation('');
    try {
      const candidate = JSON.parse(await file.text()) as Record<string, unknown>;
      const response = await fetch('/api/backup', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'verify', document: candidate})});
      const body = await response.json() as {error?: string; ok?: boolean; restorable?: boolean; counts?: Record<string, number>; generatedAt?: string; generatedBy?: string; checksumMatches?: boolean; mismatches?: string[]; confirmation?: string};
      if (!response.ok) throw new Error(body.error || 'The backup could not be verified.');
      if (body.ok && body.restorable) {
        setDocument(candidate);
        setRequiredPhrase(body.confirmation || '');
      }
      setResult(body.ok
        ? `Backup verified. ${Object.values(body.counts || {}).reduce((total, count) => total + Number(count || 0), 0)} records and stored files checked, exported ${body.generatedAt} by ${body.generatedBy}.${body.restorable ? ' It is ready to restore.' : ' This older backup can be verified but not restored automatically.'}`
        : `This backup does NOT match its own manifest. Checksum match: ${body.checksumMatches}. ${(body.mismatches || []).join('; ') || 'Row counts differ.'}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The backup could not be verified.');
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!document || confirmation !== requiredPhrase) return;
    if (!window.confirm('Restore this verified backup now? Current operational vendor records and uploaded files will be replaced. User accounts and the append-only audit trail will be kept.')) return;
    setBusy(true);
    setError('');
    setResult('');
    try {
      const response = await fetch('/api/backup', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'restore', document, confirmation})});
      const body = await response.json() as {error?: string; objects?: number};
      if (!response.ok) throw new Error(body.error || 'The backup could not be restored.');
      setResult(`Restore completed and audited. ${body.objects || 0} uploaded files were restored. Reloading the register…`);
      setDocument(null);
      setConfirmation('');
      window.setTimeout(() => window.location.reload(), 900);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The backup could not be restored.');
    } finally {
      setBusy(false);
    }
  }
  return <section className="panel">
    <div className="panel-head"><div><h2>Backup and recovery</h2><p>Export, verify and restore the operational register and every uploaded photograph or document.</p></div></div>
    {!allowed && <p className="hint" role="status">Only the super user can export, verify or restore a register backup.</p>}
    {allowed && <>
      <ul className="hint">
        <li>Version 2 backups include database records and the uploaded file contents referenced by those records.</li>
        <li>Password hashes and live sign-in tokens are excluded. A restore keeps the current accounts and active sessions.</li>
        <li>The append-only audit history is retained and receives a restore entry.</li>
        <li>This file contains personal data. Store it encrypted, restrict who can open it, and delete old copies once the retention period ends.</li>
      </ul>
      <div className="modal-foot">
        <button className="primary" type="button" disabled={busy} onClick={download}>{busy ? 'Preparing…' : 'Download full backup'}</button>
        <label className="secondary file-button">Verify and prepare restore<input type="file" accept="application/json" onChange={event => { const file = event.target.files?.[0]; if (file) void verify(file); event.target.value = ''; }} /></label>
      </div>
      {document && <div className="restore-confirmation"><h3>Restore verified backup</h3><p>Type <strong>{requiredPhrase}</strong> to unlock the restore action.</p><label>Restore confirmation<input value={confirmation} onChange={event => setConfirmation(event.target.value.toUpperCase())} autoComplete="off" /></label><button className="danger-button" type="button" disabled={busy || confirmation !== requiredPhrase} onClick={restore}>{busy ? 'Restoring…' : 'Restore operational register'}</button></div>}
    </>}
    {error && <div className="field-alert" role="alert">{error}</div>}
    {result && <div className="field-success" role="status">{result}</div>}
  </section>;
}

function FollowUps({entries, vendors, save, onOpen, can}: {entries: Entry[]; vendors: Vendor[]; save: (body: any) => Promise<boolean>; onOpen: (vendor: Vendor, tab?: string) => void; can: (capability: Capability) => boolean}) {
  const today = new Date().toISOString().slice(0, 10);
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [renewalBusy, setRenewalBusy] = useState(false);
  const [renewalMessage, setRenewalMessage] = useState('');
  const [renewalError, setRenewalError] = useState('');
  const overdueRenewals = renewals.filter(item => item.daysLeft < 0).length;
  async function runRenewalScan(preview: boolean) {
    setRenewalBusy(true);
    setRenewalError('');
    setRenewalMessage('');
    try {
      const response = await fetch('/api/renewals', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: preview ? 'preview' : 'scan'})});
      const body: any = await response.json();
      if (!response.ok) throw new Error(body.error || 'The renewal scan could not be completed.');
      setRenewals(Array.isArray(body.reminders) ? body.reminders : []);
      setRenewalMessage(preview
        ? body.reminders.length + ' permit' + (body.reminders.length === 1 ? '' : 's') + ' fall inside the next ' + body.windowDays + ' days.'
        : body.created + ' new renewal task' + (body.created === 1 ? '' : 's') + ' created. ' + body.reminders.length + ' permit' + (body.reminders.length === 1 ? '' : 's') + ' inside the warning window.');
    } catch (cause) {
      setRenewalError(cause instanceof Error ? cause.message : 'The renewal scan could not be completed.');
    } finally {
      setRenewalBusy(false);
    }
  }
  const rows = entries.filter(entry => ['Warning', 'Violation'].includes(entry.kind) && !entry.resolved).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  return <><section className="panel">
    <div className="panel-head"><div><h2>Permit renewals due</h2><p>Permits that expire within 60 days, or have already expired. A scan records one task per vendor per expiry date, so the same renewal is never queued twice.</p></div></div>
    <div className="modal-foot">
      <button className="secondary" type="button" disabled={renewalBusy || !can('permits.write')} onClick={() => runRenewalScan(true)}>Check without recording</button>
      <button className="primary" type="button" disabled={renewalBusy || !can('permits.write')} onClick={() => runRenewalScan(false)}>{renewalBusy ? 'Scanning…' : 'Record renewal tasks'}</button>
    </div>
    {!can('permits.write') && <p className="hint">Your role can see renewal work but cannot record renewal tasks.</p>}
    {renewalError && <div className="field-alert" role="alert">{renewalError}</div>}
    {renewalMessage && <p className="hint" role="status">{renewalMessage}{overdueRenewals ? ' ' + overdueRenewals + ' already expired.' : ''}</p>}
    {!!renewals.length && <div className="table-wrap stack"><table>
      <caption className="sr-only">Permits inside the renewal window</caption>
      <thead><tr><th scope="col" data-label="Vendor">Vendor</th><th scope="col" data-label="Expires">Expires</th><th scope="col" className="num" data-label="Days left">Days left</th><th scope="col" data-label="Position">Position</th><th scope="col" data-label="Task recorded">Task recorded</th></tr></thead>
      <tbody>{renewals.map(item => <tr key={item.vendorId + item.expires}><td data-label="Vendor"><strong>{vendors.find(vendor => vendor.id === item.vendorId)?.business || item.vendorId}</strong><small>{item.vendorId}</small></td><td data-label="Expires">{date(item.expires)}</td><td className={(item.daysLeft < 0 ? 'due-text' : '' + ' num')} data-label="Days left"><strong>{item.daysLeft < 0 ? Math.abs(item.daysLeft) + ' overdue' : item.daysLeft}</strong></td><td data-label="Position">{item.status}</td><td data-label="Task recorded">{item.recorded ? 'Recorded' : 'Not yet'}</td></tr>)}</tbody>
    </table></div>}
  </section>
  <section className="panel"><div className="panel-head"><div><h2>Follow-up tasks</h2><p>Open warnings and violations, with the officer who owns the next visit.</p></div></div>{rows.map(entry => {
    const vendor = vendors.find(item => item.id === entry.vendorId);
    const overdue = entry.due && entry.due < today;
    return <div className="follow-up-case" key={entry.id}><form className="case-row" onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); if (await save({action: 'assign', id: entry.id, owner: data.get('owner'), severity: data.get('severity')})) form.reset(); }}><span className={'case-icon ' + (entry.kind === 'Violation' ? 'red' : '')} /><div className="case-main"><div><strong>{vendor?.business || entry.vendorId}</strong><span className={'badge ' + (overdue ? 'bad' : 'amber')}>{overdue ? 'Overdue' : entry.kind}</span></div><p>{entry.note}</p><small>{date(entry.createdAt)} · {entry.actor}{entry.owner ? ' · Owner ' + entry.owner : ' · No owner'}{entry.due ? ' · Follow up ' + date(entry.due) : ' · No follow-up date'}{entry.severity ? ' · ' + entry.severity : ''}</small><div className="form-grid"><label>Owner<input name="owner" defaultValue={entry.owner || ''} required /></label><label>Severity<select name="severity" defaultValue={entry.severity || 'Medium'}><option>Low</option><option>Medium</option><option>High</option></select></label></div></div><div className="actions"><button className="secondary" type="submit">Assign</button>{vendor && <button className="secondary" type="button" onClick={() => onOpen(vendor, 'Compliance')}>Open case</button>}</div></form><form className="case-row" onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); if (await save({action: 'schedule', id: entry.id, due: data.get('due'), plan: data.get('plan')})) form.reset(); }}><div className="case-main"><p>{entry.due && entry.due < today ? 'Scheduled task overdue ' + date(entry.due) : entry.due ? 'Scheduled task ' + date(entry.due) : 'No visit scheduled yet.'}{entry.checklist ? ' · ' + entry.checklist : ''}</p><label>What the next visit should check<textarea name="plan" required minLength={3} defaultValue={entry.checklist || ''} /></label><label>Follow-up date<input name="due" type="date" required defaultValue={entry.due || ''} /></label><label>Case status<select name="status" defaultValue={entry.caseStatus || 'open'} onChange={event => { void save({action: 'transition', id: entry.id, caseStatus: event.target.value}); }}><option value="open">Open</option><option value="follow-up">Follow-up</option><option value="escalated">Escalated</option></select></label></div><button className="secondary" type="submit">Save scheduled task</button></form><form className="case-row" onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); if (await save({action: 'event', vendorId: entry.vendorId, kind: 'Inspection', note: String(data.get('findings') || ''), due: '', amount: 0, followUpOf: entry.id, idempotencyKey: crypto.randomUUID().replace(/-/g, '').slice(0, 24)})) form.reset(); }}><div className="case-main"><label>Completed visit findings<textarea name="findings" required minLength={3} placeholder="What was found on the visit that already happened" /></label>{entries.filter(item => item.followUpOf === entry.id && item.kind === 'Inspection').map(item => <p key={item.id}>Completed inspection · {date(item.createdAt)} · {item.actor}<br />{item.note}</p>)}</div><button className="secondary" type="submit">Record completed inspection</button></form></div>;
  })}{!rows.length && <div className="empty">No open follow-ups.</div>}</section></>;
}

function DatasetNotice({label}: {label: string}) {
  return <p className="hint">These {label} are only what staff have entered here. Their presence does not confirm that the municipality’s verified operational dataset is complete.</p>;
}

function Inventory({hubs, units, pitches, history, vendorName, save, can}: {hubs: Hub[]; units: Unit[]; pitches: Pitch[]; history: History[]; vendorName: (id: string) => string; save: (body: any) => Promise<boolean>; can: (capability: Capability) => boolean}) {
  const [editing, setEditing] = useState<Unit | null>(null);
  const [busy, setBusy] = useState(false);
  const clear = () => setEditing(null);
  return <>
    <section className="panel"><h2>Hub inventories</h2><DatasetNotice label="hub units and pitches" /><p>{units.length} unit record{units.length === 1 ? '' : 's'} and {pitches.length} pitch record{pitches.length === 1 ? '' : 's'} are stored. Empty counts mean the verified municipal inventory has not been loaded.</p></section>
    <form className="panel" key={editing?.id || 'new'} onSubmit={async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      setBusy(true);
      try {
        if (await save({action: 'unit', id: editing?.id || '', hubId: data.get('hubId'), unitCode: data.get('unitCode'), capacity: Number(data.get('capacity') || 1), status: data.get('status'), notes: data.get('notes')})) { clear(); form.reset(); }
      } finally { setBusy(false); }
    }}>
      <div className="panel-head"><div><h2>{editing ? 'Edit hub unit ' + editing.unitCode : 'Hub unit'}</h2><p>Capacity and whether the unit is available, occupied, reserved or unavailable. A unit held by an allocated trader stays occupied until the allocation is released or transferred.</p></div>{editing && <button className="secondary" type="button" onClick={clear}>Cancel edit</button>}</div>
      <div className="form-grid">
        <label>Hub<select name="hubId" required defaultValue={editing?.hubId || hubs[0]?.id || ''}>{hubs.map(hub => <option key={hub.id} value={hub.id}>{hub.name}</option>)}</select></label>
        <label>Unit code<input name="unitCode" required maxLength={40} defaultValue={editing?.unitCode || ''} /></label>
        <label>Capacity<input name="capacity" type="number" min={1} max={500} defaultValue={editing?.capacity ?? 1} required /></label>
        <label>Status<select name="status" defaultValue={editing?.status || 'available'}><option>available</option><option>occupied</option><option>reserved</option><option>unavailable</option></select></label>
        <label>Notes<input name="notes" maxLength={300} defaultValue={editing?.notes || ''} /></label>
      </div>
      <div className="modal-foot"><button className="primary" type="submit" disabled={busy || !can('hubs.write')}>{editing ? 'Update unit' : 'Save unit'}</button></div>{!can('hubs.write') && <p className="hint">Your role can review the inventory but cannot change units.</p>}
    </form>
    <section className="panel">
      <div className="table-wrap stack"><table><thead><tr><th scope="col" data-label="Hub">Hub</th><th scope="col" data-label="Unit">Unit</th><th scope="col" className="num" data-label="Capacity">Capacity</th><th scope="col" data-label="Status">Status</th><th scope="col" data-label="Notes">Notes</th><th scope="col" data-label=""></th></tr></thead><tbody>{units.map(unit => <tr key={unit.id}><td data-label="Hub">{unit.hub || unit.hubId}</td><td data-label="Unit">{unit.unitCode}</td><td className="num" data-label="Capacity">{unit.capacity}</td><td data-label="Status">{unit.status}</td><td data-label="Notes">{unit.notes}</td><td data-label=""><div className="actions">{can('hubs.write') && <><button className="secondary" type="button" onClick={() => setEditing(unit)}>Edit</button><button className="secondary" type="button" onClick={async () => { if (!window.confirm('Remove unit ' + unit.unitCode + ' from ' + (unit.hub || unit.hubId) + '? Recorded change history is kept.')) return; await save({action: 'unit-delete', id: unit.id}); }}>Remove</button></>}</div></td></tr>)}</tbody></table>{!units.length && <div className="empty">No units recorded yet. Allocating a trader creates an occupied unit.</div>}</div>
    </section>
    <section className="panel"><h2>Allocation history</h2>{history.map(item => <div className="history" key={item.id}><span className="timeline-dot" /><div><strong>{item.action}</strong><p>{vendorName(item.vendorId)} · unit {item.unitCode}. {item.note}</p><small>{date(item.createdAt)} · {item.actor}</small></div></div>)}{!history.length && <p className="muted">No allocation changes recorded yet.</p>}</section>
    <PitchForm pitches={pitches} save={save} />
  </>;
}

function PitchForm({pitches, save}: {pitches: Pitch[]; save: (body: any) => Promise<boolean>}) {
  const [editing, setEditing] = useState<Pitch | null>(null);
  return <><section className="panel"><div className="panel-head"><div><h2>Recorded pitches</h2><p>Saving a pitch with a vendor ID also updates that vendor’s map coordinates.</p></div></div><div className="table-wrap stack"><table><thead><tr><th scope="col" data-label="Pitch">Pitch</th><th scope="col" data-label="Vendor">Vendor</th><th scope="col" data-label="Area">Area</th><th scope="col" data-label="GPS">GPS</th><th scope="col" data-label=""></th></tr></thead><tbody>{pitches.map(pitch => <tr key={pitch.id}><td data-label="Pitch">{pitch.pitchCode}</td><td data-label="Vendor">{pitch.vendorId || 'Not linked'}</td><td data-label="Area">{pitch.area}</td><td data-label="GPS">{pitch.lat && pitch.lng ? pitch.lat + ', ' + pitch.lng : 'Not recorded'}</td><td data-label=""><button className="secondary" type="button" onClick={() => setEditing(pitch)}>Edit</button></td></tr>)}</tbody></table>{!pitches.length && <div className="empty">No pitches recorded yet.</div>}</div></section><form className="panel" key={editing?.id || 'new'} onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); if (await save({action: 'pitch', id: editing?.id || '', pitchCode: data.get('pitchCode'), ward: data.get('ward'), area: data.get('area'), activity: data.get('activity'), lat: data.get('lat'), lng: data.get('lng'), accuracy: data.get('accuracy'), verifiedAt: data.get('verifiedAt'), vendorId: data.get('vendorId')})) { setEditing(null); form.reset(); } }}><div className="panel-head"><div><h2>{editing ? 'Edit trading pitch' : 'Trading pitch'}</h2><p>Ward, permitted activity and the GPS check for a street pitch.</p></div></div><div className="form-grid"><label>Pitch reference<input name="pitchCode" required defaultValue={editing?.pitchCode || ''} /></label><label>Vendor ID<input name="vendorId" defaultValue={editing?.vendorId || ''} /></label><label>Ward<input name="ward" defaultValue={editing?.ward || ''} /></label><label>Area<input name="area" defaultValue={editing?.area || ''} /></label><label>Permitted activity<input name="activity" defaultValue={editing?.activity || ''} /></label><label>Latitude<input name="lat" defaultValue={editing?.lat || ''} /></label><label>Longitude<input name="lng" defaultValue={editing?.lng || ''} /></label><label>GPS accuracy<input name="accuracy" placeholder="metres" defaultValue={editing?.accuracy || ''} /></label><label>Verified on<input name="verifiedAt" type="date" defaultValue={editing?.verifiedAt || ''} /></label></div><div className="modal-foot"><button className="primary" type="submit">{editing ? 'Update pitch' : 'Save pitch'}</button>{editing && <button className="secondary" type="button" onClick={() => setEditing(null)}>Cancel edit</button>}</div></form></>;
}

function Permits({vendors, permits, documents, renewals, save, onOpen, can}: {vendors: Vendor[]; permits: PermitRow[]; documents: PermitDocument[]; renewals: Renewal[]; save: (body: any) => Promise<boolean>; onOpen: (vendor: Vendor, tab?: string) => void; can: (capability: Capability) => boolean}) {
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [soon] = useState(() => new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const expiring = vendors.filter(vendor => vendor.expires && vendor.expires <= soon);
  const currentSerial = (vendorId: string) => permits.filter(item => item.vendorId === vendorId).sort((left, right) => left.createdAt.localeCompare(right.createdAt)).reduce((serial, item) => item.status === 'revoked' ? '' : ['issued', 'replacement'].includes(item.status) && item.cardSerial ? item.cardSerial : serial, '');
  const eligibleCards = vendors.filter(vendor => !vendor.sample && permit(vendor) === 'Approved' && currentSerial(vendor.id));
  const [cardFor, setCardFor] = useState('');
  const [cardKind, setCardKind] = useState('printed');
  const [cardSerial, setCardSerial] = useState('');
  const [cardNote, setCardNote] = useState('');
  const [cardBusy, setCardBusy] = useState(false);
  const [cardMessage, setCardMessage] = useState('');
  const [cardError, setCardError] = useState('');
  async function recordCardEvent() {
    setCardBusy(true);
    setCardError('');
    setCardMessage('');
    try {
      const response = await fetch('/api/permit', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'card-event', vendorId: cardFor, kind: cardKind, cardSerial, note: cardNote})});
      const body: any = await response.json();
      if (!response.ok) throw new Error(body.error || 'The card event could not be recorded.');
      setCardMessage('Card event recorded: ' + cardKind + '.');
      setCardSerial('');
      setCardNote('');
      await save({action: 'settings', documentNote: undefined}).catch(() => false);
    } catch (cause) {
      setCardError(cause instanceof Error ? cause.message : 'The card event could not be recorded.');
    } finally {
      setCardBusy(false);
    }
  }
  return <>
    <section className="panel">
      <div className="panel-head"><div><h2>Renewals due</h2><p>Permits that expire within 60 days, or have already expired. Use the Follow-ups workspace to record the renewal task.</p></div></div>
      {expiring.map(vendor => <div className="case-row" key={vendor.id}>
        <div className="case-main"><strong>{vendor.business}</strong><p>{permit(vendor)} · expires {date(vendor.expires)}{vendor.expires < today ? ' · overdue' : ''}</p></div>
        <div className="actions">
          <a className="secondary" href={'/api/permit?vendorId=' + encodeURIComponent(vendor.id)}>Permit certificate</a>
          <button className="secondary" type="button" onClick={() => onOpen(vendor, 'Profile')}>Open vendor</button>
        </div>
      </div>)}
      {!expiring.length && <div className="empty">No permits expire in the next 60 days.</div>}
      {!!renewals.length && <p className="hint">{renewals.length} renewal task{renewals.length === 1 ? '' : 's'} already recorded for this window.</p>}
    </section>
    <PermitAction vendors={vendors} save={save} can={can} />
    <section className="panel">
      <div className="panel-head"><div><h2>Card lifecycle</h2><p>Record a card being printed, handed over, or reported lost. Permit issue, replacement and revocation are recorded above.</p></div></div>
      <div className="form-grid">
        <label>Vendor<select value={cardFor} onChange={event => { const vendorId = event.target.value; setCardFor(vendorId); setCardSerial(currentSerial(vendorId)); }} required><option value="">Choose an approved vendor with an issued card</option>{eligibleCards.map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.business} · {vendor.id}</option>)}</select></label>
        <label>Card event<select value={cardKind} onChange={event => setCardKind(event.target.value)}><option value="printed">Card printed</option><option value="handed-over">Card handed over</option><option value="reported-lost">Card reported lost</option></select></label>
        <label>Current card serial<input value={cardSerial} readOnly aria-readonly="true" /></label>
        <label>Note{cardKind === 'reported-lost' ? ' (required)' : ''}<input value={cardNote} onChange={event => setCardNote(event.target.value)} maxLength={300} /></label>
      </div>
      <div className="modal-foot"><button className="primary" type="button" disabled={cardBusy || !can('permits.write') || !cardFor} onClick={recordCardEvent}>{cardBusy ? 'Recording…' : 'Record card event'}</button></div>
      {!can('permits.write') && <p className="hint">Your role can review cards but cannot record card events.</p>}
      {can('permits.write') && !eligibleCards.length && <p className="hint">No vendor currently has both an approved permit and an issued card. Record approval and card issue before printing or handover.</p>}
      {cardError && <div className="field-alert" role="alert">{cardError}</div>}
      {cardMessage && <div className="field-success" role="status">{cardMessage}</div>}
      <div className="table-wrap stack"><table>
        <caption className="sr-only">Permit certificates produced and card lifecycle events</caption>
        <thead><tr><th scope="col" data-label="Vendor">Vendor</th><th scope="col" data-label="Event">Event</th><th scope="col" data-label="Card serial">Card serial</th><th scope="col" data-label="Note">Note</th><th scope="col" data-label="Recorded">Recorded</th></tr></thead>
        <tbody>{documents.slice(0, 50).map(item => <tr key={item.id}><td data-label="Vendor"><strong>{vendors.find(vendor => vendor.id === item.vendorId)?.business || item.vendorId}</strong></td><td data-label="Event">{item.kind}</td><td data-label="Card serial">{item.cardSerial || 'Not recorded'}</td><td data-label="Note">{item.note}</td><td data-label="Recorded">{date(item.createdAt)} · {item.actor}</td></tr>)}</tbody>
      </table>{!documents.length && <div className="empty">No certificate has been produced and no card event recorded yet.</div>}</div>
    </section>
    <section className="panel">
      <h2>Card and permit history</h2>
      <div className="table-wrap stack"><table>
        <caption className="sr-only">Permit decisions recorded for each vendor</caption>
        <thead><tr><th scope="col" data-label="Vendor">Vendor</th><th scope="col" data-label="Action">Action</th><th scope="col" data-label="Card serial">Card serial</th><th scope="col" data-label="Note">Note</th><th scope="col" data-label="When">When</th></tr></thead>
        <tbody>{permits.map(item => <tr key={item.id}><td data-label="Vendor">{vendors.find(vendor => vendor.id === item.vendorId)?.business || item.permitNumber}</td><td data-label="Action">{item.status}</td><td data-label="Card serial">{item.cardSerial || 'Not recorded'}</td><td data-label="Note">{item.note}</td><td data-label="When">{date(item.createdAt)} · {item.actor}</td></tr>)}</tbody>
      </table>{!permits.length && <div className="empty">No separate review, issue or revocation has been recorded yet.</div>}</div>
    </section>
  </>;
}

function PermitAction({vendors, save, can}: {vendors: Vendor[]; save: (body: any) => Promise<boolean>; can: (capability: Capability) => boolean}) {
  return <form className="panel" onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); if (await save({action: 'permit', vendorId: data.get('vendorId'), status: data.get('status'), note: data.get('note'), cardSerial: data.get('cardSerial'), expires: data.get('expires')})) form.reset(); }}><div className="panel-head"><div><h2>Record a permit decision</h2><p>Review, approval, card issue, replacement, renewal or revocation. Each one stays in the history.</p></div></div><div className="form-grid"><label>Vendor<select name="vendorId" required defaultValue=""><option value="" disabled>Choose a vendor</option>{vendors.map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.business} · {vendor.id}</option>)}</select></label><label>Action<select name="status" defaultValue="review"><option value="review">Review</option><option value="approved">Approve</option><option value="issued">Issue card</option><option value="replacement">Replace card</option><option value="renewed">Renew</option><option value="revoked">Revoke</option></select></label><label>Card serial<input name="cardSerial" /></label><label>New expiry<input name="expires" type="date" /></label><label>Decision note<input name="note" required minLength={3} /></label></div><div className="modal-foot"><button className="primary" type="submit" disabled={!can('permits.write')}>Save decision</button></div>{!can('permits.write') && <p className="hint">Your role can review permits but cannot record a permit decision.</p>}</form>;
}

function Tariffs({vendors, entries, tariffs, save, can}: {vendors: Vendor[]; entries: Entry[]; tariffs: Tariff[]; save: (body: any) => Promise<boolean>; can: (capability: Capability) => boolean}) {
  const payments = entries.filter(entry => entry.kind === 'Payment');
  const reversals = entries.filter(entry => entry.kind === 'Reversal');
  async function reconcile(entry: Entry) {
    const vendor = vendors.find(item => item.id === entry.vendorId);
    const reference = window.prompt(`Enter the bank statement, cash-up or reconciliation reference for ${vendor?.business || entry.vendorId}.`);
    if (!reference || reference.trim().length < 3) return;
    if (!window.confirm(`Reconcile ${money(entry.amount)} for ${vendor?.business || entry.vendorId} against ${reference.trim()}?`)) return;
    await save({action: 'reconcile', id: entry.id, reference: reference.trim()});
  }
  return <>
    <section className="panel"><h2>Fee approvals on record</h2><DatasetNotice label="approved fees" /><p>{tariffs.length ? tariffs.length + ' fee schedule row' + (tariffs.length === 1 ? '' : 's') + ' stored.' : 'No approved fees have been entered. Charges stay manual until a verified municipal fee is recorded.'}</p></section>
    <form className="panel" onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const amount = Math.round(Number(data.get('amount') || 0) * 100); if (await save({action: 'tariff', category: data.get('category'), amountCents: amount, effectiveFrom: data.get('effectiveFrom'), effectiveTo: data.get('effectiveTo'), applicability: data.get('applicability'), approvalRef: data.get('approvalRef')})) form.reset(); }}>
      <div className="panel-head"><div><h2>Approved fee</h2><p>Record only a fee the municipality has already approved. This screen does not invent a tariff.</p></div></div>
      <div className="form-grid"><label>Category<input name="category" required /></label><label>Amount (ZAR)<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Effective from<input name="effectiveFrom" type="date" required /></label><label>Effective to<input name="effectiveTo" type="date" /></label><label>Applies to<input name="applicability" /></label><label>Approval reference<input name="approvalRef" required /></label></div>
      <div className="modal-foot"><button className="primary" type="submit" disabled={!can('finance.tariffs')}>Save fee</button></div>{!can('finance.tariffs') && <p className="hint">Your role cannot record an approved fee.</p>}
    </form>
    <section className="panel"><div className="table-wrap stack"><table><thead><tr><th scope="col" data-label="Category">Category</th><th scope="col" className="num" data-label="Amount">Amount</th><th scope="col" data-label="Effective">Effective</th><th scope="col" data-label="Approval">Approval</th></tr></thead><tbody>{tariffs.map(item => <tr key={item.id}><td data-label="Category">{item.category}<small>{item.applicability}</small></td><td className="num" data-label="Amount">{money(item.amountCents)}</td><td data-label="Effective">{date(item.effectiveFrom)}{item.effectiveTo ? ' – ' + date(item.effectiveTo) : ''}</td><td data-label="Approval">{item.approvalRef}</td></tr>)}</tbody></table>{!tariffs.length && <div className="empty">No approved fees have been entered.</div>}</div></section>
    <section className="panel"><h2>Receipts and reconciliation</h2>{payments.map(entry => {
      const reversed = reversals.find(item => item.reversalOf === entry.id);
      const vendor = vendors.find(item => item.id === entry.vendorId);
      return <div className="ledger" key={entry.id}><div><strong>{money(entry.amount)}</strong><span>{reversed ? 'Reversed' : entry.reconciled ? 'Reconciled' : 'Not reconciled'}</span></div><p><strong>{vendor?.business || 'Unknown vendor'}</strong> · <span className="mono">{entry.vendorId}</span><br />{entry.note}</p><small>{entry.receiptNo ? 'Receipt ' + entry.receiptNo + ' · ' : ''}{entry.payMethod || 'Method not recorded'}{entry.payRef ? ' · Payment ref ' + entry.payRef : ''} · {entry.cashier || entry.actor} · {date(entry.createdAt)}{entry.reconciliationRef ? ' · Reconciled against ' + entry.reconciliationRef : ''}</small><div className="actions"><a className="secondary" aria-label={`Download receipt for ${vendor?.business || entry.vendorId}`} href={'/api/receipt?eventId=' + encodeURIComponent(entry.id)}>{reversed ? 'Download reversed receipt' : 'Download receipt'}</a>{!reversed && !entry.reconciled && can('finance.write') && <button className="secondary" type="button" onClick={() => void reconcile(entry)}>Mark reconciled</button>}{reversed && <small>Reversal {reversed.id}</small>}{!reversed && can('finance.write') && <button className="secondary" type="button" onClick={() => { const note = window.prompt('Why is this payment being reversed?'); if (note && note.trim().length > 2 && window.confirm(`Reverse ${money(entry.amount)} for ${vendor?.business || entry.vendorId}?`)) void save({action: 'reverse', id: entry.id, note: note.trim()}); }}>Reverse</button>}</div></div>;
    })}{!payments.length && <p className="muted">No payments recorded.</p>}{reversals.length > 0 && <h3>Reversals</h3>}{reversals.map(entry => <div className="ledger" key={entry.id}><p>{entry.note}</p><small>{money(entry.amount)} · {date(entry.createdAt)} · {entry.actor}</small></div>)}<p className="hint">Outstanding across the register: {money(vendors.reduce((total, vendor) => total + Math.max(0, balance(vendor.id, entries)), 0))}.</p></section>
  </>;
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
    const detail = item.detail && ![item.method, item.status].some(value => item.detail?.toLowerCase() === value.toLowerCase()) ? item.detail : '';
    return <div className="case-row" key={item.id}><div className="case-main"><strong>{vendor?.business || 'Unknown vendor'} · {entry?.kind || 'Notice'}</strong><p>{entry?.note || 'The source compliance finding is unavailable.'}</p><small>Delivery: {item.method} · {item.status}{detail ? ' · ' + detail : ''}<br />Recipient: {vendor?.email || vendor?.phone || 'No contact detail recorded'} · {dateTime(item.createdAt)} · {item.actor}</small></div>{vendor && <button className="secondary" type="button" onClick={() => onOpen(vendor, 'Compliance')}>Open case</button>}{failed && senderConnected && <button className="secondary" type="button" disabled={busy === item.eventId} onClick={() => retry(item.eventId)}>Retry send</button>}</div>;
  })}{!deliveries.length && <div className="empty">No delivery records yet.</div>}</section>;
}

function AuditList({rows, integrity, issues, save, can}: {rows: Audit[]; integrity: AuditIntegrity; issues: IntegrityIssue[]; save: (body: {action: string; id: string; note: string}) => Promise<boolean>; can: (capability: Capability) => boolean}) {
  const [query, setQuery] = useState('');
  const [more, setMore] = useState<Audit[]>([]);
  const [hasMore, setHasMore] = useState(rows.length >= 200);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resolving, setResolving] = useState('');
  const visible = [...rows, ...more];
  const filtered = visible.filter(row => !query || [row.entity, row.entityId, row.action, row.actor, row.beforeJson, row.afterJson].join(' ').toLowerCase().includes(query.toLowerCase()));
  async function loadOlder() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/register?auditOffset=' + visible.length);
      const body: any = await response.json();
      if (!response.ok) throw new Error(body.error || 'Older audit records could not be loaded.');
      if (Array.isArray(body.audit)) setMore(current => [...current, ...body.audit]);
      setHasMore(Boolean(body.hasMore));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Older audit records could not be loaded.'); }
    finally { setLoading(false); }
  }
  return <section className="panel"><div className="panel-head"><div><h2>Audit history</h2><p>Changes to vendors, hubs, permits, payments and imports. Each entry records who acted, with their account id.</p></div><label className="search">Search<input value={query} onChange={event => setQuery(event.target.value)} aria-label="Search audit history" /></label></div>
    {error && <p className="field-alert" role="alert">{error}</p>}
    <section aria-label="Data integrity"><h3>Data integrity review</h3><p>{issues.length ? `${issues.length} quarantined record(s) need review. Review the original record and restore or correct it before closing the issue.` : 'No unresolved quarantined records.'}</p>
      {issues.map(issue => <div className="case-row" key={issue.id}><div className="case-main"><strong>{issue.entity.replaceAll('_', ' ')} · {issue.issue}</strong><p>Record: {issue.entityId} · Parent: {issue.parentId || 'not recorded'}</p><small>Detected {dateTime(issue.detectedAt)}</small><details><summary>Preserved record details</summary><pre>{JSON.stringify(auditObject(issue.payload), null, 2)}</pre></details></div>{can('settings.write') && <button className="secondary" type="button" disabled={Boolean(resolving)} onClick={async () => {
        const note = window.prompt('Describe how this record was reviewed and repaired. Closing an issue does not repair or restore the record.');
        if (!note || note.trim().length < 3) return;
        if (!window.confirm('Close this integrity issue after review? The preserved details remain in the audit trail.')) return;
        setResolving(issue.id);
        try { await save({action: 'integrity-resolve', id: issue.id, note: note.trim()}); } finally { setResolving(''); }
      }}>{resolving === issue.id ? 'Saving…' : 'Record review and close'}</button>}</div>)}
    </section>
    <div className={integrity.intact ? 'field-success' : 'field-alert'} role="status">
      {integrity.sealed
        ? (integrity.intact
          ? `Tamper check passed. ${integrity.rows} entries sealed, last sealed ${date(integrity.sealedAt)}.`
          : `Tamper check FAILED. ${integrity.rows} entries are stored but the seal covers ${integrity.sealedRows}. An audit entry was altered or removed outside this application.`)
        : 'The audit seal has not been written yet. It is written after the next recorded change.'}
    </div>{filtered.map(row => { const changes = auditChanges(row); return <div className="history" key={row.id}><span className="timeline-dot" /><div><strong>{row.entity.replaceAll('-', ' ')} · {row.action}</strong><p className="mono">{row.entityId}</p><small>{dateTime(row.createdAt)} · {row.actor}</small>{changes.length > 0 && <ul className="audit-diff">{changes.map(change => <li key={change.key}><span>{change.key}</span><del>{change.before}</del><ins>{change.after}</ins></li>)}</ul>}</div></div>; })}{hasMore && <button className="secondary" type="button" disabled={loading} onClick={loadOlder}>{loading ? 'Loading older records…' : 'Load older records'}</button>}{!filtered.length && <div className="empty">No matching audit records.</div>}</section>;
}

function SettingsPanel({settings, requirements, senderConnected, save, can}: {settings: {documentNote?: string}; requirements: Requirement[]; senderConnected: boolean; save: (body: any) => Promise<boolean>; can: (capability: Capability) => boolean}) {
  const [editing, setEditing] = useState<Requirement | null>(null);
  const [note, setNote] = useState(settings.documentNote || '');
  const [busy, setBusy] = useState(false);
  return <>
    <section className="panel"><h2>Operational status</h2><p>Register database: available, because this workspace loaded.</p><p>Municipal notice sender: {senderConnected ? 'connected' : 'not connected'}. The sender address is set on the server. This screen cannot mark mail as sent.</p><p className="hint">Account recovery is done by the super user, who sets a temporary password from Users. There is no email reset.</p><DatasetNotice label="document rules" /><p>{requirements.length ? requirements.length + ' document rule' + (requirements.length === 1 ? '' : 's') + ' stored.' : 'No municipal document rules have been entered. Registration checklists fall back to the built-in labels until verified rules are recorded.'}</p></section>
    <form className="panel" onSubmit={async event => { event.preventDefault(); setBusy(true); try { await save({action: 'settings', documentNote: note}); } finally { setBusy(false); } }}>
      <label>Document requirements note<textarea name="documentNote" rows={4} value={note} onChange={event => setNote(event.target.value)} /></label>
      <button className="primary" type="submit" disabled={busy || !can('settings.write')}>Save note</button>
    </form>
    <form className="panel" key={editing?.id || 'new'} onSubmit={async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      setBusy(true);
      try {
        if (await save({action: 'requirement', id: editing?.id || '', ruleRef: data.get('ruleRef'), category: data.get('category'), documentLabel: data.get('documentLabel'), validityMonths: Number(data.get('validityMonths') || 0)})) { setEditing(null); form.reset(); }
      } finally { setBusy(false); }
    }}>
      <div className="panel-head"><div><h2>{editing ? 'Edit compliance requirement' : 'Compliance requirement'}</h2><p>Record a rule reference the municipality already uses. This system does not supply by-laws.</p></div>{editing && <button className="secondary" type="button" onClick={() => setEditing(null)}>Cancel edit</button>}</div>
      <div className="form-grid">
        <label>Rule reference<input name="ruleRef" required maxLength={80} defaultValue={editing?.ruleRef || ''} /></label>
        <label>Trade category<input name="category" maxLength={80} defaultValue={editing?.category || ''} /></label>
        <label>Document<input name="documentLabel" required maxLength={80} defaultValue={editing?.documentLabel || ''} /></label>
        <label>Valid for months<input name="validityMonths" type="number" min={0} max={120} defaultValue={editing?.validityMonths ?? 0} /></label>
      </div>
      <button className="primary" type="submit" disabled={busy || !can('requirements.write')}>{editing ? 'Update requirement' : 'Add requirement'}</button>
      <div className="table-wrap stack"><table><thead><tr><th scope="col" data-label="Rule">Rule</th><th scope="col" data-label="Document">Document</th><th scope="col" data-label="Category">Category</th><th scope="col" data-label="Validity">Validity</th><th scope="col" data-label=""></th></tr></thead><tbody>{requirements.map(item => <tr key={item.id}><td data-label="Rule">{item.ruleRef}</td><td data-label="Document">{item.documentLabel}</td><td data-label="Category">{item.category || 'Not set'}</td><td data-label="Validity">{item.validityMonths ? item.validityMonths + ' months' : 'Does not expire'}</td><td data-label=""><div className="actions">{can('requirements.write') && <><button className="secondary" type="button" onClick={() => setEditing(item)}>Edit</button><button className="secondary" type="button" onClick={async () => { if (!window.confirm('Remove the requirement ' + item.ruleRef + ' (' + item.documentLabel + ')? Registration checklists will fall back to the remaining rules.')) return; await save({action: 'requirement-delete', id: item.id}); }}>Remove</button></>}</div></td></tr>)}</tbody></table>{!requirements.length && <p className="muted">No requirements recorded yet.</p>}</div>
    </form>
  </>;
}

function ImportPanel({rows, save, can}: {rows: ImportRow[]; save: (body: any) => Promise<boolean>; can: (capability: Capability) => boolean}) {
  const [editing, setEditing] = useState<ImportRow | null>(null);
  const record = editing ? JSON.parse(editing.payload || '{}') : null;
  return <>
    <form className="panel" onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); if (await save({action: 'import', csv: data.get('csv')})) form.reset(); }}>
      <div className="panel-head"><div><h2>Legacy import</h2><p>Paste rows with a header: name, business, type, and optionally sector, hub, unit, address, lat, lng, phone, email, issued, expires. Nothing is added to the register until a pending row is approved. Rows that fail approval stay open for correction or an explicit reject.</p></div></div>
      <textarea name="csv" rows={8} required placeholder={'name,business,type,hub,unit\nAmahle Dube,Dube Stalls,Informal,,'} />
      <button className="primary" type="submit" disabled={!can('import.write')}>Check rows</button>
    </form>
    <section className="panel">
      {rows.map(row => {
        const item = JSON.parse(row.payload || '{}');
        return <div className="case-row" key={row.id}>
          <div className="case-main"><strong>{item.business || 'Row'}</strong><p>{row.status}{row.note ? ' · ' + row.note : ''}</p><small>{item.name} · {item.type}</small></div>
          <div className="actions">
            {row.status === 'pending' && can('import.write') && <button className="secondary" type="button" onClick={() => save({action: 'approve-import', id: row.id})}>Approve import</button>}
            {can('import.write') && ['pending', 'needs-correction', 'invalid', 'duplicate', 'rejected'].includes(row.status) && <button className="secondary" type="button" onClick={() => setEditing(row)}>{row.status === 'rejected' ? 'Correct and reopen' : 'Edit row'}</button>}
            {can('import.write') && ['pending', 'needs-correction', 'invalid', 'duplicate'].includes(row.status) && <button className="secondary" type="button" onClick={() => { const note = window.prompt('Why is this import row rejected?'); if (note && note.trim().length > 2) save({action: 'reject-import', id: row.id, note: note.trim()}); }}>Reject</button>}
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
      <div className="modal-foot"><button className="primary" type="submit" disabled={!can('import.write')}>Save correction</button><button className="secondary" type="button" onClick={() => setEditing(null)}>Cancel</button></div>
    </form>}
  </>;
}

function sessionRole(role: string) {
  return role === 'superuser' ? 'Super user' : role === 'field' ? 'Field officer' : 'Office user';
}

function SessionsPanel() {
  const [sessions, setSessions] = useState<{id: string; createdAt: string; expiresAt: string; device: string; current: boolean}[]>([]);
  const [users, setUsers] = useState<{id: string; name: string; role: string}[]>([]);
  const [subject, setSubject] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function loadSessions(userId: string) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'sessions', userId})});
      const body: any = await response.json();
      if (body.sessions) setSessions(body.sessions);
      else { setSessions([]); setError(body.error || 'Could not load sessions.'); }
    } catch {
      setError('Could not load sessions.');
    } finally {
      setBusy(false);
    }
  }
  async function revokeSession(sessionId: string) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'revoke-session', userId: subject, sessionId})});
      const body = await response.json() as {error?: string};
      if (!response.ok) throw new Error(body.error || 'Could not sign out that device.');
      await loadSessions(subject);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign out that device.');
      setBusy(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/auth', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'users'})});
        if (!response.ok) return;
        const body: any = await response.json();
        if (!cancelled && Array.isArray(body.users)) setUsers(body.users);
      } catch { /* Only a super user can list every account. */ }
    })();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/auth', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'sessions'})});
        const body: any = await response.json();
        if (cancelled) return;
        if (body.sessions) setSessions(body.sessions);
        else { setSessions([]); setError(body.error || 'Could not load sessions.'); }
      } catch {
        if (!cancelled) setError('Could not load sessions.');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return <section className="panel">
    <div className="panel-head"><div><h2>{subject ? 'Devices signed in as ' + (users.find(user => user.id === subject)?.name || 'this account') : 'This account’s devices'}</h2><p>If a device is lost, sign it out. A forgotten password is replaced by the super user with a temporary password. There is no self-service email reset.</p></div></div>
    {users.length > 0 && <div className="filters"><label>Account<select aria-label="Choose the account whose devices to review" value={subject} onChange={event => { setSubject(event.target.value); void loadSessions(event.target.value); }}><option value="">My account</option>{users.map(user => <option key={user.id} value={user.id}>{user.name} · {sessionRole(user.role)}</option>)}</select></label></div>}
    {error && <div className="field-alert" role="alert">{error}</div>}
    {busy && <p className="muted">Loading devices…</p>}
    {sessions.map(session => <div className="history session-row" key={session.id}><span className="timeline-dot" /><div><strong>{session.current ? 'This device' : session.device}</strong>{session.current && <p>{session.device}</p>}<small>Signed in {dateTime(session.createdAt)} · expires {dateTime(session.expiresAt)}</small></div>{!session.current && <button className="danger-button" type="button" disabled={busy} onClick={() => void revokeSession(session.id)}>Sign out device</button>}</div>)}
    {!sessions.length && !error && !busy && <p className="muted">No other session details were returned.</p>}
  </section>;
}
