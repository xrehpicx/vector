"use client";

import { useState } from "react";

// UI primitives
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

// Utils & helpers
import { cn } from "@/lib/utils";
import { getDynamicIcon } from "@/lib/dynamic-icons";

// Icons
import { Users, FolderOpen, User, Check } from "lucide-react";

// ---------------------------------------------------------------------------
// 🧩 Type inference – derive types directly from tRPC router outputs
// ---------------------------------------------------------------------------
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/trpc/routers/_app";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type Team = RouterOutputs["organization"]["listTeams"][number];
export type Project = RouterOutputs["organization"]["listProjects"][number];
export type State = RouterOutputs["organization"]["listIssueStates"][number];
export type Member = RouterOutputs["organization"]["listMembers"][number];
export type Priority =
  RouterOutputs["organization"]["listIssuePriorities"][number];

// ---------------------------------------------------------------------------
// Display variant for how the button shows icon/label
// ---------------------------------------------------------------------------
export type SelectorDisplayMode =
  | "default" // icon + label
  | "labelOnly" // label only (no icon)
  | "iconOnly" // icon only (no label, always)
  | "iconWhenUnselected"; // icon when unselected, icon+label once a value selected

function resolveVisibility(
  mode: SelectorDisplayMode | undefined,
  hasSelection: boolean,
): { showIcon: boolean; showLabel: boolean } {
  switch (mode) {
    case "labelOnly":
      return { showIcon: false, showLabel: true };
    case "iconOnly":
      return { showIcon: true, showLabel: false };
    case "iconWhenUnselected":
      return { showIcon: true, showLabel: hasSelection };
    case "default":
    default:
      return { showIcon: true, showLabel: true };
  }
}

// ---------------------------------------------------------------------------
// Selector components
// ---------------------------------------------------------------------------

// Re-export shared TeamSelector implementation
export { TeamSelector } from "@/components/teams/team-selector";

// Project Selector -----------------------------------------------------------
interface ProjectSelectorProps {
  projects: Project[];
  selectedProject: string;
  onProjectSelect: (projectId: string) => void;
  displayMode?: SelectorDisplayMode;
  trigger?: React.ReactElement;
  className?: string;
  /** Position of the popover relative to its trigger. */
  align?: "start" | "center" | "end";
}

