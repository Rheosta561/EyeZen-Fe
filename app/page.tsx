import Link from "next/link";
import { ThemeControl } from "@/components/theme-control";
import { LandingFeatures } from "@/components/landing-features";

const routes = [
  { href: "/login", label: "Staff sign in", note: "Open your workspace" },
  { href: "/activate", label: "Activate account", note: "Start with your invitation" },
  { href: "/password/forgot", label: "Reset password", note: "Get back into EyeZen" },
  { href: "/patient-doctor-change/demo-token", label: "Patient decision", note: "Review a one-time change" },
];

export default function Home() {
  return <main className="landing-page">
    <header className="landing-header"><Link className="wordmark" href="/">EYEZEN<span>·</span></Link><div className="landing-header-actions"><ThemeControl/><span className="environment-label"><i/> STAFF OPERATIONS</span></div></header>
    <section className="landing-hero"><div className="landing-copy"><div className="eyebrow"><span className="context-dot"/> EYEZEN HOSPITAL <span className="context-dot"/> OPERATIONS</div><h1>Care runs on<br/><em>good coordination.</em></h1><p>A focused workspace for the people who keep every clinic day moving. Sign in to see the work that belongs to your role and department.</p><Link className="button button-primary hero-button" href="/login">Sign in to EyeZen <span>→</span></Link><div className="hero-footnote"><span className="lock-mark">⌑</span> Secure access for every hospital role</div></div><div className="hero-art" aria-hidden="true"><div className="art-topline"><span>CLINICAL OPERATIONS</span><span>01 / 04</span></div><div className="art-date"><span>TUESDAY</span><b>17</b><span>NOVEMBER 2026</span></div><div className="art-line"/><div className="art-event"><span className="art-time">09:30</span><i/><div><b>Ophthalmology</b><small>Clinic session · coverage confirmed</small></div><span className="art-check">✓</span></div><div className="art-event secondary"><span className="art-time">11:00</span><i/><div><b>Roster review</b><small>Retina · 1 item needs attention</small></div><span className="art-alert">!</span></div><div className="art-bottom"><span>HOSPITAL LOCAL TIME</span><b>IST <i/> UTC +5:30</b></div></div></section>
    <LandingFeatures/>
    <section className="landing-lower"><div className="access-column"><div className="section-kicker">GET STARTED <span>·</span> QUICK ACCESS</div><h2 className="mt-2.5 max-w-[360px] text-[clamp(1.375rem,2.4vw,1.875rem)] font-semibold leading-[1.2] tracking-[-0.03em]">Go straight to what you need.</h2><p className="m-0 max-w-[360px] text-[11px] leading-[1.6] text-[var(--muted)]">Sign in, activate an invitation, or follow a secure decision link.</p></div><div className="route-list">{routes.map((item)=><Link href={item.href} className="route-link" key={item.href}><span><b>{item.label}</b><small>{item.note}</small></span><span className="route-arrow">↗</span></Link>)}</div></section>
    <footer className="landing-footer"><span><b>EYEZEN</b> · Clinical operations</span><span>Built for hospital teams</span><span>IST · UTC+5:30</span></footer>
  </main>;
}
