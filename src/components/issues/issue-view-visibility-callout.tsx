'use client';

import { api, useCachedQuery, useMutation } from '@/lib/convex';
import { Globe, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { Id } from '@/convex/_generated/dataModel';

interface IssueViewVisibilityCalloutProps {
  issueId: Id<'issues'>;
}

export function IssueViewVisibilityCallout({
  issueId,
}: IssueViewVisibilityCalloutProps) {
  const matchingViews = useCachedQuery(
    api.views.queries.getViewsContainingIssue,
    {
      issueId,
    },
  );
  const excludeIssue = useMutation(api.views.mutations.excludeIssueFromView);
  const includeIssue = useMutation(api.views.mutations.includeIssueInView);

  if (!matchingViews || matchingViews.length === 0) return null;

  const publicViews = matchingViews.filter(v => v.visibility === 'public');
  const orgViews = matchingViews.filter(v => v.visibility === 'organization');

  const handleExclude = async (viewId: Id<'views'>, viewName: string) => {
    await excludeIssue({ viewId, issueId });
    toast.success(`Excluded from "${viewName}"`);
  };

  const handleInclude = async (viewId: Id<'views'>, viewName: string) => {
    await includeIssue({ viewId, issueId });
    toast.success(`Re-included in "${viewName}"`);
  };

  return (
    <div className='space-y-1.5'>
      {publicViews.length > 0 && (
        <div className='rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2'>
          <div className='mb-1.5 flex items-center gap-2'>
            <Globe className='size-3.5 flex-shrink-0 text-emerald-500' />
            <span className='text-xs font-medium text-emerald-600 dark:text-emerald-400'>
              Visible in public view{publicViews.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className='space-y-1'>
            {publicViews.map(v => (
              <div
                key={v._id}
                className='flex items-center justify-between gap-2'
              >
                <span
                  className={`text-xs ${v.isExcluded ? 'text-muted-foreground/50 line-through' : 'text-muted-foreground'}`}
                >
                  {v.name}
                </span>
                {v.isExcluded ? (
                  <Button
                    variant='ghost'
                    size='sm'
                    className='h-5 gap-1 px-1.5 text-xs text-emerald-600 hover:text-emerald-700'
                    onClick={() => void handleInclude(v._id, v.name)}
                  >
                    <RotateCcw className='size-3' />
                    Re-include
                  </Button>
                ) : (
                  <Button
                    variant='ghost'
                    size='sm'
                    className='text-muted-foreground h-5 gap-1 px-1.5 text-xs'
                    onClick={() => void handleExclude(v._id, v.name)}
                  >
                    <EyeOff className='size-3' />
                    Exclude
                  </Button>
                )}
              </div>
            ))}
          </div>
          {publicViews.some(v => !v.isExcluded) && (
            <p className='text-muted-foreground mt-1.5 text-xs'>
              Anyone with the link can see this issue&apos;s title and status.
            </p>
          )}
        </div>
      )}
      {orgViews.length > 0 && (
        <div className='rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2'>
          <div className='mb-1.5 flex items-center gap-2'>
            <Eye className='size-3.5 flex-shrink-0 text-blue-500' />
            <span className='text-xs font-medium text-blue-600 dark:text-blue-400'>
              Included in shared view{orgViews.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className='space-y-1'>
            {orgViews.map(v => (
              <div
                key={v._id}
                className='flex items-center justify-between gap-2'
              >
                <span
                  className={`text-xs ${v.isExcluded ? 'text-muted-foreground/50 line-through' : 'text-muted-foreground'}`}
                >
                  {v.name}
                </span>
                {v.isExcluded ? (
                  <Button
                    variant='ghost'
                    size='sm'
                    className='h-5 gap-1 px-1.5 text-xs text-blue-600 hover:text-blue-700'
                    onClick={() => void handleInclude(v._id, v.name)}
                  >
                    <RotateCcw className='size-3' />
                    Re-include
                  </Button>
                ) : (
                  <Button
                    variant='ghost'
                    size='sm'
                    className='text-muted-foreground h-5 gap-1 px-1.5 text-xs'
                    onClick={() => void handleExclude(v._id, v.name)}
                  >
                    <EyeOff className='size-3' />
                    Exclude
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
