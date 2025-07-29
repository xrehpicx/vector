"use client";

import { useQuery } from "@/lib/convex";
import { api } from "@/lib/convex";
import { User, Mail, Settings } from "lucide-react";
import Link from "next/link";

export default function SettingsPage() {
  const user = useQuery(api.users.currentUser);

  if (user === undefined) {
    return (
      <div className="space-y-6 p-6">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Settings className="size-5" />
            Settings
          </h1>
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (user === null) {
    return null;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Settings className="size-5" />
          Settings
        </h1>
        <p className="text-muted-foreground text-sm">
          Manage your account settings and preferences
        </p>
      </div>

      {/* Settings Options */}
      <div className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Profile Settings</label>
            <Link
              href="/settings/profile"
              className="hover:bg-muted/50 flex items-center gap-3 rounded-lg border p-4 transition-colors"
            >
              <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-md">
                <User className="text-primary size-5" />
              </div>
              <div>
                <h3 className="font-medium">Profile</h3>
                <p className="text-muted-foreground text-sm">
                  Update your personal information and preferences
                </p>
              </div>
            </Link>
            <p className="text-muted-foreground text-xs">
              Manage your personal information and account settings
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Invitations</label>
            <Link
              href="/settings/invites"
              className="hover:bg-muted/50 flex items-center gap-3 rounded-lg border p-4 transition-colors"
            >
              <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-md">
                <Mail className="text-primary size-5" />
              </div>
              <div>
                <h3 className="font-medium">Invites</h3>
                <p className="text-muted-foreground text-sm">
                  Manage organization invitations
                </p>
              </div>
            </Link>
            <p className="text-muted-foreground text-xs">
              Accept or decline pending organization invitations
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
