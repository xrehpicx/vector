'use client';

import { useQuery } from 'convex/react';
import { api } from '@/lib/convex';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { UserAvatar } from '@/components/user-avatar';
import { useTheme } from 'next-themes';

export function UserMenu() {
  const user = useQuery(api.users.currentUser);
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  if (user === undefined || user === null) {
    return null;
  }

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
          />
          <div className='flex min-w-0 flex-col items-start'>
            <span className='truncate text-sm font-medium'>{user.name}</span>
          </div>
          <ChevronsUpDown className='text-muted-foreground ml-auto size-3.5' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-48' align='end'>
        <DropdownMenuGroup>
          <DropdownMenuLabel className='pb-0 text-xs font-normal'>
            <span className='text-muted-foreground'>{user.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
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
