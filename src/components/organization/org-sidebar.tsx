'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  type LucideIcon,
  Inbox,
  AtSign,
  Bookmark,
  Bot,
  FileInput,
  BriefcaseBusiness,
  FileText,
  FolderOpen,
  Circle,
  LayoutList,
  Columns3,
  Clock,
  Globe,
  Building,
  Lock,
  Plus,
  ChevronRight,
  MessageSquareText,
  MessageSquareReply,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CreateRequestDialog } from '@/components/requests/create-request-dialog';
import { CreateTeamButton } from '@/components/teams/create-team-button';
import { CreateProjectButton } from '@/components/projects/create-project-button';
import { ScopedPermissionGate } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@/convex/_shared/permissions';
import {
  api,
  useCachedPaginatedQuery,
  useCachedQuery,
  useMutation,
} from '@/lib/convex';
import { withIds } from '@/lib/convex-helpers';
import { useState, type ReactNode } from 'react';
import { useRouter } from 'nextjs-toploader/app';
import { DynamicIcon } from '@/lib/dynamic-icons';
import Avvvatars from 'avvvatars-react';
import { CreateDocumentDialog } from '@/components/documents/create-document-dialog';
import { CreateViewDialog } from '@/components/views/create-view-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Optional create button element shown at the end of the row */
  createElement?: ReactNode;
  badgeCount?: number;
  badgeCapped?: boolean;
  badgeLabel?: string;
  badgeTone?: 'attention' | 'unread';
}

interface OrgSidebarProps {
  orgSlug: string;
  onNavigate?: () => void;
  collapsed?: boolean;
}

/** Collapsible sidebar section with chevron toggle and linked label. */
function SidebarSection({
  label,
  href,
  action,
  children,
  onNavigate,
  defaultOpen = true,
}: {
  label: string;
  /** URL the section label links to (the "view all" page). */
  href: string;
  action?: ReactNode;
  children: ReactNode;
  onNavigate?: () => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className='w-full max-w-full min-w-0 space-y-1'>
      <div className='flex min-w-0 items-center justify-between pr-1 pl-2'>
        <div className='flex min-w-0 flex-1 items-center gap-1'>
          <Link
            href={href}
            onClick={onNavigate}
            className='text-muted-foreground hover:text-foreground min-w-0 truncate text-xs font-normal tracking-wider uppercase transition-colors'
          >
            {label}
          </Link>
          <button
            type='button'
            onClick={() => setOpen(o => !o)}
            className='text-muted-foreground hover:text-foreground shrink-0 transition-colors'
          >
            <ChevronRight
              className={cn(
                'size-3 transition-transform duration-150',
                open && 'rotate-90',
              )}
            />
          </button>
        </div>
        <div className='flex shrink-0 items-center gap-1'>{action}</div>
      </div>

      {open && (
        <div className='w-full max-w-full min-w-0 space-y-1'>{children}</div>
      )}
    </div>
  );
}

function SidebarNavRow({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div
      className={cn(
        'group flex h-8 w-full max-w-full min-w-0 items-center justify-between gap-2 rounded-md py-1 pr-1 pl-2 text-sm font-medium transition-colors',
        'hover:bg-foreground/5 text-foreground',
        active && 'bg-foreground/5',
      )}
    >
      <Link
        href={item.href}
        className='flex min-w-0 flex-1 items-center gap-2 outline-none'
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
      >
        <item.icon className='size-4 shrink-0' />
        <span className='min-w-0 flex-1 truncate'>{item.label}</span>
        {item.badgeCount !== undefined && item.badgeCount > 0 ? (
          <span
            className={cn(
              'flex min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-medium text-white',
              item.badgeTone === 'attention' ? 'bg-violet-500' : 'bg-primary',
            )}
            title={`${item.badgeCount} ${item.badgeLabel ?? 'updates'}`}
          >
            {item.badgeCapped || item.badgeCount >= 100
              ? '99+'
              : item.badgeCount}
            <span className='sr-only'> {item.badgeLabel ?? 'updates'}</span>
          </span>
        ) : null}
      </Link>
      {item.createElement ? (
        <div className='shrink-0' onClick={event => event.stopPropagation()}>
          {item.createElement}
        </div>
      ) : null}
    </div>
  );
}

