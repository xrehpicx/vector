'use client';

import { useEffect, useRef } from 'react';
import { MessageSquareText } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { api, useCachedQuery, useMutation } from '@/lib/convex';
import { Skeleton } from '@/components/ui/skeleton';

export default function ChannelsIndexPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const defaultChannel = useCachedQuery(
    api.collaboration.channels.getDefaultChannel,
    { orgSlug },
  );
  const bootstrap = useMutation(
    api.collaboration.channels.bootstrapDefaultChannel,
  );
  const bootstrapping = useRef(false);

  useEffect(() => {
    if (defaultChannel === undefined) return;
    if (window.matchMedia('(max-width: 1023px)').matches) {
      router.replace(`/${orgSlug}/channels/home`);
      return;
    }
    if (defaultChannel) {
      router.replace(`/${orgSlug}/channels/${defaultChannel.channel.slug}`);
      return;
    }
    if (bootstrapping.current) return;
    bootstrapping.current = true;
    void bootstrap({ orgSlug }).finally(() => {
      bootstrapping.current = false;
    });
  }, [bootstrap, defaultChannel, orgSlug, router]);

  return (
    <div className='flex h-[calc(100dvh-5rem)] min-h-[32rem] items-center justify-center lg:h-[calc(100dvh-1rem)]'>
      <div className='flex w-full max-w-sm flex-col items-center gap-3 px-6 text-center'>
        <div className='bg-muted flex size-9 items-center justify-center rounded-lg'>
          <MessageSquareText
            className='text-muted-foreground size-4'
            aria-hidden='true'
          />
        </div>
        <span className='sr-only'>Opening workspace conversations</span>
        <div className='w-full space-y-2' aria-hidden='true'>
          <Skeleton className='mx-auto h-3 w-36' />
          <Skeleton className='mx-auto h-2.5 w-52' />
        </div>
      </div>
    </div>
  );
}
