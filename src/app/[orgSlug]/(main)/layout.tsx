'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { OrgSidebar, OrgOptionsDropdown } from '@/components/organization';
import { OrgAssistantDock } from '@/components/assistant/org-assistant-dock';
import { AssistantIssueDndProvider } from '@/components/assistant/assistant-issue-dnd';
import { UserMenu } from '@/components/user-menu';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { BarsSpinner } from '@/components/bars-spinner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CommandMenu } from '@/components/command-menu';
import { CommandMenuActions } from '@/components/command-menu-actions';
import {
  CheckSquare,
  AtSign,
  Bookmark,
  Bot,
  BriefcaseBusiness,
  ChevronRight,
  FileInput,
  Files,
  FolderKanban,
  House,
  Inbox,
  LayoutGrid,
  MessagesSquare,
  PanelsTopLeft,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, useCachedQuery, useMutation } from '@/lib/convex';
import { rememberLastWorkspaceNavigation } from '@/lib/workspace-navigation';
import { useParams, usePathname } from 'next/navigation';
import { useRouter } from 'nextjs-toploader/app';
import { Doc } from '@/convex/_generated/dataModel';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_DEFAULT_WIDTH = 224; // w-56
const SIDEBAR_STORAGE_KEY = 'vector-sidebar-width';
const SIDEBAR_COLLAPSED_WIDTH = 52;
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'vector-sidebar-collapsed';

function parseSidebarWidth(raw: string | null): number {
  if (!raw) return SIDEBAR_DEFAULT_WIDTH;
  const parsed = parseInt(raw, 10);
  if (
    Number.isNaN(parsed) ||
    parsed < SIDEBAR_MIN_WIDTH ||
    parsed > SIDEBAR_MAX_WIDTH
  ) {
    return SIDEBAR_DEFAULT_WIDTH;
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Contexts
// ---------------------------------------------------------------------------

const MobileNavContext = createContext<(() => void) | null>(null);
const BottomBarPortalContext = createContext<HTMLDivElement | null>(null);

// ---------------------------------------------------------------------------
// Exported helpers for pages
// ---------------------------------------------------------------------------

/** @deprecated Bottom bar replaces the hamburger. Kept for import compat. */
export function MobileNavTrigger(_props: { className?: string }) {
  return null;
}

/** Portal children into the mobile bottom bar actions slot. No-op on desktop. */
export function BottomBarSlot({ children }: { children: ReactNode }) {
  const target = useContext(BottomBarPortalContext);
  if (!target) return null;
  return createPortal(children, target);
}

// ---------------------------------------------------------------------------
// Resizable sidebar hook
// ---------------------------------------------------------------------------

function useResizableSidebar() {
  const [width, setWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [collapsed, setCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const isResizing = useRef(false);
  const hydrated = useRef(false);

  // Sync from localStorage after hydration to avoid mismatch
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setWidth(parseSidebarWidth(localStorage.getItem(SIDEBAR_STORAGE_KEY)));
      setCollapsed(
        localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true',
      );
      hydrated.current = true;
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    setIsDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, e.clientX),
      );
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  // Persist to localStorage only after hydration to avoid overwriting saved value
  useEffect(() => {
    if (hydrated.current) {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(width));
    }
  }, [width]);

  useEffect(() => {
    if (hydrated.current) {
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
    }
  }, [collapsed]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(value => !value);
  }, []);

  return {
    width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : width,
    collapsed,
    isDragging,
    handleMouseDown,
    toggleCollapsed,
  };
}

// ---------------------------------------------------------------------------
// Bottom nav item
// ---------------------------------------------------------------------------

