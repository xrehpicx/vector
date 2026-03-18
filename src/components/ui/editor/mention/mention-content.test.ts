import { describe, expect, it } from 'vitest';
import {
  buildMentionContent,
  buildMentionHref,
  buildMentionText,
  type MentionContentItem,
} from './mention-content';

describe('mention content helpers', () => {
  it('builds issue mention text and href with icon metadata', () => {
    const item: MentionContentItem = {
      type: 'issue',
      label: 'RARE-RABBIT-2 tes2',
      href: '/rare/issues/RARE-RABBIT-2',
      icon: 'circle',
      color: '#3b82f6',
    };

    expect(buildMentionText(item)).toBe('RARE-RABBIT-2 tes2');
    expect(buildMentionHref(item)).toBe(
      '/rare/issues/RARE-RABBIT-2#icon=circle&color=%233b82f6',
    );
    expect(buildMentionContent(item)).toEqual([
      {
        type: 'text',
        text: 'RARE-RABBIT-2 tes2',
        marks: [
          {
            type: 'link',
            attrs: {
              href: '/rare/issues/RARE-RABBIT-2#icon=circle&color=%233b82f6',
            },
          },
        ],
      },
      {
        type: 'text',
        text: ' ',
      },
    ]);
  });

  it('adds the user mention prefix and email hash when needed', () => {
    const item: MentionContentItem = {
      type: 'user',
      label: 'rare',
      href: '/rare/people/user-1',
      email: 'rare@example.com',
    };

    expect(buildMentionText(item)).toBe('@rare');
    expect(buildMentionHref(item)).toBe(
      '/rare/people/user-1#email=rare%40example.com',
    );
  });
});
