"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PageSkeleton } from "@/components/ui/table-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FolderOpen, GitBranch, Bug } from "lucide-react";

interface DashboardClientProps {
  orgSlug: string;
}

export default function DashboardClient({ orgSlug }: DashboardClientProps) {
  const orgStats = useQuery(api.organizations.getOrganizationStats, {
    orgSlug,
  });

  if (orgStats === undefined) {
    return <PageSkeleton />;
  }

  if (orgStats === null) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-muted-foreground">Organization not found</p>
      </div>
    );
  }

  const { memberCount, teamCount, projectCount, issueCount } = orgStats;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to your organization overview
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Members</CardTitle>
            <Users className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{memberCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Teams</CardTitle>
            <GitBranch className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teamCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Projects</CardTitle>
            <FolderOpen className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projectCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Issues</CardTitle>
            <Bug className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{issueCount}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
