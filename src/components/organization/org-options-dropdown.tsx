'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown, Plus, Settings, UserPlus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePermission } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@/convex/_shared/permissions';
import { InviteDialog } from '@/components/organization/invite-dialog';

import type { Doc } from '@/convex/_generated/dataModel';

type Organization = Doc<'organizations'>;

interface OrgOptionsDropdownProps {
  currentOrgSlug: string;
  currentOrgName: string;
  currentOrgLogo?: string | null;
  organizations?: Organization[];
  compact?: boolean;
}

export function OrgOptionsDropdown({
  currentOrgSlug,
  currentOrgName,
  currentOrgLogo,
  organizations = [],
  compact = false,
}: OrgOptionsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  const { hasPermission: canManageMembers } = usePermission(
    currentOrgSlug,
    PERMISSIONS.ORG_MANAGE_MEMBERS,
  );

  const handleOrgSwitch = (orgSlug: string) => {
    if (orgSlug !== currentOrgSlug) {
      window.location.href = `/${orgSlug}/channels`;
    }
    setIsOpen(false);
  };

  const handleCreateOrg = () => {
    window.location.href = '/org-setup';
  };

  const handleSettingsClick = () => {
    setIsOpen(false);
    window.location.href = `/${currentOrgSlug}/settings`;
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={`bg-background hover:bg-accent/50 group flex items-center rounded-md border p-1 text-left transition-colors ${
            compact ? 'size-9 justify-center' : 'w-full justify-between'
          }`}
          aria-expanded={isOpen}
          aria-label={
            compact
              ? `Switch workspace. Current workspace: ${currentOrgName}`
              : undefined
          }
        >
          <div
            className={`flex min-w-0 items-center gap-2 ${
              compact ? 'justify-center' : 'flex-1'
            }`}
          >
            {currentOrgLogo ? (
              <img
                src={`/api/files/${currentOrgLogo}`}
                alt='Logo'
                className='size-5 shrink-0 rounded object-cover'
              />
            ) : (
              <div className='bg-primary text-primary-foreground flex size-5 shrink-0 items-center justify-center rounded text-xs font-semibold'>
                {currentOrgName.charAt(0).toUpperCase()}
              </div>
            )}
            {!compact ? (
              <span className='truncate text-sm font-medium'>
                {currentOrgName}
              </span>
            ) : null}
          </div>
          {!compact ? (
            <ChevronsUpDown className='size-3 shrink-0 opacity-60 transition-opacity group-hover:opacity-100' />
          ) : null}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className='w-56' align='start' sideOffset={4}>
        {/* Organization Switcher */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className='text-muted-foreground px-2 py-1 text-xs font-medium'>
            Switch Organizations
          </DropdownMenuLabel>

          {/* Current Organization */}
          <DropdownMenuItem
            className='flex cursor-pointer items-center gap-2 px-2 py-1.5'
            onClick={() => handleOrgSwitch(currentOrgSlug)}
          >
            {currentOrgLogo ? (
              <img
                src={`/api/files/${currentOrgLogo}`}
                alt='Logo'
                className='size-4 rounded object-cover'
              />
            ) : (
              <div className='bg-primary text-primary-foreground flex size-4 items-center justify-center rounded text-xs font-semibold'>
                {currentOrgName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className='flex-1 truncate text-sm'>{currentOrgName}</span>
            <Check className='text-primary size-3' />
          </DropdownMenuItem>

          {/* Other Organizations */}
          {organizations
            .filter(org => org.slug !== currentOrgSlug)
            .map(org => (
              <DropdownMenuItem
                key={org._id}
                className='flex cursor-pointer items-center gap-2 px-2 py-1.5'
                onClick={() => handleOrgSwitch(org.slug)}
              >
                {org.logo ? (
                  <img
                    src={`/api/files/${org.logo}`}
                    alt='Logo'
                    className='size-4 rounded object-cover'
                  />
                ) : (
                  <div className='bg-muted text-muted-foreground flex size-4 items-center justify-center rounded text-xs font-semibold'>
                    {org.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className='flex-1 truncate text-sm'>{org.name}</span>
              </DropdownMenuItem>
            ))}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {/* Organization Actions */}
        <DropdownMenuItem
          className='flex cursor-pointer items-center gap-2 px-2 py-1.5'
          onClick={handleSettingsClick}
        >
          <Settings className='size-4' />
          <span className='text-sm'>Organization settings</span>
        </DropdownMenuItem>

        {canManageMembers && (
          <DropdownMenuItem
            className='flex cursor-pointer items-center gap-2 px-2 py-1.5'
            onClick={() => {
              setIsOpen(false);
              setShowInviteDialog(true);
            }}
          >
            <UserPlus className='size-4' />
            <span className='text-sm'>Invite members</span>
          </DropdownMenuItem>
        )}

        {/* Create New Organization */}
        <DropdownMenuItem
          className='flex cursor-pointer items-center gap-2 px-2 py-1.5'
          onClick={handleCreateOrg}
        >
          <div className='border-muted-foreground/60 flex size-4 items-center justify-center rounded border border-dashed'>
            <Plus className='size-2.5' />
          </div>
          <span className='text-sm'>Create organization</span>
        </DropdownMenuItem>
      </DropdownMenuContent>

      {showInviteDialog && (
        <InviteDialog
          orgSlug={currentOrgSlug}
          onClose={() => setShowInviteDialog(false)}
        />
      )}
    </DropdownMenu>
  );
}
