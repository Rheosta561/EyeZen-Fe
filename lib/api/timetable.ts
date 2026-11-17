import { apiFetch } from "@/lib/api/client";

export type ConflictLevel = "BLOCKING" | "OVERRIDABLE_WARNING" | "INFORMATIONAL";

export type OccurrenceConflict = {
  code: string;
  level: ConflictLevel;
  occurrenceId: string;
  message: string;
};

export type TimetableDoctor = {
  id: string;
  displayName: string;
  specialty: string | null;
  userId: string | null;
};

export type DoctorAvailabilityStatus = "AVAILABLE" | "OUTSIDE_HOURS" | "UNAVAILABLE";

export type DoctorAvailability = {
  id: string;
  displayName: string;
  specialty: string | null;
  status: DoctorAvailabilityStatus;
  conflicts: OccurrenceConflict[];
};

export type Room = {
  id: string;
  departmentId: string;
  roomNumber: string;
  roomType: string;
  floor: string | null;
  isActive: boolean;
};

export type RosterOccurrenceStatus = "SCHEDULED" | "CANCELLED" | "SUPERSEDED";

export type RosterOccurrence = {
  id: string;
  departmentId: string;
  rosterId: string;
  overrideId: string | null;
  occurrenceDate: string;
  doctorId: string;
  roomId: string;
  startsAt: string;
  endsAt: string;
  status: RosterOccurrenceStatus;
  doctor?: { id: string; displayName: string; specialty: string | null } | null;
  room?: Room | null;
  roster?: { id: string; weekday: number; startMinute: number; endMinute: number; effectiveFrom: string; effectiveUntil: string | null } | null;
  override?: { id: string; status: string; reason: string | null; effectiveFrom: string; effectiveUntil: string } | null;
  conflicts?: OccurrenceConflict[];
};

export type RosterRule = {
  id: string;
  departmentId: string;
  doctorId: string;
  roomId: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  effectiveFrom: string;
  effectiveUntil: string | null;
  isActive: boolean;
  doctor?: { id: string; displayName: string } | null;
  room?: { id: string; roomNumber: string } | null;
  _count?: { occurrences?: number; overrides?: number };
};

export type RosterOverride = {
  id: string;
  rosterId: string;
  departmentId: string;
  effectiveFrom: string;
  effectiveUntil: string;
  status: string;
  doctorId: string | null;
  roomId: string | null;
  startMinute: number | null;
  endMinute: number | null;
  reason: string | null;
  isActive: boolean;
};

export type ActivityEvent = {
  id: string;
  createdAt: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
};

export type CreateOccurrenceInput = {
  doctorId: string;
  roomId: string;
  occurrenceDate: string;
  startMinute: number;
  endMinute: number;
  repeatUntilDate?: string;
};

export type PatchOccurrenceInput = {
  scope: "THIS_DATE" | "THIS_AND_FUTURE";
  doctorId?: string;
  roomId?: string;
  startMinute?: number;
  endMinute?: number;
  reason: string;
};

export type CancelOccurrenceInput = {
  scope: "THIS_DATE" | "THIS_AND_FUTURE";
  reason: string;
};

export type UpdateRosterRuleInput = {
  weekday: number;
  startMinute: number;
  endMinute: number;
  effectiveFrom: string;
  effectiveUntil: string | null;
};

export type CreateRoomInput = {
  roomNumber: string;
  roomType: string;
  floor?: string;
  isActive?: boolean;
};

export class TimetableApiError extends Error {
  status: number;
  code: string;
  conflicts: OccurrenceConflict[];

  constructor(message: string, status: number, code: string, conflicts?: OccurrenceConflict[]) {
    super(message);
    this.name = "TimetableApiError";
    this.status = status;
    this.code = code;
    this.conflicts = conflicts ?? [];
  }
}

type JsonRecord = Record<string, unknown>;

