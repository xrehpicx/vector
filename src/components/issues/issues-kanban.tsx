'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Check,
  Circle,
  ExternalLink,
  FolderOpen,
  GitPullRequest,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DynamicIcon, getDynamicIcon } from '@/lib/dynamic-icons';
import { api, useCachedQuery, useMutation } from '@/lib/convex';
import { LiveActivityPreview } from '@/components/issues/live-activity-indicator';
import { UserAvatar } from '@/components/user-avatar';
import { formatDateHuman } from '@/lib/date';
import { useOptimisticValue } from '@/hooks/use-optimistic';
import {
  DragOverlay,
  useDndMonitor,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';

import type {
  State,
  Priority,
  Team,
  Project,
} from '@/components/issues/issue-selectors';
import {
  PrioritySelector,
  MultiAssigneeSelector,
} from '@/components/issues/issue-selectors';
import type { IssueRowData } from './issues-table';
import type { IssueGroupByField } from '@/lib/group-by';
import { CreateIssueDialog } from './create-issue-dialog';
import {
  getDefinedKanbanBorderTags,
  getDefaultKanbanBorderTags,
  getKanbanBorderColorHex,
  getKanbanBorderTag,
  getKanbanBorderTagDisplayName,
  normalizeKanbanBorderColor,
  type KanbanBorderColor,
  type KanbanBorderTagSetting,
} from './kanban-border-colors';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { IssueDragData } from '@/components/assistant/assistant-issue-dnd';

export interface IssuesKanbanProps {
  orgSlug: string;
  issues: ReadonlyArray<IssueRowData>;
  states: ReadonlyArray<State>;
  priorities: ReadonlyArray<Priority>;
  teams?: ReadonlyArray<Team>;
  projects?: ReadonlyArray<Project>;
  currentUserId: string;
  /** Called when an issue card is dropped on a different state column */
  onStateChange?: (
    issueId: string,
    assignmentId: string,
    newStateId: string,
  ) => void;
  onPriorityChange?: (issueId: string, priorityId: string) => void;
  onAssigneesChange?: (issueId: string, assigneeIds: string[]) => void;
  onTeamChange?: (issueId: string, teamId: string) => void;
  onProjectChange?: (issueId: string, projectId: string) => void;
  onKanbanBorderColorChange?: (
    issueId: string,
    borderColor: KanbanBorderColor | '',
  ) => void;
  onDelete?: (issueId: string) => void;
  deletePending?: boolean;
  /** Extra defaults passed to the create-issue dialog (e.g. projectId) */
  createDefaults?: Record<string, unknown>;
  canManageAssignees?: boolean;
  canUpdateAssignmentStates?: boolean;
  /** Which field to use for kanban columns (defaults to 'status') */
  groupBy?: IssueGroupByField;
}

interface GroupedIssue {
  id: string;
  key: string;
  title: string;
  priorityId: string | null;
  priorityIcon: string | null;
  priorityColor: string | null;
  priorityName: string | null;
  teamId: string | null;
  projectId: string | null;
  kanbanBorderTag: KanbanBorderColor | null;
  workflowStateId: string | null;
  workflowStateName: string | null;
  workflowStateIcon: string | null;
  workflowStateColor: string | null;
  workflowStateType: string | null;
  assignees: Array<{
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  }>;
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
  updatedAt: number;
  linkedPrs: Array<{ number: number; state: string; url: string }>;
  activeLiveActivities?: Array<{
    _id: string;
    provider: string;
    status: string;
  }>;
}

/** Generic column definition for any groupBy field */
interface KanbanColumnDef {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  avatar?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
}

interface KanbanIssueCard extends GroupedIssue {
  cardId: string;
  assignmentId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  assigneeImage: string | null;
  stateId: string | null;
  stateIcon: string | null;
  stateColor: string | null;
  stateName: string | null;
  stateType: string | null;
  /** Viewer's assignment state display (falls back to workflow state) */
  displayStateIcon: string | null;
  displayStateColor: string | null;
  displayStateName: string | null;
}

export function IssuesKanban({
  orgSlug,
  issues,
  states,
  priorities,
  teams,
  projects,
  currentUserId,
  onStateChange,
  onPriorityChange,
  onAssigneesChange,
  onTeamChange,
  onProjectChange,
  onKanbanBorderColorChange,
  onDelete,
  deletePending = false,
  createDefaults,
  canManageAssignees = false,
  canUpdateAssignmentStates = false,
  groupBy = 'status',
}: IssuesKanbanProps) {
  const effectiveGroupBy = groupBy === 'none' ? 'status' : groupBy;
  const kanbanBorderTags =
    useCachedQuery(api.organizations.queries.listKanbanBorderTags, {
      orgSlug,
    }) ?? getDefaultKanbanBorderTags();

  const [activeId, setActiveId] = useState<string | null>(null);

  const groupedIssues = React.useMemo(() => {
    const map = new Map<string, GroupedIssue>();

    for (const row of issues) {
      const existing = map.get(row.id);

      const assignment = {
        assignmentId: row.assignmentId ?? '',
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
        if (
          row.assigneeId &&
          !existing.assignees.some(a => a.id === row.assigneeId)
        ) {
          existing.assignees.push({
            id: row.assigneeId,
            name: row.assigneeName ?? null,
            email: row.assigneeEmail ?? null,
            image: row.assigneeImage ?? null,
          });
          existing.assigneeIds.push(row.assigneeId);
        }
        existing.assignments.push(assignment);
      } else {
        map.set(row.id, {
          id: row.id,
          key: row.key,
          title: row.title,
          priorityId: row.priorityId ?? null,
          priorityIcon: row.priorityIcon ?? null,
          priorityColor: row.priorityColor ?? null,
          priorityName: row.priorityName ?? null,
          teamId: row.teamId ?? null,
          projectId: row.projectId ?? null,
          kanbanBorderTag: normalizeKanbanBorderColor(
            ((
              row as IssueRowData & {
                kanbanBorderTag?: string | null;
                kanbanBorderColor?: string | null;
              }
            ).kanbanBorderTag ?? row.kanbanBorderColor) as
              | string
              | null
              | undefined,
          ),
          workflowStateId: row.workflowStateId ?? null,
          workflowStateName: row.workflowStateName ?? null,
          workflowStateIcon: row.workflowStateIcon ?? null,
          workflowStateColor: row.workflowStateColor ?? null,
          workflowStateType: row.workflowStateType ?? null,
          assignees: row.assigneeId
            ? [
                {
                  id: row.assigneeId,
                  name: row.assigneeName ?? null,
                  email: row.assigneeEmail ?? null,
                  image: row.assigneeImage ?? null,
                },
              ]
            : [],
          assigneeIds: row.assigneeId ? [row.assigneeId] : [],
          assignments: [assignment],
          updatedAt: row.updatedAt ?? 0,
          linkedPrs: row.linkedPrs ?? [],
          activeLiveActivities: row.activeLiveActivities,
        });
      }
    }

    return [...map.values()];
  }, [issues]);

  // Sort states by position (must be before issueCards which uses it)
  const sortedStates = React.useMemo(
    () => [...states].sort((a, b) => a.position - b.position),
    [states],
  );

  const issueCards = React.useMemo(() => {
    return groupedIssues
      .map<KanbanIssueCard>(issue => {
        // Prefer showing the current viewer's assignment if they are an assignee
        const viewerAssignment = currentUserId
          ? issue.assignments.find(a => a.assigneeId === currentUserId)
          : null;
        const displayAssignee = viewerAssignment
          ? issue.assignees.find(a => a.id === currentUserId)
          : issue.assignees[0];
        const displayAssignmentId =
          viewerAssignment?.assignmentId ??
          issue.assignments.find(
            assignment => assignment.assignmentId !== 'unassigned',
          )?.assignmentId ??
          null;

        return {
          ...issue,
          cardId: issue.id,
          assignmentId: displayAssignmentId,
          assigneeId: displayAssignee?.id ?? null,
          assigneeName: displayAssignee?.name ?? null,
          assigneeEmail: displayAssignee?.email ?? null,
          assigneeImage: displayAssignee?.image ?? null,
          // stateId drives column placement — always use workflow state
          stateId: issue.workflowStateId,
          stateIcon: issue.workflowStateIcon,
          stateColor: issue.workflowStateColor,
          stateName: issue.workflowStateName,
          stateType: issue.workflowStateType,
          // display fields show the viewer's assignment state on the card
          displayStateIcon:
            viewerAssignment?.stateIcon ?? issue.workflowStateIcon,
          displayStateColor:
            viewerAssignment?.stateColor ?? issue.workflowStateColor,
          displayStateName:
            viewerAssignment?.stateName ?? issue.workflowStateName,
        };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [groupedIssues, currentUserId]);

  // Build generic column definitions based on groupBy
  const columnDefs = React.useMemo((): KanbanColumnDef[] => {
    switch (effectiveGroupBy) {
      case 'priority':
        return [
          ...priorities.map(p => ({
            id: p._id,
            name: p.name,
            icon: p.icon,
            color: p.color,
          })),
          { id: '__none__', name: 'No priority' },
        ];
      case 'assignee': {
        // Derive unique assignees from the issue data
        const seen = new Map<string, KanbanColumnDef>();
        seen.set('__unassigned__', {
          id: '__unassigned__',
          name: 'Unassigned',
          avatar: null,
        });
        for (const issue of issueCards) {
          for (const a of issue.assignees) {
            if (a.id && !seen.has(a.id)) {
              seen.set(a.id, {
                id: a.id,
                name: a.name || a.email || 'Unknown',
                avatar: { name: a.name, email: a.email, image: a.image },
              });
            }
          }
        }
        return [...seen.values()];
      }
      case 'team':
        return [
          ...(teams ?? []).map(t => ({
            id: t._id,
            name: t.name,
            icon: t.icon,
            color: t.color,
          })),
          { id: '__none__', name: 'No team' },
        ];
      case 'project':
        return [
          ...(projects ?? []).map(p => ({
            id: p._id,
            name: p.name,
            icon: p.icon,
            color: p.color,
          })),
          { id: '__none__', name: 'No project' },
        ];
      case 'status':
      default:
        return sortedStates.map(s => ({
          id: s._id,
          name: s.name,
          icon: s.icon,
          color: s.color,
        }));
    }
  }, [effectiveGroupBy, sortedStates, priorities, teams, projects, issueCards]);

  // Map each issue card to its column id based on groupBy
  const getColumnId = React.useCallback(
    (issue: KanbanIssueCard): string => {
      switch (effectiveGroupBy) {
        case 'priority':
          return issue.priorityId || '__none__';
        case 'assignee':
          return issue.assigneeId || '__unassigned__';
        case 'team':
          return issue.teamId || '__none__';
        case 'project':
          return issue.projectId || '__none__';
        case 'status':
        default:
          return issue.stateId || '__none__';
      }
    },
    [effectiveGroupBy],
  );
  const columns = React.useMemo(() => {
    return columnDefs.map(col => ({
      def: col,
      issues: issueCards.filter(issue => getColumnId(issue) === col.id),
    }));
  }, [columnDefs, issueCards, getColumnId]);

  // Determine if drag-and-drop is supported for the current groupBy
  const canDropInColumns =
    effectiveGroupBy === 'status'
      ? Boolean(onStateChange)
      : effectiveGroupBy === 'priority'
        ? Boolean(onPriorityChange)
        : effectiveGroupBy === 'team'
          ? Boolean(onTeamChange)
          : effectiveGroupBy === 'project'
            ? Boolean(onProjectChange)
            : false; // assignee drag not supported

  const activeIssue = activeId
    ? (issueCards.find(i => i.cardId === activeId) ?? null)
    : null;
  const handleIssueColumnDrop = React.useCallback(
    (targetColumnId: string) => (activeIssueDrag: IssueDragData) => {
      const issue = issueCards.find(item => item.id === activeIssueDrag.id);
      if (!issue || getColumnId(issue) === targetColumnId) return;

      switch (effectiveGroupBy) {
        case 'status':
          if (!onStateChange || !issue.assignmentId) return;
          onStateChange(issue.id, issue.assignmentId, targetColumnId);
          return;
        case 'priority':
          if (!onPriorityChange) return;
          onPriorityChange(issue.id, targetColumnId);
          return;
        case 'team':
          if (!onTeamChange) return;
          onTeamChange(
            issue.id,
            targetColumnId === '__none__' ? '' : targetColumnId,
          );
          return;
        case 'project':
          if (!onProjectChange) return;
          onProjectChange(
            issue.id,
            targetColumnId === '__none__' ? '' : targetColumnId,
          );
          return;
        default:
          return;
      }
    },
    [
      effectiveGroupBy,
      getColumnId,
      issueCards,
      onPriorityChange,
      onProjectChange,
      onStateChange,
      onTeamChange,
    ],
  );

  useDndMonitor({
    onDragStart: event => {
      const dragData = event.active.data.current as IssueDragData | undefined;
      if (dragData?.type !== 'issue' || dragData.origin !== 'kanban') return;
      setActiveId(event.active.id as string);
    },
    onDragEnd: () => {
      setActiveId(null);
    },
    onDragCancel: () => {
      setActiveId(null);
    },
  });

  return (
    <>
      <ScrollArea className='h-full' viewportClassName='h-full'>
        <div className='flex min-h-dvh gap-3 p-3 pb-16'>
          {columns.map(({ def, issues: columnIssues }) => (
            <KanbanColumn
              key={def.id}
              columnDef={def}
              columnAvatar={def.avatar}
              issues={columnIssues}
              orgSlug={orgSlug}
              activeId={activeId}
              states={sortedStates}
              priorities={priorities}
              teams={teams}
              projects={projects}
              kanbanBorderTags={kanbanBorderTags}
              currentUserId={currentUserId}
              canManageAssignees={canManageAssignees}
              canUpdateAssignmentStates={canUpdateAssignmentStates}
              canDropInColumn={canDropInColumns}
              onIssueDrop={
                canDropInColumns ? handleIssueColumnDrop(def.id) : undefined
              }
              onStateChange={onStateChange}
              onPriorityChange={onPriorityChange}
              onAssigneesChange={onAssigneesChange}
              onTeamChange={onTeamChange}
              onProjectChange={onProjectChange}
              onKanbanBorderColorChange={onKanbanBorderColorChange}
              onDelete={onDelete}
              deletePending={deletePending}
              createDefaults={
                effectiveGroupBy === 'status'
                  ? { stateId: def.id, ...createDefaults }
                  : createDefaults
              }
            />
          ))}
        </div>
      </ScrollArea>
      <DragOverlay
        dropAnimation={{
          duration: 200,
          easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
        }}
      >
        {activeIssue ? (
          <div className='animate-tilt w-72'>
            <KanbanCardContent
              issue={activeIssue}
              orgSlug={orgSlug}
              isDragging
              kanbanBorderTags={kanbanBorderTags}
            />
          </div>
        ) : null}
      </DragOverlay>
    </>
  );
}

function KanbanColumn({
  columnDef,
  columnAvatar,
  issues,
  orgSlug,
  activeId,
  states,
  priorities,
  teams,
  projects,
  kanbanBorderTags,
  currentUserId,
  canManageAssignees,
  canUpdateAssignmentStates,
  canDropInColumn = false,
  onIssueDrop,
  onStateChange,
  onPriorityChange,
  onAssigneesChange,
  onTeamChange,
  onProjectChange,
  onKanbanBorderColorChange,
  onDelete,
  deletePending,
  createDefaults,
}: {
  columnDef: KanbanColumnDef;
  columnAvatar?: KanbanColumnDef['avatar'];
  issues: KanbanIssueCard[];
  orgSlug: string;
  activeId: string | null;
  states: ReadonlyArray<State>;
  priorities: ReadonlyArray<Priority>;
  teams?: ReadonlyArray<Team>;
  projects?: ReadonlyArray<Project>;
  kanbanBorderTags: ReadonlyArray<KanbanBorderTagSetting>;
  currentUserId: string;
  canManageAssignees?: boolean;
  canUpdateAssignmentStates?: boolean;
  canDropInColumn?: boolean;
  onIssueDrop?: (issue: IssueDragData) => void;
  onStateChange?: (
    issueId: string,
    assignmentId: string,
    newStateId: string,
  ) => void;
  onPriorityChange?: (issueId: string, priorityId: string) => void;
  onAssigneesChange?: (issueId: string, assigneeIds: string[]) => void;
  onTeamChange?: (issueId: string, teamId: string) => void;
  onProjectChange?: (issueId: string, projectId: string) => void;
  onKanbanBorderColorChange?: (
    issueId: string,
    borderColor: KanbanBorderColor | '',
  ) => void;
  onDelete?: (issueId: string) => void;
  deletePending?: boolean;
  createDefaults?: Record<string, unknown>;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `issue-column:${columnDef.id}`,
    disabled: !canDropInColumn || !onIssueDrop,
    data: onIssueDrop
      ? {
          type: 'issue-column-drop',
          onIssueDrop,
        }
      : undefined,
  });
  const count = issues.length;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-72 flex-shrink-0 flex-col rounded-lg transition-colors',
        isOver && 'bg-muted/50',
      )}
    >
      {/* Column header */}
      <div className='mb-2 flex items-center gap-2 px-1'>
        {columnAvatar ? (
          <UserAvatar
            name={columnAvatar.name}
            email={columnAvatar.email}
            image={columnAvatar.image}
            size='sm'
            className='size-5'
          />
        ) : (
          <DynamicIcon
            name={columnDef.icon}
            className='size-3.5'
            style={{ color: columnDef.color || '#6b7280' }}
            fallback={Circle}
          />
        )}
        <span className='text-sm font-medium'>{columnDef.name}</span>
        <span className='text-muted-foreground text-xs'>{count}</span>
      </div>

      {/* Column body */}
      <ScrollArea className='min-h-[80px] flex-1 rounded-lg'>
        <div className='space-y-2'>
          {issues.length === 0 ? (
            <div
              className={cn(
                'text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-xs',
                isOver && 'border-primary/50 bg-primary/5',
              )}
            >
              {isOver ? 'Drop here' : 'No issues'}
            </div>
          ) : (
            issues.map(issue => (
              <KanbanCard
                key={issue.cardId}
                issue={issue}
                orgSlug={orgSlug}
                isHidden={issue.cardId === activeId}
                states={states}
                priorities={priorities}
                teams={teams}
                projects={projects}
                kanbanBorderTags={kanbanBorderTags}
                currentUserId={currentUserId}
                canManageAssignees={canManageAssignees}
                canUpdateAssignmentStates={canUpdateAssignmentStates}
                onStateChange={onStateChange}
                onPriorityChange={onPriorityChange}
                onAssigneesChange={onAssigneesChange}
                onTeamChange={onTeamChange}
                onProjectChange={onProjectChange}
                onKanbanBorderColorChange={onKanbanBorderColorChange}
                onDelete={onDelete}
                deletePending={deletePending}
              />
            ))
          )}

          {/* Add issue button */}
          <CreateIssueDialog
            orgSlug={orgSlug}
            variant='default'
            defaultStates={createDefaults}
            className='text-muted-foreground hover:text-foreground hover:bg-muted/50 w-full border-dashed'
          />
        </div>
      </ScrollArea>
    </div>
  );
}

