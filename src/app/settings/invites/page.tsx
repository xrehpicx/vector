"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/lib/convex";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";

export default function InvitesPage() {
  const invites = useQuery(api.users.getPendingInvitations);
  const acceptInvite = useMutation(api.organizations.acceptInvitation);
  const declineInvite = useMutation(api.organizations.revokeInvite);

  const handleAccept = async (inviteId: Id<"invitations">) => {
    try {
      await acceptInvite({ inviteId });
      toast.success("Invitation accepted");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDecline = async (inviteId: Id<"invitations">) => {
    try {
      await declineInvite({ inviteId });
      toast.info("Invitation declined");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (invites === undefined) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Mail className="size-5" />
          Pending Invitations
        </h1>
        <p className="text-muted-foreground text-sm">
          Manage your organization invitations and join new teams
        </p>
      </div>

      {/* Invitation Stats */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Pending Invites</span>
          <Badge variant="secondary" className="text-xs">
            {invites.length} {invites.length === 1 ? "invite" : "invites"}
          </Badge>
        </div>
        {invites.length > 0 && (
          <p className="text-muted-foreground text-xs">
            Accept invitations to join organizations and start collaborating
          </p>
        )}
      </div>

      {/* Invitations List */}
      <div className="space-y-4">
        {invites.length === 0 ? (
          <div className="text-muted-foreground flex h-32 items-center justify-center rounded-md border border-dashed text-sm">
            You have no pending invitations.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-muted-foreground px-4 py-3 text-left text-xs font-medium tracking-wider uppercase">
                    Organization
                  </th>
                  <th className="text-muted-foreground px-4 py-3 text-left text-xs font-medium tracking-wider uppercase">
                    Role
                  </th>
                  <th className="text-muted-foreground px-4 py-3 text-left text-xs font-medium tracking-wider uppercase">
                    Invited
                  </th>
                  <th className="text-muted-foreground px-4 py-3 text-left text-xs font-medium tracking-wider uppercase">
                    Expires
                  </th>
                  <th className="text-muted-foreground px-4 py-3 text-right text-xs font-medium tracking-wider uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {invites.map((inv) => (
                  <tr key={inv._id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 text-sm font-medium">
                      {inv.organization?.name ?? "Unknown Organization"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Badge variant="outline" className="capitalize">
                        {inv.role}
                      </Badge>
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-sm">
                      {format(new Date(inv._creationTime), "MMM d, yyyy")}
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-sm">
                      {format(new Date(inv.expiresAt), "MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" onClick={() => handleAccept(inv._id)}>
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDecline(inv._id)}
                        >
                          Decline
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
