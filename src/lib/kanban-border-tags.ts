export const KANBAN_BORDER_COLOR_OPTIONS = [
  { value: 'tag-1', label: 'Rose', color: '#f43f5e' },
  { value: 'tag-2', label: 'Orange', color: '#f97316' },
  { value: 'tag-3', label: 'Amber', color: '#f59e0b' },
  { value: 'tag-4', label: 'Lime', color: '#84cc16' },
  { value: 'tag-5', label: 'Emerald', color: '#10b981' },
  { value: 'tag-6', label: 'Cyan', color: '#06b6d4' },
  { value: 'tag-7', label: 'Sky', color: '#0ea5e9' },
  { value: 'tag-8', label: 'Blue', color: '#3b82f6' },
  { value: 'tag-9', label: 'Violet', color: '#8b5cf6' },
  { value: 'tag-10', label: 'Pink', color: '#ec4899' },
] as const;

const LEGACY_KANBAN_BORDER_COLOR_MAP = {
  rose: 'tag-1',
  orange: 'tag-2',
  amber: 'tag-3',
  emerald: 'tag-5',
  sky: 'tag-7',
  violet: 'tag-9',
} as const;

export type KanbanBorderColor =
  (typeof KANBAN_BORDER_COLOR_OPTIONS)[number]['value'];

export type KanbanBorderTagSetting = {
  id: KanbanBorderColor;
  name: string;
  color: string;
};

export function getKanbanBorderTagSlotLabel(
  value: string | null | undefined,
): string {
  const normalizedValue = normalizeKanbanBorderColor(value);
  if (!normalizedValue) {
    return 'Tag';
  }

  return `Tag ${normalizedValue.replace('tag-', '')}`;
}

export function getKanbanBorderTagDisplayName(
  tag: Pick<KanbanBorderTagSetting, 'id' | 'name'>,
  fallbackLabel?: string,
): string {
  const trimmedName = tag.name.trim();
  return trimmedName || fallbackLabel || getKanbanBorderTagSlotLabel(tag.id);
}

export function isKanbanBorderColor(
  value: string | null | undefined,
): value is KanbanBorderColor {
  return KANBAN_BORDER_COLOR_OPTIONS.some(option => option.value === value);
}

export function normalizeKanbanBorderColor(
  value: string | null | undefined,
): KanbanBorderColor | null {
  if (!value) return null;
  if (isKanbanBorderColor(value)) return value;
  return LEGACY_KANBAN_BORDER_COLOR_MAP[
    value as keyof typeof LEGACY_KANBAN_BORDER_COLOR_MAP
  ]
    ? LEGACY_KANBAN_BORDER_COLOR_MAP[
        value as keyof typeof LEGACY_KANBAN_BORDER_COLOR_MAP
      ]
    : null;
}

export function getKanbanBorderColorHex(
  value: string | null | undefined,
): string | null {
  const normalizedValue = normalizeKanbanBorderColor(value);
  const option = KANBAN_BORDER_COLOR_OPTIONS.find(
    item => item.value === normalizedValue,
  );
  return option?.color ?? null;
}

export function getDefaultKanbanBorderTags(): KanbanBorderTagSetting[] {
  return KANBAN_BORDER_COLOR_OPTIONS.map(option => ({
    id: option.value,
    name: '',
    color: option.color,
  }));
}

function hasLegacyDefaultTagNames(
  tags: readonly Partial<KanbanBorderTagSetting>[] | null | undefined,
): boolean {
  if (!tags?.length) {
    return false;
  }

  return KANBAN_BORDER_COLOR_OPTIONS.every(option => {
    const currentTag = tags.find(tag => tag.id === option.value);
    return currentTag?.name?.trim() === option.label;
  });
}

export function normalizeKanbanBorderTags(
  tags: readonly Partial<KanbanBorderTagSetting>[] | null | undefined,
): KanbanBorderTagSetting[] {
  const defaultTags = getDefaultKanbanBorderTags();
  const shouldDropLegacyNames = hasLegacyDefaultTagNames(tags);

  return defaultTags.map(defaultTag => {
    const currentTag = tags?.find(tag => tag.id === defaultTag.id);
    const rawName = currentTag?.name?.trim();
    const name =
      shouldDropLegacyNames &&
      rawName ===
        KANBAN_BORDER_COLOR_OPTIONS.find(
          option => option.value === defaultTag.id,
        )?.label
        ? ''
        : rawName;
    const color = currentTag?.color?.trim();

    return {
      id: defaultTag.id,
      name: name ?? defaultTag.name,
      color: color || defaultTag.color,
    };
  });
}

export function getKanbanBorderTag(
  tags: readonly KanbanBorderTagSetting[] | null | undefined,
  value: string | null | undefined,
): KanbanBorderTagSetting | null {
  const normalizedValue = normalizeKanbanBorderColor(value);
  if (!normalizedValue) return null;

  const normalizedTags = normalizeKanbanBorderTags(tags);
  return normalizedTags.find(tag => tag.id === normalizedValue) ?? null;
}

export function getDefinedKanbanBorderTags(
  tags: readonly Partial<KanbanBorderTagSetting>[] | null | undefined,
): KanbanBorderTagSetting[] {
  return normalizeKanbanBorderTags(tags).filter(
    tag => tag.name.trim().length > 0,
  );
}
