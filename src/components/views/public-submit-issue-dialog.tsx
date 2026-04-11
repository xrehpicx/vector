'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api, useMutation } from '@/lib/convex';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
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
  publicIssueViewId?: string | null;
  trigger?: React.ReactNode;
}

type FieldErrors = Partial<{
  title: string;
  description: string;
  name: string;
  email: string;
  form: string;
}>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Map raw Convex / server error tokens to friendlier field-scoped messages.
function mapServerError(message: string): FieldErrors {
  const lower = message.toLowerCase();
  if (lower.includes('invalid_email')) {
    return { email: 'Enter a valid email address.' };
  }
  if (lower.includes('public_submission_disabled')) {
    return { form: 'Public submissions are no longer enabled here.' };
  }
  if (lower.includes('public_submission_project_missing')) {
    return {
      form: 'The configured destination project is missing. Please contact the workspace admin.',
    };
  }
  if (lower.includes('organization_not_found')) {
    return { form: 'Workspace not found.' };
  }
  if (lower.includes('invalid_input')) {
    return {
      form: 'One or more fields are invalid. Please double-check your input.',
    };
  }
  return { form: 'Something went wrong. Please try again.' };
}

export function PublicSubmitIssueDialog({
  orgSlug,
  orgName,
  publicIssueViewId,
  trigger,
}: PublicSubmitIssueDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedKey, setSubmittedKey] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = useMutation(api.issues.mutations.createPublicSubmission);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setName('');
    setEmail('');
    setSubmittedKey(null);
    setErrors({});
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      // Defer reset so the success state is visible until the dialog
      // fully closes, matching the pattern used in other Vector dialogs.
      setTimeout(resetForm, 200);
    }
  };

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      next.title = 'Please enter a title.';
    } else if (trimmedTitle.length > 200) {
      next.title = 'Title is too long (200 characters max).';
    }
    if (description.trim().length > 10_000) {
      next.description = 'Description is too long (10,000 characters max).';
    }
    if (name.trim().length > 120) {
      next.name = 'Name is too long (120 characters max).';
    }
    const trimmedEmail = email.trim();
    if (trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)) {
      next.email = 'Enter a valid email address.';
    }
    if (trimmedEmail.length > 200) {
      next.email = 'Email is too long (200 characters max).';
    }
    return next;
  };

  const handleSubmit = async () => {
    const localErrors = validate();
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }
    setErrors({});

    setIsSubmitting(true);
    try {
      const result = await submit({
        orgSlug,
        title: title.trim(),
        description: description.trim() || undefined,
        submitterName: name.trim() || undefined,
        submitterEmail: email.trim() || undefined,
      });
      setSubmittedKey(result.key);
      toast.success('Request submitted');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to submit request';
      setErrors(mapServerError(message));
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
            <div className='flex flex-wrap items-center justify-center gap-2'>
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
              {publicIssueViewId ? (
                <Link
                  href={`/${orgSlug}/views/${publicIssueViewId}/public`}
                  className={cn(buttonVariants({ size: 'sm' }), 'h-8 gap-1.5')}
                  onClick={() => handleOpenChange(false)}
                >
                  View all requests
                  <ArrowRight className='size-3.5' />
                </Link>
              ) : null}
            </div>
          </div>
        ) : (
          <div className='space-y-3 py-1'>
            {errors.form ? (
              <div className='flex items-start gap-2 rounded-md border border-[#cb706f]/30 bg-[#cb706f]/5 px-2.5 py-1.5 text-[11px] text-[#cb706f]'>
                <AlertCircle className='mt-0.5 size-3.5 shrink-0' />
                <span>{errors.form}</span>
              </div>
            ) : null}

            <div className='space-y-1.5'>
              <label className='text-xs font-medium'>
                Title <span className='text-destructive'>*</span>
              </label>
              <Input
                value={title}
                onChange={event => {
                  setTitle(event.target.value);
                  if (errors.title) {
                    setErrors(prev => ({ ...prev, title: undefined }));
                  }
                }}
                placeholder='Short summary of the request'
                className={cn(
                  'h-8 text-sm',
                  errors.title &&
                    'border-destructive focus-visible:ring-destructive/30',
                )}
                aria-invalid={errors.title ? true : undefined}
                maxLength={200}
                disabled={isSubmitting}
              />
              {errors.title ? (
                <p className='text-destructive text-[11px]'>{errors.title}</p>
              ) : null}
            </div>

            <div className='space-y-1.5'>
              <label className='text-xs font-medium'>Description</label>
              <Textarea
                value={description}
                onChange={event => {
                  setDescription(event.target.value);
                  if (errors.description) {
                    setErrors(prev => ({ ...prev, description: undefined }));
                  }
                }}
                placeholder='Context, steps, screenshots...'
                className={cn(
                  'min-h-[120px] resize-none text-sm',
                  errors.description &&
                    'border-destructive focus-visible:ring-destructive/30',
                )}
                aria-invalid={errors.description ? true : undefined}
                maxLength={10_000}
                disabled={isSubmitting}
              />
              {errors.description ? (
                <p className='text-destructive text-[11px]'>
                  {errors.description}
                </p>
              ) : null}
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
                  onChange={event => {
                    setName(event.target.value);
                    if (errors.name) {
                      setErrors(prev => ({ ...prev, name: undefined }));
                    }
                  }}
                  placeholder='Jane Doe'
                  className={cn(
                    'h-8 text-sm',
                    errors.name &&
                      'border-destructive focus-visible:ring-destructive/30',
                  )}
                  aria-invalid={errors.name ? true : undefined}
                  maxLength={120}
                  disabled={isSubmitting}
                />
                {errors.name ? (
                  <p className='text-destructive text-[11px]'>{errors.name}</p>
                ) : null}
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
                  onChange={event => {
                    setEmail(event.target.value);
                    if (errors.email) {
                      setErrors(prev => ({ ...prev, email: undefined }));
                    }
                  }}
                  placeholder='you@example.com'
                  className={cn(
                    'h-8 text-sm',
                    errors.email &&
                      'border-destructive focus-visible:ring-destructive/30',
                  )}
                  aria-invalid={errors.email ? true : undefined}
                  maxLength={200}
                  disabled={isSubmitting}
                />
                {errors.email ? (
                  <p className='text-destructive text-[11px]'>{errors.email}</p>
                ) : null}
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
