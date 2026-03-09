'use client';

import { useQuery, useMutation, api } from '@/lib/convex';
import { OrgSetupForm } from '@/components/organization';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import type { Id } from '@/convex/_generated/dataModel';

function PendingInvitesList() {
  const invitesQuery = useQuery(api.users.getPendingInvitations);
  const acceptInvite = useMutation(
    api.organizations.mutations.acceptInvitation,
  );
  const declineInvite = useMutation(
    api.organizations.mutations.declineInvitation,
  );
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<{
    inviteId: Id<'invitations'>;
    type: 'accept' | 'decline';
  } | null>(null);

  const isPendingAction = (
    inviteId: Id<'invitations'>,
    type: 'accept' | 'decline',
  ) => pendingAction?.inviteId === inviteId && pendingAction.type === type;

  if (invitesQuery.isPending) {
    return (
      <div className='w-full space-y-3'>
        <div className='space-y-1'>
          <Skeleton className='h-4 w-32' />
          <Skeleton className='h-3 w-52' />
        </div>
        <div className='divide-y rounded-lg border'>
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className='flex items-center gap-3 px-3 py-2.5'>
              <div className='min-w-0 flex-1 space-y-1'>
                <Skeleton className='h-4 w-36' />
                <Skeleton className='h-3 w-28' />
              </div>
              <Skeleton className='h-5 w-16 rounded-full' />
              <div className='flex gap-1'>
                <Skeleton className='h-7 w-14 rounded-md' />
                <Skeleton className='h-7 w-16 rounded-md' />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const invites = invitesQuery.data;
  if (!invites || invites.length === 0) return null;

  const handleAccept = async (inv: (typeof invites)[number]) => {
    setPendingAction({ inviteId: inv._id, type: 'accept' });
    try {
      await acceptInvite({ inviteId: inv._id });
      toast.success(`Joined ${inv.organization?.name ?? 'workspace'}`);
      if (inv.organization?.slug) {
        router.push(`/${inv.organization.slug}/issues`);
        return;
      }
      router.push('/');
    } catch (err) {
      toast.error((err as Error).message);
      setPendingAction(null);
    }
  };

  const handleDecline = async (inv: (typeof invites)[number]) => {
    setPendingAction({ inviteId: inv._id, type: 'decline' });
    try {
      await declineInvite({ inviteId: inv._id });
      toast.info(`Declined ${inv.organization?.name ?? 'workspace'}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className='w-full space-y-3'>
      <div className='space-y-1'>
        <h2 className='text-sm font-semibold'>Pending invitations</h2>
        <p className='text-muted-foreground text-sm'>
          Join an existing workspace or dismiss the invite.
        </p>
      </div>

      <div className='divide-y rounded-lg border'>
        {invites.map(inv => (
          <div
            key={inv._id}
            className='flex flex-wrap items-center gap-2 px-3 py-2.5 sm:flex-nowrap sm:gap-3'
          >
            <div className='min-w-0 flex-1'>
              <p className='truncate text-sm font-medium'>
                {inv.organization?.name ?? 'Unknown workspace'}
              </p>
              <p className='text-muted-foreground text-xs'>
                Expires {format(new Date(inv.expiresAt), 'MMM d, yyyy')}
              </p>
            </div>
            <Badge variant='outline' className='shrink-0 text-xs capitalize'>
              {inv.role}
            </Badge>
            <div className='flex shrink-0 gap-1'>
              <Button
                size='sm'
                className='h-7 text-xs'
                onClick={() => handleAccept(inv)}
                disabled={pendingAction !== null}
              >
                {isPendingAction(inv._id, 'accept') ? (
                  <Loader2 className='size-3 animate-spin' />
                ) : (
                  'Join'
                )}
              </Button>
              <Button
                size='sm'
                variant='ghost'
                className='h-7 text-xs'
                onClick={() => handleDecline(inv)}
                disabled={pendingAction !== null}
              >
                {isPendingAction(inv._id, 'decline') ? (
                  <Loader2 className='size-3 animate-spin' />
                ) : (
                  'Decline'
                )}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className='flex items-center gap-3'>
        <div className='bg-border h-px flex-1' />
        <span className='text-muted-foreground text-xs'>
          or create your own
        </span>
        <div className='bg-border h-px flex-1' />
      </div>
    </div>
  );
}

export default function OrgSetupPage() {
  return (
    <div className='flex min-h-screen items-center justify-center px-4'>
      <div className='flex w-full max-w-sm flex-col items-center gap-6'>
        <PendingInvitesList />

        <div className='w-full space-y-6'>
          <div className='space-y-1'>
            <h1 className='text-2xl font-semibold tracking-tight'>
              Create your workspace
            </h1>
            <p className='text-muted-foreground text-sm'>
              Set up a new workspace to get started.
            </p>
          </div>

          <div className='rounded-lg border p-6'>
            <OrgSetupForm />
          </div>

          <p className='text-muted-foreground text-center text-xs'>
            You can invite team members and create projects after setup.
          </p>
        </div>
      </div>
    </div>
  );
}
