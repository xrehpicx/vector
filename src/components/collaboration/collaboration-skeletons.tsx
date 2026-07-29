import { Skeleton } from '@/components/ui/skeleton';

export function CollaborationTimelineSkeleton() {
  return (
    <div className='space-y-1 px-3 py-4' aria-hidden='true'>
      {Array.from({ length: 7 }).map((_, index) => (
        <div
          key={index}
          className='flex items-start gap-2 rounded-md px-2 py-2'
        >
          <Skeleton className='size-7 shrink-0 rounded-full' />
          <div className='min-w-0 flex-1 space-y-1.5'>
            <div className='flex items-center gap-2'>
              <Skeleton className='h-3.5 w-24' />
              <Skeleton className='h-3 w-12' />
            </div>
            <Skeleton
              className={index % 3 === 0 ? 'h-3 w-5/6' : 'h-3 w-2/3 max-w-xl'}
            />
            {index === 2 ? <Skeleton className='h-28 w-52 rounded-lg' /> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CollaborationSidebarSkeleton() {
  return (
    <div className='space-y-4 p-2' aria-hidden='true'>
      <div className='space-y-1'>
        <Skeleton className='h-3 w-16' />
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className='flex h-8 items-center gap-2 px-2'>
            <Skeleton className='size-4 rounded' />
            <Skeleton className='h-3 flex-1' />
            {index === 1 ? <Skeleton className='h-4 w-5 rounded-full' /> : null}
          </div>
        ))}
      </div>
      <div className='space-y-1'>
        <Skeleton className='h-3 w-24' />
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className='flex h-8 items-center gap-2 px-2'>
            <Skeleton className='size-5 rounded-full' />
            <Skeleton className='h-3 flex-1' />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CollaborationContextSkeleton() {
  return (
    <div className='space-y-3 p-3' aria-hidden='true'>
      <div className='flex items-center gap-2'>
        <Skeleton className='size-8 rounded-full' />
        <div className='space-y-1'>
          <Skeleton className='h-3.5 w-28' />
          <Skeleton className='h-3 w-40' />
        </div>
      </div>
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className='h-12 w-full rounded-md' />
      ))}
    </div>
  );
}

export function CollaborationWorkspaceSkeleton() {
  return (
    <div
      className='flex h-[calc(100dvh-5rem)] min-h-[32rem] min-w-0 overflow-hidden lg:h-[calc(100dvh-1rem)]'
      aria-label='Opening workspace conversations'
    >
      <div className='hidden h-full w-56 shrink-0 border-r md:block'>
        <div className='flex h-10 items-center border-b px-3'>
          <Skeleton className='h-3.5 w-24' />
        </div>
        <CollaborationSidebarSkeleton />
      </div>
      <section className='flex min-w-0 flex-1 flex-col'>
        <div className='flex h-10 shrink-0 items-center gap-2 border-b px-3'>
          <Skeleton className='size-4 rounded' />
          <Skeleton className='h-3.5 w-28' />
          <Skeleton className='ml-auto h-7 w-24' />
        </div>
        <div className='min-h-0 flex-1'>
          <CollaborationTimelineSkeleton />
        </div>
        <div className='border-t p-2'>
          <Skeleton className='h-16 w-full rounded-lg' />
        </div>
      </section>
    </div>
  );
}
