import type { CollaborationUser } from './types';

type SavedPresence = 'online' | 'idle' | 'dnd' | 'invisible' | 'offline';

export function resolveMemberPresence({
  savedPresence,
  isLive,
}: {
  savedPresence?: SavedPresence;
  isLive: boolean;
}): NonNullable<CollaborationUser['presence']> {
  switch (savedPresence) {
    case 'idle':
      return 'away';
    case 'dnd':
      return 'busy';
    case 'invisible':
    case 'offline':
      return 'offline';
    case 'online':
      return 'online';
    default:
      return isLive ? 'online' : 'offline';
  }
}
