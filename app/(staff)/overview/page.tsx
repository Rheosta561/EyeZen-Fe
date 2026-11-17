import { WorkspaceArea } from "@/components/workspace-area";

export default function OverviewPage() { return <WorkspaceArea area="overview" timeZone={process.env.HOSPITAL_TIME_ZONE ?? "UTC"}/>; }
