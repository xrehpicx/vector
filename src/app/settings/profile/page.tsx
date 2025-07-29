"use client";

import { ProfileForm } from "@/components/profile-form";
import { redirect } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@/lib/convex";
import { api } from "@/lib/convex";
import { User } from "lucide-react";

export default function ProfilePage() {
  const userQuery = useQuery(api.users.currentUser);
  const user = userQuery.data;

  useEffect(() => {
    if (userQuery.isError) {
      // Handle error case
      console.error("Error loading user:", userQuery.error);
      return;
    }

    if (!userQuery.isPending && user === null) {
      redirect("/auth/login");
    }
  }, [user, userQuery.isPending, userQuery.isError, userQuery.error]);

  if (userQuery.isPending) {
    return (
      <div className="space-y-6 p-6">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <User className="size-5" />
            Profile
          </h1>
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (userQuery.isError) {
    return (
      <div className="space-y-6 p-6">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <User className="size-5" />
            Profile
          </h1>
          <p className="text-destructive text-sm">
            Error loading profile: {userQuery.error?.message}
          </p>
        </div>
      </div>
    );
  }

  if (user === null) {
    return null; // Redirect will handle this
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <User className="size-5" />
          Profile
        </h1>
        <p className="text-muted-foreground text-sm">
          This is how others will see you on the site.
        </p>
      </div>

      {/* Profile Form */}
      <div className="space-y-6">
        <ProfileForm />
      </div>
    </div>
  );
}
