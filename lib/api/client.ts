const unauthenticatedPostRoutes = new Set([
  "/auth/login",
  "/auth/password/forgot",
  "/auth/password/reset",
  "/auth/activate",
]);
const sessionRoutes = new Set(["/auth/login", "/auth/refresh", "/auth/logout", "/auth/logout-all"]);
let refreshInFlight: Promise<boolean> | undefined;

function csrfToken(): string | undefined {
  const entry = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("eyezen_csrf="));
  return entry ? decodeURIComponent(entry.slice("eyezen_csrf=".length)) : undefined;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await request(path, init);
  if (response.status !== 401 || sessionRoutes.has(path) || path.startsWith("/public/")) return response;
  const refreshed = await refreshSession();
  if (!refreshed) return response;
  return request(path, init);
}

async function request(path: string, init: RequestInit): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  if (isMutation && !unauthenticatedPostRoutes.has(path)) {
    const token = csrfToken();
    if (token) headers.set("X-CSRF-Token", token);
  }
  return fetch(`/api/backend${path}`, { ...init, method, headers, credentials: "same-origin", cache: "no-store" });
}

async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const rotate = async () => {
        const token = csrfToken();
        if (!token) return false;
        const response = await fetch("/api/backend/auth/refresh", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "X-CSRF-Token": token } });
        return response.ok;
      };
      try {
        if ("locks" in navigator) return await navigator.locks.request("eyezen-session-refresh", rotate);
        return await rotate();
      } catch { return false; }
    })().finally(() => { refreshInFlight = undefined; });
  }
  return refreshInFlight;
}