export function ProjectSelector({
  projects,
  selectedProject,
  onProjectSelect,
  displayMode,
  trigger,
  className,
  align = "start",
}: ProjectSelectorProps & { align?: "start" | "center" | "end" }) {
  const [open, setOpen] = useState(false);

  // Always render selector even when no projects to make the control discoverable.

  const hasSelection = selectedProject !== "";
  const { showIcon, showLabel } = resolveVisibility(displayMode, hasSelection);

  const DefaultBtn = (
    <Button
      variant="outline"
      size="sm"
      className={cn("bg-muted/30 hover:bg-muted/50 h-8 gap-2", className)}
    >
      {showIcon && <FolderOpen className="h-3 w-3" />}
      {showLabel &&
        (selectedProject
          ? projects.find((p) => p.id === selectedProject)?.name
          : "Project")}
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger ?? DefaultBtn}</PopoverTrigger>
      <PopoverContent align={align} className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Search project..." className="h-9" />
          <CommandList>
            <CommandEmpty>No project found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value=""
                onSelect={() => {
                  onProjectSelect("");
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    selectedProject === "" ? "opacity-100" : "opacity-0",
                  )}
                />
                None
              </CommandItem>
              {projects.map((project) => (
                <CommandItem
                  key={project.id}
                  value={project.name}
                  onSelect={() => {
                    onProjectSelect(project.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedProject === project.id
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  {project.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// State Selector -------------------------------------------------------------
interface StateSelectorProps {
  states: readonly State[] | State[];
  selectedState: string;
  onStateSelect: (stateId: string) => void;
  displayMode?: SelectorDisplayMode;
  trigger?: React.ReactElement;
  className?: string;
  /** Position of the popover relative to its trigger. */
  align?: "start" | "center" | "end";
}

export function StateSelector({
  states,
  selectedState,
  onStateSelect,
  displayMode,
  trigger,
  className,
  align = "start",
}: StateSelectorProps & { align?: "start" | "center" | "end" }) {
  const [open, setOpen] = useState(false);

  // Transform states from API into combobox-friendly structure
  const stateOptions = states.map((s) => ({
    value: s.id,
    label: s.name,
    color: s.color || "#94a3b8", // fallback to default gray
  }));

  // Helper: currently selected state data
  const getSelectedStateData = () => {
    if (!selectedState) {
      const defaultState = states.find((s) => s.type === "todo") || states[0];
      return {
        color: defaultState?.color || "#94a3b8",
        name: defaultState?.name || "Select state...",
        icon: defaultState?.icon,
      };
    }
    const state = states.find((s) => s.id === selectedState);
    return {
      color: state?.color || "#94a3b8",
      name: state?.name || "Select state...",
      icon: state?.icon,
    };
  };

  const selectedStateData = getSelectedStateData();
  const SelectedStateIcon = selectedStateData.icon
    ? getDynamicIcon(selectedStateData.icon)
    : null;

  const hasSelection = selectedState !== "";
  const { showIcon, showLabel } = resolveVisibility(displayMode, hasSelection);

  const DefaultBtn = (
    <Button
      variant="outline"
      size="sm"
      className={cn("bg-muted/30 hover:bg-muted/50 h-8 gap-2", className)}
    >
      {showIcon &&
        (SelectedStateIcon ? (
          <SelectedStateIcon
            className="h-3 w-3"
            style={{ color: selectedStateData.color }}
          />
        ) : (
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: selectedStateData.color }}
          />
        ))}
      {showLabel && selectedStateData.name}
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger ?? DefaultBtn}</PopoverTrigger>
      <PopoverContent align={align} className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Search state..." className="h-9" />
          <CommandList>
            <CommandEmpty>No state found.</CommandEmpty>
            <CommandGroup>
              {stateOptions.map((state) => {
                const stateData = states.find((s) => s.id === state.value);
                const StateIcon = stateData?.icon
                  ? getDynamicIcon(stateData.icon)
                  : null;

                return (
                  <CommandItem
                    key={state.value}
                    value={state.label}
                    onSelect={() => {
                      onStateSelect(state.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedState === state.value
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    {StateIcon ? (
                      <StateIcon
                        className="mr-2 h-3 w-3"
                        style={{ color: state.color }}
                      />
                    ) : (
                      <div
                        className="mr-2 h-2 w-2 rounded-full"
                        style={{ backgroundColor: state.color }}
                      />
                    )}
                    {state.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Priority Selector ----------------------------------------------------------
interface PrioritySelectorProps {
  priorities: readonly Priority[] | Priority[];
  selectedPriority: string;
  onPrioritySelect: (priorityId: string) => void;
  displayMode?: SelectorDisplayMode;
  trigger?: React.ReactElement;
  className?: string;
  /** Position of the popover relative to its trigger. */
  align?: "start" | "center" | "end";
}

export function PrioritySelector({
  priorities,
  selectedPriority,
  onPrioritySelect,
  displayMode,
  trigger,
  className,
  align = "start",
}: PrioritySelectorProps & { align?: "start" | "center" | "end" }) {
  const [open, setOpen] = useState(false);

  if (priorities.length === 0) return null;

  const hasSelection = selectedPriority !== "";
  const { showIcon, showLabel } = resolveVisibility(displayMode, hasSelection);

  const current = priorities.find((p) => p.id === selectedPriority);
  const currentColor = current?.color || "#94a3b8";
  const currentName = current?.name || "Priority";
  const currentIconName = current?.icon;
  const CurrentIcon = currentIconName ? getDynamicIcon(currentIconName) : null;

  const DefaultBtn = (
    <Button
      variant="outline"
      size="sm"
      className={cn("bg-muted/30 hover:bg-muted/50 h-8 gap-2", className)}
    >
      {showIcon &&
        (CurrentIcon ? (
          <CurrentIcon className="h-3 w-3" style={{ color: currentColor }} />
        ) : (
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: currentColor }}
          />
        ))}
      {showLabel && currentName}
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger ?? DefaultBtn}</PopoverTrigger>
      <PopoverContent align={align} className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Search priority..." className="h-9" />
          <CommandList>
            <CommandEmpty>No priority found.</CommandEmpty>
            <CommandGroup>
              {priorities.map((priority) => {
                const Icon = priority.icon
                  ? getDynamicIcon(priority.icon)
                  : null;
                return (
                  <CommandItem
                    key={priority.id}
                    value={priority.name}
                    onSelect={() => {
                      onPrioritySelect(priority.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedPriority === priority.id
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    {Icon ? (
                      <Icon
                        className="mr-2 h-3 w-3"
                        style={{ color: priority.color || "#94a3b8" }}
                      />
                    ) : (
                      <div
                        className="mr-2 h-2 w-2 rounded-full"
                        style={{ backgroundColor: priority.color || "#94a3b8" }}
                      />
                    )}
                    {priority.name}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Assignee Selector ----------------------------------------------------------
interface AssigneeSelectorProps {
  members: Member[];
  selectedAssignee?: string;
  onAssigneeSelect?: (assigneeId: string) => void;
  selectedAssignees?: string[];
  onAssigneesSelect?: (assigneeIds: string[]) => void;
  multiple?: boolean;
  displayMode?: SelectorDisplayMode;
  trigger?: React.ReactElement;
  className?: string;
  /** Position of the popover relative to its trigger. */
  align?: "start" | "center" | "end";
}

export function AssigneeSelector({
  members,
  selectedAssignee,
  onAssigneeSelect,
  selectedAssignees = [],
  onAssigneesSelect,
  multiple = false,
  displayMode,
  trigger,
  className,
  align = "start",
}: AssigneeSelectorProps & { align?: "start" | "center" | "end" }) {
  const [open, setOpen] = useState(false);

  if (members.length === 0) return null;

  const hasSelection = multiple
    ? selectedAssignees.length > 0
    : (selectedAssignee || "") !== "";
  const { showIcon, showLabel } = resolveVisibility(displayMode, hasSelection);

  const handleSelect = (userId: string) => {
    if (multiple && onAssigneesSelect) {
      const isSelected = selectedAssignees.includes(userId);
      if (isSelected) {
        onAssigneesSelect(selectedAssignees.filter((id) => id !== userId));
      } else {
        onAssigneesSelect([...selectedAssignees, userId]);
      }
      // Keep popover open for multiple selection
    } else if (onAssigneeSelect) {
      onAssigneeSelect(userId);
      setOpen(false);
    }
  };

  const getDisplayText = () => {
    if (multiple) {
      if (selectedAssignees.length === 0) return "Assignees";
      if (selectedAssignees.length === 1) {
        const member = members.find((m) => m.userId === selectedAssignees[0]);
        return member?.name || "1 assignee";
      }
      return `${selectedAssignees.length} assignees`;
    } else {
      if (!selectedAssignee) return "Assignee";
      return (
        members.find((m) => m.userId === selectedAssignee)?.name || "Assignee"
      );
    }
  };

  const DefaultBtn = (
    <Button
      variant="outline"
      size="sm"
      className={cn("bg-muted/30 hover:bg-muted/50 h-8 gap-2", className)}
    >
      {showIcon && <User className="h-3 w-3" />}
      {showLabel && getDisplayText()}
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger ?? DefaultBtn}</PopoverTrigger>
      <PopoverContent align={align} className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Search assignee..." className="h-9" />
          <CommandList>
            <CommandEmpty>No member found.</CommandEmpty>
            <CommandGroup>
              {!multiple && (
                <CommandItem
                  value=""
                  onSelect={() => {
                    handleSelect("");
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      (selectedAssignee || "") === ""
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  Unassigned
                </CommandItem>
              )}
              {members.map((member) => (
                <CommandItem
                  key={member.userId}
                  value={member.name || member.email}
                  onSelect={() => {
                    handleSelect(member.userId);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      multiple
                        ? selectedAssignees.includes(member.userId)
                          ? "opacity-100"
                          : "opacity-0"
                        : (selectedAssignee || "") === member.userId
                          ? "opacity-100"
                          : "opacity-0",
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="text-sm">{member.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {member.email}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
