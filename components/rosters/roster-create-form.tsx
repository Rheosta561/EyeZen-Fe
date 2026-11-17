"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { hasPermission } from "@/lib/auth/permissions";

type Department = { id: string; name: string; code: string };

const ROSTER_NAME_MAX_LENGTH = 120;

export function RosterCreateForm({ departments, departmentId }: { departments: Department[]; departmentId: string }) {
  const current = useCurrentUser();
  const canWriteRosters = hasPermission(current.data?.role, "rosters:write");
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "" });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Enter a roster name.");
      if (form.name.trim().length > ROSTER_NAME_MAX_LENGTH) throw new Error("Roster name is too long (max 120 characters).");
      if (!departmentId) throw new Error("Choose a department.");
      const response = await apiFetch(`/api/departments/${encodeURIComponent(departmentId)}/rosters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim() }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
        throw new Error(body.message ?? body.error ?? "Roster could not be created. Confirm your department access.");
      }
      return response.json();
    },
    onSuccess: async () => {
      toast.success("Roster created");
      setForm({ name: "" });
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["workspace", "rosters"] });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Roster could not be created.";
      setError(message);
      toast.error(message);
    },
  });

  if (current.isPending) {
    return <div className="session-panel"><span className="session-symbol">…</span><div><b>Verifying session</b><p>Your session is verified before roster controls appear.</p></div></div>;
  }
  if (!canWriteRosters) {
    return <div className="session-panel"><span className="session-symbol">i</span><div><b>Roster creation is restricted</b><p>Only roles with roster write permission can create rosters (Super Admin, Hospital Admin, Roster Manager, Department Head). The backend enforces this.</p></div></div>;
  }

  return (
    <section className="roster-create-card">
      <div><b>Create a new roster draft</b><span>Enter a name. The roster starts as a draft; add weekly templates, generate assignments, then publish.</span></div>
      {error && <div className="form-result" role="status">{error}</div>}
      <form className="roster-form" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
        <label className="form-label">Roster name<input required maxLength={ROSTER_NAME_MAX_LENGTH} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/>{error && <small className="field-error">{error}</small>}</label>
        <div className="invite-actions"><button className="button button-primary" disabled={create.isPending || !departmentId}>{create.isPending ? "Creating…" : "Create roster"}</button>{departmentId ? <span className="field-hint">Department: {departments.find((d) => d.id === departmentId)?.name}</span> : null}</div>
      </form>
    </section>
  );
}
