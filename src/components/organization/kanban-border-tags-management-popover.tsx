'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  getKanbanBorderTagSlotLabel,
  getKanbanBorderTagDisplayName,
} from '@/lib/kanban-border-tags';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  KANBAN_BORDER_COLOR_OPTIONS,
  type KanbanBorderTagSetting,
} from '@/components/issues/kanban-border-colors';

interface KanbanBorderTagsManagementPopoverProps {
  tag: KanbanBorderTagSetting;
  onSave: (tag: KanbanBorderTagSetting) => void;
  children: React.ReactNode;
}

function ColorSelector({
  colors,
  selectedColor,
  onColorSelect,
}: {
  colors: string[];
  selectedColor: string;
  onColorSelect: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          size='sm'
          className='bg-muted/30 hover:bg-muted/50 h-8 gap-2'
        >
          <div
            className='size-3 rounded-full'
            style={{ backgroundColor: selectedColor }}
          />
          Color
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-56 p-3'>
        <div className='grid grid-cols-5 gap-2'>
          {colors.map(colorOption => (
            <button
              key={colorOption}
              type='button'
              className={`size-8 rounded-md border-2 transition-all ${
                selectedColor === colorOption
                  ? 'border-foreground scale-110'
                  : 'border-border hover:scale-105'
              }`}
              style={{ backgroundColor: colorOption }}
              onClick={() => {
                onColorSelect(colorOption);
                setOpen(false);
              }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function KanbanBorderTagsManagementPopover({
  tag,
  onSave,
  children,
}: KanbanBorderTagsManagementPopoverProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);

  return (
    <Popover
      open={open}
      onOpenChange={nextOpen => {
        setOpen(nextOpen);
        if (nextOpen) {
          setName(tag.name);
          setColor(tag.color);
        }
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align='start' className='w-80 p-2'>
        <form
          className='space-y-3'
          onSubmit={event => {
            event.preventDefault();
            onSave({
              ...tag,
              name: name.trim(),
              color,
            });
            setOpen(false);
          }}
        >
          <div className='flex items-center justify-between gap-2'>
            <span className='text-muted-foreground text-xs font-medium'>
              {getKanbanBorderTagSlotLabel(tag.id)}
            </span>
            <ColorSelector
              colors={KANBAN_BORDER_COLOR_OPTIONS.map(option => option.color)}
              selectedColor={color}
              onColorSelect={setColor}
            />
          </div>

          <Input
            placeholder='Optional tag name'
            value={name}
            onChange={event => setName(event.target.value)}
            className='text-sm'
            autoFocus
          />

          <div className='flex items-center gap-2 rounded-md border px-2 py-1.5'>
            <span
              className='size-2.5 shrink-0 rounded-full'
              style={{ backgroundColor: color }}
            />
            <span className='text-xs font-medium'>
              {getKanbanBorderTagDisplayName(
                { id: tag.id, name },
                'Unnamed tag',
              )}
            </span>
          </div>

          <div className='flex items-center justify-end gap-2'>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button size='sm'>Save Changes</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
