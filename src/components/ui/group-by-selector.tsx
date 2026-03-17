'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import {
  Command,
  CommandList,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import { Check, Rows3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GroupBySelectorProps<T extends string> {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function GroupBySelector<T extends string>({
  options,
  value,
  onChange,
  className,
}: GroupBySelectorProps<T>) {
  const [open, setOpen] = useState(false);
  const activeLabel = options.find(o => o.value === value)?.label;
  const hasGrouping = value !== ('none' as T);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          size='sm'
          className={cn('bg-muted/30 hover:bg-muted/50 h-8 gap-2', className)}
        >
          <Rows3 className='h-3 w-3' />
          {hasGrouping && activeLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-44 p-0'>
        <Command>
          <CommandList>
            <CommandGroup>
              {options.map(option => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className='gap-2 text-xs'
                >
                  <Check
                    className={cn(
                      'size-3',
                      value === option.value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
