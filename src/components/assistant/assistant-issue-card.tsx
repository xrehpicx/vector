'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, useCachedQuery, useMutation } from '@/lib/convex';
import { DynamicIcon } from '@/lib/dynamic-icons';
import { Circle } from 'lucide-react';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import {
  PrioritySelector,
  StateSelector,
  MultiAssigneeSelector,
} from '@/components/issues/issue-selectors';
import {
  PermissionAware,
  usePermissionCheck,
} from '@/components/ui/permission-aware';
import { PERMISSIONS } from '@/convex/_shared/permissions';
import { useOptimisticValue } from '@/hooks/use-optimistic';

export function AssistantIssueCard({ issueKey }: { issueKey: string }) {
  const params = useParams();
  const orgSlug = params.orgSlug as string;

  const issue = useCachedQuery(api.issues.queries.getByKey, {
    orgSlug,
    issueKey,
  });
  const assignments = useCachedQuery(
    api.issues.queries.getAssignments,
    issue ? { issueId: issue._id } : 'skip',
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
  const user = useCachedQuery(api.users.currentUser);
  const { isAllowed: canAssignIssues } = usePermissionCheck(
    orgSlug,
    PERMISSIONS.ISSUE_ASSIGN,
  );

  const changePriority = useMutation(api.issues.mutations.changePriority);
  const changeWorkflowState = useMutation(
    api.issues.mutations.changeWorkflowState,
  );
  const updateAssignees = useMutation(api.issues.mutations.updateAssignees);
  const assigneeIds = (assignments ?? [])
    .map(a => a.assignee?._id)
    .filter((id): id is Id<'users'> => Boolean(id));
  const serverPriorityId =
    issue && issue !== null ? (issue.priorityId ?? '') : '';
  const serverStateId =
    issue && issue !== null ? (issue.workflowStateId ?? '') : '';
  const serverAssigneeIds = assigneeIds.map(String);
  const [displayPriorityId, setDisplayPriorityId] =
    useOptimisticValue(serverPriorityId);
  const [displayStateId, setDisplayStateId] = useOptimisticValue(serverStateId);
  const [displayAssigneeIdsKey, setDisplayAssigneeIdsKey] = useOptimisticValue(
    serverAssigneeIds.join(','),
  );
  const displayAssigneeIds = displayAssigneeIdsKey
    ? displayAssigneeIdsKey.split(',').filter(Boolean)
    : [];
  const displayPriority = priorities?.find(
    priority => priority._id === displayPriorityId,
  );
  const displayState = states?.find(state => state._id === displayStateId);

  if (issue === undefined) {
    return (
      <div className='bg-muted/30 flex max-w-full min-w-0 animate-pulse items-center gap-2.5 overflow-hidden rounded-lg border px-3 py-2'>
        <div className='bg-muted size-4 rounded' />
        <div className='bg-muted h-3 w-12 rounded' />
        <div className='bg-muted h-3 flex-1 rounded' />
      </div>
    );
  }

  if (issue === null) {
    return (
      <div className='bg-muted/20 text-muted-foreground flex max-w-full min-w-0 items-start gap-2.5 overflow-hidden rounded-lg border border-dashed px-3 py-2 text-xs'>
        <Circle className='mt-0.5 size-3.5 shrink-0' />
        <div className='min-w-0 flex-1'>
          <div className='font-mono text-[11px]'>{issueKey}</div>
          <div className='min-w-0 break-words'>Issue probably deleted</div>
        </div>
      </div>
    );
  }

  const priorityColor = issue.priority?.color ?? '#94a3b8';
  const priorityIcon = issue.priority?.icon;

  return (
    <div className='bg-background hover:bg-muted/30 grid max-w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2.5 overflow-hidden rounded-lg border px-3 py-2 transition-colors'>
      <div className='flex shrink-0 items-center gap-1'>
        <PermissionAware
          orgSlug={orgSlug}
          permission={PERMISSIONS.ISSUE_PRIORITY_UPDATE}
          fallbackMessage='No permission to change priority'
        >
          <PrioritySelector
            priorities={(priorities ?? []) as never[]}
            selectedPriority={displayPriorityId}
            onPrioritySelect={pid => {
              setDisplayPriorityId(pid);
              void changePriority({
                issueId: issue._id,
                priorityId: pid as Id<'issuePriorities'>,
              });
            }}
            displayMode='iconOnly'
            trigger={
              <Button
                variant='ghost'
                size='icon'
                className='size-6 shrink-0 rounded-md'
                aria-label='Change issue priority'
              >
                {(displayPriority?.icon ?? priorityIcon) ? (
                  <DynamicIcon
                    name={displayPriority?.icon ?? priorityIcon}
                    className='size-3.5'
                    style={{ color: displayPriority?.color ?? priorityColor }}
                  />
                ) : (
                  <Circle
                    className='size-3.5'
                    style={{ color: displayPriority?.color ?? priorityColor }}
                  />
                )}
              </Button>
            }
          />
        </PermissionAware>

        {states ? (
          <PermissionAware
            orgSlug={orgSlug}
            permission={PERMISSIONS.ISSUE_STATE_UPDATE}
            fallbackMessage='No permission to change issue state'
          >
            <StateSelector
              states={(states ?? []) as never[]}
              selectedState={displayStateId}
              onStateSelect={stateId => {
                setDisplayStateId(stateId);
                void changeWorkflowState({
                  issueId: issue._id,
                  stateId: stateId as Id<'issueStates'>,
                });
              }}
              displayMode='iconOnly'
              trigger={
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-6 shrink-0 rounded-md'
                  aria-label='Change issue state'
                >
                  <DynamicIcon
                    name={displayState?.icon ?? issue.workflowState?.icon}
                    className='size-3.5'
                    style={{
                      color:
                        displayState?.color ??
                        issue.workflowState?.color ??
                        '#94a3b8',
                    }}
                  />
                </Button>
              }
            />
          </PermissionAware>
        ) : null}
      </div>

      <div className='min-w-0'>
        <Link
          href={`/${orgSlug}/issues/${issue.key}`}
          className='hover:text-primary block min-w-0 truncate text-sm font-medium transition-colors'
        >
          {issue.title}
        </Link>
        <div className='text-muted-foreground/60 mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]'>
          <span className='text-muted-foreground shrink-0 font-mono text-[11px]'>
            {issue.key}
          </span>
          {issue.project ? (
            <span className='min-w-0 break-words'>{issue.project.name}</span>
          ) : null}
        </div>
      </div>

      <div className='shrink-0'>
        <PermissionAware
          orgSlug={orgSlug}
          permission={PERMISSIONS.ISSUE_ASSIGN}
          fallbackMessage='No permission to change assignees'
        >
          <MultiAssigneeSelector
            orgSlug={orgSlug}
            selectedAssigneeIds={displayAssigneeIds}
            onAssigneesChange={ids => {
              setDisplayAssigneeIdsKey(ids.join(','));
              void updateAssignees({
                issueId: issue._id,
                assigneeIds: ids as Id<'users'>[],
              });
            }}
            isLoading={false}
            assignments={(assignments ?? []).map(a => ({
              assignmentId: String(a._id),
              assigneeId: a.assignee?._id ? String(a.assignee._id) : null,
              assigneeName: a.assignee?.name ?? null,
              assigneeEmail: a.assignee?.email ?? null,
              assigneeImage: a.assignee?.image ?? null,
              stateId: a.state?._id ? String(a.state._id) : null,
              stateIcon: a.state?.icon ?? null,
              stateColor: a.state?.color ?? null,
              stateName: a.state?.name ?? null,
              stateType: a.state?.type ?? null,
            }))}
            activeFilter='all'
            currentUserId={user?._id ? String(user._id) : ''}
            canManageAll={canAssignIssues}
          />
        </PermissionAware>
      </div>
    </div>
  );
}
