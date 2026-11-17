"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchOwnOccurrences } from "@/lib/api/timetable";
import type { OccurrenceConflict, RosterOccurrence } from "@/lib/api/timetable";

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateKey(dateKey: string): { year: number; month: number; day: number } | null {
  const parts = dateKey.split("-");
  if (parts.length !== 3) return null;
  const [year, month, day] = parts.map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function addDays(dateKey: string, amount: number): string {
  const parts = parseDateKey(dateKey);
  if (!parts) return dateKey;
  const date = new Date(parts.year, parts.month - 1, parts.day);
  date.setDate(date.getDate() + amount);
  return formatDateKey(date);
}

function mondayOf(date: Date): string {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = monday.getDay();
  monday.setDate(monday.getDate() + (weekday === 0 ? -6 : 1 - weekday));
  return formatDateKey(monday);
}

function subscribeToClock(): () => void {
  return () => {};
}

function readLocalWeekStart(): string {
  return mondayOf(new Date());
}

function readServerWeekStart(): string {
  return "";
}

function formatDateLabel(dateKey: string, formatter: Intl.DateTimeFormat): string {
  const parts = parseDateKey(dateKey);
  if (!parts) return dateKey;
  return formatter.format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)));
}

function formatTimestamp(value: string, formatter: Intl.DateTimeFormat): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : formatter.format(date);
}

function statusText(status: RosterOccurrence["status"]): string {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function roomText(occurrence: RosterOccurrence): string {
  if (!occurrence.room) return "Room not assigned";
  const floor = occurrence.room.floor ? ` · Floor ${occurrence.room.floor}` : "";
  return `Room ${occurrence.room.roomNumber}${floor}`;
}

function severityText(level: OccurrenceConflict["level"]): string {
  if (level === "BLOCKING") return "Blocking";
  if (level === "OVERRIDABLE_WARNING") return "Warning";
  return "Informational";
}

function conflictClassName(conflict: OccurrenceConflict): string {
  if (conflict.level === "BLOCKING") return "timetable-conflict timetable-conflict--blocking";
  if (conflict.level === "OVERRIDABLE_WARNING") return "timetable-conflict timetable-conflict--warning";
  return "timetable-conflict";
}

function groupOccurrences(occurrences: RosterOccurrence[]): Array<[string, RosterOccurrence[]]> {
  const groups = new Map<string, RosterOccurrence[]>();
  for (const occurrence of occurrences) {
    const dateKey = occurrence.occurrenceDate.slice(0, 10);
    const items = groups.get(dateKey) ?? [];
    items.push(occurrence);
    groups.set(dateKey, items);
  }
  for (const items of groups.values()) items.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
}

export function DoctorSchedule({ departmentId, timeZone }: { departmentId?: string; timeZone: string }) {
  const detectedWeekStart = useSyncExternalStore(subscribeToClock, readLocalWeekStart, readServerWeekStart);
  const [weekStartOverride, setWeekStartOverride] = useState<string | null>(null);
  const weekStart = weekStartOverride ?? (detectedWeekStart || null);
  const from = weekStart ?? "";
  const through = weekStart ? addDays(weekStart, 6) : "";
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat("en-IN", { timeZone, weekday: "long", day: "numeric", month: "short", year: "numeric" }), [timeZone]);
  const rangeFormatter = useMemo(() => new Intl.DateTimeFormat("en-IN", { timeZone, day: "numeric", month: "short", year: "numeric" }), [timeZone]);
  const timeFormatter = useMemo(() => new Intl.DateTimeFormat("en-IN", { timeZone, hour: "numeric", minute: "2-digit" }), [timeZone]);
  const dateTimeFormatter = useMemo(() => new Intl.DateTimeFormat("en-IN", { timeZone, dateStyle: "medium", timeStyle: "short" }), [timeZone]);

  const query = useQuery({
    queryKey: ["doctor-schedule", from, through, departmentId ?? ""],
    enabled: Boolean(from && through),
    queryFn: () => fetchOwnOccurrences({ from, through, departmentId: departmentId || undefined }),
  });

  if (!weekStart || query.isPending) return <section className="timetable-workspace"><div className="timetable-state">Loading your doctor schedule…</div></section>;

  if (query.isError) return <section className="timetable-workspace"><div className="timetable-state timetable-state--error"><b>Your doctor schedule could not be loaded.</b><span>{query.error instanceof Error ? query.error.message : "Please try again."}</span><button type="button" onClick={() => void query.refetch()}>Retry</button></div></section>;

  const occurrences = query.data ?? [];
  const groups = groupOccurrences(occurrences);
  const rangeLabel = `${formatDateLabel(from, rangeFormatter)} – ${formatDateLabel(through, rangeFormatter)}`;

  if (groups.length === 0) return <section className="timetable-workspace"><div className="timetable-toolbar"><div className="timetable-toolbar-group"><nav className="timetable-nav" aria-label="Schedule week"><button type="button" onClick={() => setWeekStartOverride(addDays(weekStart, -7))}>Previous</button><button type="button" onClick={() => setWeekStartOverride(mondayOf(new Date()))}>Today</button><button type="button" onClick={() => setWeekStartOverride(addDays(weekStart, 7))}>Next</button></nav></div><div className="timetable-toolbar-group"><span>{rangeLabel}</span></div></div><div className="timetable-state">No scheduled occurrences for your doctor schedule in this week.</div></section>;

  return <section className="timetable-workspace"><div className="timetable-toolbar"><div className="timetable-toolbar-group"><nav className="timetable-nav" aria-label="Schedule week"><button type="button" onClick={() => setWeekStartOverride(addDays(weekStart, -7))}>Previous</button><button type="button" onClick={() => setWeekStartOverride(mondayOf(new Date()))}>Today</button><button type="button" onClick={() => setWeekStartOverride(addDays(weekStart, 7))}>Next</button></nav></div><div className="timetable-toolbar-group"><span>{rangeLabel}</span></div></div><div className="timetable-board-card"><div className="timetable-board-head"><div><h2>My doctor schedule</h2><p>Read-only scheduled occurrences from the calendar-first roster.</p></div><div className="timetable-board-meta"><span>{occurrences.length} scheduled occurrence{occurrences.length === 1 ? "" : "s"}</span><span>Hospital time zone: {timeZone}</span></div></div>{groups.map(([dateKey, items]) => <div className="timetable-agenda" key={dateKey}><div className="timetable-agenda-head"><h3>{formatDateLabel(dateKey, dateFormatter)}</h3><span>{items.length} occurrence{items.length === 1 ? "" : "s"}</span></div>{items.map((occurrence) => { const conflicts = occurrence.conflicts ?? []; return <article className="timetable-agenda-item" key={occurrence.id}><div className="timetable-agenda-time"><b>{formatTimestamp(occurrence.startsAt, timeFormatter)}</b><span>{formatTimestamp(occurrence.endsAt, timeFormatter)}</span></div><div className="timetable-agenda-main"><b>{occurrence.doctor?.displayName ?? "You"}</b><span>{statusText(occurrence.status)} · {roomText(occurrence)} · {formatTimestamp(occurrence.startsAt, dateTimeFormatter)} – {formatTimestamp(occurrence.endsAt, dateTimeFormatter)}</span>{conflicts.length > 0 ? <div className="timetable-conflicts">{conflicts.map((conflict, index) => <div className={conflictClassName(conflict)} key={`${conflict.code}-${conflict.occurrenceId}-${index}`}><span className="timetable-conflict-code">{severityText(conflict.level)} · {conflict.code}</span><span>{conflict.message}</span></div>)}</div> : null}</div></article>; })}</div>)}</div></section>;
}
