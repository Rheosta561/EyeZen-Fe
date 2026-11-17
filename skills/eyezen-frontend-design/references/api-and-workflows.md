# EyeZen frontend API and workflow inventory

This inventory describes the backend currently present in this repository.
Use it to decide which controls can be wired today. Check `/openapi.json` and
route source for request/response details before coding. All endpoints use
same-origin or credentialed JSON requests as deployed. Authenticated
mutations require the `eyezen_csrf` cookie value in `X-CSRF-Token`.

> Frontend handover verification (2026-11-17): this reference was copied from
> the backend design skill. The backend source has since added several APIs
> that are not reflected in this older inventory or in parts of
> `docs/frontend-implementation-plan.md`. Recheck the live backend source and
> OpenAPI before treating a listed gap as current. Confirmed additions include
> `GET /api/me/departments`, doctor-only `GET /api/me/roster-assignments`,
> own working-hours/availability reads and availability delete,
> `GET /api/departments/:departmentId/rosters`, department-scoped roster read
> and availability reads, leave and replacement queues (including a doctor
> replacement inbox), `GET /public/patient-doctor-change/:token`, and
> `GET /auth/admin/users` account search/list. The current role policy also
> includes `availability:manage:own` for doctors. Verify each response schema
> and any updated authorization before wiring it.

## Browser integration and deployment assumptions

- The API is not version-prefixed; staff resources are under `/api`, identity
  routes under `/auth`, and the patient decision flow under `/public`.
- The API sets HttpOnly access/refresh cookies and a JavaScript-readable CSRF
  cookie. On a different hostname, browser JavaScript cannot read the API's
  host-only CSRF cookie even when credentialed CORS is allowed. CORS alone
  does not solve this. Choose a same-origin Next.js proxy/BFF arrangement or
  add a deliberate backend CSRF bootstrap contract before implementing the
  login/mutation client. Never move access or refresh tokens into browser
  storage.
- Cross-site cookie deployment requires HTTPS and `COOKIE_SAME_SITE=None`;
  same-site deployments may use `Lax` or `Strict` according to navigation
  needs. Exact frontend origins are configured in `CORS_ORIGINS`.
- `HOSPITAL_TIME_ZONE` controls roster/working-hour interpretation and visible
  scheduling. `FRONTEND_ORIGIN` is used for invitation/reset links;
  `API_PUBLIC_ORIGIN` is used for patient decision links. Configure each for
  its own environment.
- Resend is an external email provider. A visible “sent” status must reflect
  API/outbox state, not an optimistic client mutation. SMS reminder delivery
  and external leave-system synchronization are unavailable.

## Authentication and account lifecycle

| Method | Path | UI trigger / behavior | Access |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | Sign in with username/email and password; cookies set | Public, rate limited |
| `POST` | `/auth/refresh` | Refresh session; rotate cookies | Refresh cookie + CSRF |
| `POST` | `/auth/logout` | Sign out current session | Authenticated + CSRF |
| `POST` | `/auth/logout-all` | Sign out all sessions; explain other sessions will stop | Authenticated + CSRF |
| `GET` | `/auth/me` | Bootstrap current role and department memberships | Authenticated |
| `GET` | `/api/me/departments` | Resolve active departments visible to the signed-in user | Authenticated; doctor memberships included |
| `GET` | `/auth/profile` | Read own doctor profile | Profile-read permission |
| `PATCH` | `/auth/profile` | Edit own display name/specialty | Profile-write permission + CSRF |
| `POST` | `/auth/password/change` | Change password; invalidates current sessions | Authenticated + CSRF |
| `POST` | `/auth/password/forgot` | Request reset; always show enumeration-safe response | Public, rate limited |
| `POST` | `/auth/password/reset` | Consume one-time reset token | Public token, rate limited |
| `POST` | `/auth/activate` | Set password for invited account | Public invitation token, rate limited |
| `POST` | `/auth/admin/users` | Create inactive account and send/queue invite | Account managers + CSRF |
| `GET` | `/auth/admin/users?q=&role=&departmentId=&active=&page=&pageSize=` | Search paginated account directory; credential/token fields excluded | Account managers; Hospital Admin cannot see Super Admin accounts |
| `POST` | `/auth/admin/users/:userId/invite` | Resend invitation to inactive account | Account managers + CSRF |
| `POST` | `/auth/admin/users/:userId/deactivate` | Deactivate account and revoke sessions | Account managers + CSRF; role assignment restrictions |
| `GET` | `/auth/departments/:departmentId/doctors` | Department doctor directory; doctor role receives own profile only | Roster-read + department scope |

