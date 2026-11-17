"use client";

import { useId, useMemo, useState } from "react";
import type { DoctorAvailability, DoctorAvailabilityStatus, TimetableDoctor } from "@/lib/api/timetable";

type DoctorPickerProps = {
  doctors: TimetableDoctor[];
  availability: DoctorAvailability[];
  value: string;
  onChange: (doctorId: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  timeZone: string;
};

const CODE_LABELS: Record<string, string> = {
  DOCTOR_DOUBLE_BOOKED: "Already scheduled at this time",
  DOCTOR_UNAVAILABLE: "Marked unavailable for this request",
  APPROVED_LEAVE: "Approved leave",
  OUTSIDE_WORKING_HOURS: "Outside weekly hours",
  ROOM_DOUBLE_BOOKED: "Room already booked",
  DOCTOR_NOT_IN_DEPARTMENT: "Not assigned to this department",
  ROOM_NOT_FOUND: "Room unavailable",
  ROOM_INACTIVE: "Room inactive",
  ROOM_NOT_IN_DEPARTMENT: "Room in another department",
};

const STATUS_META: Record<DoctorAvailabilityStatus, { label: string; badge: string; dot: string }> = {
  AVAILABLE: { label: "Available", badge: "border-[var(--success)] bg-[var(--success-bg)] text-[var(--success)]", dot: "bg-[var(--success)]" },
  OUTSIDE_HOURS: { label: "Outside hours", badge: "border-[var(--warning)] bg-[var(--warning-bg)] text-[var(--warning)]", dot: "bg-[var(--warning)]" },
  UNAVAILABLE: { label: "Unavailable", badge: "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)]", dot: "bg-[var(--danger)]" },
};

export function doctorConflictLabel(code: string, message: string): string {
  return CODE_LABELS[code] ?? message;
}

function reasonFor(item: DoctorAvailability): string {
  const labels = item.conflicts.map((conflict) => doctorConflictLabel(conflict.code, conflict.message));
  return [...new Set(labels)].join(" · ");
}

export function DoctorPicker({ doctors, availability, value, onChange, invalid = false, disabled = false, loading = false, error, timeZone }: DoctorPickerProps) {
  const listId = useId();
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const availabilityById = useMemo(() => new Map(availability.map((item) => [item.id, item])), [availability]);
  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    return doctors
      .map((doctor) => {
        const status = availabilityById.get(doctor.id) ?? { id: doctor.id, displayName: doctor.displayName, specialty: doctor.specialty, status: "UNAVAILABLE" as const, conflicts: [] };
        return { ...doctor, ...status, displayName: doctor.displayName || status.displayName };
      })
      .filter((doctor) => !term || doctor.displayName.toLowerCase().includes(term) || (doctor.specialty ?? "").toLowerCase().includes(term))
      .filter((doctor) => showAll || term || doctor.id === value || doctor.status === "AVAILABLE")
      .sort((a, b) => {
        const rank = { AVAILABLE: 0, OUTSIDE_HOURS: 1, UNAVAILABLE: 2 } as const;
        return rank[a.status] - rank[b.status] || a.displayName.localeCompare(b.displayName);
      });
  }, [availabilityById, doctors, search, showAll, value]);

  const availableCount = doctors.filter((doctor) => availabilityById.get(doctor.id)?.status === "AVAILABLE").length;

  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-[var(--muted)]">Doctor</span>
        <span className="text-[11px] text-[var(--muted)]">{loading ? "Checking…" : `${availableCount} available`}</span>
      </div>
      <div className="relative">
        <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">⌕</span>
        <input
          type="search"
          role="combobox"
          aria-label="Search doctors"
          aria-expanded="true"
          aria-controls={listId}
          aria-invalid={invalid || undefined}
          value={search}
          disabled={disabled}
          placeholder="Search by name or specialty"
          className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-9 pr-3 text-[14px] text-[var(--foreground)] transition-colors duration-200 placeholder:text-[var(--muted)] focus:border-[var(--ring)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={showAll}
        className="justify-self-start rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => setShowAll((currentShowAll) => !currentShowAll)}
      >{showAll ? "Showing all doctors" : "Available only"}</button>
      <div id={listId} role="listbox" aria-label="Doctors" className="max-h-56 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-sm">
        {loading ? <div className="px-2.5 py-3 text-[12px] text-[var(--muted)]">Checking doctor availability in {timeZone}…</div> : null}
        {!loading && !items.length ? <div className="px-2.5 py-3 text-[12px] text-[var(--muted)]">No doctors match this search.</div> : null}
        {items.map((doctor) => {
          const meta = STATUS_META[doctor.status];
          const reason = reasonFor(doctor);
          const selected = doctor.id === value;
          return (
            <button
              type="button"
              role="option"
              aria-selected={selected}
              aria-disabled={doctor.status === "UNAVAILABLE"}
              disabled={disabled || doctor.status === "UNAVAILABLE"}
              key={doctor.id}
              className={`mb-1 grid w-full gap-1 rounded-lg border p-2.5 text-left transition-all duration-200 ease-out last:mb-0 ${selected ? "border-[var(--primary)] bg-[var(--surface-muted)]" : "border-transparent bg-transparent hover:border-[var(--border)] hover:bg-[var(--surface-muted)]"} disabled:cursor-not-allowed disabled:opacity-60`}
              onClick={() => onChange(doctor.id)}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className={`h-2 w-2 flex-none rounded-full ${meta.dot}`} />
                <b className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--foreground)]">{doctor.displayName}</b>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.badge}`}>{meta.label}</span>
                {selected ? <span aria-hidden="true" className="text-[13px] text-[var(--primary)]">✓</span> : null}
              </span>
              {doctor.specialty ? <span className="pl-4 text-[11px] text-[var(--muted)]">{doctor.specialty}</span> : null}
              {reason ? <span className="pl-4 text-[11px] leading-relaxed text-[var(--muted)]">{reason}</span> : null}
            </button>
          );
        })}
      </div>
      {error ? <span className="text-[11px] font-semibold text-[var(--danger)]">{error}</span> : null}
    </div>
  );
}
