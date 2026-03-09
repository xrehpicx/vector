'use client';

import { useQuery, useMutation } from 'convex/react';
import { api } from '@/lib/convex';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import type { Id } from '@/convex/_generated/dataModel';

const header = (
  <div className='border-b'>
    <div className='flex items-center p-1 pl-8 lg:pl-1'>
      <span className='flex items-center gap-1.5 px-3 text-xs font-medium'>
        <Mail className='size-3.5' />
        Invitations
      </span>
    </div>
  </div>
);

export default function InvitesPage() {
  const invites = useQuery(api.users.getPendingInvitations);
  const acceptInvite = useMutation(
    api.organizations.mutations.acceptInvitation,
  );
  const declineInvite = useMutation(
    api.organizations.mutations.declineInvitation,
  );
  const [pendingAction, setPendingAction] = useState<{
    inviteId: Id<'invitations'>;
    type: 'accept' | 'decline';
  } | null>(null);

  const isPendingAction = (
    inviteId: Id<'invitations'>,
    type: 'accept' | 'decline',
  ) => pendingAction?.inviteId === inviteId && pendingAction.type === type;

  const handleAccept = async (inviteId: Id<'invitations'>) => {
    setPendingAction({ inviteId, type: 'accept' });
    try {
      await acceptInvite({ inviteId });
      toast.success('Invitation accepted');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPendingAction(null);
    }
  };

  const handleDecline = async (inviteId: Id<'invitations'>) => {
    setPendingAction({ inviteId, type: 'decline' });
    try {
      await declineInvite({ inviteId });
      toast.info('Invitation declined');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPendingAction(null);
    }
  };

  if (invites === undefined) {
    return (
      <div className='bg-background h-full'>
        {header}
        <div className='divide-y'>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className='flex items-center gap-3 px-3 py-2'>
              <div className='min-w-0 flex-1 space-y-1'>
                <Skeleton className='h-4 w-36' />
                <Skeleton className='h-3 w-24' />
              </div>
              <Skeleton className='h-5 w-14 rounded-full' />
              <Skeleton className='h-3 w-16' />
              <div className='flex gap-1'>
                <Skeleton className='h-6 w-16 rounded-md' />
                <Skeleton className='h-6 w-16 rounded-md' />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className='bg-background h-full'>
      {header}

      {invites.length === 0 ? (
        <div className='text-muted-foreground flex items-center justify-center py-12 text-sm'>
          No pending invitations
        </div>
      ) : (
        <div className='divide-y'>
          {invites.map(inv => (
            <div
              key={inv._id}
              className='flex flex-wrap items-center gap-2 px-3 py-2 sm:flex-nowrap sm:gap-3'
            >
              <div className='min-w-0 flex-1'>
                <p className='truncate text-sm font-medium'>
                  {inv.organization?.name ?? 'Unknown Organization'}
                </p>
                <p className='text-muted-foreground text-xs'>
                  Invited {format(new Date(inv._creationTime), 'MMM d, yyyy')}
                </p>
              </div>

              <Badge variant='outline' className='text-xs capitalize'>
                {inv.role}
              </Badge>

              <div className='text-muted-foreground hidden text-xs sm:block'>
                Expires {format(new Date(inv.expiresAt), 'MMM d')}
              </div>

              <div className='flex gap-1'>
                <Button
                  size='sm'
                  className='h-6 text-xs'
                  onClick={() => handleAccept(inv._id)}
                  disabled={pendingAction !== null}
                >
                  {isPendingAction(inv._id, 'accept') ? (
                    <Loader2 className='size-3 animate-spin' />
                  ) : (
                    'Accept'
                  )}
                </Button>
                <Button
                  size='sm'
                  variant='ghost'
                  className='h-6 text-xs'
                  onClick={() => handleDecline(inv._id)}
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
      )}
    </div>
  );
}
