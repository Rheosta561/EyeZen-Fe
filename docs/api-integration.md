# EyeZen frontend API integration

This document maps the current frontend screens to the backend APIs they call and records what is connected today. It reflects the code in this repository, not every endpoint available on the backend. Backend permissions remain authoritative; a screen being linked in navigation does not grant API access.

For step-by-step roster operation, supported scheduling cases, conflict rules, and current limitations, see the [roster scheduling guide](roster-scheduling-guide.md).

## Workflow coverage update (2026-11-17)

The staff UI now wires the available write workflows for appointments, doctor-owned availability, department-scoped doctor working hours and availability, replacement proposals and decisions, department creation, doctor membership and qualifications, account search/filter/pagination, and doctor profile editing. Appointment and leave `datetime-local` inputs are converted using `HOSPITAL_TIME_ZONE`. Appointment writers can load the doctor picker through the department-scoped directory endpoint; that read still returns only doctor display name, specialty, and profile ID and does not grant roster access. Backend endpoints that do not exist remain unavailable in the UI: department edit/delete, department membership removal, and manager deletion of a dated availability entry.

## Request path and authentication

Browser requests made with `apiFetch()` go to the same-origin Next.js route `/api/backend/...`. The route in `app/api/backend/[...path]/route.ts` forwards the request to `EYEZEN_API_ORIGIN`, carries only the EyeZen access, refresh, and CSRF cookies upstream, forwards mutation CSRF headers, and disables caching. Set `EYEZEN_API_ORIGIN` to the backend origin for the frontend deployment. If it is missing the proxy returns 503; if the backend cannot be reached it returns 502.

For writes, `apiFetch()` reads `eyezen_csrf` and sends it as `X-CSRF-Token`, except for the public auth endpoints that do not use the signed-in session. On a 401 it attempts one shared refresh through `/auth/refresh`, then retries the original request. Login, refresh, logout, logout-all, and `/public/` calls do not trigger that retry. Access and refresh credentials stay in HTTP cookies; do not move them into browser storage.

Patient decision pages use server-side requests to `EYEZEN_API_ORIGIN` rather than the browser API client. Their read is no-store, and the form posts to a local Next.js route which validates the decision and forwards it to the public backend endpoint.

## Connected screens

| Screen / user task | API calls wired in this frontend | What the UI currently does |
| --- | --- | --- |
| Sign in | `POST /auth/login`, then `GET /auth/me` | Login posts username and password; successful login navigates to Overview. `/auth/me` bootstraps the current user and role. |
| Activate account / forgot password / reset password | `POST /auth/activate`, `POST /auth/password/forgot`, `POST /auth/password/reset` | Posts the invitation/reset token and password or email. Forgot-password confirmation is enumeration-safe in the UI. |
| Sign out / security settings | `POST /auth/logout`, `POST /auth/logout-all`, `POST /auth/password/change` | Ends current/all sessions or changes password. Logout-all clears the client query cache. |
| Department context | `GET /api/me/departments` | Loads the signed-in user's departments for the selector and invitation form. Non-hospital-wide users default to a saved department or their first membership. |
| My schedule (doctor) | `GET /api/me/roster-assignments?from=&through=&departmentId=` | Reads the next seven days of the doctor's own published assignments. Department is optional. |
| Availability (doctor) | `GET /api/me/availability?departmentId=&from=&through=`, then `GET /api/me/working-hours?departmentId=` | Displays a 90-day dated availability window combined with weekly hours. Doctors can add and delete dated availability; weekly hours remain read-only to doctors. Roster staff can read and replace scoped weekly hours and add scoped doctor availability. |
| Leave (doctor) | `GET /api/me/leave-requests`, `POST /api/leave-requests` | Shows own requests and submits department, start/end, category, and optional notes. |
| Leave review (eligible department staff) | `GET /api/departments/:departmentId/leave-requests?status=`, `POST /api/departments/:departmentId/leave-requests/:leaveId/decision` | Lists a selected status (Pending, Approved, Rejected); pending requests can be approved/rejected with a reason. |
| Replacement inbox (doctor) | `GET /api/me/replacements?page=1&pageSize=25` | Lists proposals addressed to the signed-in doctor. Doctors can accept or decline proposals, with an optional response reason. |
| Replacement queue (department staff) | `GET /api/departments/:departmentId/replacements?page=1&pageSize=25` | Displays queue records. The UI supports candidate search, proposal, Department Head decision, doctor response, workflow details, and restoration. Patient decisions remain on the public token page. |
| Appointments | `GET /api/departments/:departmentId/appointments` | Displays the department appointment list within the backend's role scope. Appointment writers can create, confirm, reschedule, and cancel; all changes use the selected department scope. |
| Rosters | `GET /api/departments/:departmentId/rosters?page=1&pageSize=100`; draft CRUD, update-draft, template CRUD, assignment CRUD, generation, publication, and revision routes listed below | Wired for roster staff: create/read/rename/delete drafts, copy a published roster into an update draft, manage weekly patterns and dated duties, safely regenerate tracked pattern duties, review conflicts, publish, and inspect revisions. Publishing an update supersedes its source publication. Doctors use My schedule. |
| Doctor directory | `GET /auth/departments/:departmentId/doctors` | Displays doctors in the selected department for roles shown the navigation entry. |
| Departments | `GET /api/departments` | Displays department records for users with department-management permission. Department creation is wired. Edit and delete routes are not available in the backend. |
| Account directory | `GET /auth/admin/users?page=1&pageSize=25` | Displays account records for account managers. Resend invitation calls `POST /auth/admin/users/:userId/invite`; deactivate calls `POST /auth/admin/users/:userId/deactivate` after browser confirmation. Search, role/status/department filters, and pagination are wired. |
| Invite staff | `GET /api/me/departments`, `POST /auth/admin/users` | Creates an inactive account/invitation with email, role, optional username, and optional doctor details; department roles include one selected department. UI reports backend delivery status. |
| Notification delivery | `GET /api/admin/notifications?limit=50`, `POST /api/admin/notifications/:eventId/retry` | Shows event status and retries events marked `FAILED` or `RETRYABLE`. It does not configure delivery or show raw payloads. |
| Profile / account | `GET /auth/me`, plus password settings above | Displays the current identity and account role; doctor profile editing is wired for doctor accounts. |
| Patient doctor-change link | Server `GET /public/patient-doctor-change/:token`; local form `POST /api/patient-decision/:token` forwards `POST /public/patient-doctor-change/:token` | Loads safe, no-cache decision details and lets a patient confirm the proposed doctor or prefer the original. It requires no patient account. |

