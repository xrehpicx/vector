'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, isToday, isYesterday, isThisWeek, isThisYear } from 'date-fns';
import { Circle, MoreHorizontal, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { getDynamicIcon, DynamicIcon } from '@/lib/dynamic-icons';
import { formatDateHuman } from '@/lib/date';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  PrioritySelector,
  StateSelector,
  TeamSelector,
  ProjectSelector,
  MultiAssigneeSelector,
} from '@/components/issues/issue-selectors';
import { PermissionAware } from '@/components/ui/permission-aware';
import { PERMISSIONS } from '@/convex/_shared/permissions';
import { getActivityIcon, getActivityLabel } from '@/lib/activity-icons';
import { LiveActivityBadge } from '@/components/issues/live-activity-indicator';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

import type {
  State,
  Priority,
  Team,
  Project,
} from '@/components/issues/issue-selectors';
import type { IssueRowData } from './issues-table';

export interface IssuesTimelineProps {
  orgSlug: string;
  issues: ReadonlyArray<IssueRowData>;
  states: ReadonlyArray<State>;
  priorities: ReadonlyArray<Priority>;
  teams: ReadonlyArray<Team>;
  projects: ReadonlyArray<Project>;
  currentUserId: string;
  canManageAssignees?: boolean;
  activeFilter: string;
  onPriorityChange?: (issueId: string, priorityId: string) => void;
  onAssigneesChange?: (issueId: string, assigneeIds: string[]) => void;
  onTeamChange?: (issueId: string, teamId: string) => void;
  onProjectChange?: (issueId: string, projectId: string) => void;
  onAssignmentStateChange?: (assignmentId: string, stateId: string) => void;
  onDelete?: (issueId: string) => void;
  deletePending?: boolean;
  isUpdatingAssignees?: boolean;
}

interface GroupedTimelineIssue {
  row: IssueRowData;
  /** updatedAt (falls back to _creationTime) — used for sorting & day grouping */
  sortTime: number;
  assigneeIds: string[];
  assignments: Array<{
    assignmentId: string;
    assigneeId: string | null;
    assigneeName: string | null;
    assigneeEmail: string | null;
    assigneeImage: string | null;
    stateId: string | null;
    stateIcon: string | null;
    stateColor: string | null;
    stateName: string | null;
    stateType: string | null;
  }>;
}

function formatDayLabel(timestamp: number): string {
  const date = new Date(timestamp);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  if (isThisWeek(date)) return format(date, 'EEEE');
  if (isThisYear(date)) return format(date, 'MMM d');
  return format(date, 'MMM d, yyyy');
}

function getDayKey(timestamp: number): string {
  return format(new Date(timestamp), 'yyyy-MM-dd');
}

