'use client';

import { Button } from '@/components/ui/button';
import {
  PrioritySelector,
  ProjectSelector,
  StateSelector,
  TeamSelector,
  type Priority,
  type Project,
  type State,
  type Team,
} from '@/components/issues/issue-selectors';
import { GroupBySelector } from '@/components/ui/group-by-selector';
import {
  VisibilitySelector,
  type VisibilityOption,
} from '@/components/ui/visibility-selector';
import type { IssueGroupByField } from '@/lib/group-by';
import type { ViewMode } from '@/hooks/use-persisted-view-mode';
import { Clock, Columns3, LayoutList } from 'lucide-react';
import { cn } from '@/lib/utils';

const GROUP_BY_OPTIONS: Array<{
  value: IssueGroupByField;
  label: string;
}> = [
  { value: 'none', label: 'No grouping' },
  { value: 'priority', label: 'Priority' },
  { value: 'status', label: 'Status' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'team', label: 'Team' },
  { value: 'project', label: 'Project' },
];

interface ViewDialogSettingsProps {
  teams: readonly Team[];
  projects: readonly Project[];
  priorities: readonly Priority[];
  states: readonly State[];
  selectedTeam: string;
  onSelectedTeamChange: (value: string) => void;
  selectedProject: string;
  onSelectedProjectChange: (value: string) => void;
  selectedPriorities: string[];
  onSelectedPrioritiesChange: (
    value: string[] | ((prev: string[]) => string[]),
  ) => void;
  selectedStates: string[];
  onSelectedStatesChange: (
    value: string[] | ((prev: string[]) => string[]),
  ) => void;
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
  groupBy: IssueGroupByField;
  onGroupByChange: (value: IssueGroupByField) => void;
  visibility: VisibilityOption;
  onVisibilityChange: (value: VisibilityOption) => void;
}

export function ViewDialogSettings({
  teams,
  projects,
  priorities,
  states,
  selectedTeam,
  onSelectedTeamChange,
  selectedProject,
  onSelectedProjectChange,
  selectedPriorities,
  onSelectedPrioritiesChange,
  selectedStates,
  onSelectedStatesChange,
  viewMode,
  onViewModeChange,
  groupBy,
  onGroupByChange,
  visibility,
  onVisibilityChange,
}: ViewDialogSettingsProps) {
  return (
    <div className='bg-muted/20 rounded-lg border p-2'>
      <div className='flex flex-col gap-1 border-b pb-2'>
        <div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'>
          <div className='min-w-0'>
            <p className='text-foreground text-sm font-medium'>View setup</p>
            <p className='text-muted-foreground text-xs'>
              Filters decide which issues appear here. Layout controls how this
              view opens.
            </p>
          </div>
          <VisibilitySelector
            value={visibility}
            onValueChange={onVisibilityChange}
            className='h-8 shrink-0'
          />
        </div>
      </div>

      <div className='mt-2 space-y-2'>
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
          <span className='text-muted-foreground w-14 shrink-0 text-xs'>
            Filters
          </span>
          <div className='flex flex-wrap gap-2'>
            <TeamSelector
              teams={teams}
              selectedTeam={selectedTeam}
              onTeamSelect={value =>
                onSelectedTeamChange(value === selectedTeam ? '' : value)
              }
              displayMode='iconWhenUnselected'
            />
            <ProjectSelector
              projects={projects}
              selectedProject={selectedProject}
              onProjectSelect={value =>
                onSelectedProjectChange(value === selectedProject ? '' : value)
              }
              displayMode='iconWhenUnselected'
            />
            <PrioritySelector
              priorities={priorities}
              selectedPriority={selectedPriorities[0] ?? ''}
              selectedPriorities={selectedPriorities}
              onPrioritySelect={value =>
                onSelectedPrioritiesChange(prev =>
                  prev.includes(value)
                    ? prev.filter(id => id !== value)
                    : [...prev, value],
                )
              }
              displayMode='iconWhenUnselected'
            />
            <StateSelector
              states={states}
              selectedState={selectedStates[0] ?? ''}
              selectedStates={selectedStates}
              onStateSelect={value =>
                onSelectedStatesChange(prev =>
                  prev.includes(value)
                    ? prev.filter(id => id !== value)
                    : [...prev, value],
                )
              }
              displayMode='iconWhenUnselected'
            />
          </div>
        </div>

        <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
          <span className='text-muted-foreground w-14 shrink-0 text-xs'>
            Layout
          </span>
          <div className='flex flex-wrap items-center gap-2'>
            <div className='border-border flex items-center rounded-md border'>
              <Button
                type='button'
                variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                size='sm'
                className={cn(
                  'h-8 gap-1.5 rounded-none rounded-l-md px-2.5 text-xs',
                  viewMode === 'table' && 'shadow-none',
                )}
                onClick={() => onViewModeChange('table')}
              >
                <LayoutList className='size-3.5' />
                Table
              </Button>
              <Button
                type='button'
                variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
                size='sm'
                className={cn(
                  'h-8 gap-1.5 rounded-none px-2.5 text-xs',
                  viewMode === 'kanban' && 'shadow-none',
                )}
                onClick={() => onViewModeChange('kanban')}
              >
                <Columns3 className='size-3.5' />
                Board
              </Button>
              <Button
                type='button'
                variant={viewMode === 'timeline' ? 'secondary' : 'ghost'}
                size='sm'
                className={cn(
                  'h-8 gap-1.5 rounded-none rounded-r-md px-2.5 text-xs',
                  viewMode === 'timeline' && 'shadow-none',
                )}
                onClick={() => onViewModeChange('timeline')}
              >
                <Clock className='size-3.5' />
                Timeline
              </Button>
            </div>

            <GroupBySelector<IssueGroupByField>
              options={GROUP_BY_OPTIONS}
              value={groupBy}
              onChange={onGroupByChange}
              className='h-8 text-xs'
            />
          </div>
        </div>
      </div>
    </div>
  );
}
