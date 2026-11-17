"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { apiFetch } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { hasPermission } from "@/lib/auth/permissions";

const schema = z.object({
  email: z.string().trim().min(1, "Enter an email address.").email("Enter a valid email address.").max(254, "Email address must be 254 characters or fewer."),
  username: z.string().trim().min(3, "Username must be at least 3 characters.").max(80, "Username must be 80 characters or fewer.").regex(/^[a-zA-Z0-9._-]+$/, "Use only letters, numbers, dots, underscores, or hyphens.").optional().or(z.literal("")),
  role: z.enum(["SUPER_ADMIN", "HOSPITAL_ADMIN", "ROSTER_MANAGER", "DEPARTMENT_HEAD", "DOCTOR", "RECEPTION_FRONT_DESK"]),
  departmentId: z.string(),
  displayName: z.string().trim().max(120, "Name must be 120 characters or fewer.").optional(),
  specialty: z.string().trim().max(120, "Specialty must be 120 characters or fewer.").optional(),
  licenseNumber: z.string().trim().max(80, "License number must be 80 characters or fewer.").optional(),
}).superRefine((value, context) => {
  if (!["SUPER_ADMIN", "HOSPITAL_ADMIN"].includes(value.role) && !value.departmentId) context.addIssue({ code: "custom", message: "Choose a department for this role.", path: ["departmentId"] });
  if (value.role === "DOCTOR" && !value.displayName?.trim()) context.addIssue({ code: "custom", message: "Enter the doctor’s display name.", path: ["displayName"] });
});

type Values = z.infer<typeof schema>;
type Department = { id: string; name: string; code: string };

