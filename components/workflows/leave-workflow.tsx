"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { zonedDateTimeToIso } from "@/lib/datetime";

type Department = { id: string; name: string; code: string };

export function LeaveWorkflow({ role, departments, departmentId, requestId, onDecisionComplete, timeZone = "UTC" }: { role: string; departments: Department[]; departmentId: string; requestId?: string; onDecisionComplete?: () => void; timeZone?: string }) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [reason, setReason] = useState("");
  const [form, setForm] = useState({ departmentId: "", startsAt: "", endsAt: "", category: "Annual leave", notes: "" });
  const queryClient = useQueryClient();
  const request = useMutation({ mutationFn: async () => {
    if (!form.startsAt || !form.endsAt || !form.departmentId) throw new Error("Choose a department and both dates.");
    const startsAt = new Date(form.startsAt); const endsAt = new Date(form.endsAt);
    if (Number.isNaN(startsAt.valueOf()) || Number.isNaN(endsAt.valueOf()) || startsAt >= endsAt) throw new Error("End date must be later than start date.");
    const response = await apiFetch("/api/leave-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ departmentId: form.departmentId, startsAt: zonedDateTimeToIso(form.startsAt, timeZone), endsAt: zonedDateTimeToIso(form.endsAt, timeZone), category: form.category.trim(), ...(form.notes.trim() ? { notes: form.notes.trim() } : {}) }) });
    if (!response.ok) throw new Error("Leave request could not be submitted. Confirm your department access and dates.");
  }, onSuccess: async () => { toast.success("Leave request submitted"); setOpen(false); await queryClient.invalidateQueries({ queryKey: ["workspace", "leave"] }); }, onError: (error) => toast.error(error.message) });
  const decide = useMutation({ mutationFn: async () => {
    if (!requestId || !decision || reason.trim().length < 3) throw new Error("Add a reason of at least 3 characters.");
    const response = await apiFetch(`/api/departments/${encodeURIComponent(departmentId)}/leave-requests/${encodeURIComponent(requestId)}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, reason: reason.trim() }) });
    if (!response.ok) throw new Error(response.status === 409 ? "This request was already decided. Refresh the list." : "Leave decision could not be recorded.");
  }, onSuccess: async () => { toast.success("Leave decision recorded"); setDecision(null); setReason(""); onDecisionComplete?.(); await Promise.all([queryClient.invalidateQueries({ queryKey: ["workspace", "leave"] }), queryClient.invalidateQueries({ queryKey: ["timetable", "doctor-availability"] })]); }, onError: (error) => toast.error(error.message) });

  if (role === "DOCTOR") return <section className="leave-request-card"><div><b>Request time away</b><span>Choose the department, dates, and a clear category for your request.</span></div><button className="button button-primary" onClick={() => setOpen((value) => !value)}>{open ? "Close form" : "New leave request"}</button>{open && <form className="leave-form" onSubmit={(event) => { event.preventDefault(); request.mutate(); }}><label className="form-label">Department<select required value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value })}><option value="">Choose department</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="form-grid"><label className="form-label">Starts<input required type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })}/></label><label className="form-label">Ends<input required type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })}/></label></div><label className="form-label">Category<input required maxLength={80} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}/></label><label className="form-label">Notes (optional)<textarea maxLength={1000} rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })}/></label><div className="invite-actions"><button className="button button-primary" disabled={request.isPending}>{request.isPending ? "Submitting…" : "Submit request"}</button></div></form>}</section>;

  if (!requestId) return null;
  return <><div className="row-actions"><button className="button button-primary compact" onClick={() => { setDecision("APPROVED"); setReason(""); }}>Approve</button><button className="button button-secondary compact" onClick={() => { setDecision("REJECTED"); setReason(""); }}>Reject</button></div>{decision && <div className="decision-backdrop"><section className="decision-dialog" role="dialog" aria-modal="true" aria-labelledby="decision-title"><h2 id="decision-title">{decision === "APPROVED" ? "Approve leave request?" : "Decline leave request?"}</h2><p>A reason of at least 3 characters is recorded in the audit history.</p><label className="form-label">Reason<textarea autoFocus required minLength={3} maxLength={1000} rows={4} value={reason} onChange={(event) => setReason(event.target.value)}/></label><div className="invite-actions"><button className="button button-secondary" onClick={() => setDecision(null)}>Cancel</button><button className="button button-primary" onClick={() => decide.mutate()} disabled={decide.isPending || reason.trim().length < 3}>{decide.isPending ? "Saving…" : `Confirm ${decision === "APPROVED" ? "approval" : "rejection"}`}</button></div></section></div>}</>;
}
