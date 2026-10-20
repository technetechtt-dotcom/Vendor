import assert from 'node:assert/strict';

/** Shared acceptance flow: run against real HTTP or the same route handlers with SQLite. */
export async function runScenarios(send, base = 'https://staging.example') {
  const secret = () => crypto.randomUUID() + crypto.randomUUID();
  const ownerPassword = secret();
  const bootstrap = secret();
  const origin = new URL(base).origin;
  const call = async (path, body, token = '', expected = 200) => {
    const headers = {origin, ...(token ? {authorization: 'Bearer ' + token} : {})};
    if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const request = new Request(base + path, {method: body === undefined ? 'GET' : 'POST', headers, ...(body === undefined ? {} : {body: body instanceof FormData ? body : JSON.stringify(body)})});
    const response = await send(request);
    const result = await response.json();
    assert.equal(response.status, expected, path + ': ' + (result.error || response.status));
    return result;
  };
  // Direct fixture accepts this owner-provided token; local HTTP setup is loopback only.
  if (globalThis.__vendorTestEnvironment) globalThis.__vendorTestEnvironment.bootstrap = bootstrap;
  await call('/api/register', undefined, '', 401);
  await call('/api/backup', undefined, '', 401);
  const setup = await call('/api/auth', {action: 'setup', name: 'Acceptance Owner', email: 'owner@example.invalid', password: ownerPassword, setupToken: bootstrap});
  const owner = setup.token;
  assert.equal(setup.user.role, 'superuser');
  await call('/api/auth', {action: 'setup', name: 'Duplicate', email: 'duplicate@example.invalid', password: secret(), setupToken: bootstrap}, '', 409);
  const accounts = {};
  const credentials = {};
  for (const role of ['office', 'finance', 'field']) {
    const password = secret();
    const email = role + '@example.invalid';
    await call('/api/auth', {action: 'save-user', user: {name: 'Acceptance ' + role, email, role, password, active: true}}, owner);
    const login = await call('/api/auth', {action: 'login', email, password});
    assert.equal(login.user.mustChangePassword, true);
    await call('/api/register', undefined, login.token, 403);
    const newPassword = secret();
    const changed = await call('/api/auth', {action: 'change-password', currentPassword: password, password: newPassword}, login.token);
    credentials[role] = {email, password: newPassword};
    assert.equal(changed.user.mustChangePassword, false);
    accounts[role] = login.token;
  }
  const hub = await call('/api/register', {action: 'hub', name: 'Acceptance Test Hub'}, accounts.office);
  await call('/api/register', {action: 'unit', hubId: hub.id, unitCode: 'QA-01', capacity: 1, status: 'available', notes: 'Synthetic acceptance unit'}, accounts.office);
  const vendor = {id: '', name: 'Acceptance Trader', business: 'Synthetic Test Business', type: 'Formal', sector: 'Testing', hub: 'Acceptance Test Hub', unit: 'QA-01', address: '', lat: '', lng: '', phone: '', email: 'trader@example.invalid', issued: '2026-10-01', expires: '2099-03-31', status: 'Pending review', documents: [], files: [], photo: ''};
  await call('/api/register', {action: 'vendor', vendor}, accounts.finance, 403);
  const created = await call('/api/register', {action: 'vendor', vendor}, accounts.office);
  const vendorId = created.id;
  assert.ok(vendorId.startsWith('SPM-'));
  await call('/api/register', {action: 'vendor', vendor: {...vendor, name: 'Second Trader'}}, accounts.office, 400);
  await call('/api/register', undefined, accounts.field, 403);
  const opened = await call('/api/register?vendorId=' + encodeURIComponent(vendorId), undefined, accounts.field);
  assert.equal(opened.vendor.business, vendor.business);
  const fee = {action: 'event', vendorId, kind: 'Charge', amount: 10000, note: 'Acceptance fee record', due: '', idempotencyKey: secret()};
  await call('/api/register', fee, accounts.office, 403);
  await call('/api/register', fee, accounts.finance);
  const payment = {action: 'event', vendorId, kind: 'Payment', amount: 10000, note: 'Acceptance payment record', due: '', receiptNo: 'QA-' + crypto.randomUUID(), payMethod: 'Cash', payRef: 'SYNTHETIC', idempotencyKey: secret()};
  const paid = await call('/api/register', payment, accounts.finance);
  const replay = await call('/api/register', payment, accounts.finance);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.id, paid.id);
  await call('/api/register', {action: 'reconcile', id: paid.id, reference: 'QA-BATCH', reconciliationRef: 'QA-BATCH', note: 'Acceptance reconciliation'}, accounts.finance);
  await call('/api/register', {action: 'permit', vendorId, status: 'approved', note: 'Synthetic checklist reviewed'}, accounts.office);
  const serial = 'QA-' + crypto.randomUUID().slice(0, 12).toUpperCase();
  await call('/api/register', {action: 'permit', vendorId, status: 'issued', cardSerial: serial, note: 'Synthetic card issued'}, accounts.office);
  await call('/api/register', {action: 'settings', documentNote: 'Preserve this approved requirements note'}, owner);
  await call('/api/permit', {action: 'card-event', vendorId, kind: 'handed-over', cardSerial: serial, note: 'Synthetic handover'}, accounts.office);
  const event = await call('/api/register', {action: 'event', vendorId, kind: 'Warning', amount: 0, note: 'Synthetic compliance finding', due: '', idempotencyKey: secret()}, accounts.field);
  await call('/api/notice', {action: 'deliver', eventId: event.id, method: 'handover'}, accounts.finance, 403);
  await call('/api/notice', {action: 'deliver', eventId: event.id, method: 'handover'}, accounts.field);
  await call('/api/notice', {action: 'send', eventId: event.id}, accounts.field, 409);
  await call('/api/register', {action: 'resolve', id: event.id, note: 'Synthetic follow-up completed', idempotencyKey: secret()}, accounts.field, 403);
  await call('/api/register', {action: 'resolve', id: event.id, note: 'Synthetic follow-up completed', idempotencyKey: secret()}, accounts.office);
  const bundle = await call('/api/register', undefined, owner);
  assert.equal(bundle.vendors.length, 1);
  assert.equal(bundle.events.filter(row => row.kind === 'Payment').length, 1);
  assert.equal(bundle.settings.documentNote, 'Preserve this approved requirements note');
  assert.equal(bundle.auditIntegrity.intact, true);
  const snapshot = await call('/api/backup', undefined, owner);
  const verified = await call('/api/backup', {action: 'verify', document: snapshot}, owner);
  assert.equal(verified.restorable, true);
  await call('/api/backup', undefined, accounts.office, 403);
  const sessions = await call('/api/auth', {action: 'sessions'}, owner);
  assert.ok(sessions.sessions.some(session => session.current));
  for (const path of ['/api/auth', '/api/register', '/api/backup', '/api/notice', '/api/permit', '/api/renewals', '/api/releases']) {
    const response = await send(new Request(base + path, {method: 'POST', headers: {origin: 'https://hostile.example', 'Content-Type': 'application/json'}, body: '{}'}));
    assert.equal(response.status, 403, path + ': hostile origin was accepted');
  }
  return {vendorId, ownerToken: owner, fieldCredentials: credentials.field, fieldToken: accounts.field, checks: ['bootstrap', 'temporary passwords', 'all four roles', 'registration', 'allocation conflict', 'lookup', 'fees', 'payment replay', 'reconciliation', 'permit/card lifecycle', 'notice permissions', 'case resolution', 'audit seal', 'backup verification', 'sessions', 'hostile origins']};
}
