'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Save,
  X,
  Plus,
  FolderOpen,
  LayoutList,
  Columns3,
} from 'lucide-react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RichEditor } from '@/components/ui/rich-editor';
import { formatDateHuman } from '@/lib/date';
import { StatusSelector } from '@/components/projects/project-selectors';
import { ProjectLeadSelector } from '@/components/projects/project-lead-selector';
import { TeamSelector } from '@/components/teams/team-selector';
import { ProjectMembersSection } from '@/components/projects/project-members';
import { ProjectActivityFeed } from '@/components/activity/project-activity-feed';
import { PERMISSIONS } from '@/convex/_shared/permissions';
import {
  usePermissionCheck,
  PermissionAware,
} from '@/components/ui/permission-aware';
import { cn } from '@/lib/utils';
import { IconPicker } from '@/components/ui/icon-picker';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { getDynamicIcon } from '@/lib/dynamic-icons';
import { UsersIcon, CalendarIcon, ClockIcon } from 'lucide-react';
import { MobileNavTrigger } from '../../layout';
import type { Id } from '@/convex/_generated/dataModel';
import {
  VisibilitySelector,
  type VisibilityState,
} from '@/components/ui/visibility-selector';
import { useOptimisticValue } from '@/hooks/use-optimistic';
import { IssuesKanban } from '@/components/issues/issues-kanban';
import { IssuesTable } from '@/components/issues/issues-table';
import { CreateIssueDialog } from '@/components/issues/create-issue-dialog';

interface ProjectViewClientProps {
  params: { orgSlug: string; projectKey: string };
}

// Default colors for project customization
const DEFAULT_COLORS = [
  '#94a3b8', // slate-400
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#06b6d4', // cyan-500
  '#6b7280', // gray-500
];

