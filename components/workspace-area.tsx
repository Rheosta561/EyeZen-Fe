"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { InviteForm } from "@/components/admin/invite-form";
import { PasswordSettings } from "@/components/auth/password-settings";
import { hasPermission, isHospitalWide } from "@/lib/auth/permissions";
import { LeaveWorkflow } from "@/components/workflows/leave-workflow";
import { RosterWorkspace } from "@/components/rosters/roster-workspace";
import { DoctorSchedule } from "@/components/scheduling/doctor-schedule";
import { RoomAdmin } from "@/components/scheduling/room-admin";
import { CrudWorkflows } from "@/components/workflows/crud-workflows";

type Row = Record<string, unknown>;
type Department = { id: string; name: string; code: string };
const titles: Record<string, string> = { rosters: "Roster calendar", rooms: "Rooms", schedule: "My scheduled occurrences", availability: "My availability", appointments: "Appointments", leave: "Leave and cover", replacements: "Replacement workflow", departments: "Departments", doctors: "Doctor directory", notifications: "Notification delivery", accounts: "Account directory", profile: "My account", overview: "Overview" };
const descriptions: Record<string, string> = { rooms: "Create and maintain the rooms available for department duties.", schedule: "Your own scheduled occurrences from the calendar-first roster.", availability: "Review your working hours and dated availability.", appointments: "Appointment details follow your role and department scope.", leave: "Review department requests or follow your own leave history.", replacements: "Track replacement workflow status in your department.", departments: "Hospital-wide department operations.", doctors: "Doctors available in this department.", notifications: "Delivery state reflects the worker and email provider response.", accounts: "Account access and invitations are controlled by hospital administrators.", profile: "Your EyeZen identity and account settings." };

function extractRows(area: string, role: string, payload: unknown): Row[] {
  if (Array.isArray(payload)) return payload as Row[];
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Row;
  const field = area === "notifications" ? "events" : area === "doctors" ? "doctors" : area === "departments" ? "departments" : area === "leave" && role === "DOCTOR" ? "requests" : area === "schedule" ? "assignments" : area === "availability" ? "availability" : "items";
  if (area === "profile" && record.user && typeof record.user === "object") return [record.user as Row];
  if (area === "availability") return [...(Array.isArray(record.hours) ? (record.hours as Row[]).map((item) => ({ ...item, recordType: "Weekly hours" })) : []), ...(Array.isArray(record.availability) ? (record.availability as Row[]).map((item) => ({ ...item, recordType: "Dated availability" })) : [])];
  return Array.isArray(record[field]) ? record[field] as Row[] : [];
}
function valueText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value && typeof value === "object" && "displayName" in value) return valueText((value as Row).displayName);
  if (value && typeof value === "object" && "name" in value) return valueText((value as Row).name);
  return "—";
}
function dateText(value: unknown, timeZone: string): string {
  if (typeof value !== "string") return valueText(value);
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
}
function pick(row: Row, keys: string[]) { for (const key of keys) if (row[key] !== undefined && row[key] !== null) return valueText(row[key]); return "—"; }

