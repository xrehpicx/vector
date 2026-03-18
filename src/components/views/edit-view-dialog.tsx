'use client';

import { useEffect, useState } from 'react';
import { api, useCachedQuery, useMutation } from '@/lib/convex';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { type VisibilityOption } from '@/components/ui/visibility-selector';
import { toast } from 'sonner';
import type { Id } from '@/convex/_generated/dataModel';
import type { IssueGroupByField } from '@/lib/group-by';
import type { ViewMode } from '@/hooks/use-persisted-view-mode';
import { ViewDialogSettings } from './view-dialog-settings';

interface EditViewDialogProps {
  orgSlug: string;
  viewId: Id<'views'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditViewDialog({
  orgSlug,
  viewId,
  open,
  onOpenChange,
}: EditViewDialogProps) {
  const view = useCachedQuery(api.views.queries.getById, { viewId });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] =
    useState<VisibilityOption>('organization');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [groupBy, setGroupBy] = useState<IssueGroupByField>('none');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const teams = useCachedQuery(api.organizations.queries.listTeams, {
    orgSlug,
  });
  const projects = useCachedQuery(api.organizations.queries.listProjects, {
    orgSlug,
  });
  const states = useCachedQuery(api.organizations.queries.listIssueStates, {
    orgSlug,
  });
  const priorities = useCachedQuery(
    api.organizations.queries.listIssuePriorities,
    {
      orgSlug,
    },
  );

  const updateView = useMutation(api.views.mutations.updateView);

  // Sync form with view data when it loads or dialog opens
  useEffect(() => {
    if (view && open) {
      setName(view.name);
      setDescription(view.description ?? '');
      setVisibility(view.visibility as VisibilityOption);
      setSelectedTeam((view.filters.teamId as string) ?? '');
      setSelectedProject((view.filters.projectId as string) ?? '');
      setSelectedPriorities((view.filters.priorityIds ?? []) as string[]);
      setSelectedStates((view.filters.workflowStateIds ?? []) as string[]);
      setViewMode((view.layout?.viewMode as ViewMode) ?? 'table');
      setGroupBy((view.layout?.groupBy as IssueGroupByField) ?? 'none');
    }
  }, [view, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await updateView({
        viewId,
        name: name.trim(),
        description: description.trim() || undefined,
        filters: {
          teamId: selectedTeam ? (selectedTeam as Id<'teams'>) : undefined,
          projectId: selectedProject
            ? (selectedProject as Id<'projects'>)
            : undefined,
          priorityIds: selectedPriorities.length
            ? (selectedPriorities as Id<'issuePriorities'>[])
            : undefined,
          workflowStateIds: selectedStates.length
            ? (selectedStates as Id<'issueStates'>[])
            : undefined,
        },
        layout: {
          viewMode,
          groupBy,
        },
        visibility,
      });
      toast.success('View updated');
      onOpenChange(false);
    } catch {
      toast.error('Failed to update view');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        showCloseButton={false}
        className='gap-2 p-2 sm:max-w-2xl'
      >
        <ResponsiveDialogHeader className='sr-only'>
          <ResponsiveDialogTitle>Edit View</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        <form onSubmit={handleSubmit} className='space-y-2'>
          <ViewDialogSettings
            teams={teams ?? []}
            projects={projects ?? []}
            priorities={priorities ?? []}
            states={states ?? []}
            selectedTeam={selectedTeam}
            onSelectedTeamChange={setSelectedTeam}
            selectedProject={selectedProject}
            onSelectedProjectChange={setSelectedProject}
            selectedPriorities={selectedPriorities}
            onSelectedPrioritiesChange={setSelectedPriorities}
            selectedStates={selectedStates}
            onSelectedStatesChange={setSelectedStates}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            groupBy={groupBy}
            onGroupByChange={setGroupBy}
            visibility={visibility}
            onVisibilityChange={setVisibility}
          />

          {/* Name */}
          <div className='relative'>
            <Input
              placeholder='View name'
              value={name}
              onChange={e => setName(e.target.value)}
              className='pr-16 text-base'
              autoFocus
              maxLength={100}
            />
            <span className='text-muted-foreground bg-background pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded px-2 py-0.5 text-xs'>
              Name
            </span>
          </div>

          {/* Description */}
          <div className='relative'>
            <Textarea
              placeholder='Add description...'
              value={description}
              onChange={e => setDescription(e.target.value)}
              className='min-h-[80px] resize-none pr-20'
              maxLength={500}
            />
            <span className='text-muted-foreground bg-background pointer-events-none absolute right-2 bottom-2 rounded px-2 py-0.5 text-xs'>
              Description
            </span>
          </div>
        </form>

        <div className='flex w-full flex-row items-center justify-between gap-2'>
          <Button variant='ghost' size='sm' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size='sm'
            disabled={!name.trim() || isSubmitting}
            onClick={handleSubmit}
          >
            {isSubmitting ? 'Saving...' : 'Save changes'}
          </Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
