import Link from "next/link";
import { Suspense } from "react";
import { PublicRouteFallback } from "@/components/route-fallbacks";

const outcomes: Record<string, { title: string; detail: string; mark: string }> = {
  confirmed: { title: "Your preference is recorded.", detail: "Your preference has been shared with EyeZen Hospital.", mark: "✓" },
  "original-preferred": { title: "Your preference is recorded.", detail: "EyeZen Hospital has received your request to keep your original doctor. Any alternative time is an offer and is not booked until the hospital confirms it.", mark: "✓" },
  expired: { title: "This link has expired.", detail: "Secure decision links are valid for 72 hours. Contact the hospital to discuss your appointment.", mark: "!" },
  used: { title: "This link was already used.", detail: "The decision link has already been recorded. Contact the hospital if you need to discuss your appointment.", mark: "i" },
  unavailable: { title: "This link is unavailable.", detail: "We couldn’t find an active decision for this link. Contact the hospital for help.", mark: "i" },
  pending: { title: "No change was recorded.", detail: "Please try the decision link again or contact the hospital.", mark: "i" },
  error: { title: "We couldn’t reach the hospital.", detail: "Your choice may not have been recorded. Contact the hospital before submitting again.", mark: "!" },
};

export default function PatientDecisionResultPage({ params }: { params: Promise<{ state: string }> }) {
  return <Suspense fallback={<PublicRouteFallback/>}><PatientDecisionResultContent params={params}/></Suspense>;
}

async function PatientDecisionResultContent({ params }: { params: Promise<{ state: string }> }) {
  const { state } = await params;
  const outcome = outcomes[state] ?? outcomes.unavailable;
  return <main className="patient-page"><header className="patient-header"><Link className="wordmark" href="/">EYEZEN<span>·</span></Link><span>APPOINTMENT UPDATE</span></header><section className="patient-card"><span className="patient-mark">{outcome.mark}</span><div className="section-kicker">EYEZEN HOSPITAL <span>·</span> PATIENT DECISION</div><h1>{outcome.title}</h1><p>{outcome.detail}</p><Link className="patient-secondary" href="/">Return to EyeZen</Link><small className="patient-footnote">If you need help, contact EyeZen Hospital directly.</small></section><footer className="patient-footer">EYEZEN · Clinical operations</footer></main>;
}
