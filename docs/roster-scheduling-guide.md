# EyeZen roster scheduling guide

This guide explains what roster scheduling currently supports and how to operate it from the EyeZen staff UI. It is based on the frontend workspace, the scheduling API handlers, the conflict validator, and the current role policy.

## What roster scheduling does

Roster scheduling lets authorized staff create department-scoped drafts, add individual duties or weekly recurring patterns, generate dated duties from those patterns, review schedule conflicts, publish a read-only revision, and inspect publication history.

The UI separates planning from publication:

1. **Drafts** can be renamed and edited. They contain one-off duties and weekly patterns.
2. **Published rosters** are immutable. Later changes require a new draft and a new publication.
3. The backend stores each published snapshot, including its assignments and validation result. The current **Revision history** UI lists revision numbers and publication timestamps but does not display the full snapshot contents.

Times are interpreted and shown in the configured hospital time zone (`HOSPITAL_TIME_ZONE`, default `UTC`). Doctor schedule reads show only published assignments for the signed-in doctor and the next seven days.

## Who can use it

| Role | Roster access |
| --- | --- |
| Super Admin | Read, create, edit, delete, and publish for any department; may publish overridable warnings with a reason. |
| Hospital Admin | Same roster actions as Super Admin; may publish overridable warnings with a reason. |
| Roster Manager | Read, create, edit, delete, and publish within assigned departments; cannot override warnings. |
| Department Head | Same department-scoped roster actions; may publish overridable warnings with a reason. |
| Doctor | Cannot open department roster drafts or revisions. Can read only their own published assignments in **My schedule**. |
| Reception Front Desk | No roster access. |

The API enforces role permissions and department scope. Selecting a department in the UI does not grant access to it. A doctor must also be an active member of the department to be scheduled.

## Find the roster workspace

1. Sign in with an authorized account.
2. Open **Roster calendar** from the staff navigation.
3. Choose the department in the department selector. Hospital-wide admins must also select a department before editing.
4. Use **Show me around** for the short, five-step UI walkthrough.

The left panel lists up to 100 of the department's most recently updated rosters. Each row shows Draft or Published status, the name, and assignment count. Select a row to open its details on the right.

## Duty vs. weekly pattern

A **duty** is one dated assignment for one doctor. For example: “Dr Lee, Tuesday 18 November, 09:00–13:00, in person.” Add it directly when coverage is needed on a specific date, such as a one-time clinic or a holiday exception. You can edit or remove that occurrence without changing any other date.

A **weekly pattern** is a repeating rule, not a dated shift. For example: “Dr Lee, every Tuesday, 09:00–13:00, effective 18 November through 31 January.” Choose a generation range to expand that rule into individual dated duties. Those generated duties can then be reviewed and adjusted. Changing a pattern alone does not rewrite duties already generated from it; run generation for the desired range to reconcile them.

In short: a pattern describes *when coverage should repeat*; duties are the actual dated shifts that doctors see.

## Create and manage a draft

### Create a draft

1. Enter a name under **New roster draft** (up to 120 characters).
2. Choose **Create draft**.
3. On success, EyeZen selects the new draft and opens its **Duties** tab. A Sonner toast confirms creation.

If the name is blank, the request fails, or department access is rejected, a Sonner error toast explains the problem. The name stays in the field after a failure so you can correct it and retry.

### Rename or delete a draft

- Select the draft, choose **Rename**, enter a non-empty name (up to 120 characters), then save.
- Choose **Delete draft** to delete the draft and all its duties and patterns. The UI asks for confirmation. Published rosters cannot be deleted. A draft with replacement history cannot be deleted; the API rejects it.

Deletion is permanent. If the draft is linked to replacement history, retain it and make changes in another draft instead.

## Add individual duties

On a selected draft's **Duties** tab, use **Add a duty**:

1. Search the department doctor list by name or specialty and select a doctor.
2. Enter **Starts** and **Ends** using the displayed hospital-local time.
3. Choose **In person** or **Teleconsultation**.
4. Optionally enter an exception note (up to 500 characters).
5. Choose **Add duty**.

