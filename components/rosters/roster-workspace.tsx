"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { hasPermission } from "@/lib/auth/permissions";

type Department = { id: string; name: string; code: string };
type Doctor = { id: string; doctorProfileId: string | null; displayName: string; specialty?: string | null };
type Conflict = { code: string; level: "BLOCKING" | "OVERRIDABLE_WARNING" | "INFORMATIONAL"; assignmentId: string; message: string };
type Assignment = { id: string; doctorId: string; startsAt: string; endsAt: string; assignmentType: "IN_PERSON" | "TELECONSULTATION"; exceptionNote?: string | null };
type Template = { id: string; doctorId: string; dayOfWeek: number; startMinute: number; endMinute: number; assignmentType: "IN_PERSON" | "TELECONSULTATION"; effectiveFrom: string; effectiveUntil?: string | null };
type Roster = { id: string; name: string; status: "DRAFT" | "PUBLISHED"; revision: number; publishedAt?: string | null; _count?: { assignments?: number } };
type RosterDetail = Roster & { assignments: Assignment[]; templates: Template[] };
type ApiProblem = Error & { conflicts?: Conflict[] };
const NO_DOCTORS: Doctor[] = [];

const weekdayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekdayShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const tourSteps = [
  { title: "Start with a draft", body: "Give this schedule a clear name. Drafts stay editable until you publish them.", target: ".roster-create-form" },
  { title: "Choose a roster", body: "Select a department roster here. Published rosters are locked; create another draft to make changes.", target: ".roster-list" },
  { title: "Add coverage", body: "Add a one-time duty or define weekly patterns. Search doctors by name or specialty.", target: ".roster-action-grid" },
  { title: "Generate the schedule", body: "Choose a date range to create duties from weekly patterns. Any blocking conflicts are shown before the generated duties are saved.", target: ".roster-generate-bar" },
  { title: "Review and publish", body: "Resolve blocking conflicts. Authorized roles can publish with a warning after recording a reason.", target: ".roster-record-list" },
];
function zonedParts(date: Date, timeZone: string) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}
const toZonedInput = (date: Date, timeZone: string) => { const parts = zonedParts(date, timeZone); return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`; };
function zonedInputToIso(value: string, timeZone: string) {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart!.split("-").map(Number);
  const [hour, minute] = timePart!.split(":").map(Number);
  const target = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = zonedParts(new Date(guess), timeZone);
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    guess += target - represented;
  }
  return new Date(guess).toISOString();
}
const zonedDateInputToIso = (value: string, timeZone: string, end = false) => zonedInputToIso(`${value}T${end ? "23:59" : "00:00"}`, timeZone);
const minuteLabel = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const fromMinuteInput = (value: string) => { const [hours, minutes] = value.split(":").map(Number); return hours * 60 + minutes; };

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  if (response.ok) return response.status === 204 ? undefined as T : await response.json() as T;
  const body = await response.json().catch(() => ({})) as { error?: string; message?: string; conflicts?: Conflict[] };
  const knownErrors: Record<string, string> = {
    SCHEDULE_CONFLICTS: "The schedule has blocking conflicts. Review the conflict report and adjust the affected duties.",
    ROSTER_VALIDATION_FAILED: "This roster cannot be published yet. Review the conflict report.",
    DOCTOR_NOT_IN_DEPARTMENT: "That doctor is no longer an active member of this department.",
    INVALID_WINDOW: "The duty end must be later than its start.",
    INVALID_RECURRENCE_HORIZON: "Choose a valid date range within the roster generation limit.",
    DRAFT_ROSTER_NOT_FOUND: "This roster is no longer an editable draft. Refresh the roster list.",
  };
  const problem = new Error(body.message ?? knownErrors[body.error ?? ""] ?? body.error ?? `Request failed (${response.status}).`) as ApiProblem;
  problem.conflicts = body.conflicts;
  throw problem;
}

function dateLabel(value: string, timeZone: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
}

export function RosterWorkspace({ departments, departmentId, timeZone }: { departments: Department[]; departmentId: string; timeZone: string }) {
  const current = useCurrentUser();
  const role = current.data?.role;
  const canWrite = hasPermission(role, "rosters:write");
  const canPublish = hasPermission(role, "rosters:publish");
  const canOverride = ["SUPER_ADMIN", "HOSPITAL_ADMIN", "DEPARTMENT_HEAD"].includes(role ?? "");
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [rosterName, setRosterName] = useState("");
  const [activeTab, setActiveTab] = useState<"assignments" | "templates" | "revisions">("assignments");
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [overrideReason, setOverrideReason] = useState("");
  const [form, setForm] = useState({ doctorId: "", startsAt: "", endsAt: "", assignmentType: "IN_PERSON" as Assignment["assignmentType"], exceptionNote: "" });
  const [template, setTemplate] = useState({ doctorId: "", dayOfWeek: "1", startTime: "09:00", endTime: "17:00", assignmentType: "IN_PERSON" as Assignment["assignmentType"], effectiveFrom: "", effectiveUntil: "" });
  const [doctorSearch, setDoctorSearch] = useState("");
  const [templateDoctorSearch, setTemplateDoctorSearch] = useState("");
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [generation, setGeneration] = useState({ from: "", through: "" });
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [rosterNameEdit, setRosterNameEdit] = useState("");
  const [editingRosterName, setEditingRosterName] = useState(false);

  const listQuery = useQuery({
    queryKey: ["workspace", "rosters", departmentId], enabled: Boolean(departmentId),
    queryFn: () => apiJson<{ items: Roster[]; total: number }>(`/api/departments/${encodeURIComponent(departmentId)}/rosters?page=1&pageSize=100`),
  });
  const doctorQuery = useQuery({
    queryKey: ["roster-doctors", departmentId], enabled: Boolean(departmentId),
    queryFn: async () => (await apiJson<{ doctors: Doctor[] }>(`/auth/departments/${encodeURIComponent(departmentId)}/doctors`)).doctors,
  });
  const detailQuery = useQuery({
    queryKey: ["roster-detail", departmentId, selectedId], enabled: Boolean(departmentId && selectedId),
    queryFn: () => apiJson<RosterDetail>(`/api/departments/${encodeURIComponent(departmentId)}/rosters/${encodeURIComponent(selectedId)}`),
  });
  const revisionQuery = useQuery({
    queryKey: ["roster-revisions", departmentId, selectedId], enabled: Boolean(departmentId && selectedId && activeTab === "revisions"),
    queryFn: () => apiJson<Array<{ id: string; revision: number; publishedAt: string; snapshot: unknown }>>(`/api/departments/${encodeURIComponent(departmentId)}/rosters/${encodeURIComponent(selectedId)}/revisions`),
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workspace", "rosters", departmentId] }),
      queryClient.invalidateQueries({ queryKey: ["roster-detail", departmentId, selectedId] }),
      queryClient.invalidateQueries({ queryKey: ["roster-revisions", departmentId, selectedId] }),
    ]);
  };
  const runMutation = useMutation({
    mutationFn: async ({ path, method = "POST", body }: { path: string; method?: string; body?: unknown }) => apiJson<unknown>(path, {
      method,
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    }),
    onSuccess: async (data, variables) => {
      const result = data && typeof data === "object" ? data as { conflicts?: Conflict[]; generated?: number; published?: boolean } : {};
      const rosterItemPath = /\/rosters\/[^/]+$/.test(variables.path);
      setConflicts(result.conflicts ?? []);
      setEditing(null);
      setForm({ doctorId: "", startsAt: "", endsAt: "", assignmentType: "IN_PERSON", exceptionNote: "" });
      setDoctorSearch("");
      setTemplateDoctorSearch("");
      if (variables.path.endsWith("/publish")) toast.success("Roster published as an immutable revision");
      else if (variables.path.includes("/templates/") && variables.method === "PATCH") { toast.success("Weekly pattern updated"); setEditingTemplate(null); setTemplate({ doctorId: "", dayOfWeek: "1", startTime: "09:00", endTime: "17:00", assignmentType: "IN_PERSON", effectiveFrom: "", effectiveUntil: "" }); }
      else if (variables.path.includes("/templates/") && variables.method === "DELETE") toast.success("Weekly pattern deleted");
      else if (rosterItemPath && variables.method === "PATCH") { toast.success("Draft roster renamed"); setEditingRosterName(false); }
      else if (rosterItemPath && variables.method === "DELETE") { toast.success("Draft roster deleted"); setSelectedId(""); setEditingRosterName(false); }
      else if (variables.path.endsWith("/generate")) toast.success(`${result.generated ?? 0} duties generated; review the validation result below.`);
      else if (variables.method === "DELETE") toast.success("Draft duty deleted");
      else toast.success(variables.method === "PATCH" ? "Draft duty updated" : "Roster change saved");
      await invalidate();
    },
    onMutate: () => setConflicts([]),
    onError: (error: ApiProblem) => { if (error.conflicts) setConflicts(error.conflicts); toast.error(error.message); },
  });
  const createRoster = useMutation({
    mutationFn: async () => {
      const name = rosterName.trim();
      if (!name) throw new Error("Enter a roster name.");
      return apiJson<Roster>(`/api/departments/${encodeURIComponent(departmentId)}/rosters`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    },
    onSuccess: async (roster) => { setRosterName(""); setSelectedId(roster.id); setActiveTab("assignments"); setConflicts([]); setDoctorSearch(""); setTemplateDoctorSearch(""); toast.success("Draft roster created"); await invalidate(); },
    onError: (error) => toast.error(error.message),
  });
  const saveRosterName = () => {
    const name = rosterNameEdit.trim();
    if (!name) { toast.error("Enter a roster name."); return; }
    runMutation.mutate({ path: `/api/departments/${encodeURIComponent(departmentId)}/rosters/${encodeURIComponent(selectedId)}`, method: "PATCH", body: { name } });
  };
  const deleteRoster = () => {
    if (!selected || selected.status !== "DRAFT") return;
    if (window.confirm(`Delete draft “${selected.name}” and all its duties and weekly patterns? This cannot be undone.`)) {
      runMutation.mutate({ path: `/api/departments/${encodeURIComponent(departmentId)}/rosters/${encodeURIComponent(selectedId)}`, method: "DELETE" });
    }
  };

  const selected = detailQuery.data;
  const doctors = doctorQuery.data ?? NO_DOCTORS;
  const doctorName = useMemo(() => new Map(doctors.flatMap((doctor) => doctor.doctorProfileId ? [[doctor.doctorProfileId, doctor.displayName] as const] : [])), [doctors]);
  const isDraft = selected?.status === "DRAFT";
  const blockingCount = conflicts.filter((conflict) => conflict.level === "BLOCKING").length;
  const warningCount = conflicts.filter((conflict) => conflict.level === "OVERRIDABLE_WARNING").length;
  const selectedDepartment = departments.find((department) => department.id === departmentId);
  const changeTourStep = (step: number | null) => {
    if (step !== null && step >= 2) setActiveTab("assignments");
    setTourStep(step);
  };

  useEffect(() => {
    if (tourStep === null) return;
    const step = tourSteps[tourStep];
    let target = document.querySelector<HTMLElement>(step.target);
    if (!target && tourStep >= 2) target = document.querySelector<HTMLElement>(".roster-editor-panel");
    if (!target && tourStep === 1) target = document.querySelector<HTMLElement>(".roster-side-panel");
    target?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    target?.classList.add("roster-tour-highlight");
    return () => target?.classList.remove("roster-tour-highlight");
  }, [tourStep, selectedId, selected?.status]);

  if (current.isPending) return <div className="roster-state">Checking roster permissions…</div>;
  if (!hasPermission(role, "rosters:read") || role === "DOCTOR") return <div className="roster-state">Department rosters are managed by roster staff. Your own published duties are available in My schedule.</div>;

  return <div className="roster-workspace">
    {!departmentId ? <div className="roster-state">Select a department to work with its rosters.</div> : <>
      <section className="roster-overview-card">
        <div className="roster-overview-copy"><div className="roster-overview-topline"><span className="roster-kicker">{selectedDepartment?.code ?? "DEPARTMENT"} · ROSTER STUDIO</span>{canWrite && <button className="roster-tour-launch" onClick={() => changeTourStep(0)}>Show me around <span aria-hidden="true">↗</span></button>}</div><h2>Build a safe, publishable schedule</h2><p>Create a draft, add recurring coverage or individual duties, review conflicts, then publish a revision.</p></div>
        <div className="roster-stat"><b>{listQuery.data?.total ?? "—"}</b><span>rosters</span></div>
        <div className="roster-stat"><b>{listQuery.data?.items.filter((item) => item.status === "DRAFT").length ?? "—"}</b><span>drafts</span></div>
      </section>
      <div className="roster-columns">
        <aside className="roster-side-panel">
          <div className="roster-panel-heading"><div><h2>Department rosters</h2><p>Choose a draft to edit or review a publication.</p></div><button className="roster-icon-button" onClick={() => void listQuery.refetch()} aria-label="Refresh roster list">↻</button></div>
          {canWrite && <form className="roster-create-form" onSubmit={(event) => { event.preventDefault(); createRoster.mutate(); }}><label>New roster draft<input required maxLength={120} value={rosterName} onChange={(event) => setRosterName(event.target.value)} placeholder="e.g. Winter clinic coverage" /></label><button className="button button-primary" disabled={createRoster.isPending}>{createRoster.isPending ? "Creating…" : "Create draft"}</button></form>}
          {listQuery.isPending ? <div className="roster-list-state">Loading rosters…</div> : listQuery.isError ? <div className="roster-list-state roster-inline-error">{listQuery.error.message}<button onClick={() => void listQuery.refetch()}>Retry</button></div> : listQuery.data?.items.length ? <div className="roster-list">{listQuery.data.items.map((roster) => <button key={roster.id} className={`roster-list-item ${selectedId === roster.id ? "selected" : ""}`} onClick={() => { setSelectedId(roster.id); setConflicts([]); setActiveTab("assignments"); }}><span className={`roster-status ${roster.status.toLowerCase()}`}>{roster.status === "DRAFT" ? "Draft" : `Published · r${roster.revision}`}</span><b>{roster.name}</b><small>{roster._count?.assignments ?? 0} assignments{roster.publishedAt ? ` · ${dateLabel(roster.publishedAt, timeZone)}` : ""}</small></button>)}</div> : <div className="roster-list-state">No rosters yet. Create the first draft above.</div>}
        </aside>

        <main className="roster-editor-panel">
          {!selectedId ? <div className="roster-editor-empty"><span className="roster-empty-icon">▦</span><h2>Select a roster</h2><p>Choose a roster from this department, or create a draft to start planning.</p></div> : detailQuery.isPending ? <div className="roster-list-state">Loading roster detail…</div> : detailQuery.isError ? <div className="roster-list-state roster-inline-error">{detailQuery.error.message}<button onClick={() => void detailQuery.refetch()}>Retry</button></div> : selected ? <>
            <div className="roster-editor-heading"><div><span className="roster-kicker">{selected.status === "DRAFT" ? "EDITABLE DRAFT" : `PUBLISHED REVISION ${selected.revision}`}</span>{editingRosterName && isDraft && canWrite ? <div className="roster-name-edit"><input aria-label="Roster name" maxLength={120} value={rosterNameEdit} onChange={(event) => setRosterNameEdit(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveRosterName(); } if (event.key === "Escape") setEditingRosterName(false); }}/><button className="button button-secondary compact" onClick={saveRosterName} disabled={runMutation.isPending}>Save name</button><button className="roster-row-action" onClick={() => setEditingRosterName(false)}>Cancel</button></div> : <h2>{selected.name}</h2>}<p>{selectedDepartment?.name} · {selected.assignments.length} duties · {selected.templates.length} weekly patterns</p></div><div className="roster-heading-actions">{isDraft && canWrite && !editingRosterName && <><button className="button button-secondary compact" onClick={() => { setRosterNameEdit(selected.name); setEditingRosterName(true); }}>Rename</button><button className="button button-danger compact" onClick={deleteRoster} disabled={runMutation.isPending}>Delete draft</button></>}<span className={`roster-status large ${selected.status.toLowerCase()}`}>{selected.status}</span></div></div>
            <nav className="roster-tabs" aria-label="Roster sections">{(["assignments", "templates", "revisions"] as const).map((tab) => <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab === "assignments" ? `Duties (${selected.assignments.length})` : tab === "templates" ? `Weekly patterns (${selected.templates.length})` : "Revision history"}</button>)}</nav>

            {conflicts.length > 0 && <section className="conflict-panel" aria-live="polite"><div className="conflict-panel-heading"><div><span className="roster-kicker">SCHEDULE VALIDATION</span><h3>{blockingCount ? `${blockingCount} blocking issue${blockingCount === 1 ? "" : "s"}` : `${warningCount} warning${warningCount === 1 ? "" : "s"}`}</h3></div><button className="roster-icon-button" onClick={() => setConflicts([])} aria-label="Dismiss conflict report">×</button></div><p className="conflict-guidance">Blocking issues must be fixed before publishing. Warnings can only be overridden by an authorized role with a recorded reason.</p><div className="conflict-list">{conflicts.map((conflict, index) => <article key={`${conflict.assignmentId}-${conflict.code}-${index}`} className={`conflict-item ${conflict.level.toLowerCase()}`}><span className="conflict-mark">{conflict.level === "BLOCKING" ? "!" : conflict.level === "OVERRIDABLE_WARNING" ? "△" : "i"}</span><div><b>{conflict.code.replaceAll("_", " ")}</b><p>{conflict.message}</p><small>{conflict.assignmentId.startsWith("input-") ? "Proposed duty" : `Duty ${conflict.assignmentId.slice(0, 8)}`}</small></div><span className="conflict-level">{conflict.level === "OVERRIDABLE_WARNING" ? "Warning" : conflict.level === "BLOCKING" ? "Blocking" : "Info"}</span></article>)}</div></section>}

            {activeTab === "assignments" && <>
              {isDraft && canWrite && <div className="roster-action-grid">
                <form id="roster-edit-assignment" className="roster-form-card" onSubmit={(event) => { event.preventDefault(); const startsAt = new Date(zonedInputToIso(form.startsAt, timeZone)); const endsAt = new Date(zonedInputToIso(form.endsAt, timeZone)); if (startsAt >= endsAt) { toast.error("End time must be after start time."); return; } runMutation.mutate({ path: `/api/departments/${encodeURIComponent(departmentId)}/rosters/${encodeURIComponent(selectedId)}/assignments${editing ? `/${encodeURIComponent(editing.id)}` : ""}`, method: editing ? "PATCH" : "POST", body: { doctorId: form.doctorId, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), assignmentType: form.assignmentType, ...(form.exceptionNote.trim() ? { exceptionNote: form.exceptionNote.trim() } : {}) } }); }}>
                  <div className="roster-form-heading"><span>01</span><div><b>{editing ? "Edit a duty" : "Add a duty"}</b><small>{editing ? "Update this draft assignment and recheck conflicts." : "Place a single assignment on this draft."}</small></div></div>
                  <DoctorPicker label="Doctor" doctors={doctors} value={form.doctorId} search={doctorSearch} onSearch={setDoctorSearch} onChange={(doctorId) => setForm({ ...form, doctorId })}/>
                  <div className="roster-input-pair"><label>Starts<input required type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })}/></label><label>Ends<input required type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })}/></label></div>
                  <label>Duty type<select value={form.assignmentType} onChange={(event) => setForm({ ...form, assignmentType: event.target.value as Assignment["assignmentType"] })}><option value="IN_PERSON">In person</option><option value="TELECONSULTATION">Teleconsultation</option></select></label>
                  <label>Exception note <span className="roster-optional">Optional</span><input maxLength={500} value={form.exceptionNote} onChange={(event) => setForm({ ...form, exceptionNote: event.target.value })} placeholder="Context for this one-off duty"/></label>
                  <div className="roster-form-actions">{editing && <button type="button" className="button button-secondary" onClick={() => { setEditing(null); setForm({ doctorId: "", startsAt: "", endsAt: "", assignmentType: "IN_PERSON", exceptionNote: "" }); setDoctorSearch(""); }}>Cancel edit</button>}<button className="button button-secondary" disabled={runMutation.isPending || !form.doctorId || !form.startsAt || !form.endsAt}>{editing ? "Save changes" : "Add duty"}</button></div>
                </form>
                <form className="roster-form-card" onSubmit={(event) => { event.preventDefault(); const body = { doctorId: template.doctorId, dayOfWeek: Number(template.dayOfWeek), startMinute: fromMinuteInput(template.startTime), endMinute: fromMinuteInput(template.endTime), assignmentType: template.assignmentType, effectiveFrom: zonedDateInputToIso(template.effectiveFrom, timeZone), ...(template.effectiveUntil ? { effectiveUntil: zonedDateInputToIso(template.effectiveUntil, timeZone, true) } : { effectiveUntil: null }) }; if (body.endMinute <= body.startMinute) { toast.error("Pattern end time must be after its start time."); return; } runMutation.mutate({ path: `/api/departments/${encodeURIComponent(departmentId)}/rosters/${encodeURIComponent(selectedId)}/templates${editingTemplate ? `/${encodeURIComponent(editingTemplate.id)}` : ""}`, method: editingTemplate ? "PATCH" : "POST", body }); }}>
                  <div className="roster-form-heading"><span>02</span><div><b>{editingTemplate ? "Edit weekly pattern" : "Add a weekly pattern"}</b><small>{editingTemplate ? "Update this recurring coverage pattern." : "Define recurring department coverage."}</small></div></div>
                  <DoctorPicker label="Doctor" doctors={doctors} value={template.doctorId} search={templateDoctorSearch} onSearch={setTemplateDoctorSearch} onChange={(doctorId) => setTemplate({ ...template, doctorId })}/>
                  <div className="roster-input-pair"><label>Weekday<select value={template.dayOfWeek} onChange={(event) => setTemplate({ ...template, dayOfWeek: event.target.value })}>{weekdayLabels.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label><label>Duty type<select value={template.assignmentType} onChange={(event) => setTemplate({ ...template, assignmentType: event.target.value as Assignment["assignmentType"] })}><option value="IN_PERSON">In person</option><option value="TELECONSULTATION">Teleconsultation</option></select></label></div>
                  <div className="roster-input-pair"><label>Starts<input required type="time" value={template.startTime} onChange={(event) => setTemplate({ ...template, startTime: event.target.value })}/></label><label>Ends<input required type="time" value={template.endTime} onChange={(event) => setTemplate({ ...template, endTime: event.target.value })}/></label></div>
                  <div className="roster-input-pair"><label>Effective from<input required type="date" value={template.effectiveFrom} onChange={(event) => setTemplate({ ...template, effectiveFrom: event.target.value })}/></label><label>Through <span className="roster-optional">Optional</span><input type="date" value={template.effectiveUntil} onChange={(event) => setTemplate({ ...template, effectiveUntil: event.target.value })}/></label></div>
                  <div className="roster-form-actions">{editingTemplate && <button type="button" className="button button-secondary" onClick={() => { setEditingTemplate(null); setTemplate({ doctorId: "", dayOfWeek: "1", startTime: "09:00", endTime: "17:00", assignmentType: "IN_PERSON", effectiveFrom: "", effectiveUntil: "" }); setTemplateDoctorSearch(""); }}>Cancel edit</button>}<button className="button button-secondary" disabled={runMutation.isPending || !template.doctorId || !template.effectiveFrom}>{editingTemplate ? "Save pattern" : "Add weekly pattern"}</button></div>
                </form>
              </div>}
              {isDraft && canWrite && <form className="roster-generate-bar" onSubmit={(event) => { event.preventDefault(); const from = zonedDateInputToIso(generation.from, timeZone); const through = zonedDateInputToIso(generation.through, timeZone, true); if (new Date(through) < new Date(from)) { toast.error("End date must be after start date."); return; } runMutation.mutate({ path: `/api/departments/${encodeURIComponent(departmentId)}/rosters/${encodeURIComponent(selectedId)}/generate`, body: { from, through } }); }}><div><b>Generate from weekly patterns</b><span>Existing generated duties inside the date range will be replaced. Conflict checks run before save.</span></div><label>From<input required type="date" value={generation.from} onChange={(event) => setGeneration({ ...generation, from: event.target.value })}/></label><label>Through<input required type="date" value={generation.through} onChange={(event) => setGeneration({ ...generation, through: event.target.value })}/></label><button className="button button-primary" disabled={runMutation.isPending || !selected.templates.length}>{runMutation.isPending ? "Generating…" : "Generate duties"}</button></form>}
              <div className="roster-record-list"><div className="roster-record-heading"><div><h3>Scheduled duties</h3><p>Times shown in {timeZone}</p></div>{isDraft && canPublish && <button className="button button-primary" onClick={() => runMutation.mutate({ path: `/api/departments/${encodeURIComponent(departmentId)}/rosters/${encodeURIComponent(selectedId)}/publish`, body: overrideReason.trim() ? { overrideReason: overrideReason.trim() } : {} })} disabled={runMutation.isPending || blockingCount > 0 || (warningCount > 0 && (!canOverride || overrideReason.trim().length < 10))}>{runMutation.isPending ? "Validating…" : "Validate & publish"}</button>}</div>
                {isDraft && warningCount > 0 && canOverride && <label className="override-reason">Authorized warning override reason<textarea minLength={10} maxLength={1000} value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Explain why publication should proceed despite the warning (at least 10 characters)."/><small>Only the Department Head, Hospital Admin, or Super Admin can publish with warnings. Blocking issues cannot be overridden.</small></label>}
                {selected.assignments.length === 0 ? <div className="roster-list-state">No duties yet. Add one or create a weekly pattern and generate duties.</div> : selected.assignments.map((assignment) => <article className="roster-assignment" key={assignment.id}><span className="roster-assignment-mark">{assignment.assignmentType === "IN_PERSON" ? "IN" : "VC"}</span><div className="roster-assignment-main"><b>{doctorName.get(assignment.doctorId) ?? `Doctor ${assignment.doctorId.slice(0, 8)}`}</b><span>{dateLabel(assignment.startsAt, timeZone)} – {dateLabel(assignment.endsAt, timeZone)}</span>{assignment.exceptionNote && <small>{assignment.exceptionNote}</small>}</div><span className="roster-type-chip">{assignment.assignmentType === "IN_PERSON" ? "In person" : "Teleconsult"}</span>{isDraft && canWrite && <div className="roster-row-actions"><button aria-label="Edit duty" title="Edit duty" onClick={() => { setForm({ doctorId: assignment.doctorId, startsAt: toZonedInput(new Date(assignment.startsAt), timeZone), endsAt: toZonedInput(new Date(assignment.endsAt), timeZone), assignmentType: assignment.assignmentType, exceptionNote: assignment.exceptionNote ?? "" }); setDoctorSearch(""); setConflicts([]); setEditing({ ...assignment }); document.getElementById("roster-edit-assignment")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>Edit</button><button aria-label="Delete duty" title="Delete duty" onClick={() => { if (window.confirm("Delete this draft duty?")) runMutation.mutate({ path: `/api/departments/${encodeURIComponent(departmentId)}/rosters/${encodeURIComponent(selectedId)}/assignments/${encodeURIComponent(assignment.id)}`, method: "DELETE" }); }}>Delete</button></div>}</article>)}
              </div>
            </>}
            {activeTab === "templates" && <div className="roster-record-list"><div className="roster-record-heading"><div><h3>Weekly patterns</h3><p>Patterns recur by hospital local weekday and time.</p></div></div>{selected.templates.length ? selected.templates.map((item) => <article className="roster-assignment" key={item.id}><span className="roster-assignment-mark">{weekdayShort[item.dayOfWeek]}</span><div className="roster-assignment-main"><b>{doctorName.get(item.doctorId) ?? `Doctor ${item.doctorId.slice(0, 8)}`}</b><span>{weekdayLabels[item.dayOfWeek]} · {minuteLabel(item.startMinute)}–{minuteLabel(item.endMinute)} · {item.assignmentType === "IN_PERSON" ? "In person" : "Teleconsultation"}</span><small>Effective {dateLabel(item.effectiveFrom, timeZone).split(",")[0]}{item.effectiveUntil ? ` through ${dateLabel(item.effectiveUntil, timeZone).split(",")[0]}` : " onward"}</small></div>{isDraft && canWrite && <div className="roster-row-actions"><button aria-label="Edit weekly pattern" onClick={() => { setTemplate({ doctorId: item.doctorId, dayOfWeek: String(item.dayOfWeek), startTime: minuteLabel(item.startMinute), endTime: minuteLabel(item.endMinute), assignmentType: item.assignmentType, effectiveFrom: toZonedInput(new Date(item.effectiveFrom), timeZone).slice(0, 10), effectiveUntil: item.effectiveUntil ? toZonedInput(new Date(item.effectiveUntil), timeZone).slice(0, 10) : "" }); setTemplateDoctorSearch(doctorName.get(item.doctorId) ?? ""); setEditingTemplate(item); setActiveTab("assignments"); setTimeout(() => document.querySelector(".roster-action-grid")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0); }}>Edit</button><button aria-label="Delete weekly pattern" onClick={() => { if (window.confirm("Delete this weekly pattern? Existing generated duties will remain.")) runMutation.mutate({ path: `/api/departments/${encodeURIComponent(departmentId)}/rosters/${encodeURIComponent(selectedId)}/templates/${encodeURIComponent(item.id)}`, method: "DELETE" }); }}>Delete</button></div>}</article>) : <div className="roster-list-state">No weekly patterns yet. Add one from the Duties tab.</div>}</div>}
            {activeTab === "revisions" && <div className="roster-record-list"><div className="roster-record-heading"><div><h3>Published snapshots</h3><p>Each publication is immutable. Make a new draft for later changes.</p></div></div>{revisionQuery.isPending ? <div className="roster-list-state">Loading revision history…</div> : revisionQuery.isError ? <div className="roster-list-state roster-inline-error">{revisionQuery.error.message}<button onClick={() => void revisionQuery.refetch()}>Retry</button></div> : revisionQuery.data?.length ? revisionQuery.data.map((revision) => <article className="roster-assignment" key={revision.id}><span className="roster-assignment-mark">r{revision.revision}</span><div className="roster-assignment-main"><b>Revision {revision.revision}</b><span>Published {dateLabel(revision.publishedAt, timeZone)}</span><small>Snapshot includes the assignments and validation result at publication.</small></div></article>) : <div className="roster-list-state">No published revisions for this roster.</div>}</div>}
          </> : null}
        </main>
      </div>
    </>}
    {tourStep !== null && <aside className="roster-tour-card" role="dialog" aria-labelledby="roster-tour-title" aria-live="polite"><div className="roster-tour-header"><span>ROSTER GUIDE · {tourStep + 1} OF {tourSteps.length}</span><button onClick={() => changeTourStep(null)} aria-label="Close roster guide">×</button></div><h2 id="roster-tour-title">{tourSteps[tourStep].title}</h2><p>{tourSteps[tourStep].body}</p><div className="roster-tour-progress" aria-hidden="true">{tourSteps.map((step, index) => <i key={step.title} className={index <= tourStep ? "complete" : ""}/>)}</div><div className="roster-tour-actions"><button className="roster-tour-skip" onClick={() => changeTourStep(null)}>Skip guide</button><div>{tourStep > 0 && <button className="button button-secondary" onClick={() => changeTourStep(tourStep - 1)}>Back</button>}<button className="button button-primary" onClick={() => changeTourStep(tourStep === tourSteps.length - 1 ? null : tourStep + 1)}>{tourStep === tourSteps.length - 1 ? "Finish" : "Next"}</button></div></div></aside>}
  </div>;
}

function DoctorPicker({ label, doctors, value, search, onSearch, onChange }: { label: string; doctors: Doctor[]; value: string; search: string; onSearch: (value: string) => void; onChange: (value: string) => void }) {
  const available = doctors.filter((doctor) => doctor.doctorProfileId);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const matches = available.filter((doctor) => `${doctor.displayName} ${doctor.specialty ?? ""}`.toLocaleLowerCase().includes(normalizedSearch));
  return <label className="roster-doctor-picker">{label}<input type="search" value={search} onChange={(event) => { onSearch(event.target.value); onChange(""); }} placeholder="Search by doctor or specialty" autoComplete="off"/><select required value={value} onChange={(event) => onChange(event.target.value)}><option value="">{matches.length ? `Choose from ${matches.length} matching doctor${matches.length === 1 ? "" : "s"}` : "No matching doctors"}</option>{matches.map((doctor) => <option key={doctor.id} value={doctor.doctorProfileId!}>{doctor.displayName}{doctor.specialty ? ` · ${doctor.specialty}` : ""}</option>)}</select>{!available.length && <small>No active doctors with a profile are available in this department.</small>}</label>;
}
