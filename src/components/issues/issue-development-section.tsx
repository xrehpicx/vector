'use client';

import { api, useCachedQuery, useMutation, useAction } from '@/lib/convex';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bug,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  Link2,
  RefreshCw,
  ShieldOff,
  Unlink2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { BarsSpinner } from '@/components/bars-spinner';
import { usePermissionCheck } from '@/components/ui/permission-aware';
import { PERMISSIONS } from '@/convex/_shared/permissions';
import { toast } from 'sonner';
import { getGitHubLinkErrorMessage } from '@/lib/error-handling';
import type { FunctionReturnType } from 'convex/server';
import type { Id } from '@/convex/_generated/dataModel';

const STALE_AFTER_MS = 5 * 60 * 1000;

type DevelopmentData = FunctionReturnType<
  typeof api.github.queries.getIssueDevelopment
>;
type PullRequestItem = DevelopmentData['pullRequests'][number];
type PullRequestFallbackItem = DevelopmentData['pullRequestFallbacks'][number];
type GitHubIssueItem = DevelopmentData['githubIssues'][number];
type CommitItem = DevelopmentData['commits'][number];

function isStale(lastSyncedAt?: number | null) {
  if (!lastSyncedAt) return true;
  return Date.now() - lastSyncedAt > STALE_AFTER_MS;
}

const STATE_COLORS: Record<string, string> = {
  merged: 'text-purple-600 dark:text-purple-400',
  closed: 'text-red-500 dark:text-red-400',
  draft: 'text-muted-foreground',
  open: 'text-green-600 dark:text-green-400',
};

function RowActions({
  href,
  canEdit,
  busy,
  onPrimaryAction,
  primaryLabel,
}: {
  href: string;
  canEdit: boolean;
  busy: boolean;
  onPrimaryAction?: () => void;
  primaryLabel?: string;
}) {
  return (
    <div className='flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100'>
      <Link
        href={href}
        target='_blank'
        rel='noreferrer'
        className='hover:bg-muted inline-flex size-6 items-center justify-center rounded-[min(var(--radius-md),10px)] transition-colors'
      >
        <ExternalLink className='size-3.5' />
      </Link>
      {onPrimaryAction && primaryLabel ? (
        <Button
          variant='ghost'
          size='xs'
          className='h-6 gap-1 px-1.5'
          disabled={!canEdit || busy}
          onClick={onPrimaryAction}
        >
          {busy ? (
            <BarsSpinner size={10} />
          ) : primaryLabel === 'Suppress' ? (
            <ShieldOff className='size-3' />
          ) : (
            <Unlink2 className='size-3' />
          )}
          {primaryLabel}
        </Button>
      ) : null}
    </div>
  );
}

function PullRequestRow({
  item,
  canEdit,
  busy,
  onUnlink,
}: {
  item: PullRequestItem;
  canEdit: boolean;
  busy: boolean;
  onUnlink: (linkId: Id<'githubArtifactLinks'>, suppress: boolean) => void;
}) {
  const stateColor = STATE_COLORS[item.state] ?? STATE_COLORS.open;
  return (
    <div className='group/row hover:bg-muted/50 flex items-center gap-3 rounded-md px-3 py-2 transition-colors'>
      <GitPullRequest className={`size-4 shrink-0 ${stateColor}`} />
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <Link
            href={item.url}
            target='_blank'
            rel='noreferrer'
            className='hover:text-foreground truncate text-sm font-medium transition-colors'
          >
            {item.title}
          </Link>
          <span className='text-muted-foreground text-xs capitalize'>
            {item.state}
          </span>
          <span className='text-muted-foreground font-mono text-xs'>
            #{item.number}
          </span>
        </div>
        <div className='text-muted-foreground flex items-center gap-2 text-xs'>
          <span className='font-mono'>
            {item.repository?.fullName ?? 'Unknown'}
          </span>
          {item.headRefName ? (
            <>
              <GitBranch className='size-3 shrink-0' />
              <span className='truncate font-mono'>{item.headRefName}</span>
            </>
          ) : null}
        </div>
      </div>
      <RowActions
        href={item.url}
        canEdit={canEdit}
        busy={busy}
        onPrimaryAction={
          item.linkId
            ? () =>
                onUnlink(
                  item.linkId as Id<'githubArtifactLinks'>,
                  item.source === 'auto',
                )
            : undefined
        }
        primaryLabel={item.source === 'auto' ? 'Suppress' : 'Unlink'}
      />
    </div>
  );
}

