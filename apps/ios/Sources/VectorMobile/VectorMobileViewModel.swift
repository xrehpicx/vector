import Combine
import Foundation

public enum VectorMobileError: LocalizedError {
  case validation(String)

  public var errorDescription: String? {
    switch self {
    case let .validation(message): message
    }
  }
}

private enum VectorMutationOutcome: Sendable {
  case success
  case failure(String)
}

private final class VectorMutationRace: @unchecked Sendable {
  private let lock = NSLock()
  private var continuation: CheckedContinuation<VectorMutationOutcome, Never>?

  init(continuation: CheckedContinuation<VectorMutationOutcome, Never>) {
    self.continuation = continuation
  }

  @discardableResult
  func resolve(_ outcome: VectorMutationOutcome) -> Bool {
    lock.lock()
    let continuation = continuation
    self.continuation = nil
    lock.unlock()
    continuation?.resume(returning: outcome)
    return continuation != nil
  }
}

public enum VectorMobileInitialLoadPolicy: Sendable {
  case primarySurfaces
  case allSurfaces
}

@MainActor
public final class VectorMobileViewModel: ObservableObject {
  @Published public private(set) var collaborationChannels: [VectorChannelListItem] = []
  @Published public private(set) var channelMessages: [VectorMessageView] = []
  @Published public private(set) var threadMessages: [VectorMessageView] = []
  @Published public private(set) var priorityMessages: [VectorPriorityInboxItem] = []
  @Published public private(set) var savedMessages: [VectorMessageView] = []
  @Published public private(set) var channelMembers: [VectorChannelMemberView] = []
  @Published public private(set) var channelAgents: [VectorChannelAgentView] = []
  @Published public private(set) var selectedChannelId: VectorID?
  @Published public private(set) var selectedThreadRootId: VectorID?
  @Published public private(set) var isLoadingCollaboration = false
  @Published public private(set) var isLoadingChannel = false
  @Published public private(set) var isLoadingSmartMessages = false
  @Published public private(set) var isLoadingThread = false
  @Published public private(set) var isSendingChannelMessage = false
  @Published public private(set) var messageDeliveryStates: [VectorID: VectorMessageDeliveryState] = [:]
  @Published public private(set) var collaborationError: String?
  @Published public private(set) var requests: [VectorRequestRow] = []
  @Published public private(set) var work: [VectorWorkRow] = []
  @Published public private(set) var selectedRequest: VectorRequestDetail?
  @Published public private(set) var selectedWork: VectorWorkDetail?
  @Published public private(set) var workSessions: [VectorWorkSession] = []
  @Published public private(set) var delegationTargets: [VectorDelegationTarget] = []
  @Published public private(set) var selectedAgentSession: VectorAgentSessionSnapshot?
  @Published public private(set) var agentSessionLoadError: String?
  @Published public private(set) var agentSessionLoadErrorSessionId: VectorID?
  @Published public private(set) var agentSessionSendError: String?
  @Published public private(set) var agentSessionSendErrorSessionId: VectorID?
  @Published public private(set) var sendingAgentSessionId: VectorID?
  @Published public private(set) var selectedRequestError: String?
  @Published public private(set) var selectedWorkError: String?
  @Published public private(set) var workSessionError: String?
  @Published public private(set) var isDelegatingWorkSession = false
  @Published public private(set) var isLoadingRequests = false
  @Published public private(set) var isLoadingWork = false
  @Published public private(set) var pendingWorkModelActions: Set<String> = []
  @Published public private(set) var workModelActionError: String?
  @Published public private(set) var issues: [VectorIssueRow] = []
  @Published public private(set) var projects: [VectorProject] = []
  @Published public private(set) var teams: [VectorTeam] = []
  @Published public private(set) var documents: [VectorDocument] = []
  @Published public private(set) var isLoadingDocuments = false
  @Published public private(set) var documentListError: String?
  @Published public private(set) var inboxNotifications: [VectorInboxNotification] = []
  @Published public private(set) var comments: [VectorComment] = []
  @Published public private(set) var assignments: [VectorIssueAssignment] = []
  @Published public private(set) var issueActivity: [VectorActivityItem] = []
  @Published public private(set) var inboxActivity: [VectorActivityItem] = []
  @Published public private(set) var selectedIssue: VectorIssueRow?
  @Published public private(set) var selectedDocument: VectorDocument?
  @Published public private(set) var isLoadingDocumentContent = false
  @Published public private(set) var documentContentError: String?
  @Published public private(set) var workspaceOptions: VectorWorkspaceOptions?
  @Published public private(set) var currentUser: VectorUser?
  @Published public private(set) var userStatus: VectorUserStatus?
  @Published public private(set) var pendingPresence: VectorPresenceStatus?
  @Published public private(set) var isUpdatingUserStatus = false
  @Published public private(set) var notificationPreferences: [VectorNotificationPreference] = []
  @Published public private(set) var mobilePushTokens: [VectorMobilePushTokenRegistration] = []
  @Published public private(set) var isLoading = false
  @Published public private(set) var errorMessage: String?
  @Published public private(set) var settingsErrorMessage: String?
  @Published public var issueScope: VectorIssueScope = .mine
  @Published public var requestScope: VectorRequestScope = .inbox
  @Published public var workScope: VectorWorkScope = .active
  @Published public var projectScope: VectorProjectScope = .mine
  @Published public var issueLayoutMode: VectorIssueLayoutMode = .list

  public let configuration: VectorMobileConfiguration
  private let repository: VectorMobileRepository
  private let pageSize = 30
  private let rootPageKey = "__root"
  private var issueCache: [VectorIssueScope: [VectorIssueRow]] = [:]
  private var projectCache: [VectorProjectScope: [VectorProject]] = [:]
  private var teamCache: [VectorProjectScope: [VectorTeam]] = [:]
  private var documentCache: [VectorDocument] = []
  private var inboxNotificationCache: [VectorInboxNotification] = []
  private var inboxActivityCache: [VectorActivityItem] = []
  private var issuePages: [VectorIssueScope: [String: [VectorIssueRow]]] = [:]
  private var issuePageOrder: [VectorIssueScope: [String]] = [:]
  private var issuePagination: [VectorIssueScope: PaginationState] = [:]
  private var projectPages: [VectorProjectScope: [String: [VectorProject]]] = [:]
  private var projectPageOrder: [VectorProjectScope: [String]] = [:]
  private var projectPagination: [VectorProjectScope: PaginationState] = [:]
  private var teamPages: [VectorProjectScope: [String: [VectorTeam]]] = [:]
  private var teamPageOrder: [VectorProjectScope: [String]] = [:]
  private var teamPagination: [VectorProjectScope: PaginationState] = [:]
  private var documentPages: [String: [VectorDocument]] = [:]
  private var documentPageOrder: [String] = []
  private var documentPagination = PaginationState()
  private var documentFolderPages: [String: [VectorDocumentFolder]] = [:]
  private var documentFolderPageOrder: [String] = []
  private var documentFolderPagination = PaginationState()
  private var folderDocumentPages: [VectorID: [String: [VectorDocument]]] = [:]
  private var folderDocumentPageOrder: [VectorID: [String]] = [:]
  private var folderDocumentPagination: [VectorID: PaginationState] = [:]
  private var inboxNotificationPages: [String: [VectorInboxNotification]] = [:]
  private var inboxNotificationPageOrder: [String] = []
  private var inboxNotificationPagination = PaginationState()
  private var inboxActivityPages: [String: [VectorActivityItem]] = [:]
  private var inboxActivityPageOrder: [String] = []
  private var inboxActivityPagination = PaginationState()
  // Loaded pages stay subscribed so cached tabs remain live when users switch back.
  private var issueListCancellables: [VectorIssueScope: [String: AnyCancellable]] = [:]
  private var collaborationChannelsCancellable: AnyCancellable?
  private var channelMessagesCancellable: AnyCancellable?
  private var threadMessagesCancellable: AnyCancellable?
  private var priorityMessagesCancellable: AnyCancellable?
  private var savedMessagesCancellable: AnyCancellable?
  private var channelMembersCancellable: AnyCancellable?
  private var channelAgentsCancellable: AnyCancellable?
  private var requestListCancellable: AnyCancellable?
  private var workListCancellable: AnyCancellable?
  private var requestDetailCancellable: AnyCancellable?
  private var workDetailCancellable: AnyCancellable?
  private var workSessionsCancellable: AnyCancellable?
  private var delegationTargetsCancellable: AnyCancellable?
  private var agentSessionCancellable: AnyCancellable?
  private var projectListCancellables: [VectorProjectScope: [String: AnyCancellable]] = [:]
  private var teamListCancellables: [VectorProjectScope: [String: AnyCancellable]] = [:]
  private var documentListCancellables: [String: AnyCancellable] = [:]
  private var documentFolderListCancellables: [String: AnyCancellable] = [:]
  private var folderDocumentListCancellables: [VectorID: [String: AnyCancellable]] = [:]
  private var inboxNotificationCancellables: [String: AnyCancellable] = [:]
  private var inboxActivityCancellables: [String: AnyCancellable] = [:]
  private var workspaceOptionsCancellable: AnyCancellable?
  private var issueSupportCancellables = Set<AnyCancellable>()
  private var activeIssueSupportId: VectorID?
  private var activeIssueCollectionsId: VectorID?
  private var documentDetailCancellable: AnyCancellable?
  private var documentContentPageCancellable: AnyCancellable?
  private var activeDocumentId: VectorID?
  private var activeDocumentContentVersion: String?
  private var documentContentLoadId: UUID?
  private var didReceiveInitialDocumentPage = false
  private var didReceiveInitialDocumentFolderPage = false
  private var pendingInitialFolderDocumentIds: Set<VectorID> = []
  private var settingsCancellables = Set<AnyCancellable>()
  private var isSettingsSubscribed = false
  private var authenticatedUser: VectorAuthenticatedUser?
  private var subscribedComments: [VectorComment] = []
  private var pendingComments: [VectorID: VectorComment] = [:]
  private var pendingChannelMessages: [String: PendingChannelMessage] = [:]
  private var userStatusMutationSequence = 0
  private var optimisticUserStatusGuard: OptimisticUserStatusGuard?
  private let requestCreationTimeout: Duration
  private let mutationTimeout: Duration
  private let messageSendTimeout: Duration
  private var requestCreationAttemptId: UUID?
  private var requestCreationOperationTask: Task<Void, Never>?
  private var requestCreationTimeoutTask: Task<Void, Never>?
  private var requestCreationContinuation: CheckedContinuation<Bool, Never>?
  private var requestCreationConfirmationCancellable: AnyCancellable?
  private var requestCreationClientIds: [String: String] = [:]
  private var activeRequestCreationFingerprint: String?

  public var isSendingAgentMessage: Bool {
    sendingAgentSessionId != nil
  }

  public func agentSessionLoadError(for sessionId: VectorID) -> String? {
    agentSessionLoadErrorSessionId == sessionId ? agentSessionLoadError : nil
  }

  public func agentSessionSendError(for sessionId: VectorID) -> String? {
    agentSessionSendErrorSessionId == sessionId ? agentSessionSendError : nil
  }

  private struct OptimisticUserStatusGuard {
    enum ConfirmationMode {
      case presence
      case fullStatus
    }

    let token: Int
    let status: VectorUserStatus
    let confirmationMode: ConfirmationMode
  }

  private struct PendingChannelMessage {
    let clientMessageId: String
    let channelId: VectorID
    let body: String
    let mentionedUserIds: [VectorID]
    let mentionedAgentIds: [VectorID]
    let attachments: [VectorDraftAttachment]
    let threadRootId: VectorID?
    let replyToMessageId: VectorID?
    var message: VectorMessageView
  }

