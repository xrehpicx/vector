import { describe, expect, it } from 'vitest';
import { toCollaborationMessage, type MessageView } from './adapters';

function messageView(options?: {
  actorKind?: 'user' | 'agent';
  authorUserId?: string;
  deletedAt?: number;
}): MessageView {
  return {
    message: {
      _id: 'message-1',
      _creationTime: 1,
      organizationId: 'org-1',
      channelId: 'channel-1',
      actorKind: options?.actorKind ?? 'user',
      authorUserId: options?.authorUserId ?? 'author-1',
      authorAgentId: options?.actorKind === 'agent' ? 'agent-1' : undefined,
      body: 'Message body',
      format: 'markdown',
      mentionedUserIds: [],
      mentionedAgentIds: [],
      replyCount: 0,
      deletedAt: options?.deletedAt,
      createdAt: 1,
    },
    authorUser: null,
    authorAgent: null,
    attachments: [],
    reactions: [],
    pin: null,
    saved: false,
    following: false,
  } as unknown as MessageView;
}

function adapt(
  view: MessageView,
  options?: { currentUserId?: string; canModerateMessages?: boolean },
) {
  return toCollaborationMessage({
    view,
    currentUserId: options?.currentUserId,
    canModerateMessages: options?.canModerateMessages,
    agents: [],
    runs: [],
  });
}

describe('collaboration message permissions', () => {
  it('lets authors delete their own message', () => {
    expect(adapt(messageView(), { currentUserId: 'author-1' }).canDelete).toBe(
      true,
    );
  });

  it('lets message moderators delete another user or agent message', () => {
    expect(
      adapt(messageView(), {
        currentUserId: 'moderator-1',
        canModerateMessages: true,
      }).canDelete,
    ).toBe(true);
    expect(
      adapt(messageView({ actorKind: 'agent' }), {
        currentUserId: 'moderator-1',
        canModerateMessages: true,
      }).canDelete,
    ).toBe(true);
  });

  it('does not offer deletion without ownership or moderation permission', () => {
    expect(adapt(messageView(), { currentUserId: 'member-1' }).canDelete).toBe(
      false,
    );
  });

  it('never offers deletion for an already deleted message', () => {
    expect(
      adapt(messageView({ deletedAt: 2 }), {
        currentUserId: 'moderator-1',
        canModerateMessages: true,
      }).canDelete,
    ).toBe(false);
  });
});
