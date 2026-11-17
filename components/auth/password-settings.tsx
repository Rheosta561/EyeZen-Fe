"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { AppearanceSettings } from "@/components/theme-control";

export function PasswordSettings() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const queryClient = useQueryClient();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await apiFetch("/auth/password/change", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword") }) });
      if (!response.ok) { const result = await response.json().catch(() => ({})) as { error?: string; message?: string }; setError(result.error === "INVALID_CREDENTIALS" ? "The current password did not match." : result.message ?? "Choose a password with at least 12 characters, including upper, lower, and numeric characters."); return; }
      queryClient.clear();
      toast.success("Password changed. Sign in again with your new password.");
      router.push("/login");
    } catch { setError("EyeZen could not be reached. Your entries are still available; try again."); }
    finally { setPending(false); }
  }
  async function logoutAll() {
    if (!window.confirm("Sign out of every EyeZen session? You will need to sign in again.")) return;
    try { const response = await apiFetch("/auth/logout-all", { method: "POST" }); if (!response.ok) throw new Error("EyeZen could not end all sessions."); queryClient.clear(); router.push("/login"); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "EyeZen could not end all sessions."); }
  }
  return <div className="account-settings-grid"><section className="account-settings-card"><div className="section-kicker">SECURITY <span>·</span> PASSWORD</div><h2>Change your password</h2><p>Changing your password ends your current session and invalidates existing sessions.</p><form className="password-form" onSubmit={submit}><label className="form-label">Current password<input name="currentPassword" type="password" autoComplete="current-password" required/></label><label className="form-label">New password<input name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{12,128}" title="Use 12–128 characters, including one lowercase letter, one uppercase letter, and one number." required/></label>{error && <p className="auth-message" role="alert">{error}</p>}<button className="button button-primary" disabled={pending}>{pending ? "Changing password…" : "Change password"}</button></form></section><section className="account-settings-card"><div className="section-kicker">SESSIONS <span>·</span> ACCOUNT ACCESS</div><h2>Sign out everywhere</h2><p>End all EyeZen sessions on your devices. Other open sessions will stop working immediately.</p><button className="button button-secondary" onClick={logoutAll}>Sign out of all sessions</button></section><AppearanceSettings/></div>;
}
