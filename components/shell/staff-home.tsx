"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { ThemeControl } from "@/components/theme-control";
import { isHospitalWide, navigationFor } from "@/lib/auth/permissions";

const roleTitles: Record<string, string> = { SUPER_ADMIN: "Super administrator", HOSPITAL_ADMIN: "Hospital administrator", ROSTER_MANAGER: "Roster manager", DEPARTMENT_HEAD: "Department head", DOCTOR: "Doctor", RECEPTION_FRONT_DESK: "Reception front desk" };

function subscribePreference(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("eyezen-department-preference", callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener("eyezen-department-preference", callback); };
}
function getPreference() { return window.localStorage.getItem("eyezen_department_preference") ?? ""; }
function getServerPreference() { return ""; }

export function StaffHome({ children, timeZone = "UTC" }: { children?: React.ReactNode; timeZone?: string }) {
  const current = useCurrentUser();
  const user = current.data;
  const role = user?.role ?? "";
  const nav = navigationFor(role);
  const savedDepartment = useSyncExternalStore(subscribePreference, getPreference, getServerPreference);
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const hospitalWide = isHospitalWide(role);
  const departmentIds = useMemo(() => user?.departmentIds ?? [], [user?.departmentIds]);
  const selectedDepartment = !hospitalWide && departmentIds.includes(savedDepartment) ? savedDepartment : !hospitalWide ? departmentIds[0] ?? "" : "";

  useEffect(() => {
    if (!user) return;
    if (hospitalWide) {
      if (savedDepartment) { window.localStorage.removeItem("eyezen_department_preference"); window.dispatchEvent(new Event("eyezen-department-preference")); }
      return;
    }
    if (savedDepartment && !departmentIds.includes(savedDepartment)) { window.localStorage.removeItem("eyezen_department_preference"); window.dispatchEvent(new Event("eyezen-department-preference")); }
  }, [user, hospitalWide, departmentIds, savedDepartment]);

  async function signOut() {
    try { await apiFetch("/auth/logout", { method: "POST" }); }
    finally { queryClient.clear(); window.localStorage.removeItem("eyezen_department_preference"); window.dispatchEvent(new Event("eyezen-department-preference")); router.push("/login"); }
  }
  function changeDepartment(value: string) { window.localStorage.setItem("eyezen_department_preference", value); window.dispatchEvent(new Event("eyezen-department-preference")); }
  const departmentContext = hospitalWide ? "All departments" : selectedDepartment ? `Department ${Math.max(1, departmentIds.indexOf(selectedDepartment) + 1)}` : "No department assigned";

  return <div className="staff-layout">
    <aside className="staff-sidebar"><Link className="wordmark" href="/overview">EYEZEN<span>·</span></Link><div className="staff-scope"><span className="context-label">YOUR WORKSPACE</span>{hospitalWide ? <b>All departments</b> : departmentIds.length > 1 ? <select aria-label="Select department" value={selectedDepartment} onChange={(event)=>changeDepartment(event.target.value)}>{departmentIds.map((id,index)=><option value={id} key={id}>Department {index+1}</option>)}</select> : <b>{departmentIds.length ? "Assigned department" : "No department assigned"}</b>}</div><nav aria-label="Staff workspace">{nav.map((item)=><Link key={item.href} href={item.href}>{item.label}<span>›</span></Link>)}</nav><div className="sidebar-controls"><button className="logout-link" onClick={signOut}>Sign out <span>↗</span></button></div></aside>
    <main className="staff-main"><header className="staff-topbar"><button className="mobile-menu icon-button" onClick={()=>setMobileOpen(!mobileOpen)} aria-label="Toggle navigation">☰</button><div className="staff-top-title"><span>EyeZen Hospital</span><b>Staff workspace</b></div><div className="flex items-center gap-4"><ThemeControl/><div className="staff-user"><span>{user?.username?.slice(0,2).toUpperCase() ?? "EZ"}</span><small>{user?.username ?? "Verifying session"}</small></div></div></header>
      {mobileOpen && <nav className="staff-mobile-nav" aria-label="Mobile staff navigation">{nav.map((item)=><Link key={item.href} href={item.href} onClick={()=>setMobileOpen(false)}>{item.label}<span>›</span></Link>)}{departmentIds.length > 1 && <label className="mobile-department">Department<select value={selectedDepartment} onChange={(event)=>changeDepartment(event.target.value)}>{departmentIds.map((id,index)=><option value={id} key={id}>Department {index+1}</option>)}</select></label>}<div className="mobile-theme"><ThemeControl/></div><button className="logout-link" onClick={signOut}>Sign out <span>↗</span></button></nav>}
      <section className="staff-content"><div className="mobile-context"><span>{roleTitles[role] ?? "Staff"}</span><span className="context-dot"/>{departmentContext}</div>{children ?? <><div className="eyebrow">{roleTitles[role]?.toUpperCase() ?? "SESSION STATUS"} <span className="context-dot"/> HOSPITAL TIME · {timeZone}</div><h1>{current.isPending ? "Your workspace" : `Welcome, ${user?.username ?? ""}`}</h1><p className="staff-lead">Your role and department membership determine which records and actions are available.</p>{current.isPending ? <Info status="Checking your secure EyeZen session…"/> : current.error ? <Info status={current.error instanceof Error ? current.error.message : "Your secure session could not be verified."} signIn/> : <><div className="session-panel session-success"><span className="session-symbol">✓</span><div><b>Session verified</b><p>Role: {roleTitles[role] ?? role}. {role === "DOCTOR" ? "Your schedule is restricted to your own assignments." : "Choose an area from the navigation to continue."}</p></div></div><div className="staff-placeholder"><span className="section-kicker">YOUR WORK <span>·</span> {role === "DOCTOR" ? "PERSONAL VIEW" : departmentContext.toUpperCase()}</span><div className="staff-card-grid">{nav.filter((item)=>item.href !== "/overview").slice(0,4).map((item)=><Link className="staff-area-card" href={item.href} key={item.href}><span><b>{item.label}</b><small>Open your role-scoped {item.label.toLowerCase()} workspace.</small></span><i>↗</i></Link>)}</div></div></>}</>}<footer className="staff-footer">EYEZEN · Secure clinical operations <span>Hospital time · {timeZone}</span></footer></section>
    </main>
  </div>;
}

function Info({ status, signIn = false }: { status: string; signIn?: boolean }) { return <div className="session-panel"><span className="session-symbol">i</span><div><b>{status}</b><p>{status.includes("not configured") ? "Configure the same-origin EyeZen API proxy to continue securely." : "Sign in or reconnect to your secure EyeZen workspace."}</p>{signIn && <Link className="button button-primary" href="/login">Go to sign in <span>→</span></Link>}</div></div>; }
