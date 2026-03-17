'use client';

import { useMutation } from 'convex/react';
import { api, useCachedPaginatedQuery, useCachedQuery } from '@/lib/convex';
import { useParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Globe,
  Building,
  Lock,
  LayoutGrid,
  LayoutList,
  Columns3,
  Clock,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { UserAvatar } from '@/components/user-avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { CreateViewDialog } from './create-view-dialog';
import { EditViewDialog } from './edit-view-dialog';
import { MobileNavTrigger } from '@/app/[orgSlug]/(main)/layout';
import { formatDateHuman } from '@/lib/date';
import { useConfirm } from '@/hooks/use-confirm';
import { toast } from 'sonner';
import { useState } from 'react';
import type { Id } from '@/convex/_generated/dataModel';
import type { FunctionReturnType } from 'convex/server';
import { useScopedPermission } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@/convex/_shared/permissions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type ViewsScope = 'mine' | 'all';

const VISIBILITY_ICON = {
  public: Globe,
  organization: Building,
  private: Lock,
} as const;

const VISIBILITY_COLOR = {
  public: 'text-emerald-500',
  organization: 'text-blue-500',
  private: 'text-purple-500',
} as const;

const VIEW_MODE_ICON = {
  table: LayoutList,
  kanban: Columns3,
  timeline: Clock,
} as const;

type ViewItem = NonNullable<
  FunctionReturnType<typeof api.views.queries.listViewsPage>
>['page'][number];

export function ViewsListPage() {
  const params = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const orgSlug = params.orgSlug;
  const [scope, setScope] = useState<ViewsScope>('mine');
  const [editingViewId, setEditingViewId] = useState<Id<'views'> | null>(null);
  const [confirm, ConfirmDialog] = useConfirm();
  const { hasPermission: canCreateViews } = useScopedPermission(
    { orgSlug },
    PERMISSIONS.VIEW_CREATE,
  );

  const summary = useCachedQuery(api.views.queries.getListSummary, {
    orgSlug,
  });
  const { results, status, loadMore } = useCachedPaginatedQuery(
    api.views.queries.listViewsPage,
    { orgSlug, scope },
    { initialNumItems: 20 },
  );
  const deleteView = useMutation(api.views.mutations.deleteView);

  const handleDelete = async (viewId: Id<'views'>, viewName: string) => {
    const confirmed = await confirm({
      title: 'Delete view',
      description: `"${viewName}" will be permanently deleted. This cannot be undone.`,
    });
    if (!confirmed) return;
    try {
      await deleteView({ viewId });
      toast.success('View deleted');
    } catch {
      toast.error('Failed to delete view');
    }
  };

  if (!summary || status === 'LoadingFirstPage') {
    return (
      <div className='bg-background h-full overflow-y-auto'>
        <div className='border-b'>
          <div className='flex items-center justify-between p-1'>
            <div className='flex items-center gap-1'>
              <Skeleton className='h-6 w-24 rounded-xs' />
              <Skeleton className='h-6 w-20 rounded-xs' />
            </div>
            <Skeleton className='h-6 w-20' />
          </div>
        </div>
        <div className='divide-y'>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className='flex items-center gap-3 px-3 py-2.5'>
              <Skeleton className='size-4 rounded' />
              <div className='min-w-0 flex-1 space-y-1'>
                <Skeleton className='h-4 w-1/3' />
                <Skeleton className='h-3 w-1/5' />
              </div>
              <Skeleton className='size-6 rounded-full' />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <ConfirmDialog />
      {editingViewId && (
        <EditViewDialog
          orgSlug={orgSlug}
          viewId={editingViewId}
          open={!!editingViewId}
          onOpenChange={open => !open && setEditingViewId(null)}
        />
      )}
      <div className='bg-background h-full overflow-y-auto'>
        {/* Header */}
        <div className='border-b'>
          <div className='flex items-center justify-between p-1'>
            <div className='flex items-center gap-1'>
              <MobileNavTrigger />
              <Button
                variant={scope === 'mine' ? 'secondary' : 'ghost'}
                size='sm'
                className='h-6 gap-2 rounded-xs px-3 text-xs font-normal'
                onClick={() => setScope('mine')}
              >
                <span>My views</span>
                <span className='text-muted-foreground text-xs'>
                  {summary?.mineCount ?? 0}
                </span>
              </Button>
              <Button
                variant={scope === 'all' ? 'secondary' : 'ghost'}
                size='sm'
                className='h-6 gap-2 rounded-xs px-3 text-xs font-normal'
                onClick={() => setScope('all')}
              >
                <span>Shared</span>
                <span className='text-muted-foreground text-xs'>
                  {summary?.sharedCount ?? 0}
                </span>
              </Button>
            </div>
            <div className='flex items-center gap-1 pr-1'>
              {canCreateViews && (
                <CreateViewDialog orgSlug={orgSlug} className='h-6 text-xs' />
              )}
            </div>
          </div>
        </div>

        {/* Empty state */}
        {results.length === 0 ? (
          <div className='text-muted-foreground flex flex-col items-center gap-3 py-20 text-center'>
            <LayoutGrid className='size-10 opacity-20' />
            <p className='text-sm font-medium'>
              {scope === 'mine' ? 'No private views' : 'No shared views'}
            </p>
            <p className='max-w-xs text-xs'>
              {scope === 'mine'
                ? 'Create a view to save a filtered issue list just for you.'
                : 'Views shared with the org or made public will appear here.'}
            </p>
            {scope === 'mine' && canCreateViews && (
              <CreateViewDialog
                orgSlug={orgSlug}
                className='mt-1 h-7 text-xs'
              />
            )}
          </div>
        ) : (
          <div className='divide-border divide-y'>
            {results.map(view => (
              <ViewRow
                key={view._id}
                view={view}
                orgSlug={orgSlug}
                onNavigate={() => router.push(`/${orgSlug}/views/${view._id}`)}
                onEdit={() => setEditingViewId(view._id as Id<'views'>)}
                onDelete={() =>
                  void handleDelete(view._id as Id<'views'>, view.name)
                }
              />
            ))}
          </div>
        )}

        {status === 'CanLoadMore' && (
          <div className='border-t px-3 py-2'>
            <Button
              variant='outline'
              size='sm'
              className='h-7 text-xs'
              onClick={() => loadMore(20)}
            >
              Load more views
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function ViewRow({
  view,
  onNavigate,
  onEdit,
  onDelete,
}: {
  view: ViewItem;
  orgSlug: string;
  onNavigate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const VisIcon =
    VISIBILITY_ICON[view.visibility as keyof typeof VISIBILITY_ICON] ??
    Building;
  const visColor =
    VISIBILITY_COLOR[view.visibility as keyof typeof VISIBILITY_COLOR] ??
    'text-blue-500';

  const viewMode = view.layout?.viewMode ?? 'table';
  const ModeIcon =
    VIEW_MODE_ICON[viewMode as keyof typeof VIEW_MODE_ICON] ?? LayoutList;

  // Collect active filter labels
  const filterLabels: string[] = [];
  if (view.filters.teamId) filterLabels.push('Team');
  if (view.filters.projectId) filterLabels.push('Project');
  if (view.filters.priorityIds?.length)
    filterLabels.push(
      view.filters.priorityIds.length === 1
        ? 'Priority'
        : `${view.filters.priorityIds.length} priorities`,
    );
  if (view.filters.workflowStateIds?.length)
    filterLabels.push(
      view.filters.workflowStateIds.length === 1
        ? 'State'
        : `${view.filters.workflowStateIds.length} states`,
    );

  return (
    <div
      className='hover:bg-muted/40 group flex items-center gap-2 px-3 py-2 transition-colors'
      onClick={onNavigate}
      role='button'
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onNavigate()}
    >
      {/* Visibility icon — like priority icon */}
      <VisIcon className={cn('size-4 flex-shrink-0', visColor)} />

      {/* Main content */}
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <span className='truncate text-sm font-medium'>{view.name}</span>
          {filterLabels.length > 0 && (
            <div className='hidden items-center gap-1 sm:flex'>
              {filterLabels.map(label => (
                <span
                  key={label}
                  className='bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs'
                >
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
        {view.description && (
          <p className='text-muted-foreground truncate text-xs'>
            {view.description.replace(/[#*_`[\]]/g, '').slice(0, 120)}
          </p>
        )}
      </div>

      {/* View mode icon */}
      <ModeIcon className='text-muted-foreground hidden size-3.5 flex-shrink-0 sm:block' />

      {/* Updated time */}
      <span className='text-muted-foreground hidden flex-shrink-0 text-xs sm:block'>
        {formatDateHuman(new Date(view.updatedAt))}
      </span>

      {/* Creator avatar */}
      {view.creator && (
        <UserAvatar
          name={view.creator.name}
          email={view.creator.email}
          image={view.creator.image}
          size='sm'
          className='flex-shrink-0'
        />
      )}

      {/* Actions */}
      {(view.canEdit || view.canDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
            <Button
              variant='ghost'
              size='sm'
              className='h-6 w-6 flex-shrink-0 p-0 opacity-0 group-hover:opacity-100'
            >
              <MoreHorizontal className='size-3.5' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-40'>
            {view.canEdit && (
              <DropdownMenuItem
                onClick={e => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <Pencil className='size-3.5' />
                Edit view
              </DropdownMenuItem>
            )}
            {view.canDelete && (
              <DropdownMenuItem
                variant='destructive'
                onClick={e => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className='size-3.5' />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
