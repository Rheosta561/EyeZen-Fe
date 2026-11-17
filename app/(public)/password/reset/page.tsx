import { TokenAuthRoute } from "@/components/token-auth-route";

export default function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return <TokenAuthRoute mode="reset" searchParams={searchParams}/>;
}