  private struct PaginationState {
    var continueCursor: String?
    var isDone = false
    var isLoadingMore = false
  }

  public init(
    configuration: VectorMobileConfiguration = .demo,
    repository: VectorMobileRepository = MockVectorRepository(),
    initialLoadPolicy: VectorMobileInitialLoadPolicy = .allSurfaces,
    requestCreationTimeout: Duration = .seconds(20),
    mutationTimeout: Duration = .seconds(20),
    messageSendTimeout: Duration = .seconds(8)
  ) {
    self.configuration = configuration
    self.repository = repository
    self.requestCreationTimeout = requestCreationTimeout
    self.mutationTimeout = mutationTimeout
    self.messageSendTimeout = messageSendTimeout
    switch initialLoadPolicy {
    case .primarySurfaces:
      refreshPrimarySurfaces()
    case .allSurfaces:
      refresh()
    }
  }

  public func refreshPrimarySurfaces() {
    errorMessage = nil
    loadCollaboration()
    refreshRequests()
    refreshWork()
    subscribeToInboxNotificationsIfNeeded()
    subscribeToWorkspaceOptionsIfNeeded()
  }

  public func refresh() {
    errorMessage = nil
    loadCollaboration()
    refreshRequests()
    refreshWork()
    subscribeToIssuesIfNeeded(scope: issueScope)
    subscribeToProjectsIfNeeded(scope: projectScope)
    subscribeToTeamsIfNeeded(scope: projectScope)
    subscribeToDocumentsIfNeeded()
    subscribeToInboxNotificationsIfNeeded()
    subscribeToWorkspaceOptionsIfNeeded()
    loadSettings()
  }

  public func loadWorkspaceContent() {
    if documentCache.isEmpty
      && (documentListCancellables[rootPageKey] == nil
        || documentFolderListCancellables[rootPageKey] == nil)
    {
      isLoadingDocuments = true
      documentListError = nil
    }
    subscribeToProjectsIfNeeded(scope: projectScope)
    subscribeToTeamsIfNeeded(scope: projectScope)
    subscribeToDocumentsIfNeeded()
  }