## API calls that are not currently represented by a UI action

The backend inventory in `skills/eyezen-frontend-design/references/api-and-workflows.md` remains the source for role/scope context. The API route index below records which existing routes now have UI requests; department edit/delete, membership removal, manager-side availability deletion, and infrastructure routes have no staff UI action because the backend does not expose those operations as staff workflows.

## Complete backend route index

The routes below were checked against the backend route handlers and its OpenAPI definition. “Wired” means a matching frontend request exists; it does not mean the endpoint has been exercised against a running backend. Backend source links open the route handler file in the sibling `EyeZen-Backend` repository. The frontend proxy prefix `/api/backend` is omitted from API paths because it is stripped before forwarding.

### Health and contract

| Backend route | Purpose | Frontend status | Backend source |
| --- | --- | --- | --- |
| `GET /health` | Process health | Not used by app UI (operations only) | [`src/app.ts`](../../../EyeZen-Backend/src/app.ts) |
| `GET /ready` | Database readiness | Not used by app UI (operations only) | [`src/app.ts`](../../../EyeZen-Backend/src/app.ts) |
| `GET /openapi.json` | Machine-readable API contract | Not used by app UI | [`src/openapi.ts`](../../../EyeZen-Backend/src/openapi.ts) |
| `GET /docs` | API documentation landing page | Not used by app UI | [`src/app.ts`](../../../EyeZen-Backend/src/app.ts) |

### Authentication and accounts

