'use client';

import { api, useCachedQuery } from '@/lib/convex';
import { Lock, Globe, Calendar } from 'lucide-react';
import { DynamicIcon } from '@/lib/dynamic-icons';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateHuman } from '@/lib/date';
import { UserAvatar } from '@/components/user-avatar';

interface PublicProjectPageProps {
  orgSlug: string;
  projectKey: string;
}

export function PublicProjectPage({
  orgSlug,
  projectKey,
}: PublicProjectPageProps) {
  const project = useCachedQuery(api.og.queries.getPublicProjectFull, {
    orgSlug,
    projectKey,
  });

  if (project === undefined) {
    return (
      <div className='mx-auto max-w-4xl space-y-4 p-6'>
        <Skeleton className='h-8 w-48' />
        <Skeleton className='h-4 w-64' />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className='h-12 w-full' />
        ))}
      </div>
    );
  }

  if (project === null) {
    return (
      <div className='flex min-h-[60vh] flex-col items-center justify-center gap-2'>
        <Lock className='text-muted-foreground size-10 opacity-30' />
        <p className='text-muted-foreground text-sm'>
          This project is not available or is private.
        </p>
      </div>
    );
  }

  return (
    <div className='mx-auto max-w-4xl p-6'>
      {/* Breadcrumb */}
      <div className='text-muted-foreground mb-4 flex items-center gap-1.5 text-xs'>
        <Globe className='size-3 text-emerald-500' />
        <span>{project.orgName}</span>
      </div>

      {/* Header */}
      <div className='mb-6 space-y-2'>
        <div className='flex items-center gap-2'>
          <h1 className='text-xl font-semibold'>{project.name}</h1>
          {project.status && (
            <span
              className='rounded px-2 py-0.5 text-xs font-medium'
              style={{
                color: project.status.color ?? undefined,
                backgroundColor: project.status.color
                  ? `${project.status.color}15`
                  : undefined,
              }}
            >
              {project.status.name}
            </span>
          )}
        </div>
        {project.description && (
          <p className='text-muted-foreground text-sm'>{project.description}</p>
        )}
      </div>

      {/* Meta */}
      <div className='mb-6 flex flex-wrap gap-4'>
        {project.team && (
          <div className='text-muted-foreground flex items-center gap-1.5 text-sm'>
            {project.team.icon && (
              <DynamicIcon
                name={project.team.icon}
                className='size-3.5'
                style={{ color: project.team.color ?? undefined }}
              />
            )}
            {project.team.name}
          </div>
        )}
        {project.lead && (
          <div className='flex items-center gap-1.5 text-sm'>
            <UserAvatar
              name={project.lead.name}
              image={project.lead.image}
              size='sm'
            />
            <span className='text-muted-foreground'>{project.lead.name}</span>
          </div>
        )}
        {(project.startDate || project.dueDate) && (
          <div className='text-muted-foreground flex items-center gap-1.5 text-sm'>
            <Calendar className='size-3.5' />
            {project.startDate && formatDateHuman(project.startDate)}
            {project.startDate && project.dueDate && ' → '}
            {project.dueDate && formatDateHuman(project.dueDate)}
          </div>
        )}
        <span className='text-muted-foreground text-sm'>
          {project.totalIssues} issue{project.totalIssues !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Issues */}
      {project.issues.length > 0 ? (
        <div className='space-y-2'>
          <h2 className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
            Issues
          </h2>
          <div className='divide-border divide-y rounded-lg border'>
            {project.issues.map(issue => (
              <IssueRow key={issue._id} issue={issue} orgSlug={orgSlug} />
            ))}
          </div>
        </div>
      ) : (
        <p className='text-muted-foreground py-8 text-center text-sm'>
          No issues in this project.
        </p>
      )}
    </div>
  );
}

function IssueRow({
  issue,
  orgSlug,
}: {
  issue: {
    _id: string;
    key: string;
    title: string;
    isPublic: boolean;
    status: {
      name: string;
      color: string | null;
      type: string;
      icon: string | null;
    } | null;
  };
  orgSlug: string;
}) {
  const content = (
    <div className='flex items-center gap-3 px-3 py-2.5'>
      {issue.status && (
        <div style={{ color: issue.status.color ?? undefined }}>
          {issue.status.icon ? (
            <DynamicIcon name={issue.status.icon} className='size-4' />
          ) : (
            <div
              className='size-2.5 rounded-full border-2'
              style={{ borderColor: issue.status.color ?? '#888' }}
            />
          )}
        </div>
      )}
      <span className='text-muted-foreground flex-shrink-0 text-xs font-medium'>
        {issue.key}
      </span>
      <span className='min-w-0 flex-1 truncate text-sm'>{issue.title}</span>
      {issue.status && (
        <span
          className='flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium'
          style={{
            color: issue.status.color ?? undefined,
            backgroundColor: issue.status.color
              ? `${issue.status.color}15`
              : undefined,
          }}
        >
          {issue.status.name}
        </span>
      )}
      {!issue.isPublic && (
        <Lock className='text-muted-foreground size-3 flex-shrink-0 opacity-50' />
      )}
    </div>
  );

  if (issue.isPublic) {
    return (
      <a
        href={`/${orgSlug}/issues/${issue.key}/public`}
        className='hover:bg-muted/50 block transition-colors'
      >
        {content}
      </a>
    );
  }

  return <div>{content}</div>;
}
