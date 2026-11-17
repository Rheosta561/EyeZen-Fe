import Link from "next/link";
import { Suspense } from "react";
import { PublicRouteFallback } from "@/components/route-fallbacks";

export default function PatientDecisionPage({ params }: { params: Promise<{ token: string }> }) {
  return <Suspense fallback={<PublicRouteFallback/>}><PatientDecisionContent params={params}/></Suspense>;
}

async function PatientDecisionContent({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let status = "UNAVAILABLE";
  let detail = "This decision link is invalid or EyeZen Hospital is temporarily unavailable. Contact the hospital to review your appointment.";
  let appointment: { startsAt: string; department?: { name: string } } | undefined;
  let targetDoctor: { displayName: string; specialty?: string | null } | undefined;
  let originalDoctor: { displayName: string; specialty?: string | null } | undefined;
  const origin = process.env.EYEZEN_API_ORIGIN;
  if (origin && token !== "demo-token") {
    try {
      const response = await fetch(new URL(`/public/patient-doctor-change/${encodeURIComponent(token)}`, origin), { cache: "no-store", headers: { "Cache-Control": "no-store" } });
      const data = await response.json().catch(() => ({})) as { status?: string; appointment?: typeof appointment; targetDoctor?: typeof targetDoctor; originalDoctor?: typeof originalDoctor };
      if (response.ok) {
        status = data.status ?? "PENDING";
        appointment = data.appointment;
        targetDoctor = data.targetDoctor;
        originalDoctor = data.originalDoctor;
        detail = status === "PENDING" ? "Review the proposed change and tell us which doctor you prefer." : status === "CONFIRMED" ? "Your preference to confirm the change has already been recorded." : status === "PREFER_ORIGINAL" ? "Your preference to keep your original doctor has already been recorded." : "This decision has already been recorded.";
      } else if (response.status === 410) { status = "EXPIRED"; detail = "This secure link has expired. Contact the hospital to discuss your appointment."; }
      else if (response.status === 404) { status = "UNAVAILABLE"; detail = "We couldn’t find an active decision for this link. Contact the hospital for help."; }
      else { status = "ERROR"; detail = "We couldn’t verify this link right now. Contact the hospital to review your appointment."; }
    } catch { status = "ERROR"; detail = "We couldn’t reach EyeZen Hospital to verify this link. Contact the hospital to review your appointment."; }
  }
  const pending = status === "PENDING";
  const outcomeTitle = status === "EXPIRED" ? "This link has expired." : status === "UNAVAILABLE" ? "This link is unavailable." : status === "ERROR" ? "We can’t verify this link." : "Your preference is recorded.";
  const date = appointment ? new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeStyle: "short", timeZone: process.env.HOSPITAL_TIME_ZONE ?? "UTC" }).format(new Date(appointment.startsAt)) : "";
  return <main className="patient-page"><header className="patient-header"><Link className="wordmark" href="/">EYEZEN<span>·</span></Link><span>APPOINTMENT UPDATE</span></header><section className="patient-card"><span className="patient-mark">{pending ? "E" : status === "EXPIRED" || status === "ERROR" ? "!" : "i"}</span><div className="section-kicker">EYEZEN HOSPITAL <span>·</span> PATIENT DECISION</div><h1>{pending ? "Your appointment update" : outcomeTitle}</h1><p>{pending ? detail : detail}</p>{pending && <><div className="appointment-summary"><div><small>APPOINTMENT</small><b>{date || "Appointment details"}</b><span>{appointment?.department?.name ?? "EyeZen Hospital"}</span></div><div className="doctor-change"><span>{originalDoctor?.displayName ?? "Your doctor"}</span><i>→</i><b>{targetDoctor?.displayName ?? "Proposed doctor"}</b><small>{targetDoctor?.specialty ?? ""}</small></div></div><div className="patient-state"><span className="state-dot"/> Secure link · expires within 72 hours</div><form className="patient-decision-form" action={`/api/patient-decision/${encodeURIComponent(token)}`} method="post"><button className="button button-primary" name="decision" value="CONFIRMED">Confirm change <span>→</span></button><button className="patient-secondary" name="decision" value="PREFER_ORIGINAL">Prefer my original doctor</button></form></>}{!pending && <div className="patient-state"><span className={`state-dot ${status === "EXPIRED" || status === "ERROR" ? "muted" : ""}`}/>{status === "EXPIRED" ? "Expired · 72-hour limit" : status === "ERROR" ? "Status could not be verified" : "Decision status verified"}</div>}<small className="patient-footnote">This page does not require a patient account. If you need help, contact EyeZen Hospital directly.</small></section><footer className="patient-footer">EYEZEN · Clinical operations</footer></main>;
}
