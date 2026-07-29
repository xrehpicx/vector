# Collaboration Interface Research

Vector's collaboration surface is intentionally a work-focused synthesis of
Slack and Discord rather than a visual clone of either product. Calls and voice
spaces are out of scope; durable text, media, files, threads, and agent work are
in scope.

## Evidence reviewed

Primary product documentation established the current interaction models:

- Slack: [channels](https://slack.com/help/articles/360017938993-What-is-a-channel),
  [threads](https://slack.com/help/articles/115000769927-Use-threads-to-organize-discussions),
  [search](https://slack.com/help/articles/202528808-Search-in-Slack), and
  [Activity](https://slack.com/help/articles/19693583638803-Get-your-work-done-from-the-Activity-view)
- Discord: [Inbox](https://support.discord.com/hc/en-us/articles/360045027712-Inbox-FAQ),
  [search](https://support.discord.com/hc/en-us/articles/115000468588-How-to-Use-Search-on-Discord),
  [threads](https://support.discord.com/hc/en-us/articles/4403205878423-Threads-FAQ),
  [roles and permissions](https://support.discord.com/hc/en-us/articles/214836687-Discord-Roles-and-Permissions),
  [community onboarding](https://support.discord.com/hc/en-us/articles/11074987197975-Community-Onboarding-FAQ),
  and [file attachments](https://support.discord.com/hc/en-us/articles/25444343291031-File-Attachments-FAQ)

Research on workplace chat and retrieval highlighted the costs of channel
sprawl, interruption, and fragmented history:

- [Group Chat Ecology in Enterprise Instant Messaging](https://research.ibm.com/publications/group-chat-ecology-in-enterprise-instant-messaging-how-employees-collaborate-through-multi-user-chat-channels-on-slack)
- [Scalable Chat](https://echolab.cs.vt.edu/wp-content/uploads/sites/105/2024/05/CSCW__20_Poster___Scalable_Chat__Copy_.pdf)
- [Conversational Search Behaviour](https://ielab.io/publications/pdfs/sigir2024-conversations-search-behaviour.pdf)

The registered-agent model was also compared with Block's open-source
[Buzz](https://github.com/block/buzz) and its
[human-agent collaboration vision](https://block.xyz/inside/introducing-buzz-where-humans-and-agents-work-together).
ACP behavior follows the
[Agent Client Protocol v1 overview](https://agentclientprotocol.com/protocol/v1/overview).

## Product decisions

What Vector keeps from Slack:

- durable work channels and direct conversations
- message-rooted threads instead of duplicating every reply in the main stream
- permission-aware message and file search, pins, saved items, and an
  attention-oriented activity surface
- a contextual right panel that preserves the main conversation

What Vector keeps from Discord:

- visible identity and presence, including service identities
- explicit roles, private spaces, and discoverable public channels
- approachable onboarding and rich inline media
- clear channel membership for agents rather than invisible integrations

What Vector changes:

- notifications default to direct messages, mentions, replies, and followed
  threads instead of treating every channel message as urgent
- public channels are discoverable but do not accrue unread counts until joined
- Requests, Work, Tasks, Projects, and Documents remain durable lifecycle
  entities; a message can create or link them
- agent output keeps the conversation readable: the final answer appears as a
  message while plans, tools, terminal activity, files, approvals, and errors
  live in a clickable run inspector
- every agent has a visible human owner, explicit channel membership, a
  per-channel wake mode, an interaction policy, and a local folder boundary
