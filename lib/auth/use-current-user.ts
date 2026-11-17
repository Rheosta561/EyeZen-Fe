"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";

export type CurrentUser = { id: string; username: string; email: string; role: string; departmentIds: string[] };

export function useCurrentUser() {
  return useQuery({
    queryKey: ["session", "current-user"],
    queryFn: async (): Promise<CurrentUser> => {
      const response = await apiFetch("/auth/me");
      if (!response.ok) throw new Error(response.status === 401 ? "Sign in to open your workspace." : response.status === 503 ? "Secure API connection is not configured yet." : "Your workspace could not be verified.");
      const data = await response.json() as { user: CurrentUser };
      return data.user;
    },
    retry: false,
    refetchOnWindowFocus: true,
  });
}