function ActivityDot({ issue }: { issue: IssueRowData }) {
  const [open, setOpen] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout>>(null);

  const handleEnter = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };

  const handleLeave = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  const eventType = issue.lastActivityEventType;
  const isStateChange =
    eventType === 'issue_workflow_state_changed' ||
    eventType === 'issue_assignment_state_changed' ||
    !eventType;

  const { Icon: DotIcon, color: dotColor } = isStateChange
    ? { Icon: null, color: '' }
    : getActivityIcon(eventType);

  const label = isStateChange
    ? getActivityLabel(eventType ?? 'issue_workflow_state_changed')
    : getActivityLabel(eventType);

  const { Icon: ActivityIcon, color: activityColor } = isStateChange
    ? getActivityIcon('issue_workflow_state_changed')
    : getActivityIcon(eventType);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild nativeButton={false}>
        <div onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
          {/* Dot visual */}
          {isStateChange ? (
            <div
              className='bg-background relative z-10 flex size-[18px] shrink-0 cursor-default items-center justify-center rounded-full border transition-shadow hover:ring-2 hover:ring-current/20'
              style={{ color: issue.workflowStateColor ?? '#94a3b8' }}
            >
              <DynamicIcon
                name={issue.workflowStateIcon ?? 'circle'}
                className='size-2.5'
              />
            </div>
          ) : (
            <div
              className={cn(
                'bg-background relative z-10 flex size-[18px] shrink-0 cursor-default items-center justify-center rounded-full border transition-shadow hover:ring-2 hover:ring-current/20',
                dotColor,
              )}
            >
              {DotIcon && <DotIcon className='size-2.5' />}
            </div>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent
        side='right'
        sideOffset={8}
        className='w-48 p-2.5'
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        <div className='flex flex-col gap-1.5'>
          <div className='flex items-center gap-1.5'>
            <ActivityIcon className={cn('size-3.5 shrink-0', activityColor)} />
            <span className='text-xs leading-tight font-medium'>{label}</span>
          </div>
          {isStateChange && issue.workflowStateName && (
            <div className='flex items-center gap-1'>
              <DynamicIcon
                name={issue.workflowStateIcon ?? 'circle'}
                className='size-3 shrink-0'
                style={{ color: issue.workflowStateColor ?? '#94a3b8' }}
              />
              <span
                className='text-xs'
                style={{ color: issue.workflowStateColor ?? '#94a3b8' }}
              >
                {issue.workflowStateName}
              </span>
            </div>
          )}
          <p className='text-muted-foreground text-xs'>
            {formatDateHuman(new Date(issue.updatedAt))}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function IssuesTimeline({
  orgSlug,
  issues,
  states,
  priorities,
  teams,
  projects,
  currentUserId,
  canManageAssignees = false,
  activeFilter,
  onPriorityChange,
  onAssigneesChange,
  onTeamChange,
  onProjectChange,
  onAssignmentStateChange,
  onDelete,
  deletePending = false,
  isUpdatingAssignees = false,
}: IssuesTimelineProps) {
  const router = useRouter();

  // Deduplicate rows (one issue can have multiple assignment rows) — same as table
  const groupedIssues = React.useMemo(() => {
    const map = new Map<string, GroupedTimelineIssue>();

    for (const row of issues) {
      const existing = map.get(row.id);
      const assignment = {
        assignmentId: row.assignmentId!,
        assigneeId: row.assigneeId ?? null,
        assigneeName: row.assigneeName ?? null,
        assigneeEmail: row.assigneeEmail ?? null,
        assigneeImage: row.assigneeImage ?? null,
        stateId: row.stateId ?? null,
        stateIcon: row.stateIcon ?? null,
        stateColor: row.stateColor ?? null,
        stateName: row.stateName ?? null,
        stateType: row.stateType ?? null,
      };

      if (existing) {
        if (row.assigneeId && !existing.assigneeIds.includes(row.assigneeId)) {
          existing.assigneeIds.push(row.assigneeId);
        }
        existing.assignments.push(assignment);
        if (!existing.row.assigneeId && row.assigneeId) {
          existing.row = row;
        } else if (row.assigneeId === currentUserId) {
          existing.row = row;
        }
      } else {
        map.set(row.id, {
          row,
          sortTime: row.updatedAt ?? row._creationTime ?? 0,
          assigneeIds: row.assigneeId ? [row.assigneeId] : [],
          assignments: [assignment],
        });
      }
    }

    return [...map.values()];
  }, [issues, currentUserId]);

  // Filter by state tab, sort by most recently updated
  const sorted = React.useMemo(
    () => [...groupedIssues].sort((a, b) => b.sortTime - a.sortTime),
    [groupedIssues],
  );

  // Group by day (based on updatedAt)
  const dayGroups = React.useMemo(() => {
    const groups: Array<{
      dayKey: string;
      label: string;
      items: GroupedTimelineIssue[];
    }> = [];

    let currentDayKey: string | null = null;

    for (const item of sorted) {
      const dayKey = getDayKey(item.sortTime);
      if (dayKey !== currentDayKey) {
        currentDayKey = dayKey;
        groups.push({
          dayKey,
          label: formatDayLabel(item.sortTime),
          items: [item],
        });
      } else {
        groups[groups.length - 1].items.push(item);
      }
    }

    return groups;
  }, [sorted]);

  if (sorted.length === 0) {
    return (
      <div className='text-muted-foreground flex items-center justify-center py-12 text-sm'>
        No issues found
      </div>
    );
  }

  const renderItem = (
    { row: issue, assigneeIds, assignments }: GroupedTimelineIssue,
    isFirst: boolean,
    isLast: boolean,
  ) => {
    const PriorityIcon = issue.priorityIcon
      ? getDynamicIcon(issue.priorityIcon) || Circle
      : Circle;
    const priorityColor = issue.priorityColor || '#94a3b8';

    const viewerAssignment = assignments.find(
      a => a.assigneeId === currentUserId,
    );
    const displayStateId = viewerAssignment?.stateId ?? issue.workflowStateId;
    const displayAssignmentId =
      viewerAssignment?.assignmentId ??
      assignments.find(assignment => assignment.assignmentId !== 'unassigned')
        ?.assignmentId;

    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ duration: 0.15 }}
        key={issue.id}
        className='flex items-center gap-0'
      >
        {/* Timeline dot column — fixed width, dot centered on the line */}
        <div className='relative flex w-6 shrink-0 items-center justify-center self-stretch'>
          {/* Vertical line — top half (hidden on first item) */}
          {!isFirst && (
            <div className='bg-border absolute top-0 left-1/2 h-1/2 w-px -translate-x-1/2' />
          )}
          {/* Vertical line — bottom half (hidden on last item) */}
          {!isLast && (
            <div className='bg-border absolute bottom-0 left-1/2 h-1/2 w-px -translate-x-1/2' />
          )}
          {/* Dot — reflects the most recent activity, falls back to workflow state icon */}
          <ActivityDot issue={issue} />
        </div>

        {/* Issue row — same interaction pattern as table */}
        <div
          onClick={e => {
            const target = e.target as HTMLElement;
            if (
              target.closest(
                'button, [role="combobox"], [data-radix-popper-content-wrapper], a',
              )
            ) {
              return;
            }
            router.push(`/${orgSlug}/issues/${issue.key}`);
          }}
          className='hover:bg-muted/50 flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors'
        >
          {/* Priority selector */}
          {onPriorityChange && (
            <div
              onPointerDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
            >
              <PermissionAware
                orgSlug={orgSlug}
                permission={PERMISSIONS.ISSUE_PRIORITY_UPDATE}
                fallbackMessage="You don't have permission to change issue priority"
              >
                <PrioritySelector
                  priorities={priorities as Priority[]}
                  selectedPriority={issue.priorityId || ''}
                  onPrioritySelect={pid => onPriorityChange(issue.id, pid)}
                  displayMode='labelOnly'
                  trigger={
                    <Button
                      variant='ghost'
                      size='icon'
                      className='size-6 shrink-0 rounded-md'
                      aria-label='Change issue priority'
                    >
                      <PriorityIcon
                        className='size-4'
                        style={{ color: priorityColor }}
                      />
                    </Button>
                  }
                  className='border-none bg-transparent p-0 shadow-none'
                />
              </PermissionAware>
            </div>
          )}

          {/* State selector */}
          {onAssignmentStateChange && displayAssignmentId && (
            <div
              onPointerDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
            >
              <PermissionAware
                orgSlug={orgSlug}
                permission={PERMISSIONS.ISSUE_STATE_UPDATE}
                fallbackMessage="You don't have permission to change issue state"
              >
                <StateSelector
                  states={states}
                  selectedState={displayStateId || ''}
                  onStateSelect={stateId =>
                    onAssignmentStateChange(displayAssignmentId, stateId)
                  }
                  displayMode='labelOnly'
                  className='border-none bg-transparent p-0 shadow-none'
                />
              </PermissionAware>
            </div>
          )}

          {/* Issue key */}
          <span className='text-muted-foreground hidden shrink-0 font-mono text-xs sm:inline'>
            {issue.key}
          </span>

          {/* Title */}
          <div className='flex min-w-0 flex-1 items-center gap-1.5'>
            <Link
              href={`/${orgSlug}/issues/${issue.key}`}
              className='hover:text-primary truncate text-sm font-medium transition-colors'
            >
              {issue.title}
            </Link>
            {issue.activeLiveActivities &&
              issue.activeLiveActivities.length > 0 && (
                <LiveActivityBadge activities={issue.activeLiveActivities} />
              )}
          </div>

          {/* Team / Project selectors — hidden on mobile */}
          <div className='hidden items-center gap-1 md:flex'>
            {issue.teamKey && onTeamChange && (
              <div
                onPointerDown={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
              >
                <PermissionAware
                  orgSlug={orgSlug}
                  permission={PERMISSIONS.ISSUE_EDIT}
                  fallbackMessage="You don't have permission to change issue team"
                >
                  <TeamSelector
                    teams={teams}
                    selectedTeam={
                      teams.find(t => t.key === issue.teamKey)?._id || ''
                    }
                    onTeamSelect={tid => onTeamChange(issue.id, tid)}
                  />
                </PermissionAware>
              </div>
            )}
            {issue.projectKey && onProjectChange && (
              <div
                onPointerDown={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
              >
                <PermissionAware
                  orgSlug={orgSlug}
                  permission={PERMISSIONS.ISSUE_EDIT}
                  fallbackMessage="You don't have permission to change issue project"
                >
                  <ProjectSelector
                    projects={projects}
                    selectedProject={
                      projects.find(p => p.key === issue.projectKey)?._id || ''
                    }
                    onProjectSelect={pid => onProjectChange(issue.id, pid)}
                  />
                </PermissionAware>
              </div>
            )}
          </div>

          {/* Last updated time */}
          <span className='text-muted-foreground hidden shrink-0 text-xs sm:inline'>
            {formatDateHuman(new Date(issue.updatedAt))}
          </span>

          {/* Assignees */}
          {onAssigneesChange && (
            <div
              onPointerDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
            >
              <MultiAssigneeSelector
                orgSlug={orgSlug}
                selectedAssigneeIds={assigneeIds}
                onAssigneesChange={ids => onAssigneesChange(issue.id!, ids)}
                isLoading={isUpdatingAssignees}
                highlightAssigneeId={null}
                assignments={assignments}
                activeFilter={activeFilter}
                currentUserId={currentUserId}
                canManageAll={canManageAssignees}
              />
            </div>
          )}

          {/* Actions */}
          {onDelete && (
            <div className='shrink-0'>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='h-6 w-6 p-0'
                    aria-label='Open issue actions'
                  >
                    <MoreHorizontal className='size-4' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  <DropdownMenuItem
                    variant='destructive'
                    disabled={deletePending}
                    onClick={() => onDelete(issue.id!)}
                  >
                    <Trash2 className='size-4' />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className='px-3 py-2'>
      {dayGroups.map((group, groupIdx) => (
        <div key={group.dayKey} className={cn(groupIdx > 0 && 'mt-3')}>
          {/* Day header */}
          <div className='text-muted-foreground mb-0.5 flex items-center gap-2 text-xs font-medium'>
            <span>{group.label}</span>
            <span className='text-muted-foreground/50'>
              {group.items.length}
            </span>
          </div>

          {/* Timeline track */}
          <div>
            <AnimatePresence initial={false}>
              {group.items.map((item, idx) =>
                renderItem(item, idx === 0, idx === group.items.length - 1),
              )}
            </AnimatePresence>
          </div>
        </div>
      ))}
    </div>
  );
}
