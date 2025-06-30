"use client";

import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { CreateTeamButton, TeamsTable } from "@/components/teams";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

interface TeamsPageContentProps {
  orgSlug: string;
  isAdminOrOwner: boolean;
  orgName: string;
}

export function TeamsPageContent({
  orgSlug,
  isAdminOrOwner,
  orgName,
}: TeamsPageContentProps) {
  const { data: teams = [], isLoading } = trpc.organization.listTeams.useQuery({
    orgSlug,
  });

  // --------------------------------------------------
  // Pagination (client-side until server support exists)
  // --------------------------------------------------
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);

  const total = teams.length;
  const paginatedTeams = teams.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Keep page within valid bounds when data changes (e.g. after create)
  useEffect(() => {
    if (page !== 1 && (page - 1) * PAGE_SIZE >= total) {
      setPage(1);
    }
  }, [total, page]);

  // --------------------------------------------------
  // Team operations
  // --------------------------------------------------
  const utils = trpc.useUtils();
  const { data: session } = authClient.useSession();

  const deleteMutation = trpc.team.delete.useMutation({
    onSuccess: () => {
      utils.organization.listTeams.invalidate({ orgSlug }).catch(() => {});
    },
  });

  const handleDelete = (teamId: string) => {
    if (!session?.user?.id) return;
    deleteMutation.mutate({ teamId });
  };

  // --------------------------------------------------
  // Render
  // --------------------------------------------------
  // Loading state – match Issues page skeleton
  if (isLoading && teams.length === 0) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground text-sm">Loading teams...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background h-full">
      {/* Header with tabs */}
      <div className="border-b">
        <div className="flex items-center justify-between p-1">
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="sm"
              className="bg-secondary h-6 gap-2 rounded-xs px-3 text-xs font-normal"
            >
              <span>All teams</span>
              <span className="text-muted-foreground text-xs">{total}</span>
            </Button>
          </div>
          {isAdminOrOwner && (
            <CreateTeamButton orgSlug={orgSlug} size="sm" className="h-6" />
          )}
        </div>
      </div>

      {/* Teams list */}
      <div className="flex-1">
        <TeamsTable
          orgSlug={orgSlug}
          teams={paginatedTeams}
          onDelete={isAdminOrOwner ? handleDelete : undefined}
          deletePending={deleteMutation.isPending}
        />
      </div>

      {/* Pagination controls */}
      {total > PAGE_SIZE && (
        <div className="text-muted-foreground flex justify-between border-t p-2 text-xs">
          <span>
            Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * PAGE_SIZE >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