function PullRequestFallbackRow({
  item,
  canEdit,
  busy,
  onUnlink,
}: {
  item: PullRequestFallbackItem;
  canEdit: boolean;
  busy: boolean;
  onUnlink: (linkId: Id<'githubArtifactLinks'>, suppress: boolean) => void;
}) {
  return (
    <div className='group/row hover:bg-muted/50 flex items-center gap-3 rounded-md px-3 py-2 transition-colors'>
      <GitPullRequest className='text-muted-foreground size-4 shrink-0' />
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <Link
            href={item.url}
            target='_blank'
            rel='noreferrer'
            className='hover:text-foreground truncate text-sm font-medium transition-colors'
          >
            {item.title}
          </Link>
          <span className='text-muted-foreground text-xs'>Linked</span>
          <span className='text-muted-foreground font-mono text-xs'>
            #{item.number}
          </span>
        </div>
        <div className='text-muted-foreground text-xs'>
          <span className='font-mono'>
            {item.repository?.fullName ?? 'Unknown'}
          </span>
        </div>
      </div>
      <RowActions
        href={item.url}
        canEdit={canEdit}
        busy={busy}
        onPrimaryAction={() =>
          onUnlink(
            item.linkId as Id<'githubArtifactLinks'>,
            item.source === 'auto',
          )
        }
        primaryLabel={item.source === 'auto' ? 'Suppress' : 'Unlink'}
      />
    </div>
  );
}

function GitHubIssueRow({
  item,
  canEdit,
  busy,
  onUnlink,
}: {
  item: GitHubIssueItem;
  canEdit: boolean;
  busy: boolean;
  onUnlink: (linkId: Id<'githubArtifactLinks'>, suppress: boolean) => void;
}) {
  const stateColor =
    item.state === 'closed' ? STATE_COLORS.closed : STATE_COLORS.open;
  return (
    <div className='group/row hover:bg-muted/50 flex items-center gap-3 rounded-md px-3 py-2 transition-colors'>
      <Bug className={`size-4 shrink-0 ${stateColor}`} />
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <Link
            href={item.url}
            target='_blank'
            rel='noreferrer'
            className='hover:text-foreground truncate text-sm font-medium transition-colors'
          >
            {item.title}
          </Link>
          <span className='text-muted-foreground text-xs capitalize'>
            {item.state}
          </span>
          <span className='text-muted-foreground font-mono text-xs'>
            #{item.number}
          </span>
        </div>
        <div className='text-muted-foreground text-xs'>
          <span className='font-mono'>
            {item.repository?.fullName ?? 'Unknown'}
          </span>
        </div>
      </div>
      <RowActions
        href={item.url}
        canEdit={canEdit}
        busy={busy}
        onPrimaryAction={
          item.linkId
            ? () =>
                onUnlink(
                  item.linkId as Id<'githubArtifactLinks'>,
                  item.source === 'auto',
                )
            : undefined
        }
        primaryLabel={item.source === 'auto' ? 'Suppress' : 'Unlink'}
      />
    </div>
  );
}

function CommitRow({
  item,
  canEdit,
  busy,
  onUnlink,
}: {
  item: CommitItem;
  canEdit: boolean;
  busy: boolean;
  onUnlink: (linkId: Id<'githubArtifactLinks'>, suppress: boolean) => void;
}) {
  return (
    <div className='group/row hover:bg-muted/50 flex items-center gap-3 rounded-md px-3 py-2 transition-colors'>
      <GitCommitHorizontal className='text-muted-foreground size-4 shrink-0' />
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <Link
            href={item.url}
            target='_blank'
            rel='noreferrer'
            className='hover:text-foreground truncate text-sm font-medium transition-colors'
          >
            {item.messageHeadline}
          </Link>
          <span className='text-muted-foreground font-mono text-xs'>
            {item.shortSha}
          </span>
        </div>
        <div className='text-muted-foreground text-xs'>
          <span className='font-mono'>
            {item.repository?.fullName ?? 'Unknown'}
          </span>
        </div>
      </div>
      <RowActions
        href={item.url}
        canEdit={canEdit}
        busy={busy}
        onPrimaryAction={
          item.linkId
            ? () =>
                onUnlink(
                  item.linkId as Id<'githubArtifactLinks'>,
                  item.source === 'auto',
                )
            : undefined
        }
        primaryLabel={item.source === 'auto' ? 'Suppress' : 'Unlink'}
      />
    </div>
  );
}

