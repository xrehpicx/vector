'use client';

import { Loader2, Mail, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export type AssistantPendingAction =
  | {
      id: string;
      kind: 'delete_entity';
      entityType: 'document' | 'issue' | 'project' | 'team' | 'folder';
      entityId: string;
      entityLabel: string;
      summary: string;
      createdAt: number;
      executed?: boolean;
    }
  | {
      id: string;
      kind: 'bulk_delete_entities';
      entityType: 'document' | 'issue' | 'project' | 'team';
      entities: Array<{ entityId: string; entityLabel: string }>;
      summary: string;
      createdAt: number;
      executed?: boolean;
    }
  | {
      id: string;
      kind: 'send_email';
      recipientName: string;
      recipientEmail: string;
      subject: string;
      body: string;
      template?: string;
      html: string;
      summary: string;
      createdAt: number;
      executed?: boolean;
    };

export function normalizePendingActions(
  value: unknown,
): AssistantPendingAction[] {
  if (!value) return [];
  return Array.isArray(value)
    ? (value as AssistantPendingAction[])
    : [value as AssistantPendingAction];
}

function actionButtonLabel(action: AssistantPendingAction) {
  if (action.kind === 'send_email') return 'Send email';
  if (action.kind === 'bulk_delete_entities') return 'Delete all';
  return 'Delete';
}

export function AssistantPendingActions({
  actions,
  variant,
  confirmingActionId,
  cancellingActionId,
  onConfirm,
  onCancel,
}: {
  actions: AssistantPendingAction[];
  variant: 'dock' | 'thread';
  confirmingActionId?: string | null;
  cancellingActionId?: string | null;
  onConfirm: (action: AssistantPendingAction) => void;
  onCancel: (action: AssistantPendingAction) => void;
}) {
  if (actions.length === 0) return null;

  return (
    <div className={cn('space-y-2', variant === 'dock' ? 'mb-1 px-2' : 'mb-2')}>
      {actions.map(action => {
        const isConfirming = confirmingActionId === action.id;
        const isCancelling = cancellingActionId === action.id;
        const isBusy = isConfirming || isCancelling;
        const isEmail = action.kind === 'send_email';

        return (
          <div
            key={action.id}
            className={cn(
              'rounded-md border px-2 py-1.5',
              isEmail
                ? 'border-amber-500/20 bg-amber-500/5'
                : 'border-[#cb706f]/20 bg-[#cb706f]/[0.03]',
            )}
          >
            <div className='flex items-start gap-2'>
              {isEmail ? (
                <Mail className='mt-0.5 size-3.5 text-amber-600/80' />
              ) : (
                <Trash2 className='mt-0.5 size-3.5 text-[#cb706f]' />
              )}
              <div className='min-w-0 flex-1'>
                <div
                  className={cn(
                    'min-w-0',
                    variant === 'dock' ? 'text-[11px]' : 'text-xs',
                  )}
                >
                  {action.summary ||
                    (action.kind === 'bulk_delete_entities'
                      ? `Delete ${action.entities.length} ${action.entityType}${action.entities.length !== 1 ? 's' : ''}`
                      : action.kind === 'delete_entity'
                        ? `Delete ${action.entityType}: ${action.entityLabel}`
                        : 'Pending action')}
                </div>
                {action.kind === 'bulk_delete_entities' &&
                action.entities.length > 0 ? (
                  <div className='text-muted-foreground mt-0.5 text-[10px]'>
                    {action.entities
                      .slice(0, 5)
                      .map(e => e.entityLabel)
                      .join(', ')}
                    {action.entities.length > 5
                      ? ` and ${action.entities.length - 5} more`
                      : ''}
                  </div>
                ) : null}
                {isEmail ? (
                  <div className='text-muted-foreground mt-0.5 text-[10px]'>
                    {action.subject} · {action.recipientEmail}
                  </div>
                ) : null}
              </div>
            </div>

            <div className='mt-1.5 flex items-center gap-1.5 pl-[22px]'>
              {isEmail ? (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      className={cn(
                        variant === 'dock'
                          ? 'h-5 px-2 text-[10px]'
                          : 'h-6 px-2.5 text-xs',
                      )}
                    >
                      Preview
                    </Button>
                  </DialogTrigger>
                  <DialogContent className='max-h-[85vh] max-w-2xl overflow-y-auto p-0'>
                    <DialogHeader className='border-b px-4 py-3'>
                      <DialogTitle className='text-sm'>
                        Email Preview — {action.subject}
                      </DialogTitle>
                    </DialogHeader>
                    <div className='bg-[#0a0a0a]'>
                      <iframe
                        srcDoc={action.html}
                        title='Email preview'
                        className='h-[500px] w-full border-0'
                        sandbox=''
                      />
                    </div>
                    <div className='text-muted-foreground border-t px-4 py-2 text-xs'>
                      To: {action.recipientName} ({action.recipientEmail})
                    </div>
                  </DialogContent>
                </Dialog>
              ) : null}

              <Button
                type='button'
                size='sm'
                variant={isEmail ? 'default' : 'destructive'}
                className={cn(
                  variant === 'dock'
                    ? 'h-5 px-2 text-[10px]'
                    : 'h-6 px-2.5 text-xs',
                )}
                disabled={isBusy}
                onClick={() => onConfirm(action)}
              >
                {isConfirming && (
                  <Loader2 className='mr-1 size-3 animate-spin' />
                )}
                {actionButtonLabel(action)}
              </Button>
              <Button
                type='button'
                size='sm'
                variant='ghost'
                className={cn(
                  'text-muted-foreground',
                  variant === 'dock'
                    ? 'h-5 px-2 text-[10px]'
                    : 'h-6 px-2.5 text-xs',
                )}
                disabled={isBusy}
                onClick={() => onCancel(action)}
              >
                {isCancelling && (
                  <Loader2 className='mr-1 size-3 animate-spin' />
                )}
                Cancel
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
