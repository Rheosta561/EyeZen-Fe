import { TokenAuthRoute } from "@/components/token-auth-route";

export default function ActivatePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return <TokenAuthRoute mode="activate" searchParams={searchParams}/>;
}
