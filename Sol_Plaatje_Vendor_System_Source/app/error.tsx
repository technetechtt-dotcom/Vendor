'use client';
import Link from 'next/link';

export default function ErrorPage({reset}: {reset: () => void}) {
  return <main className="login-screen"><section className="login-card" role="alert"><h1>This page could not load</h1><p>Try again. If you were saving a change, check the record before submitting it again.</p><div className="actions"><button className="primary" onClick={reset}>Try again</button><Link className="secondary" href="/">Back to the register</Link></div></section></main>;
}
