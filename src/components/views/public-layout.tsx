'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api, useCachedQuery } from '@/lib/convex';
import {
  Github,
  Globe,
  Instagram,
  Linkedin,
  Twitter,
  Youtube,
} from 'lucide-react';
import Markdown from 'react-markdown';
import { buttonVariants } from '@/components/ui/button';
import { useBranding } from '@/hooks/use-branding';
import type { SocialLinkPlatform } from '@/lib/social-links';
import { cn } from '@/lib/utils';

function SocialIcon({ platform }: { platform: SocialLinkPlatform }) {
  switch (platform) {
    case 'github':
      return <Github className='size-4' />;
    case 'x':
      return <Twitter className='size-4' />;
    case 'linkedin':
      return <Linkedin className='size-4' />;
    case 'youtube':
      return <Youtube className='size-4' />;
    case 'instagram':
      return <Instagram className='size-4' />;
    case 'website':
    default:
      return <Globe className='size-4' />;
  }
}

export function PublicLayout({
  children,
  orgSlug,
}: {
  children: React.ReactNode;
  orgSlug: string;
}) {
  const pathname = usePathname();
  const branding = useBranding();
  const currentUser = useCachedQuery(api.users.currentUser);
  const publicProfile = useCachedQuery(
    api.organizations.queries.getPublicProfileBySlug,
    { orgSlug },
  );

  const redirectTo = pathname ?? `/${orgSlug}`;
  const showAuthActions = currentUser === null;
  const orgName = publicProfile?.name ?? orgSlug;
  const orgSubtitle = publicProfile?.subtitle?.trim() || 'Public workspace';

  return (
    <div className='bg-background flex min-h-screen flex-col'>
      <main className='flex-1'>{children}</main>
      <footer className='bg-muted/20 border-t'>
        <div className='mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6'>
          <div className='flex flex-col gap-5 md:flex-row md:items-start md:justify-between'>
            <div className='max-w-2xl min-w-0 space-y-3'>
              <div className='flex items-center gap-3'>
                {publicProfile?.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={publicProfile.logoUrl}
                    alt={orgName}
                    className='size-9 rounded-lg border object-cover'
                  />
                ) : (
                  <div className='bg-background text-foreground flex size-9 items-center justify-center rounded-lg border text-sm font-semibold uppercase'>
                    {orgName.charAt(0)}
                  </div>
                )}
                <div className='min-w-0'>
                  <div className='truncate text-sm font-medium'>{orgName}</div>
                  <div className='text-muted-foreground truncate text-xs'>
                    {orgSubtitle}
                  </div>
                </div>
              </div>

              {publicProfile?.publicDescription ? (
                <div className='prose prose-sm dark:prose-invert text-muted-foreground max-w-none'>
                  <Markdown>{publicProfile.publicDescription}</Markdown>
                </div>
              ) : null}

              {publicProfile && publicProfile.publicSocialLinks.length > 0 ? (
                <div className='flex flex-wrap items-center gap-1'>
                  {publicProfile.publicSocialLinks.map(link => (
                    <a
                      key={link.platform}
                      href={link.url}
                      target='_blank'
                      rel='noreferrer noopener'
                      className='text-muted-foreground hover:text-foreground hover:bg-background inline-flex size-8 items-center justify-center rounded-md border transition-colors'
                      aria-label={`Open ${link.platform}`}
                      title={link.url}
                    >
                      <SocialIcon platform={link.platform} />
                    </a>
                  ))}
                </div>
              ) : null}
            </div>

            {showAuthActions ? (
              <div className='flex flex-wrap gap-2'>
                <Link
                  href={`/auth/login?redirectTo=${encodeURIComponent(redirectTo)}`}
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'sm' }),
                    'h-8',
                  )}
                >
                  Log in
                </Link>
                <Link
                  href={`/auth/signup?redirectTo=${encodeURIComponent(redirectTo)}`}
                  className={cn(buttonVariants({ size: 'sm' }), 'h-8')}
                >
                  Sign up
                </Link>
              </div>
            ) : null}
          </div>

          <div className='text-muted-foreground flex flex-col gap-2 border-t pt-4 text-xs sm:flex-row sm:items-center sm:justify-between'>
            <span>Powered by {branding.name}</span>
            <span className='truncate'>
              {branding.description || 'Project management platform'}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