There is no API to list/find accounts, manage roles independently, resend
password reset directly, or inspect audit events. The invite endpoint creates
an account, not an editable user record. Users should receive invite/reset
links by Resend in production; the browser must never display token secrets.

## Departments, doctors, hours, and availability

| Method | Path | UI trigger / behavior | Access |
| --- | --- | --- | --- |
| `GET` | `/api/departments` | List departments | Department managers |
| `POST` | `/api/departments` | Create department | Department managers + CSRF |
| `POST` | `/api/doctors/:doctorId/departments/:departmentId` | Add doctor to department | Department managers + CSRF |
| `PUT` | `/api/doctors/:doctorId/qualifications` | Replace qualification labels | Department managers + CSRF |
| `PUT` | `/api/departments/:departmentId/doctors/:doctorId/working-hours` | Replace weekly hours | Roster-write + department scope + CSRF |
| `POST` | `/api/departments/:departmentId/doctors/:doctorId/availability` | Add dated available/unavailable window | Roster-write + department scope + CSRF |
| `GET` | `/api/departments/:departmentId/doctors/:doctorId/working-hours` | Read department-scoped weekly hours | Roster-read + scope; doctors only see their own |
| `GET` | `/api/departments/:departmentId/doctors/:doctorId/availability?from=&through=` | Read department-scoped availability | Roster-read + scope; doctors only see their own |
| `GET` | `/api/me/working-hours?departmentId=` | Read own weekly hours | Doctor only; active membership required |
| `GET` | `/api/me/availability?departmentId=&from=&through=` | Read own dated availability | Doctor only; active membership required |
| `POST` | `/api/me/availability` | Add own dated availability/unavailability | Doctor only + CSRF; active membership required |
| `DELETE` | `/api/me/availability/:availabilityId` | Delete own availability entry | Doctor only + CSRF; ownership enforced |

Department edit/delete and doctor membership removal are not available. Hours
and availability reads plus doctor-owned availability create/delete are
available; weekly hours remain manager-controlled.

## Rosters and revisions

| Method | Path | UI trigger / behavior | Access |
| --- | --- | --- | --- |
| `POST` | `/api/departments/:departmentId/rosters` | Create draft roster | Roster-write + department scope + CSRF |
| `GET` | `/api/departments/:departmentId/rosters?status=&page=&pageSize=` | Paginated roster summaries | Roster-read + scope; doctors are denied department-wide lists |
| `GET` | `/api/me/roster-assignments?from=&through=&departmentId=` | Read own published assignments | Doctor only; assignments filtered server-side |
| `POST` | `/api/departments/:departmentId/rosters/:rosterId/templates` | Add recurring weekly template | Roster-write + department scope + CSRF |
| `POST` | `/api/departments/:departmentId/rosters/:rosterId/generate` | Generate assignments over bounded date range | Roster-write + department scope + CSRF |
| `POST` | `/api/departments/:departmentId/rosters/:rosterId/assignments` | Add dated duty | Roster-write + department scope + CSRF |
| `PATCH` | `/api/departments/:departmentId/rosters/:rosterId/assignments/:assignmentId` | Edit draft assignment/exception | Roster-write + department scope + CSRF |
| `DELETE` | `/api/departments/:departmentId/rosters/:rosterId/assignments/:assignmentId` | Delete draft assignment | Roster-write + department scope + CSRF |
| `GET` | `/api/departments/:departmentId/rosters/:rosterId` | Read roster, assignments, and templates | Roster-read + scope; doctor role denied |
| `POST` | `/api/departments/:departmentId/rosters/:rosterId/publish` | Validate and publish; warnings may require authorized reason | Roster-publish + department scope + CSRF |
| `GET` | `/api/departments/:departmentId/rosters/:rosterId/revisions` | Read immutable published snapshots | Roster-read + department scope |

Roster types are in-person and teleconsultation. Generation is bounded by
`ROSTER_MAX_HORIZON_DAYS` (default 366). Conflict states include invalid
windows, inactive department membership, overlap, unavailability, approved
leave, and an outside-working-hours warning. Blocking conflicts cannot be
overridden. Published rosters are immutable; create another draft for a new
revision. Doctor-facing schedule data uses the own-assignment endpoint.
Department-wide roster details and revision snapshots are restricted to
non-doctor roster roles.

## Leave and replacement

