"use client";

import { useConvexAuth } from "convex/react";
import { redirect } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex";

// --- Post-login redirect logic -----------------------------------------------------------
export default function Home() {
  const authResult = useConvexAuth();
  const { isAuthenticated } = authResult || {
    isAuthenticated: false,
  };

  const userOrgs = useQuery(api.users.getOrganizations);
  const hasOrganizations = userOrgs && userOrgs.length > 0;

  useEffect(() => {
    if (!isAuthenticated) {
      redirect("/auth/login");
    } else {
      if (hasOrganizations && userOrgs?.[0]?.slug) {
        redirect(`/${userOrgs[0].slug}/issues`);
      } else {
        redirect("/org-setup");
      }
    }
  }, [isAuthenticated, hasOrganizations, userOrgs]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="text-2xl font-semibold">Loading...</div>
    </div>
  );
}
