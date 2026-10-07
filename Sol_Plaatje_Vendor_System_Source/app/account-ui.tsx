'use client';
import {useEffect, useState} from 'react';
import {Building2, Check, Loader2} from 'lucide-react';

export type Account = {id: string; name: string; email: string; role: 'superuser' | 'office' | 'field'};
type OrgUser = Account & {active: number};

const roleLabel = (role: string) => role === 'superuser' ? 'Super user' : role === 'field' ? 'Field officer' : 'Office user';

export function LoginScreen({onSuccess}: {onSuccess: (user: Account) => void}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bootstrap, setBootstrap] = useState(false);
  useEffect(() => {
    fetch('/api/auth').then(response => response.json()).then(body => setBootstrap(!!body.bootstrap)).catch(() => {});
  }, []);
  return (
    <div className="login-screen">
      <section className="login-card">
        <div className="brand"><div className="brand-mark"><Building2 size={26} /></div><div>Sol Plaatje<span>MUNICIPALITY</span></div></div>
        <p className="eyebrow">LOCAL ECONOMIC DEVELOPMENT</p>
        <h1>Sign in to the vendor register</h1>
        <p className="subtitle">Office staff and the super user sign in here. Field officers sign in on the field visits app.</p>
        <form onSubmit={async event => {
          event.preventDefault();
          setBusy(true);
          setError('');
          try {
            const response = await fetch('/api/auth', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'login', email, password})});
            const body = await response.json();
            if (!response.ok) throw new Error(body.error || 'Sign-in failed');
            onSuccess(body.user);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Sign-in failed');
          } finally {
            setBusy(false);
          }
        }}>
          {error && <div className="field-alert" role="alert">{error}</div>}
          <label>Email address<input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required /></label>
          <label>Password<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>
          <button className="primary" disabled={busy} type="submit">{busy ? <Loader2 size={17} className="spin" /> : <Check size={17} />}Sign in</button>
        </form>
        {bootstrap && <p className="login-hint">First super user: superuser@solplaatje.local · password SolPlaatje#2026. Change this password after signing in.</p>}
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
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Could not load users');
    setUsers(body.users);
  }
  useEffect(() => { load().catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load users')); }, []);
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
          const body = await response.json();
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
          <label>Role<select value={draft.role} onChange={event => setDraft({...draft, role: event.target.value})}><option value="office">Office user</option><option value="field">Field officer</option><option value="superuser">Super user</option></select></label>
          <label>{draft.id ? 'New password (optional)' : 'Password'}<input type="password" autoComplete="new-password" value={draft.password} onChange={event => setDraft({...draft, password: event.target.value})} required={!draft.id} minLength={draft.password ? 8 : undefined} /></label>
        </div>
        <label className="check-line"><input type="checkbox" checked={draft.active} onChange={event => setDraft({...draft, active: event.target.checked})} />Account can sign in</label>
        <div className="modal-foot user-form-actions"><button className="secondary" type="button" onClick={() => setDraft({id: '', name: '', email: '', role: 'office', password: '', active: true})}>Clear</button><button className="primary" disabled={busy} type="submit">{busy ? <Loader2 size={16} className="spin" /> : <Check size={16} />}{draft.id ? 'Save user' : 'Add user'}</button></div>
      </form>
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Access</th><th></th></tr></thead><tbody>
        {users.map(user => <tr key={user.id}><td><strong>{user.name}</strong></td><td>{user.email}</td><td>{roleLabel(user.role)}</td><td>{user.active ? 'Active' : 'Disabled'}</td><td><button className="text-button" type="button" onClick={() => { setDraft({id: user.id, name: user.name, email: user.email, role: user.role, password: '', active: !!user.active}); setNotice(''); setError(''); }}>Edit</button></td></tr>)}
      </tbody></table></div>
    </section>
  );
}
