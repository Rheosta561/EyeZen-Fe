import { NextRequest, NextResponse } from "next/server";

async function proxy(request: NextRequest, context: RouteContext<"/api/backend/[...path]">) {
  const origin = process.env.EYEZEN_API_ORIGIN;
  if (!origin) return NextResponse.json({ code: "API_NOT_CONFIGURED", message: "EyeZen API origin is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const { path } = await context.params;
  const target = new URL(`/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`, origin);
  const headers = new Headers();
  const cookie = request.cookies.getAll().filter(({ name }) => ["eyezen_access", "eyezen_refresh", "eyezen_csrf"].includes(name)).map(({ name, value }) => `${name}=${value}`).join("; ");
  const csrf = request.headers.get("x-csrf-token");
  const contentType = request.headers.get("content-type");
  const accept = request.headers.get("accept");
  let body: ArrayBuffer | undefined;
  if (!["GET", "HEAD"].includes(request.method)) {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = await request.formData();
      const data = Object.fromEntries(form.entries());
      headers.set("content-type", "application/json");
      body = new TextEncoder().encode(JSON.stringify(data)).buffer;
    } else {
      body = await request.arrayBuffer();
    }
  }
  if (cookie) headers.set("cookie", cookie);
  if (csrf) headers.set("x-csrf-token", csrf);
  if (contentType && !contentType.includes("application/x-www-form-urlencoded")) headers.set("content-type", contentType);
  if (accept) headers.set("accept", accept);

  try {
    const upstream = await fetch(target, { method: request.method, headers, body, cache: "no-store", redirect: "manual" });
    const responseHeaders = new Headers();
    const responseType = upstream.headers.get("content-type");
    const cacheControl = upstream.headers.get("cache-control");
    if (responseType) responseHeaders.set("content-type", responseType);
    responseHeaders.set("cache-control", cacheControl?.includes("private") || cacheControl?.includes("no-store") ? cacheControl : "private, no-store");
    const setCookieValues = upstream.headers.getSetCookie();
    for (const value of setCookieValues) responseHeaders.append("set-cookie", value);
    return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return NextResponse.json({ code: "API_UNAVAILABLE", message: "EyeZen API could not be reached." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
