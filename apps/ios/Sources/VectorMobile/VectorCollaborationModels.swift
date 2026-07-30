import Foundation

public enum VectorChannelKind: String, Codable, Equatable, Sendable {
  case `public`
  case `private`
  case announcement
  case direct
  case groupDirect = "group_direct"

  public var isDirect: Bool {
    self == .direct || self == .groupDirect
  }

  public var systemImage: String {
    switch self {
    case .public: "number"
    case .private: "lock"
    case .announcement: "megaphone"
    case .direct: "bubble.left"
    case .groupDirect: "person.2"
    }
  }
}

public enum VectorChannelNotificationMode: String, Codable, Equatable, Sendable {
  case all
  case mentions
  case muted
}

public struct VectorChannel: Decodable, Equatable, Identifiable, Sendable {
  public let id: VectorID
  public let kind: VectorChannelKind
  public let name: String
  public let slug: String
  public let topic: String?
  public let description: String?
  public let icon: String?
  public let color: String?
  public let isDefault: Bool
  public let lastMessageAt: Double?
  public let createdAt: Double
  public let updatedAt: Double

  public init(
    id: VectorID,
    kind: VectorChannelKind,
    name: String,
    slug: String,
    topic: String? = nil,
    description: String? = nil,
    icon: String? = nil,
    color: String? = nil,
    isDefault: Bool = false,
    lastMessageAt: Double? = nil,
    createdAt: Double,
    updatedAt: Double
  ) {
    self.id = id
    self.kind = kind
    self.name = name
    self.slug = slug
    self.topic = topic
    self.description = description
    self.icon = icon
    self.color = color
    self.isDefault = isDefault
    self.lastMessageAt = lastMessageAt
    self.createdAt = createdAt
    self.updatedAt = updatedAt
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case kind
    case name
    case slug
    case topic
    case description
    case icon
    case color
    case isDefault
    case lastMessageAt
    case createdAt
    case updatedAt
  }
}

public struct VectorChannelMembership: Decodable, Equatable, Identifiable, Sendable {
  public let id: VectorID
  public let channelId: VectorID
  public let userId: VectorID
  public let role: String
  public let notificationMode: VectorChannelNotificationMode
  public let lastReadAt: Double?
  public let favoriteAt: Double?

  public init(
    id: VectorID,
    channelId: VectorID,
    userId: VectorID,
    role: String = "member",
    notificationMode: VectorChannelNotificationMode = .mentions,
    lastReadAt: Double? = nil,
    favoriteAt: Double? = nil
  ) {
    self.id = id
    self.channelId = channelId
    self.userId = userId
    self.role = role
    self.notificationMode = notificationMode
    self.lastReadAt = lastReadAt
    self.favoriteAt = favoriteAt
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case channelId
    case userId
    case role
    case notificationMode
    case lastReadAt
    case favoriteAt
  }
}

public struct VectorChannelListItem: Decodable, Equatable, Identifiable, Sendable {
  public let channel: VectorChannel
  public let membership: VectorChannelMembership?
  public let unreadCount: Double

  public var id: VectorID { channel.id }
  public var unreadDisplayCount: Int { Int(unreadCount) }
  public var isMember: Bool { membership != nil }

  public init(
    channel: VectorChannel,
    membership: VectorChannelMembership?,
    unreadCount: Double
  ) {
    self.channel = channel
    self.membership = membership
    self.unreadCount = unreadCount
  }
}

public struct VectorMessageAttachment: Decodable, Equatable, Identifiable, Sendable {
  public let id: VectorID
  public let channelId: VectorID
  public let messageId: VectorID
  public let storageId: VectorID
  public let kind: String
  public let name: String
  public let contentType: String
  public let size: Double
  public let width: Double?
  public let height: Double?
  public let duration: Double?
  public let createdAt: Double

  public init(
    id: VectorID,
    channelId: VectorID,
    messageId: VectorID,
    storageId: VectorID,
    kind: String,
    name: String,
    contentType: String,
    size: Double,
    width: Double? = nil,
    height: Double? = nil,
    duration: Double? = nil,
    createdAt: Double
  ) {
    self.id = id
    self.channelId = channelId
    self.messageId = messageId
    self.storageId = storageId
    self.kind = kind
    self.name = name
    self.contentType = contentType
    self.size = size
    self.width = width
    self.height = height
    self.duration = duration
    self.createdAt = createdAt
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case channelId
    case messageId
    case storageId
    case kind
    case name
    case contentType
    case size
    case width
    case height
    case duration
    case createdAt
  }

  public var isImage: Bool { kind == "image" }
  public var isVideo: Bool { kind == "video" }
  public var isAudio: Bool { kind == "audio" }
}

public struct VectorMessageReaction: Decodable, Equatable, Identifiable, Sendable {
  public let id: VectorID
  public let userId: VectorID
  public let emoji: String
  public let createdAt: Double

