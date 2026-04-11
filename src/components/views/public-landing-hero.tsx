'use client';

import Link from 'next/link';
import Markdown from 'react-markdown';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { PublicSubmitIssueDialog } from '@/components/views/public-submit-issue-dialog';

interface PublicLandingHeroProps {
  orgSlug: string;
  orgName: string;
  publicDescription?: string | null;
  publicIssueViewId?: string | null;
}

export function PublicLandingHero({
  orgSlug,
  orgName,
  publicDescription,
  publicIssueViewId,
}: PublicLandingHeroProps) {
  return (
    <div className='mx-auto flex w-full max-w-2xl flex-col items-center gap-6 px-4 py-16 text-center sm:py-24'>
      <div className='space-y-2'>
        <h1 className='text-2xl font-semibold tracking-tight sm:text-3xl'>
          Submit a request to {orgName}
        </h1>
        <p className='text-muted-foreground text-sm'>
          Share a bug, feature request, or question. We&apos;ll pick it up from
          here.
        </p>
      </div>

      {publicDescription ? (
        <div className='prose prose-sm dark:prose-invert text-muted-foreground max-w-none'>
          <Markdown>{publicDescription}</Markdown>
        </div>
      ) : null}

      <div className='flex flex-wrap items-center justify-center gap-2'>
        <PublicSubmitIssueDialog orgSlug={orgSlug} orgName={orgName} />
        {publicIssueViewId ? (
          <Link
            href={`/${orgSlug}/views/${publicIssueViewId}/public`}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              'h-8 gap-1.5',
            )}
          >
            Browse existing requests
            <ArrowRight className='size-3.5' />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