export function WorkspaceArea({ area, timeZone = "UTC" }: { area: string; timeZone?: string }) {
  const current = useCurrentUser();
  const user = current.data;
  const role = user?.role ?? "";
  const hospitalWide = isHospitalWide(role);
  const [departmentId, setDepartmentId] = useState("");
  const [filter, setFilter] = useState("PENDING");
  const [accountSearch, setAccountSearch] = useState(""); const [accountRole, setAccountRole] = useState(""); const [accountActive, setAccountActive] = useState(""); const [accountPage, setAccountPage] = useState(1);
  const [accountDepartment, setAccountDepartment] = useState("");
  const queryClient = useQueryClient();
  const departmentQuery = useQuery({ queryKey: ["departments", "mine"], enabled: Boolean(user), queryFn: async () => { const response = await apiFetch("/api/me/departments"); if (!response.ok) throw new Error("Your departments could not be loaded."); return (await response.json() as { departments: Department[] }).departments; } });
  const activeDepartment = useMemo(() => {
    const ids = departmentQuery.data?.map((department) => department.id) ?? [];
    if (departmentId && ids.includes(departmentId)) return departmentId;
    if (hospitalWide) return "";
    const saved = typeof window === "undefined" ? "" : window.localStorage.getItem("eyezen_department_preference") ?? "";
    return ids.includes(saved) ? saved : ids[0] ?? "";
  }, [departmentId, departmentQuery.data, hospitalWide]);
  const route = useMemo(() => {
    if (!user) return "";
    if (area === "departments") return hasPermission(role, "departments:manage") ? "/api/departments" : "";
    if (area === "accounts") return hasPermission(role, "accounts:manage") ? `/auth/admin/users?page=${accountPage}&pageSize=25${accountSearch.trim() ? `&q=${encodeURIComponent(accountSearch.trim())}` : ""}${accountRole ? `&role=${encodeURIComponent(accountRole)}` : ""}${accountActive ? `&active=${accountActive}` : ""}${accountDepartment ? `&departmentId=${encodeURIComponent(accountDepartment)}` : ""}` : "";
    if (area === "notifications") return hasPermission(role, "notifications:manage") ? "/api/admin/notifications?limit=50" : "";
    if (["profile", "overview"].includes(area)) return "/auth/me";
    if (area === "availability" && role === "DOCTOR" && activeDepartment) { const from = new Date(); const through = new Date(from); through.setDate(from.getDate() + 90); return `/api/me/availability?departmentId=${encodeURIComponent(activeDepartment)}&from=${encodeURIComponent(from.toISOString())}&through=${encodeURIComponent(through.toISOString())}`; }
    if (area === "leave" && role === "DOCTOR") return "/api/me/leave-requests";
    if (area === "replacements" && role === "DOCTOR") return "/api/me/replacements?page=1&pageSize=25";
    if (area === "rosters") return "";
    if (area === "appointments" && activeDepartment) return `/api/departments/${encodeURIComponent(activeDepartment)}/appointments`;
    if (area === "leave" && activeDepartment) return `/api/departments/${encodeURIComponent(activeDepartment)}/leave-requests?status=${filter}`;
    if (area === "replacements" && activeDepartment) return `/api/departments/${encodeURIComponent(activeDepartment)}/replacements?page=1&pageSize=25`;
    if (area === "doctors" && activeDepartment) return `/auth/departments/${encodeURIComponent(activeDepartment)}/doctors`;
    return "";
  }, [user, area, role, activeDepartment, filter, accountPage, accountSearch, accountRole, accountActive, accountDepartment]);
  const query = useQuery({ queryKey: ["workspace", area, role, activeDepartment, filter], enabled: Boolean(route), queryFn: async () => { const response = await apiFetch(route); if (!response.ok) { const body = await response.json().catch(() => ({})) as { message?: string }; throw new Error(body.message ?? (response.status === 403 ? "Your role or department cannot access this view." : response.status === 404 ? "This data is not available." : "EyeZen could not load this information.")); } const data = await response.json() as unknown; if (area === "availability" && activeDepartment) { const hoursResponse = await apiFetch(`/api/me/working-hours?departmentId=${encodeURIComponent(activeDepartment)}`); if (!hoursResponse.ok) throw new Error("Weekly working hours could not be loaded."); const hours = await hoursResponse.json() as { hours?: Row[] }; return { ...(data as Row), hours: hours.hours ?? [] }; } return data; } });
  const retryMutation = useMutation({ mutationFn: async (eventId: string) => { const response = await apiFetch(`/api/admin/notifications/${encodeURIComponent(eventId)}/retry`, { method: "POST" }); if (!response.ok) throw new Error("This notification could not be retried."); }, onSuccess: async () => { toast.success("Retry requested"); await queryClient.invalidateQueries({ queryKey: ["workspace", "notifications"] }); }, onError: (error) => toast.error(error.message) });
  const accountMutation = useMutation({ mutationFn: async ({ id, action }: { id: string; action: "invite" | "deactivate" }) => { const response = await apiFetch(`/auth/admin/users/${encodeURIComponent(id)}/${action}`, { method: "POST" }); if (!response.ok) throw new Error("EyeZen could not complete this account action."); }, onSuccess: async (_data, variables) => { toast.success(variables.action === "invite" ? "Invitation request recorded" : "Account deactivated"); await queryClient.invalidateQueries({ queryKey: ["workspace", "accounts"] }); }, onError: (error) => toast.error(error.message) });
  const rows = extractRows(area, role, query.data);
  const accountPageInfo = area === "accounts" && query.data && typeof query.data === "object" ? query.data as { page?: number; pageSize?: number; total?: number } : null;
  const title = titles[area] ?? "Workspace";
  const needsDepartment = ["rosters", "rooms", "appointments", "leave", "replacements", "doctors", "availability"].includes(area) && !(area === "leave" && role === "DOCTOR") && !(area === "replacements" && role === "DOCTOR");
  const available = Boolean(route) || area === "invite";
  const saveDepartment = (value: string) => { setDepartmentId(value); window.localStorage.setItem("eyezen_department_preference", value); window.dispatchEvent(new Event("eyezen-department-preference")); };

  if (area === "schedule" && role === "DOCTOR") return <><PageHead title={title} description={descriptions.schedule}/><DoctorSchedule departmentId={activeDepartment} timeZone={timeZone}/></>;
  if (area === "invite") return <><PageHead title="Invite a colleague" description="Create an inactive staff account and send or queue its secure invitation."/><InviteForm/></>;
  const departmentSelect = (needsDepartment || area === "rosters") && departmentQuery.data?.length ? <div className="workspace-toolbar"><label>Department<select aria-label="Choose department" value={activeDepartment} onChange={(event) => saveDepartment(event.target.value)}><option value="" disabled>{hospitalWide ? "Choose a department" : "Select department"}</option>{departmentQuery.data.map((department) => <option key={department.id} value={department.id}>{department.name} · {department.code}</option>)}</select></label>{area === "leave" && role !== "DOCTOR" && <div className="filter-row">{["PENDING", "APPROVED", "REJECTED"].map((status) => <button key={status} className={filter === status ? "filter-active" : ""} onClick={() => setFilter(status)}>{status[0] + status.slice(1).toLowerCase()}</button>)}</div>}</div> : null;
  if (area === "rooms") return <><PageHead title={title} description={descriptions.rooms}/>{departmentSelect}{departmentQuery.isError && <InfoBox message="Departments could not be loaded. Retry the connection to continue."/>}<RoomAdmin departments={departmentQuery.data ?? []} departmentId={activeDepartment}/><p className="scope-footnote">Room management is limited to hospital administrators. Existing room assignments remain in history after deactivation.</p></>;
  if (area === "rosters") return <><PageHead title={title} description="Maintain the calendar-first timetable with roster rules, dated occurrences, and overrides."/>{departmentSelect}{departmentQuery.isError && <InfoBox message="Departments could not be loaded. Retry the connection to continue."/>}<RosterWorkspace departments={departmentQuery.data ?? []} departmentId={activeDepartment} timeZone={timeZone}/><p className="scope-footnote">Blocking conflicts cannot be overridden. Warning overrides require an authorized role and a recorded reason.</p></>;

  return <><PageHead title={title} description={descriptions[area] ?? "This workspace is scoped to your EyeZen account."}/>{departmentSelect}{area === "accounts" && <div className="workspace-toolbar"><label>Search<input value={accountSearch} onChange={(e) => { setAccountSearch(e.target.value); setAccountPage(1); }} placeholder="Name, username, or email"/></label><label>Role<select value={accountRole} onChange={(e) => { setAccountRole(e.target.value); setAccountPage(1); }}><option value="">All roles</option>{["SUPER_ADMIN", "HOSPITAL_ADMIN", "ROSTER_MANAGER", "DEPARTMENT_HEAD", "DOCTOR", "RECEPTION_FRONT_DESK"].filter((r) => role === "SUPER_ADMIN" || r !== "SUPER_ADMIN").map((r) => <option key={r} value={r}>{r.replaceAll("_", " ")}</option>)}</select></label><label>Status<select value={accountActive} onChange={(e) => { setAccountActive(e.target.value); setAccountPage(1); }}><option value="">All accounts</option><option value="true">Active</option><option value="false">Inactive</option></select></label><label>Department<select value={accountDepartment} onChange={(e) => { setAccountDepartment(e.target.value); setAccountPage(1); }}><option value="">All departments</option>{(departmentQuery.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name} · {d.code}</option>)}</select></label></div>}{area === "leave" && <LeaveWorkflow role={role} departments={departmentQuery.data ?? []} departmentId={activeDepartment} timeZone={timeZone}/ >}{departmentQuery.isError && <InfoBox message="Departments could not be loaded. Retry the connection to continue."/>}{!available && <InfoBox message="This section is not available for your current role."/>}<section className="workspace-data-panel">{needsDepartment && departmentQuery.isPending ? <div className="workspace-state">Loading department access…</div> : query.isPending && route ? <div className="workspace-state">Loading {title.toLowerCase()}…</div> : query.error ? <div className="workspace-state workspace-error"><b>Could not load {title.toLowerCase()}</b><span>{query.error.message}</span><button onClick={() => void query.refetch()}>Try again</button></div> : !route ? null : rows.length === 0 ? <div className="workspace-empty"><span className="empty-mark">✓</span><b>No {title.toLowerCase()} to show</b><span>There are no records in this view right now.</span></div> : <div className="workspace-row-list">{rows.map((row, index) => { const id = valueText(row.id); const status = valueText(row.status); const details = area === "appointments" || area === "schedule" ? `${dateText(row.startsAt, timeZone)} · ${dateText(row.endsAt, timeZone)} · ${pick(row, ["status", "assignmentType", "roster"])}` : area === "notifications" ? `${humanize(valueText(row.aggregateType))} · ${dateText(row.createdAt, timeZone)} · ${pick(row, ["attemptCount"])} attempts` : area === "accounts" ? `${pick(row, ["email"])} · ${pick(row, ["role"])} · ${row.isActive === true ? "Active" : "Inactive"}` : area === "leave" ? `${dateText(row.startsAt, timeZone)} – ${dateText(row.endsAt, timeZone)} · ${pick(row, ["category", "department"])}` : area === "replacements" ? `${pick(row, ["status"])} · ${pick(row, ["department", "proposedDoctor"])}` : area === "doctors" ? `${pick(row, ["specialty"])} · ${id}` : area === "availability" ? row.recordType === "Weekly hours" ? `Day ${valueText(row.dayOfWeek)} · ${valueText(row.startMinute)}–${valueText(row.endMinute)} · weekly hours` : `${dateText(row.startsAt, timeZone)} – ${dateText(row.endsAt, timeZone)} · ${valueText(row.available)}` : area === "departments" ? `${pick(row, ["code"])} · ${pick(row, ["description"])}` : `${pick(row, ["email"])} · ${pick(row, ["role"])}`; return <article className={`workspace-row${area === "notifications" ? " notification-row" : ""}`} key={id === "—" ? index : id}><div className="workspace-row-main"><b>{area === "notifications" ? humanize(valueText(row.eventType)) : pick(row, ["name", "displayName", "patientName", "username", "eventType", "category", "startsAt", "recordType", "id"])}</b><span>{details}</span></div><span className={`status-chip ${status.toLowerCase()}`}>{status === "—" ? (row.isActive === true ? "Active" : row.isActive === false ? "Inactive" : row.available === true ? "Available" : row.available === false ? "Unavailable" : valueText(row.recordType)) : status.replaceAll("_", " ")}</span>{area === "notifications" && (Boolean(row.lastError) || Array.isArray(row.attempts)) && <details className="notification-details"><summary>Delivery details</summary>{Boolean(row.lastError) && <p className="notification-error"><b>Last error:</b> {valueText(row.lastError)}</p>}{Array.isArray(row.attempts) && row.attempts.map((attempt, attemptIndex) => <p className="notification-attempt" key={valueText(attempt.id) === "—" ? attemptIndex : valueText(attempt.id)}><b>{valueText(attempt.provider)} · {valueText(attempt.status)}</b>{attempt.responseCode ? ` · HTTP ${valueText(attempt.responseCode)}` : ""}{attempt.error ? ` · ${valueText(attempt.error)}` : ""}{attempt.attemptedAt ? ` · ${dateText(attempt.attemptedAt, timeZone)}` : ""}</p>)}</details>}{area === "notifications" && ["FAILED", "RETRYABLE"].includes(status) && <button className="button button-secondary compact" onClick={() => retryMutation.mutate(id)} disabled={retryMutation.isPending}>Retry delivery</button>}{area === "accounts" && row.isActive === false && <button className="button button-secondary compact" onClick={() => accountMutation.mutate({ id, action: "invite" })} disabled={accountMutation.isPending}>Resend invite</button>}{area === "accounts" && row.isActive === true && <button className="button button-secondary compact" onClick={() => { if (window.confirm(`Deactivate ${pick(row, ["username"])}? This revokes their sessions.`)) accountMutation.mutate({ id, action: "deactivate" }); }} disabled={accountMutation.isPending}>Deactivate</button>}{area === "leave" && role !== "DOCTOR" && status === "PENDING" && <LeaveWorkflow role={role} departments={departmentQuery.data ?? []} departmentId={activeDepartment} requestId={id} timeZone={timeZone}/>}</article>; })}</div>}</section>{area === "accounts" && accountPageInfo && <div className="workspace-toolbar"><span>Page {accountPageInfo.page} · {accountPageInfo.total} accounts</span><button disabled={accountPage <= 1 || query.isFetching} onClick={() => setAccountPage((n) => n - 1)}>Previous</button><button disabled={accountPage * (accountPageInfo.pageSize ?? 25) >= (accountPageInfo.total ?? 0) || query.isFetching} onClick={() => setAccountPage((n) => n + 1)}>Next</button></div>}<CrudWorkflows area={area} role={role} departmentId={activeDepartment} rows={rows} timeZone={timeZone} refresh={() => query.refetch()}/>{area === "profile" && <PasswordSettings/>}<p className="scope-footnote">Access is enforced by the EyeZen API. Times are shown in {timeZone}.</p></>;
}

function PageHead({ title, description }: { title: string; description: string }) { return <div className="workspace-page-head"><div className="eyebrow">EYEZEN HOSPITAL{" "}<span className="context-dot"/>{" "}OPERATIONS</div><h1>{title}</h1><p>{description}</p></div>; }
function humanize(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function InfoBox({ message }: { message: string }) { return <div className="workspace-infobox"><span>i</span>{message}</div>; }
