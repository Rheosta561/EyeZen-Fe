"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  cancelOccurrence,
  createOccurrence,
  fetchActivity,
  fetchDoctorAvailability,
  fetchOccurrences,
  fetchRooms,
  fetchTimetableDoctors,
  patchOccurrence,
  TimetableApiError,
  updateRosterRule,
  type CreateOccurrenceInput,
  type DoctorAvailability,
  type OccurrenceConflict,
  type Room,
  type RosterOccurrence,
  type TimetableDoctor,
  type UpdateRosterRuleInput,
} from "@/lib/api/timetable";
import { DoctorPicker, doctorConflictLabel } from "@/components/rosters/doctor-picker";
import { hasPermission } from "@/lib/auth/permissions";
import { useCurrentUser } from "@/lib/auth/use-current-user";

type Department = { id: string; name: string; code: string };
type Scope = "THIS_DATE" | "THIS_AND_FUTURE";
type View = "week" | "day";
type FieldErrors = Record<string, string>;
type ZonedParts = { year: string; month: string; day: string; hour: string; minute: string };
type ZonedClock = { date: string; minute: number };
type ActivityEvent = { id: string; createdAt: string; action: string; metadata: Record<string, unknown> };
type PatchInput = { scope: Scope; doctorId: string; roomId: string; startMinute: number; endMinute: number; reason: string };
type CancelInput = { scope: Scope; reason: string };
type MutationResult = { occurrence: RosterOccurrence; generation: { created: number; updated: number; conflicts: OccurrenceConflict[] } };
type SaveVariables =
  | { kind: "create"; input: CreateOccurrenceInput }
  | { kind: "edit"; occurrenceId: string; input: PatchInput }
  | { kind: "cancel"; occurrenceId: string; input: CancelInput };
type PanelState =
  | { kind: "none" }
  | { kind: "choose"; occurrenceId: string }
  | { kind: "create"; date: string; startMinute: number; endMinute: number; doctorId: string; roomId: string; repeatUntilDate: string }
  | { kind: "edit"; occurrenceId: string; startMinute: number; endMinute: number; doctorId: string; roomId: string; scope: Scope; reason: string }
  | { kind: "cancel"; occurrenceId: string; scope: Scope; reason: string }
  | { kind: "detail"; occurrenceId: string }
  | { kind: "rule"; ruleId: string; weekday: number; startMinute: number; endMinute: number; effectiveFrom: string; effectiveUntil: string };

const START_HOUR = 6;
const END_HOUR = 22;
const SLOT_MINUTES = 30;
const START_MINUTE = START_HOUR * 60;
const END_MINUTE = END_HOUR * 60;
const SLOT_COUNT = ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES;
const SLOT_HEIGHT_PX = 28;
const SLOT_PITCH_PX = SLOT_HEIGHT_PX + 1;
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NO_DOCTORS: TimetableDoctor[] = [];
const NO_ROOMS: Room[] = [];
const NO_OCCURRENCES: RosterOccurrence[] = [];
const NO_AVAILABILITY: DoctorAvailability[] = [];

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function minuteLabel(value: number): string {
  const safe = Math.max(0, Math.min(1439, Math.floor(value)));
  return `${pad2(Math.floor(safe / 60))}:${pad2(safe % 60)}`;
}

