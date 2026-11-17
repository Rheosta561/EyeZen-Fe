import { WorkspaceArea } from "@/components/workspace-area";
import { Suspense } from "react";
import { WorkspaceRouteFallback } from "@/components/route-fallbacks";

export default function StaffAreaPage({ params }: { params: Promise<{ area: string[] }> }) {
  return <Suspense fallback={<WorkspaceRouteFallback/>}><StaffAreaContent params={params}/></Suspense>;
}

async function StaffAreaContent({ params }: { params: Promise<{ area: string[] }> }) {
  const { area } = await params;
  const key = area[0] ?? "workspace";
  return <WorkspaceArea area={key} timeZone={process.env.HOSPITAL_TIME_ZONE ?? "UTC"}/>;
}
