"use client";

import { redirect } from "next/navigation";
import { ReactNode, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex";
import { UserSettingsSidebar } from "@/components/settings/user-settings-sidebar";

interface SettingsLayoutProps {
  children: ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
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
    <div className="container mx-auto p-6">
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium">Settings</h3>
          <p className="text-muted-foreground text-sm">
            Manage your account settings and set e-mail preferences.
          </p>
        </div>
        <div className="flex flex-col space-y-8 lg:flex-row lg:space-y-0 lg:space-x-12">
          <aside className="-mx-4 lg:w-1/5">
            <UserSettingsSidebar />
          </aside>
          <div className="flex-1 lg:max-w-2xl">{children}</div>
        </div>
      </div>
    </div>
  );
}
