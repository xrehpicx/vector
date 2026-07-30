import Foundation

@MainActor
enum VectorMockData {
  static let raj = VectorUser(
    id: "user-raj",
    name: "raj",
    email: "raj@example.com",
    status: VectorUserStatus(presence: .online, customText: "Building Vector iOS", customEmoji: "V")
  )
  static let maya = VectorUser(
    id: "user-maya",
    name: "Maya",
    email: "maya@example.com",
    status: VectorUserStatus(presence: .idle)
  )

  static let issueStates = [
    VectorState(id: "state-done", name: "Done", type: "done", position: 4, color: "#10b981", icon: "check-circle"),
    VectorState(id: "state-progress", name: "In Progress", type: "in_progress", position: 3, color: "#f59e0b", icon: "loader"),
    VectorState(id: "state-todo", name: "To Do", type: "todo", position: 2, color: "#94a3b8", icon: "circle"),
  ]

  static let priorities = [
    VectorPriority(id: "priority-high", name: "High", weight: 3, color: "#ef4444", icon: "signal-high"),
    VectorPriority(id: "priority-medium", name: "Medium", weight: 2, color: "#f59e0b", icon: "signal-medium"),
    VectorPriority(id: "priority-low", name: "Low", weight: 1, color: "#64748b", icon: "signal-low"),
  ]

  static let projectStatuses = [
    VectorProjectStatus(id: "project-status-progress", name: "In Progress", type: "in_progress", position: 2, color: "#0ea5e9", icon: "activity"),
    VectorProjectStatus(id: "project-status-planned", name: "Planned", type: "planned", position: 1, color: "#8b5cf6", icon: "calendar"),
  ]

  static let projects = [
    VectorProject(
      id: "project-roadmap",
      key: "ROADMAP",
      name: "IMAI Roadmap",
      description: "Roadmap for imai.studio",
      icon: "map",
      color: "#0ea5e9",
      lead: raj,
      status: projectStatuses[0],
      creationTime: 1_774_450_000_000
    ),
    VectorProject(
      id: "project-agent",
      key: "AGENT",
      name: "Design Agent",
      description: "Agent workflows for product ideation",
      icon: "sparkles",
      color: "#8b5cf6",
      lead: maya,
      status: projectStatuses[1],
      creationTime: 1_774_100_000_000
    ),
  ]

  static let teams = [
    VectorTeam(
      id: "team-product",
      key: "PROD",
      name: "Product",
      description: "Product direction and execution",
      icon: "box",
      color: "#0ea5e9",
      lead: raj,
      memberCount: 5,
      creationTime: 1_774_300_000_000
    ),
    VectorTeam(
      id: "team-design",
      key: "DSGN",
      name: "Design",
      description: "Brand, UI, and interaction design",
      icon: "palette",
      color: "#ec4899",
      lead: maya,
      memberCount: 4,
      creationTime: 1_774_200_000_000
    ),
  ]

  static let documents = [
    VectorDocument(
      id: "doc-mobile-plan",
      title: "Mobile launch notes",
      content: "Native review notes for the iOS app.",
      icon: "file-text",
      color: "#0ea5e9",
      team: VectorTeamSummary(id: "team-product", name: "Product", key: "PROD", icon: "box", color: "#0ea5e9"),
      project: VectorProjectSummary(id: "project-roadmap", name: "IMAI Roadmap", key: "ROADMAP", icon: "map", color: "#0ea5e9"),
      author: raj,
      creationTime: 1_774_580_000_000,
      lastEditedAt: 1_774_590_000_000
    ),
    VectorDocument(
      id: "doc-design",
      title: "Design references",
      content: "Reference notes for the Vector interface.",
      icon: "palette",
      color: "#ec4899",
      team: VectorTeamSummary(id: "team-design", name: "Design", key: "DSGN", icon: "palette", color: "#ec4899"),
      project: VectorProjectSummary(id: "project-agent", name: "Design Agent", key: "AGENT", icon: "sparkles", color: "#8b5cf6"),
      author: maya,
      creationTime: 1_774_520_000_000,
      lastEditedAt: 1_774_540_000_000
    ),
  ]