| Method | Path | UI trigger / behavior | Access |
| --- | --- | --- | --- |
| `POST` | `/api/leave-requests` | Doctor submits leave for one active department | `leave:request` + CSRF |
| `GET` | `/api/me/leave-requests` | Read own leave requests and status history | Doctor only |
| `GET` | `/api/departments/:departmentId/leave-requests?status=PENDING` | Review leave requests and history | `leave:approve` + department scope |
| `POST` | `/api/departments/:departmentId/leave-requests/:leaveId/decision` | Approve/reject with reason | `leave:approve` + department scope + CSRF |
| `GET` | `/api/departments/:departmentId/replacements/candidates?assignmentId=...` | Find eligible replacement doctors | `rosters:write` + department scope |
| `GET` | `/api/departments/:departmentId/replacements?status=&assignmentId=&page=&pageSize=` | Read department replacement queue | `rosters:write` + department scope |
| `GET` | `/api/departments/:departmentId/replacements/:replacementId` | Read one scoped workflow and history | `rosters:write` + department scope |
| `GET` | `/api/me/replacements?page=&pageSize=` | Read proposals addressed to the signed-in doctor | Doctor only |
| `POST` | `/api/departments/:departmentId/replacements` | Propose doctor, optionally linked to approved leave | `rosters:write` + department scope + CSRF |
| `POST` | `/api/departments/:departmentId/replacements/:replacementId/approval` | Department Head approves/rejects with reason | Department Head + department scope + CSRF |
| `POST` | `/api/replacements/:replacementId/response` | Proposed doctor accepts/rejects | `replacement:respond` + CSRF; proposed doctor only |
| `POST` | `/api/departments/:departmentId/replacements/:replacementId/restore` | Restore original doctor after conflict revalidation | `rosters:write` + department scope + CSRF |
| `POST` | `/public/patient-doctor-change/:token` | Patient confirms or prefers original doctor | Public expiring token |
| `GET` | `/public/patient-doctor-change/:token` | Load safe decision details and current state | Public expiring token; omits patient identity and disables caching |

Show a replacement as a multi-party state machine: proposal, Department Head
decision, proposed doctor response, roster update, per-appointment patient
decision, and optional restoration. An assignment may finalize before each
appointment changes; patient confirmation is the appointment change gate.
Patient preference for original doctor records an alternative slot offer when
one can be found. It is not a booking. Token lifetime is 72 hours.

The leave source is local PostgreSQL. Do not claim external leave-vendor sync.

## Appointments

| Method | Path | UI trigger / behavior | Access |
| --- | --- | --- | --- |
| `POST` | `/api/departments/:departmentId/appointments` | Create pending appointment; validate published roster/capacity | `appointments:write` + department scope + CSRF |
| `POST` | `/api/departments/:departmentId/appointments/:appointmentId/confirm` | Revalidate and confirm | `appointments:write` + department scope + CSRF |
| `PATCH` | `/api/departments/:departmentId/appointments/:appointmentId/reschedule` | Reschedule with validation and history | `appointments:write` + department scope + CSRF |
| `POST` | `/api/departments/:departmentId/appointments/:appointmentId/cancel` | Cancel with reason | `appointments:write` + department scope + CSRF |
| `GET` | `/api/departments/:departmentId/appointments` | Read appointment list | `appointments:read` + department scope |

Appointment status is pending, confirmed, or cancelled. Creates and changes
check published coverage, membership, working hours, availability, approved
leave, and overlap. Doctors are restricted to their own appointments and have
phone removed from API output. `SUPER_ADMIN`, `HOSPITAL_ADMIN`,
`DEPARTMENT_HEAD`, and `RECEPTION_FRONT_DESK` may receive patient phone in
scoped appointment lists. Confirm UI access matches those backend rules.

Surgery reminders are persisted as placeholders and not delivered. Do not
show a “reminder sent” state or offer an SMS provider setting that the API
does not have.

## Notification operations

| Method | Path | UI trigger / behavior | Access |
| --- | --- | --- | --- |
| `GET` | `/api/admin/notifications?status=...&limit=...` | Inspect event status, timestamps, attempts, and error (payloads omitted) | `notifications:manage` |
| `POST` | `/api/admin/notifications/:eventId/retry` | Retry failed/retryable event | `notifications:manage` + CSRF |

Only `SUPER_ADMIN` and `HOSPITAL_ADMIN` have notification management. Email
events can be queued, processing, retryable, failed, or sent. “Sent” means
Resend accepted the provider request. Local SMS events are `LOCAL_ONLY`; due
reminder events are `SKIPPED_PLACEHOLDER`. The API has no delivery configuration
screen or raw payload view.

## Infrastructure endpoints (not app navigation)

| Method | Path | Use |
| --- | --- | --- |
| `GET` | `/health` | Container/process health check |
| `GET` | `/ready` | Database readiness check |
| `GET` | `/openapi.json` | API contract |
| `GET` | `/docs` | API documentation landing page |

These are operational diagnostics or contract docs, not staff dashboard
features.
