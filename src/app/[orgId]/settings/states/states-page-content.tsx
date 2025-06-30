"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Settings2, Plus, Clock, Pencil } from "lucide-react";
import { StatesManagementDialog } from "@/components/organization";
import { issueStateTypeEnum } from "@/db/schema/issue-config";
import { projectStatusTypeEnum } from "@/db/schema/projects";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { getDynamicIcon } from "@/lib/dynamic-icons";

interface WorkflowState {
  id: string;
  name: string;
  position: number;
  color: string | null;
  icon: string | null;
  type: string;
}

interface StatesPageContentProps {
  orgSlug: string;
}

// Extract enum values from schema
const ISSUE_STATE_TYPES = issueStateTypeEnum.enumValues;
const PROJECT_STATUS_TYPES = projectStatusTypeEnum.enumValues;

// Helper function to get type label from enum value
const getTypeLabel = (type: string) => {
  // Convert snake_case to Title Case
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

// Group states by type
const groupStatesByType = (
  states: readonly WorkflowState[],
  isIssue: boolean,
) => {
  const types = isIssue ? ISSUE_STATE_TYPES : PROJECT_STATUS_TYPES;
  return types.map((type) => ({
    type,
    label: getTypeLabel(type),
    states: states.filter((state) => state.type === type),
  }));
};

export function StatesPageContent({ orgSlug }: StatesPageContentProps) {
  const utils = trpc.useUtils();

  const { data: issueStates = [] } = trpc.organization.listIssueStates.useQuery(
    {
      orgSlug,
    },
  );
  const { data: projectStatuses = [] } =
    trpc.organization.listProjectStatuses.useQuery({ orgSlug });

  const createIssueState = trpc.organization.createIssueState.useMutation({
    onSuccess: () => {
      utils.organization.listIssueStates
        .invalidate({ orgSlug })
        .catch(() => {});
    },
  });

  const updateIssueState = trpc.organization.updateIssueState.useMutation({
    onSuccess: () => {
      utils.organization.listIssueStates
        .invalidate({ orgSlug })
        .catch(() => {});
    },
  });

  const createProjectStatus = trpc.organization.createProjectStatus.useMutation(
    {
      onSuccess: () => {
        utils.organization.listProjectStatuses
          .invalidate({ orgSlug })
          .catch(() => {});
      },
    },
  );

  const updateProjectStatus = trpc.organization.updateProjectStatus.useMutation(
    {
      onSuccess: () => {
        utils.organization.listProjectStatuses
          .invalidate({ orgSlug })
          .catch(() => {});
      },
    },
  );

  const resetIssueMutation = trpc.organization.resetIssueStates.useMutation({
    onSuccess: () => {
      utils.organization.listIssueStates
        .invalidate({ orgSlug })
        .catch(() => {});
      toast.success("Issue states reset to defaults");
    },
  });

  const resetStatusMutation =
    trpc.organization.resetProjectStatuses.useMutation({
      onSuccess: () => {
        utils.organization.listProjectStatuses
          .invalidate({ orgSlug })
          .catch(() => {});
        toast.success("Project statuses reset to defaults");
      },
    });

  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    type: "issue" | "project";
    editingState?: WorkflowState;
  }>({
    isOpen: false,
    type: "issue",
  });

  const handleAddState = (type: "issue" | "project") => {
    setDialogState({
      isOpen: true,
      type,
      editingState: undefined,
    });
  };

  const handleEditState = (type: "issue" | "project", state: WorkflowState) => {
    setDialogState({
      isOpen: true,
      type,
      editingState: state,
    });
  };

  const handleSaveState = (newStateData: Omit<WorkflowState, "id">) => {
    if (dialogState.editingState) {
      // Update existing
      if (dialogState.type === "issue") {
        updateIssueState.mutate({
          orgSlug,
          stateId: dialogState.editingState.id,
          name: newStateData.name,
          position: newStateData.position,
          color: newStateData.color ?? "#94a3b8",
          icon: newStateData.icon,
          type: newStateData.type,
        });
      } else {
        updateProjectStatus.mutate({
          orgSlug,
          statusId: dialogState.editingState.id,
          name: newStateData.name,
          position: newStateData.position,
          color: newStateData.color ?? "#94a3b8",
          icon: newStateData.icon,
          type: newStateData.type,
        });
      }
    } else {
      // Create new
      if (dialogState.type === "issue") {
        createIssueState.mutate({
          orgSlug,
          name: newStateData.name,
          position: newStateData.position,
          color: newStateData.color ?? "#94a3b8",
          icon: newStateData.icon,
          type: newStateData.type,
        });
      } else {
        createProjectStatus.mutate({
          orgSlug,
          name: newStateData.name,
          position: newStateData.position,
          color: newStateData.color ?? "#94a3b8",
          icon: newStateData.icon,
          type: newStateData.type,
        });
      }
    }

    setDialogState({ isOpen: false, type: "issue" });
  };

  const closeDialog = () => {
    setDialogState({ isOpen: false, type: "issue" });
  };

  const issueGroups = groupStatesByType(issueStates as WorkflowState[], true);
  const projectGroups = groupStatesByType(
    projectStatuses as WorkflowState[],
    false,
  );

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div>
        <h1 className="text-base font-semibold">States & Workflow</h1>
        <p className="text-muted-foreground mt-0.5 text-xs">
          Configure issue states and project statuses for your organization
        </p>
      </div>

      {/* Issue States Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings2 className="text-muted-foreground size-5" />
            <h2 className="text-lg font-semibold">Issue States</h2>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => resetIssueMutation.mutate({ orgSlug })}
              className="h-7 text-xs"
            >
              Reset
            </Button>
            <Button
              size="sm"
              onClick={() => handleAddState("issue")}
              className="h-7 text-xs"
            >
              <Plus className="mr-1 size-3" />
              Add State
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {issueGroups.map((group) => (
            <div key={group.type} className="space-y-1">
              <div>
                <h3 className="text-foreground text-sm font-medium">
                  {group.label}
                </h3>
              </div>

              <div className="space-y-1">
                {group.states.map((state) => (
                  <button
                    key={state.id}
                    className="bg-background hover:bg-muted/30 group flex w-full cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-left transition-colors"
                    onClick={() => handleEditState("issue", state)}
                  >
                    {state.icon ? (
                      (() => {
                        const IconComponent =
                          getDynamicIcon(state.icon) ?? null;
                        return IconComponent ? (
                          <IconComponent
                            className="size-3 flex-shrink-0"
                            style={{ color: state.color || "#94a3b8" }}
                          />
                        ) : (
                          <div
                            className="size-2.5 flex-shrink-0 rounded-full"
                            style={{
                              backgroundColor: state.color || "#94a3b8",
                            }}
                          />
                        );
                      })()
                    ) : (
                      <div
                        className="size-2.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: state.color || "#94a3b8" }}
                      />
                    )}
                    <span className="flex-1 truncate text-xs font-medium">
                      {state.name}
                    </span>
                    <Pencil className="text-muted-foreground group-hover:text-foreground size-3 opacity-0 transition-colors group-hover:opacity-100" />
                  </button>
                ))}
                {group.states.length === 0 && (
                  <div className="text-muted-foreground px-2 py-1.5 text-xs italic">
                    No states configured
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Project Statuses Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="text-muted-foreground size-5" />
            <h2 className="text-lg font-semibold">Project Statuses</h2>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => resetStatusMutation.mutate({ orgSlug })}
              className="h-7 text-xs"
            >
              Reset
            </Button>
            <Button
              size="sm"
              onClick={() => handleAddState("project")}
              className="h-7 text-xs"
            >
              <Plus className="mr-1 size-3" />
              Add Status
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {projectGroups.map((group) => (
            <div key={group.type} className="space-y-1">
              <div>
                <h3 className="text-foreground text-sm font-medium">
                  {group.label}
                </h3>
              </div>

              <div className="space-y-1">
                {group.states.map((status) => (
                  <button
                    key={status.id}
                    className="bg-background hover:bg-muted/30 group flex w-full cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-left transition-colors"
                    onClick={() => handleEditState("project", status)}
                  >
                    {status.icon ? (
                      (() => {
                        const IconComponent =
                          getDynamicIcon(status.icon) ?? null;
                        return IconComponent ? (
                          <IconComponent
                            className="size-3 flex-shrink-0"
                            style={{ color: status.color || "#94a3b8" }}
                          />
                        ) : (
                          <div
                            className="size-2.5 flex-shrink-0 rounded-full"
                            style={{
                              backgroundColor: status.color || "#94a3b8",
                            }}
                          />
                        );
                      })()
                    ) : (
                      <div
                        className="size-2.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: status.color || "#94a3b8" }}
                      />
                    )}
                    <span className="flex-1 truncate text-xs font-medium">
                      {status.name}
                    </span>
                    <Pencil className="text-muted-foreground group-hover:text-foreground size-3 opacity-0 transition-colors group-hover:opacity-100" />
                  </button>
                ))}
                {group.states.length === 0 && (
                  <div className="text-muted-foreground px-2 py-1.5 text-xs italic">
                    No statuses configured
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {dialogState.isOpen && (
        <StatesManagementDialog
          type={dialogState.type}
          state={dialogState.editingState}
          existingStates={
            (dialogState.type === "issue"
              ? issueStates
              : projectStatuses) as WorkflowState[]
          }
          orgSlug={orgSlug}
          onClose={closeDialog}
          onSave={handleSaveState}
        />
      )}
    </div>
  );
}