  public init(
    id: VectorID,
    userId: VectorID,
    emoji: String,
    createdAt: Double
  ) {
    self.id = id
    self.userId = userId
    self.emoji = emoji
    self.createdAt = createdAt
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case userId
    case emoji
    case createdAt
  }
}

public struct VectorChannelMemberView: Decodable, Equatable, Identifiable {
  public let membership: VectorChannelMembership
  public let user: VectorUser?

  public var id: VectorID { membership.id }

  public init(membership: VectorChannelMembership, user: VectorUser?) {
    self.membership = membership
    self.user = user
  }
}

public struct VectorRegisteredAgent: Decodable, Equatable, Identifiable, Sendable {
  public let id: VectorID
  public let ownerUserId: VectorID
  public let name: String
  public let handle: String
  public let description: String?
  public let avatar: String?
  public let provider: String
  public let defaultFolder: String
  public let lifecycleStatus: String

  public init(
    id: VectorID,
    ownerUserId: VectorID,
    name: String,
    handle: String,
    description: String? = nil,
    avatar: String? = nil,
    provider: String,
    defaultFolder: String,
    lifecycleStatus: String
  ) {
    self.id = id
    self.ownerUserId = ownerUserId
    self.name = name
    self.handle = handle
    self.description = description
    self.avatar = avatar
    self.provider = provider
    self.defaultFolder = defaultFolder
    self.lifecycleStatus = lifecycleStatus
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case ownerUserId
    case name
    case handle
    case description
    case avatar
    case provider
    case defaultFolder
    case lifecycleStatus
  }
}

public struct VectorMessageAgentAuthor: Decodable, Equatable, Sendable {
  public let id: VectorID
  public let name: String
  public let handle: String
  public let avatar: String?
  public let ownerUserId: VectorID
  public let provider: String
  public let lifecycleStatus: String

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case name
    case handle
    case avatar
    case ownerUserId
    case provider
    case lifecycleStatus
  }
}

public struct VectorChannelMessage: Decodable, Equatable, Identifiable, Sendable {
  public let id: VectorID
  public let channelId: VectorID
  public let actorKind: String
  public let authorUserId: VectorID?
  public let authorAgentId: VectorID?
  public let body: String
  public let format: String
  public let threadRootId: VectorID?
  public let replyToMessageId: VectorID?
  public let clientMessageId: String?
  public let mentionedUserIds: [VectorID]
  public let mentionedAgentIds: [VectorID]
  public let replyCount: Double
  public let lastReplyAt: Double?
  public let editedAt: Double?
  public let deletedAt: Double?
  public let createdAt: Double

  public init(
    id: VectorID,
    channelId: VectorID,
    actorKind: String,
    authorUserId: VectorID? = nil,
    authorAgentId: VectorID? = nil,
    body: String,
    format: String = "markdown",
    threadRootId: VectorID? = nil,
    replyToMessageId: VectorID? = nil,
    clientMessageId: String? = nil,
    mentionedUserIds: [VectorID] = [],
    mentionedAgentIds: [VectorID] = [],
    replyCount: Double = 0,
    lastReplyAt: Double? = nil,
    editedAt: Double? = nil,
    deletedAt: Double? = nil,
    createdAt: Double
  ) {
    self.id = id
    self.channelId = channelId
    self.actorKind = actorKind
    self.authorUserId = authorUserId
    self.authorAgentId = authorAgentId
    self.body = body
    self.format = format
    self.threadRootId = threadRootId
    self.replyToMessageId = replyToMessageId
    self.clientMessageId = clientMessageId
    self.mentionedUserIds = mentionedUserIds
    self.mentionedAgentIds = mentionedAgentIds
    self.replyCount = replyCount
    self.lastReplyAt = lastReplyAt
    self.editedAt = editedAt
    self.deletedAt = deletedAt
    self.createdAt = createdAt
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case channelId
    case actorKind
    case authorUserId
    case authorAgentId
    case body
    case format
    case threadRootId
    case replyToMessageId
    case clientMessageId
    case mentionedUserIds
    case mentionedAgentIds
    case replyCount
    case lastReplyAt
    case editedAt
    case deletedAt
    case createdAt
  }
}

public struct VectorMessageView: Decodable, Equatable, Identifiable {
  public let message: VectorChannelMessage
  public let authorUser: VectorUser?
  public let authorAgent: VectorMessageAgentAuthor?
  public let attachments: [VectorMessageAttachment]
  public let reactions: [VectorMessageReaction]
  public let saved: Bool
  public let following: Bool

  public var id: VectorID { message.id }

  public init(
    message: VectorChannelMessage,
    authorUser: VectorUser?,
    authorAgent: VectorMessageAgentAuthor?,
    attachments: [VectorMessageAttachment] = [],
    reactions: [VectorMessageReaction] = [],
    saved: Bool = false,
    following: Bool = false
  ) {
    self.message = message
    self.authorUser = authorUser
    self.authorAgent = authorAgent
    self.attachments = attachments
    self.reactions = reactions
    self.saved = saved
    self.following = following
  }