export function InviteForm() {
  const current = useCurrentUser();
  const isManager = hasPermission(current.data?.role, "accounts:manage");
  const departments = useQuery({ queryKey: ["departments", "current-user"], enabled: Boolean(isManager), queryFn: async () => { const response = await apiFetch("/api/me/departments"); if (!response.ok) throw new Error("Could not load departments."); return (await response.json() as { departments: Department[] }).departments; } });
  const { control, register, handleSubmit, setValue, formState: { errors, isSubmitting }, setError, clearErrors, setFocus } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", username: "", role: "DOCTOR", departmentId: "", displayName: "", specialty: "", licenseNumber: "" }, mode: "onBlur", reValidateMode: "onChange" });
  const selectedRole = useWatch({ control, name: "role" });
  const requiresDepartment = !["SUPER_ADMIN", "HOSPITAL_ADMIN"].includes(selectedRole);
  const departmentIds = current.data?.role === "SUPER_ADMIN" ? ["SUPER_ADMIN", "HOSPITAL_ADMIN", "ROSTER_MANAGER", "DEPARTMENT_HEAD", "DOCTOR", "RECEPTION_FRONT_DESK"] : ["HOSPITAL_ADMIN", "ROSTER_MANAGER", "DEPARTMENT_HEAD", "DOCTOR", "RECEPTION_FRONT_DESK"];

  async function submit(values: Values) {
    clearErrors("root");
    const payload = { email: values.email, username: values.username || undefined, role: values.role, departmentIds: values.departmentId ? [values.departmentId] : [], displayName: values.displayName || undefined, specialty: values.specialty || undefined, licenseNumber: values.licenseNumber || undefined };
    try {
      const response = await apiFetch("/auth/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({})) as { error?: string; message?: string; deliveryStatus?: string; invitationSent?: boolean; user?: { username?: string } };
      if (!response.ok) {
        const message = result.message ?? (result.error === "ROLE_ASSIGNMENT_FORBIDDEN" ? "Your role cannot invite this account type." : result.error === "DEPARTMENT_REQUIRED" ? "This role requires a department." : "EyeZen could not create the invitation. Check the details and try again.");
        setError("root", { message });
        setFocus("email");
        return;
      }
      const delivery = result.deliveryStatus === "SENT" ? "Invitation sent by email." : result.deliveryStatus === "QUEUED" ? "Email delivery is not confirmed yet. Check Notification delivery for the provider response and retry status." : result.deliveryStatus === "LOCAL_ONLY" ? "Invitation recorded locally; email delivery is not configured." : "Invitation recorded. Check Notification delivery for its status.";
      setError("root", { message: `${delivery}${result.user?.username ? ` Username: ${result.user.username}.` : ""}` });
    } catch {
      setError("root", { message: "EyeZen API could not be reached. Your form values are still here; try again when the connection is available." });
    }
  }

  if (current.isPending) return <div className="session-panel"><span className="session-symbol">…</span><div><b>Checking account permissions</b><p>Your session is verified before invitation controls appear.</p></div></div>;
  if (!isManager) return <div className="session-panel"><span className="session-symbol">i</span><div><b>Invitation access is restricted</b><p>Only Super Admin and Hospital Admin can invite accounts. The backend enforces this permission.</p></div></div>;

  return <form className="invite-form" onSubmit={handleSubmit(submit)} noValidate>
    <fieldset className="invite-section">
      <legend>Account details</legend>
      <p className="invite-section-help">Choose the account type and where this colleague will work.</p>
      <div className="form-grid">
        <label className="form-label">Work email<input type="email" autoComplete="email" placeholder="name@hospital.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "invite-email-error" : undefined} {...register("email")}/>{errors.email && <small id="invite-email-error" className="field-error" role="alert">{errors.email.message}</small>}</label>
        <label className="form-label">Role<select aria-invalid={Boolean(errors.role)} {...register("role", { onChange: (event) => { setValue("departmentId", ""); clearErrors("departmentId"); setValue("role", event.target.value as Values["role"]); } })}>{departmentIds.map((role)=><option value={role} key={role}>{role.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,(letter)=>letter.toUpperCase())}</option>)}</select><small className="field-hint">This determines which workspaces the account can access.</small></label>
        {requiresDepartment && <label className="form-label">Department<select aria-invalid={Boolean(errors.departmentId)} aria-describedby={errors.departmentId ? "invite-department-error" : undefined} {...register("departmentId")}><option value="">Choose a department</option>{(departments.data ?? []).map((department)=><option key={department.id} value={department.id}>{department.name} · {department.code}</option>)}</select>{departments.isLoading && <small className="field-hint">Loading departments…</small>}{departments.isError && <small className="field-error" role="alert">Departments could not be loaded. Refresh and try again.</small>}{departments.data?.length === 0 && <small className="field-error">There are no active departments to assign.</small>}{errors.departmentId && <small id="invite-department-error" className="field-error" role="alert">{errors.departmentId.message}</small>}</label>}
        <label className="form-label">Username <span className="optional-label">Optional</span><input autoComplete="off" placeholder="Generated automatically if blank" aria-invalid={Boolean(errors.username)} aria-describedby={errors.username ? "invite-username-error" : "invite-username-help"} {...register("username")}/><small id="invite-username-help" className="field-hint">Use 3–80 letters, numbers, dots, underscores, or hyphens.</small>{errors.username && <small id="invite-username-error" className="field-error" role="alert">{errors.username.message ?? "Check the username format."}</small>}</label>
      </div>
    </fieldset>
    {selectedRole === "DOCTOR" && <fieldset className="invite-section doctor-invite-section">
      <legend>Doctor profile</legend>
      <p className="invite-section-help">The display name is required. Specialty and license number help staff identify the right clinician.</p>
      <div className="form-grid">
        <label className="form-label">Doctor’s display name<input required maxLength={120} autoComplete="name" placeholder="e.g. Anubhav Mishra" aria-invalid={Boolean(errors.displayName)} aria-describedby={errors.displayName ? "invite-doctor-name-error" : undefined} {...register("displayName")}/>{errors.displayName && <small id="invite-doctor-name-error" className="field-error" role="alert">{errors.displayName.message}</small>}</label>
        <label className="form-label">Specialty <span className="optional-label">Optional</span><input maxLength={120} placeholder="e.g. Ophthalmology" aria-invalid={Boolean(errors.specialty)} {...register("specialty")}/>{errors.specialty && <small className="field-error" role="alert">{errors.specialty.message}</small>}</label>
        <label className="form-label">License number <span className="optional-label">Optional</span><input maxLength={80} placeholder="Professional license number" aria-invalid={Boolean(errors.licenseNumber)} {...register("licenseNumber")}/>{errors.licenseNumber && <small className="field-error" role="alert">{errors.licenseNumber.message}</small>}</label>
      </div>
    </fieldset>}
    <div className="invite-note"><span className="note-indicator"/>The invite expires after 72 hours. Delivery status will be shown after the request completes.</div>
    {errors.root?.message && <div className="form-result" role="status">{errors.root.message}</div>}
    <div className="invite-actions"><button type="submit" className="button button-primary" disabled={isSubmitting || departments.isLoading || (requiresDepartment && !departments.data?.length)}>{isSubmitting ? "Creating invitation…" : selectedRole === "DOCTOR" ? "Invite doctor" : "Create invitation"}<span>→</span></button></div>
  </form>;
}
