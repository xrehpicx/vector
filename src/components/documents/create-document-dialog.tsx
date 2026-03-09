'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@/lib/convex';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Id } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export interface CreateDocumentDialogProps {
  orgSlug: string;
  onDocumentCreated?: (documentId: string) => void;
  className?: string;
  defaultStates?: {
    folderId?: string;
    teamId?: string;
    projectId?: string;
  };
}

export function CreateDocumentDialog({
  orgSlug,
  onDocumentCreated,
  className,
  defaultStates,
}: CreateDocumentDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const createMutation = useMutation(api.documents.mutations.create);
  const router = useRouter();

  const handleCreate = async () => {
    setIsLoading(true);
    try {
      const result = await createMutation({
        orgSlug,
        data: {
          title: 'Untitled',
          folderId: defaultStates?.folderId
            ? (defaultStates.folderId as Id<'documentFolders'>)
            : undefined,
          teamId: defaultStates?.teamId
            ? (defaultStates.teamId as Id<'teams'>)
            : undefined,
          projectId: defaultStates?.projectId
            ? (defaultStates.projectId as Id<'projects'>)
            : undefined,
          visibility: 'organization',
        },
      });
      onDocumentCreated?.(result.documentId);
      router.push(`/${orgSlug}/documents/${result.documentId}`);
    } catch {
      toast.error('Failed to create document');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      size='sm'
      onClick={handleCreate}
      disabled={isLoading}
      className={cn('gap-1 text-xs', className)}
      variant='outline'
    >
      <Plus className='size-3' />
    </Button>
  );
}