const DEFAULT_ERROR_MESSAGES: Record<string, string> = {
  SCHEDULE_CONFLICTS: "This change conflicts with another scheduled entry. Review the conflicts and try again.",
  DEPARTMENT_SCOPE_FORBIDDEN: "You do not have access to this department.",
  DOCTOR_SCOPE_FORBIDDEN: "You do not have permission to manage this doctor's schedule.",
  ROOM_SCOPE_FORBIDDEN: "You do not have permission to manage this room.",
  DOCTOR_NOT_IN_DEPARTMENT: "The selected doctor is not assigned to this department.",
  ROOM_NOT_IN_DEPARTMENT: "The selected room is not assigned to this department.",
  ROOM_INACTIVE: "The selected room is inactive.",
  PAST_OCCURRENCE_IMMUTABLE: "Past roster entries cannot be changed.",
  ROOM_NUMBER_ALREADY_EXISTS: "A room with that number already exists.",
  ROOM_IN_USE: "This room is in use and cannot be changed.",
  INVALID_WINDOW: "The selected time range is invalid.",
  INVALID_REPEAT_RANGE: "The repeat range is invalid.",
  INVALID_EFFECTIVE_RANGE: "The rule end date cannot be before its start date.",
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isConflictLevel(value: unknown): value is ConflictLevel {
  return value === "BLOCKING" || value === "OVERRIDABLE_WARNING" || value === "INFORMATIONAL";
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readConflicts(value: unknown): OccurrenceConflict[] {
  if (!Array.isArray(value)) return [];
  const conflicts: OccurrenceConflict[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const { code, level, occurrenceId, message } = item;
    if (typeof code !== "string" || !isConflictLevel(level) || typeof occurrenceId !== "string" || typeof message !== "string") continue;
    conflicts.push({ code, level, occurrenceId, message });
  }
  return conflicts;
}

function readArray<T>(payload: unknown, key: string): T[] {
  if (!isRecord(payload)) return [];
  const value = payload[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function readErrorMessage(payload: unknown, code: string): string {
  const record = isRecord(payload) ? payload : undefined;
  const message = record ? readString(record.message).trim() : "";
  if (message) return message;
  return DEFAULT_ERROR_MESSAGES[code] ?? "The request could not be completed. Please try again.";
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await apiFetch(path, init);
  const payload = await readJson(response);
  if (response.ok) return payload;
  const record = isRecord(payload) ? payload : undefined;
  const code = readString(record?.error) || readString(record?.code) || "REQUEST_FAILED";
  throw new TimetableApiError(readErrorMessage(payload, code), response.status, code, readConflicts(record?.conflicts));
}

function requireRecord(value: unknown): JsonRecord {
  if (!isRecord(value)) throw new TimetableApiError("The API returned an unexpected response.", 200, "INVALID_RESPONSE");
  return value;
}

function readEntity<T>(record: JsonRecord, key: string): T {
  const value = record[key];
  if (!isRecord(value)) throw new TimetableApiError("The API returned an unexpected response.", 200, "INVALID_RESPONSE");
  return value as unknown as T;
}

function readGeneration(record: JsonRecord): { created: number; updated: number; conflicts: OccurrenceConflict[] } {
  const generation = isRecord(record.generation) ? record.generation : undefined;
  return {
    created: generation && typeof generation.created === "number" ? generation.created : 0,
    updated: generation && typeof generation.updated === "number" ? generation.updated : 0,
    conflicts: generation ? readConflicts(generation.conflicts) : [],
  };
}

function dateKey(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 10) : "";
}

function normalizeOccurrence(value: RosterOccurrence): RosterOccurrence {
  return {
    ...value,
    occurrenceDate: dateKey(value.occurrenceDate),
    roster: value.roster ? {
      ...value.roster,
      effectiveFrom: dateKey(value.roster.effectiveFrom),
      effectiveUntil: value.roster.effectiveUntil ? dateKey(value.roster.effectiveUntil) : null,
    } : value.roster,
    override: value.override ? {
      ...value.override,
      effectiveFrom: dateKey(value.override.effectiveFrom),
      effectiveUntil: dateKey(value.override.effectiveUntil),
    } : value.override,
  };
}

function normalizeOccurrences(values: RosterOccurrence[]): RosterOccurrence[] {
  return values.map(normalizeOccurrence);
}

function normalizeRosterRule(value: RosterRule): RosterRule {
  return {
    ...value,
    effectiveFrom: dateKey(value.effectiveFrom),
    effectiveUntil: value.effectiveUntil ? dateKey(value.effectiveUntil) : null,
  };
}

function normalizeRosterOverride(value: RosterOverride): RosterOverride {
  return {
    ...value,
    effectiveFrom: dateKey(value.effectiveFrom),
    effectiveUntil: dateKey(value.effectiveUntil),
  };
}

function mutationInit(method: "POST" | "PATCH", body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function departmentPath(departmentId: string, suffix: string): string {
  return `/api/departments/${encodeURIComponent(departmentId)}${suffix}`;
}

function occurrenceCollectionPath(departmentId: string): string {
  return departmentPath(departmentId, "/roster-occurrences");
}

function occurrencePath(departmentId: string, occurrenceId: string): string {
  return `${occurrenceCollectionPath(departmentId)}/${encodeURIComponent(occurrenceId)}`;
}

function ruleCollectionPath(departmentId: string): string {
  return departmentPath(departmentId, "/roster-rules");
}

function roomCollectionPath(departmentId: string): string {
  return departmentPath(departmentId, "/rooms");
}

function roomPath(departmentId: string, roomId: string): string {
  return `${roomCollectionPath(departmentId)}/${encodeURIComponent(roomId)}`;
}

function dateQuery(from: string, through: string, extra?: Record<string, string | undefined>): string {
  const query = new URLSearchParams({ from, through });
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined) query.set(key, value);
    }
  }
  return query.toString();
}

export async function fetchTimetableDoctors(departmentId: string): Promise<TimetableDoctor[]> {
  const payload = await requestJson(`/auth/departments/${encodeURIComponent(departmentId)}/doctors`);
  const byProfileId = new Map<string, TimetableDoctor>();
  for (const doctor of readArray<unknown>(payload, "doctors")) {
    if (!isRecord(doctor)) continue;
    const profileId = doctor.doctorProfileId;
    if (typeof profileId !== "string" || byProfileId.has(profileId)) continue;
    byProfileId.set(profileId, {
      id: profileId,
      displayName: readString(doctor.displayName),
      specialty: readNullableString(doctor.specialty),
      userId: typeof doctor.id === "string" ? doctor.id : null,
    });
  }
  return Array.from(byProfileId.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function fetchRooms(departmentId: string): Promise<Room[]> {
  const payload = await requestJson(roomCollectionPath(departmentId));
  return readArray<Room>(payload, "rooms");
}

export async function fetchOccurrences(params: { departmentId: string; from: string; through: string; doctorId?: string; roomId?: string }): Promise<RosterOccurrence[]> {
  const query = dateQuery(params.from, params.through, { doctorId: params.doctorId, roomId: params.roomId });
  const payload = await requestJson(`${occurrenceCollectionPath(params.departmentId)}?${query}`);
  return normalizeOccurrences(readArray<RosterOccurrence>(payload, "occurrences"));
}

export async function fetchOwnOccurrences(params: { from: string; through: string; departmentId?: string }): Promise<RosterOccurrence[]> {
  const query = dateQuery(params.from, params.through, { departmentId: params.departmentId });
  const payload = await requestJson(`/api/me/roster-occurrences?${query}`);
  return normalizeOccurrences(readArray<RosterOccurrence>(payload, "occurrences"));
}

export async function fetchOccurrence(departmentId: string, occurrenceId: string): Promise<RosterOccurrence> {
  const payload = await requestJson(occurrencePath(departmentId, occurrenceId));
  return normalizeOccurrence(requireRecord(payload) as unknown as RosterOccurrence);
}

export async function fetchDoctorAvailability(params: {
  departmentId: string;
  occurrenceDate: string;
  startMinute: number;
  endMinute: number;
  roomId?: string;
  excludeOccurrenceId?: string;
}): Promise<DoctorAvailability[]> {
  const query = new URLSearchParams({
    occurrenceDate: params.occurrenceDate,
    startMinute: String(params.startMinute),
    endMinute: String(params.endMinute),
  });
  if (params.roomId) query.set("roomId", params.roomId);
  if (params.excludeOccurrenceId) query.set("excludeOccurrenceId", params.excludeOccurrenceId);
  const payload = await requestJson(`${occurrenceCollectionPath(params.departmentId)}/doctor-availability?${query}`);
  return readArray<unknown>(payload, "doctors").flatMap((item): DoctorAvailability[] => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.displayName !== "string") return [];
    const status = item.status === "UNAVAILABLE" || item.status === "OUTSIDE_HOURS" ? item.status : "AVAILABLE";
    return [{
      id: item.id,
      displayName: item.displayName,
      specialty: readNullableString(item.specialty),
      status,
      conflicts: readConflicts(item.conflicts),
    }];
  });
}

export async function createOccurrence(departmentId: string, input: CreateOccurrenceInput): Promise<{ rule: RosterRule; occurrence: RosterOccurrence; generation: { created: number; updated: number; conflicts: OccurrenceConflict[] } }> {
  const payload = await requestJson(occurrenceCollectionPath(departmentId), mutationInit("POST", input));
  const record = requireRecord(payload);
  return {
    rule: normalizeRosterRule(readEntity<RosterRule>(record, "rule")),
    occurrence: normalizeOccurrence(readEntity<RosterOccurrence>(record, "occurrence")),
    generation: readGeneration(record),
  };
}

export async function patchOccurrence(departmentId: string, occurrenceId: string, input: PatchOccurrenceInput): Promise<{ override: RosterOverride; occurrence: RosterOccurrence; generation: { created: number; updated: number; conflicts: OccurrenceConflict[] } }> {
  const payload = await requestJson(occurrencePath(departmentId, occurrenceId), mutationInit("PATCH", input));
  const record = requireRecord(payload);
  return {
    override: normalizeRosterOverride(readEntity<RosterOverride>(record, "override")),
    occurrence: normalizeOccurrence(readEntity<RosterOccurrence>(record, "occurrence")),
    generation: readGeneration(record),
  };
}

export async function cancelOccurrence(departmentId: string, occurrenceId: string, input: CancelOccurrenceInput): Promise<{ override: RosterOverride; occurrence: RosterOccurrence; generation: { created: number; updated: number; conflicts: OccurrenceConflict[] } }> {
  const payload = await requestJson(`${occurrencePath(departmentId, occurrenceId)}/cancel`, mutationInit("POST", input));
  const record = requireRecord(payload);
  return {
    override: normalizeRosterOverride(readEntity<RosterOverride>(record, "override")),
    occurrence: normalizeOccurrence(readEntity<RosterOccurrence>(record, "occurrence")),
    generation: readGeneration(record),
  };
}

export async function fetchRules(departmentId: string): Promise<RosterRule[]> {
  const payload = await requestJson(ruleCollectionPath(departmentId));
  return readArray<RosterRule>(payload, "rules").map(normalizeRosterRule);
}

export async function updateRosterRule(departmentId: string, ruleId: string, input: UpdateRosterRuleInput): Promise<{ rule: RosterRule; generation: { created: number; updated: number; conflicts: OccurrenceConflict[] } }> {
  const payload = await requestJson(`${ruleCollectionPath(departmentId)}/${encodeURIComponent(ruleId)}`, mutationInit("PATCH", input));
  const record = requireRecord(payload);
  return {
    rule: normalizeRosterRule(readEntity<RosterRule>(record, "rule")),
    generation: readGeneration(record),
  };
}

export async function fetchOverrides(departmentId: string): Promise<RosterOverride[]> {
  const payload = await requestJson(departmentPath(departmentId, "/roster-overrides"));
  return readArray<RosterOverride>(payload, "overrides").map(normalizeRosterOverride);
}

export async function fetchActivity(departmentId: string): Promise<ActivityEvent[]> {
  const payload = await requestJson(departmentPath(departmentId, "/roster-activity"));
  return readArray<ActivityEvent>(payload, "events");
}

export async function createRoom(departmentId: string, input: CreateRoomInput): Promise<Room> {
  const payload = await requestJson(roomCollectionPath(departmentId), mutationInit("POST", input));
  return requireRecord(payload) as unknown as Room;
}

export async function updateRoom(departmentId: string, roomId: string, input: Partial<CreateRoomInput>): Promise<Room> {
  const payload = await requestJson(roomPath(departmentId, roomId), mutationInit("PATCH", input));
  return requireRecord(payload) as unknown as Room;
}

export async function deactivateRoom(departmentId: string, roomId: string): Promise<{ id: string; isActive: false }> {
  const payload = await requestJson(`${roomPath(departmentId, roomId)}/deactivate`, mutationInit("POST", {}));
  return requireRecord(payload) as unknown as { id: string; isActive: false };
}
