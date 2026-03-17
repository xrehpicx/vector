'use client';

import { useQuery } from 'convex/react';
import { api } from '@/lib/convex';
import { Lock, Globe, Calendar } from 'lucide-react';
import { DynamicIcon } from '@/lib/dynamic-icons';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateHuman } from '@/lib/date';
import { UserAvatar } from '@/components/user-avatar';

interface PublicIssuePageProps {
  orgSlug: string;
  issueKey: string;
}

export function PublicIssuePage({ orgSlug, issueKey }: PublicIssuePageProps) {
  const issue = useQuery(api.og.queries.getPublicIssueFull, {
    orgSlug,
    issueKey,
  });

  if (issue === undefined) {
    return (
      <div className='mx-auto max-w-3xl space-y-4 p-6'>
        <Skeleton className='h-8 w-48' />
        <Skeleton className='h-6 w-96' />
        <Skeleton className='h-32 w-full' />
      </div>
    );
  }

  if (issue === null) {
    return (
      <div className='flex min-h-[60vh] flex-col items-center justify-center gap-2'>
        <Lock className='text-muted-foreground size-10 opacity-30' />
        <p className='text-muted-foreground text-sm'>
          This issue is not available or is private.
        </p>
      </div>
    );
  }

  return (
    <div className='mx-auto max-w-3xl p-6'>
      {/* Breadcrumb */}
      <div className='text-muted-foreground mb-4 flex items-center gap-1.5 text-xs'>
        <Globe className='size-3 text-emerald-500' />
        <span>{issue.orgName}</span>
        {issue.project && (
          <>
            <span>/</span>
            <span>{issue.project.name}</span>
          </>
        )}
      </div>

      {/* Header */}
      <div className='mb-6 space-y-3'>
        <div className='flex items-center gap-2'>
          <span className='text-muted-foreground font-mono text-sm'>
            {issue.key}
          </span>
          {issue.state && (
            <span
              className='rounded px-2 py-0.5 text-xs font-medium'
              style={{
                color: issue.state.color ?? undefined,
                backgroundColor: issue.state.color
                  ? `${issue.state.color}15`
                  : undefined,
              }}
            >
              {issue.state.name}
            </span>
          )}
          {issue.priority && (
            <span
              className='flex items-center gap-1 text-xs'
              style={{ color: issue.priority.color ?? undefined }}
            >
              {issue.priority.icon && (
                <DynamicIcon name={issue.priority.icon} className='size-3.5' />
              )}
              {issue.priority.name}
            </span>
          )}
        </div>
        <h1 className='text-2xl font-semibold'>{issue.title}</h1>
      </div>

      {/* Meta */}
      <div className='mb-6 flex flex-wrap gap-4'>
        {issue.team && (
          <div className='text-muted-foreground flex items-center gap-1.5 text-sm'>
            {issue.team.icon && (
              <DynamicIcon
                name={issue.team.icon}
                className='size-3.5'
                style={{ color: issue.team.color ?? undefined }}
              />
            )}
            {issue.team.name}
          </div>
        )}
        {(issue.startDate || issue.dueDate) && (
          <div className='text-muted-foreground flex items-center gap-1.5 text-sm'>
            <Calendar className='size-3.5' />
            {issue.startDate && formatDateHuman(issue.startDate)}
            {issue.startDate && issue.dueDate && ' → '}
            {issue.dueDate && formatDateHuman(issue.dueDate)}
          </div>
        )}
        {issue.assignees.length > 0 && (
          <div className='flex items-center gap-1'>
            {issue.assignees.map((a, i) => (
              <UserAvatar key={i} name={a.name} image={a.image} size='sm' />
            ))}
          </div>
        )}
      </div>

      {/* Labels */}
      {issue.labels.length > 0 && (
        <div className='mb-6 flex flex-wrap gap-1.5'>
          {issue.labels.map((l, i) => (
            <span
              key={i}
              className='rounded-full px-2.5 py-0.5 text-xs font-medium'
              style={{
                color: l.color ?? undefined,
                backgroundColor: l.color ? `${l.color}15` : undefined,
                borderColor: l.color ? `${l.color}30` : undefined,
                borderWidth: 1,
              }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}

      {/* Description */}
      {issue.description && (
        <div className='prose prose-sm dark:prose-invert mb-8 max-w-none'>
          <p className='whitespace-pre-wrap'>{issue.description}</p>
        </div>
      )}

      {/* Sub-issues */}
      {issue.subIssues.length > 0 && (
        <div className='space-y-2'>
          <h2 className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
            Sub-issues
          </h2>
          <div className='divide-border divide-y rounded-md border'>
            {issue.subIssues.map(child => (
              <a
                key={child.key}
                href={`/${orgSlug}/issues/${child.key}/public`}
                className='hover:bg-muted/50 flex items-center gap-3 px-3 py-2 transition-colors'
              >
                {child.state && (
                  <div style={{ color: child.state.color ?? undefined }}>
                    {child.state.icon ? (
                      <DynamicIcon
                        name={child.state.icon}
                        className='size-3.5'
                      />
                    ) : (
                      <div
                        className='size-2.5 rounded-full border-2'
                        style={{
                          borderColor: child.state.color ?? '#888',
                        }}
                      />
                    )}
                  </div>
                )}
                <span className='text-muted-foreground text-xs font-medium'>
                  {child.key}
                </span>
                <span className='truncate text-sm'>{child.title}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
