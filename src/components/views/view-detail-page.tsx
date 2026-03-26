'use client';

import { api, useCachedQuery, useMutation } from '@/lib/convex';
import { useParams } from 'next/navigation';
import { useRouter } from 'nextjs-toploader/app';
import { useState, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  LayoutList,
  Columns3,
  Clock,
  Trash2,
  MoreHorizontal,
  Globe,
  Building,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RichEditor } from '@/components/ui/rich-editor';
import { IssuesTable } from '@/components/issues/issues-table';
import { IssuesKanban } from '@/components/issues/issues-kanban';
import type { KanbanBorderColor } from '@/components/issues/kanban-border-colors';
import { IssuesTimeline } from '@/components/issues/issues-timeline';
import {
  TeamSelector,
  ProjectSelector,
  PrioritySelector,
  StateSelector,
} from '@/components/issues/issue-selectors';
import type { IssueGroupByField } from '@/lib/group-by';
import { GroupBySelector } from '@/components/ui/group-by-selector';
import { PageSkeleton, KanbanSkeleton } from '@/components/ui/table-skeleton';
import {
  VisibilitySelector,
  type VisibilityOption,
} from '@/components/ui/visibility-selector';
import type { ViewMode } from '@/hooks/use-persisted-view-mode';
import { usePermissionCheck } from '@/components/ui/permission-aware';
import { PERMISSIONS } from '@/convex/_shared/permissions';
import { useConfirm } from '@/hooks/use-confirm';
import type { Id } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';
import { MobileNavTrigger } from '@/app/[orgSlug]/(main)/layout';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { EditViewDialog } from './edit-view-dialog';

const PAGE_SIZE = 25;

