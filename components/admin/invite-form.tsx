"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { apiFetch } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { hasPermission } from "@/lib/auth/permissions";

const schema = z.object({
  email: z.string().email("Enter a valid email address.").max(254),
  username: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9._-]+$/).optional().or(z.literal("")),
  role: z.enum(["SUPER_ADMIN", "HOSPITAL_ADMIN", "ROSTER_MANAGER", "DEPARTMENT_HEAD", "DOCTOR", "RECEPTION_FRONT_DESK"]),
  departmentId: z.string(),
  displayName: z.string().trim().max(120).optional(),
  specialty: z.string().trim().max(120).optional(),
  licenseNumber: z.string().trim().max(80).optional(),
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
  const { control, register, handleSubmit, setValue, formState: { errors, isSubmitting }, setError, clearErrors, setFocus } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", username: "", role: "DOCTOR", departmentId: "", displayName: "", specialty: "", licenseNumber: "" } });
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
      const delivery = result.deliveryStatus === "SENT" ? "Invitation sent by email." : result.deliveryStatus === "QUEUED" ? "Invitation queued for email delivery." : result.deliveryStatus === "LOCAL_ONLY" ? "Invitation recorded locally; email delivery is not configured." : "Invitation recorded. Check the delivery status in EyeZen.";
      setError("root", { message: `${delivery}${result.user?.username ? ` Username: ${result.user.username}.` : ""}` });
    } catch {
      setError("root", { message: "EyeZen API could not be reached. Your form values are still here; try again when the connection is available." });
    }
  }

  if (current.isPending) return <div className="session-panel"><span className="session-symbol">…</span><div><b>Checking account permissions</b><p>Your session is verified before invitation controls appear.</p></div></div>;
  if (!isManager) return <div className="session-panel"><span className="session-symbol">i</span><div><b>Invitation access is restricted</b><p>Only Super Admin and Hospital Admin can invite accounts. The backend enforces this permission.</p></div></div>;

  return <form className="invite-form" onSubmit={handleSubmit(submit)} noValidate>
    <div className="form-grid"><label className="form-label">Email address<input type="email" autoComplete="email" placeholder="colleague@eyezenhospital.com" {...register("email")}/>{errors.email && <small className="field-error">{errors.email.message}</small>}</label><label className="form-label">Role<select {...register("role", { onChange: (event) => { setValue("departmentId", ""); clearErrors("departmentId"); setValue("role", event.target.value as Values["role"]); } })}>{departmentIds.map((role)=><option value={role} key={role}>{role.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,(letter)=>letter.toUpperCase())}</option>)}</select>{errors.role && <small className="field-error">{errors.role.message}</small>}</label><label className="form-label">Username <span className="optional-label">Optional · generated if blank</span><input autoComplete="off" placeholder="Auto-generated from name or email" {...register("username")}/>{errors.username && <small className="field-error">Use 3–80 letters, numbers, dots, underscores, or hyphens.</small>}</label>{requiresDepartment && <label className="form-label">Department<select {...register("departmentId")} defaultValue=""><option value="">Choose a department</option>{(departments.data ?? []).map((department)=><option key={department.id} value={department.id}>{department.name} · {department.code}</option>)}</select>{departments.isLoading && <small className="field-hint">Loading your departments…</small>}{departments.isError && <small className="field-error">Departments could not be loaded. Retry the page.</small>}{errors.departmentId && <small className="field-error">{errors.departmentId.message}</small>}</label>}{selectedRole === "DOCTOR" && <><label className="form-label">Display name<input placeholder="Doctor name" {...register("displayName")}/>{errors.displayName && <small className="field-error">{errors.displayName.message}</small>}</label><label className="form-label">Specialty <span className="optional-label">Optional</span><input placeholder="e.g. Ophthalmology" {...register("specialty")}/></label><label className="form-label">License number <span className="optional-label">Optional</span><input placeholder="Professional license" {...register("licenseNumber")}/></label></>}</div>
    <div className="invite-note"><span className="note-indicator"/>The invitation expires after 72 hours. The email status reflects the backend delivery result.</div>
    {errors.root?.message && <div className="form-result" role="status">{errors.root.message}</div>}
    <div className="invite-actions"><button type="submit" className="button button-primary" disabled={isSubmitting || departments.isLoading}>{isSubmitting ? "Creating invitation…" : "Create invitation"}<span>→</span></button></div>
  </form>;
}
