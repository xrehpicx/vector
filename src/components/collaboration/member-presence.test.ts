import { describe, expect, it } from 'vitest';
import { resolveMemberPresence } from './member-presence';

describe('resolveMemberPresence', () => {
  it.each([
    ['online', 'online'],
    ['idle', 'away'],
    ['dnd', 'busy'],
    ['invisible', 'offline'],
    ['offline', 'offline'],
  ] as const)('maps saved %s presence to %s', (savedPresence, expected) => {
    expect(resolveMemberPresence({ savedPresence, isLive: false })).toBe(
      expected,
    );
  });

  it('shows a member with live room presence as online', () => {
    expect(resolveMemberPresence({ isLive: true })).toBe('online');
  });

  it('keeps a member without saved or live presence offline', () => {
    expect(resolveMemberPresence({ isLive: false })).toBe('offline');
  });

  it.each(['idle', 'dnd', 'invisible', 'offline'] as const)(
    'keeps explicit %s presence when the member is live',
    savedPresence => {
      expect(resolveMemberPresence({ savedPresence, isLive: true })).not.toBe(
        'online',
      );
    },
  );
});
