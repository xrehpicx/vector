import { Shield } from "lucide-react";
import { RolesPageContent } from "@/components/organization/roles-page-content";

interface RolesSettingsPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function RolesSettingsPage({
  params,
}: RolesSettingsPageProps) {
  const { orgSlug } = await params;
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Shield className="size-5" />
          Roles & Permissions
        </h1>
        <p className="text-muted-foreground text-sm">
          Create custom roles and configure permissions for your organization
        </p>
      </div>

      {/* Roles Management */}
      <RolesPageContent orgSlug={orgSlug} />
    </div>
  );
}