The end must be later than the start. A duty may span dates, but if it crosses a local day boundary while working hours are configured it can produce an outside-hours warning. The doctor must still be an active department member. Editing a duty rechecks conflicts; deleting one requires confirmation. These actions show success or failure through Sonner.

After entering a valid start and end, the doctor picker checks active department doctors for overlapping assignments, marked unavailability, and approved leave. **Show available doctors only** filters the choices; with the filter off, unavailable doctors remain visible with the reason they are busy. When editing a duty, the duty being edited is excluded from its own availability check. Working-hours mismatches remain warnings and may still appear when you save. Availability is a point-in-time check; the API revalidates when saving, so a newly created conflict can still block the change.

## Add weekly patterns

Weekly patterns are recurring local-time rules stored on a draft. On the **Duties** tab, use **Add a weekly pattern**:

1. Select a doctor.
2. Choose a weekday (Sunday through Saturday).
3. Choose a duty type.
4. Enter start and end times; end must be later than start, so a recurring pattern cannot cross midnight.
5. Set **Effective from** and, optionally, **Through**.
6. Choose **Add weekly pattern**.

Patterns only create duties on their selected weekday, within their effective date range. Leaving **Through** blank makes the pattern open-ended until the generation range ends. The doctor must be an active member of the department. Local times skipped by a daylight-saving clock change are rejected; an ambiguous repeated local time uses its earlier occurrence.

To change a pattern, open the **Weekly patterns** tab and choose **Edit**. The editor returns to the Duties tab with the selected pattern loaded. Deleting a pattern does not delete already generated duties. A pattern with replacement history cannot be deleted.

**Date-range note:** Set Through to the same date as or a later date than Effective from. The UI currently does not reject a reversed range when first creating a pattern; such a pattern will not generate duties. Editing the pattern does validate the range.

## Generate dated duties

The **Generate from weekly patterns** section is on the Duties tab:

1. Set **From** and **Through**. The end date is inclusive in the UI.
2. Choose **Generate duties**.
3. Review the generated count and any conflict report before continuing.

The API limits the elapsed range span to `ROSTER_MAX_HORIZON_DAYS` (366 days by default). Generation uses the hospital time zone to determine local weekdays and times. A successful request can generate zero duties if no patterns match the dates or their effective ranges.

### Safe regeneration

The backend validates proposed duties first. If validation passes, it replaces only duties that were generated from a weekly pattern and whose start time falls inside the selected date range. Manually added duties are preserved. Editing a generated duty converts it to a manual duty, so subsequent regeneration preserves the edit. Generation is atomic: a blocking conflict leaves the current duties unchanged. The result toast reports generated and preserved manual duty counts.

Pattern duties outside the selected range remain unchanged. Removing a pattern does not automatically remove its existing generated duties; use generation for the relevant range to reconcile them, or delete those duties directly. Duties with replacement history cannot be regenerated and the API will return a clear conflict instead of breaking that history.

Existing overlapping duties from other active rosters or manually preserved duties can still cause blocking conflicts. Review the conflict report and current roster before retrying.

## Understand conflict results

Adding, editing, generating, and publishing run schedule validation. Conflict messages appear in the **Schedule validation** panel; failed writes also trigger a Sonner toast. Fix blocking issues before publishing.

| Result | Current rule | What to do |
| --- | --- | --- |
| **Blocking — invalid window** | Start is not before end, or the time window is invalid. | Correct the start/end values. |
| **Blocking — department ineligible** | Doctor is not an active member of the selected department. | Have an authorized admin restore/add the doctor's department membership, then retry. |
| **Blocking — double booked** | The doctor overlaps another proposed duty or an existing assignment. Checks include other rosters and departments for the same doctor. | Move or remove one of the overlapping duties. |
| **Blocking — doctor unavailable** | A dated availability period marks the doctor unavailable during the duty. | Change the duty time or update availability if it was entered incorrectly. |
| **Blocking — approved leave** | The local leave records show approved leave overlapping the duty. | Choose another doctor or time; resolve the leave through the leave workflow if its status is wrong. |
| **Warning — outside working hours** | Weekly hours exist for the doctor, but do not contain the whole duty on that local weekday. A duty spanning local dates also triggers this warning when hours are configured. | Adjust the duty or verify the doctor's working hours. A permitted role may publish with a documented override reason. |

