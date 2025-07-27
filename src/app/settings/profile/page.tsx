"use client";

import { useConvexAuth } from "convex/react";
import { ProfileForm } from "@/components/profile-form";
import { redirect } from "next/navigation";
import { useEffect } from "react";

export default function ProfilePage() {
  const authResult = useConvexAuth();
  const { isAuthenticated, isLoading } = authResult || {
    isAuthenticated: false,
    isLoading: true,
  };

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      redirect("/auth/login");
    }
  }, [isLoading, isAuthenticated]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-lg font-medium">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
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
