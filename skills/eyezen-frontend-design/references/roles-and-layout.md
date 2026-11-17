# EyeZen roles, scopes, and layout map

Use this as the product model for every page, route, navigation item, and
action. The backend is authoritative; confirm changes in
`src/security/policy.ts`, `src/security/middleware.ts`, and the current
OpenAPI document before implementing.

## Product boundary and shared scope

- One hospital installation. Departments are the operational scheduling and
  access boundary. There are no clinics, tenants, multi-hospital switching,
  or patient login accounts.
- `SUPER_ADMIN` and `HOSPITAL_ADMIN` have hospital-wide department scope.
  Other roles are scoped to their assigned department memberships.
- Do not invent department CRUD beyond what the API exposes. Department list
  and create are available only with `departments:manage`; account records
  carry memberships. A paginated safe account directory is available to account
  managers; department edit/delete is not available.
- Do not expose phone numbers to doctors. The appointment API returns phone
  only to `SUPER_ADMIN`, `HOSPITAL_ADMIN`, `DEPARTMENT_HEAD`, and
  `RECEPTION_FRONT_DESK`.
- Patient doctor-change links are public, one-time decisions with a 72-hour
  expiry; they are not patient accounts. Provide a dedicated, minimal public
  response page for a valid link, expired link, already-used link, and
  unavailable link.
- No real SMS or reminder delivery exists. Use neutral queued/local-only or
  skipped states; never label these as sent. External leave-vendor
  synchronization is not configured.
- Scheduling timestamps are instants with explicit offsets. Weekly hours and
  recurrence are interpreted in `HOSPITAL_TIME_ZONE` (default UTC). Display
  the hospital-local time consistently and make the timezone discoverable.

## Role matrix

| Role | Effective scope | Core UI areas | Available actions |
| --- | --- | --- | --- |
| `SUPER_ADMIN` | Hospital-wide | Overview, accounts, departments, rosters, leave, appointments, notification delivery, own account | Invite/deactivate accounts subject to role rules; manage departments and doctor qualifications/memberships; roster operations; leave decisions; appointment operations; inspect/retry notifications |
| `HOSPITAL_ADMIN` | Hospital-wide | Same operational areas as Super Admin, without Super Admin role control | Same broad operations; cannot assign or deactivate `SUPER_ADMIN` |
| `ROSTER_MANAGER` | Assigned departments | Roster calendar/editor, doctor directory, availability, appointments, own account | Create/edit drafts, set hours/availability, generate/publish rosters, read appointments; no account/dept management, leave decisions, or notification administration |
| `DEPARTMENT_HEAD` | Assigned departments | Roster calendar/editor, leave queue, replacement workflow, appointments, own account | Roster operations, approve/reject leave, approve/reject replacement proposals, review appointments; no account/dept management or notification administration |
| `DOCTOR` | Own profile and assigned departments | My schedule, my appointments, availability/working context, leave requests, replacement responses, own profile | Read own roster/appointments, edit own profile, request leave, respond to a replacement proposal; no patient phone visibility, no admin actions |
| `RECEPTION_FRONT_DESK` | Assigned departments | Appointment desk, own operational session | Create/confirm/reschedule/cancel appointments and read scoped appointment list; may see patient phone; no roster, accounts, leave, replacement, or department management |

Role permissions from the current backend:

| Permission | Super Admin | Hospital Admin | Roster Manager | Department Head | Doctor | Front Desk |
| --- | --- | --- | --- | --- | --- | --- |
| `accounts:manage` | Yes | Yes, excludes Super Admin target | — | — | — | — |
| `departments:manage` | Yes | Yes | — | — | — | — |
| `rosters:read` | Yes | Yes | Yes | Yes | Yes | — |
| `rosters:write` | Yes | Yes | Yes | Yes | — | — |
| `rosters:publish` | Yes | Yes | Yes | Yes | — | — |
| `leave:approve` | Yes | Yes | — | Yes | — | — |
| `appointments:read` | Yes | Yes | Yes | Yes | Yes, own doctor only | Yes |
| `appointments:write` | Yes | Yes | — | — | — | Yes |
| `profile:read:own` | Yes | Yes | Yes | Yes | Yes | — |
| `profile:write:own` | Yes | Yes | — | — | Yes | — |
| `leave:request` | Yes | Yes | — | — | Yes | — |
| `replacement:respond` | Yes | Yes | — | — | Yes, proposed doctor only | — |
| `notifications:manage` | Yes | Yes | — | — | — | — |

