'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { Id } from '@/convex/_generated/dataModel';
import { api, useMutation } from '@/lib/convex';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { BarsSpinner } from '@/components/bars-spinner';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from '@/components/ui/responsive-dialog';
import { MemberPicker } from './member-picker';

export function CreateWorkDialog({
  orgSlug,
  requestId,
  projectId,
  teamId,
  defaultTitle = '',
  defaultWorkpad = '',
  trigger,
  open: controlledOpen,
  onOpenChange,
  onCreated,
}: {
  orgSlug: string;
  requestId?: Id<'requests'>;
  projectId?: Id<'projects'>;
  teamId?: Id<'teams'>;
  defaultTitle?: string;
  defaultWorkpad?: string;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCreated?: (result: {
    workId: Id<'issues'>;
    workKey: string;
  }) => Promise<void> | void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [title, setTitle] = useState(defaultTitle);
  const [workpad, setWorkpad] = useState(defaultWorkpad);
  const [owners, setOwners] = useState<Id<'users'>[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const createWork = useMutation(api.work.mutations.create);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const result = await createWork({
        orgSlug,
        data: {
          title,
          description: workpad || undefined,
          ownerId: owners[0],
          projectId,
          teamId,
          requestIds: requestId ? [requestId] : undefined,
        },
      });
      if (onCreated) {
        try {
          await onCreated(result);
        } catch {
          toast.error('Work created, but it could not be linked here.');
        }
      }
      toast.success(
        <Link href={`/${orgSlug}/work/${result.workKey}`}>
          Work {result.workKey} created
        </Link>,
      );
      setOpen(false);
      setTitle(defaultTitle);
      setWorkpad(defaultWorkpad);
      setOwners([]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not create Work',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={setOpen}>
      <ResponsiveDialogTrigger asChild>
        {trigger ?? (
          <Button size='sm' className='h-7 gap-1.5 px-2 text-xs'>
            <Plus className='size-3.5' />
            Work
          </Button>
        )}
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent
        showCloseButton={false}
        className='gap-2 p-2 sm:max-w-2xl'
      >
        <ResponsiveDialogHeader className='sr-only'>
          <ResponsiveDialogTitle>Create Work</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <form onSubmit={submit} className='space-y-2'>
          <div className='relative'>
            <Input
              id='work-title'
              value={title}
              onChange={event => setTitle(event.target.value)}
              placeholder='What outcome will this Work deliver?'
              className='h-9 pr-24 text-base'
              autoFocus
              disabled={submitting}
            />
            <span className='text-muted-foreground bg-background pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded px-2 py-0.5 text-xs'>
              Outcome
            </span>
          </div>

          <div className='flex items-center gap-2'>
            <MemberPicker
              orgSlug={orgSlug}
              value={owners}
              onChange={setOwners}
              placeholder='No owner yet'
              disabled={submitting}
            />
            <span className='text-muted-foreground ml-auto text-xs'>
              Created as planned · start intentionally
            </span>
          </div>

          <div className='relative'>
            <Textarea
              id='workpad'
              value={workpad}
              onChange={event => setWorkpad(event.target.value)}
              placeholder='Notes, early approach, or context'
              className='min-h-32 resize-none pr-28 pb-8 text-sm'
              disabled={submitting}
            />
            <span className='text-muted-foreground bg-background pointer-events-none absolute right-2 bottom-2 rounded px-2 py-0.5 text-xs'>
              Initial workpad
            </span>
          </div>
        </form>

        <div className='flex w-full flex-row items-center justify-between gap-2'>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            disabled={submitting}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type='button'
            size='sm'
            disabled={submitting || !title.trim()}
            onClick={submit}
          >
            {submitting ? <BarsSpinner size={14} /> : 'Create Work'}
          </Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