export default function ProjectViewClient({ params }: ProjectViewClientProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [descriptionValue, setDescriptionValue] = useState('');
  // Issue view mode from URL search params
  const issueViewParam =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('issueView')
      : null;
  const [issueViewMode, setIssueViewModeState] = useState<'table' | 'kanban'>(
    issueViewParam === 'table' ? 'table' : 'kanban',
  );
  const setIssueViewMode = (mode: 'table' | 'kanban') => {
    setIssueViewModeState(mode);
    const sp = new URLSearchParams(window.location.search);
    if (mode === 'kanban') {
      sp.delete('issueView');
    } else {
      sp.set('issueView', mode);
    }
    const qs = sp.toString();
    window.history.replaceState(
      null,
      '',
      qs ? `?${qs}` : window.location.pathname,
    );
  };

  const user = useQuery(api.users.currentUser);

  const project = useQuery(api.projects.queries.getByKey, {
    orgSlug: params.orgSlug,
    projectKey: params.projectKey,
  });

  const projectId = project?._id;
  const [displayTitle, setOptimisticTitle] = useOptimisticValue(
    project?.name ?? '',
  );
  const [displayDescription, setOptimisticDescription] = useOptimisticValue(
    project?.description ?? '',
  );
  const [displayIcon, setOptimisticIcon] = useOptimisticValue(
    project?.icon ?? '',
  );
  const [displayColor, setOptimisticColor] = useOptimisticValue(
    project?.color ?? '',
  );
  const iconValue = displayIcon || null;
  const colorValue = displayColor || null;

  // Use useMemo to stabilize the scope object and prevent hook rerenders
  const permissionScope = useMemo(() => {
    return projectId
      ? { orgSlug: params.orgSlug, projectId }
      : { orgSlug: params.orgSlug };
  }, [params.orgSlug, projectId]);

  const { isAllowed: canEditProject } = usePermissionCheck(
    params.orgSlug,
    PERMISSIONS.PROJECT_EDIT,
    permissionScope,
  );

  const canEdit = !!(
    user &&
    project &&
    (project.leadId === user._id || canEditProject)
  );

  const statuses = useQuery(api.organizations.queries.listProjectStatuses, {
    orgSlug: params.orgSlug,
  });

  const teams = useQuery(api.organizations.queries.listTeams, {
    orgSlug: params.orgSlug,
  });

  // Issue data for project board
  const issueStates = useQuery(api.organizations.queries.listIssueStates, {
    orgSlug: params.orgSlug,
  });
  const issuePriorities = useQuery(
    api.organizations.queries.listIssuePriorities,
    {
      orgSlug: params.orgSlug,
    },
  );
  const projectIssuesData = useQuery(
    api.issues.queries.listIssues,
    project?._id ? { orgSlug: params.orgSlug, projectId: project._id } : 'skip',
  );
  const projectIssues = projectIssuesData?.issues ?? [];

  const updateMutation = useMutation(api.projects.mutations.update);
  const changeStatusMutation = useMutation(api.projects.mutations.changeStatus);
  const changeTeamMutation = useMutation(api.projects.mutations.changeTeam);
  const changeLeadMutation = useMutation(api.projects.mutations.changeLead);
  const changeAssignmentStateMutation = useMutation(
    api.issues.mutations.changeAssignmentState,
  );
  const changePriorityMutation = useMutation(
    api.issues.mutations.changePriority,
  );
  const updateAssigneesMutation = useMutation(
    api.issues.mutations.updateAssignees,
  );
  const changeVisibilityMutation = useMutation(
    api.projects.mutations.changeVisibility,
  );

  const handleTitleSave = () => {
    if (!project) return;
    const nextTitle = titleValue.trim();
    if (!nextTitle) return;
    setOptimisticTitle(nextTitle);
    setTitleValue(nextTitle);
    void updateMutation({
      projectId: project._id,
      data: { name: nextTitle },
    });
    setEditingTitle(false);
  };

  const handleDescriptionSave = () => {
    if (!project) return;
    const nextDescription = descriptionValue.trim();
    setOptimisticDescription(nextDescription);
    setDescriptionValue(nextDescription);
    void updateMutation({
      projectId: project._id,
      data: { description: nextDescription || undefined },
    });
    setEditingDescription(false);
  };

  const handleStatusChange = (statusId: string) => {
    if (!project) return;
    void changeStatusMutation({
      projectId: project._id,
      statusId: (statusId as Id<'projectStatuses'>) || null,
    });
  };

  const handleTeamChange = (teamId: string) => {
    if (!project) return;
    void changeTeamMutation({
      projectId: project._id,
      teamId: (teamId as Id<'teams'>) || null,
    });
  };

  const handleLeadChange = (leadId: string) => {
    if (!project) return;
    void changeLeadMutation({
      projectId: project._id,
      leadId: (leadId as Id<'users'>) || null,
    });
  };

  const handleIconChange = (iconName: string | null) => {
    if (!project) return;
    setOptimisticIcon(iconName || '');
    void updateMutation({
      projectId: project._id,
      data: { icon: iconName || undefined },
    });
  };

  const handleColorChange = (color: string) => {
    if (!project) return;
    setOptimisticColor(color);
    void updateMutation({
      projectId: project._id,
      data: { color },
    });
  };

  const handleVisibilityChange = async (visibility: VisibilityState) => {
    if (!project) return;
    await changeVisibilityMutation({
      projectId: project._id,
      visibility,
    });
  };

  if (!project) {
    return (
      <div className='bg-background h-full overflow-y-auto'>
        <div className='h-full'>
          <div className='bg-background/95 supports-[backdrop-filter]:bg-background/60 flex items-center justify-between border-b px-2 backdrop-blur'>
            <div className='flex h-8 items-center gap-2'>
              <div className='bg-muted h-4 w-16 animate-pulse rounded' />
            </div>
          </div>
          <div className='mx-auto max-w-5xl px-4 py-4'>
            <div className='space-y-4'>
              <div className='bg-muted h-8 w-3/4 animate-pulse rounded' />
              <div className='bg-muted h-20 animate-pulse rounded' />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='bg-background h-full overflow-y-auto'>
      <div className='h-full'>
        {/* Header */}
        <div className='bg-background/95 supports-[backdrop-filter]:bg-background/60 flex flex-wrap items-center justify-between gap-y-0 border-b px-2 backdrop-blur'>
          <div className='flex h-8 items-center gap-2'>
            <MobileNavTrigger />
            <Link
              href={`/${params.orgSlug}/projects`}
              className='text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm transition-colors'
            >
              <ArrowLeft className='size-3' />
              <span className='hidden sm:inline'>Projects</span>
            </Link>
            <div className='flex items-center'>
              {/* Team & Status selectors */}
              <PermissionAware
                orgSlug={params.orgSlug}
                permission={PERMISSIONS.PROJECT_EDIT}
                scope={permissionScope}
                fallbackMessage="You don't have permission to change project team"
              >
                <TeamSelector
                  teams={teams || []}
                  selectedTeam={project.teamId || ''}
                  onTeamSelect={handleTeamChange}
                  displayMode='iconWhenUnselected'
                  className='border-none bg-transparent shadow-none'
                />
              </PermissionAware>
            </div>
            <span className='text-muted-foreground text-sm'>/</span>
            <span className='text-sm font-medium'>{params.projectKey}</span>
          </div>

          <div className='flex items-center'>
            <PermissionAware
              orgSlug={params.orgSlug}
              permission={PERMISSIONS.PROJECT_EDIT}
              scope={permissionScope}
              fallbackMessage="You don't have permission to change project visibility"
            >
              <VisibilitySelector
                value={project.visibility as VisibilityState}
                onValueChange={handleVisibilityChange}
                displayMode='iconWhenUnselected'
                className='border-none bg-transparent shadow-none'
              />
            </PermissionAware>
            <div className='bg-muted-foreground/20 h-4 w-px' />
            <PermissionAware
              orgSlug={params.orgSlug}
              permission={PERMISSIONS.PROJECT_EDIT}
              scope={permissionScope}
              fallbackMessage="You don't have permission to change project status"
            >
              <StatusSelector
                statuses={statuses || []}
                selectedStatus={project.statusId || ''}
                onStatusSelect={handleStatusChange}
                className='border-none bg-transparent shadow-none'
              />
            </PermissionAware>

            <div className='bg-muted-foreground/20 h-4 w-px' />

            {/* Lead */}
            <PermissionAware
              orgSlug={params.orgSlug}
              permission={PERMISSIONS.PROJECT_EDIT}
              scope={permissionScope}
              fallbackMessage="You don't have permission to change project lead"
            >
              <ProjectLeadSelector
                orgSlug={params.orgSlug}
                projectKey={params.projectKey}
                selectedLead={project.leadId || ''}
                onLeadSelect={handleLeadChange}
                className='border-none bg-transparent shadow-none'
              />
            </PermissionAware>
          </div>
        </div>

        {/* Main Content */}
        <div className='mx-auto max-w-5xl px-3 py-3 sm:px-4 sm:py-4'>
          {/* Project Header */}
          <div className='mb-2 max-w-4xl space-y-2'>
            <div className='text-muted-foreground flex items-center gap-2 text-xs'>
              <span className='font-mono'>{params.projectKey}</span>
              <span>•</span>
              <span>
                Updated {formatDateHuman(new Date(project._creationTime))}
              </span>
            </div>

            {/* Title */}
            {editingTitle ? (
              <div className='flex items-center gap-2'>
                {/* Icon that stays visible during editing */}
                {canEdit ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className='flex items-center gap-0 transition-opacity hover:opacity-80'>
                        {iconValue ? (
                          (() => {
                            const IconComp = getDynamicIcon(iconValue);
                            if (!IconComp)
                              return (
                                <FolderOpen className='text-muted-foreground size-6' />
                              );
                            return (
                              <IconComp
                                className='size-6'
                                style={{ color: colorValue || undefined }}
                              />
                            );
                          })()
                        ) : (
                          <div className='border-muted-foreground/50 flex size-6 items-center justify-center rounded border-2 border-dashed'>
                            <Plus className='text-muted-foreground size-3' />
                          </div>
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className='w-80' align='start'>
                      <div className='space-y-4'>
                        <div>
                          <h4 className='mb-2 text-sm font-medium'>
                            Project Icon
                          </h4>
                          <IconPicker
                            value={iconValue}
                            onValueChange={handleIconChange}
                            placeholder='Select project icon'
                            className='h-8 w-full'
                          />
                        </div>
                        <div>
                          <h4 className='mb-2 text-sm font-medium'>
                            Project Color
                          </h4>
                          <div className='flex flex-wrap gap-2'>
                            {DEFAULT_COLORS.map(colorOption => (
                              <button
                                key={colorOption}
                                type='button'
                                className={`size-8 rounded-md border-2 transition-all ${
                                  colorValue === colorOption
                                    ? 'border-foreground scale-110'
                                    : 'border-border hover:scale-105'
                                }`}
                                style={{ backgroundColor: colorOption }}
                                onClick={() => handleColorChange(colorOption)}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : (
                  iconValue &&
                  (() => {
                    const IconComp = getDynamicIcon(iconValue);
                    if (!IconComp) return null;
                    return (
                      <IconComp
                        className='size-6'
                        style={{ color: colorValue || undefined }}
                      />
                    );
                  })()
                )}
                <Input
                  value={titleValue}
                  onChange={e => setTitleValue(e.target.value)}
                  className='h-auto border-none p-0 !text-3xl !leading-tight font-semibold shadow-none focus-visible:ring-0'
                  style={{ fontFamily: 'var(--font-title)' }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleTitleSave();
                    if (e.key === 'Escape') {
                      setTitleValue(displayTitle);
                      setEditingTitle(false);
                    }
                  }}
                  autoFocus
                />
                <div className='flex items-center gap-1'>
                  <Button size='sm' onClick={handleTitleSave}>
                    <Save className='size-4' />
                  </Button>
                  <Button
                    size='sm'
                    variant='ghost'
                    onClick={() => {
                      setTitleValue(displayTitle);
                      setEditingTitle(false);
                    }}
                  >
                    <X className='size-4' />
                  </Button>
                </div>
              </div>
            ) : (
              <h1 className='flex items-center gap-2 text-3xl leading-tight font-semibold'>
                {/* Clickable Icon with Color */}
                {canEdit ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className='flex items-center gap-0 transition-opacity hover:opacity-80'>
                        {iconValue ? (
                          (() => {
                            const IconComp = getDynamicIcon(iconValue);
                            if (!IconComp)
                              return (
                                <FolderOpen className='text-muted-foreground size-6' />
                              );
                            return (
                              <IconComp
                                className='size-6'
                                style={{ color: colorValue || undefined }}
                              />
                            );
                          })()
                        ) : (
                          <div className='border-muted-foreground/50 flex size-6 items-center justify-center rounded border-2 border-dashed'>
                            <Plus className='text-muted-foreground size-3' />
                          </div>
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className='w-80' align='start'>
                      <div className='space-y-4'>
                        <div>
                          <h4 className='mb-2 text-sm font-medium'>
                            Project Icon
                          </h4>
                          <IconPicker
                            value={iconValue}
                            onValueChange={handleIconChange}
                            placeholder='Select project icon'
                            className='h-8 w-full'
                          />
                        </div>
                        <div>
                          <h4 className='mb-2 text-sm font-medium'>
                            Project Color
                          </h4>
                          <div className='flex flex-wrap gap-2'>
                            {DEFAULT_COLORS.map(colorOption => (
                              <button
                                key={colorOption}
                                type='button'
                                className={`size-8 rounded-md border-2 transition-all ${
                                  colorValue === colorOption
                                    ? 'border-foreground scale-110'
                                    : 'border-border hover:scale-105'
                                }`}
                                style={{ backgroundColor: colorOption }}
                                onClick={() => handleColorChange(colorOption)}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : (
                  iconValue &&
                  (() => {
                    const IconComp = getDynamicIcon(iconValue);
                    if (!IconComp) return null;
                    return (
                      <IconComp
                        className='size-6'
                        style={{ color: colorValue || undefined }}
                      />
                    );
                  })()
                )}
                <span
                  className={cn(
                    'transition-colors',
                    canEdit && 'hover:text-muted-foreground cursor-pointer',
                  )}
                  onClick={() => {
                    if (!canEdit) return;
                    setTitleValue(displayTitle);
                    setEditingTitle(true);
                  }}
                >
                  {displayTitle}
                </span>
              </h1>
            )}
          </div>

          {/* Description */}
          <div className='mb-4'>
            {editingDescription ? (
              <div className='space-y-4'>
                <RichEditor
                  value={descriptionValue}
                  onChange={setDescriptionValue}
                  placeholder='Add a description...'
                  mode='compact'
                />
                <div className='flex items-center gap-3'>
                  <Button onClick={handleDescriptionSave}>
                    <Save className='mr-2 size-4' />
                    Save
                  </Button>
                  <Button
                    variant='outline'
                    onClick={() => {
                      setDescriptionValue(displayDescription);
                      setEditingDescription(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                {displayDescription ? (
                  <div
                    className={cn(
                      'prose prose-sm text-muted-foreground max-w-none transition-colors',
                      canEdit && 'hover:text-foreground cursor-pointer',
                    )}
                    onClick={() => {
                      if (!canEdit) return;
                      setDescriptionValue(displayDescription);
                      setEditingDescription(true);
                    }}
                  >
                    <RichEditor
                      value={displayDescription}
                      onChange={() => {}}
                      mode='compact'
                      disabled={true}
                    />
                  </div>
                ) : canEdit ? (
                  <button
                    className='text-muted-foreground hover:text-foreground border-muted-foreground/20 hover:border-muted-foreground/40 w-full rounded-lg border-2 border-dashed bg-transparent p-4 text-left text-base'
                    onClick={() => {
                      setDescriptionValue(displayDescription);
                      setEditingDescription(true);
                    }}
                  >
                    Add a description...
                  </button>
                ) : (
                  <p className='text-muted-foreground text-sm'>
                    No description provided.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Properties Bar */}
          <div className='mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm'>
            {/* Status */}
            <div className='flex min-w-[120px] items-center gap-1'>
              <span className='text-muted-foreground'>
                <PermissionAware
                  orgSlug={params.orgSlug}
                  permission={PERMISSIONS.PROJECT_EDIT}
                  scope={permissionScope}
                  fallbackMessage="You don't have permission to change status"
                >
                  <StatusSelector
                    statuses={statuses || []}
                    selectedStatus={project.statusId || ''}
                    onStatusSelect={handleStatusChange}
                    className='h-5 w-5 border-none bg-transparent p-0 shadow-none'
                    displayMode='iconOnly'
                  />
                </PermissionAware>
              </span>
              <span className='text-muted-foreground text-xs'>Status</span>
              <span className='ml-1 font-medium'>
                {statuses?.find(s => s._id === project.statusId)?.name || '—'}
              </span>
            </div>
            {/* Lead */}
            <div className='flex min-w-[120px] items-center gap-1'>
              <span className='text-muted-foreground'>
                <PermissionAware
                  orgSlug={params.orgSlug}
                  permission={PERMISSIONS.PROJECT_EDIT}
                  scope={permissionScope}
                  fallbackMessage="You don't have permission to change lead"
                >
                  <ProjectLeadSelector
                    orgSlug={params.orgSlug}
                    projectKey={params.projectKey}
                    selectedLead={project.leadId || ''}
                    onLeadSelect={handleLeadChange}
                    className='h-5 w-5 border-none bg-transparent p-0 shadow-none'
                    displayMode='iconOnly'
                  />
                </PermissionAware>
              </span>
              <span className='text-muted-foreground text-xs'>Lead</span>
              <span className='ml-1 font-medium'>
                {project.lead?.name || '—'}
              </span>
            </div>
            {/* Team */}
            <div className='flex min-w-[120px] items-center gap-1'>
              <span className='text-muted-foreground'>
                <UsersIcon className='size-4' />
              </span>
              <span className='text-muted-foreground text-xs'>Team</span>
              <span className='ml-1 font-medium'>
                {teams?.find(t => t._id === project.teamId)?.name || '—'}
              </span>
            </div>
            {/* Dates */}
            <div className='flex min-w-[180px] items-center gap-1'>
              <span className='text-muted-foreground'>
                <CalendarIcon className='size-4' />
              </span>
              <span className='text-muted-foreground text-xs'>Dates</span>
              <span className='ml-1'>
                {project.startDate
                  ? formatDateHuman(new Date(project.startDate))
                  : '—'}
                {project.dueDate
                  ? ` → ${formatDateHuman(new Date(project.dueDate))}`
                  : ''}
              </span>
            </div>
            {/* Created/Updated */}
            <div className='flex min-w-[160px] items-center gap-1'>
              <span className='text-muted-foreground'>
                <ClockIcon className='size-4' />
              </span>
              <span className='text-muted-foreground text-xs'>Created</span>
              <span className='ml-1'>
                {formatDateHuman(new Date(project._creationTime))}
              </span>
            </div>
          </div>

          {/* Issues Board */}
          <div className='mb-6'>
            <div className='mb-2 flex items-center justify-between'>
              <h2 className='text-sm font-semibold'>Issues</h2>
              <div className='flex items-center gap-2'>
                <div className='border-border flex items-center rounded-md border'>
                  <Button
                    variant={issueViewMode === 'kanban' ? 'secondary' : 'ghost'}
                    size='sm'
                    className='h-6 rounded-r-none px-2'
                    onClick={() => setIssueViewMode('kanban')}
                  >
                    <Columns3 className='size-3.5' />
                  </Button>
                  <Button
                    variant={issueViewMode === 'table' ? 'secondary' : 'ghost'}
                    size='sm'
                    className='h-6 rounded-l-none px-2'
                    onClick={() => setIssueViewMode('table')}
                  >
                    <LayoutList className='size-3.5' />
                  </Button>
                </div>
                {project && (
                  <CreateIssueDialog
                    orgSlug={params.orgSlug}
                    defaultStates={{ projectId: project._id }}
                    className='h-6 text-xs'
                  />
                )}
              </div>
            </div>
            {projectIssues.length === 0 ? (
              <div className='text-muted-foreground rounded-lg border border-dashed px-3 py-8 text-center text-sm'>
                No issues yet. Create one to get started.
              </div>
            ) : issueViewMode === 'kanban' ? (
              <div className='-mx-3 overflow-hidden rounded-lg border sm:-mx-4'>
                <IssuesKanban
                  orgSlug={params.orgSlug}
                  issues={projectIssues}
                  states={issueStates ?? []}
                  priorities={issuePriorities ?? []}
                  currentUserId={user?._id || ''}
                  onStateChange={(_issueId, assignmentId, stateId) => {
                    void changeAssignmentStateMutation({
                      assignmentId: assignmentId as Id<'issueAssignees'>,
                      stateId: stateId as Id<'issueStates'>,
                    });
                  }}
                  onPriorityChange={(issueId, priorityId) => {
                    void changePriorityMutation({
                      issueId: issueId as Id<'issues'>,
                      priorityId: priorityId as Id<'issuePriorities'>,
                    });
                  }}
                  onAssigneesChange={(issueId, assigneeIds) => {
                    void updateAssigneesMutation({
                      issueId: issueId as Id<'issues'>,
                      assigneeIds: assigneeIds as Id<'users'>[],
                    });
                  }}
                />
              </div>
            ) : (
              <div className='overflow-hidden rounded-lg border'>
                <IssuesTable
                  orgSlug={params.orgSlug}
                  issues={projectIssues}
                  states={issueStates ?? []}
                  priorities={issuePriorities ?? []}
                  teams={teams ?? []}
                  projects={[]}
                  onPriorityChange={() => {}}
                  onAssigneesChange={() => {}}
                  onTeamChange={() => {}}
                  onProjectChange={() => {}}
                  onDelete={() => {}}
                  onAssignmentStateChange={() => {}}
                  currentUserId={user?._id || ''}
                  activeFilter='all'
                />
              </div>
            )}
          </div>

          {/* Project Details */}
          <div className='space-y-6'>
            <div>
              <h2 className='mb-2 text-sm font-semibold'>Activity</h2>
              {projectId ? (
                <ProjectActivityFeed
                  orgSlug={params.orgSlug}
                  projectId={projectId}
                />
              ) : null}
            </div>

            {/* Members */}
            <div>
              <ProjectMembersSection
                orgSlug={params.orgSlug}
                projectKey={params.projectKey}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
