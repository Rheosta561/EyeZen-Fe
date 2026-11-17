import Link from "next/link";

export function PublicRouteFallback() {
  return <main className="auth-page"><header className="auth-header"><Link className="wordmark" href="/">EYEZEN<span>·</span></Link><span className="auth-back">Secure access</span></header><section className="patient-card"><span className="patient-mark">E</span><div className="section-kicker">EYEZEN HOSPITAL <span>·</span> SECURE ACCESS</div><h1>Preparing your page…</h1><p>Your secure link is being checked.</p></section></main>;
}

export function WorkspaceRouteFallback() {
  return <section className="workspace-data-panel" aria-live="polite"><div className="workspace-state">Loading your workspace…</div></section>;
}
