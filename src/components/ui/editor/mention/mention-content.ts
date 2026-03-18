import { getMentionType } from './mention-config';
import type { MentionTypeId } from './mention-config';

export type MentionContentItem = {
  type: MentionTypeId;
  label: string;
  href: string;
  email?: string;
  icon?: string | null;
  color?: string | null;
};

export function buildMentionText(item: MentionContentItem) {
  const config = getMentionType(item.type);
  const prefix = config?.textPrefix ?? '';
  return `${prefix}${item.label}`;
}

export function buildMentionHref(item: MentionContentItem) {
  const config = getMentionType(item.type);
  if (!config) return item.href;

  const params = new URLSearchParams();
  if (config.hashEncoding === 'email' && item.email) {
    params.set('email', item.email);
  } else if (config.hashEncoding === 'icon') {
    if (item.icon) params.set('icon', item.icon);
    if (item.color) params.set('color', item.color);
  }

  const hash = params.toString();
  return hash ? `${item.href}#${hash}` : item.href;
}

export function buildMentionContent(item: MentionContentItem) {
  return [
    {
      type: 'text',
      text: buildMentionText(item),
      marks: [
        {
          type: 'link',
          attrs: {
            href: buildMentionHref(item),
          },
        },
      ],
    },
    {
      type: 'text',
      text: ' ',
    },
  ];
}
