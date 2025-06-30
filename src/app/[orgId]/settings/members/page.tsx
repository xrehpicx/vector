import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { auth } from "@/auth/auth";
import { OrganizationService } from "@/entities/organizations/organization.service";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import { MembersList } from "@/components/organization";

interface MembersSettingsPageProps {
  params: Promise<{ orgId: string }>;
}

export default async function MembersSettingsPage({
  params,
}: MembersSettingsPageProps) {
  const { orgId: orgSlug } = await params;

  // Verify user access
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    notFound();
  }

  // Get organization details and verify membership
  const org = await OrganizationService.verifyUserOrganizationAccess(
    session.user.id,
    orgSlug,
  );

  if (!org) {
    notFound();
  }

  const isOwner = org.role === "owner";
  const isAdmin = org.role === "admin" || isOwner;

  // Only admins can access member management
  if (!isAdmin) {
    notFound();
  }

  // Get organization stats for member count
  const stats = await OrganizationService.getOrganizationStats(orgSlug);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Users className="size-5" />
          Members & Access
        </h1>
        <p className="text-muted-foreground text-sm">
          Manage organization members, roles, and invitations
        </p>
      </div>

      {/* Member Stats */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Total Members</span>
          <Badge variant="secondary" className="text-xs">
            {stats.memberCount} {stats.memberCount === 1 ? "member" : "members"}
          </Badge>
        </div>
        <p className="text-muted-foreground text-xs">
          Invite new members and manage existing member roles
        </p>
      </div>

      {/* Members List */}
      <div className="space-y-4">
        <MembersList
          orgSlug={orgSlug}
          isAdmin={isAdmin}
          currentUserId={session.user.id}
          memberCount={stats.memberCount}
        />
      </div>
    </div>
  );
}
