# EyeZen roster scheduling guide

This guide describes the current calendar-first staff UI and the backend APIs it
uses. It is based on the timetable workspace, occurrence conflict validator,
appointment/replacement workflows, and current role policy.

## Current model

`RosterOccurrence` under an active `DoctorRoster` is the single source of truth
for scheduled duty facts. Appointment capacity, replacement duty lookup, and
leave notifications all read active `SCHEDULED` occurrences. A one-time duty is
a date-bounded `DoctorRoster` rule plus its materialized occurrence; a recurring
rule generates future weekday matches idempotently. Edits and cancellations use
`RosterOverride` records, so rule history and cancelled occurrence history are
retained.

Legacy `Roster`/`RosterAssignment` routes remain read-only compatibility and are
not used by new workflows. `RosterStatus` values are `DRAFT`, `PUBLISHED`, and
`SUPERSEDED`; `ARCHIVED` is not used. Startup and
`npm run db:backfill-occurrences` bridge published/superseded legacy assignments
into occurrences, but those rows do not define current capacity unless the
backfilled occurrence is active and `SCHEDULED`.

## What roster scheduling does

Authorized staff can:

- browse a department week/day timetable with doctor and room filters;
- create a dated duty from an open slot, optionally repeating it until a date;
- choose an active doctor and room from availability-aware pickers;
- view, edit, or cancel a scheduled occurrence with `THIS_DATE` or
  `THIS_AND_FUTURE` scope;
- inspect conflicts and recent roster activity;
- edit the weekly rule behind a recurrence without rewriting past dates; and
- give doctors a read-only view of their own scheduled occurrences.

The saved duty blocks both the doctor and the room for a half-open interval. A
duty may start exactly when another ends.

## Who can use it

| Role | Roster access |
| --- | --- |
| Super Admin | Department-wide calendar access and room master-data management. |
| Hospital Admin | Same calendar and room administration as Super Admin. |
| Roster Manager | Read/create/edit/cancel occurrences within assigned departments; select active rooms. |
| Department Head | Same department-scoped calendar operations, with leave and replacement oversight. |
| Doctor | Cannot open department-wide calendars. Reads only their own occurrences in **My schedule** and responds to replacement proposals. |
| Reception Front Desk | No roster or calendar access. |

The API enforces role permissions and department scope. Selecting a department
in the UI does not grant access to it. A doctor must also be an active member of
the department to be scheduled or chosen as a replacement.

## Find the roster workspace

1. Sign in with an authorized account.
2. Open **Roster calendar** from the staff navigation.
3. Choose the department in the department selector. Hospital-wide admins must
   select a department before editing.
4. Use week/day navigation and room/doctor filters to find a slot.
5. Use the activity panel to review recent calendar changes.

Room creation, editing, and deactivation live in the separate Rooms section for
administrators. Roster editors only read rooms for filters and duty forms.

## Create a duty

Click an open slot to open the create-duty panel, then:

1. Confirm the hospital-local date and time range.
2. Choose an active doctor and room. The doctor picker checks overlapping
   occurrences, unavailability, and approved leave.
3. Optionally set a **Repeat until** date to generate the same weekday rule
   through that date.
4. Save. A one-time save creates the date-bounded rule and its occurrence in one
   transaction; a repeating save generates future occurrences idempotently.

The end must be later than the start. Department membership, active room status,
doctor/room overlap, dated availability, and approved leave are checked by the
API on save, so a point-in-time picker result can still be rejected if another
change occurs first. Working-hour mismatches are warnings; blocking conflicts
prevent the save.

## View, edit, or cancel an occurrence

Click a scheduled duty to inspect it. Authorized users can choose:

- **This date** — create or update a one-date override.
- **This and future dates** — apply the change from that date forward without
  rewriting earlier rule history.

Editing changes doctor, room, start/end, or the underlying weekly rule. Cancelling
records a cancellation override and keeps the occurrence ID and status. Past
local dates are read-only. Each action asks for a reason where needed, and the
API returns conflict details on a `409`.

To change the recurrence itself, use the rule editor from the scheduled-duty
panel. Rules use weekdays 1 (Monday) through 7 (Sunday), local minute values,
and an effective date range capped by `ROSTER_MAX_HORIZON_DAYS` (366 by
default). Rule edits affect future generated duties only.

## Understand conflict results