  static let issues = [
    VectorIssueRow(
      id: "issue-5",
      key: "ROADMAP-5",
      title: "Advanced technical blueprint flow",
      description: "Turn product plans into implementation-ready blueprints.",
      projectId: "project-roadmap",
      projectKey: "ROADMAP",
      teamId: "team-product",
      teamKey: "PROD",
      priorityId: "priority-high",
      priorityName: "High",
      priorityIcon: "signal-high",
      priorityColor: "#ef4444",
      workflowStateId: "state-done",
      workflowStateName: "Done",
      workflowStateIcon: "check-circle",
      workflowStateColor: "#10b981",
      workflowStateType: "done",
      reporterName: "raj",
      assigneeId: "user-raj",
      assigneeName: "raj",
      assigneeEmail: "raj@example.com",
      dueDate: "2026-07-08",
      lastActivityEventType: "comment_added",
      linkedPrs: [VectorPullRequestSummary(number: 42, state: "open", url: "https://github.com/xrehpicx/vector/pull/42")],
      canEdit: true,
      creationTime: 1_774_450_000_000,
      updatedAt: 1_774_550_000_000
    ),
    VectorIssueRow(
      id: "issue-6",
      key: "ROADMAP-6",
      title: "Catalog data creation flow",
      description: "A guided flow for structured product catalog data.",
      projectId: "project-roadmap",
      projectKey: "ROADMAP",
      teamId: "team-design",
      teamKey: "DSGN",
      priorityId: "priority-medium",
      priorityName: "Medium",
      priorityIcon: "signal-medium",
      priorityColor: "#f59e0b",
      workflowStateId: "state-progress",
      workflowStateName: "In Progress",
      workflowStateIcon: "loader",
      workflowStateColor: "#f59e0b",
      workflowStateType: "in_progress",
      reporterName: "Maya",
      assigneeId: "user-maya",
      assigneeName: "Maya",
      assigneeEmail: "maya@example.com",
      dueDate: "2026-07-15",
      lastActivityEventType: "status_changed",
      canEdit: true,
      creationTime: 1_774_350_000_000,
      updatedAt: 1_774_500_000_000
    ),
    VectorIssueRow(
      id: "issue-3",
      key: "ROADMAP-3",
      title: "Long-form video agent for product content",
      description: "Support long-form product video generation workflows.",
      projectId: "project-agent",
      projectKey: "AGENT",
      teamId: "team-design",
      teamKey: "DSGN",
      priorityId: "priority-low",
      priorityName: "Low",
      priorityIcon: "signal-low",
      priorityColor: "#64748b",
      workflowStateId: "state-todo",
      workflowStateName: "To Do",
      workflowStateIcon: "circle",
      workflowStateColor: "#94a3b8",
      workflowStateType: "todo",
      reporterName: "raj",
      assigneeId: nil,
      assigneeName: nil,
      dueDate: nil,
      lastActivityEventType: "created",
      canEdit: true,
      creationTime: 1_774_250_000_000,
      updatedAt: 1_774_250_000_000
    ),
  ]

  static let comments = [
    VectorComment(
      id: "comment-1",
      body: "The native app should keep this flow focused on review and quick updates.",
      author: raj,
      creationTime: 1_774_560_000_000
    ),
    VectorComment(
      id: "comment-2",
      body: "For deeper editing, opening the web route is fine.",
      author: maya,
      creationTime: 1_774_565_000_000
    ),
  ]

  static let workspaceOptions = VectorWorkspaceOptions(
    members: [
      VectorWorkspaceMember(id: "member-raj", userId: raj.id, user: raj, role: "admin"),
      VectorWorkspaceMember(id: "member-maya", userId: maya.id, user: maya, role: "member"),
    ],
    teams: teams,
    projects: projects,
    issueStates: issueStates,
    issuePriorities: priorities,
    projectStatuses: projectStatuses
  )

