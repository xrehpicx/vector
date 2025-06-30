"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

// Import the LeadSelector to maintain consistency
import { LeadSelector } from "@/components/projects/project-selectors";

// ---------------------------------------------------------------------------
// 🧩 Internal content component (dialog body)
// ---------------------------------------------------------------------------
interface CreateTeamDialogContentProps {
  orgSlug: string;
  onClose: () => void;
  onSuccess?: (teamId: string) => void;
}

function CreateTeamDialogContent({
  orgSlug,
  onClose,
  onSuccess,
}: CreateTeamDialogContentProps) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [selectedLead, setSelectedLead] = useState<string>("");

  const utils = trpc.useUtils();

  // Get organization members for lead selection
  const { data: orgMembers = [] } = trpc.organization.listMembers.useQuery({
    orgSlug,
  });

  const createMutation = trpc.team.create.useMutation({
    onSuccess: (result) => {
      // Refresh teams list so the UI updates
      utils.organization.listTeams.invalidate({ orgSlug }).catch(() => {});
      onSuccess?.(result.id);
      onClose();
    },
    onError: (e) => console.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !key.trim()) return;

    createMutation.mutate({
      orgSlug,
      name: name.trim(),
      key: key.trim().toUpperCase(),
      description: description.trim() || undefined,
      leadId: selectedLead || undefined,
    });
  };

  // Auto-generate key from name (alphanumeric, max 10 chars)
  const handleNameChange = (value: string) => {
    setName(value);
    if (
      !key ||
      key ===
        value
          .replace(/[^A-Z0-9]/gi, "")
          .slice(0, 10)
          .toUpperCase()
    ) {
      setKey(
        value
          .replace(/[^A-Z0-9]/gi, "")
          .slice(0, 10)
          .toUpperCase(),
      );
    }
  };

  return (
    <Dialog open onOpenChange={(isOpen: boolean) => !isOpen && onClose()}>
      <DialogContent showCloseButton={false} className="gap-2 p-2 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <div className="text-muted-foreground flex w-full items-center gap-2 text-sm">
              {/* Properties Row */}
              <div className="flex flex-wrap gap-2">
                <LeadSelector
                  members={orgMembers}
                  selectedLead={selectedLead}
                  onLeadSelect={setSelectedLead}
                  displayMode="iconWhenUnselected"
                />
              </div>
              <div className="ml-auto">
                <code className="bg-muted flex h-8 items-center rounded-md px-2.5 font-mono text-sm">
                  {key || "TEAM"}
                </code>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-2">
          {/* Team Name */}
          <Input
            placeholder="Team name"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="text-base"
            autoFocus
          />

          {/* Team Key */}
          <Input
            placeholder="TEAM-KEY"
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase().slice(0, 10))}
            maxLength={10}
            className="h-9"
          />

          {/* Description */}
          <Textarea
            placeholder="Add description..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring min-h-[120px] w-full resize-none rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          />
        </form>

        <div className="flex w-full flex-row items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!name.trim() || !key.trim() || createMutation.isPending}
            onClick={handleSubmit}
          >
            {createMutation.isPending ? "Creating…" : "Create team"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// 🖱️ Public wrapper — handles trigger button + open state
// ---------------------------------------------------------------------------
export interface CreateTeamDialogProps {
  /** Organization slug the team belongs to */
  orgSlug: string;
  /** Optional callback fired after the team is successfully created */
  onTeamCreated?: () => void;
  /** Visual style of trigger button */
  variant?: "default" | "floating";
  /** Additional classes for the trigger button */
  className?: string;
}

export function CreateTeamDialog({
  orgSlug,
  onTeamCreated,
  variant = "default",
  className,
}: CreateTeamDialogProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleSuccess = () => {
    onTeamCreated?.();
    setIsDialogOpen(false);
  };

  const trigger =
    variant === "floating" ? (
      <Button
        onClick={() => setIsDialogOpen(true)}
        className={cn(
          "h-12 w-12 rounded-full bg-blue-600 text-white shadow-lg transition-all hover:bg-blue-700 hover:shadow-xl",
          className,
        )}
        size="icon"
      >
        <Plus className="h-5 w-5" />
      </Button>
    ) : (
      <Button
        size="sm"
        onClick={() => setIsDialogOpen(true)}
        className={cn("gap-1 text-sm", className)}
        variant="outline"
      >
        <Plus className="size-4" />
      </Button>
    );

  return (
    <>
      {trigger}
      {isDialogOpen && (
        <CreateTeamDialogContent
          orgSlug={orgSlug}
          onClose={() => setIsDialogOpen(false)}
          onSuccess={handleSuccess}
        />
      )}
    </>
  );
}
