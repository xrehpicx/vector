'use client';
import { useState } from 'react';
import { api, useMutation } from '@/lib/convex';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from '@/components/ui/responsive-dialog';
import { useFormSubmission } from '@/hooks/use-error-handling';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

type NonOwnerMemberRole = 'member' | 'admin';

export function InviteDialog({
  orgSlug,
  onClose,
}: {
  orgSlug: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<NonOwnerMemberRole>('member');

  const inviteMutation = useMutation(api.organizations.mutations.invite);

  const { submit, isSubmitting, error } = useFormSubmission(inviteMutation, {
    context: 'Invite',
    successMessage: 'Invitation sent successfully',
    onSuccess: () => {
      onClose();
      setEmail('');
      setRole('member');
    },
  });

  const handleInvite = async () => {
    if (!email.trim()) return;

    await submit({ orgSlug, email: email.trim(), role });
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={(isOpen: boolean) => !isOpen && onClose()}
    >
      <ResponsiveDialogContent className='sm:max-w-sm'>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Invite member</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Enter the email address of the person you want to invite.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className='space-y-4 py-2'>
          {error && (
            <Alert variant='destructive'>
              <AlertCircle className='h-4 w-4' />
              <AlertDescription>{error.userMessage}</AlertDescription>
            </Alert>
          )}

          <Input
            placeholder='email@example.com'
            value={email}
            onChange={e => setEmail(e.target.value)}
            type='email'
          />

          <div className='flex gap-2'>
            <Button
              variant={role === 'member' ? 'secondary' : 'outline'}
              size='sm'
              onClick={() => setRole('member')}
            >
              Member
            </Button>
            <Button
              variant={role === 'admin' ? 'secondary' : 'outline'}
              size='sm'
              onClick={() => setRole('admin')}
            >
              Admin
            </Button>
          </div>
        </div>

        <ResponsiveDialogFooter>
          <Button variant='ghost' size='sm' onClick={onClose}>
            Cancel
          </Button>
          <Button
            size='sm'
            disabled={!email || isSubmitting}
            onClick={handleInvite}
          >
            {isSubmitting ? 'Sending…' : 'Send Invite'}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
