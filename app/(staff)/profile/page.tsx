import { WorkspaceArea } from "@/components/workspace-area";

export default function ProfilePage() { return <WorkspaceArea area="profile" timeZone={process.env.HOSPITAL_TIME_ZONE ?? "UTC"}/>; }
