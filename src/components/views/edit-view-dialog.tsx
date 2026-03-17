'use client';

import { useEffect, useState } from 'react';
import { api, useCachedQuery, useMutation } from '@/lib/convex';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import {
  VisibilitySelector,
  type VisibilityOption,
} from '@/components/ui/visibility-selector';
import {
  TeamSelector,
  ProjectSelector,
  StateSelector,
  PrioritySelector,
} from '@/components/issues/issue-selectors';
import { RichEditor } from '@/components/ui/rich-editor';
import { toast } from 'sonner';
import type { Id } from '@/convex/_generated/dataModel';

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
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Edit View</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <form onSubmit={handleSubmit} className='space-y-4 p-2'>
          <Input
            placeholder='View name'
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            maxLength={100}
          />

          {/* Rich text description */}
          <div className='space-y-1'>
            <div className='text-muted-foreground text-xs font-medium uppercase'>
              Description
            </div>
            <RichEditor
              value={description}
              onChange={setDescription}
              placeholder='Describe this view...'
              mode='compact'
              borderless
              className='notion-editor'
            />
          </div>

          <div className='space-y-2'>
            <div className='text-muted-foreground text-xs font-medium uppercase'>
              Visibility
            </div>
            <VisibilitySelector
              value={visibility}
              onValueChange={setVisibility}
            />
          </div>

          <div className='space-y-2'>
            <div className='text-muted-foreground text-xs font-medium uppercase'>
              Filters
            </div>
            <div className='flex flex-wrap gap-2'>
              <TeamSelector
                teams={teams ?? []}
                selectedTeam={selectedTeam}
                onTeamSelect={v => setSelectedTeam(v === selectedTeam ? '' : v)}
                displayMode='iconWhenUnselected'
              />
              <ProjectSelector
                projects={projects ?? []}
                selectedProject={selectedProject}
                onProjectSelect={v =>
                  setSelectedProject(v === selectedProject ? '' : v)
                }
                displayMode='iconWhenUnselected'
              />
              <PrioritySelector
                priorities={priorities ?? []}
                selectedPriority={selectedPriorities[0] ?? ''}
                selectedPriorities={selectedPriorities}
                onPrioritySelect={v =>
                  setSelectedPriorities(prev =>
                    prev.includes(v)
                      ? prev.filter(id => id !== v)
                      : [...prev, v],
                  )
                }
                displayMode='iconWhenUnselected'
              />
              <StateSelector
                states={states ?? []}
                selectedState={selectedStates[0] ?? ''}
                selectedStates={selectedStates}
                onStateSelect={v =>
                  setSelectedStates(prev =>
                    prev.includes(v)
                      ? prev.filter(id => id !== v)
                      : [...prev, v],
                  )
                }
                displayMode='iconWhenUnselected'
              />
            </div>
          </div>

          <div className='flex justify-end gap-2 pt-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type='submit'
              size='sm'
              disabled={!name.trim() || isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
