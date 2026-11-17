import { StaffHome } from "@/components/shell/staff-home";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <StaffHome timeZone={process.env.HOSPITAL_TIME_ZONE ?? "UTC"}>{children}</StaffHome>;
}
