'use client';

import {
  api,
  useCachedQuery,
  useCachedPaginatedQuery,
  useMutation,
} from '@/lib/convex';
import { AutoLoadMore } from '@/components/ui/auto-load-more';
import { Button } from '@/components/ui/button';
import { CreateIssueDialog } from '@/components/issues/create-issue-dialog';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useDeferredValue, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';
import {
  LayoutList,
  Columns3,
  Clock,
  Search,
  Loader2,
  CalendarClock,
  X as XIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { IssuesTable } from '@/components/issues/issues-table';
import { IssuesKanban } from '@/components/issues/issues-kanban';
import { IssuesTimeline } from '@/components/issues/issues-timeline';
import type { KanbanBorderColor } from '@/components/issues/kanban-border-colors';
import type { IssueGroupByField } from '@/lib/group-by';
import { GroupBySelector } from '@/components/ui/group-by-selector';
import { PageSkeleton, KanbanSkeleton } from '@/components/ui/table-skeleton';
import {
  ProjectSelector,
  TeamSelector,
} from '@/components/issues/issue-selectors';
import { ISSUE_STATE_DEFAULTS } from '@/lib/defaults';
import type { Id } from '@/convex/_generated/dataModel';
import {
  PermissionAware,
  usePermissionCheck,
} from '@/components/ui/permission-aware';
import { PERMISSIONS } from '@/convex/_shared/permissions';
import { useConfirm } from '@/hooks/use-confirm';
import {
  usePersistedViewMode,
  type ViewMode,
} from '@/hooks/use-persisted-view-mode';
import { MobileNavTrigger } from '../layout';

type StateType = (typeof ISSUE_STATE_DEFAULTS)[number]['type'];
type FilterType = 'all' | StateType;
type ScopeTab = 'mine' | 'related' | 'all';

const TAB_LABELS: Record<FilterType, string> = {
  all: 'All',
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
  canceled: 'Canceled',
} as const;

const BASE_TABS: { key: FilterType; label: string; count: number }[] = [
  { key: 'all', label: TAB_LABELS.all, count: 0 },
];
const filterTabs = [
  ...BASE_TABS,
  ...ISSUE_STATE_DEFAULTS.map(value => ({
    key: value.type as FilterType,
    label: TAB_LABELS[value.type as StateType],
    count: 0,
  })),
];

const ISSUES_LAYOUT_STORAGE_KEY = 'vector:issues-list-layout';
const ISSUES_TABLE_GROUP_BY_KEY = 'vector:issues-table-group-by';
const ISSUES_KANBAN_GROUP_BY_KEY = 'vector:issues-kanban-group-by';
const VALID_ISSUE_GROUP_BY: IssueGroupByField[] = [
  'none',
  'priority',
  'status',
  'assignee',
  'team',
  'project',
];

function getInitialGroupBy(
  storageKey: string,
  defaultValue: IssueGroupByField,
): IssueGroupByField {
  if (typeof window === 'undefined') return defaultValue;
  const urlVal = new URLSearchParams(window.location.search).get('groupBy');
  if (urlVal && VALID_ISSUE_GROUP_BY.includes(urlVal as IssueGroupByField))
    return urlVal as IssueGroupByField;
  const stored = localStorage.getItem(storageKey);
  if (stored && VALID_ISSUE_GROUP_BY.includes(stored as IssueGroupByField))
    return stored as IssueGroupByField;
  return defaultValue;
}

// Format a Date as a YYYY-MM-DD string in the user's local timezone. The
// issue.dueDate field is stored as a calendar date with no timezone, so we
// match it locally rather than via toISOString() which would shift the
// boundary by the user's UTC offset.
function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

const DUE_FILTER_PRESETS = [
  { key: 'today', label: 'Today', days: 0 },
  { key: '4d', label: 'Within 4 days', days: 4 },
  { key: 'week', label: 'This week', days: 7 },
] as const;

type DueFilterPreset = (typeof DUE_FILTER_PRESETS)[number]['key'] | 'custom';

type DueFilterValue = {
  preset: DueFilterPreset;
  dueBefore: string;
};

function DueDateFilterButton({
  dueFilter,
  setDueFilter,
}: {
  dueFilter: DueFilterValue | null;
  setDueFilter: (value: DueFilterValue | null) => void;
}) {
  const [open, setOpen] = useState(false);

  const activeLabel = (() => {
    if (!dueFilter) return null;
    if (dueFilter.preset === 'custom') {
      const date = new Date(`${dueFilter.dueBefore}T00:00:00`);
      if (Number.isNaN(date.getTime())) return 'Custom';
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    }
    return DUE_FILTER_PRESETS.find(preset => preset.key === dueFilter.preset)
      ?.label;
  })();

  const isActive = dueFilter !== null;

  const applyPreset = (preset: (typeof DUE_FILTER_PRESETS)[number]) => {
    const target = addDays(new Date(), preset.days);
    setDueFilter({
      preset: preset.key,
      dueBefore: localDateString(target),
    });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={isActive ? 'secondary' : 'ghost'}
          size='sm'
          className={cn(
            'h-6 gap-1.5 px-2 text-xs',
            isActive && 'bg-secondary text-secondary-foreground',
          )}
          title='Filter by due date'
        >
          <CalendarClock className='size-3.5' />
          {isActive ? <span>Due {activeLabel}</span> : null}
          {isActive ? (
            <span
              role='button'
              tabIndex={0}
              aria-label='Clear due date filter'
              onClick={event => {
                event.stopPropagation();
                setDueFilter(null);
              }}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  setDueFilter(null);
                }
              }}
              className='hover:text-foreground -mr-0.5 ml-0.5 inline-flex items-center'
            >
              <XIcon className='size-3' />
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-auto p-2'>
        <div className='flex flex-col gap-1'>
          <div className='text-muted-foreground px-1 pt-0.5 pb-1 text-[10px] tracking-[0.12em] uppercase'>
            Due before
          </div>
          {DUE_FILTER_PRESETS.map(preset => {
            const isSelected = dueFilter?.preset === preset.key;
            return (
              <Button
                key={preset.key}
                type='button'
                variant={isSelected ? 'secondary' : 'ghost'}
                size='sm'
                className='h-7 justify-start gap-2 px-2 text-xs'
                onClick={() => applyPreset(preset)}
              >
                <CalendarClock className='size-3' />
                <span>{preset.label}</span>
              </Button>
            );
          })}
          <div className='bg-border my-1 h-px' />
          <CalendarComponent
            mode='single'
            selected={
              dueFilter?.preset === 'custom'
                ? new Date(`${dueFilter.dueBefore}T00:00:00`)
                : undefined
            }
            onSelect={date => {
              if (!date) return;
              setDueFilter({
                preset: 'custom',
                dueBefore: localDateString(date),
              });
              setOpen(false);
            }}
            initialFocus={false}
            className='[--cell-size:--spacing(7)]'
          />
          {isActive ? (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='h-7 justify-center px-2 text-xs'
              onClick={() => {
                setDueFilter(null);
                setOpen(false);
              }}
            >
              Clear filter
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function IssuesPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const orgSlug = params.orgSlug as string;
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [scopeTab, setScopeTab] = useState<ScopeTab>('mine');
  const [tableGroupBy, setTableGroupByState] = useState<IssueGroupByField>(() =>
    getInitialGroupBy(ISSUES_TABLE_GROUP_BY_KEY, 'priority'),
  );
  const [kanbanGroupBy, setKanbanGroupByState] = useState<IssueGroupByField>(
    () => getInitialGroupBy(ISSUES_KANBAN_GROUP_BY_KEY, 'status'),
  );
  const setGroupBy = useCallback((val: IssueGroupByField, mode: ViewMode) => {
    if (mode === 'table') {
      setTableGroupByState(val);
      localStorage.setItem(ISSUES_TABLE_GROUP_BY_KEY, val);
    } else {
      setKanbanGroupByState(val);
      localStorage.setItem(ISSUES_KANBAN_GROUP_BY_KEY, val);
    }
    const sp = new URLSearchParams(window.location.search);
    if (
      (mode === 'table' && val === 'priority') ||
      (mode === 'kanban' && val === 'status')
    ) {
      sp.delete('groupBy');
    } else {
      sp.set('groupBy', val);
    }
    const qs = sp.toString();
    window.history.replaceState(
      null,
      '',
      qs ? `?${qs}` : window.location.pathname,
    );
  }, []);

  const viewParam = searchParams.get('view');
  const queryMode: ViewMode | null =
    viewParam === 'table'
      ? 'table'
      : viewParam === 'timeline'
        ? 'timeline'
        : null;
  const syncViewModeUrl = useCallback((mode: ViewMode) => {
    const sp = new URLSearchParams(window.location.search);
    if (mode === 'kanban') {
      sp.delete('view');
    } else {
      sp.set('view', mode);
    }
    const qs = sp.toString();
    window.history.replaceState(
      null,
      '',
      qs ? `?${qs}` : window.location.pathname,
    );
  }, []);
  const { viewMode, setViewMode } = usePersistedViewMode({
    storageKey: ISSUES_LAYOUT_STORAGE_KEY,
    defaultMode: 'kanban',
    queryMode,
    syncUrl: syncViewModeUrl,
  });
  const isListView = viewMode === 'table' || viewMode === 'timeline';
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  const deferredSearch = useDeferredValue(searchText);

  // Due-date filter — `null` is "no filter", otherwise an inclusive
  // YYYY-MM-DD upper bound that gets passed to the issues query.
  const [dueFilter, setDueFilter] = useState<{
    preset: 'today' | '4d' | 'week' | 'custom';
    dueBefore: string;
  } | null>(null);

  const user = useCachedQuery(api.users.currentUser);
  const currentUserId = user?._id || '';

  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingAssignees, setIsUpdatingAssignees] = useState(false);
  const [isUpdatingAssignmentStates, setIsUpdatingAssignmentStates] =
    useState(false);

  const [confirm, ConfirmDialog] = useConfirm();
  const deleteMutation = useMutation(api.issues.mutations.deleteIssue);
  const changePriorityMutation = useMutation(
    api.issues.mutations.changePriority,
  );
  const updateAssigneesMutation = useMutation(
    api.issues.mutations.updateAssignees,
  );
  const changeTeamMutation = useMutation(api.issues.mutations.changeTeam);
  const changeProjectMutation = useMutation(api.issues.mutations.changeProject);
  const changeKanbanBorderColorMutation = useMutation(
    api.issues.mutations.changeKanbanBorderColor,
  );
  const changeAssignmentStateMutation = useMutation(
    api.issues.mutations.changeAssignmentState,
  );
  const { isAllowed: canAssignIssues } = usePermissionCheck(
    orgSlug,
    PERMISSIONS.ISSUE_ASSIGN,
  );
  const { isAllowed: canUpdateAssignmentStates } = usePermissionCheck(
    orgSlug,
    PERMISSIONS.ISSUE_ASSIGNMENT_UPDATE,
  );

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

  const scopeQueryArgs = {
    orgSlug,
    projectId: selectedProject || undefined,
    teamId: selectedTeam || undefined,
    searchQuery: deferredSearch || undefined,
    dueBefore: dueFilter?.dueBefore,
  };

  const summary = useCachedQuery(api.issues.queries.getIssueListSummary, {
    ...scopeQueryArgs,
    scope: scopeTab,
  });
  const paginatedIssues = useCachedPaginatedQuery(
    api.issues.queries.listIssuesPage,
    {
      ...scopeQueryArgs,
      workflowStateType:
        isListView && activeFilter !== 'all' ? activeFilter : undefined,
      scope: scopeTab,
    },
    { initialNumItems: 20 },
  );
  const kanbanIssuesData = useCachedQuery(
    api.issues.queries.listIssues,
    viewMode === 'kanban'
      ? {
          ...scopeQueryArgs,
          assigneeId:
            scopeTab === 'mine' ? currentUserId || undefined : undefined,
          relatedOnly: scopeTab === 'related' ? true : undefined,
          includeCounts: true,
        }
      : 'skip',
  );
  const listIssues = paginatedIssues.results;
  const issues =
    viewMode === 'kanban' ? (kanbanIssuesData?.issues ?? []) : listIssues;
  const total = summary?.total ?? 0;
  const counts = summary?.counts ?? {};
  const scopeCounts = summary?.scopeCounts ?? {
    mine: 0,
    related: 0,
    all: 0,
  };

  const handlePriorityChange = (issueId: string, priorityId: string) => {
    if (!user || !priorityId) return;
    void changePriorityMutation({
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
      await updateAssigneesMutation({
        issueId: issueId as Id<'issues'>,
        assigneeIds: assigneeIds as Id<'users'>[],
      });
    } finally {
      setIsUpdatingAssignees(false);
    }
  };

  const handleTeamChange = (issueId: string, teamId: string) => {
    if (!user) return;
    void changeTeamMutation({
      issueId: issueId as Id<'issues'>,
      teamId: (teamId as Id<'teams'>) || null,
    });
  };

  const handleProjectChange = (issueId: string, projectId: string) => {
    if (!user) return;
    void changeProjectMutation({
      issueId: issueId as Id<'issues'>,
      projectId: (projectId as Id<'projects'>) || null,
    });
  };

  const handleKanbanBorderColorChange = (
    issueId: string,
    borderColor: KanbanBorderColor | '',
  ) => {
    if (!user) return;
    void changeKanbanBorderColorMutation({
      issueId: issueId as Id<'issues'>,
      borderColor: borderColor || null,
    });
  };

  const handleAssignmentStateChange = async (
    assignmentId: string,
    stateId: string,
  ) => {
    if (!user || !assignmentId || !stateId) return;
    setIsUpdatingAssignmentStates(true);
    try {
      await changeAssignmentStateMutation({
        assignmentId: assignmentId as Id<'issueAssignees'>,
        stateId: stateId as Id<'issueStates'>,
      });
    } finally {
      setIsUpdatingAssignmentStates(false);
    }
  };

  const handleDelete = async (issueId: string) => {
    const ok = await confirm({
      title: 'Delete issue',
      description:
        'This will permanently delete the issue and cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    setIsDeleting(true);
    try {
      await deleteMutation({ issueId: issueId as Id<'issues'> });
    } finally {
      setIsDeleting(false);
    }
  };

  const updatedTabs = filterTabs.map(tab => ({
    ...tab,
    count:
      tab.key === 'all'
        ? total
        : ((counts as Record<string, number>)[tab.key as string] ?? 0),
  }));

  const visibleTabs = updatedTabs.filter(t => t.key === 'all' || t.count > 0);

  if (
    user === undefined ||
    summary === undefined ||
    states === undefined ||
    (viewMode === 'kanban'
      ? kanbanIssuesData === undefined
      : paginatedIssues.status === 'LoadingFirstPage')
  ) {
    return viewMode === 'kanban' ? (
      <div className='bg-background h-full'>
        <div className='border-b'>
          <div className='flex items-center justify-between p-1'>
            <div className='flex items-center gap-1'>
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className='bg-muted/70 h-6 w-16 animate-pulse rounded-md'
                />
              ))}
            </div>
            <div className='bg-muted/70 h-6 w-20 animate-pulse rounded-md' />
          </div>
        </div>
        <KanbanSkeleton />
      </div>
    ) : (
      <PageSkeleton
        showTabs={true}
        tabCount={5}
        showCreateButton={true}
        tableRows={8}
        tableColumns={6}
      />
    );
  }

  const mappedTeams = teams ?? [];
  const mappedProjects = projects ?? [];

  return (
    <div className='bg-background h-full'>
      {/* Header with tabs */}
      <div className='border-b'>
        <div className='flex flex-col gap-1 p-1 sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex min-w-0 flex-1 items-center gap-1 overflow-x-auto'>
            <MobileNavTrigger />
            {[
              { key: 'mine' as const, label: 'My issues' },
              { key: 'related' as const, label: 'Related' },
              { key: 'all' as const, label: 'All issues' },
            ].map(tab => (
              <Button
                key={tab.key}
                variant={scopeTab === tab.key ? 'secondary' : 'ghost'}
                size='sm'
                className={cn(
                  'h-6 shrink-0 gap-2 rounded-xs px-3 text-xs font-normal',
                  scopeTab === tab.key && 'bg-secondary',
                )}
                onClick={() => {
                  setScopeTab(tab.key);
                  setActiveFilter('all');
                }}
              >
                <span>{tab.label}</span>
                <span className='text-muted-foreground text-xs'>
                  {scopeCounts[tab.key]}
                </span>
              </Button>
            ))}
            {isListView && (
              <>
                <div className='bg-border mx-1 h-4 w-px shrink-0' />
                {visibleTabs.map(tab => (
                  <Button
                    key={tab.key}
                    variant={activeFilter === tab.key ? 'secondary' : 'ghost'}
                    size='sm'
                    className={cn(
                      'h-6 shrink-0 gap-2 rounded-xs px-3 text-xs font-normal',
                      activeFilter === tab.key && 'bg-secondary',
                    )}
                    onClick={() => setActiveFilter(tab.key)}
                  >
                    <span>{tab.label}</span>
                    <span className='text-muted-foreground text-xs'>
                      {tab.count}
                    </span>
                  </Button>
                ))}
              </>
            )}
          </div>

          {/* View switcher + filters + create */}
          <div className='flex shrink-0 items-center gap-1 overflow-x-auto'>
            {/* Search */}
            <div className='relative'>
              {deferredSearch !== searchText ? (
                <Loader2 className='text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 animate-spin' />
              ) : (
                <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2' />
              )}
              <Input
                placeholder='Search issues...'
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className='h-6 w-40 pl-7 text-xs'
              />
            </div>
            {/* View mode toggle */}
            <div className='border-border flex items-center rounded-md border'>
              <Button
                variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                size='sm'
                className='h-6 rounded-none rounded-l-md px-2'
                onClick={() => setViewMode('table')}
              >
                <LayoutList className='size-3.5' />
              </Button>
              <Button
                variant={viewMode === 'timeline' ? 'secondary' : 'ghost'}
                size='sm'
                className='h-6 rounded-none px-2'
                onClick={() => setViewMode('timeline')}
              >
                <Clock className='size-3.5' />
              </Button>
              <Button
                variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
                size='sm'
                className='h-6 rounded-none rounded-r-md px-2'
                onClick={() => {
                  setViewMode('kanban');
                  setActiveFilter('all');
                }}
              >
                <Columns3 className='size-3.5' />
              </Button>
            </div>

            {/* Group by selector */}
            <GroupBySelector<IssueGroupByField>
              options={[
                { value: 'none', label: 'No grouping' },
                { value: 'priority', label: 'Priority' },
                { value: 'status', label: 'Status' },
                { value: 'assignee', label: 'Assignee' },
                { value: 'team', label: 'Team' },
                { value: 'project', label: 'Project' },
              ]}
              value={viewMode === 'table' ? tableGroupBy : kanbanGroupBy}
              onChange={val => setGroupBy(val, viewMode)}
              className='h-6 text-xs'
            />

            {/* Due date filter — compact popover with one-click presets */}
            <DueDateFilterButton
              dueFilter={dueFilter}
              setDueFilter={setDueFilter}
            />

            {/* Team filter */}
            <PermissionAware
              orgSlug={orgSlug}
              permission={PERMISSIONS.TEAM_VIEW}
              fallbackMessage="You don't have permission to view teams"
              showTooltip={true}
            >
              <TeamSelector
                teams={mappedTeams}
                selectedTeam={selectedTeam}
                onTeamSelect={setSelectedTeam}
                displayMode='iconWhenUnselected'
                className='h-6 text-xs'
              />
            </PermissionAware>

            {/* Project filter - hidden on small screens */}
            <div className='hidden sm:block'>
              <PermissionAware
                orgSlug={orgSlug}
                permission={PERMISSIONS.PROJECT_VIEW}
                fallbackMessage="You don't have permission to view projects"
                showTooltip={true}
              >
                <ProjectSelector
                  projects={mappedProjects}
                  selectedProject={selectedProject}
                  onProjectSelect={setSelectedProject}
                  displayMode='iconWhenUnselected'
                  className='h-6 text-xs'
                />
              </PermissionAware>
            </div>

            <CreateIssueDialog className='h-6' orgSlug={orgSlug} />
          </div>
        </div>
      </div>

      {/* Issues content */}
      <AnimatePresence mode='wait' initial={false}>
        {viewMode === 'table' ? (
          <motion.div
            key='table'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className='flex flex-1 flex-col'
          >
            <div className='flex-1'>
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
                deletePending={isDeleting}
                isUpdatingAssignees={isUpdatingAssignees}
                onAssignmentStateChange={handleAssignmentStateChange}
                isUpdatingAssignmentStates={isUpdatingAssignmentStates}
                currentUserId={currentUserId}
                canManageAssignees={canAssignIssues}
                activeFilter={activeFilter}
                groupBy={tableGroupBy}
              />
            </div>
            <AutoLoadMore
              status={paginatedIssues.status}
              loadMore={paginatedIssues.loadMore}
              pageSize={20}
            />
          </motion.div>
        ) : viewMode === 'timeline' ? (
          <motion.div
            key='timeline'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className='flex flex-1 flex-col'
          >
            <div className='flex-1 overflow-y-auto'>
              <IssuesTimeline
                orgSlug={orgSlug}
                issues={issues}
                states={states ?? []}
                priorities={priorities ?? []}
                teams={teams ?? []}
                projects={projects ?? []}
                currentUserId={currentUserId}
                canManageAssignees={canAssignIssues}
                activeFilter={activeFilter}
                onPriorityChange={handlePriorityChange}
                onAssigneesChange={handleAssigneesChange}
                onTeamChange={handleTeamChange}
                onProjectChange={handleProjectChange}
                onAssignmentStateChange={handleAssignmentStateChange}
                onDelete={handleDelete}
                deletePending={isDeleting}
                isUpdatingAssignees={isUpdatingAssignees}
              />
            </div>
            <AutoLoadMore
              status={paginatedIssues.status}
              loadMore={paginatedIssues.loadMore}
              pageSize={20}
            />
          </motion.div>
        ) : (
          <motion.div
            key='kanban'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className='flex-1 overflow-hidden'
          >
            <IssuesKanban
              orgSlug={orgSlug}
              issues={issues}
              states={states ?? []}
              priorities={priorities ?? []}
              teams={teams ?? []}
              projects={projects ?? []}
              currentUserId={currentUserId}
              canManageAssignees={canAssignIssues}
              canUpdateAssignmentStates={canUpdateAssignmentStates}
              onStateChange={(_issueId, assignmentId, stateId) => {
                void handleAssignmentStateChange(assignmentId, stateId);
              }}
              onPriorityChange={handlePriorityChange}
              onAssigneesChange={(issueId, ids) => {
                void handleAssigneesChange(issueId, ids);
              }}
              onTeamChange={handleTeamChange}
              onProjectChange={handleProjectChange}
              onKanbanBorderColorChange={handleKanbanBorderColorChange}
              onDelete={handleDelete}
              deletePending={isDeleting}
              groupBy={kanbanGroupBy}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <ConfirmDialog />
    </div>
  );
}
