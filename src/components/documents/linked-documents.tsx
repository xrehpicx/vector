'use client';

import { useCachedQuery } from '@/lib/convex';
import { api } from '@/convex/_generated/api';
import { FileText } from 'lucide-react';
import { DynamicIcon } from '@/lib/dynamic-icons';
import { formatDateHuman } from '@/lib/date';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';

interface LinkedDocumentsProps {
  orgSlug: string;
  mentionType: 'user' | 'team' | 'project' | 'issue';
  entityId: string;
}

export function LinkedDocuments({
  orgSlug,
  mentionType,
  entityId,
}: LinkedDocumentsProps) {
  const docs = useCachedQuery(api.documents.queries.listByMention, {
    orgSlug,
    mentionType,
    entityId,
  });

  if (docs === undefined) {
    return (
      <div className='space-y-2'>
        <div className='flex items-center gap-2'>
          <FileText className='text-muted-foreground size-4' />
          <Skeleton className='h-4 w-32' />
        </div>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className='flex items-center gap-2 py-1'>
            <Skeleton className='size-4 rounded' />
            <Skeleton className='h-4 w-40' />
          </div>
        ))}
      </div>
    );
  }

  if (docs.length === 0) return null;

  return (
    <div>
      <div className='mb-3 flex items-center gap-2'>
        <h2 className='text-sm font-semibold'>Linked Documents</h2>
        <span className='bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium'>
          {docs.length}
        </span>
      </div>
      <div className='divide-y rounded-lg border'>
        {docs.map(doc => (
          <Link
            key={doc._id}
            href={`/${orgSlug}/documents/${doc._id}`}
            className='hover:bg-muted/50 flex items-center gap-2 px-3 py-2 transition-colors'
          >
            {doc.icon ? (
              <DynamicIcon
                name={doc.icon}
                fallback={FileText}
                className='size-4 flex-shrink-0'
                style={{ color: doc.color || undefined }}
              />
            ) : (
              <FileText className='text-muted-foreground size-4 flex-shrink-0' />
            )}
            <span className='min-w-0 flex-1 truncate text-sm'>{doc.title}</span>
            <span className='text-muted-foreground shrink-0 text-xs'>
              {formatDateHuman(new Date(doc.lastEditedAt || doc._creationTime))}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
