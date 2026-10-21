'use client';
import {useEffect, useState} from 'react';
import {Building2, Check, Loader2} from 'lucide-react';

export type Account = {id: string; name: string; email: string; role: 'superuser' | 'office' | 'finance' | 'field'; mustChangePassword?: boolean};
type OrgUser = Omit<Account, 'mustChangePassword'> & {active: number; mustChangePassword?: number};
type AuthReply = {error?: string; user: Account; users: OrgUser[]};

const roleLabel = (role: string) => role === 'superuser' ? 'Super user' : role === 'finance' ? 'Finance officer' : role === 'field' ? 'Field officer' : 'Registration / compliance';

function fieldValue(form: HTMLFormElement, name: string) {
  const field = form.elements.namedItem(name);
  return field && 'value' in field ? String(field.value) : '';
}

export function LoginScreen({onSuccess, setupRequired = false, setupTokenRequired = false}: {onSuccess: (user: Account) => void; setupRequired?: boolean; setupTokenRequired?: boolean}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="login-screen">
      <section className="login-card">
        <div className="brand"><div className="brand-mark"><Building2 size={26} /></div><div>Sol Plaatje<span>MUNICIPALITY</span></div></div>
        <p className="eyebrow">LOCAL ECONOMIC DEVELOPMENT</p>
        <h1>{setupRequired ? 'Create the administrator' : 'Sign in to the vendor register'}</h1>
        <p className="subtitle">{setupRequired ? 'This register has no users yet. Create the super user once. The password is not shown again.' : 'Office staff and the super user sign in here. Field officers sign in on the field visits app.'}</p>
        <form onSubmit={async event => {
          event.preventDefault();
          const form = event.currentTarget;
          const name = fieldValue(form, 'name').trim();
          const email = fieldValue(form, 'email').trim();
          const password = fieldValue(form, 'password');
          const confirm = fieldValue(form, 'confirm');
          const setupToken = fieldValue(form, 'setupToken');
          setBusy(true);
          setError('');
          try {
            if (setupRequired && password !== confirm) throw new Error('Enter the same password twice.');
            const response = await fetch('/api/auth', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(setupRequired ? {action: 'setup', name, email, password, setupToken} : {action: 'login', email, password})});
            const body: AuthReply = await response.json();
            if (!response.ok) throw new Error(body.error || 'Sign-in failed');
            onSuccess(body.user);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Sign-in failed');
          } finally {
            setBusy(false);
          }
        }}>
          {error && <div className="field-alert" role="alert">{error}</div>}
          {setupRequired && <label>Full name<input name="name" autoComplete="name" required /></label>}
          {setupRequired && setupTokenRequired && <label>Administrator setup token<input name="setupToken" type="password" autoComplete="off" required minLength={32} /><small>Use the one-time setup token supplied by the system owner.</small></label>}
          <label>Email address<input name="email" type="email" autoComplete="username" required /></label>
          <label>Password<input name="password" type="password" autoComplete={setupRequired ? 'new-password' : 'current-password'} required minLength={setupRequired ? 12 : 8} /></label>
          {setupRequired && <label>Confirm password<input name="confirm" type="password" autoComplete="new-password" required minLength={12} /></label>}
          <button className="primary" disabled={busy} type="submit">{busy ? <Loader2 size={17} className="spin" /> : <Check size={17} />}{setupRequired ? 'Create administrator' : 'Sign in'}</button>
        </form>
      </section>
    </div>
  );
}

export function ChangePasswordScreen({onSuccess, onSignOut}: {onSuccess: (user: Account) => void; onSignOut: () => void}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="login-screen">
      <section className="login-card">
        <div className="brand"><div className="brand-mark"><Building2 size={26} /></div><div>Sol Plaatje<span>MUNICIPALITY</span></div></div>
        <p className="eyebrow">LOCAL ECONOMIC DEVELOPMENT</p>
        <h1>Choose a new password</h1>
        <p className="subtitle">This account cannot open the register until the password is replaced. Use a different password of at least 8 characters. Other devices signed in with the previous password are signed out.</p>
        <form onSubmit={async event => {
          event.preventDefault();
          const form = event.currentTarget;
          const currentPassword = fieldValue(form, 'currentPassword');
          const password = fieldValue(form, 'password');
          const confirm = fieldValue(form, 'confirm');
          setError('');
          if (password !== confirm) {
            setError('Enter the same new password twice.');
            return;
          }
          setBusy(true);
          try {
            const response = await fetch('/api/auth', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'change-password', currentPassword, password})});
            const body: AuthReply = await response.json();
            if (!response.ok) throw new Error(body.error || 'Could not change the password');
            onSuccess(body.user);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not change the password');
          } finally {
            setBusy(false);
          }
        }}>
          {error && <div className="field-alert" role="alert">{error}</div>}
          <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
          <label>New password<input name="password" type="password" autoComplete="new-password" required minLength={8} /></label>
          <label>Confirm new password<input name="confirm" type="password" autoComplete="new-password" required minLength={8} /></label>
          <button className="primary" disabled={busy} type="submit">{busy ? <Loader2 size={17} className="spin" /> : <Check size={17} />}Save password</button>
        </form>
        <button className="text-button" type="button" onClick={onSignOut}>Sign out</button>
      </section>
    </div>
  );
}

