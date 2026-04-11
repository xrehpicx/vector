'use client';

import Link from 'next/link';
import { useRouter } from 'nextjs-toploader/app';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { useDraggable } from '@dnd-kit/core';

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  GitPullRequest,
  MoreHorizontal,
  Trash2,
  Circle,
  ArrowUp,
  EyeOff,
  CalendarClock,
} from 'lucide-react';
import React from 'react';

import {
  PrioritySelector,
  StateSelector,
  TeamSelector,
  ProjectSelector,
  MultiAssigneeSelector,
} from '@/components/issues/issue-selectors';
import { DynamicIcon } from '@/lib/dynamic-icons';
import { formatDateHuman } from '@/lib/date';
import { groupIssues, type IssueGroupByField } from '@/lib/group-by';
import { GroupSection } from '@/components/ui/group-section';
import { Prettify, cn } from '@/lib/utils';

// Re-exported entity from the selector module give us fully-typed data
import type {
  Team,
  Project,
  State,
  Priority,
} from '@/components/issues/issue-selectors';
import { api } from '@/convex/_generated/api';
import { FunctionReturnType } from 'convex/server';

// Permission system
import { PermissionAware } from '@/components/ui/permission-aware';
import { PERMISSIONS } from '@/convex/_shared/permissions';
import { LiveActivityBadge } from '@/components/issues/live-activity-indicator';

// Infer issue row type directly from tRPC router output to stay in sync with DB.
export type IssueRowData = Prettify<
  FunctionReturnType<typeof api.issues.queries.listIssues>['issues'][number]
>;

export interface IssuesTableProps {
  orgSlug: string;
  issues: ReadonlyArray<IssueRowData>;
  states: ReadonlyArray<State>;
  priorities: ReadonlyArray<Priority>;
  teams: ReadonlyArray<Team>;
  projects: ReadonlyArray<Project>;
  onPriorityChange: (issueId: string, priorityId: string) => void;

  onAssigneesChange: (issueId: string, assigneeIds: string[]) => void;
  onTeamChange: (issueId: string, teamId: string) => void;
  onProjectChange: (issueId: string, projectId: string) => void;
  onDelete: (issueId: string) => void;
  onExclude?: (issueId: string) => void;
  deletePending?: boolean;
  isUpdatingAssignees?: boolean;
  onAssignmentStateChange: (assignmentId: string, stateId: string) => void;
  isUpdatingAssignmentStates?: boolean;
  currentUserId: string;
  canManageAssignees?: boolean;
  activeFilter: string;
  groupBy?: IssueGroupByField;
}

type IssueAssignmentSummary = {
  assignmentId: string;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  assigneeImage?: string | null;
  stateId: string | null;
  stateIcon: string | null;
  stateColor: string | null;
  stateName: string | null;
  stateType: string | null;
};

type GroupedIssueEntry = {
  row: IssueRowData;
  assigneeIds: string[];
  assignments: IssueAssignmentSummary[];
};

export function IssuesTable({
  orgSlug,
  issues,
  states,
  priorities,
  teams,
  projects,
  onPriorityChange,
  onAssigneesChange,
  onTeamChange,
  onProjectChange,
  onDelete,
  onExclude,
  deletePending = false,
  isUpdatingAssignees = false,
  onAssignmentStateChange,
  isUpdatingAssignmentStates: _isUpdatingAssignmentStates = false,
  currentUserId,
  canManageAssignees = false,
  activeFilter,
  groupBy = 'none',
}: IssuesTableProps) {
  const groupedIssues = React.useMemo(() => {
    const map = new Map<string, GroupedIssueEntry>();

    issues.forEach(row => {
      const existing = map.get(row.id);

      if (existing) {
        if (row.assigneeId && !existing.assigneeIds.includes(row.assigneeId)) {
          existing.assigneeIds.push(row.assigneeId);
        }

        existing.assignments.push({
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
        });
      } else {
        map.set(row.id, {
          row,
          assigneeIds: row.assigneeId ? [row.assigneeId] : [],
          assignments: [
            {
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
            },
          ],
        });
      }
    });
    return Array.from(map.values());
  }, [issues]);

  const sortedGrouped = React.useMemo(
    () => [...groupedIssues].sort((a, b) => b.row.updatedAt - a.row.updatedAt),
    [groupedIssues],
  );

  const groups = React.useMemo(() => {
    if (!groupBy || groupBy === 'none') return null;
    return groupIssues(sortedGrouped, groupBy);
  }, [sortedGrouped, groupBy]);

  if (issues.length === 0) {
    return (
      <div className='text-muted-foreground flex items-center justify-center py-12 text-sm'>
        No issues found
      </div>
    );
  }

  const renderIssueRow = ({
    row: issue,
    assigneeIds,
    assignments,
  }: (typeof sortedGrouped)[number]) => {
    return (
      <IssueTableRow
        key={issue.id}
        orgSlug={orgSlug}
        issue={issue}
        assigneeIds={assigneeIds}
        assignments={assignments}
        states={states}
        priorities={priorities}
        teams={teams}
        projects={projects}
        onPriorityChange={onPriorityChange}
        onAssigneesChange={onAssigneesChange}
        onTeamChange={onTeamChange}
        onProjectChange={onProjectChange}
        onDelete={onDelete}
        onExclude={onExclude}
        deletePending={deletePending}
        isUpdatingAssignees={isUpdatingAssignees}
        onAssignmentStateChange={onAssignmentStateChange}
        currentUserId={currentUserId}
        canManageAssignees={canManageAssignees}
        activeFilter={activeFilter}
      />
    );
  };

  if (groups) {
    return (
      <div>
        {groups.map(group => (
          <GroupSection
            key={group.key}
            label={group.label}
            count={group.items.length}
            icon={group.icon}
            color={group.color}
            avatar={group.avatar}
          >
            <div className='divide-y'>
              <AnimatePresence initial={false}>
                {group.items.map(renderIssueRow)}
              </AnimatePresence>
            </div>
          </GroupSection>
        ))}
      </div>
    );
  }

  return (
    <div className='divide-y'>
      <AnimatePresence initial={false}>
        {sortedGrouped.map(renderIssueRow)}
      </AnimatePresence>
    </div>
  );
}

