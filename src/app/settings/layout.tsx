"use client";

import { redirect } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { useQuery } from "@/lib/convex";
import { api } from "@/lib/convex";
import { UserSettingsSidebar } from "@/components/settings/user-settings-sidebar";
import { UserMenu } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

interface SettingsLayoutProps {
  children: ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const userQuery = useQuery(api.users.currentUser);
  const user = userQuery.data;
  const [isMobileOpen, setIsMobileOpen] = useState(false);

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
      <div className="bg-secondary flex h-screen">
        <aside className="hidden w-56 lg:block">
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-4 p-2 pt-0">
                <div className="space-y-1">
                  <div className="flex h-8 items-center gap-2 rounded-md px-2 py-1 text-sm font-medium">
                    <span>Loading...</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-border border-t p-2">
              <div className="flex w-full justify-start gap-2 p-2">
                <div className="bg-muted size-8 rounded-full"></div>
                <div className="flex flex-col items-start">
                  <span className="text-sm font-medium">Loading...</span>
                </div>
              </div>
            </div>
          </div>
        </aside>
        <main className="bg-background m-2 ml-0 flex-1 overflow-y-auto rounded-md border">
          <div className="flex h-full items-center justify-center">
            <div className="text-lg font-medium">Loading...</div>
          </div>
        </main>
      </div>
    );
  }

  if (userQuery.isError) {
    return (
      <div className="bg-secondary flex h-screen">
        <aside className="hidden w-56 lg:block">
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-4 p-2 pt-0">
                <div className="space-y-1">
                  <div className="flex h-8 items-center gap-2 rounded-md px-2 py-1 text-sm font-medium">
                    <span>Error</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
        <main className="bg-background m-2 ml-0 flex-1 overflow-y-auto rounded-md border">
          <div className="flex h-full items-center justify-center">
            <div className="text-destructive text-lg font-medium">
              Error loading settings: {userQuery.error?.message}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (user === null) {
    return null; // Redirect will handle this
  }

  return (
    <div className="bg-secondary flex h-screen">
      {/* Mobile Menu Button */}
      <div className="lg:hidden">
        <Dialog open={isMobileOpen} onOpenChange={setIsMobileOpen}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-2 left-2 z-40"
            >
              <Menu className="size-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="w-80 p-0">
            <div className="flex h-96 flex-col">
              {/* Settings Navigation */}
              <div className="flex-1 overflow-y-auto">
                <UserSettingsSidebar />
              </div>

              {/* User menu at bottom */}
              <div className="border-border border-t p-2">
                <UserMenu />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Desktop Settings Sidebar */}
      <aside className="hidden w-56 lg:block">
        <div className="flex h-full flex-col">
          {/* Settings Navigation */}
          <div className="flex-1 overflow-y-auto">
            <UserSettingsSidebar />
          </div>

          {/* User menu at bottom */}
          <div className="border-border border-t p-2">
            <UserMenu />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="bg-background m-2 ml-0 flex-1 overflow-y-auto rounded-md border lg:ml-0">
        <div className="h-full">{children}</div>
      </main>
    </div>
  );
}
