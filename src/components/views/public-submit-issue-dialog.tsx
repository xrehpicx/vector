'use client';

import { useState } from 'react';
import { api, useMutation } from '@/lib/convex';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from '@/components/ui/responsive-dialog';

interface PublicSubmitIssueDialogProps {
  orgSlug: string;
  orgName: string;
  trigger?: React.ReactNode;
}

export function PublicSubmitIssueDialog({
  orgSlug,
  orgName,
  trigger,
}: PublicSubmitIssueDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedKey, setSubmittedKey] = useState<string | null>(null);

  const submit = useMutation(api.issues.mutations.createPublicSubmission);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setName('');
    setEmail('');
    setSubmittedKey(null);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      // Defer reset so the success state is visible until the dialog
      // fully closes, matching the pattern used in other Vector dialogs.
      setTimeout(resetForm, 200);
    }
  };

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error('Please enter a title');
      return;
    }
    if (trimmedTitle.length > 200) {
      toast.error('Title is too long (200 characters max)');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submit({
        orgSlug,
        title: trimmedTitle,
        description: description.trim() || undefined,
        submitterName: name.trim() || undefined,
        submitterEmail: email.trim() || undefined,
      });
      setSubmittedKey(result.key);
      toast.success('Request submitted');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to submit request',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogTrigger asChild>
        {trigger ?? (
          <Button size='sm' className='h-8 gap-1.5'>
            <Send className='size-3.5' />
            Submit a request
          </Button>
        )}
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent className='sm:max-w-lg'>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className='text-base'>
            Submit a request to {orgName}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className='text-xs'>
            Your request will show up as a public issue in this workspace. You
            don&apos;t need an account — leave your email if you want a reply.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        {submittedKey ? (
          <div className='flex flex-col items-center gap-3 py-6 text-center'>
            <CheckCircle2 className='size-10 text-emerald-500' />
            <div className='space-y-1'>
              <div className='text-sm font-medium'>Thanks — got it.</div>
              <div className='text-muted-foreground text-xs'>
                Tracking ID: <span className='font-mono'>{submittedKey}</span>
              </div>
            </div>
            <Button
              type='button'
              size='sm'
              variant='outline'
              className='h-8'
              onClick={() => {
                resetForm();
              }}
            >
              Submit another
            </Button>
          </div>
        ) : (
          <div className='space-y-3 py-1'>
            <div className='space-y-1.5'>
              <label className='text-xs font-medium'>
                Title <span className='text-destructive'>*</span>
              </label>
              <Input
                value={title}
                onChange={event => setTitle(event.target.value)}
                placeholder='Short summary of the request'
                className='h-8 text-sm'
                maxLength={200}
                disabled={isSubmitting}
              />
            </div>

            <div className='space-y-1.5'>
              <label className='text-xs font-medium'>Description</label>
              <Textarea
                value={description}
                onChange={event => setDescription(event.target.value)}
                placeholder='Context, steps, screenshots...'
                className='min-h-[120px] resize-none text-sm'
                maxLength={10_000}
                disabled={isSubmitting}
              />
            </div>

            <div className='grid gap-3 sm:grid-cols-2'>
              <div className='space-y-1.5'>
                <label className='text-xs font-medium'>
                  Your name{' '}
                  <span className='text-muted-foreground font-normal'>
                    (optional)
                  </span>
                </label>
                <Input
                  value={name}
                  onChange={event => setName(event.target.value)}
                  placeholder='Jane Doe'
                  className='h-8 text-sm'
                  maxLength={120}
                  disabled={isSubmitting}
                />
              </div>
              <div className='space-y-1.5'>
                <label className='text-xs font-medium'>
                  Email{' '}
                  <span className='text-muted-foreground font-normal'>
                    (optional)
                  </span>
                </label>
                <Input
                  type='email'
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder='you@example.com'
                  className='h-8 text-sm'
                  maxLength={200}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className='flex items-center justify-end gap-2 pt-2'>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='h-8'
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type='button'
                size='sm'
                className='h-8 gap-1.5'
                onClick={() => void handleSubmit()}
                disabled={isSubmitting || !title.trim()}
              >
                {isSubmitting ? (
                  <Loader2 className='size-3.5 animate-spin' />
                ) : (
                  <Send className='size-3.5' />
                )}
                Submit
              </Button>
            </div>
          </div>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
