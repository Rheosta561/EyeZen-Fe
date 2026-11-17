"use client";

import { FormEvent, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { useRouter } from "next/navigation";

export function AuthForm({ mode, initialToken = "" }: { mode: "login" | "activate" | "forgot" | "reset"; initialToken?: string }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const route = mode === "login" ? "/auth/login" : mode === "activate" ? "/auth/activate" : mode === "forgot" ? "/auth/password/forgot" : "/auth/password/reset";
    const password = form.get("password");
    const body = mode === "login" ? { username: form.get("username"), password } : mode === "forgot" ? { email: form.get("email") } : mode === "activate" ? { token: form.get("token"), password } : { token: form.get("token"), newPassword: password };
    try {
      const response = await apiFetch(route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(response.status === 401 ? "Those sign-in details weren’t recognized. Check them and try again." : response.status === 400 ? "This link may be invalid or expired. Request a new one to continue." : "EyeZen couldn’t complete that request. Try again in a moment.");
      if (mode === "login") router.push("/overview");
      else setMessage(mode === "forgot" ? "If an account matches that email, reset instructions will be sent." : "Your request was completed. You can continue to sign in.");
    } catch (error) {
      if (error instanceof TypeError) setMessage("EyeZen is not connected yet. Set EYEZEN_API_ORIGIN to enable secure sign-in.");
      else setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally { setPending(false); }
  }

  return <form className="auth-form" onSubmit={submit}>
    {mode === "activate" || mode === "reset" ? <label className="form-label">Invitation or reset token<input name="token" autoComplete="one-time-code" required defaultValue={initialToken} placeholder="Paste the secure link token"/></label> : null}
    {mode === "login" ? <label className="form-label">Username or email<input name="username" autoComplete="username" required placeholder="name@eyezenhospital.com"/></label> : null}
    {mode === "forgot" ? <label className="form-label">Email address<input name="email" type="email" autoComplete="email" required placeholder="you@eyezenhospital.com"/></label> : null}
    {mode !== "forgot" ? <label className="form-label">Password<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "login" ? 1 : 12} placeholder={mode === "login" ? "Enter your password" : "At least 12 characters"}/></label> : null}
    {message && <p className="auth-message" role="status">{message}</p>}
    <button className="button button-primary auth-submit" disabled={pending}>{pending ? "Please wait…" : mode === "forgot" ? "Request reset" : mode === "reset" ? "Reset password" : mode === "activate" ? "Activate account" : "Sign in"}<span>→</span></button>
  </form>;
}