  public func loadCollaboration() {
    collaborationChannelsCancellable?.cancel()
    isLoadingCollaboration = collaborationChannels.isEmpty
    collaborationError = nil
    collaborationChannelsCancellable = repository
      .collaborationChannels(orgSlug: configuration.orgSlug)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self] completion in
          guard let self else { return }
          isLoadingCollaboration = false
          if case let .failure(error) = completion {
            collaborationError = error.localizedDescription
          }
        },
        receiveValue: { [weak self] channels in
          guard let self else { return }
          collaborationChannels = channels
          isLoadingCollaboration = false
        }
      )
    loadSmartMessages()
  }

  public func loadSmartMessages() {
    priorityMessagesCancellable?.cancel()
    savedMessagesCancellable?.cancel()
    isLoadingSmartMessages = priorityMessages.isEmpty && savedMessages.isEmpty

    priorityMessagesCancellable = repository
      .priorityMessages(orgSlug: configuration.orgSlug)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self] completion in
          if case let .failure(error) = completion {
            self?.collaborationError = error.localizedDescription
          }
          self?.isLoadingSmartMessages = false
        },
        receiveValue: { [weak self] messages in
          self?.priorityMessages = messages
          self?.isLoadingSmartMessages = false
        }
      )

    savedMessagesCancellable = repository
      .savedMessages(orgSlug: configuration.orgSlug)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self] completion in
          if case let .failure(error) = completion {
            self?.collaborationError = error.localizedDescription
          }
          self?.isLoadingSmartMessages = false
        },
        receiveValue: { [weak self] messages in
          self?.savedMessages = messages
          self?.isLoadingSmartMessages = false
        }
      )
  }

  public func openChannel(_ channel: VectorChannelListItem) {
    guard selectedChannelId != channel.id || channelMessagesCancellable == nil else { return }
    selectedChannelId = channel.id
    channelMessages = []
    channelMembers = []
    channelAgents = []
    isLoadingChannel = true
    collaborationError = nil
    channelMessagesCancellable?.cancel()
    channelMembersCancellable?.cancel()
    channelAgentsCancellable?.cancel()

    channelMessagesCancellable = repository
      .channelMessages(channelId: channel.id, pageSize: 50, cursor: nil)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self] completion in
          guard let self else { return }
          isLoadingChannel = false
          if case let .failure(error) = completion {
            collaborationError = error.localizedDescription
          }
        },
        receiveValue: { [weak self] page in
          guard let self else { return }
          mergeChannelMessages(page.page, channelId: channel.id)
          isLoadingChannel = false
          if let latestMessageId = channelMessages.last?.id {
            Task {
              try? await repository.markChannelRead(
                channelId: channel.id,
                messageId: latestMessageId
              )
            }
          }
        }
      )

    channelMembersCancellable = repository
      .channelMembers(channelId: channel.id)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self] completion in
          if case let .failure(error) = completion {
            self?.collaborationError = error.localizedDescription
          }
        },
        receiveValue: { [weak self] members in
          self?.channelMembers = members
        }
      )

    channelAgentsCancellable = repository
      .channelAgents(channelId: channel.id)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self] completion in
          if case let .failure(error) = completion {
            self?.collaborationError = error.localizedDescription
          }
        },
        receiveValue: { [weak self] agents in
          self?.channelAgents = agents
        }
      )
  }

  public func attachmentURL(_ attachmentId: VectorID) -> AnyPublisher<VectorAttachmentURL?, Error> {
    repository.attachmentURL(attachmentId: attachmentId)
  }

  public func openThread(rootMessageId: VectorID) {
    guard selectedThreadRootId != rootMessageId || threadMessagesCancellable == nil else { return }
    selectedThreadRootId = rootMessageId
    threadMessages = []
    isLoadingThread = true
    threadMessagesCancellable?.cancel()
    threadMessagesCancellable = repository
      .channelThread(rootMessageId: rootMessageId, pageSize: 50, cursor: nil)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self] completion in
          self?.isLoadingThread = false
          if case let .failure(error) = completion {
            self?.collaborationError = error.localizedDescription
          }
        },
        receiveValue: { [weak self] page in
          self?.mergeThreadMessages(page.page, rootMessageId: rootMessageId)
          self?.isLoadingThread = false
        }
      )
  }

  public func sendChannelMessage(
    body: String,
    attachments: [VectorDraftAttachment],
    threadRootId: VectorID? = nil,
    replyToMessageId: VectorID? = nil
  ) async -> Bool {
    let trimmedBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let channelId = selectedChannelId,
          !trimmedBody.isEmpty || !attachments.isEmpty
    else { return false }

    collaborationError = nil
    let mentionedUsers = channelMembers
      .compactMap(\.user)
      .filter { user in
        trimmedBody.range(
          of: "@\(user.mentionHandle)",
          options: [.caseInsensitive, .diacriticInsensitive]
        ) != nil
      }
      .map(\.id)
    let mentionedAgents = channelAgents
      .filter { agent in
        trimmedBody.range(
          of: "@\(agent.agent.handle)",
          options: [.caseInsensitive, .diacriticInsensitive]
        ) != nil
      }
      .map(\.agent.id)
    let clientMessageId = UUID().uuidString.lowercased()
    let localMessageId = "pending:\(clientMessageId)"
    let createdAt = Date().timeIntervalSince1970 * 1000
    let optimisticAttachments = attachments.map {
      VectorMessageAttachment(
        id: "\(localMessageId):\($0.id.uuidString.lowercased())",
        channelId: channelId,
        messageId: localMessageId,
        storageId: "pending",
        kind: $0.kind,
        name: $0.name,
        contentType: $0.contentType,
        size: Double($0.data.count),
        createdAt: createdAt
      )
    }
    let optimisticMessage = VectorMessageView(
      message: VectorChannelMessage(
        id: localMessageId,
        channelId: channelId,
        actorKind: "user",
        authorUserId: currentUser?.id,
        body: trimmedBody,
        threadRootId: threadRootId,
        replyToMessageId: replyToMessageId,
        clientMessageId: clientMessageId,
        mentionedUserIds: mentionedUsers,
        mentionedAgentIds: mentionedAgents,
        createdAt: createdAt
      ),
      authorUser: currentUser,
      authorAgent: nil,
      attachments: optimisticAttachments
    )
    pendingChannelMessages[clientMessageId] = PendingChannelMessage(
      clientMessageId: clientMessageId,
      channelId: channelId,
      body: trimmedBody,
      mentionedUserIds: mentionedUsers,
      mentionedAgentIds: mentionedAgents,
      attachments: attachments,
      threadRootId: threadRootId,
      replyToMessageId: replyToMessageId,
      message: optimisticMessage
    )
    messageDeliveryStates[localMessageId] = .sending
    rebuildVisiblePendingMessages()
    refreshChannelSendingState()
    return await deliverPendingChannelMessage(clientMessageId: clientMessageId)
  }

  public func retryChannelMessage(_ messageId: VectorID) async {
    guard let pending = pendingChannelMessages.values.first(where: {
      $0.message.id == messageId
    }) else { return }
    messageDeliveryStates[messageId] = .sending
    refreshChannelSendingState()
    _ = await deliverPendingChannelMessage(clientMessageId: pending.clientMessageId)
  }

  public func messageDeliveryState(for messageId: VectorID) -> VectorMessageDeliveryState? {
    messageDeliveryStates[messageId]
  }

  private func deliverPendingChannelMessage(clientMessageId: String) async -> Bool {
    guard let pending = pendingChannelMessages[clientMessageId] else { return true }
    var sendResult: VectorSendMessageResult?
    do {
      try await withMutationTimeout(timeout: messageSendTimeout) {
        sendResult = try await self.repository.sendChannelMessage(
          channelId: pending.channelId,
          body: pending.body,
          clientMessageId: pending.clientMessageId,
          mentionedUserIds: pending.mentionedUserIds,
          mentionedAgentIds: pending.mentionedAgentIds,
          attachments: pending.attachments,
          threadRootId: pending.threadRootId,
          replyToMessageId: pending.replyToMessageId
        )
      }
      guard let result = sendResult else {
        throw VectorMobileError.validation("Vector could not confirm this message.")
      }
      if var latest = pendingChannelMessages[clientMessageId] {
        let previousId = latest.message.id
        latest.message = latest.message.replacingMessageID(result.messageId)
        pendingChannelMessages[clientMessageId] = latest
        messageDeliveryStates.removeValue(forKey: previousId)
        messageDeliveryStates[result.messageId] = .sent
        rebuildVisiblePendingMessages()
      }
      refreshChannelSendingState()
      return true
    } catch {
      guard let latest = pendingChannelMessages[clientMessageId] else {
        refreshChannelSendingState()
        return false
      }
      let message = readableMessageSendError(error)
      messageDeliveryStates[latest.message.id] = .failed(message)
      refreshChannelSendingState()
      return false
    }
  }

  private func readableMessageSendError(_ error: Error) -> String {
    let raw = error.localizedDescription
    if raw.contains("CHANNEL_MEMBERSHIP_REQUIRED") {
      return "You’re no longer a member of this channel."
    }
    if raw.contains("FORBIDDEN") || raw.contains("PERMISSION") {
      return "You don’t have permission to send here."
    }
    if raw.contains("session") || raw.contains("authenticated") || raw.contains("Unauthorized") {
      return "Your session expired. Sign in again, then retry."
    }
    if raw.contains("could not confirm") {
      return "Not sent. Check your connection and retry."
    }
    return "Not sent. Tap to retry."
  }

  private func refreshChannelSendingState() {
    isSendingChannelMessage = messageDeliveryStates.values.contains(.sending)
  }

  private func mergeChannelMessages(
    _ serverMessages: [VectorMessageView],
    channelId: VectorID
  ) {
    reconcileConfirmedPendingMessages(serverMessages)
    let pending = pendingChannelMessages.values
      .filter { $0.channelId == channelId && $0.threadRootId == nil }
      .map(\.message)
    channelMessages = mergedMessages(serverMessages, pending: pending)
  }

  private func mergeThreadMessages(
    _ serverMessages: [VectorMessageView],
    rootMessageId: VectorID
  ) {
    reconcileConfirmedPendingMessages(serverMessages)
    let pending = pendingChannelMessages.values
      .filter { $0.threadRootId == rootMessageId }
      .map(\.message)
    threadMessages = mergedMessages(serverMessages, pending: pending)
  }

  private func rebuildVisiblePendingMessages() {
    if let channelId = selectedChannelId {
      let serverMessages = channelMessages.filter {
        $0.message.clientMessageId == nil
          || pendingChannelMessages[$0.message.clientMessageId ?? ""] == nil
      }
      let pending = pendingChannelMessages.values
        .filter { $0.channelId == channelId && $0.threadRootId == nil }
        .map(\.message)
      channelMessages = mergedMessages(serverMessages, pending: pending)
    }
    if let rootMessageId = selectedThreadRootId {
      let serverMessages = threadMessages.filter {
        $0.message.clientMessageId == nil
          || pendingChannelMessages[$0.message.clientMessageId ?? ""] == nil
      }
      let pending = pendingChannelMessages.values
        .filter { $0.threadRootId == rootMessageId }
        .map(\.message)
      threadMessages = mergedMessages(serverMessages, pending: pending)
    }
  }

  private func reconcileConfirmedPendingMessages(_ serverMessages: [VectorMessageView]) {
    let confirmedClientMessageIds = Set(serverMessages.compactMap(\.message.clientMessageId))
    for clientMessageId in confirmedClientMessageIds {
      guard let pending = pendingChannelMessages.removeValue(forKey: clientMessageId) else {
        continue
      }
      messageDeliveryStates.removeValue(forKey: pending.message.id)
    }
    refreshChannelSendingState()
  }

  private func mergedMessages(
    _ serverMessages: [VectorMessageView],
    pending: [VectorMessageView]
  ) -> [VectorMessageView] {
    let serverIds = Set(serverMessages.map(\.id))
    return (serverMessages + pending.filter { !serverIds.contains($0.id) })
      .sorted { $0.message.createdAt < $1.message.createdAt }
  }

  public func toggleReaction(_ message: VectorMessageView, emoji: String) async {
    guard !message.id.hasPrefix("pending:"),
          let userId = currentUser?.id
    else { return }

    let previousReactions = message.reactions
    let existing = previousReactions.first {
      $0.userId == userId && $0.emoji == emoji
    }
    let optimisticReactions: [VectorMessageReaction]
    if let existing {
      optimisticReactions = previousReactions.filter { $0.id != existing.id }
    } else {
      optimisticReactions = previousReactions + [
        VectorMessageReaction(
          id: "pending-reaction:\(UUID().uuidString.lowercased())",
          userId: userId,
          emoji: emoji,
          createdAt: Date().timeIntervalSince1970 * 1000
        ),
      ]
    }
    replaceMessageReactions(message.id, reactions: optimisticReactions)

    do {
      _ = try await repository.toggleMessageReaction(
        messageId: message.id,
        emoji: emoji
      )
    } catch {
      replaceMessageReactions(message.id, reactions: previousReactions)
      collaborationError = "Reaction wasn’t saved. Try again."
    }
  }

  private func replaceMessageReactions(
    _ messageId: VectorID,
    reactions: [VectorMessageReaction]
  ) {
    channelMessages = channelMessages.map {
      $0.id == messageId ? $0.replacingReactions(reactions) : $0
    }
    threadMessages = threadMessages.map {
      $0.id == messageId ? $0.replacingReactions(reactions) : $0
    }
    savedMessages = savedMessages.map {
      $0.id == messageId ? $0.replacingReactions(reactions) : $0
    }
    priorityMessages = priorityMessages.map { item in
      guard item.message.id == messageId else { return item }
      return VectorPriorityInboxItem(
        message: item.message.replacingReactions(reactions),
        channel: item.channel,
        reason: item.reason,
        occurredAt: item.occurredAt
      )
    }
  }

  public func toggleSaved(_ message: VectorMessageView) async {
    do {
      let active = try await repository.toggleSavedMessage(messageId: message.id)
      replaceMessage(message.id) { $0.withSaved(active) }
      if active {
        if !savedMessages.contains(where: { $0.id == message.id }) {
          savedMessages.insert(message.withSaved(true), at: 0)
        }
      } else {
        savedMessages.removeAll { $0.id == message.id }
      }
    } catch {
      collaborationError = error.localizedDescription
    }
  }

  private func replaceMessage(
    _ messageId: VectorID,
    transform: (VectorMessageView) -> VectorMessageView
  ) {
    if let index = channelMessages.firstIndex(where: { $0.id == messageId }) {
      channelMessages[index] = transform(channelMessages[index])
    }
    if let index = threadMessages.firstIndex(where: { $0.id == messageId }) {
      threadMessages[index] = transform(threadMessages[index])
    }
    if let index = savedMessages.firstIndex(where: { $0.id == messageId }) {
      savedMessages[index] = transform(savedMessages[index])
    }
    if let index = priorityMessages.firstIndex(where: { $0.message.id == messageId }) {
      let item = priorityMessages[index]
      priorityMessages[index] = VectorPriorityInboxItem(
        message: transform(item.message),
        channel: item.channel,
        reason: item.reason,
        occurredAt: item.occurredAt
      )
    }
  }

  public func refreshRequests() {
    requestListCancellable?.cancel()
    isLoadingRequests = true
    requestListCancellable = repository.requestsPage(
      orgSlug: configuration.orgSlug,
      scope: requestScope,
      pageSize: pageSize,
      cursor: nil
    )
    .receive(on: DispatchQueue.main)
    .sink(
      receiveCompletion: { [weak self] completion in
        guard let self else { return }
        isLoadingRequests = false
        if case let .failure(error) = completion {
          errorMessage = error.localizedDescription
        }
      },
      receiveValue: { [weak self] page in
        self?.requests = page.page
        self?.isLoadingRequests = false
      }
    )
  }

  public func refreshWork() {
    workListCancellable?.cancel()
    isLoadingWork = true
    workListCancellable = repository.workPage(
      orgSlug: configuration.orgSlug,
      scope: workScope,
      pageSize: pageSize,
      cursor: nil
    )
    .receive(on: DispatchQueue.main)
    .sink(
      receiveCompletion: { [weak self] completion in
        guard let self else { return }
        isLoadingWork = false
        if case let .failure(error) = completion {
          errorMessage = error.localizedDescription
        }
      },
      receiveValue: { [weak self] page in
        self?.work = page.page
        self?.isLoadingWork = false
      }
    )
  }

  public func loadRequest(_ row: VectorRequestRow) {
    requestDetailCancellable?.cancel()
    selectedRequest = nil
    selectedRequestError = nil
    requestDetailCancellable = repository.request(orgSlug: configuration.orgSlug, key: row.key)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self] completion in
          if case let .failure(error) = completion {
            self?.selectedRequestError = error.localizedDescription
          }
        },
        receiveValue: { [weak self] detail in
          self?.selectedRequestError = detail == nil
            ? "This request was not found or you no longer have access."
            : nil
          self?.selectedRequest = detail
        }
      )
  }

  public func loadWork(_ row: VectorWorkRow) {
    workDetailCancellable?.cancel()
    selectedWork = nil
    selectedWorkError = nil
    loadWorkSessions(issueId: row.id)
    workDetailCancellable = repository.work(orgSlug: configuration.orgSlug, key: row.key)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self] completion in
          if case let .failure(error) = completion {
            self?.selectedWorkError = error.localizedDescription
          }
        },
        receiveValue: { [weak self] detail in
          self?.selectedWorkError = detail == nil
            ? "This work was not found or you no longer have access."
            : nil
          self?.selectedWork = detail
        }
      )
  }

  public func loadWorkSessions(issueId: VectorID) {
    workSessionsCancellable?.cancel()
    workSessions = []
    workSessionError = nil
    workSessionsCancellable = repository.workSessions(issueId: issueId)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self] completion in
          if case let .failure(error) = completion {
            self?.workSessionError = error.localizedDescription
          }
        },
        receiveValue: { [weak self] sessions in
          self?.workSessions = sessions
        }
      )
  }

  public func loadDelegationTargets() {
    delegationTargetsCancellable?.cancel()
    workSessionError = nil
    delegationTargetsCancellable = repository.delegationTargets()
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self] completion in
          if case let .failure(error) = completion {
            self?.workSessionError = error.localizedDescription
          }
        },
        receiveValue: { [weak self] targets in
          self?.delegationTargets = targets
        }
      )
  }

  public func loadAgentSession(liveActivityId: VectorID) {
    agentSessionCancellable?.cancel()
    selectedAgentSession = nil
    agentSessionLoadError = nil
    agentSessionLoadErrorSessionId = nil
    agentSessionCancellable = repository.agentSession(liveActivityId: liveActivityId)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self] completion in
          if case let .failure(error) = completion {
            self?.agentSessionLoadError = error.localizedDescription
            self?.agentSessionLoadErrorSessionId = liveActivityId
          }
        },
        receiveValue: { [weak self] session in
          self?.selectedAgentSession = session
          self?.agentSessionLoadError = session == nil
            ? "This agent session is unavailable or you no longer have access."
            : nil
          self?.agentSessionLoadErrorSessionId = session == nil ? liveActivityId : nil
        }
      )
  }

  public func createRequest(
    title: String,
    description: String?,
    expectedOutput: String,
    reviewGuidance: String?,
    priorityId: VectorID? = nil
  ) async -> Bool {
    let actionId = "create-request"
    guard !pendingWorkModelActions.contains(actionId) else { return false }

    let attemptId = UUID()
    let fingerprint = [
      configuration.orgSlug,
      title,
      description ?? "",
      expectedOutput,
      reviewGuidance ?? "",
      priorityId ?? "",
    ].joined(separator: "\u{1F}")
    let clientRequestId: String
    if let existingId = requestCreationClientIds[fingerprint] {
      clientRequestId = existingId
    } else {
      clientRequestId = UUID().uuidString.lowercased()
      requestCreationClientIds[fingerprint] = clientRequestId
    }
    activeRequestCreationFingerprint = fingerprint
    requestCreationAttemptId = attemptId
    pendingWorkModelActions.insert(actionId)
    workModelActionError = nil

    return await withTaskCancellationHandler {
      await withCheckedContinuation { continuation in
        requestCreationContinuation = continuation
        requestCreationConfirmationCancellable?.cancel()
        requestCreationConfirmationCancellable = repository.requestCreation(
          orgSlug: configuration.orgSlug,
          clientRequestId: clientRequestId
        )
        .receive(on: DispatchQueue.main)
        .sink(
          receiveCompletion: { _ in },
          receiveValue: { [weak self] result in
            guard result != nil else { return }
            self?.finishRequestCreation(attemptId: attemptId, succeeded: true)
          }
        )
        requestCreationOperationTask = Task { [weak self] in
          guard let self else { return }
          do {
            _ = try await repository.createRequest(
              orgSlug: configuration.orgSlug,
              title: title,
              description: description,
              expectedOutput: expectedOutput,
              reviewGuidance: reviewGuidance,
              priorityId: priorityId,
              clientRequestId: clientRequestId
            )
            finishRequestCreation(attemptId: attemptId, succeeded: true)
          } catch is CancellationError {
            finishRequestCreation(attemptId: attemptId, succeeded: false)
          } catch {
            finishRequestCreation(
              attemptId: attemptId,
              succeeded: false,
              errorMessage: error.localizedDescription
            )
          }
        }
        requestCreationTimeoutTask = Task { [weak self, requestCreationTimeout] in
          do {
            try await Task.sleep(for: requestCreationTimeout)
          } catch {
            return
          }
          self?.finishRequestCreation(
            attemptId: attemptId,
            succeeded: false,
            errorMessage: "Vector could not confirm the request yet. Try Create again; it will not create a duplicate."
          )
        }

        if Task.isCancelled {
          finishRequestCreation(attemptId: attemptId, succeeded: false)
        }
      }
    } onCancel: {
      Task { @MainActor [weak self] in
        self?.finishRequestCreation(attemptId: attemptId, succeeded: false)
      }
    }
  }

  private func finishRequestCreation(
    attemptId: UUID,
    succeeded: Bool,
    errorMessage: String? = nil
  ) {
    guard requestCreationAttemptId == attemptId else { return }

    requestCreationAttemptId = nil
    let operationTask = requestCreationOperationTask
    let timeoutTask = requestCreationTimeoutTask
    let continuation = requestCreationContinuation
    let confirmationCancellable = requestCreationConfirmationCancellable
    requestCreationOperationTask = nil
    requestCreationTimeoutTask = nil
    requestCreationContinuation = nil
    requestCreationConfirmationCancellable = nil
    pendingWorkModelActions.remove("create-request")

    if succeeded {
      if let fingerprint = activeRequestCreationFingerprint {
        requestCreationClientIds.removeValue(forKey: fingerprint)
      }
    }
    activeRequestCreationFingerprint = nil
    if let errorMessage {
      workModelActionError = errorMessage
    }
    refreshRequests()

    operationTask?.cancel()
    timeoutTask?.cancel()
    confirmationCancellable?.cancel()
    continuation?.resume(returning: succeeded)
  }

  public func createWork(
    title: String,
    description: String?,
    ownerId: VectorID?,
    requestIds: [VectorID]? = nil
  ) async -> Bool {
    let created = await performWorkModelAction(id: "create-work") {
      _ = try await self.repository.createWork(
        orgSlug: self.configuration.orgSlug,
        title: title,
        description: description,
        ownerId: ownerId,
        requestIds: requestIds
      )
    }
    if created {
      refreshWork()
      refreshRequests()
    }
    return created
  }

  public func claimRequest(_ requestId: VectorID) async -> Bool {
    await performWorkModelAction(id: "request:\(requestId):claim") {
      try await self.repository.claimRequest(requestId: requestId)
    }
  }

  public func completeRequest(_ requestId: VectorID) async -> Bool {
    await performWorkModelAction(id: "request:\(requestId):complete") {
      try await self.repository.completeRequest(requestId: requestId)
    }
  }

  public func requestChanges(_ requestId: VectorID, note: String) async -> Bool {
    await performWorkModelAction(id: "request:\(requestId):changes") {
      try await self.repository.requestChanges(requestId: requestId, note: note)
    }
  }

  public func startWork(_ workId: VectorID) async -> Bool {
    await performWorkModelAction(id: "work:\(workId):start") {
      try await self.repository.startWork(workId: workId)
    }
  }

  public func setWorkStatus(_ workId: VectorID, status: VectorWorkStatus) async -> Bool {
    await performWorkModelAction(id: "work:\(workId):status") {
      try await self.repository.setWorkStatus(workId: workId, status: status)
    }
  }

  public func readyWorkForReview(_ workId: VectorID) async -> Bool {
    await performWorkModelAction(id: "work:\(workId):review") {
      try await self.repository.readyWorkForReview(workId: workId)
    }
  }

  public func completeWork(_ workId: VectorID) async -> Bool {
    await performWorkModelAction(id: "work:\(workId):complete") {
      try await self.repository.completeWork(workId: workId)
    }
  }

  public func respondToHandoff(_ handoffId: VectorID, accept: Bool) async -> Bool {
    await performWorkModelAction(id: "handoff:\(handoffId)") {
      try await self.repository.respondToWorkHandoff(handoffId: handoffId, accept: accept)
    }
  }

  public func proposeHandoff(_ workId: VectorID, toOwnerId: VectorID, summary: String, note: String?) async -> Bool {
    await performWorkModelAction(id: "work:\(workId):handoff") {
      try await self.repository.proposeWorkHandoff(workId: workId, toOwnerId: toOwnerId, summary: summary, note: note)
    }
  }

  public func raiseAttention(_ workId: VectorID, title: String, details: String?) async -> Bool {
    await performWorkModelAction(id: "work:\(workId):attention") {
      try await self.repository.raiseWorkAttention(workId: workId, title: title, details: details)
    }
  }

  public func createTask(_ workId: VectorID, title: String, assigneeId: VectorID?) async -> Bool {
    await performWorkModelAction(id: "work:\(workId):create-task") {
      _ = try await self.repository.createTask(workId: workId, title: title, assigneeId: assigneeId)
    }
  }

  public func setTaskStatus(_ taskId: VectorID, status: VectorTaskStatus) async -> Bool {
    await performWorkModelAction(id: "task:\(taskId):status") {
      try await self.repository.setTaskStatus(taskId: taskId, status: status)
    }
  }

  public func delegateWorkSession(
    issueId: VectorID,
    deviceId: VectorID,
    workspaceId: VectorID,
    provider: String
  ) async -> Bool {
    guard !isDelegatingWorkSession else { return false }
    isDelegatingWorkSession = true
    workSessionError = nil
    defer { isDelegatingWorkSession = false }

    do {
      try await withMutationTimeout {
        _ = try await self.repository.delegateWorkSession(
          issueId: issueId,
          deviceId: deviceId,
          workspaceId: workspaceId,
          provider: provider
        )
      }
      return true
    } catch {
      workSessionError = error.localizedDescription
      return false
    }
  }

  public func sendAgentSessionMessage(liveActivityId: VectorID, body: String) async -> Bool {
    let trimmedBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedBody.isEmpty, sendingAgentSessionId == nil else { return false }
    sendingAgentSessionId = liveActivityId
    agentSessionSendError = nil
    agentSessionSendErrorSessionId = nil
    defer { sendingAgentSessionId = nil }

    do {
      try await withMutationTimeout {
        _ = try await self.repository.sendAgentSessionMessage(
          liveActivityId: liveActivityId,
          body: trimmedBody
        )
      }
      return true
    } catch {
      agentSessionSendError = error.localizedDescription
      agentSessionSendErrorSessionId = liveActivityId
      return false
    }
  }

  private func performWorkModelAction(
    id: String,
    operation: @MainActor @escaping () async throws -> Void
  ) async -> Bool {
    guard !pendingWorkModelActions.contains(id) else { return false }
    pendingWorkModelActions.insert(id)
    workModelActionError = nil
    defer { pendingWorkModelActions.remove(id) }
    do {
      try await withMutationTimeout(operation)
      return true
    } catch {
      errorMessage = error.localizedDescription
      workModelActionError = error.localizedDescription
      return false
    }
  }

  private func withMutationTimeout(
    timeout: Duration? = nil,
    _ operation: @MainActor @escaping () async throws -> Void
  ) async throws {
    let timeout = timeout ?? mutationTimeout
    let outcome: VectorMutationOutcome = await withCheckedContinuation { continuation in
      let race = VectorMutationRace(continuation: continuation)
      let operationTask = Task { @MainActor in
        do {
          try await operation()
          race.resolve(.success)
        } catch {
          race.resolve(.failure(error.localizedDescription))
        }
      }
      Task { @MainActor in
        do {
          try await Task.sleep(for: timeout)
        } catch {
          return
        }
        if race.resolve(.failure("Vector could not confirm this change. Check the item before trying again.")) {
          operationTask.cancel()
        }
      }
    }
    if case let .failure(message) = outcome {
      throw VectorMobileError.validation(message)
    }
  }

  public func clearWorkModelActionError() {
    workModelActionError = nil
  }

  public func setAuthenticatedUser(_ user: VectorAuthenticatedUser?) {
    authenticatedUser = user
    syncCurrentUser()
  }

  private func subscribeToIssuesIfNeeded(scope: VectorIssueScope) {
    if let cachedIssues = issueCache[scope] {
      if issueScope == scope {
        issues = cachedIssues
        isLoading = false
      }
    } else if issueScope == scope && issueListCancellables[scope]?[rootPageKey] == nil {
      issues = []
      isLoading = true
    }

    subscribeToIssuePage(scope: scope, cursor: nil)
  }

  private func subscribeToProjectsIfNeeded(scope: VectorProjectScope) {
    if let cachedProjects = projectCache[scope] {
      if projectScope == scope {
        projects = cachedProjects
      }
    } else if projectScope == scope && projectListCancellables[scope]?[rootPageKey] == nil {
      projects = []
    }

    subscribeToProjectPage(scope: scope, cursor: nil)
  }

  private func subscribeToTeamsIfNeeded(scope: VectorProjectScope) {
    if let cachedTeams = teamCache[scope] {
      if projectScope == scope {
        teams = cachedTeams
      }
    } else if projectScope == scope && teamListCancellables[scope]?[rootPageKey] == nil {
      teams = []
    }

    subscribeToTeamPage(scope: scope, cursor: nil)
  }

  private func subscribeToWorkspaceOptionsIfNeeded() {
    guard workspaceOptionsCancellable == nil else {
      return
    }

    workspaceOptionsCancellable = repository.workspaceOptions(orgSlug: configuration.orgSlug)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self] completion in
          if case let .failure(error) = completion {
            self?.workspaceOptionsCancellable = nil
            self?.errorMessage = error.localizedDescription
          }
        },
        receiveValue: { [weak self] options in
          self?.workspaceOptions = options
          self?.syncCurrentUser()
        }
      )
  }

  private func subscribeToDocumentsIfNeeded() {
    if !documentCache.isEmpty {
      documents = documentCache
    }

    subscribeToDocumentPage(cursor: nil)
    subscribeToDocumentFolderPage(cursor: nil)
  }

  private func subscribeToInboxNotificationsIfNeeded() {
    if !inboxNotificationCache.isEmpty {
      inboxNotifications = inboxNotificationCache
    }

    subscribeToInboxNotificationPage(cursor: nil)
  }

  private func subscribeToInboxActivityIfNeeded() {
    if !inboxActivityCache.isEmpty {
      inboxActivity = inboxActivityCache
    }

    subscribeToInboxActivityPage(cursor: nil)
  }

  public func loadIssueSupport(issue: VectorIssueRow) {
    if activeIssueSupportId == issue.id, !issueSupportCancellables.isEmpty {
      if selectedIssue?.id != issue.id {
        selectedIssue = currentIssue(issue.id) ?? issue
      }
      return
    }

    issueSupportCancellables.removeAll()
    activeIssueSupportId = issue.id
    activeIssueCollectionsId = nil
    selectedIssue = issue
    comments = []
    assignments = []
    issueActivity = []

    repository.issue(orgSlug: configuration.orgSlug, key: issue.key)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self] completion in
          if case let .failure(error) = completion {
            self?.errorMessage = error.localizedDescription
          }
        },
        receiveValue: { [weak self] issue in
          guard let self, let issue else { return }
          selectedIssue = issue
          activeIssueSupportId = issue.id
          subscribeIssueCollections(issue: issue)
        }
      )
      .store(in: &issueSupportCancellables)

    if issue.id != issue.key {
      subscribeIssueCollections(issue: issue)
    }
  }

  private func subscribeIssueCollections(issue: VectorIssueRow) {
    guard activeIssueCollectionsId != issue.id else {
      return
    }

    activeIssueCollectionsId = issue.id
    subscribedComments = []
    pendingComments = [:]
    comments = []
    assignments = []
    issueActivity = []

    repository.comments(issueId: issue.id)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { _ in },
        receiveValue: { [weak self] comments in
          self?.subscribedComments = comments
          self?.applyCommentSnapshot()
        }
      )
      .store(in: &issueSupportCancellables)

    repository.assignments(issueId: issue.id)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { _ in },
        receiveValue: { [weak self] assignments in
          self?.assignments = assignments
        }
      )
      .store(in: &issueSupportCancellables)

    repository.issueActivity(issueId: issue.id)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { _ in },
        receiveValue: { [weak self] activity in
          self?.issueActivity = activity
        }
      )
      .store(in: &issueSupportCancellables)
  }

  public func loadDocument(_ document: VectorDocument) {
    if activeDocumentId == document.id, documentDetailCancellable != nil {
      if selectedDocument?.id != document.id {
        selectedDocument = currentDocument(document.id) ?? document
      }
      return
    }

    documentDetailCancellable = nil
    clearDocumentContentLoad()
    activeDocumentId = document.id
    selectedDocument = currentDocument(document.id) ?? document

    documentDetailCancellable = repository.document(documentId: document.id)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self] completion in
          if case let .failure(error) = completion {
            self?.errorMessage = error.localizedDescription
          }
        },
        receiveValue: { [weak self] document in
          guard let self else { return }
          if let document {
            updateDocumentCache(document)
            if let version = document.contentVersion {
              if activeDocumentContentVersion == version,
                 let loadedContent = selectedDocument?.content,
                 !isLoadingDocumentContent
              {
                selectedDocument = document.withLoadedContent(loadedContent)
              } else if activeDocumentContentVersion == version, isLoadingDocumentContent {
                selectedDocument = document
              } else {
                selectedDocument = document
                loadDocumentContent(document, version: version)
              }
            } else {
              clearDocumentContentLoad()
              selectedDocument = document
            }
          }
        }
      )
  }

  public func retryDocumentContent() {
    guard let document = selectedDocument,
          let version = document.contentVersion
    else { return }
    loadDocumentContent(document, version: version)
  }

  private func loadDocumentContent(_ document: VectorDocument, version: String) {
    documentContentPageCancellable?.cancel()
    let loadId = UUID()
    documentContentLoadId = loadId
    activeDocumentContentVersion = version
    isLoadingDocumentContent = true
    documentContentError = nil
    loadDocumentContentPage(
      documentId: document.id,
      version: version,
      cursor: nil,
      chunks: [],
      loadId: loadId
    )
  }

  private func loadDocumentContentPage(
    documentId: VectorID,
    version: String,
    cursor: String?,
    chunks: [VectorDocumentContentChunk],
    loadId: UUID
  ) {
    documentContentPageCancellable = repository.documentContentPage(
      documentId: documentId,
      version: version,
      pageSize: 3,
      cursor: cursor
    )
    .prefix(1)
    .receive(on: DispatchQueue.main)
    .sink(
      receiveCompletion: { [weak self] completion in
        guard let self,
              documentContentLoadId == loadId,
              case let .failure(error) = completion
        else { return }
        isLoadingDocumentContent = false
        documentContentError = error.localizedDescription
      },
      receiveValue: { [weak self] page in
        guard let self,
              documentContentLoadId == loadId,
              activeDocumentId == documentId,
              activeDocumentContentVersion == version
        else { return }
        let loadedChunks = chunks + page.page
        if page.isDone {
          let orderedChunks = loadedChunks.sorted { $0.chunkIndex < $1.chunkIndex }
          guard orderedChunks.indices.allSatisfy({ orderedChunks[$0].chunkIndex == $0 }) else {
            isLoadingDocumentContent = false
            documentContentError = "This document is missing part of its content. Try loading it again."
            return
          }
          guard let current = selectedDocument,
                current.id == documentId,
                current.contentVersion == version
          else { return }
          selectedDocument = current.withLoadedContent(orderedChunks.map(\.content).joined())
          isLoadingDocumentContent = false
          documentContentError = nil
          return
        }
        guard let nextCursor = page.nextCursor else {
          isLoadingDocumentContent = false
          documentContentError = "Vector could not load the rest of this document. Try again."
          return
        }
        loadDocumentContentPage(
          documentId: documentId,
          version: version,
          cursor: nextCursor,
          chunks: loadedChunks,
          loadId: loadId
        )
      }
    )
  }

  private func clearDocumentContentLoad() {
    documentContentPageCancellable?.cancel()
    documentContentPageCancellable = nil
    activeDocumentContentVersion = nil
    documentContentLoadId = nil
    isLoadingDocumentContent = false
    documentContentError = nil
  }

  public func loadSettings() {
    guard !isSettingsSubscribed else {
      return
    }

    isSettingsSubscribed = true
    settingsErrorMessage = nil
    settingsCancellables.removeAll()

    repository.userStatus()
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self] completion in
          if case let .failure(error) = completion {
            self?.settingsErrorMessage = error.localizedDescription
            self?.isSettingsSubscribed = false
          }
        },
        receiveValue: { [weak self] status in
          self?.applySubscribedUserStatus(status)
        }
      )
      .store(in: &settingsCancellables)

    repository.notificationPreferences()
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self] completion in
          if case let .failure(error) = completion {
            self?.settingsErrorMessage = error.localizedDescription
            self?.isSettingsSubscribed = false
          }
        },
        receiveValue: { [weak self] preferences in
          self?.notificationPreferences = preferences
        }
      )
      .store(in: &settingsCancellables)

    repository.mobilePushTokens()
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self] completion in
          if case let .failure(error) = completion {
            self?.settingsErrorMessage = error.localizedDescription
            self?.isSettingsSubscribed = false
          }
        },
        receiveValue: { [weak self] tokens in
          self?.mobilePushTokens = tokens
        }
      )
      .store(in: &settingsCancellables)
  }

  public func loadWorkspaceOptions() {
    subscribeToWorkspaceOptionsIfNeeded()
  }

  public func setPresence(_ presence: VectorPresenceStatus) {
    let previous = userStatus
    let optimisticStatus = VectorUserStatus(
      presence: presence,
      customText: previous?.customText,
      customEmoji: previous?.customEmoji,
      clearsAt: previous?.clearsAt,
      updatedAt: Date().timeIntervalSince1970 * 1000
    )
    let token = beginOptimisticUserStatus(
      optimisticStatus,
      pendingPresence: presence,
      confirmationMode: .presence
    )

    Task {
      do {
        try await repository.setPresence(presence)
        await MainActor.run {
          self.finishUserStatusMutation(token: token)
        }
      } catch {
        await MainActor.run {
          self.failUserStatusMutation(token: token, previous: previous, error: error)
        }
      }
    }
  }

  public func setCustomStatus(text: String, emoji: String, clearsAt: Double?) {
    let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
    let trimmedEmoji = emoji.trimmingCharacters(in: .whitespacesAndNewlines)
    let previous = userStatus
    let optimisticStatus = VectorUserStatus(
      presence: previous?.presence ?? .online,
      customText: trimmedText.isEmpty ? nil : trimmedText,
      customEmoji: trimmedEmoji.isEmpty ? nil : trimmedEmoji,
      clearsAt: clearsAt,
      updatedAt: Date().timeIntervalSince1970 * 1000
    )
    let token = beginOptimisticUserStatus(
      optimisticStatus,
      pendingPresence: nil,
      confirmationMode: .fullStatus
    )

    Task {
      do {
        try await repository.setCustomStatus(
          text: trimmedText.isEmpty ? nil : trimmedText,
          emoji: trimmedEmoji.isEmpty ? nil : trimmedEmoji,
          clearsAt: clearsAt
        )
        await MainActor.run {
          self.finishUserStatusMutation(token: token)
        }
      } catch {
        await MainActor.run {
          self.failUserStatusMutation(token: token, previous: previous, error: error)
        }
      }
    }
  }

  public func clearCustomStatus() {
    let previous = userStatus
    let optimisticStatus = VectorUserStatus(
      presence: previous?.presence ?? .online,
      updatedAt: Date().timeIntervalSince1970 * 1000
    )
    let token = beginOptimisticUserStatus(
      optimisticStatus,
      pendingPresence: nil,
      confirmationMode: .fullStatus
    )

    Task {
      do {
        try await repository.clearCustomStatus()
        await MainActor.run {
          self.finishUserStatusMutation(token: token)
        }
      } catch {
        await MainActor.run {
          self.failUserStatusMutation(token: token, previous: previous, error: error)
        }
      }
    }
  }

  private func beginOptimisticUserStatus(
    _ status: VectorUserStatus,
    pendingPresence: VectorPresenceStatus?,
    confirmationMode: OptimisticUserStatusGuard.ConfirmationMode
  ) -> Int {
    userStatusMutationSequence += 1
    let token = userStatusMutationSequence
    optimisticUserStatusGuard = OptimisticUserStatusGuard(
      token: token,
      status: status,
      confirmationMode: confirmationMode
    )
    self.pendingPresence = pendingPresence
    isUpdatingUserStatus = true
    applyDisplayedUserStatus(status)
    return token
  }

  private func finishUserStatusMutation(token: Int) {
    guard optimisticUserStatusGuard?.token == token else {
      return
    }

    pendingPresence = nil
    isUpdatingUserStatus = false

    Task { [weak self] in
      try? await Task.sleep(nanoseconds: 5_000_000_000)
      await MainActor.run {
        guard self?.optimisticUserStatusGuard?.token == token else {
          return
        }
        self?.optimisticUserStatusGuard = nil
      }
    }
  }

  private func failUserStatusMutation(token: Int, previous: VectorUserStatus?, error: Error) {
    guard optimisticUserStatusGuard?.token == token else {
      return
    }

    optimisticUserStatusGuard = nil
    pendingPresence = nil
    isUpdatingUserStatus = false
    applyDisplayedUserStatus(previous)
    settingsErrorMessage = error.localizedDescription
  }

  private func applySubscribedUserStatus(_ status: VectorUserStatus?) {
    if let guardedStatus = optimisticUserStatusGuard {
      if userStatus(status, matches: guardedStatus) {
        optimisticUserStatusGuard = nil
        pendingPresence = nil
        isUpdatingUserStatus = false
      } else {
        return
      }
    }

    applyDisplayedUserStatus(status)
  }

  private func applyDisplayedUserStatus(_ status: VectorUserStatus?) {
    if userStatus != status {
      userStatus = status
    }
    syncCurrentUser()
  }

  private func userStatus(_ lhs: VectorUserStatus?, matches guardedStatus: OptimisticUserStatusGuard) -> Bool {
    guard let lhs else {
      return false
    }

    let rhs = guardedStatus.status
    if guardedStatus.confirmationMode == .presence {
      return lhs.presence == rhs.presence
    }

    return lhs.presence == rhs.presence
      && normalizedStatusText(lhs.customText) == normalizedStatusText(rhs.customText)
      && normalizedStatusText(lhs.customEmoji) == normalizedStatusText(rhs.customEmoji)
      && lhs.clearsAt == rhs.clearsAt
  }

  private func normalizedStatusText(_ value: String?) -> String {
    value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  }

  public func setPushEnabled(for category: VectorNotificationCategory, isEnabled: Bool) {
    let previous = notificationPreferences
    let existing = notificationPreference(for: category)
    let nextPreference = VectorNotificationPreference(
      category: existing.category,
      inAppEnabled: existing.inAppEnabled,
      emailEnabled: existing.emailEnabled,
      pushEnabled: isEnabled
    )
    notificationPreferences = mergedNotificationPreferences(replacing: [nextPreference])

    Task {
      do {
        try await repository.updateNotificationPreference(nextPreference)
      } catch {
        await MainActor.run {
          self.notificationPreferences = previous
          self.settingsErrorMessage = error.localizedDescription
        }
      }
    }
  }

  public func setPushEnabled(for categories: [VectorNotificationCategory], isEnabled: Bool) {
    configurePushPreferences(
      enabledCategories: isEnabled ? Set(categories) : [],
      disabledCategories: isEnabled ? [] : Set(categories)
    )
  }

  public func configurePushPreferences(
    enabledCategories: Set<VectorNotificationCategory>,
    disabledCategories: Set<VectorNotificationCategory>
  ) {
    let categories = enabledCategories.union(disabledCategories)
    guard !categories.isEmpty else {
      return
    }
    let previous = notificationPreferences
    let nextPreferences = categories.map {
      let existing = notificationPreference(for: $0)
      return VectorNotificationPreference(
        category: existing.category,
        inAppEnabled: existing.inAppEnabled,
        emailEnabled: existing.emailEnabled,
        pushEnabled: enabledCategories.contains($0)
      )
    }
    notificationPreferences = mergedNotificationPreferences(replacing: nextPreferences)

    Task {
      do {
        for preference in nextPreferences {
          try await repository.updateNotificationPreference(preference)
        }
      } catch {
        await MainActor.run {
          self.notificationPreferences = previous
          self.settingsErrorMessage = error.localizedDescription
        }
      }
    }
  }

  public func upsertMobilePushToken(_ token: VectorPushDeviceToken) {
    Task {
      do {
        try await repository.upsertMobilePushToken(
          token,
          bundleId: Bundle.main.bundleIdentifier,
          deviceLabel: "iPhone"
        )
      } catch {
        await MainActor.run {
          self.settingsErrorMessage = error.localizedDescription
        }
      }
    }
  }

  public func removeMobilePushToken(_ token: VectorPushDeviceToken) {
    Task {
      do {
        try await repository.removeMobilePushToken(token)
      } catch {
        await MainActor.run {
          self.settingsErrorMessage = error.localizedDescription
        }
      }
    }
  }

  public func unregisterMobilePushToken(_ token: VectorPushDeviceToken) async {
    do {
      try await repository.removeMobilePushToken(token)
    } catch {
      await MainActor.run {
        self.settingsErrorMessage = error.localizedDescription
      }
    }
  }

  public func updateIssueTitle(issueId: VectorID, title: String) async throws {
    let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedTitle.isEmpty else {
      return
    }

    let previousIssues = issues
    let previousSelectedIssue = selectedIssue
    updateIssue(issueId) { $0.withTitle(trimmedTitle) }

    do {
      try await repository.updateTitle(issueId: issueId, title: trimmedTitle)
    } catch {
      issues = previousIssues
      selectedIssue = previousSelectedIssue
      errorMessage = error.localizedDescription
      throw error
    }
  }

  public func updateIssueDescription(issueId: VectorID, description: String) async throws {
    let trimmedDescription = description.trimmingCharacters(in: .whitespacesAndNewlines)
    let nextDescription = trimmedDescription.isEmpty ? nil : description
    let previousIssues = issues
    let previousSelectedIssue = selectedIssue
    updateIssue(issueId) { $0.withDescription(nextDescription) }

    do {
      try await repository.updateDescription(issueId: issueId, description: nextDescription)
    } catch {
      issues = previousIssues
      selectedIssue = previousSelectedIssue
      errorMessage = error.localizedDescription
      throw error
    }
  }

  public func updateDocument(documentId: VectorID, title: String, content: String) async throws {
    let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedTitle.isEmpty else {
      throw VectorMobileError.validation("Title is required.")
    }

    let previousDocuments = documents
    let previousDocumentCache = documentCache
    let previousDocumentPages = documentPages
    let previousFolderDocumentPages = folderDocumentPages
    let previousSelectedDocument = selectedDocument
    let nextDocument = (selectedDocument ?? currentDocument(documentId))?.with(title: trimmedTitle, content: content)
    if let nextDocument {
      updateDocumentCache(nextDocument)
      selectedDocument = nextDocument
    }

    do {
      try await repository.updateDocument(documentId: documentId, title: trimmedTitle, content: content)
    } catch {
      documents = previousDocuments
      documentCache = previousDocumentCache
      documentPages = previousDocumentPages
      folderDocumentPages = previousFolderDocumentPages
      selectedDocument = previousSelectedDocument
      errorMessage = error.localizedDescription
      throw error
    }
  }

  public func changeIssueWorkflowState(issueId: VectorID, state: VectorState) async throws {
    let previousIssues = issues
    let previousSelectedIssue = selectedIssue
    let previousAssignments = assignments
    updateIssue(issueId) { $0.withWorkflowState(state) }
    assignments = assignments.map {
      VectorIssueAssignment(
        id: $0.id,
        assigneeId: $0.assigneeId,
        assigneeName: $0.assigneeName,
        assigneeEmail: $0.assigneeEmail,
        assigneeImage: $0.assigneeImage,
        stateId: state.id,
        stateName: state.name,
        stateIcon: state.icon,
        stateColor: state.color,
        stateType: state.type,
        note: $0.note
      )
    }

    do {
      try await repository.changeWorkflowState(issueId: issueId, stateId: state.id)
    } catch {
      issues = previousIssues
      selectedIssue = previousSelectedIssue
      assignments = previousAssignments
      errorMessage = error.localizedDescription
      throw error
    }
  }

  public func changeIssuePriority(issueId: VectorID, priority: VectorPriority) async throws {
    let previousIssues = issues
    let previousSelectedIssue = selectedIssue
    updateIssue(issueId) { $0.withPriority(priority) }

    do {
      try await repository.changePriority(issueId: issueId, priorityId: priority.id)
    } catch {
      issues = previousIssues
      selectedIssue = previousSelectedIssue
      errorMessage = error.localizedDescription
      throw error
    }
  }

  public func updateIssueAssignees(issueId: VectorID, assigneeIds: [VectorID]) async throws {
    let previousIssues = issues
    let previousSelectedIssue = selectedIssue
    let previousAssignments = assignments
    let selectedMembers = assigneeIds.compactMap { assigneeId in
      workspaceOptions?.members.first { $0.userId == assigneeId }
    }
    let issue = currentIssue(issueId)
    let state = workspaceOptions?.issueStates.first { $0.id == issue?.workflowStateId }
    updateIssue(issueId) { $0.withPrimaryAssignee(selectedMembers.first) }
    assignments = selectedMembers.map { member in
      VectorIssueAssignment(
        id: "optimistic-\(issueId)-\(member.userId ?? member.id)",
        assigneeId: member.userId,
        assigneeName: member.displayName,
        assigneeEmail: member.email,
        assigneeImage: member.image,
        stateId: issue?.workflowStateId,
        stateName: state?.name ?? issue?.workflowStateName,
        stateIcon: state?.icon ?? issue?.workflowStateIcon,
        stateColor: state?.color ?? issue?.workflowStateColor,
        stateType: state?.type ?? issue?.workflowStateType
      )
    }

    do {
      try await repository.updateAssignees(issueId: issueId, assigneeIds: assigneeIds)
    } catch {
      issues = previousIssues
      selectedIssue = previousSelectedIssue
      assignments = previousAssignments
      errorMessage = error.localizedDescription
      throw error
    }
  }

  public func changeIssueProject(issueId: VectorID, project: VectorProject?) async throws {
    let previousIssues = issues
    let previousSelectedIssue = selectedIssue
    updateIssue(issueId) { $0.withProject(project) }

    do {
      try await repository.changeProject(issueId: issueId, projectId: project?.id)
    } catch {
      issues = previousIssues
      selectedIssue = previousSelectedIssue
      errorMessage = error.localizedDescription
      throw error
    }
  }

  public func changeIssueTeam(issueId: VectorID, team: VectorTeam?) async throws {
    let previousIssues = issues
    let previousSelectedIssue = selectedIssue
    updateIssue(issueId) { $0.withTeam(team) }

    do {
      try await repository.changeTeam(issueId: issueId, teamId: team?.id)
    } catch {
      issues = previousIssues
      selectedIssue = previousSelectedIssue
      errorMessage = error.localizedDescription
      throw error
    }
  }

  public func changeIssueVisibility(issueId: VectorID, visibility: String) async throws {
    let previousIssues = issues
    let previousSelectedIssue = selectedIssue
    updateIssue(issueId) { $0.withVisibility(visibility) }

    do {
      try await repository.changeVisibility(issueId: issueId, visibility: visibility)
    } catch {
      issues = previousIssues
      selectedIssue = previousSelectedIssue
      errorMessage = error.localizedDescription
      throw error
    }
  }

  public func addIssueComment(issueId: VectorID, body: String, parentId: VectorID? = nil) async throws {
    let trimmedBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedBody.isEmpty else {
      return
    }

    let optimisticId = "optimistic-\(UUID().uuidString)"
    pendingComments[optimisticId] = VectorComment(
      id: optimisticId,
      body: body,
      author: currentUser ?? optimisticAuthenticatedUser,
      parentId: parentId,
      creationTime: Date().timeIntervalSince1970 * 1000
    )
    applyCommentSnapshot()

    Task { @MainActor [weak self] in
      guard let self else {
        return
      }

      do {
        let serverId = try await repository.addComment(issueId: issueId, body: trimmedBody, parentId: parentId)
        guard selectedIssue?.id == issueId else {
          pendingComments.removeValue(forKey: optimisticId)
          return
        }

        let subscribedIds = Set(subscribedComments.map(\.id))
        if subscribedIds.contains(serverId) {
          pendingComments.removeValue(forKey: optimisticId)
        } else if let pending = pendingComments.removeValue(forKey: optimisticId) {
          pendingComments[serverId] = pending.withId(serverId)
        }
        applyCommentSnapshot()
      } catch {
        pendingComments.removeValue(forKey: optimisticId)
        applyCommentSnapshot()
        errorMessage = error.localizedDescription
      }
    }
  }

  public func createIssue(
    title: String,
    description: String?,
    project: VectorProject?,
    team: VectorTeam?,
    state: VectorState?,
    priority: VectorPriority?,
    assigneeIds: [VectorID]
  ) async throws -> VectorCreateIssueResult {
    let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedTitle.isEmpty else {
      throw VectorMobileError.validation("Title is required.")
    }

    let trimmedDescription = description?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
    let result = try await repository.createIssue(
      orgSlug: configuration.orgSlug,
      title: trimmedTitle,
      description: trimmedDescription,
      projectId: project?.id,
      teamId: nil,
      stateId: state?.id,
      priorityId: priority?.id,
      assigneeIds: assigneeIds
    )
    if let team, team.id != project?.teamId {
      do {
        try await repository.changeTeam(issueId: result.issueId, teamId: team.id)
      } catch {
        settingsErrorMessage = "Issue \(result.key) was created, but the team could not be changed."
      }
    }
    return result
  }

  public func openWebURL(for issue: VectorIssueRow) -> URL {
    configuration.webURL(path: "/\(configuration.orgSlug)/issues/\(issue.key)")
  }

  public func openWebURL(for project: VectorProject) -> URL {
    configuration.webURL(path: "/\(configuration.orgSlug)/projects/\(project.key)")
  }

  public func openWebURL(for team: VectorTeam) -> URL {
    configuration.webURL(path: "/\(configuration.orgSlug)/teams/\(team.key)")
  }

  public func openWebURL(for document: VectorDocument) -> URL {
    configuration.webURL(path: "/\(configuration.orgSlug)/documents/\(document.id)")
  }

  public var canLoadMoreIssues: Bool {
    canLoadMore(issuePagination[issueScope])
  }

  public var isLoadingMoreIssues: Bool {
    issuePagination[issueScope]?.isLoadingMore ?? false
  }

  public var canLoadMoreProjects: Bool {
    canLoadMore(projectPagination[projectScope])
  }

  public var isLoadingMoreProjects: Bool {
    projectPagination[projectScope]?.isLoadingMore ?? false
  }

  public var canLoadMoreTeams: Bool {
    canLoadMore(teamPagination[projectScope])
  }

  public var isLoadingMoreTeams: Bool {
    teamPagination[projectScope]?.isLoadingMore ?? false
  }

  public var canLoadMoreDocuments: Bool {
    canLoadMore(documentPagination)
      || loadedDocumentFolders.contains { canLoadMore(folderDocumentPagination[$0.id]) }
      || canLoadMore(documentFolderPagination)
  }

  public var isLoadingMoreDocuments: Bool {
    documentPagination.isLoadingMore
      || folderDocumentPagination.values.contains(where: \.isLoadingMore)
      || documentFolderPagination.isLoadingMore
  }

  public var canLoadMoreInboxNotifications: Bool {
    canLoadMore(inboxNotificationPagination)
  }

  public var isLoadingMoreInboxNotifications: Bool {
    inboxNotificationPagination.isLoadingMore
  }

  public var canLoadMoreInboxActivity: Bool {
    canLoadMore(inboxActivityPagination)
  }

  public var isLoadingMoreInboxActivity: Bool {
    inboxActivityPagination.isLoadingMore
  }

  public func loadMoreIssues() {
    guard let cursor = nextCursor(issuePagination[issueScope]) else {
      return
    }
    subscribeToIssuePage(scope: issueScope, cursor: cursor)
  }

  public func loadMoreProjects() {
    guard let cursor = nextCursor(projectPagination[projectScope]) else {
      return
    }
    subscribeToProjectPage(scope: projectScope, cursor: cursor)
  }

  public func loadMoreTeams() {
    guard let cursor = nextCursor(teamPagination[projectScope]) else {
      return
    }
    subscribeToTeamPage(scope: projectScope, cursor: cursor)
  }

  public func loadMoreDocuments() {
    if let cursor = nextCursor(documentPagination) {
      subscribeToDocumentPage(cursor: cursor)
      return
    }
    for folder in loadedDocumentFolders {
      if let cursor = nextCursor(folderDocumentPagination[folder.id]) {
        subscribeToFolderDocumentPage(folderId: folder.id, cursor: cursor)
        return
      }
    }
    if let cursor = nextCursor(documentFolderPagination) {
      subscribeToDocumentFolderPage(cursor: cursor)
    }
  }

  public func loadMoreInboxNotifications() {
    guard let cursor = nextCursor(inboxNotificationPagination) else {
      return
    }
    subscribeToInboxNotificationPage(cursor: cursor)
  }

  public func loadMoreInboxActivity() {
    guard let cursor = nextCursor(inboxActivityPagination) else {
      return
    }
    subscribeToInboxActivityPage(cursor: cursor)
  }

  private func subscribeToIssuePage(scope: VectorIssueScope, cursor: String?) {
    let key = pageKey(cursor)
    guard issueListCancellables[scope]?[key] == nil else {
      return
    }

    markLoading(cursor: cursor, pagination: &issuePagination[scope, default: PaginationState()])
    issueListCancellables[scope, default: [:]][key] = repository
      .issuesPage(orgSlug: configuration.orgSlug, scope: scope, pageSize: pageSize, cursor: cursor)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self, scope, key] completion in
          self?.handlePageCompletion(completion, key: key, active: self?.issueScope == scope) {
            self?.issueListCancellables[scope]?[key] = nil
            self?.issuePagination[scope, default: PaginationState()].isLoadingMore = false
            if key == self?.rootPageKey {
              self?.isLoading = false
            }
          }
        },
        receiveValue: { [weak self, scope, key] page in
          guard let self else { return }
          issuePages[scope, default: [:]][key] = page.page
          appendPageKey(key, to: &issuePageOrder[scope, default: []])
          updatePagination(page.nextCursor, isDone: page.isDone, key: key, order: issuePageOrder[scope] ?? [], state: &issuePagination[scope, default: PaginationState()])
          rebuildIssues(scope: scope)
        }
      )
  }

  private func subscribeToProjectPage(scope: VectorProjectScope, cursor: String?) {
    let key = pageKey(cursor)
    guard projectListCancellables[scope]?[key] == nil else {
      return
    }

    markLoading(cursor: cursor, pagination: &projectPagination[scope, default: PaginationState()])
    projectListCancellables[scope, default: [:]][key] = repository
      .projectsPage(orgSlug: configuration.orgSlug, scope: scope, pageSize: pageSize, cursor: cursor)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self, scope, key] completion in
          self?.handlePageCompletion(completion, key: key, active: self?.projectScope == scope) {
            self?.projectListCancellables[scope]?[key] = nil
            self?.projectPagination[scope, default: PaginationState()].isLoadingMore = false
          }
        },
        receiveValue: { [weak self, scope, key] page in
          guard let self else { return }
          projectPages[scope, default: [:]][key] = page.page
          appendPageKey(key, to: &projectPageOrder[scope, default: []])
          updatePagination(page.nextCursor, isDone: page.isDone, key: key, order: projectPageOrder[scope] ?? [], state: &projectPagination[scope, default: PaginationState()])
          rebuildProjects(scope: scope)
        }
      )
  }

  private func subscribeToTeamPage(scope: VectorProjectScope, cursor: String?) {
    let key = pageKey(cursor)
    guard teamListCancellables[scope]?[key] == nil else {
      return
    }

    markLoading(cursor: cursor, pagination: &teamPagination[scope, default: PaginationState()])
    teamListCancellables[scope, default: [:]][key] = repository
      .teamsPage(orgSlug: configuration.orgSlug, scope: scope, pageSize: pageSize, cursor: cursor)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self, scope, key] completion in
          self?.handlePageCompletion(completion, key: key, active: self?.projectScope == scope) {
            self?.teamListCancellables[scope]?[key] = nil
            self?.teamPagination[scope, default: PaginationState()].isLoadingMore = false
          }
        },
        receiveValue: { [weak self, scope, key] page in
          guard let self else { return }
          teamPages[scope, default: [:]][key] = page.page
          appendPageKey(key, to: &teamPageOrder[scope, default: []])
          updatePagination(page.nextCursor, isDone: page.isDone, key: key, order: teamPageOrder[scope] ?? [], state: &teamPagination[scope, default: PaginationState()])
          rebuildTeams(scope: scope)
        }
      )
  }

  private func subscribeToDocumentPage(cursor: String?) {
    let key = pageKey(cursor)
    guard documentListCancellables[key] == nil else {
      return
    }

    markLoading(cursor: cursor, pagination: &documentPagination)
    documentListCancellables[key] = repository
      .documentsPage(orgSlug: configuration.orgSlug, pageSize: pageSize, cursor: cursor)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self, key] completion in
          if case let .failure(error) = completion {
            self?.isLoadingDocuments = false
            self?.documentListError = error.localizedDescription
          }
          self?.handlePageCompletion(completion, key: key, active: true) {
            self?.documentListCancellables[key] = nil
            self?.documentPagination.isLoadingMore = false
          }
        },
        receiveValue: { [weak self, key] page in
          guard let self else { return }
          documentListError = nil
          documentPages[key] = page.page
          appendPageKey(key, to: &documentPageOrder)
          updatePagination(page.nextCursor, isDone: page.isDone, key: key, order: documentPageOrder, state: &documentPagination)
          if key == rootPageKey {
            didReceiveInitialDocumentPage = true
          }
          rebuildDocuments()
          finishInitialDocumentLoadIfReady()
        }
      )
  }

  private func subscribeToDocumentFolderPage(cursor: String?) {
    let key = pageKey(cursor)
    guard documentFolderListCancellables[key] == nil else {
      return
    }

    markLoading(cursor: cursor, pagination: &documentFolderPagination)
    documentFolderListCancellables[key] = repository
      .documentFoldersPage(orgSlug: configuration.orgSlug, pageSize: pageSize, cursor: cursor)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self, key] completion in
          if case let .failure(error) = completion {
            self?.isLoadingDocuments = false
            self?.documentListError = error.localizedDescription
          }
          self?.handlePageCompletion(completion, key: key, active: true) {
            self?.documentFolderListCancellables[key] = nil
            self?.documentFolderPagination.isLoadingMore = false
          }
        },
        receiveValue: { [weak self, key] page in
          guard let self else { return }
          documentListError = nil
          documentFolderPages[key] = page.page
          appendPageKey(key, to: &documentFolderPageOrder)
          updatePagination(
            page.nextCursor,
            isDone: page.isDone,
            key: key,
            order: documentFolderPageOrder,
            state: &documentFolderPagination
          )
          if key == rootPageKey {
            didReceiveInitialDocumentFolderPage = true
          }
          for folder in page.page {
            if folderDocumentListCancellables[folder.id]?[rootPageKey] == nil {
              if isLoadingDocuments {
                pendingInitialFolderDocumentIds.insert(folder.id)
              }
              subscribeToFolderDocumentPage(folderId: folder.id, cursor: nil)
            }
          }
          finishInitialDocumentLoadIfReady()
        }
      )
  }

  private func subscribeToFolderDocumentPage(folderId: VectorID, cursor: String?) {
    let key = pageKey(cursor)
    guard folderDocumentListCancellables[folderId]?[key] == nil else {
      return
    }

    markLoading(cursor: cursor, pagination: &folderDocumentPagination[folderId, default: PaginationState()])
    folderDocumentListCancellables[folderId, default: [:]][key] = repository
      .folderDocumentsPage(
        orgSlug: configuration.orgSlug,
        folderId: folderId,
        pageSize: pageSize,
        cursor: cursor
      )
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self, folderId, key] completion in
          if case let .failure(error) = completion {
            self?.pendingInitialFolderDocumentIds.remove(folderId)
            self?.isLoadingDocuments = false
            self?.documentListError = error.localizedDescription
          }
          self?.handlePageCompletion(completion, key: key, active: true) {
            self?.folderDocumentListCancellables[folderId]?[key] = nil
            self?.folderDocumentPagination[folderId, default: PaginationState()].isLoadingMore = false
          }
        },
        receiveValue: { [weak self, folderId, key] page in
          guard let self else { return }
          documentListError = nil
          folderDocumentPages[folderId, default: [:]][key] = page.page
          appendPageKey(key, to: &folderDocumentPageOrder[folderId, default: []])
          updatePagination(
            page.nextCursor,
            isDone: page.isDone,
            key: key,
            order: folderDocumentPageOrder[folderId] ?? [],
            state: &folderDocumentPagination[folderId, default: PaginationState()]
          )
          if key == rootPageKey {
            pendingInitialFolderDocumentIds.remove(folderId)
          }
          rebuildDocuments()
          finishInitialDocumentLoadIfReady()
        }
      )
  }

  private func finishInitialDocumentLoadIfReady() {
    guard didReceiveInitialDocumentPage,
          didReceiveInitialDocumentFolderPage,
          pendingInitialFolderDocumentIds.isEmpty
    else { return }
    isLoadingDocuments = false
  }

  private func subscribeToInboxNotificationPage(cursor: String?) {
    let key = pageKey(cursor)
    guard inboxNotificationCancellables[key] == nil else {
      return
    }

    markLoading(cursor: cursor, pagination: &inboxNotificationPagination)
    inboxNotificationCancellables[key] = repository
      .inboxNotificationsPage(pageSize: pageSize, cursor: cursor)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self, key] completion in
          self?.handlePageCompletion(completion, key: key, active: true) {
            self?.inboxNotificationCancellables[key] = nil
            self?.inboxNotificationPagination.isLoadingMore = false
          }
        },
        receiveValue: { [weak self, key] page in
          guard let self else { return }
          inboxNotificationPages[key] = page.page
          appendPageKey(key, to: &inboxNotificationPageOrder)
          updatePagination(page.nextCursor, isDone: page.isDone, key: key, order: inboxNotificationPageOrder, state: &inboxNotificationPagination)
          rebuildInboxNotifications()
        }
      )
  }

  private func subscribeToInboxActivityPage(cursor: String?) {
    let key = pageKey(cursor)
    guard inboxActivityCancellables[key] == nil else {
      return
    }

    markLoading(cursor: cursor, pagination: &inboxActivityPagination)
    inboxActivityCancellables[key] = repository
      .inboxActivityPage(orgSlug: configuration.orgSlug, pageSize: pageSize, cursor: cursor)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self, key] completion in
          self?.handlePageCompletion(completion, key: key, active: true) {
            self?.inboxActivityCancellables[key] = nil
            self?.inboxActivityPagination.isLoadingMore = false
          }
        },
        receiveValue: { [weak self, key] page in
          guard let self else { return }
          inboxActivityPages[key] = page.items
          appendPageKey(key, to: &inboxActivityPageOrder)
          updatePagination(page.nextCursor, isDone: page.isDone, key: key, order: inboxActivityPageOrder, state: &inboxActivityPagination)
          rebuildInboxActivity()
        }
      )
  }

  private func markLoading(cursor: String?, pagination: inout PaginationState) {
    guard cursor != nil else {
      return
    }
    objectWillChange.send()
    pagination.isLoadingMore = true
  }

  private func updatePagination(_ cursor: String?, isDone: Bool, key: String, order: [String], state: inout PaginationState) {
    objectWillChange.send()
    guard order.last == key else {
      return
    }
    state.isLoadingMore = false
    state.continueCursor = cursor?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
    state.isDone = isDone || state.continueCursor == nil
  }

  private func handlePageCompletion(_ completion: Subscribers.Completion<Error>, key: String, active: Bool, cleanup: () -> Void) {
    if case let .failure(error) = completion {
      cleanup()
      if active {
        errorMessage = error.localizedDescription
        if key == rootPageKey {
          isLoading = false
        }
      }
    }
  }

  private func rebuildIssues(scope: VectorIssueScope) {
    let merged = uniqueItems(orderedPages(issuePages[scope] ?? [:], order: issuePageOrder[scope] ?? []), id: \.rowId)
    issueCache[scope] = merged
    if issueScope == scope {
      issues = merged
      isLoading = false
    }
  }

  private func rebuildProjects(scope: VectorProjectScope) {
    let merged = uniqueItems(orderedPages(projectPages[scope] ?? [:], order: projectPageOrder[scope] ?? []), id: \.id)
    projectCache[scope] = merged
    if projectScope == scope {
      projects = merged
    }
  }

  private func rebuildTeams(scope: VectorProjectScope) {
    let merged = uniqueItems(orderedPages(teamPages[scope] ?? [:], order: teamPageOrder[scope] ?? []), id: \.id)
    teamCache[scope] = merged
    if projectScope == scope {
      teams = merged
    }
  }

  private func rebuildDocuments() {
    var merged = orderedPages(documentPages, order: documentPageOrder)
    for folder in loadedDocumentFolders {
      merged += orderedPages(
        folderDocumentPages[folder.id] ?? [:],
        order: folderDocumentPageOrder[folder.id] ?? []
      )
    }
    documentCache = uniqueItems(merged, id: \.id)
    documents = documentCache
  }

  private var loadedDocumentFolders: [VectorDocumentFolder] {
    uniqueItems(
      orderedPages(documentFolderPages, order: documentFolderPageOrder),
      id: \.id
    )
  }

  private func rebuildInboxNotifications() {
    inboxNotificationCache = uniqueItems(orderedPages(inboxNotificationPages, order: inboxNotificationPageOrder), id: \.id)
    inboxNotifications = inboxNotificationCache
  }

  private func rebuildInboxActivity() {
    inboxActivityCache = uniqueItems(orderedPages(inboxActivityPages, order: inboxActivityPageOrder), id: \.id)
    inboxActivity = inboxActivityCache
  }

  private func applyCommentSnapshot() {
    let subscribedIds = Set(subscribedComments.map(\.id))
    pendingComments = pendingComments.filter { !subscribedIds.contains($0.key) }
    comments = uniqueItems(
      (subscribedComments + pendingComments.values).sorted { lhs, rhs in
        lhs.creationTime < rhs.creationTime
      },
      id: \.id
    )
  }

  private func pageKey(_ cursor: String?) -> String {
    cursor ?? rootPageKey
  }

  private func appendPageKey(_ key: String, to order: inout [String]) {
    guard !order.contains(key) else {
      return
    }
    order.append(key)
  }

  private func orderedPages<Item>(_ pages: [String: [Item]], order: [String]) -> [Item] {
    order.flatMap { pages[$0] ?? [] }
  }

  private func uniqueItems<Item, ID: Hashable>(_ items: [Item], id: KeyPath<Item, ID>) -> [Item] {
    var seen = Set<ID>()
    return items.filter { item in
      seen.insert(item[keyPath: id]).inserted
    }
  }

  private func canLoadMore(_ state: PaginationState?) -> Bool {
    guard let state else {
      return false
    }
    return !state.isDone && !state.isLoadingMore && state.continueCursor != nil
  }

  private func nextCursor(_ state: PaginationState?) -> String? {
    guard canLoadMore(state) else {
      return nil
    }
    return state?.continueCursor
  }

  private func currentIssue(_ issueId: VectorID) -> VectorIssueRow? {
    selectedIssue?.id == issueId ? selectedIssue : issues.first { $0.id == issueId }
  }

  private func currentDocument(_ documentId: VectorID) -> VectorDocument? {
    selectedDocument?.id == documentId ? selectedDocument : documents.first { $0.id == documentId }
  }

  private func notificationPreference(for category: VectorNotificationCategory) -> VectorNotificationPreference {
    notificationPreferences.first { $0.category == category } ?? defaultNotificationPreference(for: category)
  }

  private func mergedNotificationPreferences(
    replacing replacements: [VectorNotificationPreference]
  ) -> [VectorNotificationPreference] {
    var byCategory = Dictionary(uniqueKeysWithValues: notificationPreferences.map { ($0.category, $0) })
    for preference in replacements {
      byCategory[preference.category] = preference
    }
    return VectorNotificationCategory.allCases.compactMap { byCategory[$0] }
  }

  private func defaultNotificationPreference(for category: VectorNotificationCategory) -> VectorNotificationPreference {
    switch category {
    case .invites:
      VectorNotificationPreference(category: category, inAppEnabled: true, emailEnabled: true, pushEnabled: false)
    case .assignments, .mentions, .requests, .handoffs, .reviews:
      VectorNotificationPreference(category: category, inAppEnabled: true, emailEnabled: true, pushEnabled: true)
    case .comments, .workSessions, .attention, .reminders, .github:
      VectorNotificationPreference(category: category, inAppEnabled: true, emailEnabled: false, pushEnabled: true)
    case .teamStatusChanges:
      VectorNotificationPreference(category: category, inAppEnabled: true, emailEnabled: false, pushEnabled: false)
    case .unknown:
      VectorNotificationPreference(category: category, inAppEnabled: true, emailEnabled: false, pushEnabled: false)
    }
  }

  private func syncCurrentUser() {
    guard let authenticatedUser else {
      currentUser = nil
      return
    }

    let workspaceUser = workspaceOptions?.members.first { member in
      if let userId = member.userId, let sessionUserId = authenticatedUser.id, userId == sessionUserId {
        return true
      }
      if let email = member.email,
        let sessionEmail = authenticatedUser.email,
        email.caseInsensitiveCompare(sessionEmail) == .orderedSame
      {
        return true
      }
      return false
    }?.user

    currentUser = VectorUser(
      id: workspaceUser?.id ?? authenticatedUser.id ?? authenticatedUser.email ?? "current-user",
      name: workspaceUser?.name ?? authenticatedUser.displayName,
      email: workspaceUser?.email ?? authenticatedUser.email,
      image: workspaceUser?.image ?? authenticatedUser.image,
      status: userStatus ?? workspaceUser?.status
    )
  }

  private var optimisticAuthenticatedUser: VectorUser? {
    guard let authenticatedUser else {
      return nil
    }

    return VectorUser(
      id: authenticatedUser.id ?? authenticatedUser.email ?? "current-user",
      name: authenticatedUser.displayName,
      email: authenticatedUser.email,
      image: authenticatedUser.image,
      status: userStatus
    )
  }

  private func updateIssue(_ issueId: VectorID, transform: (VectorIssueRow) -> VectorIssueRow) {
    issues = issues.map { issue in
      issue.id == issueId ? transform(issue) : issue
    }
    if let selectedIssue, selectedIssue.id == issueId {
      self.selectedIssue = transform(selectedIssue)
    }
  }

  private func updateDocumentCache(_ document: VectorDocument) {
    documents = documents.map { existing in
      existing.id == document.id ? document : existing
    }
    documentCache = documentCache.map { existing in
      existing.id == document.id ? document : existing
    }
    for key in documentPages.keys {
      documentPages[key] = documentPages[key]?.map { existing in
        existing.id == document.id ? document : existing
      }
    }
    for (folderId, pages) in folderDocumentPages {
      for (key, documents) in pages {
        folderDocumentPages[folderId]?[key] = documents.map { existing in
          existing.id == document.id ? document : existing
        }
      }
    }
  }
}

private extension String {
  var nilIfEmpty: String? {
    isEmpty ? nil : self
  }
}

private extension VectorDocument {
  func with(title: String, content: String?) -> VectorDocument {
    VectorDocument(
      id: id,
      title: title,
      content: content,
      icon: icon,
      color: color,
      team: team,
      project: project,
      author: author,
      visibility: visibility,
      creationTime: creationTime,
      lastEditedAt: Date().timeIntervalSince1970 * 1000
    )
  }

  func withLoadedContent(_ content: String) -> VectorDocument {
    VectorDocument(
      id: id,
      title: title,
      content: content,
      contentVersion: contentVersion,
      icon: icon,
      color: color,
      team: team,
      project: project,
      author: author,
      visibility: visibility,
      creationTime: creationTime,
      lastEditedAt: updatedAt
    )
  }
}

private extension VectorComment {
  func withId(_ id: VectorID) -> VectorComment {
    VectorComment(
      id: id,
      body: body,
      author: author,
      parentId: parentId,
      creationTime: creationTime
    )
  }
}
