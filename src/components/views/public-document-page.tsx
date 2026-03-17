'use client';

import { api, useCachedQuery } from '@/lib/convex';
import Link from 'next/link';
import { DynamicIcon } from '@/lib/dynamic-icons';
import { RichEditor } from '@/components/ui/rich-editor';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/user-avatar';
import { formatDateHuman } from '@/lib/date';
import { FileText, Globe, Lock, PencilLine } from 'lucide-react';

interface PublicDocumentPageProps {
  orgSlug: string;
  documentId: string;
}

export function PublicDocumentPage({
  orgSlug,
  documentId,
}: PublicDocumentPageProps) {
  const document = useCachedQuery(api.og.queries.getPublicDocumentFull, {
    orgSlug,
    documentId,
  });

  if (document === undefined) {
    return (
      <div className='mx-auto max-w-4xl space-y-4 p-6 sm:px-8 sm:py-10'>
        <Skeleton className='h-4 w-36' />
        <Skeleton className='h-9 w-80' />
        <div className='flex gap-3'>
          <Skeleton className='h-8 w-32' />
          <Skeleton className='h-8 w-32' />
        </div>
        <div className='space-y-3 pt-4'>
          <Skeleton className='h-4 w-full' />
          <Skeleton className='h-4 w-5/6' />
          <Skeleton className='h-4 w-4/5' />
          <Skeleton className='h-4 w-full' />
          <Skeleton className='h-4 w-3/4' />
        </div>
      </div>
    );
  }

  if (document === null) {
    return (
      <div className='flex min-h-[60vh] flex-col items-center justify-center gap-2'>
        <Lock className='text-muted-foreground size-10 opacity-30' />
        <p className='text-muted-foreground text-sm'>
          This document is not available or is private.
        </p>
      </div>
    );
  }

  return (
    <div className='mx-auto w-full max-w-4xl px-6 py-8 sm:px-8 sm:py-10'>
      <div className='text-muted-foreground mb-4 flex flex-wrap items-center gap-1.5 text-xs'>
        <Globe className='size-3 text-emerald-500' />
        <span>{document.orgName}</span>
        {document.team ? (
          <>
            <span>/</span>
            <span>{document.team.name}</span>
          </>
        ) : null}
        {document.project ? (
          <>
            <span>/</span>
            <span>{document.project.name}</span>
          </>
        ) : null}
      </div>

      <div className='mb-6 space-y-4'>
        <div className='flex items-start gap-3'>
          <div className='bg-muted/40 flex size-10 shrink-0 items-center justify-center rounded-lg border'>
            {document.icon ? (
              <DynamicIcon
                name={document.icon}
                fallback={FileText}
                className='size-5'
                style={{ color: document.color ?? undefined }}
              />
            ) : (
              <FileText
                className='text-muted-foreground size-5'
                style={{ color: document.color ?? undefined }}
              />
            )}
          </div>

          <div className='min-w-0 flex-1'>
            <h1 className='text-2xl font-semibold tracking-tight'>
              {document.title || 'Untitled'}
            </h1>
            <div className='text-muted-foreground mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm'>
              {document.author ? (
                <div className='flex items-center gap-2'>
                  <UserAvatar
                    name={document.author.name}
                    email={document.author.email ?? undefined}
                    image={document.author.image}
                    userId={document.author.userId}
                    size='sm'
                  />
                  <span>{document.author.name}</span>
                </div>
              ) : null}
              <span>
                Created {formatDateHuman(new Date(document.createdAt))}
              </span>
              {document.lastEditedAt ? (
                <span className='inline-flex items-center gap-1.5'>
                  <PencilLine className='size-3.5' />
                  Updated {formatDateHuman(new Date(document.lastEditedAt))}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {document.team || document.project ? (
          <div className='flex flex-wrap gap-2'>
            {document.team ? (
              <Link
                href={`/${orgSlug}/teams/${document.team.key}/public`}
                className='text-muted-foreground hover:text-foreground hover:bg-muted/50 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors'
              >
                {document.team.icon ? (
                  <DynamicIcon
                    name={document.team.icon}
                    className='size-3.5'
                    style={{ color: document.team.color ?? undefined }}
                  />
                ) : null}
                <span>{document.team.name}</span>
              </Link>
            ) : null}
            {document.project ? (
              <Link
                href={`/${orgSlug}/projects/${document.project.key}/public`}
                className='text-muted-foreground hover:text-foreground hover:bg-muted/50 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors'
              >
                {document.project.icon ? (
                  <DynamicIcon
                    name={document.project.icon}
                    className='size-3.5'
                    style={{ color: document.project.color ?? undefined }}
                  />
                ) : null}
                <span>{document.project.name}</span>
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className='rounded-xl border px-5 py-6 sm:px-8 sm:py-8'>
        <RichEditor
          value={document.content}
          onChange={() => {}}
          mode='full'
          disabled
          className='notion-editor'
        />
      </div>
    </div>
  );
}
