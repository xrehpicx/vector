"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/lib/convex";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Building2,
  Users,
  FolderOpen,
  Check,
  MoreHorizontal,
  Plus,
  ClockPlus,
  ClockAlert,
} from "lucide-react";
import { Textarea } from "../ui/textarea";
import { cn } from "@/lib/utils";
import { Id } from "@/convex/_generated/dataModel";
import { withIds, toConvexId } from "@/lib/convex-helpers";
import { toast } from "sonner";

// Extracted selector components
import {
  TeamSelector,
  ProjectSelector,
  StateSelector,
  PrioritySelector,
  AssigneeSelector,
  DateSelector,
  TimeEstimatesSelector,
  type Team,
  type Project,
  type State,
  type Priority,
} from "./issue-selectors";

// Types with id field added by withIds transformation
type TeamWithId = Team & { id: string };
type ProjectWithId = Project & { id: string };
type StateWithId = State & { id: string };
type PriorityWithId = Priority & { id: string };

// ---------------------------------------------------------------------------
// 🧩 Type inference – derive types directly from Convex API
// ---------------------------------------------------------------------------

// Key Format Selector Component
interface KeyFormatSelectorProps {
  manualFormatOverride: "team" | "project" | "org" | null;
  setManualFormatOverride: (value: "team" | "project" | "org" | null) => void;
  preview: string;
}

