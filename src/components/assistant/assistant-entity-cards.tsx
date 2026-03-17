'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, useCachedQuery, useMutation } from '@/lib/convex';
import { DynamicIcon } from '@/lib/dynamic-icons';
import { Circle, FileText, FolderKanban, Users } from 'lucide-react';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { StatusSelector } from '@/components/projects/project-selectors';
import { PermissionAware } from '@/components/ui/permission-aware';
import { PERMISSIONS } from '@/convex/_shared/permissions';
import { useOptimisticValue } from '@/hooks/use-optimistic';

function CardSkeleton() {
  return (
    <div className='bg-muted/30 flex max-w-full min-w-0 animate-pulse items-center gap-2.5 overflow-hidden rounded-lg border px-3 py-2'>
      <div className='bg-muted size-4 rounded' />
      <div className='bg-muted h-3 w-12 rounded' />
      <div className='bg-muted h-3 flex-1 rounded' />
    </div>
  );
}

function EntityUnavailableCard({
  icon,
  label,
  message,
}: {
  icon: React.ReactNode;
  label: string;
  message: string;
}) {
  return (
    <div className='bg-muted/20 text-muted-foreground flex max-w-full min-w-0 items-start gap-2.5 overflow-hidden rounded-lg border border-dashed px-3 py-2 text-xs'>
      <div className='mt-0.5 shrink-0'>{icon}</div>
      <div className='min-w-0 flex-1'>
        <div className='font-mono text-[11px]'>{label}</div>
        <div className='min-w-0 break-words'>{message}</div>
      </div>
    </div>
  );
}

// ─── Project Card ───

export function AssistantProjectCard({ projectKey }: { projectKey: string }) {
  const params = useParams();
  const orgSlug = params.orgSlug as string;

  const projects = useCachedQuery(api.organizations.queries.listProjects, {
    orgSlug,
  });
  const statuses = useCachedQuery(
    api.organizations.queries.listProjectStatuses,
    {
      orgSlug,
    },
  );
  const project = projects?.find(p => p.key === projectKey);

  const changeStatus = useMutation(api.projects.mutations.changeStatus);

  const serverStatusId = project?.statusId ?? '';
  const [displayStatusId, setDisplayStatusId] =
    useOptimisticValue(serverStatusId);
  const displayStatus = statuses?.find(s => s._id === displayStatusId);

  if (projects === undefined) return <CardSkeleton />;
  if (!project) {
    return (
      <EntityUnavailableCard
        icon={<FolderKanban className='text-muted-foreground/60 size-3.5' />}
        label={projectKey}
        message='Project probably deleted'
      />
    );
  }

  const statusColor = displayStatus?.color ?? project.statusColor ?? '#94a3b8';
  const statusIcon = displayStatus?.icon ?? project.statusIcon;

  return (
    <div className='bg-background hover:bg-muted/30 grid max-w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5 overflow-hidden rounded-lg border px-3 py-2 transition-colors'>
      <div className='shrink-0'>
        <PermissionAware
          orgSlug={orgSlug}
          permission={PERMISSIONS.PROJECT_EDIT}
          fallbackMessage='No permission to change status'
        >
          <StatusSelector
            statuses={(statuses ?? []) as never[]}
            selectedStatus={displayStatusId}
            onStatusSelect={statusId => {
              setDisplayStatusId(statusId);
              void changeStatus({
                projectId: project._id,
                statusId: (statusId || null) as Id<'projectStatuses'> | null,
              });
            }}
            displayMode='iconOnly'
            trigger={
              <Button
                variant='ghost'
                size='icon'
                className='size-6 shrink-0 rounded-md'
                aria-label='Change project status'
              >
                {statusIcon ? (
                  <DynamicIcon
                    name={statusIcon}
                    className='size-3.5'
                    style={{ color: statusColor }}
                  />
                ) : (
                  <FolderKanban
                    className='size-3.5'
                    style={{ color: statusColor }}
                  />
                )}
              </Button>
            }
          />
        </PermissionAware>
      </div>

      <div className='min-w-0'>
        <Link
          href={`/${orgSlug}/projects/${project.key}`}
          className='hover:text-primary block min-w-0 truncate text-sm font-medium transition-colors'
        >
          {project.name}
        </Link>
        <div className='text-muted-foreground/60 mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]'>
          <span className='text-muted-foreground shrink-0 font-mono text-[11px]'>
            {project.key}
          </span>
          {project.visibility === 'private' ? <span>Private</span> : null}
        </div>
      </div>
    </div>
  );
}

// ─── Team Card ───

export function AssistantTeamCard({ teamKey }: { teamKey: string }) {
  const params = useParams();
  const orgSlug = params.orgSlug as string;

  const teams = useCachedQuery(api.organizations.queries.listTeams, {
    orgSlug,
  });
  const team = teams?.find(t => t.key === teamKey);

  if (teams === undefined) return <CardSkeleton />;
  if (!team) {
    return (
      <EntityUnavailableCard
        icon={<Users className='text-muted-foreground/60 size-3.5' />}
        label={teamKey}
        message='Team probably deleted'
      />
    );
  }

  return (
    <div className='bg-background hover:bg-muted/30 grid max-w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5 overflow-hidden rounded-lg border px-3 py-2 transition-colors'>
      <div className='mt-0.5 shrink-0'>
        {team.icon ? (
          <DynamicIcon
            name={team.icon}
            className='size-3.5'
            style={{ color: team.color ?? undefined }}
          />
        ) : (
          <Users className='text-muted-foreground/60 size-3.5' />
        )}
      </div>

      <div className='min-w-0'>
        <Link
          href={`/${orgSlug}/teams/${team.key}`}
          className='hover:text-primary block min-w-0 truncate text-sm font-medium transition-colors'
        >
          {team.name}
        </Link>
        <div className='text-muted-foreground/60 mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]'>
          <span className='text-muted-foreground shrink-0 font-mono text-[11px]'>
            {team.key}
          </span>
          {team.visibility === 'private' ? <span>Private</span> : null}
        </div>
      </div>
    </div>
  );
}

// ─── Document Card ───

export function AssistantDocumentCard({ documentId }: { documentId: string }) {
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const document = useCachedQuery(api.documents.queries.getById, {
    documentId: documentId as Id<'documents'>,
  });

  if (document === undefined) return <CardSkeleton />;
  if (document === null) {
    return (
      <EntityUnavailableCard
        icon={<FileText className='text-muted-foreground/60 size-3.5' />}
        label='Document'
        message='Document probably deleted'
      />
    );
  }

  return (
    <div className='bg-background hover:bg-muted/30 grid max-w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5 overflow-hidden rounded-lg border px-3 py-2 transition-colors'>
      <div className='mt-0.5 shrink-0'>
        <FileText className='text-muted-foreground/60 size-3.5' />
      </div>

      <Link
        href={`/${orgSlug}/documents/${documentId}`}
        className='hover:text-primary min-w-0 truncate text-sm font-medium transition-colors'
      >
        {document.title || 'View document'}
      </Link>
    </div>
  );
}