| Backend route | Purpose | Frontend status | Backend source |
| --- | --- | --- | --- |
| `POST /auth/login` | Create session | Wired: sign-in form | [`src/security/auth-routes.ts`](../../../EyeZen-Backend/src/security/auth-routes.ts) |
| `POST /auth/refresh` | Rotate refresh session | Wired: automatic after eligible 401s | [`src/security/auth-routes.ts`](../../../EyeZen-Backend/src/security/auth-routes.ts) |
| `POST /auth/logout` | Revoke current session | Wired: Sign out | [`src/security/auth-routes.ts`](../../../EyeZen-Backend/src/security/auth-routes.ts) |
| `POST /auth/logout-all` | Revoke all sessions | Wired: account security | [`src/security/auth-routes.ts`](../../../EyeZen-Backend/src/security/auth-routes.ts) |
| `GET /auth/me` | Read signed-in identity | Wired: session bootstrap, overview/profile display | [`src/security/auth-routes.ts`](../../../EyeZen-Backend/src/security/auth-routes.ts) |
| `GET /auth/profile` | Read own editable profile | Backend only; UI reads `/auth/me` instead | [`src/security/auth-routes.ts`](../../../EyeZen-Backend/src/security/auth-routes.ts) |
| `PATCH /auth/profile` | Update own profile | Wired: doctor profile editor | [`src/security/auth-routes.ts`](../../../EyeZen-Backend/src/security/auth-routes.ts) |
| `POST /auth/password/change` | Change password | Wired: account security | [`src/security/auth-routes.ts`](../../../EyeZen-Backend/src/security/auth-routes.ts) |
| `POST /auth/password/forgot` | Request reset, enumeration-safe | Wired: forgot password | [`src/security/auth-routes.ts`](../../../EyeZen-Backend/src/security/auth-routes.ts) |
| `POST /auth/password/reset` | Consume reset token | Wired: reset password | [`src/security/auth-routes.ts`](../../../EyeZen-Backend/src/security/auth-routes.ts) |
| `POST /auth/activate` | Activate invited account | Wired: activation form | [`src/security/auth-routes.ts`](../../../EyeZen-Backend/src/security/auth-routes.ts) |
| `GET /auth/admin/users` | Search/page safe account directory | Wired: search, role/status/department filters, and pagination | [`src/security/auth-routes.ts`](../../../EyeZen-Backend/src/security/auth-routes.ts) |
| `POST /auth/admin/users` | Create account and invitation | Wired: Invite staff form | [`src/security/auth-routes.ts`](../../../EyeZen-Backend/src/security/auth-routes.ts) |
| `POST /auth/admin/users/:userId/invite` | Resend invitation | Wired: inactive account action | [`src/security/auth-routes.ts`](../../../EyeZen-Backend/src/security/auth-routes.ts) |
| `POST /auth/admin/users/:userId/deactivate` | Deactivate and revoke sessions | Wired: active account action | [`src/security/auth-routes.ts`](../../../EyeZen-Backend/src/security/auth-routes.ts) |

### Departments, doctors, hours, and availability

| Backend route | Purpose | Frontend status | Backend source |
| --- | --- | --- | --- |
| `GET /api/me/departments` | Departments available to current user | Wired: department selector and invite form | [`src/app.ts`](../../../EyeZen-Backend/src/app.ts) |
| `GET /auth/departments/:departmentId/doctors` | Department doctor directory, including user ID and doctor profile ID | Wired: Doctor directory and roster doctor pickers use the profile ID required by roster write routes | [`src/security/auth-routes.ts`](../../../EyeZen-Backend/src/security/auth-routes.ts) |
| `GET /api/departments` | List departments | Wired: Departments display | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `POST /api/departments` | Create department | Wired: department form | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `POST /api/doctors/:doctorId/departments/:departmentId` | Add doctor membership | Wired: department doctor settings | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `PUT /api/doctors/:doctorId/qualifications` | Replace doctor qualifications | Wired: current qualifications and replacement editor | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `GET /api/me/working-hours?departmentId=` | Read own weekly hours | Wired: Availability display | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `GET /api/me/availability?departmentId=&from=&through=` | Read own dated availability | Wired: Availability display | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `POST /api/me/availability` | Add own dated availability | Wired: doctor availability form | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `DELETE /api/me/availability/:availabilityId` | Delete own availability | Wired: delete dated availability action | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `GET /api/departments/:departmentId/doctors/:doctorId/working-hours` | Read scoped doctor's weekly hours | Wired: doctor directory settings | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `PUT /api/departments/:departmentId/doctors/:doctorId/working-hours` | Set scoped doctor's weekly hours | Wired: doctor directory settings | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `GET /api/departments/:departmentId/doctors/:doctorId/availability?from=&through=` | Read scoped doctor's dated availability | Wired: doctor directory settings | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `POST /api/departments/:departmentId/doctors/:doctorId/availability` | Add scoped doctor's availability | Wired: doctor directory form | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |

### Rosters

