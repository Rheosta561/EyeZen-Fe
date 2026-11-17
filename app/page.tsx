import Link from "next/link";
import { ThemeControl } from "@/components/theme-control";

const readiness = [
  { phase: "01", title: "Connect the session", body: "Same-origin API proxy, secure cookie forwarding, CSRF header, and current-user bootstrap.", state: "Foundation" },
  { phase: "02", title: "Confirm department scope", body: "Use the signed-in role and memberships to choose the correct workspace and navigation.", state: "Foundation" },
  { phase: "03", title: "Open the first workflow", body: "Start with profile and invitation access, then add schedules and queues as their read APIs are ready.", state: "In progress" },
];

const routes = [
  { href: "/login", label: "Staff sign in", note: "Username or email and password" },
  { href: "/activate", label: "Activate account", note: "Set a password from an invitation" },
  { href: "/password/forgot", label: "Reset password", note: "Request an enumeration-safe reset" },
  { href: "/patient-doctor-change/demo-token", label: "Patient decision", note: "Public one-time decision link" },
];

export default function Home() {
  return <main className="landing-page">
    <header className="landing-header"><Link className="wordmark" href="/">EYEZEN<span>·</span></Link><div className="landing-header-actions"><ThemeControl/><span className="environment-label"><i/> STAFF OPERATIONS</span></div></header>
    <section className="landing-hero"><div className="landing-copy"><div className="eyebrow"><span className="context-dot"/> EYEZEN HOSPITAL <span className="context-dot"/> OPERATIONS</div><h1>Care runs on<br/><em>good coordination.</em></h1><p>A focused workspace for the people who keep every clinic day moving. Sign in to see the work that belongs to your role and department.</p><Link className="button button-primary hero-button" href="/login">Sign in to EyeZen <span>→</span></Link><div className="hero-footnote"><span className="lock-mark">⌑</span> Secure staff access · patient accounts are not supported</div></div><div className="hero-art" aria-hidden="true"><div className="art-topline"><span>CLINICAL OPERATIONS</span><span>01 / 04</span></div><div className="art-date"><span>TUESDAY</span><b>17</b><span>NOVEMBER 2026</span></div><div className="art-line"/><div className="art-event"><span className="art-time">09:30</span><i/><div><b>Ophthalmology</b><small>Clinic session · coverage confirmed</small></div><span className="art-check">✓</span></div><div className="art-event secondary"><span className="art-time">11:00</span><i/><div><b>Roster review</b><small>Retina · 1 item needs attention</small></div><span className="art-alert">!</span></div><div className="art-bottom"><span>HOSPITAL LOCAL TIME</span><b>IST <i/> UTC +5:30</b></div></div></section>
    <section className="landing-lower"><div className="readiness-column"><div className="section-kicker">A CLEAR PATH FORWARD <span>·</span> FOUNDATION</div><h2>Built around the work,<br/>and the people doing it.</h2><div className="readiness-list">{readiness.map((item)=><article className="readiness-item" key={item.phase}><span className="phase-no">{item.phase}</span><div><h3>{item.title}</h3><p>{item.body}</p></div><span className={`readiness-state ${item.state === "In progress" ? "state-current" : ""}`}>{item.state}</span></article>)}</div></div><div className="route-column"><div className="section-kicker">QUICK ACCESS <span>·</span> STAFF &amp; PATIENT LINKS</div><h2>Choose a starting point.</h2><div className="route-list">{routes.map((item)=><Link href={item.href} className="route-link" key={item.href}><span><b>{item.label}</b><small>{item.note}</small></span><span className="route-arrow">↗</span></Link>)}</div><div className="scope-note"><span className="scope-mark">i</span><p>Access and department scope come from your active EyeZen session. This page does not grant permissions.</p></div></div></section>
    <footer className="landing-footer"><span><b>EYEZEN</b> · Clinical operations</span><span>Single hospital · Department-scoped access</span><span>IST · UTC+5:30</span></footer>
  </main>;
}
