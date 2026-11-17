export type Role = "SUPER_ADMIN" | "HOSPITAL_ADMIN" | "ROSTER_MANAGER" | "DEPARTMENT_HEAD" | "DOCTOR" | "RECEPTION_FRONT_DESK";
export type Permission = "accounts:manage" | "departments:manage" | "rosters:read" | "rosters:write" | "rosters:publish" | "leave:approve" | "appointments:read" | "appointments:write" | "profile:read:own" | "profile:write:own" | "leave:request" | "replacement:respond" | "availability:manage:own" | "notifications:manage";

const rolePermissions: Record<Role, ReadonlySet<Permission>> = {
  SUPER_ADMIN: new Set(["accounts:manage", "departments:manage", "rosters:read", "rosters:write", "rosters:publish", "leave:approve", "appointments:read", "appointments:write", "profile:read:own", "profile:write:own", "leave:request", "replacement:respond", "notifications:manage"]),
  HOSPITAL_ADMIN: new Set(["accounts:manage", "departments:manage", "rosters:read", "rosters:write", "rosters:publish", "leave:approve", "appointments:read", "appointments:write", "profile:read:own", "profile:write:own", "leave:request", "replacement:respond", "notifications:manage"]),
  ROSTER_MANAGER: new Set(["rosters:read", "rosters:write", "rosters:publish", "appointments:read", "profile:read:own"]),
  DEPARTMENT_HEAD: new Set(["rosters:read", "rosters:write", "rosters:publish", "leave:approve", "appointments:read", "profile:read:own"]),
  DOCTOR: new Set(["rosters:read", "appointments:read", "profile:read:own", "profile:write:own", "leave:request", "replacement:respond", "availability:manage:own"]),
  RECEPTION_FRONT_DESK: new Set(["appointments:read", "appointments:write"]),
};

export function hasPermission(role: string | undefined, permission: Permission): boolean {
  return role !== undefined && role in rolePermissions && rolePermissions[role as Role].has(permission);
}

export function isHospitalWide(role: string | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "HOSPITAL_ADMIN";
}

export type RoleNavItem = { label: string; href: string };
export function navigationFor(role: string | undefined): RoleNavItem[] {
  const items: RoleNavItem[] = [{ label: "Overview", href: "/overview" }];
  if (hasPermission(role, "rosters:read") && role !== "DOCTOR") items.push({ label: "Rosters", href: "/rosters" });
  if (role === "DOCTOR" && hasPermission(role, "appointments:read")) items.push({ label: "My schedule", href: "/schedule" });
  if (hasPermission(role, "leave:approve")) items.push({ label: "Leave & cover", href: "/leave" });
  else if (hasPermission(role, "leave:request")) items.push({ label: "Leave requests", href: "/leave" });
  if (hasPermission(role, "rosters:write")) items.push({ label: "Replacements", href: "/replacements" });
  else if (hasPermission(role, "replacement:respond")) items.push({ label: "Replacement responses", href: "/replacements" });
  if (hasPermission(role, "appointments:read")) items.push({ label: role === "DOCTOR" ? "My appointments" : role === "RECEPTION_FRONT_DESK" ? "Appointment desk" : "Appointments", href: "/appointments" });
  if (hasPermission(role, "rosters:read") && role !== "DOCTOR" && role !== "DEPARTMENT_HEAD") items.push({ label: "Doctor directory", href: "/doctors" });
  if (hasPermission(role, "departments:manage")) items.push({ label: "Departments", href: "/departments" });
  if (hasPermission(role, "accounts:manage")) { items.push({ label: "Accounts", href: "/accounts" }, { label: "Invite staff", href: "/invite" }); }
  if (hasPermission(role, "notifications:manage")) items.push({ label: "Notifications", href: "/notifications" });
  if (hasPermission(role, "availability:manage:own")) items.push({ label: "Availability", href: "/availability" });
  if (role === "DOCTOR") items.push({ label: "My profile", href: "/profile" });
  else items.push({ label: "My account", href: "/profile" });
  return items;
}