function LinkArtifactInput({
  url,
  setUrl,
  isLinking,
  onLink,
}: {
  url: string;
  setUrl: (v: string) => void;
  isLinking: boolean;
  onLink: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant='ghost' size='xs' className='h-6 gap-1 px-2'>
          <Link2 className='size-3.5' />
          Link
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-80 p-2'>
        <div className='flex gap-2'>
          <Input
            value={url}
            onChange={event => setUrl(event.target.value)}
            placeholder='Paste a GitHub URL'
            className='h-8'
            disabled={isLinking}
            autoFocus
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onLink();
                setOpen(false);
              }
            }}
          />
          <Button
            size='sm'
            variant='outline'
            className='h-8 shrink-0'
            disabled={isLinking || !url.trim()}
            onClick={() => {
              onLink();
              setOpen(false);
            }}
          >
            {isLinking ? <BarsSpinner size={10} /> : null}
            Link
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DevelopmentSkeleton() {
  return (
    <div className='space-y-2'>
      <Skeleton className='h-9 w-full rounded-lg' />
      <Skeleton className='h-16 w-full rounded-lg' />
      <Skeleton className='h-16 w-full rounded-lg' />
    </div>
  );
}

export function IssueDevelopmentSection({
  orgSlug,
  issueId,
  issueKey,
}: {
  orgSlug: string;
  issueId: Id<'issues'>;
  issueKey: string;
}) {
  const development = useCachedQuery(api.github.queries.getIssueDevelopment, {
    issueId,
  });
  const githubCapabilities = useCachedQuery(
    api.github.queries.getGitHubCapabilities,
    {
      orgSlug,
    },
  );
  const refreshDevelopment = useAction(
    api.github.actions.refreshIssueDevelopment,
  );
  const linkArtifactByUrl = useAction(api.github.actions.linkArtifactByUrl);
  const unlinkArtifact = useMutation(api.github.mutations.unlinkArtifact);
  const { isAllowed: canEdit } = usePermissionCheck(
    orgSlug,
    PERMISSIONS.ISSUE_EDIT,
  );

  const [url, setUrl] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyLinkId, setBusyLinkId] = useState<string | null>(null);
  const autoRefreshRef = useRef<string | null>(null);
  const hasApiAccess = Boolean(githubCapabilities?.hasApiAccess);
  const hasGitHubIntegration = Boolean(
    githubCapabilities?.hasWebhookIngestion || githubCapabilities?.hasApiAccess,
  );

  const hasArtifacts = useMemo(() => {
    if (!development) return false;
    return (
      development.pullRequests.length > 0 ||
      development.pullRequestFallbacks.length > 0 ||
      development.githubIssues.length > 0 ||
      development.commits.length > 0 ||
      development.childCommitRollup.length > 0
    );
  }, [development]);

  const hasStaleArtifacts = useMemo(() => {
    if (!development) return false;
    return [
      ...development.pullRequests.map(item => item.lastSyncedAt),
      ...development.githubIssues.map(item => item.lastSyncedAt),
      ...development.commits.map(item => item.lastSyncedAt),
    ].some(value => isStale(value));
  }, [development]);

  useEffect(() => {
    if (
      !hasApiAccess ||
      !development ||
      !hasArtifacts ||
      !hasStaleArtifacts ||
      isRefreshing
    ) {
      return;
    }
    if (autoRefreshRef.current === String(issueId)) {
      return;
    }

    autoRefreshRef.current = String(issueId);
    setIsRefreshing(true);
    void refreshDevelopment({ issueId })
      .catch(error => {
        console.error(error);
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  }, [
    development,
    hasArtifacts,
    hasApiAccess,
    hasStaleArtifacts,
    isRefreshing,
    issueId,
    refreshDevelopment,
  ]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshDevelopment({ issueId });
    } catch (error) {
      console.error(error);
      toast.error('Failed to refresh GitHub development data');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLink = async () => {
    const nextUrl = url.trim();
    if (!nextUrl || !canEdit) return;

    setIsLinking(true);
    try {
      await linkArtifactByUrl({
        orgSlug,
        issueKey,
        url: nextUrl,
      });
      setUrl('');
    } catch (error) {
      toast.error(getGitHubLinkErrorMessage(error));
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlink = async (
    linkId: Id<'githubArtifactLinks'>,
    suppress: boolean,
  ) => {
    setBusyLinkId(String(linkId));
    try {
      await unlinkArtifact({ linkId, suppress });
    } catch (error) {
      console.error(error);
      toast.error(
        suppress
          ? 'Failed to suppress GitHub auto-link'
          : 'Failed to unlink GitHub artifact',
      );
    } finally {
      setBusyLinkId(null);
    }
  };

  if (development !== undefined && !hasArtifacts) {
    return null;
  }

  return (
    <div>
      <div className='mb-3 flex items-center justify-between gap-3'>
        <h2 className='text-sm font-semibold'>Development</h2>
        <div className='flex items-center gap-1'>
          {canEdit && hasGitHubIntegration ? (
            <LinkArtifactInput
              url={url}
              setUrl={setUrl}
              isLinking={isLinking}
              onLink={() => void handleLink()}
            />
          ) : null}
          {hasApiAccess ? (
            <Button
              variant='ghost'
              size='xs'
              className='h-6 gap-1 px-2'
              disabled={!canEdit || isRefreshing}
              onClick={() => void handleRefresh()}
            >
              {isRefreshing ? (
                <BarsSpinner size={10} />
              ) : (
                <RefreshCw className='size-3.5' />
              )}
              Refresh
            </Button>
          ) : null}
        </div>
      </div>

      {development === undefined ? (
        <DevelopmentSkeleton />
      ) : (
        <div className='space-y-1'>
          {development.pullRequests.length > 0 ? (
            <div>
              {development.pullRequests.map(item => (
                <PullRequestRow
                  key={item._id}
                  item={item}
                  canEdit={canEdit}
                  busy={busyLinkId === String(item.linkId)}
                  onUnlink={handleUnlink}
                />
              ))}
            </div>
          ) : null}

          {development.pullRequestFallbacks.length > 0 ? (
            <div>
              {development.pullRequestFallbacks.map(item => (
                <PullRequestFallbackRow
                  key={String(item.linkId)}
                  item={item}
                  canEdit={canEdit}
                  busy={busyLinkId === String(item.linkId)}
                  onUnlink={handleUnlink}
                />
              ))}
            </div>
          ) : null}

          {development.githubIssues.length > 0 ? (
            <div>
              {development.githubIssues.map(item => (
                <GitHubIssueRow
                  key={item._id}
                  item={item}
                  canEdit={canEdit}
                  busy={busyLinkId === String(item.linkId)}
                  onUnlink={handleUnlink}
                />
              ))}
            </div>
          ) : null}

          {development.commits.length > 0 ? (
            <div>
              {development.commits.map(item => (
                <CommitRow
                  key={item._id}
                  item={item}
                  canEdit={canEdit}
                  busy={busyLinkId === String(item.linkId)}
                  onUnlink={handleUnlink}
                />
              ))}
            </div>
          ) : null}

          {development.childCommitRollup.length > 0 ? (
            <div>
              <div className='text-muted-foreground mb-1 px-3 text-xs font-medium'>
                From child issues
              </div>
              {development.childCommitRollup.map(item => (
                <div
                  key={item.sha}
                  className='group/row hover:bg-muted/50 flex items-center gap-3 rounded-md px-3 py-2 transition-colors'
                >
                  <GitCommitHorizontal className='text-muted-foreground size-4 shrink-0' />
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-2'>
                      <Link
                        href={`/${orgSlug}/issues/${item.issueKey}`}
                        className='hover:text-foreground text-sm font-medium transition-colors'
                      >
                        {item.issueKey}
                      </Link>
                      <span className='text-muted-foreground truncate text-xs'>
                        {item.messageHeadline}
                      </span>
                      <span className='text-muted-foreground font-mono text-xs'>
                        {item.shortSha}
                      </span>
                    </div>
                    <div className='text-muted-foreground text-xs'>
                      <span className='font-mono'>{item.repository}</span>
                    </div>
                  </div>
                  <Link
                    href={item.url}
                    target='_blank'
                    rel='noreferrer'
                    className='hover:bg-muted inline-flex size-6 shrink-0 items-center justify-center rounded-[min(var(--radius-md),10px)] opacity-0 transition-all group-hover/row:opacity-100'
                  >
                    <ExternalLink className='size-3.5' />
                  </Link>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