function CollapsedSidebarNavRow({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? 'page' : undefined}
          aria-label={item.label}
          className={cn(
            'hover:bg-foreground/5 focus-visible:ring-ring relative flex size-8 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2',
            active && 'bg-foreground/5',
          )}
        >
          <item.icon className='size-4' aria-hidden='true' />
          {item.badgeCount !== undefined && item.badgeCount > 0 ? (
            <span
              className={cn(
                'ring-secondary absolute top-0.5 right-0.5 size-1.5 rounded-full ring-2',
                item.badgeTone === 'attention' ? 'bg-violet-500' : 'bg-primary',
              )}
            >
              <span className='sr-only'>
                {item.badgeCount} {item.badgeLabel ?? 'updates'}
              </span>
            </span>
          ) : null}
        </Link>
      </TooltipTrigger>
      <TooltipContent side='right' sideOffset={8}>
        <span>{item.label}</span>
        {item.badgeCount !== undefined && item.badgeCount > 0 ? (
          <span className='text-muted-foreground ml-1.5 tabular-nums'>
            {item.badgeCapped || item.badgeCount >= 100
              ? '99+'
              : item.badgeCount}
          </span>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

function SidebarItemsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className='w-full min-w-0 space-y-1' aria-hidden='true'>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className='flex w-full min-w-0 items-center gap-2 rounded-md py-1.5 pr-1 pl-2'
        >
          <Skeleton className='size-3 shrink-0 rounded-sm' />
          <Skeleton
            className={cn(
              'h-3 flex-1',
              index === 0 && 'max-w-32',
              index === 1 && 'max-w-24',
              index === 2 && 'max-w-28',
            )}
          />
        </div>
      ))}
    </div>
  );
}