function KanbanCard({
  issue,
  orgSlug,
  isHidden,
  states,
  priorities,
  teams,
  projects,
  kanbanBorderTags,
  currentUserId,
  canManageAssignees = false,
  canUpdateAssignmentStates = false,
  onStateChange,
  onPriorityChange,
  onAssigneesChange,
  onTeamChange,
  onProjectChange,
  onKanbanBorderColorChange,
  onDelete,
  deletePending,
}: {
  issue: KanbanIssueCard;
  orgSlug: string;
  isHidden?: boolean;
  states: ReadonlyArray<State>;
  priorities: ReadonlyArray<Priority>;
  teams?: ReadonlyArray<Team>;
  projects?: ReadonlyArray<Project>;
  kanbanBorderTags: ReadonlyArray<KanbanBorderTagSetting>;
  currentUserId: string;
  canManageAssignees?: boolean;
  canUpdateAssignmentStates?: boolean;
  onStateChange?: (
    issueId: string,
    assignmentId: string,
    newStateId: string,
  ) => void;
  onPriorityChange?: (issueId: string, priorityId: string) => void;
  onAssigneesChange?: (issueId: string, assigneeIds: string[]) => void;
  onTeamChange?: (issueId: string, teamId: string) => void;
  onProjectChange?: (issueId: string, projectId: string) => void;
  onKanbanBorderColorChange?: (
    issueId: string,
    borderColor: KanbanBorderColor | '',
  ) => void;
  onDelete?: (issueId: string) => void;
  deletePending?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: issue.cardId,
    data: {
      type: 'issue',
      origin: 'kanban',
      id: issue.id,
      key: issue.key,
      title: issue.title,
      href: `/${orgSlug}/issues/${issue.key}`,
      icon: issue.stateIcon,
      color: issue.stateColor,
      assignmentId: issue.assignmentId,
      stateId: issue.stateId,
    },
  });
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const currentKanbanBorderColor: KanbanBorderColor | '' =
    normalizeKanbanBorderColor(issue.kanbanBorderTag) ?? '';
  const [displayKanbanBorderColor, setOptimisticKanbanBorderColor] =
    useOptimisticValue<KanbanBorderColor | ''>(currentKanbanBorderColor);
  const [isBorderPickerOpen, setIsBorderPickerOpen] = useState(false);

  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      cardRef.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );

  const handleKanbanBorderColorChange = React.useCallback(
    (nextBorderColor: KanbanBorderColor | '') => {
      if (!onKanbanBorderColorChange) return;
      setOptimisticKanbanBorderColor(nextBorderColor);
      onKanbanBorderColorChange(issue.id, nextBorderColor);
      setIsBorderPickerOpen(false);
    },
    [issue.id, onKanbanBorderColorChange, setOptimisticKanbanBorderColor],
  );

  const handleDoubleClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!onKanbanBorderColorChange) return;
      const target = event.target as HTMLElement;
      if (
        target.closest(
          'a,button,input,textarea,[role="button"],[data-kanban-border-ignore]',
        )
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setIsBorderPickerOpen(open => !open);
    },
    [onKanbanBorderColorChange],
  );

  React.useEffect(() => {
    if (!isBorderPickerOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) {
        setIsBorderPickerOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsBorderPickerOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isBorderPickerOpen]);

  return (
    <ContextMenu>
      <ContextMenuTrigger
        ref={setRefs}
        {...listeners}
        {...attributes}
        className={cn('block', isHidden && 'scale-95 opacity-30')}
        onDoubleClick={handleDoubleClick}
      >
        <KanbanCardContent
          issue={issue}
          orgSlug={orgSlug}
          isDragging={isDragging}
          priorities={priorities}
          currentUserId={currentUserId}
          canManageAssignees={canManageAssignees}
          onPriorityChange={onPriorityChange}
          onAssigneesChange={onAssigneesChange}
          kanbanBorderTags={kanbanBorderTags}
          kanbanBorderColor={displayKanbanBorderColor}
          isBorderPickerOpen={isBorderPickerOpen}
          onBorderPickerOpenChange={setIsBorderPickerOpen}
          onKanbanBorderColorChange={handleKanbanBorderColorChange}
        />
      </ContextMenuTrigger>
      <KanbanCardMenu
        issue={issue}
        orgSlug={orgSlug}
        states={states}
        priorities={priorities}
        teams={teams}
        projects={projects}
        currentUserId={currentUserId}
        canUpdateAssignmentStates={canUpdateAssignmentStates}
        onStateChange={onStateChange}
        onPriorityChange={onPriorityChange}
        onTeamChange={onTeamChange}
        onProjectChange={onProjectChange}
        kanbanBorderTags={kanbanBorderTags}
        kanbanBorderColor={displayKanbanBorderColor}
        onKanbanBorderColorChange={handleKanbanBorderColorChange}
        onDelete={onDelete}
        deletePending={deletePending}
      />
    </ContextMenu>
  );
}

