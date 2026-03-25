'use client';

import { api, useCachedQuery } from '@/lib/convex';
import { useMutation } from 'convex/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  ChevronsUpDown,
  LogOut,
  Moon,
  Settings,
  Shield,
  Sun,
  User,
  SmilePlus,
  X,
} from 'lucide-react';
import { useRouter } from 'nextjs-toploader/app';
import { UserAvatar } from '@/components/user-avatar';
import { useTheme } from 'next-themes';
import {
  type PresenceStatus,
  getPresenceColor,
  getPresenceLabel,
} from '@/components/user-status-indicator';
import { cn } from '@/lib/utils';

const PRESENCE_OPTIONS: {
  value: 'online' | 'idle' | 'dnd' | 'invisible';
  description: string;
}[] = [
  { value: 'online', description: 'You are visible to others' },
  { value: 'idle', description: 'You appear as away' },
  { value: 'dnd', description: 'Suppress notifications' },
  { value: 'invisible', description: 'Appear offline to others' },
];

export function UserMenu() {
  const user = useCachedQuery(api.users.currentUser);
  const status = useCachedQuery(api.status.getCurrentUserStatus);
  const setPresence = useMutation(api.status.setPresence);
  const clearCustomStatus = useMutation(api.status.clearCustomStatus);
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  if (user === undefined || user === null) {
    return null;
  }

  const currentPresence: PresenceStatus = status?.presence ?? 'online';
  const hasCustomStatus = status?.customText || status?.customEmoji;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' className='w-full justify-start gap-2 p-2'>
          <UserAvatar
            name={user.name}
            email={user.email}
            image={user.image}
            userId={user._id}
            size='sm'
            showStatus
            presence={currentPresence}
          />
          <div className='flex min-w-0 flex-col items-start'>
            <span className='truncate text-sm font-medium'>{user.name}</span>
          </div>
          <ChevronsUpDown className='text-muted-foreground ml-auto size-3.5' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56' align='end'>
        <DropdownMenuGroup>
          <DropdownMenuLabel className='pb-0 text-xs font-normal'>
            <span className='text-muted-foreground'>{user.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        {/* Status section */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span
              className={cn(
                'mr-2 inline-block size-2.5 shrink-0 rounded-full',
                getPresenceColor(currentPresence),
              )}
            />
            <span>{getPresenceLabel(currentPresence)}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className='w-48'>
            {PRESENCE_OPTIONS.map(opt => (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => void setPresence({ presence: opt.value })}
              >
                <span
                  className={cn(
                    'mr-2 inline-block size-2.5 shrink-0 rounded-full',
                    getPresenceColor(opt.value),
                  )}
                />
                <div className='min-w-0 flex-1'>
                  <div className='text-sm'>{getPresenceLabel(opt.value)}</div>
                  <div className='text-muted-foreground text-[10px]'>
                    {opt.description}
                  </div>
                </div>
                {currentPresence === opt.value && (
                  <span className='text-muted-foreground ml-auto text-[10px]'>
                    Current
                  </span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {hasCustomStatus ? (
          <DropdownMenuItem
            onClick={() => void clearCustomStatus()}
            className='gap-2'
          >
            <X className='size-3.5' />
            <span className='flex-1 truncate'>
              Clear {status?.customEmoji} {status?.customText}
            </span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={() => router.push('/settings/profile')}
            className='gap-2'
          >
            <SmilePlus className='size-3.5' />
            <span>Set custom status</span>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/settings/profile')}>
          <User className='mr-2 size-3.5' />
          <span>Profile</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push('/settings')}>
          <Settings className='mr-2 size-3.5' />
          <span>Settings</span>
        </DropdownMenuItem>
        {user.role === 'platform_admin' ? (
          <DropdownMenuItem onClick={() => router.push('/admin')}>
            <Shield className='mr-2 size-3.5' />
            <span>Platform Admin</span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => setTheme(isDark ? 'light' : 'dark')}>
          {isDark ? (
            <Sun className='mr-2 size-3.5' />
          ) : (
            <Moon className='mr-2 size-3.5' />
          )}
          <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/auth/sign-out')}>
          <LogOut className='mr-2 size-3.5' />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