export function ViewDetailPage() {
  const params = useParams<{ orgSlug: string; viewId: string }>();
  const router = useRouter();
  const orgSlug = params.orgSlug;
  const viewId = params.viewId as Id<'views'>;

  const view = useCachedQuery(api.views.queries.getById, { viewId });
  const user = useCachedQuery(api.users.currentUser);
  const currentUserId = user?._id ?? '';

  const states = useCachedQuery(api.organizations.queries.listIssueStates, {
    orgSlug,
  });
  const priorities = useCachedQuery(
    api.organizations.queries.listIssuePriorities,
    {
      orgSlug,
    },
  );
  const teams = useCachedQuery(api.organizations.queries.listTeams, {
    orgSlug,
  });
  const projects = useCachedQuery(api.organizations.queries.listProjects, {
    orgSlug,
  });

  // Layout is part of the view — read from DB, save on change
  const viewMode: ViewMode = (view?.layout?.viewMode as ViewMode) ?? 'table';
  const groupBy: IssueGroupByField =
    (view?.layout?.groupBy as IssueGroupByField) ?? 'none';

  const [page, setPage] = useState(1);
  const isListView = viewMode === 'table' || viewMode === 'timeline';

  // Build query args from view filters
  const issuesData = useCachedQuery(
    api.views.queries.listViewIssues,
    view
      ? {
          viewId,
          page: isListView ? page : undefined,
          pageSize: isListView ? PAGE_SIZE : undefined,
        }
      : 'skip',
  );

  const { issues = [], total = 0 } = issuesData ?? { issues: [], total: 0 };

  // Mutations
  const changePriority = useMutation(api.issues.mutations.changePriority);
  const updateAssignees = useMutation(api.issues.mutations.updateAssignees);
  const changeTeam = useMutation(api.issues.mutations.changeTeam);
  const changeProject = useMutation(api.issues.mutations.changeProject);
  const changeKanbanBorderColor = useMutation(
    api.issues.mutations.changeKanbanBorderColor,
  );
  const deleteIssue = useMutation(api.issues.mutations.deleteIssue);
  const changeAssignmentState = useMutation(
    api.issues.mutations.changeAssignmentState,
  );
  const updateView = useMutation(api.views.mutations.updateView);
  const deleteView = useMutation(api.views.mutations.deleteView);
  const excludeIssue = useMutation(api.views.mutations.excludeIssueFromView);

  const { isAllowed: canAssignIssues } = usePermissionCheck(
    orgSlug,
    PERMISSIONS.ISSUE_ASSIGN,
  );

  const [deletePending, setDeletePending] = useState(false);
  const [isUpdatingAssignees, setIsUpdatingAssignees] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const [confirm, ConfirmDialog] = useConfirm();
  const canEditView = view?.canEdit ?? false;

  // ── Layout handlers (persist to view DB) ──────────────────────────────

  const setViewMode = (mode: ViewMode) => {
    if (!canEditView) return;
    void updateView({
      viewId,
      layout: { viewMode: mode, groupBy: view?.layout?.groupBy },
    });
  };

  const setGroupBy = (value: IssueGroupByField) => {
    if (!canEditView) return;
    void updateView({
      viewId,
      layout: { viewMode: view?.layout?.viewMode, groupBy: value },
    });
  };

  // ── Filter handlers ───────────────────────────────────────────────────

  const handleFilterChange = (patch: Record<string, unknown>) => {
    if (!view || !canEditView) return;
    void updateView({
      viewId,
      filters: { ...view.filters, ...patch },
    });
  };

  // ── Issue mutation handlers ───────────────────────────────────────────

  const handlePriorityChange = (issueId: string, priorityId: string) => {
    if (!user || !priorityId) return;
    void changePriority({
      issueId: issueId as Id<'issues'>,
      priorityId: priorityId as Id<'issuePriorities'>,
    });
  };

  const handleAssigneesChange = async (
    issueId: string,
    assigneeIds: string[],
  ) => {
    if (!user) return;
    setIsUpdatingAssignees(true);
    try {
      await updateAssignees({
        issueId: issueId as Id<'issues'>,
        assigneeIds: assigneeIds as Id<'users'>[],
      });
    } finally {
      setIsUpdatingAssignees(false);
    }
  };

  const handleTeamChange = (issueId: string, teamId: string) => {
    if (!user) return;
    void changeTeam({
      issueId: issueId as Id<'issues'>,
      teamId: teamId as Id<'teams'>,
    });
  };

  const handleProjectChange = (issueId: string, projectId: string) => {
    if (!user) return;
    void changeProject({
      issueId: issueId as Id<'issues'>,
      projectId: projectId as Id<'projects'>,
    });
  };

  const handleKanbanBorderColorChange = (
    issueId: string,
    borderColor: KanbanBorderColor | '',
  ) => {
    if (!user) return;
    void changeKanbanBorderColor({
      issueId: issueId as Id<'issues'>,
      borderColor: borderColor || null,
    });
  };

  const handleDelete = async (issueId: string) => {
    const confirmed = await confirm({
      title: 'Delete issue',
      description: 'This action cannot be undone.',
    });
    if (!confirmed) return;
    setDeletePending(true);
    try {
      await deleteIssue({ issueId: issueId as Id<'issues'> });
    } finally {
      setDeletePending(false);
    }
  };

  const handleAssignmentStateChange = (
    assignmentId: string,
    stateId: string,
  ) => {
    void changeAssignmentState({
      assignmentId: assignmentId as Id<'issueAssignees'>,
      stateId: stateId as Id<'issueStates'>,
    });
  };

  const handleExclude = (issueId: string) => {
    if (!canEditView) return;
    void excludeIssue({ viewId, issueId: issueId as Id<'issues'> });
    toast.success('Issue excluded from view');
  };

  const handleVisibilityChange = (visibility: VisibilityOption) => {
    if (!canEditView) return;
    void updateView({ viewId, visibility });
  };

  const handleNameSave = async () => {
    if (!canEditView) return;
    if (!editName.trim()) return;
    await updateView({ viewId, name: editName.trim() });
    setIsEditingName(false);
  };

  const descDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDescriptionChange = useCallback(
    (value: string) => {
      if (!canEditView) return;
      if (descDebounceRef.current) clearTimeout(descDebounceRef.current);
      descDebounceRef.current = setTimeout(() => {
        void updateView({ viewId, description: value || undefined });
      }, 1500);
    },
    [canEditView, updateView, viewId],
  );

  const handleDeleteView = async () => {
    if (!canEditView) return;
    const confirmed = await confirm({
      title: 'Delete view',
      description:
        'This will permanently delete this view. This action cannot be undone.',
    });
    if (!confirmed) return;
    await deleteView({ viewId });
    router.push(`/${orgSlug}/views`);
    toast.success('View deleted');
  };

  if (!view) {
    return <PageSkeleton />;
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const selectedTeam = (view.filters.teamId as string) ?? '';
  const selectedProject = (view.filters.projectId as string) ?? '';
  const selectedPriorities = (view.filters.priorityIds ?? []) as string[];
  const selectedStates = (view.filters.workflowStateIds ?? []) as string[];

  const VisibilityIcon =
    view.visibility === 'public'
      ? Globe
      : view.visibility === 'private'
        ? Lock
        : Building;

  const visibilityColorClass =
    view.visibility === 'public'
      ? 'text-emerald-500'
      : view.visibility === 'private'
        ? 'text-purple-500'
        : 'text-blue-500';

  return (
    <>
      <ConfirmDialog />
      <EditViewDialog
        orgSlug={orgSlug}
        viewId={viewId}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />
      <div className='bg-background flex h-full flex-col overflow-y-auto'>
        {/* ── Title bar ──────────────────────────────────────────────── */}
        <div className='bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 flex items-center justify-between gap-2 border-b px-2 py-1 backdrop-blur'>
          <div className='flex items-center gap-1'>
            <MobileNavTrigger />
            <span className='text-muted-foreground text-xs'>Views</span>
            <span className='text-muted-foreground text-xs'>/</span>
            <span className='text-xs font-medium'>{view.name}</span>
          </div>
          <div className='flex shrink-0 items-center gap-1'>
            {/* View mode toggle */}
            <div className='border-border flex items-center rounded-md border'>
              <Button
                variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                size='sm'
                className='h-6 rounded-none rounded-l-md px-2'
                disabled={!canEditView}
                onClick={() => setViewMode('table')}
              >
                <LayoutList className='size-3.5' />
              </Button>
              <Button
                variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
                size='sm'
                className='h-6 rounded-none px-2'
                disabled={!canEditView}
                onClick={() => setViewMode('kanban')}
              >
                <Columns3 className='size-3.5' />
              </Button>
              <Button
                variant={viewMode === 'timeline' ? 'secondary' : 'ghost'}
                size='sm'
                className='h-6 rounded-none rounded-r-md px-2'
                disabled={!canEditView}
                onClick={() => setViewMode('timeline')}
              >
                <Clock className='size-3.5' />
              </Button>
            </div>

            {/* Group by */}
            <GroupBySelector<IssueGroupByField>
              options={[
                { value: 'none', label: 'No grouping' },
                { value: 'priority', label: 'Priority' },
                { value: 'status', label: 'Status' },
                { value: 'assignee', label: 'Assignee' },
                { value: 'team', label: 'Team' },
                { value: 'project', label: 'Project' },
              ]}
              value={groupBy}
              onChange={setGroupBy}
              className='h-6 text-xs'
              disabled={!canEditView}
            />

            <div className='bg-border mx-0.5 h-4 w-px' />

            <VisibilitySelector
              value={view.visibility as VisibilityOption}
              onValueChange={handleVisibilityChange}
              disabled={!canEditView}
              publicLinkUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}/${orgSlug}/views/${viewId}/public`}
              trigger={
                <Button
                  variant='ghost'
                  size='sm'
                  className='h-6 w-6 p-0'
                  disabled={!canEditView}
                >
                  <VisibilityIcon
                    className={`size-3.5 ${visibilityColorClass}`}
                  />
                </Button>
              }
            />
            {canEditView && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant='ghost' size='sm' className='h-6 w-6 p-0'>
                    <MoreHorizontal className='size-3.5' />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align='end' className='w-48 p-0'>
                  <Command>
                    <CommandList>
                      <CommandGroup>
                        <CommandItem onSelect={() => setEditDialogOpen(true)}>
                          Edit view
                        </CommandItem>
                        <CommandItem
                          onSelect={() => void handleDeleteView()}
                          className='text-destructive'
                        >
                          <Trash2 className='mr-2 size-3.5' />
                          Delete view
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>

        {/* ── Title + description + filters ──────────────────────────── */}
        <div className='mx-auto w-full max-w-5xl px-4 pt-6 pb-2 sm:px-6'>
          {/* Title */}
          {isEditingName ? (
            <Input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void handleNameSave();
                if (e.key === 'Escape') setIsEditingName(false);
              }}
              onBlur={() => void handleNameSave()}
              className='h-auto border-none p-0 !text-3xl !leading-tight font-semibold shadow-none focus-visible:ring-0'
              autoFocus
            />
          ) : (
            <h1
              className={`text-2xl leading-tight font-semibold transition-colors sm:text-3xl ${canEditView ? 'hover:text-foreground/80 cursor-pointer' : ''}`}
              onClick={() => {
                if (!canEditView) return;
                setEditName(view.name);
                setIsEditingName(true);
              }}
            >
              {view.name}
            </h1>
          )}

          {/* Description — compact, prose-sm */}
          <div className='mt-1.5 [&_.tiptap]:min-h-0 [&_.tiptap]:text-sm [&_.tiptap]:leading-relaxed'>
            <RichEditor
              value={view.description ?? ''}
              onChange={handleDescriptionChange}
              placeholder='Add a description...'
              disabled={!canEditView}
              mode='compact'
              borderless
              className='text-muted-foreground'
            />
          </div>

          {/* Filters row — interactive selectors */}
          <div
            className={`mt-3 flex flex-wrap items-center gap-1.5 ${canEditView ? '' : 'pointer-events-none opacity-60'}`}
          >
            <TeamSelector
              teams={teams ?? []}
              selectedTeam={selectedTeam}
              onTeamSelect={v => {
                const next = v === selectedTeam ? '' : v;
                handleFilterChange({
                  teamId: next ? (next as Id<'teams'>) : undefined,
                });
              }}
              displayMode='iconWhenUnselected'
            />
            <ProjectSelector
              projects={projects ?? []}
              selectedProject={selectedProject}
              onProjectSelect={v => {
                const next = v === selectedProject ? '' : v;
                handleFilterChange({
                  projectId: next ? (next as Id<'projects'>) : undefined,
                });
              }}
              displayMode='iconWhenUnselected'
            />
            <PrioritySelector
              priorities={priorities ?? []}
              selectedPriority={selectedPriorities[0] ?? ''}
              selectedPriorities={selectedPriorities}
              onPrioritySelect={v => {
                const next = selectedPriorities.includes(v)
                  ? selectedPriorities.filter(id => id !== v)
                  : [...selectedPriorities, v];
                handleFilterChange({
                  priorityIds: next.length
                    ? (next as Id<'issuePriorities'>[])
                    : undefined,
                });
              }}
              displayMode='iconWhenUnselected'
            />
            <StateSelector
              states={states ?? []}
              selectedState={selectedStates[0] ?? ''}
              selectedStates={selectedStates}
              onStateSelect={v => {
                const next = selectedStates.includes(v)
                  ? selectedStates.filter(id => id !== v)
                  : [...selectedStates, v];
                handleFilterChange({
                  workflowStateIds: next.length
                    ? (next as Id<'issueStates'>[])
                    : undefined,
                });
              }}
              displayMode='iconWhenUnselected'
            />
          </div>
        </div>

        {/* ── Issue list ─────────────────────────────────────────────── */}
        <div className='flex-1'>
          <AnimatePresence mode='wait'>
            <motion.div
              key={viewMode}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {!issuesData ? (
                viewMode === 'kanban' ? (
                  <KanbanSkeleton />
                ) : (
                  <PageSkeleton />
                )
              ) : viewMode === 'kanban' ? (
                <IssuesKanban
                  orgSlug={orgSlug}
                  issues={issues}
                  states={states ?? []}
                  priorities={priorities ?? []}
                  teams={teams ?? []}
                  projects={projects ?? []}
                  onPriorityChange={handlePriorityChange}
                  onAssigneesChange={handleAssigneesChange}
                  onTeamChange={handleTeamChange}
                  onProjectChange={handleProjectChange}
                  onKanbanBorderColorChange={handleKanbanBorderColorChange}
                  onDelete={handleDelete}
                  deletePending={deletePending}
                  currentUserId={currentUserId}
                  canManageAssignees={canAssignIssues}
                  groupBy={groupBy}
                />
              ) : viewMode === 'timeline' ? (
                <IssuesTimeline
                  orgSlug={orgSlug}
                  issues={issues}
                  states={states ?? []}
                  priorities={priorities ?? []}
                  teams={teams ?? []}
                  projects={projects ?? []}
                  onPriorityChange={handlePriorityChange}
                  onAssigneesChange={handleAssigneesChange}
                  onTeamChange={handleTeamChange}
                  onProjectChange={handleProjectChange}
                  onAssignmentStateChange={handleAssignmentStateChange}
                  onDelete={handleDelete}
                  deletePending={deletePending}
                  isUpdatingAssignees={isUpdatingAssignees}
                  currentUserId={currentUserId}
                  canManageAssignees={canAssignIssues}
                  activeFilter='all'
                />
              ) : (
                <IssuesTable
                  orgSlug={orgSlug}
                  issues={issues}
                  states={states ?? []}
                  priorities={priorities ?? []}
                  teams={teams ?? []}
                  projects={projects ?? []}
                  onPriorityChange={handlePriorityChange}
                  onAssigneesChange={handleAssigneesChange}
                  onTeamChange={handleTeamChange}
                  onProjectChange={handleProjectChange}
                  onDelete={handleDelete}
                  onExclude={canEditView ? handleExclude : undefined}
                  deletePending={deletePending}
                  isUpdatingAssignees={isUpdatingAssignees}
                  onAssignmentStateChange={handleAssignmentStateChange}
                  currentUserId={currentUserId}
                  canManageAssignees={canAssignIssues}
                  activeFilter='all'
                  groupBy={groupBy}
                />
              )}
            </motion.div>
          </AnimatePresence>

          {isListView && totalPages > 1 && (
            <div className='mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6'>
              <span className='text-muted-foreground text-xs'>
                {total} issue{total !== 1 ? 's' : ''}
              </span>
              <div className='flex items-center gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  className='h-6 text-xs'
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  Prev
                </Button>
                <span className='text-muted-foreground text-xs'>
                  {page} / {totalPages}
                </span>
                <Button
                  variant='outline'
                  size='sm'
                  className='h-6 text-xs'
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