  public func withSaved(_ saved: Bool) -> VectorMessageView {
    VectorMessageView(
      message: message,
      authorUser: authorUser,
      authorAgent: authorAgent,
      attachments: attachments,
      reactions: reactions,
      saved: saved,
      following: following
    )
  }

  public func withReplyIncrement() -> VectorMessageView {
    VectorMessageView(
      message: VectorChannelMessage(
        id: message.id,
        channelId: message.channelId,
        actorKind: message.actorKind,
        authorUserId: message.authorUserId,
        authorAgentId: message.authorAgentId,
        body: message.body,
        format: message.format,
        threadRootId: message.threadRootId,
        replyToMessageId: message.replyToMessageId,
        clientMessageId: message.clientMessageId,
        mentionedUserIds: message.mentionedUserIds,
        mentionedAgentIds: message.mentionedAgentIds,
        replyCount: message.replyCount + 1,
        lastReplyAt: Date().timeIntervalSince1970 * 1000,
        editedAt: message.editedAt,
        deletedAt: message.deletedAt,
        createdAt: message.createdAt
      ),
      authorUser: authorUser,
      authorAgent: authorAgent,
      attachments: attachments,
      reactions: reactions,
      saved: saved,
      following: following
    )
  }

  public func replacingMessageID(_ id: VectorID) -> VectorMessageView {
    VectorMessageView(
      message: VectorChannelMessage(
        id: id,
        channelId: message.channelId,
        actorKind: message.actorKind,
        authorUserId: message.authorUserId,
        authorAgentId: message.authorAgentId,
        body: message.body,
        format: message.format,
        threadRootId: message.threadRootId,
        replyToMessageId: message.replyToMessageId,
        clientMessageId: message.clientMessageId,
        mentionedUserIds: message.mentionedUserIds,
        mentionedAgentIds: message.mentionedAgentIds,
        replyCount: message.replyCount,
        lastReplyAt: message.lastReplyAt,
        editedAt: message.editedAt,
        deletedAt: message.deletedAt,
        createdAt: message.createdAt
      ),
      authorUser: authorUser,
      authorAgent: authorAgent,
      attachments: attachments.map {
        VectorMessageAttachment(
          id: $0.id,
          channelId: $0.channelId,
          messageId: id,
          storageId: $0.storageId,
          kind: $0.kind,
          name: $0.name,
          contentType: $0.contentType,
          size: $0.size,
          width: $0.width,
          height: $0.height,
          duration: $0.duration,
          createdAt: $0.createdAt
        )
      },
      reactions: reactions,
      saved: saved,
      following: following
    )
  }

  public func replacingReactions(
    _ reactions: [VectorMessageReaction]
  ) -> VectorMessageView {
    VectorMessageView(
      message: message,
      authorUser: authorUser,
      authorAgent: authorAgent,
      attachments: attachments,
      reactions: reactions,
      saved: saved,
      following: following
    )
  }
}

public enum VectorMessageDeliveryState: Equatable, Sendable {
  case sending
  case sent
  case failed(String)
}

public struct VectorPriorityInboxItem: Decodable, Equatable, Identifiable {
  public let message: VectorMessageView
  public let channel: VectorChannel
  public let reason: String
  public let occurredAt: Double

  public var id: VectorID { message.id }
}

public struct VectorToggleMessageResult: Decodable, Equatable, Sendable {
  public let active: Bool
}

public struct VectorChannelAgentMembership: Decodable, Equatable, Identifiable, Sendable {
  public let id: VectorID
  public let channelId: VectorID
  public let agentId: VectorID
  public let wakeMode: String
  public let createdAt: Double
  public let updatedAt: Double

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case channelId
    case agentId
    case wakeMode
    case createdAt
    case updatedAt
  }
}

public struct VectorChannelAgentView: Decodable, Equatable, Identifiable {
  public let membership: VectorChannelAgentMembership
  public let agent: VectorRegisteredAgent
  public let owner: VectorUser?

  public var id: VectorID { agent.id }
}

public struct VectorAttachmentURL: Decodable, Equatable, Sendable {
  public let attachment: VectorMessageAttachment
  public let url: String
}

public struct VectorDraftAttachment: Equatable, Sendable {
  public let id: UUID
  public let data: Data
  public let kind: String
  public let name: String
  public let contentType: String

  public init(
    id: UUID = UUID(),
    data: Data,
    kind: String,
    name: String,
    contentType: String
  ) {
    self.id = id
    self.data = data
    self.kind = kind
    self.name = name
    self.contentType = contentType
  }
}

public struct VectorSendMessageResult: Decodable, Equatable, Sendable {
  public let messageId: VectorID
  public let runIds: [VectorID]
}