  static let activityItems = [
    VectorActivityItem(
      id: "activity-comment",
      entityType: "issue",
      eventType: "issue_comment_added",
      actor: maya,
      target: VectorActivityTarget(type: "issue", id: "issue-5", key: "ROADMAP-5", name: "Advanced technical blueprint flow"),
      details: VectorActivityDetails(commentId: "comment-2", commentPreview: "For deeper editing, opening the web route is fine."),
      createdAt: 1_774_565_000_000
    ),
    VectorActivityItem(
      id: "activity-status",
      entityType: "issue",
      eventType: "issue_workflow_state_changed",
      actor: raj,
      target: VectorActivityTarget(type: "issue", id: "issue-5", key: "ROADMAP-5", name: "Advanced technical blueprint flow"),
      details: VectorActivityDetails(field: "workflow_state", fromLabel: "In Progress", toLabel: "Done"),
      createdAt: 1_774_550_000_000
    ),
  ]

  static let inboxNotifications = [
    VectorInboxNotification(
      id: "notification-comment",
      category: .comments,
      eventType: "issue_comment_on_assigned_issue",
      title: "Maya commented on ROADMAP-5",
      body: "For deeper editing, opening the web route is fine.",
      href: "/demo/issues/ROADMAP-5",
      actorId: maya.id,
      actorName: maya.name,
      actorImage: maya.image,
      createdAt: 1_774_565_000_000
    ),
    VectorInboxNotification(
      id: "notification-assignment",
      category: .assignments,
      eventType: "issue_assigned",
      title: "Assigned to ROADMAP-6",
      body: "Catalog data creation flow",
      href: "/demo/issues/ROADMAP-6",
      actorId: raj.id,
      actorName: raj.name,
      actorImage: raj.image,
      createdAt: 1_774_550_000_000
    ),
  ]

  static let collaborationChannels = [
    VectorChannelListItem(
      channel: VectorChannel(
        id: "channel-general",
        kind: .public,
        name: "general",
        slug: "general",
        topic: "Company-wide updates and conversation",
        description: "Everyone in the workspace",
        isDefault: true,
        lastMessageAt: 1_774_590_000_000,
        createdAt: 1_774_000_000_000,
        updatedAt: 1_774_590_000_000
      ),
      membership: nil,
      unreadCount: 3
    ),
    VectorChannelListItem(
      channel: VectorChannel(
        id: "channel-product",
        kind: .public,
        name: "product",
        slug: "product",
        topic: "Product decisions, demos, and launch notes",
        lastMessageAt: 1_774_585_000_000,
        createdAt: 1_774_100_000_000,
        updatedAt: 1_774_585_000_000
      ),
      membership: nil,
      unreadCount: 0
    ),
    VectorChannelListItem(
      channel: VectorChannel(
        id: "channel-maya",
        kind: .direct,
        name: "Maya",
        slug: "dm-maya",
        topic: "Direct message",
        lastMessageAt: 1_774_580_000_000,
        createdAt: 1_774_200_000_000,
        updatedAt: 1_774_580_000_000
      ),
      membership: nil,
      unreadCount: 1
    ),
  ]

  static let collaborationAgent = VectorRegisteredAgent(
    id: "agent-design",
    ownerUserId: raj.id,
    name: "Design Agent",
    handle: "design-agent",
    description: "Reviews interfaces and follows up with implementation notes.",
    provider: "codex",
    defaultFolder: "/workspace/vector",
    lifecycleStatus: "ready"
  )

