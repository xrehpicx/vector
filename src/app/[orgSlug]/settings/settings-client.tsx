"use client";

import { Settings } from "lucide-react";
import {
  OrgLogoEditor,
  OrgNameEditor,
  OrgSlugEditor,
} from "@/components/organization";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/table-skeleton";
import { Separator } from "@/components/ui/separator";

interface OrgSettingsPageClientProps {
  orgSlug: string;
}

export default function OrgSettingsPageClient({
  orgSlug,
}: OrgSettingsPageClientProps) {
  const org = useQuery(api.organizations.getBySlug, { orgSlug });

  if (org === undefined) {
    return (
      <PageSkeleton
        showTabs={false}
        tabCount={0}
        showCreateButton={false}
        tableRows={3}
        tableColumns={2}
      />
    );
  }

  if (org === null) {
    return <div>Organization not found</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Organization Settings</h3>
        <p className="text-muted-foreground text-sm">
          Manage your organization settings.
        </p>
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Organization Name</CardTitle>
          <CardDescription>
            This is your organization&apos;s visible name.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrgNameEditor orgSlug={org.slug} initialValue={org.name} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>URL Slug</CardTitle>
          <CardDescription>
            This is your organization&apos;s unique URL slug. It can only
            contain letters, numbers, and hyphens.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrgSlugEditor orgSlug={org.slug} initialValue={org.slug} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organization Logo</CardTitle>
          <CardDescription>
            Upload a logo for your organization. Recommended size: 256x256.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrgLogoEditor orgSlug={org.slug} initialValue={org.logo} />
        </CardContent>
      </Card>
    </div>
  );
}