| Backend route | Purpose | Frontend status | Backend source |
| --- | --- | --- | --- |
| `GET /api/me/roster-assignments?from=&through=&departmentId=` | Read doctor's own published assignments | Wired: My schedule | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `GET /api/departments/:departmentId/rosters?status=&page=&pageSize=` | List department rosters | Wired: first 100 summaries | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `POST /api/departments/:departmentId/rosters` | Create draft roster | Wired: Create draft | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `POST /api/departments/:departmentId/rosters/:rosterId/update-draft` | Copy a published roster into an update draft | Wired: Create update draft from a selected publication | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `GET /api/departments/:departmentId/rosters/:rosterId` | Read roster assignments/templates | Wired: select a roster for details | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `PATCH /api/departments/:departmentId/rosters/:rosterId` | Rename draft roster | Wired: Rename action; drafts only | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `DELETE /api/departments/:departmentId/rosters/:rosterId` | Delete draft roster, its assignments, and weekly patterns | Wired: Delete draft action with confirmation; rejected when replacement history is linked | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `POST /api/departments/:departmentId/rosters/:rosterId/templates` | Add recurring template | Wired: Add weekly pattern | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `PATCH /api/departments/:departmentId/rosters/:rosterId/templates/:templateId` | Update weekly template fields | Wired: Edit weekly pattern; drafts only | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `DELETE /api/departments/:departmentId/rosters/:rosterId/templates/:templateId` | Delete weekly template | Wired: Delete weekly pattern with confirmation; rejected when replacement history is linked | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `POST /api/departments/:departmentId/rosters/:rosterId/generate` | Generate assignments from templates | Wired: reconcile pattern-generated duties in range; manual duties are preserved | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `POST /api/departments/:departmentId/rosters/:rosterId/assignments` | Add dated duty | Wired: Add duty and show validation conflicts | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `PATCH /api/departments/:departmentId/rosters/:rosterId/assignments/:assignmentId` | Edit draft duty | Wired: Edit and revalidate duty | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `DELETE /api/departments/:departmentId/rosters/:rosterId/assignments/:assignmentId` | Delete draft duty | Wired: Delete draft duty | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `GET /api/departments/:departmentId/rosters/:rosterId/available-doctors?startsAt=&endsAt=&excludeAssignmentId=` | Check active department doctors for a proposed duty window | Wired: search all or filter to available doctors in the duty picker; edit mode excludes the current duty | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `POST /api/departments/:departmentId/rosters/:rosterId/publish` | Validate and publish roster | Wired: conflict-gated publish with authorized warning reason | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |
| `GET /api/departments/:departmentId/rosters/:rosterId/revisions` | List immutable published revisions | Wired: Revision history tab | [`src/scheduling/routes.ts`](../../../EyeZen-Backend/src/scheduling/routes.ts) |

### Leave and replacement

| Backend route | Purpose | Frontend status | Backend source |
| --- | --- | --- | --- |
| `POST /api/leave-requests` | Submit doctor's leave request | Wired: New leave request | [`src/leave/routes.ts`](../../../EyeZen-Backend/src/leave/routes.ts) |
| `GET /api/me/leave-requests` | Read own requests and history | Wired: Leave screen for doctors | [`src/leave/routes.ts`](../../../EyeZen-Backend/src/leave/routes.ts) |
| `GET /api/departments/:departmentId/leave-requests?status=` | Read department leave queue | Wired: selected status filter | [`src/leave/routes.ts`](../../../EyeZen-Backend/src/leave/routes.ts) |
| `POST /api/departments/:departmentId/leave-requests/:leaveId/decision` | Approve/reject with reason | Wired: pending queue actions | [`src/leave/routes.ts`](../../../EyeZen-Backend/src/leave/routes.ts) |
| `GET /api/me/replacements?page=&pageSize=` | Read doctor's replacement inbox | Wired: inbox and accept/reject actions | [`src/replacements/routes.ts`](../../../EyeZen-Backend/src/replacements/routes.ts) |
| `GET /api/departments/:departmentId/replacements?status=&assignmentId=&page=&pageSize=` | Read department replacement queue | Wired: queue and workflow controls | [`src/replacements/routes.ts`](../../../EyeZen-Backend/src/replacements/routes.ts) |
| `GET /api/departments/:departmentId/replacements/candidates?assignmentId=` | Find eligible replacement doctors | Wired: eligible candidate selector | [`src/replacements/routes.ts`](../../../EyeZen-Backend/src/replacements/routes.ts) |
| `GET /api/departments/:departmentId/replacements/:replacementId` | Read workflow details/history | Wired: replacement details view | [`src/replacements/routes.ts`](../../../EyeZen-Backend/src/replacements/routes.ts) |
| `POST /api/departments/:departmentId/replacements` | Propose replacement | Wired: propose replacement action | [`src/replacements/routes.ts`](../../../EyeZen-Backend/src/replacements/routes.ts) |
| `POST /api/departments/:departmentId/replacements/:replacementId/approval` | Department Head approval/rejection | Wired: reasoned decision controls | [`src/replacements/routes.ts`](../../../EyeZen-Backend/src/replacements/routes.ts) |
| `POST /api/replacements/:replacementId/response` | Proposed doctor's accept/reject response | Wired: inbox response controls | [`src/replacements/routes.ts`](../../../EyeZen-Backend/src/replacements/routes.ts) |
| `POST /api/departments/:departmentId/replacements/:replacementId/restore` | Restore original doctor after revalidation | Wired: confirmed restore action | [`src/replacements/routes.ts`](../../../EyeZen-Backend/src/replacements/routes.ts) |
| `GET /public/patient-doctor-change/:token` | Read safe patient decision details | Wired: server-rendered patient decision page | [`src/replacements/routes.ts`](../../../EyeZen-Backend/src/replacements/routes.ts) |
| `POST /public/patient-doctor-change/:token` | Record patient decision | Wired: local form proxy forwards this request | [`src/replacements/routes.ts`](../../../EyeZen-Backend/src/replacements/routes.ts) |