function CreateThreadButton({
  orgSlug,
  onNavigate,
}: {
  orgSlug: string;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const createThread = useMutation(api.ai.mutations.createThread);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const thread = await createThread({ orgSlug });
      if (thread?._id) {
        onNavigate?.();
        router.push(`/${orgSlug}/threads/${thread._id}`);
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Button
      variant='outline'
      size='sm'
      className='h-6 w-6 border-0 p-0 shadow-none'
      onClick={handleCreate}
      disabled={isCreating}
      aria-label='Start an assistant thread'
    >
      <Plus className='size-3.5' />
    </Button>
  );
}

export function OrgSidebar({
  orgSlug,
  onNavigate,
  collapsed = false,
}: OrgSidebarProps) {
  const pathname = usePathname();
  const inboxCounts = useCachedQuery(api.notifications.queries.inboxCounts, {
    orgSlug,
  });
  const priorityItems = useCachedQuery(
    api.collaboration.messages.listPriorityInbox,
    { orgSlug, limit: 100 },
  );

  const userTeamsPage = useCachedPaginatedQuery(
    api.teams.queries.listPage,
    { orgSlug, scope: 'mine' },
    { initialNumItems: 4 },
  );
  const userTeamsLoading = userTeamsPage.status === 'LoadingFirstPage';

  const userProjectsPage = useCachedPaginatedQuery(
    api.projects.queries.listPage,
    { orgSlug, scope: 'mine' },
    { initialNumItems: 4 },
  );
  const userProjectsLoading = userProjectsPage.status === 'LoadingFirstPage';

  const userDocumentsPage = useCachedPaginatedQuery(
    api.documents.queries.listPage,
    { orgSlug, scope: 'mine' },
    { initialNumItems: 4 },
  );
  const userDocumentsLoading = userDocumentsPage.status === 'LoadingFirstPage';

  const visibleViewsPage = useCachedPaginatedQuery(
    api.views.queries.listViewsPage,
    { orgSlug, scope: 'all' },
    { initialNumItems: 4 },
  );
  const visibleViewsLoading = visibleViewsPage.status === 'LoadingFirstPage';

  const threadsPage = useCachedPaginatedQuery(
    api.ai.queries.listOrgThreads,
    { orgSlug },
    { initialNumItems: 4 },
  );
  const threadsLoading = threadsPage.status === 'LoadingFirstPage';

  // Transform data to maintain frontend compatibility.
  const userTeams = withIds(userTeamsPage.results);
  const userProjects = withIds(userProjectsPage.results);
  const userDocuments = userDocumentsPage.results;
  const visibleViews = visibleViewsPage.results;
  const threads = threadsPage.results;

  const hasMoreTeams =
    userTeams.length > 3 || userTeamsPage.status === 'CanLoadMore';
  const hasMoreProjects =
    userProjects.length > 3 || userProjectsPage.status === 'CanLoadMore';
  const hasMoreDocuments =
    userDocuments.length > 3 || userDocumentsPage.status === 'CanLoadMore';
  const hasMoreViews =
    visibleViews.length > 3 || visibleViewsPage.status === 'CanLoadMore';
  const hasMoreThreads =
    threads.length > 3 || threadsPage.status === 'CanLoadMore';

  const collaborationNavItems: NavItem[] = [
    {
      label: 'Chat',
      href: `/${orgSlug}/channels`,
      icon: MessageSquareText,
    },
    {
      label: 'Priority',
      href: `/${orgSlug}/channels/priority`,
      icon: AtSign,
      badgeCount: priorityItems?.length,
      badgeCapped: priorityItems?.length === 100,
      badgeLabel: 'priority updates',
    },
    {
      label: 'Threads',
      href: `/${orgSlug}/channels/threads`,
      icon: MessageSquareReply,
    },
    {
      label: 'Saved',
      href: `/${orgSlug}/channels/saved`,
      icon: Bookmark,
    },
    {
      label: 'Search',
      href: `/${orgSlug}/channels/search`,
      icon: Search,
    },
    {
      label: 'Agents',
      href: `/${orgSlug}/agents`,
      icon: Bot,
    },
  ];

  const workNavItems: NavItem[] = [
    {
      label: 'Inbox',
      href: `/${orgSlug}/inbox`,
      icon: Inbox,
      badgeCount:
        (inboxCounts?.action ?? 0) > 0
          ? inboxCounts?.action
          : inboxCounts?.unread,
      badgeLabel:
        (inboxCounts?.action ?? 0) > 0 ? 'items need action' : 'unread updates',
      badgeTone: (inboxCounts?.action ?? 0) > 0 ? 'attention' : 'unread',
      badgeCapped:
        (inboxCounts?.action ?? 0) > 0
          ? inboxCounts?.actionCapped
          : inboxCounts?.unreadCapped,
    },
    {
      label: 'Requests',
      href: `/${orgSlug}/requests`,
      icon: FileInput,
      createElement: (
        <ScopedPermissionGate
          scope={{ orgSlug }}
          permission={PERMISSIONS.ISSUE_CREATE}
        >
          <CreateRequestDialog
            orgSlug={orgSlug}
            trigger={
              <Button
                variant='outline'
                size='sm'
                className='h-6 w-6 border-0 p-0 shadow-none'
              >
                <Plus className='size-3.5' />
              </Button>
            }
          />
        </ScopedPermissionGate>
      ),
    },
    {
      label: 'My Work',
      href: `/${orgSlug}/work`,
      icon: BriefcaseBusiness,
    },
  ];
  const collaborationActive = pathname.startsWith(`/${orgSlug}/channels`);
  const agentsActive = pathname.startsWith(`/${orgSlug}/agents`);
  const workActive = !collaborationActive && !agentsActive;
  const isCollaborationItemActive = (item: NavItem) =>
    item.href.endsWith('/channels')
      ? pathname === item.href ||
        (pathname.startsWith(`${item.href}/`) &&
          !pathname.startsWith(`${item.href}/priority`) &&
          !pathname.startsWith(`${item.href}/threads`) &&
          !pathname.startsWith(`${item.href}/saved`) &&
          !pathname.startsWith(`${item.href}/search`))
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

  if (collapsed) {
    return (
      <TooltipProvider>
        <nav
          className='flex w-full flex-col items-center gap-1 px-2 pb-2'
          aria-label='Workspace navigation'
        >
          {collaborationNavItems.map(item => (
            <CollapsedSidebarNavRow
              key={item.href}
              item={item}
              active={isCollaborationItemActive(item)}
              onNavigate={onNavigate}
            />
          ))}
          <div className='bg-border my-1 h-px w-6' aria-hidden='true' />
          {workNavItems.map(item => (
            <CollapsedSidebarNavRow
              key={item.href}
              item={item}
              active={
                pathname === item.href || pathname.startsWith(`${item.href}/`)
              }
              onNavigate={onNavigate}
            />
          ))}
        </nav>
      </TooltipProvider>
    );
  }

  return (
    <>
      <nav className='w-full max-w-full min-w-0 space-y-4 overflow-x-hidden p-2 pt-0'>
        {/* Collaboration is the workspace's primary surface. */}
        <div className='space-y-1'>
          {collaborationNavItems.map(item => (
            <SidebarNavRow
              key={item.href}
              item={item}
              active={isCollaborationItemActive(item)}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        <SidebarSection
          label='Work'
          href={`/${orgSlug}/work`}
          onNavigate={onNavigate}
          defaultOpen={workActive}
        >
          <div className='space-y-1'>
            {workNavItems.map(item => (
              <SidebarNavRow
                key={item.href}
                item={item}
                active={
                  pathname === item.href || pathname.startsWith(`${item.href}/`)
                }
                onNavigate={onNavigate}
              />
            ))}
          </div>

          {/* Teams Section */}
          <SidebarSection
            label='My Teams'
            href={`/${orgSlug}/teams`}
            onNavigate={onNavigate}
            action={
              <CreateTeamButton
                orgSlug={orgSlug}
                size='sm'
                className='h-6 w-6 border-0 p-0 shadow-none'
              />
            }
          >
            {userTeamsLoading ? (
              <SidebarItemsSkeleton />
            ) : userTeams.length > 0 ? (
              userTeams.slice(0, 3).map(team => {
                const teamHref = `/${orgSlug}/teams/${team.key}`;
                const isActive =
                  pathname === teamHref || pathname.startsWith(teamHref + '/');

                return (
                  <Link
                    key={team.id}
                    href={teamHref}
                    onClick={onNavigate}
                    className={cn(
                      'flex w-full max-w-full min-w-0 items-center gap-2 rounded-md py-1.5 pr-1 pl-2 text-sm font-medium transition-colors',
                      'hover:bg-foreground/5 text-foreground',
                      {
                        'bg-foreground/5': isActive,
                      },
                    )}
                  >
                    <DynamicIcon
                      name={team.icon}
                      fallback={Circle}
                      className='size-3 flex-shrink-0'
                      style={{ color: team.color || '#6b7280' }}
                    />
                    <span className='min-w-0 flex-1 truncate'>{team.name}</span>
                  </Link>
                );
              })
            ) : (
              <div className='text-muted-foreground py-1.5 pr-1 pl-2 text-xs'>
                No teams yet
              </div>
            )}

            {!userTeamsLoading && hasMoreTeams && (
              <Link
                href={`/${orgSlug}/teams`}
                onClick={onNavigate}
                className='text-muted-foreground hover:text-foreground block py-1.5 pr-1 pl-2 text-xs transition-colors'
              >
                View all teams
              </Link>
            )}
          </SidebarSection>

          {/* Projects Section */}
          <SidebarSection
            label='My Projects'
            href={`/${orgSlug}/projects`}
            onNavigate={onNavigate}
            action={
              <CreateProjectButton
                orgSlug={orgSlug}
                size='sm'
                className='h-6 w-6 border-0 p-0 shadow-none'
              />
            }
          >
            {userProjectsLoading ? (
              <SidebarItemsSkeleton />
            ) : userProjects.length > 0 ? (
              userProjects.slice(0, 3).map(project => {
                const projectHref = `/${orgSlug}/projects/${project.key}`;
                const isActive =
                  pathname === projectHref ||
                  pathname.startsWith(projectHref + '/');

                return (
                  <Link
                    key={project.id}
                    href={projectHref}
                    onClick={onNavigate}
                    className={cn(
                      'flex w-full max-w-full min-w-0 items-center gap-2 rounded-md py-1.5 pr-1 pl-2 text-sm font-medium transition-colors',
                      'hover:bg-foreground/5 text-foreground',
                      {
                        'bg-foreground/5': isActive,
                      },
                    )}
                  >
                    <DynamicIcon
                      name={project.icon || project.status?.icon}
                      fallback={FolderOpen}
                      className='size-3 flex-shrink-0'
                      style={{
                        color:
                          project.color || project.status?.color || '#6b7280',
                      }}
                    />
                    <span className='min-w-0 flex-1 truncate'>
                      {project.name}
                    </span>
                    {project.status?.icon && (
                      <div className='flex w-6 shrink-0 items-center justify-center'>
                        <DynamicIcon
                          name={project.status.icon}
                          className='size-3'
                          style={{ color: project.status.color || '#6b7280' }}
                        />
                      </div>
                    )}
                  </Link>
                );
              })
            ) : (
              <div className='text-muted-foreground py-1.5 pr-1 pl-2 text-xs'>
                No projects yet
              </div>
            )}

            {!userProjectsLoading && hasMoreProjects && (
              <Link
                href={`/${orgSlug}/projects`}
                onClick={onNavigate}
                className='text-muted-foreground hover:text-foreground block py-1.5 pr-1 pl-2 text-xs transition-colors'
              >
                View all projects
              </Link>
            )}
          </SidebarSection>

          {/* Views Section */}
          <SidebarSection
            label='Views'
            href={`/${orgSlug}/views`}
            onNavigate={onNavigate}
            action={
              <ScopedPermissionGate
                scope={{ orgSlug }}
                permission={PERMISSIONS.VIEW_CREATE}
              >
                <CreateViewDialog
                  orgSlug={orgSlug}
                  trigger={
                    <Button
                      variant='outline'
                      size='sm'
                      className='h-6 w-6 border-0 p-0 shadow-none'
                    >
                      <Plus className='size-3.5' />
                    </Button>
                  }
                />
              </ScopedPermissionGate>
            }
          >
            {visibleViewsLoading ? (
              <SidebarItemsSkeleton />
            ) : visibleViews.length > 0 ? (
              visibleViews.slice(0, 3).map(view => {
                const viewHref = `/${orgSlug}/views/${view._id}`;
                const isActive =
                  pathname === viewHref || pathname.startsWith(viewHref + '/');
                const VisibilityIcon =
                  view.visibility === 'public'
                    ? Globe
                    : view.visibility === 'private'
                      ? Lock
                      : Building;
                const viewMode = view.layout?.viewMode ?? 'table';
                const ViewModeIcon =
                  viewMode === 'kanban'
                    ? Columns3
                    : viewMode === 'timeline'
                      ? Clock
                      : LayoutList;

                return (
                  <Link
                    key={view._id}
                    href={viewHref}
                    onClick={onNavigate}
                    className={cn(
                      'flex w-full max-w-full min-w-0 items-center gap-2 rounded-md py-1.5 pr-1 pl-2 text-sm font-medium transition-colors',
                      'hover:bg-foreground/5 text-foreground',
                      {
                        'bg-foreground/5': isActive,
                      },
                    )}
                  >
                    <ViewModeIcon className='text-muted-foreground size-3 flex-shrink-0' />
                    <span className='min-w-0 flex-1 truncate'>{view.name}</span>
                    <div className='flex w-6 shrink-0 items-center justify-center'>
                      <VisibilityIcon
                        className={cn('size-3', {
                          'text-emerald-500': view.visibility === 'public',
                          'text-purple-500': view.visibility === 'private',
                          'text-blue-500': view.visibility === 'organization',
                        })}
                      />
                    </div>
                  </Link>
                );
              })
            ) : (
              <div className='text-muted-foreground py-1.5 pr-1 pl-2 text-xs'>
                No views yet
              </div>
            )}

            {!visibleViewsLoading && hasMoreViews && (
              <Link
                href={`/${orgSlug}/views`}
                onClick={onNavigate}
                className='text-muted-foreground hover:text-foreground block py-1.5 pr-1 pl-2 text-xs transition-colors'
              >
                View all views
              </Link>
            )}
          </SidebarSection>

          {/* Threads Section */}
          <SidebarSection
            label='Threads'
            href={`/${orgSlug}/threads`}
            onNavigate={onNavigate}
            action={
              <CreateThreadButton orgSlug={orgSlug} onNavigate={onNavigate} />
            }
          >
            {threadsLoading ? (
              <SidebarItemsSkeleton />
            ) : threads.length > 0 ? (
              threads.slice(0, 3).map(thread => {
                const threadHref = `/${orgSlug}/threads/${thread._id}`;
                const isActive =
                  pathname === threadHref ||
                  pathname.startsWith(threadHref + '/');

                return (
                  <Link
                    key={thread._id}
                    href={threadHref}
                    onClick={onNavigate}
                    className={cn(
                      'flex w-full max-w-full min-w-0 items-center gap-2 rounded-md py-1.5 pr-1 pl-2 text-sm font-medium transition-colors',
                      'hover:bg-foreground/5 text-foreground',
                      {
                        'bg-foreground/5': isActive,
                      },
                    )}
                  >
                    <span className='flex size-4 shrink-0 items-center justify-center'>
                      <Avvvatars
                        value={`thread-${thread._id}`.toLowerCase()}
                        style='shape'
                        size={16}
                        shadow={false}
                        radius={999}
                      />
                    </span>
                    <span className='min-w-0 flex-1 truncate'>
                      {thread.title || 'Untitled Thread'}
                    </span>
                  </Link>
                );
              })
            ) : (
              <div className='text-muted-foreground py-1.5 pr-1 pl-2 text-xs'>
                No threads yet
              </div>
            )}

            {!threadsLoading && hasMoreThreads && (
              <Link
                href={`/${orgSlug}/threads`}
                onClick={onNavigate}
                className='text-muted-foreground hover:text-foreground block py-1.5 pr-1 pl-2 text-xs transition-colors'
              >
                View all threads
              </Link>
            )}
          </SidebarSection>

          {/* Documents Section */}
          <SidebarSection
            label='My Docs'
            href={`/${orgSlug}/documents`}
            onNavigate={onNavigate}
            action={
              <CreateDocumentDialog
                orgSlug={orgSlug}
                className='h-6 w-6 border-0 p-0 shadow-none'
              />
            }
          >
            {userDocumentsLoading ? (
              <SidebarItemsSkeleton />
            ) : userDocuments.length > 0 ? (
              userDocuments.slice(0, 3).map(doc => {
                const docHref = `/${orgSlug}/documents/${doc._id}`;
                const isActive =
                  pathname === docHref || pathname.startsWith(docHref + '/');

                return (
                  <Link
                    key={doc._id}
                    href={docHref}
                    onClick={onNavigate}
                    className={cn(
                      'flex w-full max-w-full min-w-0 items-center gap-2 rounded-md py-1.5 pr-1 pl-2 text-sm font-medium transition-colors',
                      'hover:bg-foreground/5 text-foreground',
                      {
                        'bg-foreground/5': isActive,
                      },
                    )}
                  >
                    {doc.icon ? (
                      <DynamicIcon
                        name={doc.icon}
                        fallback={FileText}
                        className='size-3 flex-shrink-0'
                        style={{ color: doc.color || '#6b7280' }}
                      />
                    ) : (
                      <FileText
                        className='size-3 flex-shrink-0'
                        style={{ color: doc.color || '#6b7280' }}
                      />
                    )}
                    <span className='min-w-0 flex-1 truncate'>{doc.title}</span>
                  </Link>
                );
              })
            ) : (
              <div className='text-muted-foreground py-1.5 pr-1 pl-2 text-xs'>
                No documents yet
              </div>
            )}

            {!userDocumentsLoading && hasMoreDocuments && (
              <Link
                href={`/${orgSlug}/documents`}
                onClick={onNavigate}
                className='text-muted-foreground hover:text-foreground block py-1.5 pr-1 pl-2 text-xs transition-colors'
              >
                View all documents
              </Link>
            )}
          </SidebarSection>
        </SidebarSection>
      </nav>
    </>
  );
}