“Yes” still requires the backend department-scope check for scoped APIs.
Hospital-wide roles bypass department membership checks. Client visibility
must not broaden the authenticated API's scope.

## Information architecture and responsive shell

Use a role-adaptive shell rather than six disconnected apps:

- **Desktop:** fixed, collapsible left sidebar with the `EYEZEN` wordmark;
  role-filtered primary navigation; current department selector only when
  the user has multiple memberships; compact top bar for page title, date or
  contextual actions, theme, and account menu; main content in a readable
  centered area.
- **Tablet:** compact icon-and-label sidebar or accessible drawer; preserve
  critical schedule and queue context. Do not turn a dense desktop table into
  a tiny scaled table.
- **Mobile:** drawer or compact top-level navigation; use stacked list rows,
  horizontally scrollable calendar lanes only when necessary, sticky primary
  action for focused tasks, and full-width dialogs/sheets. Keep role and
  department context visible on all task screens.
- Keep one primary action per view. Secondary and destructive actions live in
  predictable menus or dialogs; publishing, approving/rejecting, deactivation,
  cancellation, and restoration require a review/confirmation state.
- Include loading, empty, partial-data, permission-denied, validation,
  conflict, stale-session, expired-token, provider-failure, and retry states.
  Preserve user-entered values after recoverable failures.

## Role-oriented page map

### Shared authentication and account

- Login with username/email and password; account activation; forgot/reset
  password; current-user identity and department context; profile read/edit
  where allowed; password change; logout/logout-all.
- Account managers can list/search accounts, invite and resend invitations,
  and deactivate accounts. Hospital Admins cannot see Super Admin accounts;
  account responses omit credentials and token data. Deactivation is
  consequential and requires confirmation.
- Access/refresh cookies are HttpOnly. Never read, display, or persist tokens
  in browser storage. Mutations use the non-HttpOnly `eyezen_csrf` cookie value
  in `X-CSRF-Token`.

### Super Admin and Hospital Admin

- Admin overview can link to the areas they can actually operate: account
  invitation/deactivation, department list/create, doctor association and
  qualifications, roster operations, leave decisions, appointment operations,
  and notification inspection/retry.
- Show an explicit scope badge (“All departments”) and department context in
  filterable views. Preserve Super Admin role protections in all invitation
  forms and confirmations.
- There is no analytics, audit-log browsing, department edit/archive,
  user-list, or hospital-settings API in this backend; avoid fake dashboard
  numbers or nonfunctional admin controls.

### Roster Manager

- Department roster list, draft builder, recurrence templates, calendar/list
  of assignments, conflict review, publish confirmation, and immutable
  revision history.
- Doctor directory is department scoped. Manage doctor memberships and
  qualifications only for hospital admins; Roster Manager can set working
  hours and dated availability through roster-write APIs.
- Editing/deletion only applies to draft assignments. Published revisions
  are immutable; later changes use a new draft.
- Conflict display distinguishes blocking issues from overridable warnings.
  Only permitted roles may publish with a reason; never offer an override for
  blocking issues.

### Department Head

- Include Roster Manager roster views plus a leave-review queue and replacement
  approval workflow.
- Leave decisions require Approve or Reject and a reason. Replacement path is
  proposal → Department Head review → proposed doctor response → finalized
  assignment; restoration revalidates conflicts. Surface every status and
  pending party without implying that an appointment changed before patient
  confirmation.
- Department Head can review appointments and patient contacts, but has no
  account-management or notification-retry permission.

### Doctor

- “My schedule” uses the server-filtered published-assignment endpoint.
  Doctors are denied department-wide roster lists, roster details, and revision
  snapshots. Appointment lists remain personal and omit patient phone numbers.
- Show own appointments without phone numbers. Provide own profile update,
  leave request, and replacement response (only when the signed-in doctor is
  the proposed doctor).
- Doctors can read their own weekly hours and manage their own dated
  availability. Weekly working hours remain manager-controlled.

### Reception Front Desk

- Appointment queue/list and create, confirm, reschedule, cancel workflows.
- Keep patient contact visible only inside appropriately scoped operational
  contexts. Avoid adding roster or staff administration screens.

### Public patient decision

- Minimal, branded EYEZEN page reached from the expiring decision token. Explain
  the proposed doctor update in plain language and offer “Confirm change” or
  “Prefer original doctor” when the token remains pending. Show a recorded
  result on repeat use; show expiry and unavailable states with a clinic
  contact fallback. This is public token access, not a login/session flow.