function KanbanCardMenu({
  issue,
  orgSlug,
  states,
  priorities,
  teams,
  projects,
  currentUserId,
  canUpdateAssignmentStates = false,
  onStateChange,
  onPriorityChange,
  onTeamChange,
  onProjectChange,
  kanbanBorderTags,
  kanbanBorderColor,
  onKanbanBorderColorChange,
  onDelete,
  deletePending,
}: {
  issue: KanbanIssueCard;
  orgSlug: string;
  states: ReadonlyArray<State>;
  priorities: ReadonlyArray<Priority>;
  teams?: ReadonlyArray<Team>;
  projects?: ReadonlyArray<Project>;
  currentUserId: string;
  canUpdateAssignmentStates?: boolean;
  onStateChange?: (
    issueId: string,
    assignmentId: string,
    newStateId: string,
  ) => void;
  onPriorityChange?: (issueId: string, priorityId: string) => void;
  onTeamChange?: (issueId: string, teamId: string) => void;
  onProjectChange?: (issueId: string, projectId: string) => void;
  kanbanBorderTags: ReadonlyArray<KanbanBorderTagSetting>;
  kanbanBorderColor: KanbanBorderColor | '';
  onKanbanBorderColorChange?: (borderColor: KanbanBorderColor | '') => void;
  onDelete?: (issueId: string) => void;
  deletePending?: boolean;
}) {
  const updateKanbanBorderTagMutation = useMutation(
    api.organizations.mutations.updateKanbanBorderTag,
  );
  const definedKanbanBorderTags = React.useMemo(
    () => getDefinedKanbanBorderTags(kanbanBorderTags),
    [kanbanBorderTags],
  );
  const availableKanbanBorderTags = React.useMemo(
    () => kanbanBorderTags.filter(tag => !tag.name.trim()),
    [kanbanBorderTags],
  );
  const [newKanbanBorderTagName, setNewKanbanBorderTagName] = useState('');
  const [newKanbanBorderTagColor, setNewKanbanBorderTagColor] = useState(
    availableKanbanBorderTags[0]?.color ?? kanbanBorderTags[0]?.color ?? '',
  );

  React.useEffect(() => {
    if (!newKanbanBorderTagName.trim()) {
      setNewKanbanBorderTagName('');
      setNewKanbanBorderTagColor(
        availableKanbanBorderTags[0]?.color ?? kanbanBorderTags[0]?.color ?? '',
      );
    }
  }, [availableKanbanBorderTags, kanbanBorderTags, newKanbanBorderTagName]);

  const handleCreateKanbanBorderTag = React.useCallback(async () => {
    const nextAvailableTag = availableKanbanBorderTags[0];
    const trimmedName = newKanbanBorderTagName.trim();

    if (!nextAvailableTag || !trimmedName) {
      return;
    }

    await updateKanbanBorderTagMutation({
      orgSlug,
      tagId: nextAvailableTag.id,
      name: trimmedName,
      color: newKanbanBorderTagColor || nextAvailableTag.color,
    });
    onKanbanBorderColorChange?.(nextAvailableTag.id);
    setNewKanbanBorderTagName('');
    setNewKanbanBorderTagColor(
      availableKanbanBorderTags[1]?.color ??
        availableKanbanBorderTags[0]?.color ??
        kanbanBorderTags[0]?.color ??
        '',
    );
  }, [
    availableKanbanBorderTags,
    kanbanBorderTags,
    newKanbanBorderTagColor,
    newKanbanBorderTagName,
    onKanbanBorderColorChange,
    orgSlug,
    updateKanbanBorderTagMutation,
  ]);

  const canMoveIssue = Boolean(
    onStateChange &&
      issue.assignmentId &&
      (canUpdateAssignmentStates || issue.assigneeId === currentUserId),
  );

  return (
    <ContextMenuContent className='w-56'>
      <ContextMenuItem asChild>
        <Link href={`/${orgSlug}/issues/${issue.key}`}>
          <ExternalLink className='size-4' />
          Open issue
        </Link>
      </ContextMenuItem>

      {canMoveIssue ? (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Circle className='size-4' />
            Move to
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {states.map(state => {
              const StateIcon = state.icon
                ? getDynamicIcon(state.icon) || Circle
                : Circle;
              const isSelected = issue.stateId === state._id;
              return (
                <ContextMenuItem
                  key={state._id}
                  onClick={() => {
                    if (!onStateChange || !issue.assignmentId) return;
                    onStateChange(issue.id, issue.assignmentId, state._id);
                  }}
                >
                  <span className='flex size-4 items-center justify-center'>
                    {isSelected ? <Check className='size-3.5' /> : null}
                  </span>
                  <StateIcon
                    className='size-4'
                    style={{ color: state.color || '#94a3b8' }}
                  />
                  <span className='min-w-0 flex-1 truncate'>{state.name}</span>
                </ContextMenuItem>
              );
            })}
          </ContextMenuSubContent>
        </ContextMenuSub>
      ) : null}

      {onPriorityChange ? (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Circle className='size-4' />
            Priority
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {priorities.map(priority => {
              const PriorityIcon = priority.icon
                ? getDynamicIcon(priority.icon) || Circle
                : Circle;
              const isSelected = issue.priorityId === priority._id;
              return (
                <ContextMenuItem
                  key={priority._id}
                  onClick={() => {
                    onPriorityChange(issue.id, priority._id);
                  }}
                >
                  <span className='flex size-4 items-center justify-center'>
                    {isSelected ? <Check className='size-3.5' /> : null}
                  </span>
                  <PriorityIcon
                    className='size-4'
                    style={{ color: priority.color || '#94a3b8' }}
                  />
                  <span className='min-w-0 flex-1 truncate'>
                    {priority.name}
                  </span>
                </ContextMenuItem>
              );
            })}
          </ContextMenuSubContent>
        </ContextMenuSub>
      ) : null}

      {teams && teams.length > 0 && onTeamChange ? (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Users className='size-4' />
            Team
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={() => onTeamChange(issue.id, '')}>
              <span className='flex size-4 items-center justify-center'>
                {!issue.teamId ? <Check className='size-3.5' /> : null}
              </span>
              <span className='min-w-0 flex-1 truncate'>No team</span>
            </ContextMenuItem>
            {teams.map(team => {
              const TeamIcon = team.icon
                ? getDynamicIcon(team.icon) || Users
                : Users;
              const isSelected = issue.teamId === team._id;
              return (
                <ContextMenuItem
                  key={team._id}
                  onClick={() => onTeamChange(issue.id, team._id)}
                >
                  <span className='flex size-4 items-center justify-center'>
                    {isSelected ? <Check className='size-3.5' /> : null}
                  </span>
                  <TeamIcon
                    className='size-4'
                    style={{ color: team.color || '#94a3b8' }}
                  />
                  <span className='min-w-0 flex-1 truncate'>{team.name}</span>
                </ContextMenuItem>
              );
            })}
          </ContextMenuSubContent>
        </ContextMenuSub>
      ) : null}

      {projects && projects.length > 0 && onProjectChange ? (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <FolderOpen className='size-4' />
            Project
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={() => onProjectChange(issue.id, '')}>
              <span className='flex size-4 items-center justify-center'>
                {!issue.projectId ? <Check className='size-3.5' /> : null}
              </span>
              <span className='min-w-0 flex-1 truncate'>No project</span>
            </ContextMenuItem>
            {projects.map(project => {
              const ProjectIcon = project.icon
                ? getDynamicIcon(project.icon) || FolderOpen
                : FolderOpen;
              const isSelected = issue.projectId === project._id;
              return (
                <ContextMenuItem
                  key={project._id}
                  onClick={() => onProjectChange(issue.id, project._id)}
                >
                  <span className='flex size-4 items-center justify-center'>
                    {isSelected ? <Check className='size-3.5' /> : null}
                  </span>
                  <ProjectIcon
                    className='size-4'
                    style={{ color: project.color || '#94a3b8' }}
                  />
                  <span className='min-w-0 flex-1 truncate'>
                    {project.name}
                  </span>
                </ContextMenuItem>
              );
            })}
          </ContextMenuSubContent>
        </ContextMenuSub>
      ) : null}

      {onKanbanBorderColorChange ? (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Circle className='size-4' />
            Border tag
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={() => onKanbanBorderColorChange('')}>
              <span className='flex size-4 items-center justify-center'>
                {kanbanBorderColor === '' ? (
                  <Check className='size-3.5' />
                ) : null}
              </span>
              <span className='min-w-0 flex-1 truncate'>None</span>
            </ContextMenuItem>
            {definedKanbanBorderTags.length === 0 ? (
              <div className='text-muted-foreground px-2 pb-2 text-xs'>
                No tags yet
              </div>
            ) : null}
            {definedKanbanBorderTags.map(tag => (
              <ContextMenuItem
                key={tag.id}
                onClick={() => onKanbanBorderColorChange(tag.id)}
              >
                <span className='flex size-4 items-center justify-center'>
                  {kanbanBorderColor === tag.id ? (
                    <Check className='size-3.5' />
                  ) : null}
                </span>
                <span
                  className='size-3 rounded-full border'
                  style={{
                    backgroundColor: tag.color,
                    borderColor: tag.color,
                  }}
                />
                <span className='min-w-0 flex-1 truncate'>
                  {getKanbanBorderTagDisplayName(tag)}
                </span>
              </ContextMenuItem>
            ))}
            {availableKanbanBorderTags.length > 0 ? (
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <Plus className='size-4' />
                  Make tag
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className='w-56'>
                  <div
                    className='space-y-2 p-2'
                    onClick={event => event.stopPropagation()}
                    onPointerDown={event => event.stopPropagation()}
                  >
                    <Input
                      value={newKanbanBorderTagName}
                      onChange={event =>
                        setNewKanbanBorderTagName(event.target.value)
                      }
                      onKeyDown={event => event.stopPropagation()}
                      placeholder='Tag name'
                      className='h-8 text-xs'
                      autoFocus
                    />
                    <div className='grid grid-cols-5 gap-1'>
                      {kanbanBorderTags.map(tag => (
                        <button
                          key={tag.id}
                          type='button'
                          className={cn(
                            'flex h-7 items-center justify-center rounded-md border',
                            newKanbanBorderTagColor === tag.color &&
                              'ring-primary ring-2',
                          )}
                          style={{
                            backgroundColor: tag.color,
                            borderColor: tag.color,
                          }}
                          onClick={event => {
                            event.stopPropagation();
                            setNewKanbanBorderTagColor(tag.color);
                          }}
                        />
                      ))}
                    </div>
                    <div className='flex items-center justify-end gap-2'>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        className='h-7 px-2 text-xs'
                        onClick={event => {
                          event.stopPropagation();
                          setNewKanbanBorderTagName('');
                          setNewKanbanBorderTagColor(
                            availableKanbanBorderTags[0]?.color ??
                              kanbanBorderTags[0]?.color ??
                              '',
                          );
                        }}
                      >
                        Reset
                      </Button>
                      <Button
                        type='button'
                        size='sm'
                        className='h-7 px-2 text-xs'
                        disabled={!newKanbanBorderTagName.trim()}
                        onClick={event => {
                          event.stopPropagation();
                          void handleCreateKanbanBorderTag();
                        }}
                      >
                        Create
                      </Button>
                    </div>
                  </div>
                </ContextMenuSubContent>
              </ContextMenuSub>
            ) : (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem disabled inset>
                  All tag slots used
                </ContextMenuItem>
              </>
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>
      ) : null}

      {onDelete ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant='destructive'
            disabled={deletePending}
            onClick={() => onDelete(issue.id)}
          >
            <Trash2 className='size-4' />
            Delete issue
          </ContextMenuItem>
        </>
      ) : null}
    </ContextMenuContent>
  );
}

function KanbanCardContent({
  issue,
  orgSlug,
  isDragging,
  priorities,
  currentUserId,
  canManageAssignees = false,
  onPriorityChange,
  onAssigneesChange,
  kanbanBorderTags,
  kanbanBorderColor,
  isBorderPickerOpen = false,
  onBorderPickerOpenChange,
  onKanbanBorderColorChange,
}: {
  issue: KanbanIssueCard;
  orgSlug: string;
  isDragging?: boolean;
  priorities?: ReadonlyArray<Priority>;
  currentUserId?: string;
  canManageAssignees?: boolean;
  onPriorityChange?: (issueId: string, priorityId: string) => void;
  onAssigneesChange?: (issueId: string, assigneeIds: string[]) => void;
  kanbanBorderTags: ReadonlyArray<KanbanBorderTagSetting>;
  kanbanBorderColor?: KanbanBorderColor | '';
  isBorderPickerOpen?: boolean;
  onBorderPickerOpenChange?: (open: boolean) => void;
  onKanbanBorderColorChange?: (borderColor: KanbanBorderColor | '') => void;
}) {
  const definedKanbanBorderTags = getDefinedKanbanBorderTags(kanbanBorderTags);
  const borderTag = getKanbanBorderTag(kanbanBorderTags, kanbanBorderColor);
  const borderColorHex =
    borderTag?.color ?? getKanbanBorderColorHex(kanbanBorderColor);
  const assigneeLabel =
    issue.assigneeName || issue.assigneeEmail || 'Unassigned';
  const assigneeStateCluster = (
    <div className='flex min-w-0 items-center gap-1.5'>
      <UserAvatar
        name={issue.assigneeName}
        email={issue.assigneeEmail}
        image={issue.assigneeImage}
        size='sm'
        className='size-5 shrink-0'
      />
      <div className='flex min-w-0 items-center gap-1.5 text-[11px]'>
        <span className='max-w-[10ch] truncate font-medium text-current'>
          {assigneeLabel}
        </span>
        <span className='text-muted-foreground/60 shrink-0'>·</span>
        <DynamicIcon
          name={issue.displayStateIcon}
          className='text-muted-foreground size-3 shrink-0'
          style={{ color: issue.displayStateColor || '#94a3b8' }}
          fallback={Circle}
        />
        <span className='text-muted-foreground truncate'>
          {issue.displayStateName ?? 'No state'}
        </span>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        'bg-card border-border/70 relative block overflow-hidden rounded-lg border p-3 shadow-xs transition-[border-color,box-shadow,transform]',
        isDragging
          ? 'ring-primary/30 shadow-lg ring-2'
          : 'hover:border-border/80 hover:shadow-sm',
      )}
    >
      {borderColorHex ? (
        <div
          className='pointer-events-none absolute top-3 bottom-3 left-1 w-1 rounded-full opacity-90'
          style={{ backgroundColor: borderColorHex }}
        />
      ) : null}

      {isBorderPickerOpen && onKanbanBorderColorChange ? (
        <div
          className='bg-popover absolute top-2 right-2 z-20 w-36 rounded-md border p-2 shadow-lg'
          data-kanban-border-ignore
        >
          <div className='mb-2 flex items-center justify-between'>
            <span className='text-muted-foreground text-[11px] font-medium'>
              Border tag
            </span>
            <button
              type='button'
              className='text-muted-foreground hover:text-foreground text-[11px]'
              onClick={event => {
                event.stopPropagation();
                onBorderPickerOpenChange?.(false);
              }}
            >
              Close
            </button>
          </div>
          {definedKanbanBorderTags.length === 0 ? (
            <div className='text-muted-foreground px-1 py-2 text-[11px]'>
              No tags yet. Create one from the menu.
            </div>
          ) : (
            <div className='grid grid-cols-5 gap-1'>
              <button
                type='button'
                className={cn(
                  'text-muted-foreground hover:text-foreground col-span-2 flex h-7 items-center justify-center rounded-md border text-[11px]',
                  kanbanBorderColor === '' &&
                    'border-foreground text-foreground',
                )}
                onClick={event => {
                  event.stopPropagation();
                  onKanbanBorderColorChange('');
                }}
              >
                None
              </button>
              {definedKanbanBorderTags.map(tag => (
                <button
                  key={tag.id}
                  type='button'
                  aria-label={getKanbanBorderTagDisplayName(tag)}
                  title={getKanbanBorderTagDisplayName(tag)}
                  className={cn(
                    'flex h-7 items-center justify-center rounded-md border',
                    kanbanBorderColor === tag.id && 'ring-primary ring-2',
                  )}
                  style={{
                    backgroundColor: tag.color,
                    borderColor: tag.color,
                  }}
                  onClick={event => {
                    event.stopPropagation();
                    onKanbanBorderColorChange(tag.id);
                  }}
                >
                  {kanbanBorderColor === tag.id ? (
                    <Check className='size-3.5 text-white drop-shadow-sm' />
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Issue key + priority + PR link */}
      <div className='mb-1.5 flex items-center gap-2'>
        {onPriorityChange && priorities ? (
          <div onClick={e => e.stopPropagation()} data-kanban-border-ignore>
            <PrioritySelector
              priorities={priorities as Priority[]}
              selectedPriority={issue.priorityId || ''}
              onPrioritySelect={pid => onPriorityChange(issue.id, pid)}
              displayMode='labelOnly'
              trigger={
                <div className='flex-shrink-0 cursor-pointer'>
                  <DynamicIcon
                    name={issue.priorityIcon}
                    className='size-3'
                    style={{ color: issue.priorityColor || '#94a3b8' }}
                    fallback={Circle}
                  />
                </div>
              }
              className='border-none bg-transparent p-0 shadow-none'
            />
          </div>
        ) : (
          issue.priorityIcon && (
            <DynamicIcon
              name={issue.priorityIcon}
              className='size-3'
              style={{ color: issue.priorityColor || '#94a3b8' }}
            />
          )
        )}
        <Link
          href={`/${orgSlug}/issues/${issue.key}`}
          onClick={e => {
            if (isDragging) e.preventDefault();
          }}
          className='text-muted-foreground hover:text-foreground font-mono text-[11px] transition-colors'
        >
          {issue.key}
        </Link>
        {issue.linkedPrs && issue.linkedPrs.length > 0 ? (
          <Link
            href={issue.linkedPrs[0].url}
            target='_blank'
            rel='noreferrer'
            onClick={e => {
              if (isDragging) e.preventDefault();
              e.stopPropagation();
            }}
            className='text-muted-foreground hover:text-foreground ml-auto flex items-center gap-0.5 text-[11px] transition-colors'
          >
            <GitPullRequest className='size-3' />
            <span className='font-mono'>#{issue.linkedPrs[0].number}</span>
          </Link>
        ) : null}
      </div>

      {/* Title */}
      <Link
        href={`/${orgSlug}/issues/${issue.key}`}
        onClick={e => {
          if (isDragging) e.preventDefault();
        }}
        className='hover:text-primary transition-colors'
      >
        <p className='line-clamp-2 text-sm leading-snug font-medium'>
          {issue.title}
        </p>
      </Link>

      {/* Live activity preview */}
      {issue.activeLiveActivities && issue.activeLiveActivities.length > 0 && (
        <LiveActivityPreview activities={issue.activeLiveActivities} />
      )}

      {/* Bottom row: assignees + date */}
      <div className='mt-2 flex min-w-0 flex-wrap items-center justify-between gap-y-1'>
        {onAssigneesChange && currentUserId ? (
          <div
            className='min-w-0'
            onClick={e => e.stopPropagation()}
            data-kanban-border-ignore
          >
            <MultiAssigneeSelector
              orgSlug={orgSlug}
              selectedAssigneeIds={issue.assigneeIds}
              onAssigneesChange={ids => onAssigneesChange(issue.id, ids)}
              assignments={issue.assignments}
              activeFilter='all'
              currentUserId={currentUserId}
              canManageAll={canManageAssignees}
              trigger={
                <div className='hover:bg-muted/40 rounded-sm px-0.5 py-0.5 transition-colors'>
                  {assigneeStateCluster}
                </div>
              }
            />
          </div>
        ) : (
          assigneeStateCluster
        )}

        <span className='text-muted-foreground shrink-0 text-[11px]'>
          {formatDateHuman(new Date(issue.updatedAt))}
        </span>
      </div>
    </div>
  );
}