### Appointments and notifications

| Backend route | Purpose | Frontend status | Backend source |
| --- | --- | --- | --- |
| `GET /api/departments/:departmentId/appointments` | Read department appointments | Wired: scoped list and actions | [`src/appointments/routes.ts`](../../../EyeZen-Backend/src/appointments/routes.ts) |
| `POST /api/departments/:departmentId/appointments` | Create pending appointment | Wired: create form | [`src/appointments/routes.ts`](../../../EyeZen-Backend/src/appointments/routes.ts) |
| `POST /api/departments/:departmentId/appointments/:appointmentId/confirm` | Confirm appointment | Wired: pending appointment action | [`src/appointments/routes.ts`](../../../EyeZen-Backend/src/appointments/routes.ts) |
| `PATCH /api/departments/:departmentId/appointments/:appointmentId/reschedule` | Reschedule appointment | Wired: validated reschedule form | [`src/appointments/routes.ts`](../../../EyeZen-Backend/src/appointments/routes.ts) |
| `POST /api/departments/:departmentId/appointments/:appointmentId/cancel` | Cancel appointment | Wired: reasoned cancel action | [`src/appointments/routes.ts`](../../../EyeZen-Backend/src/appointments/routes.ts) |
| `GET /api/admin/notifications?status=&limit=` | Inspect notification delivery state | Wired: first 50 events | [`src/notifications/routes.ts`](../../../EyeZen-Backend/src/notifications/routes.ts) |
| `POST /api/admin/notifications/:eventId/retry` | Retry failed/retryable event | Wired: eligible event action | [`src/notifications/routes.ts`](../../../EyeZen-Backend/src/notifications/routes.ts) |

For full schemas and permission rules, see the backend's [`src/openapi.ts`](../../../EyeZen-Backend/src/openapi.ts), [API guide](../../../EyeZen-Backend/docs/api.md), and source handler files linked above. The doctor directory now includes `doctorProfileId` because roster authoring APIs accept profile IDs, while the directory's existing `id` is the account/user ID.

## Verification notes and known integration risks

- The shared browser client and proxy consistently use same-origin requests, include CSRF on authenticated mutations, and mark responses no-store. Patient flow requests are also no-store.
- The frontend statically composes routes and response fields; this review did not have a configured live backend origin or OpenAPI response to validate actual deployed payload compatibility. Runtime connectivity and each backend permission therefore remain unverified.
- `extractRows()` expects particular collection names (`items`, `assignments`, `requests`, `availability`, `events`, `doctors`, `departments`). Confirm these against the deployed API's OpenAPI contract. A successful response with a different collection key will appear as an empty state.
- Department edit/delete, membership removal, and manager-side availability deletion do not have backend routes and therefore have no UI actions.
- The client refresh retry reuses the original `RequestInit`. If a mutation receives 401 after the server has consumed its body, retry behavior should be confirmed for the deployed browser/runtime; JSON string bodies used by current forms are replayable.
- Account listing supports 25-record pages with search and role, status, and department filters. Notification listing is capped at 50 with no status filter control.

## Source map

- API client and session refresh: `lib/api/client.ts`
- Same-origin backend proxy: `app/api/backend/[...path]/route.ts`
- Current-user bootstrap and role gates: `lib/auth/use-current-user.ts`, `lib/auth/permissions.ts`
- Workspace GET routing and display/actions: `components/workspace-area.tsx`
- Auth forms: `components/auth-form.tsx`
- Invitations: `components/admin/invite-form.tsx`
- Leave forms and decisions: `components/workflows/leave-workflow.tsx`
- Patient decision proxy and page: `app/api/patient-decision/[token]/route.ts`, `app/(public)/patient-doctor-change/[token]/page.tsx`
- Backend endpoint inventory: `skills/eyezen-frontend-design/references/api-and-workflows.md`
