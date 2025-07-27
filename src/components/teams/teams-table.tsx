"use client";

import Link from "next/link";
import { Users, MoreHorizontal, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { formatDateHuman } from "@/lib/date";
import { useMutation } from "convex/react";
import { api } from "@/lib/convex";
import { getDynamicIcon } from "@/lib/dynamic-icons";
import { IconPicker } from "@/components/ui/icon-picker";

interface Team {
  id: string;
  name: string;
  description?: string | null;
  key: string;
  icon?: string | null;
  color?: string | null;
  createdAt?: Date | string;
}

interface TeamsTableProps {
  orgSlug: string;
  teams: Team[];
  onDelete?: (teamId: string) => void;
  deletePending?: boolean;
}

export function TeamsTable({
  orgSlug,
  teams,
  onDelete,
  deletePending = false,
}: TeamsTableProps) {
  const updateIconMutation = useMutation(api.teams.update);

  const handleIconChange = (teamId: string, iconName: string | null) => {
    // Find the team by id to get the teamKey
    const team = teams.find((t) => t.id === teamId);
    if (team) {
      updateIconMutation({
        orgSlug,
        teamKey: team.key,
        data: { icon: iconName || undefined },
      });
    }
  };

  if (teams.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="mb-4 text-4xl">👥</div>
          <h3 className="mb-2 text-lg font-semibold">No teams found</h3>
          <p className="text-muted-foreground mb-6">
            Get started by creating your first team.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="divide-y">
      <AnimatePresence initial={false}>
        {teams.map((team) => {
          // Team icon / color
          const TeamIcon = team.icon
            ? getDynamicIcon(team.icon) || Users
            : Users;
          const teamColor = team.color || "#94a3b8";

          return (
            <motion.div
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              key={team.id}
              className="hover:bg-muted/50 flex items-center gap-3 px-3 py-2 transition-colors"
            >
              {/* Team Icon Picker */}
              <IconPicker
                value={team.icon || null}
                onValueChange={(icon) => handleIconChange(team.id, icon)}
                trigger={
                  <div className="flex-shrink-0 cursor-pointer">
                    <TeamIcon className="size-4" style={{ color: teamColor }} />
                  </div>
                }
                className="border-none bg-transparent p-0 shadow-none"
              />

              {/* Team Key Badge */}
              <Badge
                variant="secondary"
                className="flex-shrink-0 font-mono text-xs"
              >
                {team.key}
              </Badge>

              {/* Title with Description */}
              <Link
                href={`/${orgSlug}/teams/${team.key}`}
                className="hover:text-primary flex min-w-0 flex-1 items-center gap-2 transition-colors"
              >
                <span className="block truncate text-sm font-medium">
                  {team.name}
                </span>
                {team.description && (
                  <>
                    <div className="bg-muted h-4 w-px" />
                    <p className="text-muted-foreground max-w-xs truncate text-xs">
                      {team.description}
                    </p>
                  </>
                )}
              </Link>

              {/* Created Date */}
              <div className="text-muted-foreground flex-shrink-0 text-xs">
                <span>
                  Created{" "}
                  {team.createdAt ? formatDateHuman(team.createdAt) : "—"}
                </span>
              </div>

              {/* Actions */}
              <div className="flex-shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      aria-label="Open team actions"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onDelete && (
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={deletePending}
                        onClick={() => {
                          if (
                            confirm(
                              "Delete this team? This action cannot be undone.",
                            )
                          ) {
                            onDelete(team.id);
                          }
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete team
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem asChild>
                      <Link href={`/${orgSlug}/teams/${team.key}`}>
                        View team
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
