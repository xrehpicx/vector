'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/user-avatar';
import { DynamicIcon } from '@/lib/dynamic-icons';

interface GroupSectionProps {
  label: string;
  count: number;
  /** Icon name for DynamicIcon (status, priority, etc.) */
  icon?: string | null;
  color?: string | null;
  /** Avatar data for person-based groups */
  avatar?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function GroupSection({
  label,
  count,
  icon,
  color,
  avatar,
  defaultOpen = true,
  children,
}: GroupSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type='button'
        onClick={() => setOpen(o => !o)}
        className='bg-muted/40 hover:bg-muted/70 flex w-full items-center gap-2 border-b px-3 py-1.5 transition-colors'
      >
        <ChevronRight
          className={cn(
            'text-muted-foreground size-3.5 shrink-0 transition-transform duration-200 ease-out',
            open && 'rotate-90',
          )}
        />
        {avatar ? (
          <UserAvatar
            name={avatar.name}
            email={avatar.email}
            image={avatar.image}
            size='sm'
            className='size-5'
          />
        ) : icon ? (
          <DynamicIcon
            name={icon}
            className='size-4 shrink-0'
            style={color ? { color } : undefined}
          />
        ) : null}
        <span className='text-sm font-medium'>{label}</span>
        <span className='text-muted-foreground text-xs'>{count}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className='overflow-hidden'
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
