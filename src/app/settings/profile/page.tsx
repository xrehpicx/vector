"use client";

import { ProfileForm } from "@/components/profile-form";
import { redirect } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex";

export default function ProfilePage() {
  const user = useQuery(api.users.currentUser);

  useEffect(() => {
    if (user === null) {
      redirect("/auth/login");
    }
  }, [user]);

  if (user === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-lg font-medium">Loading...</div>
      </div>
    );
  }

  if (user === null) {
    return null; // Redirect will handle this
  }

  return (
    <div className="flex-1 lg:max-w-2xl">
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium">Profile</h3>
          <p className="text-muted-foreground text-sm">
            This is how others will see you on the site.
          </p>
        </div>
        <ProfileForm />
      </div>
    </div>
  );
}