If no weekly hours are configured for a doctor, the current validator does not emit an outside-hours warning. Approved leave is checked against EyeZen's local leave records; no external leave vendor is implied.

### Publishing with a warning

Only a Super Admin, Hospital Admin, or Department Head can override a warning. Enter an explanation of 10–1,000 characters in **Authorized warning override reason**, then choose **Validate & publish**. The reason and conflict set are saved in the audit log and publication snapshot.

Blocking conflicts can never be overridden. Roster Managers can publish a conflict-free draft, but cannot override warnings. A draft with no duties is currently allowed to publish; check the duty list before publishing if an empty revision is not intended.

## Publish and review revisions

1. Review all duties in the **Duties** tab, including doctor, local start/end, duty type, and exception note.
2. Resolve every blocking conflict. For any warning, either adjust the schedule or enter an authorized override reason.
3. Choose **Validate & publish** and wait for the result.
4. On success, EyeZen creates an immutable published revision. Doctors assigned to that roster receive a roster-published email event in the notification outbox; actual delivery depends on the configured email provider and worker.
5. Open **Revision history** to view revision numbers and publication timestamps. Full snapshot data is stored by the backend, but the current UI does not render it.

Published rosters cannot be edited. To change a published schedule, select it and choose **Create update draft**. EyeZen copies its duties and weekly patterns into a new draft. Remove a duty to cancel that slot, edit it to change its time, doctor, or type, or edit a weekly pattern and regenerate the relevant range to update recurring coverage. Review and publish the draft when ready. Publishing the update marks the previous roster **Superseded**, so doctors see only the active replacement schedule; the old publication and revision history remain available to roster staff.

Older rosters created before generated-duty tracking was added may contain duties whose source pattern cannot be identified. The update draft preserves those duties as manual for safety. Review and remove any old recurring occurrences you intend to replace. Tracked pattern-generated duties carry their pattern identity into the update draft and can be safely regenerated.

Doctors can see their own published assignments in **My schedule** for the next seven days. They cannot see department-wide drafts, other doctors' duties, or revision history.

## Common cases and recovery

- **No department selected:** choose one before creating or editing a roster.
- **No active doctors in the picker:** check doctor profiles and active department membership.
- **A draft disappeared or is no longer editable:** refresh the roster list; it may have been published or deleted by another user.
- **Generation reports a conflict:** no generated changes were committed. Fix the listed duties or availability and retry.
- **A toast reports a network failure:** the entered roster name remains available; check the frontend API connection and retry.
- **Publish is disabled:** a blocking issue exists, or a warning needs an authorized role and a valid override reason.
- **Roster email not received:** publication creates an outbox email event; inspect Notification delivery and verify email provider and worker health. A successful roster publication does not guarantee provider delivery.
- **More than 100 rosters exist:** the current workspace fetches the first 100 and does not expose roster-list pagination. Search/filter is not currently available in that panel.

## Current workflow boundaries

- The UI has no calendar drag-and-drop, shift swapping, bulk doctor assignment, bulk deletion, or rollback-to-revision action. Create update draft copies the current published schedule; it does not restore an arbitrary older revision.
- Recurrence supports one weekday and one local start/end window per pattern; overnight patterns are not supported.
- Working-hour mismatches are warnings; dated unavailability and approved leave are blocking.
- Published revision history is read-only. Creating a new draft and publishing it is the supported change path.
- The scheduling API requires authenticated, CSRF-protected writes and enforces department scope on the server.

## Implementation references

- Frontend: [`roster-workspace.tsx`](../components/rosters/roster-workspace.tsx)
- Backend scheduling routes: [`routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts)
- Conflict rules: [`conflicts.ts`](../../../EyeZen-Backend/src/scheduling/conflicts.ts)
- Role permissions: [`policy.ts`](../../../EyeZen-Backend/src/security/policy.ts)
- Frontend API integration inventory: [`api-integration.md`](api-integration.md)