export function UsersScreen() {
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [draft, setDraft] = useState({id: '', name: '', email: '', role: 'office', password: '', active: true});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    const response = await fetch('/api/auth', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'users'})});
    const body: AuthReply = await response.json();
    if (!response.ok) throw new Error(body.error || 'Could not load users');
    setUsers(body.users);
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'users'}), signal: controller.signal})
      .then(async response => {
        const body: {users: OrgUser[]; error?: string} = await response.json();
        if (!response.ok) throw new Error(body.error || 'Could not load users');
        if (!controller.signal.aborted) setUsers(body.users);
      }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load users'); });
    return () => controller.abort();
  }, []);
  return (
    <section className="panel">
      <div className="panel-head"><div><h2>Organisation users</h2><p>Super user access, office staff and field officers</p></div></div>
      <form className="user-form" onSubmit={async event => {
        event.preventDefault();
        setBusy(true);
        setError('');
        setNotice('');
        try {
          const response = await fetch('/api/auth', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'save-user', user: draft})});
          const body: AuthReply = await response.json();
          if (!response.ok) throw new Error(body.error || 'Could not save this user');
          setDraft({id: '', name: '', email: '', role: 'office', password: '', active: true});
          setNotice(draft.id ? 'User updated.' : 'User added.');
          await load();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Could not save this user');
        } finally {
          setBusy(false);
        }
      }}>
        {error && <div className="field-alert" role="alert">{error}</div>}
        {notice && <div className="field-success" role="status"><Check size={16} />{notice}</div>}
        <div className="form-grid">
          <label>Full name<input value={draft.name} onChange={event => setDraft({...draft, name: event.target.value})} required /></label>
          <label>Email address<input type="email" value={draft.email} onChange={event => setDraft({...draft, email: event.target.value})} required /></label>
          <label>Role<select value={draft.role} onChange={event => setDraft({...draft, role: event.target.value})}><option value="office">Registration / compliance</option><option value="finance">Finance officer</option><option value="field">Field officer</option><option value="superuser">Super user</option></select></label>
          <label>{draft.id ? 'New password (optional)' : 'Temporary password'}<input type="password" autoComplete="new-password" value={draft.password} onChange={event => setDraft({...draft, password: event.target.value})} required={!draft.id} minLength={draft.password ? 8 : undefined} /></label>
        </div>
        <label className="check-line"><input type="checkbox" checked={draft.active} onChange={event => setDraft({...draft, active: event.target.checked})} />Account can sign in</label>
        <p className="hint">A password set for someone else is temporary. They must replace it the next time they sign in. There is no email reset: set a new temporary password here if they are locked out.</p>
        <div className="modal-foot user-form-actions"><button className="secondary" type="button" onClick={() => setDraft({id: '', name: '', email: '', role: 'office', password: '', active: true})}>Clear</button><button className="primary" disabled={busy} type="submit">{busy ? <Loader2 size={16} className="spin" /> : <Check size={16} />}{draft.id ? 'Save user' : 'Add user'}</button></div>
      </form>
      <div className="table-wrap stack"><table><thead><tr><th scope="col" data-label="Name">Name</th><th scope="col" data-label="Email">Email</th><th scope="col" data-label="Role">Role</th><th scope="col" data-label="Access">Access</th><th scope="col" data-label=""></th></tr></thead><tbody>
        {users.map(user => <tr key={user.id}><td data-label="Name"><strong>{user.name}</strong></td><td data-label="Email">{user.email}</td><td data-label="Role">{roleLabel(user.role)}</td><td data-label="Access">{user.active ? (user.mustChangePassword ? 'Must change password' : 'Active') : 'Disabled'}</td><td data-label=""><div className="actions"><button className="text-button" type="button" onClick={() => { setDraft({id: user.id, name: user.name, email: user.email, role: user.role, password: '', active: !!user.active}); setNotice(''); setError(''); }}>Edit</button><button className="text-button" type="button" onClick={async () => { setError(''); setNotice(''); try { const response = await fetch('/api/auth', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'revoke-sessions', userId: user.id})}); const body: AuthReply = await response.json(); if (!response.ok) throw new Error(body.error || 'Could not sign out devices'); setNotice('Signed out devices for ' + user.name + '.'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not sign out devices'); } }}>Sign out devices</button></div></td></tr>)}
      </tbody></table></div>
    </section>
  );
}
