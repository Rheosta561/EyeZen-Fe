import { Suspense } from "react";
import { PublicAuthPage } from "@/components/public-auth-page";
import { PublicRouteFallback } from "@/components/route-fallbacks";

type Mode = "activate" | "reset";
export function TokenAuthRoute({ mode, searchParams }: { mode: Mode; searchParams: Promise<{ token?: string }> }) {
  return <Suspense fallback={<PublicRouteFallback/>}><TokenAuthContent mode={mode} searchParams={searchParams}/></Suspense>;
}

async function TokenAuthContent({ mode, searchParams }: { mode: Mode; searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <PublicAuthPage mode={mode} token={token}/>;
}
