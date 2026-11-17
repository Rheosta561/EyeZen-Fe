import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { ThemeControl } from "@/components/theme-control";

const headings = {
  login: ["Your work,", "in clear view."],
  activate: ["Welcome to", "EyeZen."],
  forgot: ["A fresh start", "for your account."],
  reset: ["Set a new", "password."],
};

export function PublicAuthPage({ mode, token = "" }: { mode: "login" | "activate" | "forgot" | "reset"; token?: string }) {
  return <main className="auth-page"><header className="auth-header"><Link className="wordmark" href="/">EYEZEN<span>·</span></Link><div className="auth-header-actions"><Link className="auth-back" href="/">← Back to home</Link><ThemeControl/></div></header><div className="auth-layout"><section className="auth-aside"><div className="eyebrow"><span className="context-dot"/> STAFF ACCESS <span className="context-dot"/> SECURE SESSION</div><h1>{headings[mode][0]}<br/><em>{headings[mode][1]}</em></h1><p>EyeZen brings clinical operations into focus. Your role and department determine the workspace you can access.</p><div className="auth-assurance"><span className="assurance-icon">✓</span><span><b>Private by design</b><small>Session credentials stay in secure, HttpOnly cookies.</small></span></div></section><section className="auth-card"><div className="section-kicker">EYEZEN HOSPITAL <span>·</span> STAFF PORTAL</div><h2>{mode === "login" ? "Sign in" : mode === "activate" ? "Account activation" : mode === "forgot" ? "Password help" : "Password reset"}</h2><p className="auth-intro">{mode === "login" ? "Sign in with your staff credentials to continue." : mode === "activate" ? "Use the secure invitation sent by your administrator." : mode === "forgot" ? "We’ll help you get back into your account." : "Use the secure reset link sent to your email."}</p><AuthForm mode={mode} initialToken={token}/><div className="auth-links">{mode === "login" ? <><Link href="/password/forgot">Forgot password?</Link><span>New to EyeZen? Ask your administrator for an invitation.</span></> : <Link href="/login">Return to sign in</Link>}</div><div className="auth-card-foot"><span className="lock-mark">⌑</span> Your access is protected by EyeZen session security</div></section></div><footer className="auth-footer">EYEZEN · Clinical operations <span>Single hospital · Department-scoped access</span></footer></main>;
}