function parseTimeInput(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCFullYear(year);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function formatLocalDate(date: Date): string {
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function browserToday(): string {
  const now = new Date();
  return `${String(now.getFullYear()).padStart(4, "0")}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function addDays(value: string, amount: number): string {
  const date = parseLocalDate(value);
  if (!date) return value;
  date.setUTCDate(date.getUTCDate() + amount);
  return formatLocalDate(date);
}

function mondayOf(value: string): string {
  const date = parseLocalDate(value);
  if (!date) return value;
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return formatLocalDate(date);
}

function isPastDate(value: string, today: string): boolean {
  const date = parseLocalDate(value);
  return date !== null && formatLocalDate(date) < today;
}

function dateMeta(value: string): { weekday: string; month: string; day: number; year: number } {
  const date = parseLocalDate(value);
  if (!date) return { weekday: "—", month: "—", day: 0, year: 0 };
  return {
    weekday: WEEKDAY_SHORT[date.getUTCDay()] ?? "—",
    month: MONTH_SHORT[date.getUTCMonth()] ?? "—",
    day: date.getUTCDate(),
    year: date.getUTCFullYear(),
  };
}

function readableDate(value: string): string {
  const meta = dateMeta(value);
  return `${meta.weekday} ${meta.month} ${meta.day}, ${meta.year}`;
}

function rangeLabel(from: string, through: string): string {
  const start = dateMeta(from);
  const end = dateMeta(through);
  if (from === through) return `${start.month} ${start.day}, ${start.year}`;
  if (start.year === end.year && start.month === end.month) return `${start.month} ${start.day}–${end.day}, ${end.year}`;
  if (start.year === end.year) return `${start.month} ${start.day} – ${end.month} ${end.day}, ${end.year}`;
  return `${start.month} ${start.day}, ${start.year} – ${end.month} ${end.day}, ${end.year}`;
}

function buildRange(view: View, anchor: string): { from: string; through: string; dates: string[] } {
  const validAnchor = parseLocalDate(anchor) ? anchor : browserToday();
  if (view === "day") return { from: validAnchor, through: validAnchor, dates: [validAnchor] };
  const from = mondayOf(validAnchor);
  return {
    from,
    through: addDays(from, 6),
    dates: Array.from({ length: 7 }, (_, index) => addDays(from, index)),
  };
}

function zonedPartsFromDate(value: Date, timeZone: string): ZonedParts {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(value);
    const map = new Map<string, string>();
    for (const part of parts) {
      if (part.type !== "literal") map.set(part.type, part.value);
    }
    return {
      year: map.get("year") ?? "",
      month: map.get("month") ?? "",
      day: map.get("day") ?? "",
      hour: map.get("hour") ?? "",
      minute: map.get("minute") ?? "",
    };
  } catch {
    return {
      year: String(value.getUTCFullYear()).padStart(4, "0"),
      month: pad2(value.getUTCMonth() + 1),
      day: pad2(value.getUTCDate()),
      hour: pad2(value.getUTCHours()),
      minute: pad2(value.getUTCMinutes()),
    };
  }
}

function zonedDateTime(value: string, timeZone: string): ZonedClock | null {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  const parts = zonedPartsFromDate(date, timeZone);
  if (!parts.year || !parts.month || !parts.day || !parts.hour || !parts.minute) return null;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function occurrenceMinute(value: string, timeZone: string): number | null {
  return zonedDateTime(value, timeZone)?.minute ?? null;
}

function currentZonedClock(timeZone: string): ZonedClock {
  const parts = zonedPartsFromDate(new Date(), timeZone);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function occurrenceIsPast(occurrence: RosterOccurrence, timeZone: string, clock: ZonedClock): boolean {
  const end = zonedDateTime(occurrence.endsAt, timeZone);
  if (!end) return occurrence.occurrenceDate < clock.date;
  if (end.date < clock.date) return true;
  if (end.date > clock.date) return false;
  return end.minute <= clock.minute;
}

function occurrenceStartsFuture(occurrence: RosterOccurrence, timeZone: string, clock: ZonedClock): boolean {
  const start = zonedDateTime(occurrence.startsAt, timeZone);
  if (!start) return false;
  if (start.date > clock.date) return true;
  if (start.date < clock.date) return false;
  return start.minute > clock.minute;
}

function formatActivityTime(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(date);
  } catch {
    return value;
  }
}

function statusText(status: RosterOccurrence["status"]): string {
  if (status === "CANCELLED") return "Cancelled";
  if (status === "SUPERSEDED") return "Superseded";
  return "Scheduled";
}

function conflictSummary(conflicts: OccurrenceConflict[]): string {
  if (!conflicts.length) return "";
  return conflicts.map((conflict) => conflict.code.replaceAll("_", " ")).join(", ");
}

function doctorLabel(occurrence: RosterOccurrence, doctorsById: Map<string, TimetableDoctor>): string {
  return occurrence.doctor?.displayName || doctorsById.get(occurrence.doctorId)?.displayName || `Doctor ${occurrence.doctorId.slice(0, 8)}`;
}

function roomDescription(occurrence: RosterOccurrence, roomsById: Map<string, Room>): string {
  const room = occurrence.room ?? roomsById.get(occurrence.roomId);
  if (!room) return `Room ${occurrence.roomId.slice(0, 8)}`;
  return [room.roomNumber, room.roomType, room.floor ? `Floor ${room.floor}` : ""].filter(Boolean).join(" · ");
}

function metadataValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value) ?? "";
    } catch {
      return "[unavailable]";
    }
  }
  return "";
}

function metadataSummary(metadata: Record<string, unknown>): string {
  const entries = Object.entries(metadata)
    .map(([key, value]) => ({ key, text: metadataValue(value) }))
    .filter((entry) => entry.text.length > 0);
  if (!entries.length) return "No additional details";
  return entries.slice(0, 4).map((entry) => `${entry.key}: ${entry.text}`).join(" · ");
}

function actionText(action: string): string {
  return action.replaceAll("_", " ").replaceAll("-", " ");
}

export function RosterWorkspace({ departments, departmentId, timeZone }: { departments: Department[]; departmentId: string; timeZone: string }) {
  const current = useCurrentUser();
  const queryClient = useQueryClient();
  const role = current.data?.role;
  const accessAllowed = Boolean(role && hasPermission(role, "rosters:read") && role !== "DOCTOR");
  const canWrite = hasPermission(role, "rosters:write");

  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(browserToday);
  const [doctorFilter, setDoctorFilter] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [panel, setPanel] = useState<PanelState>({ kind: "none" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverConflicts, setServerConflicts] = useState<OccurrenceConflict[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (panel.kind === "none") return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPanel({ kind: "none" });
        setErrors({});
        setServerConflicts([]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [panel.kind]);

  const range = useMemo(() => buildRange(view, anchor), [view, anchor]);
  const gridStyle = {
    "--tt-days": range.dates.length,
    "--tt-start-hour": START_HOUR,
    "--tt-hours": END_HOUR - START_HOUR,
    "--tt-slot-minutes": SLOT_MINUTES,
  } as CSSProperties;

  const doctorsQuery = useQuery({
    queryKey: ["timetable", "doctors", departmentId],
    enabled: accessAllowed && Boolean(departmentId),
    queryFn: () => fetchTimetableDoctors(departmentId),
  });
  const roomsQuery = useQuery({
    queryKey: ["timetable", "rooms", departmentId],
    enabled: accessAllowed && Boolean(departmentId),
    queryFn: () => fetchRooms(departmentId),
  });
  const occurrencesQuery = useQuery({
    queryKey: ["timetable", "occurrences", departmentId, range.from, range.through, doctorFilter, roomFilter],
    enabled: accessAllowed && Boolean(departmentId),
    queryFn: () => fetchOccurrences({
      departmentId,
      from: range.from,
      through: range.through,
      doctorId: doctorFilter || undefined,
      roomId: roomFilter || undefined,
    }),
  });
  const activityQuery = useQuery({
    queryKey: ["timetable", "activity", departmentId],
    enabled: accessAllowed && Boolean(departmentId),
    queryFn: () => fetchActivity(departmentId),
  });

  const doctors = doctorsQuery.data ?? NO_DOCTORS;
  const rooms = roomsQuery.data ?? NO_ROOMS;
  const doctorsById = useMemo(() => new Map(doctors.map((doctor) => [doctor.id, doctor])), [doctors]);
  const roomsById = useMemo(() => new Map(rooms.map((room) => [room.id, room])), [rooms]);
  const occurrences = useMemo(() => {
    const allowed = new Set(range.dates);
    return (occurrencesQuery.data ?? NO_OCCURRENCES)
      .filter((occurrence) => allowed.has(occurrence.occurrenceDate))
      .slice()
      .sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate) || a.startsAt.localeCompare(b.startsAt));
  }, [occurrencesQuery.data, range.dates]);
  const eventsByDate = useMemo(() => {
    const map = new Map<string, RosterOccurrence[]>();
    for (const date of range.dates) map.set(date, []);
    for (const occurrence of occurrences) {
      const bucket = map.get(occurrence.occurrenceDate);
      if (bucket) bucket.push(occurrence);
    }
    return map;
  }, [occurrences, range.dates]);
  const activity = useMemo(() => {
    return (activityQuery.data ?? [])
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 12);
  }, [activityQuery.data]);

  const selectedDepartment = departments.find((department) => department.id === departmentId);
  const clock = currentZonedClock(timeZone);
  const today = browserToday();
  const scheduledCount = occurrences.filter((occurrence) => occurrence.status === "SCHEDULED").length;
  const conflictCount = occurrences.reduce((total, occurrence) => total + (occurrence.conflicts?.length ?? 0), 0);
  const blockingCount = occurrences.reduce(
    (total, occurrence) => total + (occurrence.conflicts ?? []).filter((conflict) => conflict.level === "BLOCKING").length,
    0,
  );
  const failedQueries = [doctorsQuery, roomsQuery, occurrencesQuery, activityQuery].filter((query) => query.isError);

  const panelOccurrence = panel.kind === "choose" || panel.kind === "edit" || panel.kind === "cancel" || panel.kind === "detail"
    ? occurrences.find((occurrence) => occurrence.id === panel.occurrenceId) ?? null
    : null;
  const editorDraft = panel.kind === "create"
    ? { date: panel.date, startMinute: panel.startMinute, endMinute: panel.endMinute, roomId: panel.roomId, excludeOccurrenceId: undefined }
    : panel.kind === "edit" && panelOccurrence
      ? { date: panelOccurrence.occurrenceDate, startMinute: panel.startMinute, endMinute: panel.endMinute, roomId: panel.roomId, excludeOccurrenceId: panel.occurrenceId }
      : null;
  const availabilityQuery = useQuery({
    queryKey: ["timetable", "doctor-availability", departmentId, editorDraft?.date, editorDraft?.startMinute, editorDraft?.endMinute, editorDraft?.roomId, editorDraft?.excludeOccurrenceId],
    enabled: Boolean(accessAllowed && canWrite && departmentId && editorDraft),
    staleTime: 15_000,
    queryFn: () => {
      if (!editorDraft) throw new Error("No duty window selected.");
      return fetchDoctorAvailability({
        departmentId,
        occurrenceDate: editorDraft.date,
        startMinute: editorDraft.startMinute,
        endMinute: editorDraft.endMinute,
        roomId: editorDraft.roomId || undefined,
        excludeOccurrenceId: editorDraft.excludeOccurrenceId,
      });
    },
  });
  const doctorAvailability = availabilityQuery.data ?? NO_AVAILABILITY;
  const doctorAvailabilityById = useMemo(() => new Map(doctorAvailability.map((item) => [item.id, item])), [doctorAvailability]);

  const invalidateTimetable = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["timetable", "occurrences"] }),
      queryClient.invalidateQueries({ queryKey: ["timetable", "activity"] }),
    ]);
  };

  const mutation = useMutation({
    mutationFn: async (variables: SaveVariables): Promise<MutationResult> => {
      if (!departmentId) throw new TimetableApiError("Select a department before saving.", 400, "DEPARTMENT_ID_REQUIRED");
      if (variables.kind === "create") return createOccurrence(departmentId, variables.input);
      if (variables.kind === "edit") return patchOccurrence(departmentId, variables.occurrenceId, variables.input);
      return cancelOccurrence(departmentId, variables.occurrenceId, variables.input);
    },
    onMutate: () => {
      setErrors({});
      setServerConflicts([]);
    },
    onSuccess: async (result) => {
      const warnings = result.generation.conflicts.length;
      toast.success(warnings ? `Saved with ${warnings} conflict warning${warnings === 1 ? "" : "s"}.` : "Timetable updated");
      setPanel({ kind: "none" });
      await invalidateTimetable();
    },
    onError: (error) => {
      if (error instanceof TimetableApiError) setServerConflicts(error.conflicts);
      toast.error(error instanceof Error ? error.message : "The timetable change could not be saved.");
    },
  });

  const ruleMutation = useMutation({
    mutationFn: async (variables: { ruleId: string; input: UpdateRosterRuleInput }) => {
      if (!departmentId) throw new TimetableApiError("Select a department before saving.", 400, "DEPARTMENT_ID_REQUIRED");
      return updateRosterRule(departmentId, variables.ruleId, variables.input);
    },
    onSuccess: async (result) => {
      const warnings = result.generation.conflicts.length;
      toast.success(warnings ? `Weekly rule saved with ${warnings} warning${warnings === 1 ? "" : "s"}.` : "Weekly rule updated");
      setPanel({ kind: "none" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["timetable", "occurrences"] }),
        queryClient.invalidateQueries({ queryKey: ["timetable", "rules"] }),
        queryClient.invalidateQueries({ queryKey: ["timetable", "activity"] }),
      ]);
    },
    onError: (error) => {
      if (error instanceof TimetableApiError) setServerConflicts(error.conflicts);
      toast.error(error instanceof Error ? error.message : "The weekly rule could not be saved.");
    },
  });

  function retryQueries() {
    void Promise.all([
      doctorsQuery.refetch(),
      roomsQuery.refetch(),
      occurrencesQuery.refetch(),
      activityQuery.refetch(),
    ]);
  }

  function navigate(amount: number) {
    const step = view === "week" ? amount * 7 : amount;
    setAnchor((value) => addDays(parseLocalDate(value) ? value : today, step));
  }

  function openSlot(date: string, startMinute: number) {
    if (!canWrite) return;
    setErrors({});
    setServerConflicts([]);
    setPanel({
      kind: "create",
      date,
      startMinute,
      endMinute: Math.min(END_MINUTE, startMinute + SLOT_MINUTES),
      doctorId: doctorFilter,
      roomId: roomFilter,
      repeatUntilDate: "",
    });
  }

  function occurrenceAt(date: string, minute: number): RosterOccurrence | undefined {
    return (eventsByDate.get(date) ?? []).find((occurrence) => {
      const start = occurrenceMinute(occurrence.startsAt, timeZone) ?? START_MINUTE;
      const rawEnd = occurrenceMinute(occurrence.endsAt, timeZone) ?? start + SLOT_MINUTES;
      const end = rawEnd > start ? rawEnd : END_MINUTE;
      return start <= minute && minute < end;
    });
  }

  function handleCellClick(date: string, slotStart: number) {
    const occurrence = occurrenceAt(date, slotStart);
    if (occurrence) {
      openOccurrence(occurrence);
      return;
    }
    if (!canWrite || isPastDate(date, today)) return;
    openSlot(date, slotStart);
  }

  function canEditOccurrence(occurrence: RosterOccurrence): boolean {
    return canWrite
      && !occurrenceIsPast(occurrence, timeZone, clock)
      && occurrenceStartsFuture(occurrence, timeZone, clock)
      && occurrence.status === "SCHEDULED";
  }

  function openOccurrence(occurrence: RosterOccurrence) {
    setErrors({});
    setServerConflicts([]);
    setPanel({ kind: "choose", occurrenceId: occurrence.id });
  }

  function openEdit(occurrence: RosterOccurrence) {
    if (!canEditOccurrence(occurrence)) return;
    setErrors({});
    setServerConflicts([]);
    const startMinute = occurrenceMinute(occurrence.startsAt, timeZone) ?? START_MINUTE;
    const derivedEnd = occurrenceMinute(occurrence.endsAt, timeZone) ?? startMinute + SLOT_MINUTES;
    setPanel({
      kind: "edit",
      occurrenceId: occurrence.id,
      startMinute,
      endMinute: derivedEnd > startMinute ? derivedEnd : END_MINUTE,
      doctorId: occurrence.doctorId,
      roomId: occurrence.roomId,
      scope: "THIS_DATE",
      reason: "",
    });
  }

  function closePanel() {
    setPanel({ kind: "none" });
    setErrors({});
    setServerConflicts([]);
  }

  function setFieldError(key: string, message: string) {
    setErrors((currentErrors) => ({ ...currentErrors, [key]: message }));
  }

  function validateWritableDate(date: string): boolean {
    if (!parseLocalDate(date)) {
      setFieldError("date", "Choose a valid date.");
      return false;
    }
    if (isPastDate(date, clock.date)) {
      setFieldError("date", "Choose today or a future date.");
      return false;
    }
    return true;
  }

  function doctorAvailabilityError(doctorId: string): string | undefined {
    const item = doctorAvailabilityById.get(doctorId);
    if (!item || item.status !== "UNAVAILABLE") return undefined;
    const reasons = item.conflicts.map((conflict) => doctorConflictLabel(conflict.code, conflict.message));
    return reasons.length ? `Doctor unavailable: ${[...new Set(reasons)].join(" · ")}` : "Doctor is unavailable at this time.";
  }

  function submitCreate() {
    if (panel.kind !== "create" || !canWrite) return;
    const nextErrors: FieldErrors = {};
    if (!validateWritableDate(panel.date)) nextErrors.date = errors.date || "Choose a valid future date.";
    if (panel.endMinute <= panel.startMinute) nextErrors.end = "End time must be after start time.";
    if (!panel.doctorId) nextErrors.doctor = "Choose a doctor.";
    else {
      const unavailable = doctorAvailabilityError(panel.doctorId);
      if (unavailable) nextErrors.doctor = unavailable;
    }
    if (!panel.roomId) nextErrors.room = "Choose a room.";
    if (panel.repeatUntilDate) {
      if (!parseLocalDate(panel.repeatUntilDate) || isPastDate(panel.repeatUntilDate, clock.date)) nextErrors.repeatUntilDate = "Choose a valid future repeat date.";
      else if (panel.repeatUntilDate < panel.date) nextErrors.repeatUntilDate = "Repeat until cannot be before the duty date.";
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      toast.error("Check the duty details before saving.");
      return;
    }
    const input: CreateOccurrenceInput = {
      doctorId: panel.doctorId,
      roomId: panel.roomId,
      occurrenceDate: panel.date,
      startMinute: panel.startMinute,
      endMinute: panel.endMinute,
      ...(panel.repeatUntilDate ? { repeatUntilDate: panel.repeatUntilDate } : {}),
    };
    mutation.mutate({ kind: "create", input });
  }

  function submitEdit() {
    if (panel.kind !== "edit" || !panelOccurrence || !canWrite) return;
    const nextErrors: FieldErrors = {};
    if (occurrenceIsPast(panelOccurrence, timeZone, clock)) nextErrors.date = "Past duties cannot be changed.";
    if (panel.endMinute <= panel.startMinute) nextErrors.end = "End time must be after start time.";
    if (!panel.doctorId) nextErrors.doctor = "Choose a doctor.";
    else {
      const unavailable = doctorAvailabilityError(panel.doctorId);
      if (unavailable) nextErrors.doctor = unavailable;
    }
    if (!panel.roomId) nextErrors.room = "Choose a room.";
    if (panel.reason.trim().length < 3) nextErrors.reason = "Give a reason with at least 3 characters.";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      toast.error("Check the duty changes before saving.");
      return;
    }
    const input: PatchInput = {
      scope: panel.scope,
      doctorId: panel.doctorId,
      roomId: panel.roomId,
      startMinute: panel.startMinute,
      endMinute: panel.endMinute,
      reason: panel.reason.trim(),
    };
    mutation.mutate({ kind: "edit", occurrenceId: panelOccurrence.id, input });
  }

  function submitCancel() {
    if (panel.kind !== "cancel" || !panelOccurrence || !canWrite) return;
    const nextErrors: FieldErrors = {};
    if (occurrenceIsPast(panelOccurrence, timeZone, clock)) nextErrors.date = "Past duties cannot be cancelled.";
    if (panel.reason.trim().length < 3) nextErrors.reason = "Give a reason with at least 3 characters.";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      toast.error("A reason is required to cancel a duty.");
      return;
    }
    const input: CancelInput = { scope: panel.scope, reason: panel.reason.trim() };
    mutation.mutate({ kind: "cancel", occurrenceId: panelOccurrence.id, input });
  }

  function submitRule() {
    if (panel.kind !== "rule" || !canWrite) return;
    const nextErrors: FieldErrors = {};
    if (panel.weekday < 1 || panel.weekday > 7) nextErrors.weekday = "Choose a weekday.";
    if (panel.endMinute <= panel.startMinute) nextErrors.end = "End time must be after start time.";
    if (!parseLocalDate(panel.effectiveFrom)) nextErrors.effectiveFrom = "Choose a valid start date.";
    if (panel.effectiveUntil) {
      if (!parseLocalDate(panel.effectiveUntil)) nextErrors.effectiveUntil = "Choose a valid end date.";
      else if (panel.effectiveUntil < panel.effectiveFrom) nextErrors.effectiveUntil = "End date cannot be before start date.";
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      toast.error("Check the weekly rule before saving.");
      return;
    }
    const input: UpdateRosterRuleInput = {
      weekday: panel.weekday,
      startMinute: panel.startMinute,
      endMinute: panel.endMinute,
      effectiveFrom: panel.effectiveFrom,
      effectiveUntil: panel.effectiveUntil || null,
    };
    ruleMutation.mutate({ ruleId: panel.ruleId, input });
  }

  function renderConflicts(conflicts: OccurrenceConflict[]) {
    if (!conflicts.length) return null;
    return (
      <div className="timetable-conflicts" aria-live="polite">
        {conflicts.map((conflict, index) => (
          <div
            key={`${conflict.code}-${conflict.occurrenceId}-${index}`}
            className={`timetable-conflict ${conflict.level === "BLOCKING" ? "timetable-conflict--blocking" : conflict.level === "OVERRIDABLE_WARNING" ? "timetable-conflict--warning" : ""}`}
          >
            <span className="timetable-conflict-code">{conflict.code.replaceAll("_", " ")}</span>
            <span>{conflict.message}</span>
          </div>
        ))}
      </div>
    );
  }

  function renderEditorPanel() {
    if (panel.kind === "none") {
      return (
        <section className="timetable-editor" aria-label="Timetable editor">
          <div className="timetable-editor-head"><h2>No duty selected</h2><p>Choose an open time slot to schedule a duty, or select an existing duty to review it.</p></div>
          <p className="timetable-hint">{canWrite ? "All changes are saved directly to the department timetable." : "You have read-only access to this timetable."}</p>
        </section>
      );
    }

    if (panel.kind === "choose") {
      if (!panelOccurrence) {
        return (
          <section className="timetable-editor" aria-label="Duty unavailable">
            <div className="timetable-editor-head"><h2>Duty unavailable</h2><p>This duty is no longer in the current timetable range.</p></div>
            <div className="timetable-editor-actions"><button type="button" className="timetable-secondary" onClick={closePanel}>Close</button></div>
          </section>
        );
      }
      const start = occurrenceMinute(panelOccurrence.startsAt, timeZone) ?? START_MINUTE;
      const rawEnd = occurrenceMinute(panelOccurrence.endsAt, timeZone) ?? start + SLOT_MINUTES;
      const end = rawEnd > start ? rawEnd : END_MINUTE;
      const editable = canEditOccurrence(panelOccurrence);
      const conflicts = panelOccurrence.conflicts ?? [];
      const rule = panelOccurrence.roster;
      return (
        <section className="timetable-editor" aria-label="Scheduled duty options">
          <div className="timetable-editor-head"><h2>Scheduled duty</h2><p>Choose what you want to do with this timetable entry.</p></div>
          <div className="timetable-editor-form">
            <div className="grid gap-1 rounded-lg border border-dashed border-[var(--border)] bg-[var(--info-bg)] p-3 text-[12px] leading-relaxed text-[var(--info)]">
              <b className="text-[13px] font-semibold">{doctorLabel(panelOccurrence, doctorsById)} · {roomDescription(panelOccurrence, roomsById)}</b>
              <span>{readableDate(panelOccurrence.occurrenceDate)} · {minuteLabel(start)}–{minuteLabel(end)} · {timeZone}</span>
              <span>Status: {statusText(panelOccurrence.status)}{occurrenceIsPast(panelOccurrence, timeZone, clock) ? " · Past" : ""}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                className="group flex min-h-28 flex-col items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-left transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--primary)] hover:bg-[var(--surface)] hover:shadow-md active:translate-y-0"
                onClick={() => setPanel({ kind: "detail", occurrenceId: panelOccurrence.id })}
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--surface)] text-[18px] text-[var(--primary)]">↗</span>
                <b className="text-[14px] font-semibold">View details</b>
                <span className="text-[12px] leading-relaxed text-[var(--muted)]">Read the assignment, status, room, and any recorded conflicts.</span>
              </button>
              <button
                type="button"
                disabled={!editable}
                className="group flex min-h-28 flex-col items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-left transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--primary)] hover:bg-[var(--surface)] hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 disabled:hover:border-[var(--border)] disabled:hover:shadow-none"
                onClick={() => openEdit(panelOccurrence)}
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--surface)] text-[18px] text-[var(--primary)]">✎</span>
                <b className="text-[14px] font-semibold">Edit duty</b>
                <span className="text-[12px] leading-relaxed text-[var(--muted)]">{editable ? "Change time, doctor, room, scope, or reason." : "Editing is unavailable for past, cancelled, or read-only entries."}</span>
              </button>
            </div>
            {rule ? (
              <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                <div className="grid gap-1 text-[12px] leading-relaxed text-[var(--muted)]">
                  <b className="text-[13px] font-semibold text-[var(--foreground)]">Weekly recurrence</b>
                  <span>{WEEKDAY_LONG[rule.weekday % 7]} · {minuteLabel(rule.startMinute)}–{minuteLabel(rule.endMinute)} · {readableDate(rule.effectiveFrom)}{rule.effectiveUntil ? ` to ${readableDate(rule.effectiveUntil)}` : " · ongoing"}</span>
                  <span>{occurrenceIsPast(panelOccurrence, timeZone, clock) ? "Past dated duties stay unchanged. Editing the weekly rule updates future occurrences." : "This duty comes from a weekly rule. Editing it updates future occurrences."}</span>
                </div>
                <button
                  type="button"
                  disabled={!canWrite}
                  className="justify-self-start rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] font-semibold text-[var(--primary)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--primary)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => {
                    setErrors({});
                    setServerConflicts([]);
                    setPanel({
                      kind: "rule",
                      ruleId: rule.id,
                      weekday: rule.weekday,
                      startMinute: rule.startMinute,
                      endMinute: rule.endMinute,
                      effectiveFrom: rule.effectiveFrom,
                      effectiveUntil: rule.effectiveUntil ?? "",
                    });
                  }}
                >Edit weekly rule</button>
              </div>
            ) : null}
            {renderConflicts(conflicts)}
            <div className="timetable-editor-actions">
              <button type="button" className="timetable-secondary transition-transform duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0" onClick={closePanel}>Close</button>
            </div>
          </div>
        </section>
      );
    }

    if (panel.kind === "create") {
      return (
        <section className="timetable-editor" aria-label="Schedule a duty">
          <div className="timetable-editor-head"><h2>Schedule a duty</h2><p>Create a duty directly on the timetable.</p></div>
          <form className="timetable-editor-form" noValidate onSubmit={(event) => { event.preventDefault(); submitCreate(); }}>
            <div className="grid gap-1 rounded-lg border border-dashed border-[var(--border)] bg-[var(--info-bg)] p-3 text-[12px] leading-relaxed text-[var(--info)]">
              <b className="text-[13px] font-semibold">{readableDate(panel.date)} · {minuteLabel(panel.startMinute)}–{minuteLabel(panel.endMinute)}</b>
              <span>Times use {timeZone}. Choose a doctor and room, then save the duty.</span>
            </div>
            <div className="timetable-form-grid">
              <label className="timetable-field">Date
                <input type="date" value={panel.date} aria-invalid={Boolean(errors.date)} onChange={(event) => setPanel({ ...panel, date: event.target.value })} />
                {errors.date ? <span className="timetable-hint">{errors.date}</span> : null}
              </label>
              <label className="timetable-field">Start time
                <input type="time" value={minuteLabel(panel.startMinute)} onChange={(event) => setPanel({ ...panel, startMinute: parseTimeInput(event.target.value) ?? panel.startMinute })} />
              </label>
              <label className="timetable-field">End time
                <input type="time" value={minuteLabel(panel.endMinute)} aria-invalid={Boolean(errors.end)} onChange={(event) => setPanel({ ...panel, endMinute: parseTimeInput(event.target.value) ?? panel.endMinute })} />
                {errors.end ? <span className="timetable-hint">{errors.end}</span> : null}
              </label>
              <div className="min-w-0 [grid-column:1/-1]">
                <DoctorPicker
                  doctors={doctors}
                  availability={doctorAvailability}
                  value={panel.doctorId}
                  onChange={(doctorId) => setPanel({ ...panel, doctorId })}
                  invalid={Boolean(errors.doctor)}
                  disabled={!canWrite || mutation.isPending}
                  loading={availabilityQuery.isPending}
                  error={availabilityQuery.isError ? "Availability could not be checked. The backend will validate on save." : errors.doctor}
                  timeZone={timeZone}
                />
              </div>
              <label className="timetable-field">Room
                <select className="timetable-select" value={panel.roomId} aria-invalid={Boolean(errors.room)} onChange={(event) => setPanel({ ...panel, roomId: event.target.value })}>
                  <option value="">Choose a room</option>
                  {rooms.filter((room) => room.isActive).map((room) => <option key={room.id} value={room.id}>{room.roomNumber} · {room.roomType}{room.floor ? ` · Floor ${room.floor}` : ""}</option>)}
                </select>
                {errors.room ? <span className="timetable-hint">{errors.room}</span> : null}
              </label>
              <label className="timetable-field">Repeat until <span className="timetable-hint">Optional</span>
                <input type="date" value={panel.repeatUntilDate} aria-invalid={Boolean(errors.repeatUntilDate)} onChange={(event) => setPanel({ ...panel, repeatUntilDate: event.target.value })} />
                {errors.repeatUntilDate ? <span className="timetable-hint">{errors.repeatUntilDate}</span> : null}
              </label>
            </div>
            {renderConflicts(serverConflicts)}
            <div className="timetable-editor-actions">
              <button type="submit" className="timetable-primary transition-transform duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0" disabled={!canWrite || mutation.isPending || availabilityQuery.isPending}>{mutation.isPending ? "Saving…" : availabilityQuery.isPending ? "Checking…" : "Save duty"}</button>
              <button type="button" className="timetable-secondary transition-transform duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0" onClick={closePanel}>Cancel</button>
            </div>
            <p className="timetable-hint">Times are shown in {timeZone}. Repeated duties stop on the date you choose.</p>
          </form>
        </section>
      );
    }

    if (panel.kind === "rule") {
      return (
        <section className="timetable-editor" aria-label="Edit weekly rule">
          <div className="timetable-editor-head"><h2>Edit weekly rule</h2><p>Change the recurring pattern that generates future duties.</p></div>
          <form className="timetable-editor-form" noValidate onSubmit={(event) => { event.preventDefault(); submitRule(); }}>
            <div className="grid gap-1 rounded-lg border border-dashed border-[var(--border)] bg-[var(--info-bg)] p-3 text-[12px] leading-relaxed text-[var(--info)]">
              <b className="text-[13px] font-semibold">Weekly recurring roster</b>
              <span>Past dated occurrences stay unchanged. Changes apply to future generated duties from the effective date.</span>
            </div>
            <div className="timetable-form-grid">
              <label className="timetable-field">Weekday
                <select className="timetable-select" value={panel.weekday} aria-invalid={Boolean(errors.weekday)} disabled={!canWrite} onChange={(event) => setPanel({ ...panel, weekday: Number(event.target.value) })}>
                  {[1, 2, 3, 4, 5, 6, 7].map((value) => <option key={value} value={value}>{WEEKDAY_LONG[value % 7]}</option>)}
                </select>
                {errors.weekday ? <span className="timetable-hint">{errors.weekday}</span> : null}
              </label>
              <label className="timetable-field">Start time
                <input type="time" value={minuteLabel(panel.startMinute)} disabled={!canWrite} onChange={(event) => setPanel({ ...panel, startMinute: parseTimeInput(event.target.value) ?? panel.startMinute })} />
              </label>
              <label className="timetable-field">End time
                <input type="time" value={minuteLabel(panel.endMinute)} aria-invalid={Boolean(errors.end)} disabled={!canWrite} onChange={(event) => setPanel({ ...panel, endMinute: parseTimeInput(event.target.value) ?? panel.endMinute })} />
                {errors.end ? <span className="timetable-hint">{errors.end}</span> : null}
              </label>
              <label className="timetable-field">Effective from
                <input type="date" value={panel.effectiveFrom} aria-invalid={Boolean(errors.effectiveFrom)} disabled={!canWrite} onChange={(event) => setPanel({ ...panel, effectiveFrom: event.target.value })} />
                {errors.effectiveFrom ? <span className="timetable-hint">{errors.effectiveFrom}</span> : null}
              </label>
              <label className="timetable-field">Effective until <span className="timetable-hint">Optional</span>
                <input type="date" value={panel.effectiveUntil} aria-invalid={Boolean(errors.effectiveUntil)} disabled={!canWrite} onChange={(event) => setPanel({ ...panel, effectiveUntil: event.target.value })} />
                {errors.effectiveUntil ? <span className="timetable-hint">{errors.effectiveUntil}</span> : null}
              </label>
            </div>
            {renderConflicts(serverConflicts)}
            <div className="timetable-editor-actions">
              <button type="submit" className="timetable-primary transition-transform duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0" disabled={!canWrite || ruleMutation.isPending}>{ruleMutation.isPending ? "Saving…" : "Save weekly rule"}</button>
              <button type="button" className="timetable-secondary transition-transform duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0" onClick={closePanel}>Close</button>
            </div>
            <p className="timetable-hint">Times are shown in {timeZone}. Blocking conflicts stop the rule update.</p>
          </form>
        </section>
      );
    }

    if (!panelOccurrence) {
      return (
        <section className="timetable-editor" aria-label="Timetable editor">
          <div className="timetable-editor-head"><h2>Duty unavailable</h2><p>This duty is no longer in the current timetable range.</p></div>
          <div className="timetable-editor-actions"><button type="button" className="timetable-secondary" onClick={closePanel}>Close</button></div>
        </section>
      );
    }

    const displayStart = occurrenceMinute(panelOccurrence.startsAt, timeZone);
    const displayEnd = occurrenceMinute(panelOccurrence.endsAt, timeZone);
    const displayRange = `${displayStart === null ? "—" : minuteLabel(displayStart)}–${displayEnd === null ? "—" : minuteLabel(displayEnd)}`;
    const currentRoom = roomDescription(panelOccurrence, roomsById);
    const currentDoctor = doctorLabel(panelOccurrence, doctorsById);
    const currentConflicts = panelOccurrence.conflicts ?? [];

    if (panel.kind === "detail") {
      return (
        <section className="timetable-editor" aria-label="Duty details">
          <div className="timetable-editor-head"><h2>Duty details</h2><p>Read-only summary for this timetable entry.</p></div>
          <div className="timetable-readonly">
            <p><b>Date</b><span>{readableDate(panelOccurrence.occurrenceDate)}</span></p>
            <p><b>Time</b><span>{displayRange} · {timeZone}</span></p>
            <p><b>Doctor</b><span>{currentDoctor}</span></p>
            <p><b>Room</b><span>{currentRoom}</span></p>
            <p><b>Status</b><span>{statusText(panelOccurrence.status)}{occurrenceIsPast(panelOccurrence, timeZone, clock) ? " · Past" : ""}</span></p>
            {panelOccurrence.override?.reason ? <p><b>Reason</b><span>{panelOccurrence.override.reason}</span></p> : null}
          </div>
          {currentConflicts.length ? <p className="timetable-hint">Conflicts: {conflictSummary(currentConflicts)}</p> : null}
          {renderConflicts(currentConflicts)}
          <div className="timetable-editor-actions"><button type="button" className="timetable-secondary" onClick={closePanel}>Close</button></div>
        </section>
      );
    }

    if (panel.kind === "cancel") {
      return (
        <section className="timetable-editor" aria-label="Cancel duty">
          <div className="timetable-editor-head"><h2>Cancel duty</h2><p>{currentDoctor} · {currentRoom} · {readableDate(panelOccurrence.occurrenceDate)}</p></div>
          <form className="timetable-editor-form" noValidate onSubmit={(event) => { event.preventDefault(); submitCancel(); }}>
            <div className="timetable-form-grid">
              <label className="timetable-field">Scope
                <select className="timetable-select" value={panel.scope} onChange={(event) => setPanel({ ...panel, scope: event.target.value as Scope })}>
                  <option value="THIS_DATE">This date</option>
                  <option value="THIS_AND_FUTURE">This and future dates</option>
                </select>
              </label>
              <label className="timetable-field">Reason
                <textarea value={panel.reason} aria-invalid={Boolean(errors.reason)} onChange={(event) => setPanel({ ...panel, reason: event.target.value })} />
                {errors.reason ? <span className="timetable-hint">{errors.reason}</span> : null}
              </label>
            </div>
            {errors.date ? <p className="timetable-hint">{errors.date}</p> : null}
            {renderConflicts(serverConflicts)}
            <div className="timetable-editor-actions">
              <button type="submit" className="timetable-danger" disabled={!canWrite || mutation.isPending}>{mutation.isPending ? "Cancelling…" : "Confirm cancellation"}</button>
              <button type="button" className="timetable-secondary" onClick={() => {
                const start = occurrenceMinute(panelOccurrence.startsAt, timeZone) ?? START_MINUTE;
                const derivedEnd = occurrenceMinute(panelOccurrence.endsAt, timeZone) ?? start + SLOT_MINUTES;
                setErrors({});
                setServerConflicts([]);
                setPanel({ kind: "edit", occurrenceId: panelOccurrence.id, startMinute: start, endMinute: derivedEnd > start ? derivedEnd : END_MINUTE, doctorId: panelOccurrence.doctorId, roomId: panelOccurrence.roomId, scope: panel.scope, reason: panel.reason });
              }}>Back</button>
            </div>
          </form>
        </section>
      );
    }

    return (
      <section className="timetable-editor" aria-label="Edit duty">
        <div className="timetable-editor-head"><h2>Edit duty</h2><p>{currentDoctor} · {currentRoom}</p></div>
        <form className="timetable-editor-form" noValidate onSubmit={(event) => { event.preventDefault(); submitEdit(); }}>
          <div className="timetable-form-grid">
            <div className="timetable-field">Date<span className="timetable-readonly">{readableDate(panelOccurrence.occurrenceDate)}</span>{errors.date ? <span className="timetable-hint">{errors.date}</span> : null}</div>
            <label className="timetable-field">Start time
              <input type="time" value={minuteLabel(panel.startMinute)} onChange={(event) => setPanel({ ...panel, startMinute: parseTimeInput(event.target.value) ?? panel.startMinute })} />
            </label>
            <label className="timetable-field">End time
              <input type="time" value={minuteLabel(panel.endMinute)} aria-invalid={Boolean(errors.end)} onChange={(event) => setPanel({ ...panel, endMinute: parseTimeInput(event.target.value) ?? panel.endMinute })} />
              {errors.end ? <span className="timetable-hint">{errors.end}</span> : null}
            </label>
            <div className="min-w-0 [grid-column:1/-1]">
              <DoctorPicker
                doctors={doctors}
                availability={doctorAvailability}
                value={panel.doctorId}
                onChange={(doctorId) => setPanel({ ...panel, doctorId })}
                invalid={Boolean(errors.doctor)}
                disabled={!canWrite || mutation.isPending}
                loading={availabilityQuery.isPending}
                error={availabilityQuery.isError ? "Availability could not be checked. The backend will validate on save." : errors.doctor}
                timeZone={timeZone}
              />
            </div>
            <label className="timetable-field">Room
              <select className="timetable-select" value={panel.roomId} aria-invalid={Boolean(errors.room)} onChange={(event) => setPanel({ ...panel, roomId: event.target.value })}>
                {rooms.map((room) => <option key={room.id} value={room.id} disabled={!room.isActive && room.id !== panel.roomId}>{room.roomNumber} · {room.roomType}{room.isActive ? "" : " · Inactive"}</option>)}
              </select>
              {errors.room ? <span className="timetable-hint">{errors.room}</span> : null}
            </label>
            <label className="timetable-field">Scope
              <select className="timetable-select" value={panel.scope} onChange={(event) => setPanel({ ...panel, scope: event.target.value as Scope })}>
                <option value="THIS_DATE">This date</option>
                <option value="THIS_AND_FUTURE">This and future dates</option>
              </select>
            </label>
            <label className="timetable-field">Reason
              <textarea value={panel.reason} aria-invalid={Boolean(errors.reason)} onChange={(event) => setPanel({ ...panel, reason: event.target.value })} />
              {errors.reason ? <span className="timetable-hint">{errors.reason}</span> : null}
            </label>
          </div>
          {renderConflicts(serverConflicts.length ? serverConflicts : currentConflicts)}
          <div className="timetable-editor-actions">
            <button type="submit" className="timetable-primary" disabled={!canWrite || mutation.isPending || availabilityQuery.isPending}>{mutation.isPending ? "Saving…" : availabilityQuery.isPending ? "Checking…" : "Save changes"}</button>
            <button type="button" className="timetable-danger" disabled={!canWrite || mutation.isPending} onClick={() => { setErrors({}); setServerConflicts([]); setPanel({ kind: "cancel", occurrenceId: panelOccurrence.id, scope: panel.scope, reason: panel.reason }); }}>Cancel duty</button>
            <button type="button" className="timetable-secondary" onClick={closePanel}>Close</button>
          </div>
          <p className="timetable-hint">A reason of at least 3 characters is recorded for every change.</p>
        </form>
      </section>
    );
  }

  function renderEditor() {
    if (panel.kind === "none") {
      return <p className="timetable-editor-hint">{canWrite ? "Select an open slot to schedule a duty, or select an existing duty to review it." : "You have read-only access to this timetable."}</p>;
    }
    const dialogLabel = panel.kind === "choose" ? "Scheduled duty options" : panel.kind === "create" ? "Schedule a duty" : panel.kind === "edit" ? "Edit duty" : panel.kind === "cancel" ? "Cancel duty" : panel.kind === "rule" ? "Edit weekly rule" : "Duty details";
    return (
      <div className="timetable-modal-layer animate-[eyezen-overlay-in_160ms_ease-out_both]" onMouseDown={(event) => { if (event.target === event.currentTarget) closePanel(); }}>
        <div className="timetable-modal relative animate-[eyezen-dialog-in_220ms_ease-out_both]" role="dialog" aria-modal="true" aria-label={dialogLabel} tabIndex={-1} ref={dialogRef}>
          <button
            type="button"
            className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[18px] leading-none text-[var(--muted)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--primary)] hover:text-[var(--primary)] active:translate-y-0"
            aria-label="Close dialog"
            onClick={closePanel}
          >×</button>
          {renderEditorPanel()}
        </div>
      </div>
    );
  }

  return (
    <div className="timetable-workspace">
      {current.isPending ? <div className="timetable-state">Checking roster access…</div> : null}
      {current.isError ? (
        <div className="timetable-state timetable-state--error">
          <span>Your workspace could not be verified.</span>
          <button type="button" onClick={() => void current.refetch()}>Retry</button>
        </div>
      ) : null}
      {!current.isPending && !current.isError && !accessAllowed ? (
        <div className="timetable-state">This timetable is managed by roster staff. Doctors should use My schedule to review their own duties.</div>
      ) : null}
      {!current.isPending && !current.isError && accessAllowed && !departmentId ? (
        <div className="timetable-state">Select a department to open its timetable.</div>
      ) : null}
      {!current.isPending && !current.isError && accessAllowed && departmentId ? (
        <>
          <section className="timetable-overview" aria-label="Timetable overview">
            <div className="timetable-overview-copy">
              <span className="timetable-overline">Department timetable</span>
              <h2>{selectedDepartment?.name ?? "Department"}{selectedDepartment?.code ? ` · ${selectedDepartment.code}` : ""}</h2>
              <p>Schedule and adjust duties directly on the calendar. Every change is saved immediately.</p>
            </div>
            <div className="timetable-metric"><b>{scheduledCount}</b><span>Scheduled</span></div>
            <div className="timetable-metric"><b>{conflictCount}</b><span>Conflicts</span></div>
            <div className="timetable-metric"><b>{blockingCount}</b><span>Blocking</span></div>
            <div className="timetable-metric"><b>{rooms.length}</b><span>Rooms</span></div>
          </section>

          <div className="timetable-toolbar">
            <div className="timetable-toolbar-group timetable-nav">
              <button type="button" onClick={() => navigate(-1)} aria-label={`Previous ${view}`}>Previous</button>
              <button type="button" onClick={() => setAnchor(browserToday())}>Today</button>
              <button type="button" onClick={() => navigate(1)} aria-label={`Next ${view}`}>Next</button>
            </div>
            <div className="timetable-toolbar-group timetable-segmented" aria-label="Calendar view">
              <button type="button" className={view === "day" ? "is-active" : ""} aria-pressed={view === "day"} onClick={() => setView("day")}>Day</button>
              <button type="button" className={view === "week" ? "is-active" : ""} aria-pressed={view === "week"} onClick={() => setView("week")}>Week</button>
            </div>
            <div className="timetable-toolbar-group">
              <label className="timetable-field">Doctor
                <select className="timetable-select" value={doctorFilter} onChange={(event) => setDoctorFilter(event.target.value)}>
                  <option value="">All doctors</option>
                  {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.displayName}</option>)}
                </select>
              </label>
              <label className="timetable-field">Room
                <select className="timetable-select" value={roomFilter} onChange={(event) => setRoomFilter(event.target.value)}>
                  <option value="">All rooms</option>
                  {rooms.map((room) => <option key={room.id} value={room.id}>{room.roomNumber} · {room.roomType}</option>)}
                </select>
              </label>
            </div>
          </div>

          {failedQueries.length ? (
            <div className="timetable-state timetable-state--error">
              <span>Some timetable data could not be loaded. Retry to refresh the calendar, rooms, and history.</span>
              <button type="button" onClick={retryQueries}>Retry</button>
            </div>
          ) : null}

          <section className="timetable-board-card" aria-label="Calendar">
            <div className="timetable-board-head">
              <div>
                <h2>{view === "week" ? "Week calendar" : "Day calendar"}</h2>
                <p>{canWrite ? "Select an open slot to schedule a duty." : "Read-only view."}</p>
              </div>
              <div className="timetable-board-meta">
                <span>{rangeLabel(range.from, range.through)}</span>
                <span>06:00–22:00 · {timeZone}</span>
              </div>
            </div>

            {occurrencesQuery.isPending ? <div className="timetable-state">Loading timetable…</div> : null}
            {occurrencesQuery.isError ? (
              <div className="timetable-state timetable-state--error">
                <span>{occurrencesQuery.error instanceof Error ? occurrencesQuery.error.message : "The timetable could not be loaded."}</span>
                <button type="button" onClick={() => void occurrencesQuery.refetch()}>Retry</button>
              </div>
            ) : null}
            {!occurrencesQuery.isPending && !occurrencesQuery.isError && occurrences.length === 0 ? (
              <div className="timetable-state">No duties in this range. {canWrite ? "Choose an open slot to schedule the first one." : "Try another date range."}</div>
            ) : null}

            {!occurrencesQuery.isPending && !occurrencesQuery.isError ? (
              <div className={`timetable-grid ${view === "week" ? "timetable-grid--week" : "timetable-grid--day"}`} style={gridStyle}>
                <div className="timetable-corner" style={{ gridColumn: 1, gridRow: 1 }}>Time</div>
                {range.dates.map((date, index) => {
                  const meta = dateMeta(date);
                  return (
                    <div className="timetable-day-head" key={date} style={{ gridColumn: index + 2, gridRow: 1 }}>
                      <b>{meta.weekday}</b>
                      <span>{meta.month} {meta.day}</span>
                    </div>
                  );
                })}
                {Array.from({ length: END_HOUR - START_HOUR }, (_, hourIndex) => (
                  <div className="timetable-hour-label" key={hourIndex} style={{ gridColumn: 1, gridRow: hourIndex + 2 }}>
                    {minuteLabel(START_MINUTE + hourIndex * 60)}
                  </div>
                ))}
                {range.dates.map((date, columnIndex) => {
                  const pastDay = isPastDate(date, today);
                  const dayEvents = eventsByDate.get(date) ?? [];
                  return (
                    <div
                      className="timetable-day-column"
                      key={date}
                      style={{ gridColumn: columnIndex + 2, gridRow: `2 / span ${SLOT_COUNT}`, pointerEvents: "none" }}
                    >
                        {Array.from({ length: SLOT_COUNT }, (_, slotIndex) => {
                          const slotStart = START_MINUTE + slotIndex * SLOT_MINUTES;
                          const slotEnd = slotStart + SLOT_MINUTES;
                          const slotOccurrence = occurrenceAt(date, slotStart);
                          const label = `${readableDate(date)}, ${minuteLabel(slotStart)} to ${minuteLabel(slotEnd)}${slotOccurrence ? " · scheduled" : ""}`;
                          return (
                            <button
                              type="button"
                              className={`timetable-slot ${slotOccurrence ? "timetable-slot--scheduled" : ""} ${!slotOccurrence && (pastDay || !canWrite) ? "timetable-slot--inert" : ""}`}
                              key={slotIndex}
                              style={{ top: slotIndex * SLOT_PITCH_PX, height: SLOT_HEIGHT_PX, pointerEvents: "auto" }}
                              aria-label={label}
                              title={label}
                              disabled={!slotOccurrence && (pastDay || !canWrite)}
                              onClick={() => handleCellClick(date, slotStart)}
                            />
                          );
                        })}
                      {dayEvents.map((occurrence) => {
                        const startMinute = occurrenceMinute(occurrence.startsAt, timeZone) ?? START_MINUTE;
                        const rawEndMinute = occurrenceMinute(occurrence.endsAt, timeZone) ?? startMinute + SLOT_MINUTES;
                        const endMinute = rawEndMinute > startMinute ? rawEndMinute : END_MINUTE;
                        const startSlot = Math.max(0, Math.min(SLOT_COUNT - 1, Math.floor((startMinute - START_MINUTE) / SLOT_MINUTES)));
                        const endSlot = Math.max(startSlot + 1, Math.min(SLOT_COUNT, Math.ceil((endMinute - START_MINUTE) / SLOT_MINUTES)));
                        const past = occurrenceIsPast(occurrence, timeZone, clock);
                        const conflicts = occurrence.conflicts ?? [];
                        const blocking = conflicts.some((conflict) => conflict.level === "BLOCKING");
                        const notes = [
                          statusText(occurrence.status),
                          past ? "Past" : "",
                          blocking ? "Blocking conflict" : conflicts.length ? `${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"}` : "",
                          rawEndMinute <= startMinute ? "Ends after midnight" : "",
                        ].filter(Boolean).join(" · ");
                        const eventClasses = [
                          "timetable-event",
                          panel.kind !== "none" && "occurrenceId" in panel && panel.occurrenceId === occurrence.id ? "timetable-event--selected" : "",
                          occurrence.status === "CANCELLED" ? "timetable-event--cancelled" : "",
                          past ? "timetable-event--past" : "",
                          blocking ? "timetable-event--blocked" : "",
                        ].filter(Boolean).join(" ");
                        return (
                          <button
                            type="button"
                            className={eventClasses}
                            key={occurrence.id}
                            style={{ top: startSlot * SLOT_PITCH_PX, height: (endSlot - startSlot) * SLOT_PITCH_PX - 1, pointerEvents: "auto", zIndex: 2 }}
                            onClick={() => openOccurrence(occurrence)}
                            aria-label={`${doctorLabel(occurrence, doctorsById)}, ${roomDescription(occurrence, roomsById)}, ${minuteLabel(startMinute)} to ${minuteLabel(endMinute)}, ${notes}`}
                          >
                            <span className="timetable-event-time">{minuteLabel(startMinute)}–{minuteLabel(endMinute)}</span>
                            <b className="timetable-event-doctor">{doctorLabel(occurrence, doctorsById)}</b>
                            <span className="timetable-event-room">{roomDescription(occurrence, roomsById)}</span>
                            <span className="timetable-event-status">{notes}</span>
                            {conflicts.length ? <span className="timetable-event-status">Conflicts: {conflictSummary(conflicts)}</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>

          <section className="timetable-agenda" aria-label="Agenda">
            <div className="timetable-agenda-head"><h2>Agenda</h2><span>{occurrences.length} visible entr{occurrences.length === 1 ? "y" : "ies"}</span></div>
            {occurrences.length ? occurrences.map((occurrence) => {
              const startMinute = occurrenceMinute(occurrence.startsAt, timeZone);
              const endMinute = occurrenceMinute(occurrence.endsAt, timeZone);
              const notes = [
                statusText(occurrence.status),
                occurrenceIsPast(occurrence, timeZone, clock) ? "Past" : "",
                occurrence.conflicts?.length ? `Conflicts: ${conflictSummary(occurrence.conflicts)}` : "",
              ].filter(Boolean).join(" · ");
              return (
                <article className="timetable-agenda-item" key={occurrence.id}>
                  <div className="timetable-agenda-time">{readableDate(occurrence.occurrenceDate)}<br />{startMinute === null ? "—" : minuteLabel(startMinute)}–{endMinute === null ? "—" : minuteLabel(endMinute)}</div>
                  <div className="timetable-agenda-main">
                    <b>{doctorLabel(occurrence, doctorsById)}</b>
                    <span>{roomDescription(occurrence, roomsById)} · {notes}</span>
                  </div>
                </article>
              );
            }) : <div className="timetable-state">No duties to show in this range.</div>}
          </section>

          {renderEditor()}

          <section className="timetable-activity" aria-label="Activity history">
            <div className="timetable-board-head"><div><h2>Activity</h2><p>Recent timetable changes for this department.</p></div></div>
            {activityQuery.isPending ? <div className="timetable-state">Loading activity…</div> : null}
            {activityQuery.isError ? (
              <div className="timetable-state timetable-state--error">
                <span>{activityQuery.error instanceof Error ? activityQuery.error.message : "Activity could not be loaded."}</span>
                <button type="button" onClick={() => void activityQuery.refetch()}>Retry</button>
              </div>
            ) : null}
            {!activityQuery.isPending && !activityQuery.isError && !activity.length ? <div className="timetable-state">No activity has been recorded yet.</div> : null}
            <div className="timetable-activity-list">
              {activity.map((event: ActivityEvent) => (
                <article className="timetable-activity-item" key={event.id}>
                  <div className="timetable-activity-main">
                    <b>{actionText(event.action)}</b>
                    <span>{formatActivityTime(event.createdAt, timeZone)}</span>
                    <span>{metadataSummary(event.metadata)}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