function BottomNavItem({
  href,
  icon: Icon,
  label,
  isActive,
  badge,
}: {
  href: string;
  icon: typeof CheckSquare;
  label: string;
  isActive: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'focus-visible:ring-ring relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] leading-3 font-medium transition-colors outline-none focus-visible:ring-2',
        isActive
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <span
        className={cn(
          'relative flex h-7 min-w-10 items-center justify-center rounded-full px-2 transition-colors',
          isActive && 'bg-foreground/8',
        )}
      >
        <Icon
          className='size-[19px]'
          strokeWidth={isActive ? 2.25 : 1.8}
          aria-hidden='true'
        />
        {badge ? (
          <span className='bg-primary text-primary-foreground absolute -top-1 -right-0.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[9px] leading-4 font-semibold tabular-nums'>
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </span>
      <span>{label}</span>
    </Link>
  );
}

function MobileMoreLink({
  href,
  label,
  icon: Icon,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: typeof CheckSquare;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className='hover:bg-muted/65 focus-visible:ring-ring flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors outline-none focus-visible:ring-2'
    >
      <span className='bg-muted flex size-8 shrink-0 items-center justify-center rounded-lg'>
        <Icon
          className='text-muted-foreground size-[17px]'
          aria-hidden='true'
        />
      </span>
      <span className='min-w-0 flex-1 truncate'>{label}</span>
      <ChevronRight
        className='text-muted-foreground/65 size-4'
        aria-hidden='true'
      />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const orgSlug = params.orgSlug as string;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);
  const [isRecoveringInvite, setIsRecoveringInvite] = useState(false);
  const inviteRecoveryAttemptedRef = useRef(false);
  const {
    width: sidebarWidth,
    collapsed: sidebarCollapsed,
    isDragging,
    handleMouseDown,
    toggleCollapsed,
  } = useResizableSidebar();

  // Fetch current user and organization data
  const user = useCachedQuery(api.users.currentUser);
  const pendingInvitation = useCachedQuery(
    api.organizations.queries.getPendingInvitationForOrg,
    user?._id ? { orgSlug } : 'skip',
  );
  const acceptPendingInvitation = useMutation(
    api.organizations.mutations.acceptPendingInvitationForOrg,
  );
  const organization = useCachedQuery(
    api.organizations.queries.getBySlug,
    user?._id && pendingInvitation === null ? { orgSlug } : 'skip',
  );
  const userOrganizations = useCachedQuery(
    api.users.getOrganizations,
    user?._id ? {} : 'skip',
  );
  const inboxCounts = useCachedQuery(
    api.notifications.queries.inboxCounts,
    user?._id ? { orgSlug } : 'skip',
  );

  // Route matching for bottom bar active state
  const isActive = (path: string) =>
    pathname === path || pathname.startsWith(path + '/');

  // Redirect unauthenticated users to login with return URL
  useEffect(() => {
    if (user === null) {
      window.location.href = `/auth/login?redirectTo=${encodeURIComponent(pathname)}`;
    }
  }, [user, pathname]);

  useEffect(() => {
    if (!pendingInvitation || inviteRecoveryAttemptedRef.current) return;

    inviteRecoveryAttemptedRef.current = true;
    setIsRecoveringInvite(true);

    void (async () => {
      try {
        const result = await acceptPendingInvitation({ orgSlug });
        if (result.organizationSlug && result.organizationSlug !== orgSlug) {
          router.replace(`/${result.organizationSlug}/channels`);
        }
      } catch (error) {
        console.error('Failed to accept pending invitation', error);
        router.replace('/settings/invites');
      } finally {
        setIsRecoveringInvite(false);
      }
    })();
  }, [acceptPendingInvitation, orgSlug, pendingInvitation, router]);

  useEffect(() => {
    if (!organization?.slug) return;

    rememberLastWorkspaceNavigation({
      name: organization.name,
      slug: organization.slug,
    });
  }, [organization?.name, organization?.slug]);

  if (isRecoveringInvite || pendingInvitation) {
    return (
      <div className='bg-secondary flex h-screen items-center justify-center p-4'>
        <div className='bg-background flex max-w-sm min-w-72 flex-col items-center gap-2 rounded-md border px-4 py-5 text-center'>
          <BarsSpinner className='text-muted-foreground' size={18} />
          <div className='space-y-1'>
            <p className='text-sm font-medium'>Joining workspace</p>
            <p className='text-muted-foreground text-xs'>
              Accepting your invitation to{' '}
              {pendingInvitation?.organizationName ?? 'this workspace'}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Don't render until we have the data
  if (user === undefined || user === null || organization === undefined) {
    return (
      <div className='bg-secondary flex h-screen'>
        <aside
          className='relative hidden lg:block'
          style={{ width: sidebarWidth }}
        >
          <div className='flex h-full flex-col'>
            <div className='p-2'>
              <div className='bg-background flex w-full items-center justify-between rounded-md border p-1'>
                <div className='flex min-w-0 flex-1 items-center gap-2'>
                  <Skeleton className='size-5 shrink-0 rounded' />
                  <Skeleton className='h-4 w-24' />
                </div>
              </div>
            </div>
            <div className='min-h-0 flex-1 overflow-hidden'>
              <ScrollArea
                className='h-full w-full max-w-full min-w-0'
                viewportClassName='h-full min-w-0 max-w-full overflow-x-hidden'
                scrollbars='vertical'
              >
                <div className='w-full max-w-full min-w-0 space-y-4 p-2 pt-0'>
                  <div className='space-y-1'>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className='flex h-8 items-center gap-2 rounded-md px-2 py-1'
                      >
                        <Skeleton className='size-4 rounded' />
                        <Skeleton
                          className='h-4'
                          style={{ width: `${60 + (i % 3) * 20}px` }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollArea>
            </div>
            <div className='border-border shrink-0 border-t p-2'>
              <div className='flex w-full justify-start gap-2 p-2'>
                <Skeleton className='size-8 rounded-full' />
                <div className='flex flex-col items-start gap-1'>
                  <Skeleton className='h-3.5 w-20' />
                  <Skeleton className='h-3 w-28' />
                </div>
              </div>
            </div>
          </div>
        </aside>
        <main className='bg-background mb-[calc(3.5rem+env(safe-area-inset-bottom))] flex-1 overflow-x-hidden overflow-y-auto lg:mx-2 lg:mt-2 lg:mb-2 lg:ml-0 lg:rounded-md lg:border' />
      </div>
    );
  }

  const organizations =
    userOrganizations?.filter(
      (org): org is Doc<'organizations'> => org !== null,
    ) || [];

  return (
    <MobileNavContext.Provider value={() => setMobileOpen(true)}>
      <BottomBarPortalContext.Provider value={portalTarget}>
        <AssistantIssueDndProvider>
          <div className='bg-secondary flex h-screen'>
            {/* Desktop sidebar */}
            <aside
              className={cn(
                'relative hidden lg:block',
                !isDragging && 'transition-[width] duration-200 ease-out',
              )}
              style={{ width: sidebarWidth }}
            >
              <div className='flex h-full flex-col'>
                <div
                  className={cn(
                    'flex items-center gap-1 p-2',
                    sidebarCollapsed ? 'flex-col' : 'w-full',
                  )}
                >
                  <div className={cn(!sidebarCollapsed && 'min-w-0 flex-1')}>
                    <OrgOptionsDropdown
                      currentOrgSlug={orgSlug}
                      currentOrgName={organization?.name ?? 'Organization'}
                      currentOrgLogo={organization?.logo}
                      organizations={organizations}
                      compact={sidebarCollapsed}
                    />
                  </div>
                  {!sidebarCollapsed ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type='button'
                            variant='ghost'
                            size='icon-sm'
                            onClick={toggleCollapsed}
                            className='text-muted-foreground hover:text-foreground size-8 shrink-0'
                            aria-label='Collapse workspace sidebar'
                          >
                            <PanelLeftClose
                              className='size-4'
                              aria-hidden='true'
                            />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side='bottom' sideOffset={8}>
                          Collapse workspace sidebar
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : null}
                </div>
                <div className='min-h-0 flex-1 overflow-hidden'>
                  <ScrollArea
                    className='h-full w-full max-w-full min-w-0'
                    viewportClassName='h-full min-w-0 max-w-full overflow-x-hidden'
                    scrollbars='vertical'
                  >
                    <OrgSidebar
                      orgSlug={orgSlug}
                      collapsed={sidebarCollapsed}
                    />
                  </ScrollArea>
                </div>
                {/* Assistant dock */}
                {sidebarCollapsed ? (
                  <div className='flex shrink-0 flex-col items-center gap-1 pb-1'>
                    <div
                      className='bg-border mb-0.5 h-px w-6'
                      aria-hidden='true'
                    />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type='button'
                            variant='ghost'
                            size='icon-sm'
                            onClick={toggleCollapsed}
                            className='text-muted-foreground hover:text-foreground size-8'
                            aria-label='Expand workspace sidebar'
                          >
                            <PanelLeftOpen
                              className='size-4'
                              aria-hidden='true'
                            />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side='right' sideOffset={8}>
                          Expand workspace sidebar
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type='button'
                            className='hover:bg-foreground/5 focus-visible:ring-ring flex size-8 shrink-0 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2'
                            onClick={() => {
                              toggleCollapsed();
                              window.setTimeout(() => {
                                window.dispatchEvent(
                                  new Event('command-menu:focus-assistant'),
                                );
                              }, 220);
                            }}
                            aria-label='Ask Vector'
                          >
                            <Sparkles className='size-4' aria-hidden='true' />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side='right' sideOffset={8}>
                          Ask Vector
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                ) : (
                  <OrgAssistantDock orgSlug={orgSlug} />
                )}
                {/* User footer */}
                <div
                  className={cn(
                    'border-border flex shrink-0 items-center gap-1 border-t p-2',
                    sidebarCollapsed && 'flex-col',
                  )}
                >
                  <div className={cn('min-w-0', !sidebarCollapsed && 'flex-1')}>
                    <UserMenu compact={sidebarCollapsed} />
                  </div>
                  <NotificationBell />
                </div>
              </div>
              {!sidebarCollapsed ? (
                <div
                  onMouseDown={handleMouseDown}
                  className='group absolute top-0 -right-0.5 bottom-0 z-30 flex w-1.5 cursor-col-resize items-center justify-center'
                >
                  <div
                    className={cn(
                      'h-full w-px transition-colors',
                      isDragging
                        ? 'bg-foreground/30'
                        : 'group-hover:bg-foreground/15 bg-transparent',
                    )}
                  />
                </div>
              ) : null}
            </aside>

            {/* Mobile workspace menu */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetContent
                side='bottom'
                showCloseButton={false}
                className='max-h-[88dvh] gap-0 overflow-hidden rounded-t-[22px] border-x px-0 pt-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]'
              >
                <div
                  className='bg-foreground/15 mx-auto mt-2 h-1 w-9 shrink-0 rounded-full'
                  aria-hidden='true'
                />
                <SheetHeader className='border-b px-4 pt-3 pb-3 text-left'>
                  <SheetTitle className='text-[17px] leading-6 font-semibold tracking-[-0.01em]'>
                    Workspace
                  </SheetTitle>
                  <SheetDescription className='text-xs'>
                    Open collaboration and work tools.
                  </SheetDescription>
                </SheetHeader>
                <div className='flex min-h-0 flex-1 flex-col'>
                  <div className='px-3 pt-3'>
                    <OrgOptionsDropdown
                      currentOrgSlug={orgSlug}
                      currentOrgName={organization?.name ?? 'Organization'}
                      currentOrgLogo={organization?.logo}
                      organizations={organizations}
                    />
                  </div>
                  <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3'>
                    <div className='space-y-4'>
                      <section aria-labelledby='mobile-more-collaboration'>
                        <h2
                          id='mobile-more-collaboration'
                          className='text-muted-foreground px-3 pb-1.5 text-[11px] font-semibold tracking-[0.04em] uppercase'
                        >
                          Collaboration
                        </h2>
                        <div className='space-y-0.5'>
                          <MobileMoreLink
                            href={`/${orgSlug}/channels/priority`}
                            label='Priority'
                            icon={AtSign}
                            onNavigate={() => setMobileOpen(false)}
                          />
                          <MobileMoreLink
                            href={`/${orgSlug}/channels/threads`}
                            label='Threads'
                            icon={MessagesSquare}
                            onNavigate={() => setMobileOpen(false)}
                          />
                          <MobileMoreLink
                            href={`/${orgSlug}/channels/saved`}
                            label='Saved'
                            icon={Bookmark}
                            onNavigate={() => setMobileOpen(false)}
                          />
                          <MobileMoreLink
                            href={`/${orgSlug}/agents`}
                            label='Agents'
                            icon={Bot}
                            onNavigate={() => setMobileOpen(false)}
                          />
                        </div>
                      </section>

                      <section aria-labelledby='mobile-more-work'>
                        <h2
                          id='mobile-more-work'
                          className='text-muted-foreground px-3 pb-1.5 text-[11px] font-semibold tracking-[0.04em] uppercase'
                        >
                          Work
                        </h2>
                        <div className='space-y-0.5'>
                          <MobileMoreLink
                            href={`/${orgSlug}/work`}
                            label='My work'
                            icon={BriefcaseBusiness}
                            onNavigate={() => setMobileOpen(false)}
                          />
                          <MobileMoreLink
                            href={`/${orgSlug}/requests`}
                            label='Requests'
                            icon={FileInput}
                            onNavigate={() => setMobileOpen(false)}
                          />
                          <MobileMoreLink
                            href={`/${orgSlug}/projects`}
                            label='Projects'
                            icon={FolderKanban}
                            onNavigate={() => setMobileOpen(false)}
                          />
                          <MobileMoreLink
                            href={`/${orgSlug}/teams`}
                            label='Teams'
                            icon={UsersRound}
                            onNavigate={() => setMobileOpen(false)}
                          />
                          <MobileMoreLink
                            href={`/${orgSlug}/documents`}
                            label='Documents'
                            icon={Files}
                            onNavigate={() => setMobileOpen(false)}
                          />
                          <MobileMoreLink
                            href={`/${orgSlug}/views`}
                            label='Views'
                            icon={PanelsTopLeft}
                            onNavigate={() => setMobileOpen(false)}
                          />
                        </div>
                      </section>
                    </div>
                  </div>
                  <div className='border-border flex shrink-0 items-center gap-1 border-t px-3 pt-2'>
                    <div className='min-w-0 flex-1'>
                      <UserMenu />
                    </div>
                    <NotificationBell />
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            {/* Main content */}
            <main className='bg-background mb-[calc(3.5rem+env(safe-area-inset-bottom))] min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain lg:mx-2 lg:mt-2 lg:mb-2 lg:ml-0 lg:rounded-md lg:border'>
              {children}
            </main>

            {/* Command menu (⌘K) */}
            <CommandMenu />
            <CommandMenuActions />

            {/* Mobile bottom bar */}
            <div className='bg-background/92 supports-[backdrop-filter]:bg-background/82 fixed right-0 bottom-0 left-0 z-50 border-t shadow-[0_-1px_0_rgb(0_0_0/0.02)] backdrop-blur-xl lg:hidden'>
              {/* Page actions slot */}
              <div ref={setPortalTarget} />
              {/* Nav */}
              <nav
                className='flex min-h-14 items-stretch px-1 pb-[env(safe-area-inset-bottom)]'
                aria-label='Primary'
              >
                <BottomNavItem
                  href={`/${orgSlug}/channels/home`}
                  icon={House}
                  label='Home'
                  isActive={
                    isActive(`/${orgSlug}/channels`) &&
                    !isActive(`/${orgSlug}/channels/dms`) &&
                    !isActive(`/${orgSlug}/channels/priority`) &&
                    !isActive(`/${orgSlug}/channels/threads`) &&
                    !isActive(`/${orgSlug}/channels/saved`) &&
                    !isActive(`/${orgSlug}/channels/search`)
                  }
                />
                <BottomNavItem
                  href={`/${orgSlug}/channels/dms`}
                  icon={MessagesSquare}
                  label='DMs'
                  isActive={isActive(`/${orgSlug}/channels/dms`)}
                />
                <BottomNavItem
                  href={`/${orgSlug}/inbox`}
                  icon={Inbox}
                  label='Activity'
                  badge={inboxCounts?.unread}
                  isActive={isActive(`/${orgSlug}/inbox`)}
                />
                <BottomNavItem
                  href={`/${orgSlug}/channels/search`}
                  icon={Search}
                  label='Search'
                  isActive={isActive(`/${orgSlug}/channels/search`)}
                />
                <button
                  type='button'
                  onClick={() => setMobileOpen(true)}
                  className={cn(
                    'focus-visible:ring-ring relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] leading-3 font-medium transition-colors outline-none focus-visible:ring-2',
                    !pathname.startsWith(`/${orgSlug}/channels`) &&
                      !pathname.startsWith(`/${orgSlug}/inbox`)
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-label='More workspace tools'
                >
                  <span
                    className={cn(
                      'flex h-7 min-w-10 items-center justify-center rounded-full px-2',
                      !pathname.startsWith(`/${orgSlug}/channels`) &&
                        !pathname.startsWith(`/${orgSlug}/inbox`) &&
                        'bg-foreground/8',
                    )}
                  >
                    <LayoutGrid
                      className='size-[19px]'
                      strokeWidth={1.8}
                      aria-hidden='true'
                    />
                  </span>
                  <span>More</span>
                </button>
              </nav>
            </div>
          </div>
        </AssistantIssueDndProvider>
      </BottomBarPortalContext.Provider>
    </MobileNavContext.Provider>
  );
}