function IssueTableRow({
  orgSlug,
  issue,
  assigneeIds,
  assignments,
  states,
  priorities,
  teams,
  projects,
  onPriorityChange,
  onAssigneesChange,
  onTeamChange,
  onProjectChange,
  onDelete,
  onExclude,
  deletePending,
  isUpdatingAssignees,
  onAssignmentStateChange,
  currentUserId,
  canManageAssignees,
  activeFilter,
}: {
  orgSlug: string;
  issue: IssueRowData;
  assigneeIds: string[];
  assignments: IssueAssignmentSummary[];
  states: ReadonlyArray<State>;
  priorities: ReadonlyArray<Priority>;
  teams: ReadonlyArray<Team>;
  projects: ReadonlyArray<Project>;
  onPriorityChange: (issueId: string, priorityId: string) => void;
  onAssigneesChange: (issueId: string, assigneeIds: string[]) => void;
  onTeamChange: (issueId: string, teamId: string) => void;
  onProjectChange: (issueId: string, projectId: string) => void;
  onDelete: (issueId: string) => void;
  onExclude?: (issueId: string) => void;
  deletePending: boolean;
  isUpdatingAssignees: boolean;
  onAssignmentStateChange: (assignmentId: string, stateId: string) => void;
  currentUserId: string;
  canManageAssignees: boolean;
  activeFilter: string;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, isDragging, transform } =
    useDraggable({
      id: `issue-row:${issue.id}`,
      data: {
        type: 'issue',
        origin: 'table',
        id: issue.id,
        key: issue.key,
        title: issue.title,
        href: `/${orgSlug}/issues/${issue.key}`,
        icon: issue.workflowStateIcon ?? null,
        color: issue.workflowStateColor ?? null,
      },
    });

  const priorityColor = issue.priorityColor || '#94a3b8';
  const viewerAssignment = assignments.find(
    assignment => assignment.assigneeId === currentUserId,
  );
  const displayStateId = viewerAssignment?.stateId ?? issue.workflowStateId;
  const displayAssignmentId =
    viewerAssignment?.assignmentId ??
    assignments.find(assignment => assignment.assignmentId !== 'unassigned')
      ?.assignmentId;
  const dragStyle = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <motion.div
      ref={setNodeRef}
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2 }}
      {...listeners}
      {...attributes}
      style={dragStyle}
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
      className={cn(
        'hover:bg-muted/50 flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors',
        isDragging &&
          'bg-background z-10 opacity-85 shadow-sm ring-1 ring-black/5',
      )}
    >
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
                <DynamicIcon
                  name={issue.priorityIcon}
                  className='size-4'
                  style={{ color: priorityColor }}
                  fallback={Circle}
                />
              </Button>
            }
            className='border-none bg-transparent p-0 shadow-none'
          />
        </PermissionAware>
      </div>

      <div className='hidden flex-shrink-0 items-center gap-2 sm:flex'>
        <span className='text-muted-foreground font-mono text-xs'>
          {issue.key}
        </span>
        {issue.parentIssueKey && (
          <div className='hidden items-center gap-1 md:flex'>
            <ArrowUp className='text-muted-foreground/60 h-3 w-3' />
            <span className='text-muted-foreground/60 font-mono text-xs'>
              {issue.parentIssueKey}
            </span>
          </div>
        )}
      </div>

      {displayAssignmentId && (
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

      <div className='hidden md:contents'>
        {issue.teamKey && (
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

        {issue.projectKey && (
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

      <div className='hidden flex-shrink-0 items-center gap-2 sm:flex'>
        {issue.linkedPrs && issue.linkedPrs.length > 0 ? (
          <Link
            href={issue.linkedPrs[0].url}
            target='_blank'
            rel='noreferrer'
            onClick={e => e.stopPropagation()}
            className='text-muted-foreground hover:text-foreground flex items-center gap-0.5 text-xs transition-colors'
          >
            <GitPullRequest className='size-3' />
            <span className='font-mono'>#{issue.linkedPrs[0].number}</span>
          </Link>
        ) : null}
        {issue.dueDate ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs',
              new Date(issue.dueDate) < new Date() &&
                issue.workflowStateType !== 'done' &&
                issue.workflowStateType !== 'canceled'
                ? 'text-red-500 dark:text-red-400'
                : 'text-muted-foreground',
            )}
            title={`Due ${formatDateHuman(new Date(issue.dueDate))}`}
          >
            <CalendarClock className='size-3' />
            {formatDateHuman(new Date(issue.dueDate))}
          </span>
        ) : null}
        <span className='text-muted-foreground text-xs'>
          {formatDateHuman(new Date(issue.updatedAt))}
        </span>
      </div>

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

      <div
        className='flex-shrink-0'
        onPointerDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
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
            {onExclude && (
              <DropdownMenuItem onClick={() => onExclude(issue.id!)}>
                <EyeOff className='size-4' />
                Exclude from view
              </DropdownMenuItem>
            )}
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
    </motion.div>
  );
}