function KeyFormatSelector({
  manualFormatOverride,
  setManualFormatOverride,
  preview,
}: KeyFormatSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs">Issue Key:</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs">
            {preview}
            <MoreHorizontal className="ml-1 h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem
            onClick={() => setManualFormatOverride("org")}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Organization-based
            </div>
            {manualFormatOverride === "org" && <Check className="h-3 w-3" />}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setManualFormatOverride("team")}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team-based
            </div>
            {manualFormatOverride === "team" && <Check className="h-3 w-3" />}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setManualFormatOverride("project")}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Project-based
            </div>
            {manualFormatOverride === "project" && (
              <Check className="h-3 w-3" />
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setManualFormatOverride(null)}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Auto-detect</span>
            </div>
            {manualFormatOverride === null && <Check className="h-3 w-3" />}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// Main Create Issue Dialog
export interface CreateIssueDialogProps {
  orgSlug: string;
  teamId?: string;
  projectId?: string;
  onSuccess?: (issueId: string) => void;
  className?: string;
  open?: boolean;
  onClose?: () => void;
  defaultAssignee?: string;
}

export function CreateIssueDialog({
  orgSlug,
  teamId: initialTeamId,
  projectId: initialProjectId,
  onSuccess,
  className,
  open,
  onClose,
  defaultAssignee: initialAssignee,
}: CreateIssueDialogProps) {
  const [isOpen, setIsOpen] = useState(open ?? false);
  // ---------------------------------------------
  //   Form state
  // ---------------------------------------------
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTeam, setSelectedTeam] = useState(initialTeamId || "");
  const [selectedProject, setSelectedProject] = useState(
    initialProjectId || "",
  );
  const [selectedState, setSelectedState] = useState("");
  const [selectedPriority, setSelectedPriority] = useState("");
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>(
    initialAssignee ? [initialAssignee] : [],
  );
  const [manualFormatOverride, setManualFormatOverride] = useState<
    "team" | "project" | "org" | null
  >(null);
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [estimatedTimes, setEstimatedTimes] = useState<{
    [key: string]: number;
  }>({});

  // ---------------------------------------------
  //   Fetch data (teams, projects, states)
  // ---------------------------------------------
  // Get teams and projects data
  const teamsData = useQuery(api.organizations.listTeams, { orgSlug });
  const projectsData = useQuery(api.organizations.listProjects, { orgSlug });
  const statesData = useQuery(api.organizations.listIssueStates, { orgSlug });
  const membersData = useQuery(api.organizations.listMembers, { orgSlug });
  const prioritiesData = useQuery(api.organizations.listIssuePriorities, {
    orgSlug,
  });

  // Transform data to maintain frontend compatibility
  const teams = teamsData ? withIds(teamsData) : [];
  const projects = projectsData ? withIds(projectsData) : [];
  const states = statesData ? withIds(statesData) : [];
  const members = membersData ? withIds(membersData) : [];
  const priorities = prioritiesData ? withIds(prioritiesData) : [];

  // Auto-infer the format based on selections
  const getEffectiveFormat = (): "team" | "project" | "org" => {
    // Manual override takes precedence
    if (manualFormatOverride) {
      return manualFormatOverride;
    }

    // Auto-infer: Project > Team > Org
    if (selectedProject) {
      return "project";
    }
    if (selectedTeam) {
      return "team";
    }
    return "org";
  };

  const effectiveFormat = getEffectiveFormat();

  // Auto-select the first "todo" state as default
  useEffect(() => {
    if (states.length > 0 && !selectedState) {
      const defaultState =
        states.find((state: StateWithId) => state.type === "todo") || states[0];
      setSelectedState(defaultState.id);
    }
  }, [states, selectedState]);

  // Auto-select default priority (weight === 0) once priorities load
  useEffect(() => {
    if (priorities.length > 0 && !selectedPriority) {
      const defaultPriority =
        priorities.find((p: PriorityWithId) => p.weight === 0) || priorities[0];
      if (defaultPriority) {
        setSelectedPriority(defaultPriority.id);
      }
    }
  }, [priorities, selectedPriority]);

  const createIssueMutation = useMutation(api.issues.create);

  const [isLoading, setIsLoading] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;

    setIsLoading(true);
    try {
      const result = await createIssueMutation({
        orgSlug,
        data: {
          title,
          description,
          projectId: selectedProject as Id<"projects">,
          stateId: selectedState as Id<"issueStates"> | undefined,
          priorityId: selectedPriority as Id<"issuePriorities"> | undefined,
          assigneeIds: selectedAssignees as Id<"users">[],
        },
      });

      toast.success(`Issue ${result.key} created`);
      onSuccess?.(result.issueId);
      handleClose();

      // Reset form
      setTitle("");
      setDescription("");
      setSelectedTeam(initialTeamId || "");
      setSelectedProject(initialProjectId || "");
      setSelectedState("");
      setSelectedPriority("");
      setSelectedAssignees(initialAssignee ? [initialAssignee] : []);
      setManualFormatOverride(null);
      setStartDate("");
      setDueDate("");
      setEstimatedTimes({});
    } catch (error) {
      toast.error("Failed to create issue");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    onClose?.();
  };

  const getIssueKeyPreview = () => {
    const nextNumber = 1; // Placeholder for preview

    // Show different examples based on manual override
    if (manualFormatOverride === "team") {
      const team = teams.find((t: TeamWithId) => t.id === selectedTeam);
      return team ? `${team.key}-${nextNumber}` : `TEAM-${nextNumber}`;
    }
    if (manualFormatOverride === "project") {
      const project = projects.find(
        (p: ProjectWithId) => p.id === selectedProject,
      );
      return project ? `${project.key}-${nextNumber}` : `PROJ-${nextNumber}`;
    }
    if (manualFormatOverride === "org") {
      return `${orgSlug.toUpperCase()}-${nextNumber}`;
    }

    // Auto-detect example
    if (selectedProject) {
      const project = projects.find(
        (p: ProjectWithId) => p.id === selectedProject,
      );
      return project ? `${project.key}-${nextNumber}` : `PROJ-${nextNumber}`;
    }
    if (selectedTeam) {
      const team = teams.find((t: TeamWithId) => t.id === selectedTeam);
      return team ? `${team.key}-${nextNumber}` : `TEAM-${nextNumber}`;
    }
    return `${orgSlug.toUpperCase()}-${nextNumber}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="flex h-[90vh] max-w-2xl flex-col p-0">
        <DialogHeader className="border-b p-4">
          <div className="flex items-center justify-between">
            <DialogTitle>Create Issue</DialogTitle>
            <KeyFormatSelector
              manualFormatOverride={manualFormatOverride}
              setManualFormatOverride={setManualFormatOverride}
              preview={getIssueKeyPreview()}
            />
          </div>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleCreate();
          }}
          className="flex flex-1 flex-col"
        >
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {/* Title */}
            <div>
              <Input
                placeholder="Issue title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-base"
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <Textarea
                placeholder="Add a description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[100px] resize-none"
              />
            </div>

            {/* Selectors Grid */}
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Team & Project */}
              <TeamSelector
                teams={teams}
                selectedTeam={selectedTeam}
                onTeamSelect={setSelectedTeam}
              />
              <ProjectSelector
                projects={projects}
                selectedProject={selectedProject}
                onProjectSelect={setSelectedProject}
              />

              {/* State & Priority */}
              <StateSelector
                states={states}
                selectedState={selectedState}
                onStateSelect={setSelectedState}
              />
              <PrioritySelector
                priorities={priorities}
                selectedPriority={selectedPriority}
                onPrioritySelect={setSelectedPriority}
              />

              {/* Assignee */}
              <div className="sm:col-span-2">
                <AssigneeSelector
                  members={members}
                  selectedAssignee={selectedAssignees[0] || ""}
                  onAssigneeSelect={(assigneeId) =>
                    setSelectedAssignees(assigneeId ? [assigneeId] : [])
                  }
                />
              </div>

              {/* Date fields - simplified for now */}
              <div>
                <label className="text-sm font-medium">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-muted/20 border-t px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="text-muted-foreground text-xs">
                Preview: <code className="text-xs">{getIssueKeyPreview()}</code>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleClose}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={!title.trim() || isLoading}>
                  {isLoading ? "Creating..." : "Create Issue"}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
