import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest, context: RouteContext<"/api/patient-decision/[token]">) {
  const origin = process.env.EYEZEN_API_ORIGIN;
  if (!origin) return NextResponse.json({ status: "UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const { token } = await context.params;
  const form = await request.formData();
  const decision = form.get("decision");
  const value = decision === "CONFIRMED" ? "CONFIRMED" : decision === "PREFER_ORIGINAL" ? "PREFER_ORIGINAL" : null;
  if (!value) return NextResponse.json({ status: "UNAVAILABLE" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const response = await fetch(new URL(`/public/patient-doctor-change/${encodeURIComponent(token)}`, origin), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: value }), cache: "no-store" });
    const data = await response.json().catch(() => ({})) as { status?: string; alternativeStartsAt?: string | null };
    if (!response.ok) {
      const outcome = response.status === 410 ? "expired" : response.status === 409 ? "used" : response.status === 404 ? "unavailable" : "error";
      return NextResponse.redirect(new URL(`/patient-decision-result/${outcome}`, request.url), 303);
    }
    const outcome = data.status === "CONFIRMED" ? "confirmed" : data.status === "PREFER_ORIGINAL" ? "original-preferred" : data.status === "EXPIRED" ? "expired" : data.status === "PENDING" ? "pending" : "used";
    return NextResponse.redirect(new URL(`/patient-decision-result/${outcome}`, request.url), 303);
  } catch {
    return NextResponse.redirect(new URL("/patient-decision-result/error", request.url), 303);
  }
}