  static let collaborationMessages = [
    VectorMessageView(
      message: VectorChannelMessage(
        id: "message-welcome",
        channelId: "channel-general",
        actorKind: "user",
        authorUserId: maya.id,
        body: "Welcome to the native collaboration workspace. Share an update, attach media, or mention @design-agent.",
        replyCount: 2,
        lastReplyAt: 1_774_581_000_000,
        createdAt: 1_774_570_000_000
      ),
      authorUser: maya,
      authorAgent: nil
    ),
    VectorMessageView(
      message: VectorChannelMessage(
        id: "message-agent",
        channelId: "channel-general",
        actorKind: "agent",
        authorAgentId: collaborationAgent.id,
        body: "I’m connected to Raj’s Mac and ready to help from the Vector workspace.",
        replyToMessageId: "message-welcome",
        createdAt: 1_774_580_000_000
      ),
      authorUser: nil,
      authorAgent: VectorMessageAgentAuthor(
        id: collaborationAgent.id,
        name: collaborationAgent.name,
        handle: collaborationAgent.handle,
        avatar: collaborationAgent.avatar,
        ownerUserId: collaborationAgent.ownerUserId,
        provider: collaborationAgent.provider,
        lifecycleStatus: collaborationAgent.lifecycleStatus
      )
    ),
    VectorMessageView(
      message: VectorChannelMessage(
        id: "message-video",
        channelId: "channel-general",
        actorKind: "user",
        authorUserId: raj.id,
        body: "Here’s a video reference. It stays contained and uses the native player.",
        createdAt: 1_774_590_000_000
      ),
      authorUser: raj,
      authorAgent: nil,
      attachments: [
        VectorMessageAttachment(
          id: "attachment-image",
          channelId: "channel-general",
          messageId: "message-video",
          storageId: "storage-image",
          kind: "image",
          name: "workshop-notes.jpg",
          contentType: "image/jpeg",
          size: 860_000,
          width: 1200,
          height: 800,
          createdAt: 1_774_590_000_000
        ),
        VectorMessageAttachment(
          id: "attachment-video",
          channelId: "channel-general",
          messageId: "message-video",
          storageId: "storage-video",
          kind: "video",
          name: "product-walkthrough.m3u8",
          contentType: "application/vnd.apple.mpegurl",
          size: 1_200_000,
          width: 1280,
          height: 720,
          duration: 31,
          createdAt: 1_774_590_000_000
        ),
        VectorMessageAttachment(
          id: "attachment-pdf",
          channelId: "channel-general",
          messageId: "message-video",
          storageId: "storage-pdf",
          kind: "file",
          name: "launch-brief.pdf",
          contentType: "application/pdf",
          size: 13_264,
          createdAt: 1_774_590_000_000
        ),
      ]
    ),
    VectorMessageView(
      message: VectorChannelMessage(
        id: "message-thread-reply-1",
        channelId: "channel-general",
        actorKind: "user",
        authorUserId: raj.id,
        body: "I’ll turn this into a short launch checklist.",
        threadRootId: "message-welcome",
        replyToMessageId: "message-welcome",
        createdAt: 1_774_580_500_000
      ),
      authorUser: raj,
      authorAgent: nil
    ),
    VectorMessageView(
      message: VectorChannelMessage(
        id: "message-thread-reply-2",
        channelId: "channel-general",
        actorKind: "agent",
        authorAgentId: collaborationAgent.id,
        body: "I can review that checklist when you mention me.",
        threadRootId: "message-welcome",
        replyToMessageId: "message-thread-reply-1",
        createdAt: 1_774_581_000_000
      ),
      authorUser: nil,
      authorAgent: VectorMessageAgentAuthor(
        id: collaborationAgent.id,
        name: collaborationAgent.name,
        handle: collaborationAgent.handle,
        avatar: collaborationAgent.avatar,
        ownerUserId: collaborationAgent.ownerUserId,
        provider: collaborationAgent.provider,
        lifecycleStatus: collaborationAgent.lifecycleStatus
      )
    ),
  ]

  static let collaborationPriorityMessages = [
    VectorPriorityInboxItem(
      message: collaborationMessages[4],
      channel: collaborationChannels[0].channel,
      reason: "followed_thread",
      occurredAt: collaborationMessages[4].message.createdAt
    ),
    VectorPriorityInboxItem(
      message: collaborationMessages[0],
      channel: collaborationChannels[0].channel,
      reason: "mention",
      occurredAt: collaborationMessages[0].message.createdAt
    ),
  ]

  static let collaborationChannelAgents = [
    VectorChannelAgentView(
      membership: VectorChannelAgentMembership(
        id: "agent-membership-design",
        channelId: "channel-general",
        agentId: collaborationAgent.id,
        wakeMode: "mentions",
        createdAt: 1_774_500_000_000,
        updatedAt: 1_774_500_000_000
      ),
      agent: collaborationAgent,
      owner: raj
    ),
  ]
}
