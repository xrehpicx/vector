'use client';

import { useQuery } from 'convex/react';
import { api } from '@/lib/convex';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ChevronsUpDown, LogOut, User, Settings } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';

export function UserMenu() {
  const user = useQuery(api.users.currentUser);
  const router = useRouter();

  if (user === undefined || user === null) {
    return null;
  }

  const handleSignOut = async () => {
    await authClient.signOut();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' className='w-full justify-start gap-2 p-2'>
          <Avatar className='size-6'>
            {user.image && <AvatarImage src={user.image} alt={user.name} />}
            <AvatarFallback className='text-xs'>
              {user.name?.[0]}
            </AvatarFallback>
          </Avatar>
          <div className='flex min-w-0 flex-col items-start'>
            <span className='truncate text-sm font-medium'>{user.name}</span>
          </div>
          <ChevronsUpDown className='text-muted-foreground ml-auto size-3.5' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-48' align='end' forceMount>
        <DropdownMenuLabel className='pb-0 text-xs font-normal'>
          <span className='text-muted-foreground'>{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/settings/profile')}>
          <User className='mr-2 size-3.5' />
          <span>Profile</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push('/settings')}>
          <Settings className='mr-2 size-3.5' />
          <span>Settings</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void handleSignOut()}>
          <LogOut className='mr-2 size-3.5' />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
