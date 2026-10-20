import Link from 'next/link';

export default function NotFound() {
  return <main className="login-screen"><section className="login-card"><p className="eyebrow">VENDOR REGISTER</p><h1>Page not found</h1><p>This address is unavailable. Return to the register to choose a workspace or open a vendor record.</p><Link className="primary" href="/">Back to the register</Link></section></main>;
}
