"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/lib/convex";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, X, User } from "lucide-react";
import { StateSelector, AssigneeSelector } from "./issue-selectors";
import type { Member, State } from "./issue-selectors";
import { PERMISSIONS } from "@/lib/permissions";
import { usePermission } from "@/hooks/use-permissions";
import type { Id } from "../../../convex/_generated/dataModel";

// Helper to derive initials from a name/email
function getAssigneeInitials(
  name?: string | null,
  email?: string | null,
): string {
  const displayName = name || email;
  if (!displayName) return "?";
  return displayName
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export interface IssueAssignmentsProps {
  orgSlug: string;
  issueId: Id<"issues">;
  /**
   * The list of workflow states available within the organization. Accepts either
   * mutable or readonly arrays so callers don't need to cast or clone.
   */
  states: readonly State[] | State[];
  /**
   * Organization member list. Accepts either mutable or readonly arrays so callers
   * don't need to cast or clone.
   */
  members: readonly Member[] | Member[];
  defaultStateId: Id<"issueStates">;
}

export function IssueAssignments({
  orgSlug,
  issueId,
  states,
  members,
  defaultStateId,
}: IssueAssignmentsProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Current user info
  const currentUser = useQuery(api.users.currentUser);
  const currentUserId = currentUser?._id || "";

  // Permission check (manage assignments)
  const { hasPermission: canManage } = usePermission(
    orgSlug,
    PERMISSIONS.ASSIGNMENT_MANAGE,
  );

  // Fetch assignments for this issue
  const assignments = useQuery(api.issues.getAssignments, { issueId }) ?? [];

  // Mutations
  const addAssigneeMutation = useMutation(api.issues.addAssignee);
  const changeAssignmentStateMutation = useMutation(
    api.issues.changeAssignmentState,
  );
  const updateAssignmentAssigneeMutation = useMutation(
    api.issues.updateAssignmentAssignee,
  );
  const deleteAssignmentMutation = useMutation(api.issues.deleteAssignment);

  // Helper to filter members so the same user cannot be assigned twice
  const assignedUserIds = assignments
    .map((a) => a.assigneeId)
    .filter((id): id is Id<"users"> => !!id);

  let availableMembers = members.filter(
    (m) => !assignedUserIds.includes(m.userId as Id<"users">),
  );

  // If the user cannot manage assignments, they may only assign themselves
  if (!canManage) {
    availableMembers = availableMembers.filter(
      (m) => m.userId === currentUserId,
    );
  }

  const handleAddAssignee = async (assigneeId: string) => {
    try {
      await addAssigneeMutation({
        issueId,
        assigneeId: assigneeId as Id<"users">,
        stateId: defaultStateId,
      });
      setAddDialogOpen(false);
    } catch (error) {
      console.error("Failed to add assignee:", error);
    }
  };

  const handleStateChange = async (assignmentId: string, stateId: string) => {
    try {
      await changeAssignmentStateMutation({
        assignmentId: assignmentId as Id<"issueAssignees">,
        stateId: stateId as Id<"issueStates">,
      });
    } catch (error) {
      console.error("Failed to change state:", error);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    try {
      await deleteAssignmentMutation({
        assignmentId: assignmentId as Id<"issueAssignees">,
      });
    } catch (error) {
      console.error("Failed to remove assignment:", error);
    }
  };

  const handleUpdateAssignee = async (
    assignmentId: string,
    assigneeId: string,
  ) => {
    try {
      await updateAssignmentAssigneeMutation({
        assignmentId: assignmentId as Id<"issueAssignees">,
        assigneeId: assigneeId as Id<"users">,
      });
    } catch (error) {
      console.error("Failed to update assignee:", error);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between border-b px-1 py-1 pl-2">
        <h4 className="text-sm">Assignees</h4>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAddDialogOpen(true)}
          className="h-6 gap-1 text-xs"
          disabled={availableMembers.length === 0}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {/* Assignments list - matching issues table design */}
      <div className="divide-y">
        {assignments.map((assignment) => {
          // (Icon not used directly in this component)

          return (
            <div
              key={assignment._id}
              className="hover:bg-muted/50 flex items-center gap-3 p-2 transition-colors"
            >
              {/* Assignee - clickable like issues table */}
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <AssigneeSelector
                  members={members.filter(
                    (m) =>
                      m.userId === assignment.assigneeId ||
                      !assignedUserIds.includes(m.userId as Id<"users">),
                  )}
                  selectedAssignee={assignment.assigneeId?.toString() || ""}
                  onAssigneeSelect={
                    canManage || assignment.assigneeId === currentUserId
                      ? (userId) => handleUpdateAssignee(assignment._id, userId)
                      : undefined
                  }
                  displayMode="labelOnly"
                  trigger={
                    <div className="hover:bg-muted/30 -m-1 flex cursor-pointer items-center gap-2 rounded-md p-1 transition-colors">
                      {assignment.assigneeId && assignment.assignee ? (
                        <>
                          <Avatar className="h-6 w-6 flex-shrink-0">
                            <AvatarFallback className="text-xs">
                              {getAssigneeInitials(
                                assignment.assignee.name,
                                assignment.assignee.email,
                              )}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate text-sm">
                            {assignment.assignee.name ||
                              assignment.assignee.email}
                          </span>
                        </>
                      ) : (
                        <>
                          <div className="bg-muted flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full">
                            <User className="text-muted-foreground h-3 w-3" />
                          </div>
                          <span className="text-muted-foreground text-sm">
                            Unassigned
                          </span>
                        </>
                      )}
                    </div>
                  }
                />
              </div>

              {/* State badge - clickable like issues table */}
              <StateSelector
                states={states}
                selectedState={assignment.stateId?.toString() || ""}
                onStateSelect={
                  canManage || assignment.assigneeId === currentUserId
                    ? (stateId) => handleStateChange(assignment._id, stateId)
                    : () => {}
                }
                align="end"
                className="border-none bg-transparent p-0 shadow-none"
              />

              {/* Remove button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveAssignment(assignment._id)}
                disabled={
                  !(canManage || assignment.assigneeId === currentUserId)
                }
                className="text-muted-foreground hover:text-destructive h-6 w-6 flex-shrink-0 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {assignments.length === 0 && (
        <div className="text-muted-foreground py-6 text-center">
          <User className="mx-auto mb-2 h-8 w-8 opacity-50" />
          <p className="text-sm">No assignees yet</p>
          <p className="text-xs">
            Click &quot;Add&quot; to assign someone to this issue
          </p>
        </div>
      )}

      {/* Add assignee dialog - matching create-issue-dialog style */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="gap-2 p-2 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Add Assignee</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            {availableMembers.length === 0 ? (
              <div className="text-muted-foreground py-6 text-center">
                <User className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p className="text-sm">All members already assigned</p>
                <p className="text-xs">
                  Everyone in your team is already working on this issue
                </p>
              </div>
            ) : (
              <AssigneeSelector
                members={availableMembers}
                selectedAssignee=""
                onAssigneeSelect={handleAddAssignee}
                displayMode="default"
                trigger={
                  <Button
                    variant="outline"
                    className="h-9 w-full justify-start"
                  >
                    <User className="mr-2 h-4 w-4" />
                    Select assignee
                  </Button>
                }
              />
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAddDialogOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
