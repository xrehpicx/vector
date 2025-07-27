"use client";

import { redirect } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex";

// --- Post-login redirect logic -----------------------------------------------------------
export default function Home() {
  const user = useQuery(api.users.currentUser);
  const userOrgs = useQuery(api.users.getOrganizations);
  const hasOrganizations = userOrgs && userOrgs.length > 0;

  useEffect(() => {
    if (user === undefined) {
      // Still loading, don't redirect yet
      return;
    }

    if (user === null) {
      // Not authenticated
      redirect("/auth/login");
    } else {
      // Authenticated
      if (hasOrganizations && userOrgs?.[0]?.slug) {
        redirect(`/${userOrgs[0].slug}/issues`);
      } else {
        redirect("/org-setup");
      }
    }
  }, [user, hasOrganizations, userOrgs]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="text-2xl font-semibold">Loading...</div>
    </div>
  );
}
