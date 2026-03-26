import { describe, expect, it } from 'vitest';

import {
  KANBAN_BORDER_COLOR_OPTIONS,
  getDefinedKanbanBorderTags,
  getDefaultKanbanBorderTags,
  getKanbanBorderColorHex,
  getKanbanBorderTagDisplayName,
  isKanbanBorderColor,
  normalizeKanbanBorderTags,
} from './kanban-border-colors';

describe('kanban border colors', () => {
  it('defines the 10 configurable kanban tag slots', () => {
    expect(KANBAN_BORDER_COLOR_OPTIONS.map(option => option.value)).toEqual([
      'tag-1',
      'tag-2',
      'tag-3',
      'tag-4',
      'tag-5',
      'tag-6',
      'tag-7',
      'tag-8',
      'tag-9',
      'tag-10',
    ]);
  });

  it('starts the configurable tag slots unnamed by default', () => {
    expect(getDefaultKanbanBorderTags()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'tag-1', name: '' }),
        expect.objectContaining({ id: 'tag-10', name: '' }),
      ]),
    );
  });

  it('falls back to the slot label when a tag has no custom name', () => {
    expect(
      getKanbanBorderTagDisplayName({
        id: 'tag-4',
        name: '   ',
      }),
    ).toBe('Tag 4');
  });

  it('drops the old seeded color names when loading legacy defaults', () => {
    expect(
      normalizeKanbanBorderTags([
        { id: 'tag-1', name: 'Rose', color: '#f43f5e' },
        { id: 'tag-2', name: 'Orange', color: '#f97316' },
        { id: 'tag-3', name: 'Amber', color: '#f59e0b' },
        { id: 'tag-4', name: 'Lime', color: '#84cc16' },
        { id: 'tag-5', name: 'Emerald', color: '#10b981' },
        { id: 'tag-6', name: 'Cyan', color: '#06b6d4' },
        { id: 'tag-7', name: 'Sky', color: '#0ea5e9' },
        { id: 'tag-8', name: 'Blue', color: '#3b82f6' },
        { id: 'tag-9', name: 'Violet', color: '#8b5cf6' },
        { id: 'tag-10', name: 'Pink', color: '#ec4899' },
      ]).map(tag => tag.name),
    ).toEqual(['', '', '', '', '', '', '', '', '', '']);
  });

  it('treats only named tags as selectable on the board', () => {
    expect(
      getDefinedKanbanBorderTags([
        { id: 'tag-1', name: '', color: '#f43f5e' },
        { id: 'tag-2', name: 'Bug', color: '#f97316' },
        { id: 'tag-3', name: '  ', color: '#f59e0b' },
      ]).map(tag => tag.id),
    ).toEqual(['tag-2']);
  });

  it('maps a configured tag to its hex value', () => {
    expect(getKanbanBorderColorHex('tag-10')).toBe('#ec4899');
  });

  it('maps legacy hardcoded colors to the new slot defaults', () => {
    expect(getKanbanBorderColorHex('violet')).toBe('#8b5cf6');
  });

  it('rejects unsupported colors', () => {
    expect(isKanbanBorderColor('magenta')).toBe(false);
    expect(getKanbanBorderColorHex('magenta')).toBeNull();
  });
});
