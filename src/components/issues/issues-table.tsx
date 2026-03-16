'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';

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
} from 'lucide-react';
import React from 'react';

import {
  PrioritySelector,
  StateSelector,
  TeamSelector,
  ProjectSelector,
  MultiAssigneeSelector,
} from '@/components/issues/issue-selectors';
import { getDynamicIcon } from '@/lib/dynamic-icons';
import { formatDateHuman } from '@/lib/date';

// Re-exported entity from the selector module give us fully-typed data
import type {
  Team,
  Project,
  State,
  Priority,
} from '@/components/issues/issue-selectors';
import { api } from '@/convex/_generated/api';
import { Prettify } from '@/lib/utils';
import { FunctionReturnType } from 'convex/server';

// Permission system
import { PermissionAware } from '@/components/ui/permission-aware';
import { PERMISSIONS } from '@/convex/_shared/permissions';

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
  deletePending?: boolean;
  isUpdatingAssignees?: boolean;
  onAssignmentStateChange: (assignmentId: string, stateId: string) => void;
  isUpdatingAssignmentStates?: boolean;
  currentUserId: string;
  canChangeAll?: boolean;
  activeFilter: string;
}

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
  deletePending = false,
  isUpdatingAssignees = false,
  onAssignmentStateChange,
  isUpdatingAssignmentStates: _isUpdatingAssignmentStates = false,
  currentUserId,
  canChangeAll = false,
  activeFilter,
}: IssuesTableProps) {
  const router = useRouter();
  const groupedIssues = React.useMemo(() => {
    const map = new Map<
      string,
      {
        row: IssueRowData;
        assigneeIds: string[];
        assignments: Array<{
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
        }>;
      }
    >();

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
        if (!existing.row.assigneeId && row.assigneeId) {
          existing.row = row;
        } else if (row.assigneeId === currentUserId) {
          existing.row = row;
        }
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
  }, [issues, currentUserId]);

  const sortedGrouped = React.useMemo(
    () =>
      [...groupedIssues]
        .filter(item =>
          activeFilter === 'all'
            ? true
            : item.row.workflowStateType === activeFilter,
        )
        .sort((a, b) => b.row.updatedAt - a.row.updatedAt),
    [groupedIssues, activeFilter],
  );

  if (issues.length === 0) {
    return (
      <div className='text-muted-foreground flex items-center justify-center py-12 text-sm'>
        No issues found
      </div>
    );
  }

  return (
    <div className='divide-y'>
      <AnimatePresence initial={false}>
        {sortedGrouped.map(({ row: issue, assigneeIds, assignments }) => {
          // Priority icon / color
          const PriorityIcon = issue.priorityIcon
            ? getDynamicIcon(issue.priorityIcon) || Circle
            : Circle;
          const priorityColor = issue.priorityColor || '#94a3b8';

          // Prefer showing the current viewer's assignment state
          const viewerAssignment = assignments.find(
            a => a.assigneeId === currentUserId,
          );
          const displayStateId =
            viewerAssignment?.stateId ?? issue.workflowStateId;

          return (
            <motion.div
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              key={issue.id}
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
              className='hover:bg-muted/50 flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors'
            >
              {/* Priority Selector */}
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

              {/* Issue Key */}
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

              <PermissionAware
                orgSlug={orgSlug}
                permission={PERMISSIONS.ISSUE_STATE_UPDATE}
                fallbackMessage="You don't have permission to change issue state"
              >
                <StateSelector
                  states={states}
                  selectedState={displayStateId || ''}
                  onStateSelect={stateId =>
                    onAssignmentStateChange(issue.id, stateId)
                  }
                  displayMode='labelOnly'
                  className='border-none bg-transparent p-0 shadow-none'
                />
              </PermissionAware>

              {/* Title */}
              <div className='min-w-0 flex-1'>
                <Link
                  href={`/${orgSlug}/issues/${issue.key}`}
                  className='hover:text-primary block truncate text-sm font-medium transition-colors'
                >
                  {issue.title}
                </Link>
              </div>

              {/* Team / Project selectors - hidden on mobile */}
              <div className='hidden md:contents'>
                {issue.teamKey && (
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
                )}

                {issue.projectKey && (
                  <PermissionAware
                    orgSlug={orgSlug}
                    permission={PERMISSIONS.ISSUE_EDIT}
                    fallbackMessage="You don't have permission to change issue project"
                  >
                    <ProjectSelector
                      projects={projects}
                      selectedProject={
                        projects.find(p => p.key === issue.projectKey)?._id ||
                        ''
                      }
                      onProjectSelect={pid => onProjectChange(issue.id, pid)}
                    />
                  </PermissionAware>
                )}
              </div>

              {/* PR link + Last Updated - hidden on mobile */}
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
                    <span className='font-mono'>
                      #{issue.linkedPrs[0].number}
                    </span>
                  </Link>
                ) : null}
                <span className='text-muted-foreground text-xs'>
                  {formatDateHuman(new Date(issue.updatedAt))}
                </span>
              </div>

              {/* Assignees */}
              <MultiAssigneeSelector
                orgSlug={orgSlug}
                selectedAssigneeIds={assigneeIds}
                onAssigneesChange={ids => onAssigneesChange(issue.id!, ids)}
                isLoading={isUpdatingAssignees}
                highlightAssigneeId={null}
                assignments={assignments}
                activeFilter={activeFilter}
                currentUserId={currentUserId}
                canManageAll={canChangeAll}
              />

              {/* Actions */}
              <div className='flex-shrink-0'>
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
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