| Result | Current rule | What to do |
| --- | --- | --- |
| **Blocking — invalid window** | Start is not before end, or the local interval is invalid. | Correct the start/end values. |
| **Blocking — department ineligible** | Doctor is not an active member of the selected department. | Have an authorized admin restore the membership, then retry. |
| **Blocking — double booked** | Doctor or room overlaps another scheduled occurrence. | Move or remove one of the overlapping duties. |
| **Blocking — inactive room** | The selected room is inactive or belongs to another department. | Choose an active room in the selected department. |
| **Blocking — doctor unavailable** | Dated availability marks the doctor unavailable during the duty. | Change the duty time or correct the availability record. |
| **Blocking — approved leave** | Approved leave overlaps the duty. | Choose another doctor or time, or resolve the leave status. |
| **Warning — outside working hours** | Weekly hours exist but do not contain the whole duty. | Adjust the duty or verify working hours; a permitted role may save with a reason. |

If no weekly hours are configured, the validator does not emit an outside-hours
warning. Approved leave is checked against EyeZen's local leave records; no
external leave vendor is implied.

## Appointment capacity, replacements, and leave

- **Appointments:** `GET /api/departments/:departmentId/appointments/capacity`
  previews only active `SCHEDULED` occurrence coverage that fully contains the
  requested window. Success is
  `{ ok: true, capacity: { occurrenceId, startsAt, endsAt } }`; there is no
  `source` field. `NO_SCHEDULED_ROSTER_COVERAGE` means no scheduled duty covers
  the slot. Created and rescheduled appointments store `occurrenceId`; create,
  confirm, and reschedule always revalidate server-side.
- **Replacements:** candidate lookup requires
  `GET /api/departments/:departmentId/replacements/candidates?occurrenceId=…`,
  and proposals post `{ occurrenceId, proposedDoctorId, leaveRequestId? }`.
  `assignmentId` on an old record is historical only, and legacy replacements
  cannot be restored until backfilled. Proposed-doctor acceptance creates a
  one-date override, regenerates occurrences, and queues appointment
  patient-change requests; restoration deactivates the override and regenerates
  the original doctor's occurrence.
- **Leave:** approval emits `LEAVE_APPROVED_AFFECTED_DUTIES` with
  `occurrenceIds`. Worker email says affected scheduled duties are being
  reviewed; the old `LEAVE_APPROVED_AFFECTED_ASSIGNMENTS` event is accepted only
  for already-queued records.

## Common cases and recovery

- **No department selected:** choose one before creating or editing a duty.
- **No active doctors in the picker:** check doctor profiles, active department
  membership, and availability for the selected window.
- **Capacity fails with `NO_SCHEDULED_ROSTER_COVERAGE`:** create or restore an
  active scheduled occurrence for the requested doctor and window.
- **A past occurrence panel is read-only:** select a future date or edit the
  weekly rule for future generated duties.
- **A conflict appears after a save:** the backend rejected the write; fix the
  listed duty, room, availability, or leave conflict and retry.
- **A legacy replacement cannot be restored:** its assignment must be
  backfilled into an occurrence first.
- **Roster email not received:** publication/leave/replacement changes create
  outbox events; check notification delivery and worker health. Success does
  not guarantee provider delivery.

## Current workflow boundaries

- The UI has no calendar drag-and-drop, shift swapping, bulk doctor assignment,
  bulk deletion, draft/publish cycle, or rollback-to-revision action.
- Recurrence supports one weekday and one local start/end window per rule;
  overnight patterns are not supported.
- Working-hour mismatches are warnings; room/doctor overlap, unavailability,
  approved leave, and inactive resources are blocking.
- Past occurrences are read-only, and legacy roster/assignment routes are not
  part of the staff workflow.
- Calendar writes require authenticated, CSRF-protected requests and server-side
  department scope checks.

## Implementation references

- Frontend timetable: [`roster-workspace.tsx`](../components/rosters/roster-workspace.tsx), [`timetable.ts`](../lib/api/timetable.ts)
- Doctor self schedule: [`doctor-schedule.tsx`](../components/scheduling/doctor-schedule.tsx)
- Backend calendar routes: [`calendar-routes.ts`](../../../EyeZen-Backend/src/scheduling/calendar-routes.ts)
- Conflict rules: [`occurrence-service.ts`](../../../EyeZen-Backend/src/scheduling/occurrence-service.ts)
- Role permissions: [`policy.ts`](../../../EyeZen-Backend/src/security/policy.ts)
- Frontend API integration inventory: [`api-integration.md`](api-integration.md)
