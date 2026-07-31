import Combine
@preconcurrency import ConvexMobile
import Foundation

struct VectorMutationResponse: Decodable {}

private struct VectorAddCommentResponse: Decodable {
  let commentId: VectorID
}

private struct VectorDelegateSessionResponse: Decodable {
  let liveActivityId: VectorID
}

private struct VectorStorageUploadResponse: Decodable {
  let storageId: VectorID
}

private struct VectorCreateReminderResponse: Decodable {
  let reminderRuleId: VectorID
}

public enum VectorConvexFunctions {
  public static let getOrganizations = "users:getOrganizations"
  public static let listRequestsPage = "requests/queries:list"
  public static let getRequestByKey = "requests/queries:getByKey"
  public static let getRequestByClientRequestId = "requests/queries:getByClientRequestId"
  public static let createRequest = "requests/mutations:create"
  public static let claimRequest = "requests/mutations:claim"
  public static let requestChanges = "requests/mutations:requestChanges"
  public static let completeRequest = "requests/mutations:complete"
  public static let listWorkPage = "work/queries:list"
  public static let getWorkByKey = "work/queries:getByKey"
  public static let createWork = "work/mutations:create"
  public static let startWork = "work/mutations:start"
  public static let setWorkStatus = "work/mutations:setStatus"
  public static let readyWorkForReview = "work/mutations:readyForReview"
  public static let completeWork = "work/mutations:complete"
  public static let respondToWorkHandoff = "work/mutations:respondToHandoff"
  public static let proposeWorkHandoff = "work/mutations:proposeHandoff"
  public static let raiseWorkAttention = "work/mutations:raiseAttention"
  public static let createTask = "tasks/mutations:create"
  public static let setTaskStatus = "tasks/mutations:setStatus"
  public static let listWorkSessions = "agentBridge/queries:listIssueLiveActivities"
  public static let listDelegationTargets = "agentBridge/queries:listDelegationTargets"
  public static let getAgentSessionSnapshot = "agentBridge/queries:getAgentSessionSnapshot"
  public static let delegateWorkSession = "agentBridge/mutations:delegateIssue"
  public static let sendAgentSessionMessage = "agentBridge/mutations:appendLiveMessage"
  public static let listIssuesPage = "issues/queries:listIssuesPage"
  public static let getIssueByKey = "issues/queries:getByKey"
  public static let listComments = "issues/queries:listComments"
  public static let getAssignments = "issues/queries:getAssignments"
  public static let createIssue = "issues/mutations:create"
  public static let addComment = "issues/mutations:addComment"
  public static let changeWorkflowState = "issues/mutations:changeWorkflowState"
  public static let changePriority = "issues/mutations:changePriority"
  public static let updateAssignees = "issues/mutations:updateAssignees"
  public static let updateTitle = "issues/mutations:updateTitle"
  public static let updateDescription = "issues/mutations:updateDescription"
  public static let changeProject = "issues/mutations:changeProject"
  public static let changeTeam = "issues/mutations:changeTeam"
  public static let changeVisibility = "issues/mutations:changeVisibility"
  public static let listProjectActivity = "activities/queries:listProjectActivity"
  public static let listTeamActivity = "activities/queries:listTeamActivity"
  public static let listIssueActivity = "activities/queries:listIssueActivity"
  public static let listOrgActivity = "activities/queries:listOrgActivity"
  public static let listProjectsPage = "projects/queries:listPage"
  public static let getProjectByKey = "projects/queries:getByKey"
  public static let listTeamsPage = "teams/queries:listPage"
  public static let getTeamByKey = "teams/queries:getByKey"
  public static let listDocumentFoldersPage = "documents/folderQueries:listFoldersPage"
  public static let listDocumentsPage = "documents/queries:listPage"
  public static let getDocumentById = "documents/queries:getById"
  public static let listDocumentContentChunks = "documents/content:listChunks"
  public static let updateDocument = "documents/mutations:update"
  public static let getWorkspaceOptions = "organizations/queries:getWorkspaceOptions"
  public static let getCurrentUserStatus = "status:getCurrentUserStatus"
  public static let setPresence = "status:setPresence"
  public static let setCustomStatus = "status:setCustomStatus"
  public static let clearCustomStatus = "status:clearCustomStatus"
  public static let listInboxNotifications = "notifications/queries:listInbox"
  public static let getNotificationPreferences = "notifications/queries:getPreferences"
  public static let listMobilePushTokens = "notifications/queries:listMobilePushTokens"
  public static let updateNotificationPreferences = "notifications/mutations:updatePreferences"
  public static let upsertMobilePushToken = "notifications/mutations:upsertMobilePushToken"
  public static let removeMobilePushToken = "notifications/mutations:removeMobilePushToken"
  public static let listCollaborationChannels = "collaboration/channels:list"
  public static let listChannelMessages = "collaboration/messages:listChannel"
  public static let listChannelThread = "collaboration/messages:listThread"
  public static let listPriorityMessages = "collaboration/messages:listPriorityInbox"
  public static let listSavedMessages = "collaboration/messages:listSaved"
  public static let listChannelMembers = "collaboration/channels:listMembers"
  public static let listChannelAgents = "collaboration/agents:listChannelMemberships"
  public static let createCollaborationChannel = "collaboration/channels:create"
  public static let updateCollaborationChannel = "collaboration/channels:update"
  public static let archiveCollaborationChannel = "collaboration/channels:archive"
  public static let addChannelMember = "collaboration/channels:addMember"
  public static let removeChannelMember = "collaboration/channels:removeMember"
  public static let setChannelPreferences = "collaboration/channels:setPreferences"
  public static let sendChannelMessage = "collaboration/messages:send"
  public static let toggleMessageReaction = "collaboration/messages:toggleReaction"
  public static let toggleSavedMessage = "collaboration/messages:toggleSaved"
  public static let createReminder = "reminders:create"
  public static let generateChannelUploadURL = "collaboration/messages:generateUploadUrl"
  public static let getChannelAttachmentURL = "collaboration/messages:getAttachmentUrl"
  public static let markChannelRead = "collaboration/messages:markRead"
}

enum VectorConvexArguments {
  static func pagination(numItems: Int, cursor: String? = nil) -> [String: ConvexEncodable?] {
    [
      "numItems": Double(numItems),
      "cursor": cursor,
    ]
  }

  static func changeWorkflowState(issueId: VectorID, stateId: VectorID) -> [String: ConvexEncodable?] {
    [
      "issueId": issueId,
      "stateId": stateId,
    ]
  }

  static func changePriority(issueId: VectorID, priorityId: VectorID) -> [String: ConvexEncodable?] {
    [
      "issueId": issueId,
      "priorityId": priorityId,
    ]
  }

  static func updateAssignees(issueId: VectorID, assigneeIds: [VectorID]) -> [String: ConvexEncodable?] {
    [
      "issueId": issueId,
      "assigneeIds": assigneeIds.map { $0 as ConvexEncodable? },
    ]
  }

  static func changeProject(issueId: VectorID, projectId: VectorID?) -> [String: ConvexEncodable?] {
    [
      "issueId": issueId,
      "projectId": projectId,
    ]
  }

  static func changeTeam(issueId: VectorID, teamId: VectorID?) -> [String: ConvexEncodable?] {
    [
      "issueId": issueId,
      "teamId": teamId,
    ]
  }

  static func sendChannelMessage(
    channelId: VectorID,
    body: String,
    clientMessageId: String,
    mentionedUserIds: [VectorID],
    mentionedAgentIds: [VectorID],
    attachments: [[String: ConvexEncodable?]],
    threadRootId: VectorID?,
    replyToMessageId: VectorID?
  ) -> [String: ConvexEncodable?] {
    var args: [String: ConvexEncodable?] = [
      "channelId": channelId,
      "body": body,
      "format": "markdown",
      "clientMessageId": clientMessageId,
      "mentionedUserIds": mentionedUserIds.map { $0 as ConvexEncodable? },
      "mentionedAgentIds": mentionedAgentIds.map { $0 as ConvexEncodable? },
      "attachments": attachments.map { $0 as ConvexEncodable? },
    ]
    if let threadRootId {
      args["threadRootId"] = threadRootId
    }
    if let replyToMessageId {
      args["replyToMessageId"] = replyToMessageId
    }
    return args
  }
}

public enum VectorIssueScope: String, CaseIterable, Identifiable {
  case mine
  case related
  case all

  public var id: String { rawValue }

  public var label: String {
    switch self {
    case .mine: "Mine"
    case .related: "Related"
    case .all: "All"
    }
  }
}

public enum VectorProjectScope: String, CaseIterable, Identifiable {
  case mine
  case all

  public var id: String { rawValue }

  public var label: String {
    switch self {
    case .mine: "Mine"
    case .all: "All"
    }
  }
}

public enum VectorIssueLayoutMode: String, CaseIterable, Identifiable {
  case list
  case board
  case timeline

  public var id: String { rawValue }

  public var label: String {
    switch self {
    case .list: "List"
    case .board: "Board"
    case .timeline: "Timeline"
    }
  }
}

@MainActor
public protocol VectorMobileRepository {
  func collaborationChannels(orgSlug: String) -> AnyPublisher<[VectorChannelListItem], Error>
  func channelMessages(
    channelId: VectorID,
    pageSize: Int,
    cursor: String?
  ) -> AnyPublisher<VectorPaginatedPage<VectorMessageView>, Error>
  func channelThread(
    rootMessageId: VectorID,
    pageSize: Int,
    cursor: String?
  ) -> AnyPublisher<VectorPaginatedPage<VectorMessageView>, Error>
  func priorityMessages(orgSlug: String) -> AnyPublisher<[VectorPriorityInboxItem], Error>
  func savedMessages(orgSlug: String) -> AnyPublisher<[VectorMessageView], Error>
  func channelMembers(channelId: VectorID) -> AnyPublisher<[VectorChannelMemberView], Error>
  func channelAgents(channelId: VectorID) -> AnyPublisher<[VectorChannelAgentView], Error>
  func createCollaborationChannel(
    orgSlug: String,
    kind: VectorChannelKind,
    name: String,
    topic: String?,
    memberUserIds: [VectorID]
  ) async throws -> VectorID
  func updateCollaborationChannel(
    channelId: VectorID,
    name: String,
    topic: String?
  ) async throws
  func archiveCollaborationChannel(channelId: VectorID) async throws
  func addChannelMember(channelId: VectorID, userId: VectorID) async throws -> VectorID
  func removeChannelMember(channelId: VectorID, userId: VectorID) async throws
  func setChannelPreferences(
    channelId: VectorID,
    notificationMode: VectorChannelNotificationMode
  ) async throws
  func attachmentURL(attachmentId: VectorID) -> AnyPublisher<VectorAttachmentURL?, Error>
  func sendChannelMessage(
    channelId: VectorID,
    body: String,
    clientMessageId: String,
    mentionedUserIds: [VectorID],
    mentionedAgentIds: [VectorID],
    attachments: [VectorDraftAttachment],
    threadRootId: VectorID?,
    replyToMessageId: VectorID?
  ) async throws -> VectorSendMessageResult
  func toggleMessageReaction(messageId: VectorID, emoji: String) async throws -> Bool
  func toggleSavedMessage(messageId: VectorID) async throws -> Bool
  func scheduleMessageReminder(
    orgSlug: String,
    messageId: VectorID,
    remindAt: Date
  ) async throws
  func markChannelRead(channelId: VectorID, messageId: VectorID?) async throws
  func requestsPage(orgSlug: String, scope: VectorRequestScope, pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorRequestRow>, Error>
  func request(orgSlug: String, key: String) -> AnyPublisher<VectorRequestDetail?, Error>
  func requestCreation(orgSlug: String, clientRequestId: String) -> AnyPublisher<VectorCreateRequestResult?, Error>
  func workPage(orgSlug: String, scope: VectorWorkScope, pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorWorkRow>, Error>
  func work(orgSlug: String, key: String) -> AnyPublisher<VectorWorkDetail?, Error>
  func workSessions(issueId: VectorID) -> AnyPublisher<[VectorWorkSession], Error>
  func delegationTargets() -> AnyPublisher<[VectorDelegationTarget], Error>
  func agentSession(liveActivityId: VectorID) -> AnyPublisher<VectorAgentSessionSnapshot?, Error>
  func issuesPage(orgSlug: String, scope: VectorIssueScope, pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorIssueRow>, Error>
  func issue(orgSlug: String, key: String) -> AnyPublisher<VectorIssueRow?, Error>
  func projectsPage(orgSlug: String, scope: VectorProjectScope, pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorProject>, Error>
  func teamsPage(orgSlug: String, scope: VectorProjectScope, pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorTeam>, Error>
  func documentFoldersPage(orgSlug: String, pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorDocumentFolder>, Error>
  func documentsPage(orgSlug: String, pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorDocument>, Error>
  func folderDocumentsPage(orgSlug: String, folderId: VectorID, pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorDocument>, Error>
  func document(documentId: VectorID) -> AnyPublisher<VectorDocument?, Error>
  func documentContentPage(documentId: VectorID, version: String, pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorDocumentContentChunk>, Error>
  func workspaceOptions(orgSlug: String) -> AnyPublisher<VectorWorkspaceOptions, Error>
  func comments(issueId: VectorID) -> AnyPublisher<[VectorComment], Error>
  func assignments(issueId: VectorID) -> AnyPublisher<[VectorIssueAssignment], Error>
  func issueActivity(issueId: VectorID) -> AnyPublisher<[VectorActivityItem], Error>
  func inboxActivityPage(orgSlug: String, pageSize: Int, cursor: String?) -> AnyPublisher<VectorOrgActivityPage, Error>
  func inboxNotificationsPage(pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorInboxNotification>, Error>
  func userStatus() -> AnyPublisher<VectorUserStatus?, Error>
  func notificationPreferences() -> AnyPublisher<[VectorNotificationPreference], Error>
  func mobilePushTokens() -> AnyPublisher<[VectorMobilePushTokenRegistration], Error>
  func setPresence(_ presence: VectorPresenceStatus) async throws
  func setCustomStatus(text: String?, emoji: String?, clearsAt: Double?) async throws
  func clearCustomStatus() async throws
  func updateNotificationPreference(_ preference: VectorNotificationPreference) async throws
  func upsertMobilePushToken(_ token: VectorPushDeviceToken, bundleId: String?, deviceLabel: String?) async throws
  func removeMobilePushToken(_ token: VectorPushDeviceToken) async throws
  func createRequest(orgSlug: String, title: String, description: String?, expectedOutput: String, reviewGuidance: String?, priorityId: VectorID?, clientRequestId: String) async throws -> VectorCreateRequestResult
  func claimRequest(requestId: VectorID) async throws
  func requestChanges(requestId: VectorID, note: String) async throws
  func completeRequest(requestId: VectorID) async throws
  func createWork(orgSlug: String, title: String, description: String?, ownerId: VectorID?, requestIds: [VectorID]?) async throws -> VectorCreateWorkResult
  func startWork(workId: VectorID) async throws
  func setWorkStatus(workId: VectorID, status: VectorWorkStatus) async throws
  func readyWorkForReview(workId: VectorID) async throws
  func completeWork(workId: VectorID) async throws
  func respondToWorkHandoff(handoffId: VectorID, accept: Bool) async throws
  func proposeWorkHandoff(workId: VectorID, toOwnerId: VectorID, summary: String, note: String?) async throws
  func raiseWorkAttention(workId: VectorID, title: String, details: String?) async throws
  func createTask(workId: VectorID, title: String, assigneeId: VectorID?) async throws -> VectorCreateTaskResult
  func setTaskStatus(taskId: VectorID, status: VectorTaskStatus) async throws
  func delegateWorkSession(issueId: VectorID, deviceId: VectorID, workspaceId: VectorID, provider: String) async throws -> VectorID
  func sendAgentSessionMessage(liveActivityId: VectorID, body: String) async throws -> VectorID
  func updateTitle(issueId: VectorID, title: String) async throws
  func updateDescription(issueId: VectorID, description: String?) async throws
  func updateDocument(documentId: VectorID, title: String, content: String?) async throws
  func changeWorkflowState(issueId: VectorID, stateId: VectorID) async throws
  func changePriority(issueId: VectorID, priorityId: VectorID) async throws
  func updateAssignees(issueId: VectorID, assigneeIds: [VectorID]) async throws
  func changeProject(issueId: VectorID, projectId: VectorID?) async throws
  func changeTeam(issueId: VectorID, teamId: VectorID?) async throws
  func changeVisibility(issueId: VectorID, visibility: String) async throws
  func addComment(issueId: VectorID, body: String, parentId: VectorID?) async throws -> VectorID
  func createIssue(
    orgSlug: String,
    title: String,
    description: String?,
    projectId: VectorID?,
    teamId _: VectorID?,
    stateId: VectorID?,
    priorityId: VectorID?,
    assigneeIds: [VectorID]
  ) async throws -> VectorCreateIssueResult
}

public extension VectorMobileRepository {
  func collaborationChannels(orgSlug: String) -> AnyPublisher<[VectorChannelListItem], Error> {
    Just([])
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  func channelMessages(
    channelId: VectorID,
    pageSize: Int,
    cursor: String?
  ) -> AnyPublisher<VectorPaginatedPage<VectorMessageView>, Error> {
    Just(VectorPaginatedPage<VectorMessageView>(page: [], isDone: true))
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  func channelThread(
    rootMessageId: VectorID,
    pageSize: Int,
    cursor: String?
  ) -> AnyPublisher<VectorPaginatedPage<VectorMessageView>, Error> {
    Just(VectorPaginatedPage<VectorMessageView>(page: [], isDone: true))
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  func priorityMessages(orgSlug: String) -> AnyPublisher<[VectorPriorityInboxItem], Error> {
    Just([])
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  func savedMessages(orgSlug: String) -> AnyPublisher<[VectorMessageView], Error> {
    Just([])
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  func channelMembers(channelId: VectorID) -> AnyPublisher<[VectorChannelMemberView], Error> {
    Just([])
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  func channelAgents(channelId: VectorID) -> AnyPublisher<[VectorChannelAgentView], Error> {
    Just([])
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  func createCollaborationChannel(
    orgSlug: String,
    kind: VectorChannelKind,
    name: String,
    topic: String?,
    memberUserIds: [VectorID]
  ) async throws -> VectorID {
    throw VectorMobileError.validation("Creating conversations is unavailable in this repository.")
  }

  func updateCollaborationChannel(
    channelId: VectorID,
    name: String,
    topic: String?
  ) async throws {
    throw VectorMobileError.validation("Editing channels is unavailable in this repository.")
  }

  func archiveCollaborationChannel(channelId: VectorID) async throws {
    throw VectorMobileError.validation("Archiving channels is unavailable in this repository.")
  }

  func addChannelMember(channelId: VectorID, userId: VectorID) async throws -> VectorID {
    throw VectorMobileError.validation("Adding channel members is unavailable in this repository.")
  }

  func removeChannelMember(channelId: VectorID, userId: VectorID) async throws {
    throw VectorMobileError.validation("Removing channel members is unavailable in this repository.")
  }

  func setChannelPreferences(
    channelId: VectorID,
    notificationMode: VectorChannelNotificationMode
  ) async throws {
    throw VectorMobileError.validation("Channel preferences are unavailable in this repository.")
  }

  func attachmentURL(attachmentId: VectorID) -> AnyPublisher<VectorAttachmentURL?, Error> {
    Just<VectorAttachmentURL?>(nil)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  func sendChannelMessage(
    channelId: VectorID,
    body: String,
    clientMessageId: String,
    mentionedUserIds: [VectorID],
    mentionedAgentIds: [VectorID],
    attachments: [VectorDraftAttachment],
    threadRootId: VectorID?,
    replyToMessageId: VectorID?
  ) async throws -> VectorSendMessageResult {
    throw VectorMobileError.validation("Messaging is unavailable in this repository.")
  }

  func toggleMessageReaction(messageId: VectorID, emoji: String) async throws -> Bool {
    throw VectorMobileError.validation("Reactions are unavailable in this repository.")
  }

  func toggleSavedMessage(messageId: VectorID) async throws -> Bool { false }

  func scheduleMessageReminder(
    orgSlug: String,
    messageId: VectorID,
    remindAt: Date
  ) async throws {
    throw VectorMobileError.validation("Message reminders are unavailable in this repository.")
  }

  func markChannelRead(channelId: VectorID, messageId: VectorID?) async throws {}

  func requestsPage(
    orgSlug: String,
    scope: VectorRequestScope,
    pageSize: Int,
    cursor: String?
  ) -> AnyPublisher<VectorPaginatedPage<VectorRequestRow>, Error> {
    Just(VectorPaginatedPage<VectorRequestRow>(page: [], isDone: true))
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  func request(orgSlug: String, key: String) -> AnyPublisher<VectorRequestDetail?, Error> {
    Just<VectorRequestDetail?>(nil)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  func requestCreation(orgSlug: String, clientRequestId: String) -> AnyPublisher<VectorCreateRequestResult?, Error> {
    Just<VectorCreateRequestResult?>(nil)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  func documentContentPage(
    documentId: VectorID,
    version: String,
    pageSize: Int,
    cursor: String?
  ) -> AnyPublisher<VectorPaginatedPage<VectorDocumentContentChunk>, Error> {
    Just(VectorPaginatedPage<VectorDocumentContentChunk>(page: [], isDone: true))
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  func documentFoldersPage(
    orgSlug: String,
    pageSize: Int,
    cursor: String?
  ) -> AnyPublisher<VectorPaginatedPage<VectorDocumentFolder>, Error> {
    Just(VectorPaginatedPage<VectorDocumentFolder>(page: [], isDone: true))
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  func folderDocumentsPage(
    orgSlug: String,
    folderId: VectorID,
    pageSize: Int,
    cursor: String?
  ) -> AnyPublisher<VectorPaginatedPage<VectorDocument>, Error> {
    Just(VectorPaginatedPage<VectorDocument>(page: [], isDone: true))
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  func workPage(
    orgSlug: String,
    scope: VectorWorkScope,
    pageSize: Int,
    cursor: String?
  ) -> AnyPublisher<VectorPaginatedPage<VectorWorkRow>, Error> {
    Just(VectorPaginatedPage<VectorWorkRow>(page: [], isDone: true))
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  func work(orgSlug: String, key: String) -> AnyPublisher<VectorWorkDetail?, Error> {
    Just<VectorWorkDetail?>(nil)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  func workSessions(issueId: VectorID) -> AnyPublisher<[VectorWorkSession], Error> {
    Just<[VectorWorkSession]>([])
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  func delegationTargets() -> AnyPublisher<[VectorDelegationTarget], Error> {
    Just<[VectorDelegationTarget]>([])
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  func agentSession(liveActivityId: VectorID) -> AnyPublisher<VectorAgentSessionSnapshot?, Error> {
    Just<VectorAgentSessionSnapshot?>(nil)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  func createRequest(
    orgSlug: String,
    title: String,
    description: String?,
    expectedOutput: String,
    reviewGuidance: String?,
    priorityId: VectorID?,
    clientRequestId: String
  ) async throws -> VectorCreateRequestResult {
    throw VectorMobileError.validation("Request creation is unavailable in this repository.")
  }

  func claimRequest(requestId: VectorID) async throws {}
  func requestChanges(requestId: VectorID, note: String) async throws {}
  func completeRequest(requestId: VectorID) async throws {}
  func createWork(orgSlug: String, title: String, description: String?, ownerId: VectorID?, requestIds: [VectorID]?) async throws -> VectorCreateWorkResult { VectorCreateWorkResult(workId: "work", workKey: "WORK-1") }
  func startWork(workId: VectorID) async throws {}
  func setWorkStatus(workId: VectorID, status: VectorWorkStatus) async throws {}
  func readyWorkForReview(workId: VectorID) async throws {}
  func completeWork(workId: VectorID) async throws {}
  func respondToWorkHandoff(handoffId: VectorID, accept: Bool) async throws {}
  func proposeWorkHandoff(workId: VectorID, toOwnerId: VectorID, summary: String, note: String?) async throws {}
  func raiseWorkAttention(workId: VectorID, title: String, details: String?) async throws {}
  func createTask(workId: VectorID, title: String, assigneeId: VectorID?) async throws -> VectorCreateTaskResult { VectorCreateTaskResult(taskId: "task") }
  func setTaskStatus(taskId: VectorID, status: VectorTaskStatus) async throws {}
  func delegateWorkSession(issueId: VectorID, deviceId: VectorID, workspaceId: VectorID, provider: String) async throws -> VectorID {
    throw VectorMobileError.validation("Agent delegation is unavailable in this repository.")
  }
  func sendAgentSessionMessage(liveActivityId: VectorID, body: String) async throws -> VectorID {
    throw VectorMobileError.validation("Agent messaging is unavailable in this repository.")
  }
}

@MainActor
public final class ConvexVectorRepository: VectorMobileRepository {
  // ConvexClient is owned by the app process and the SDK exposes async/thread-safe entry points.
  private nonisolated(unsafe) let client: ConvexClient

  public init(client: ConvexClient) {
    self.client = client
  }

  public convenience init(configuration: VectorMobileConfiguration) {
    self.init(client: ConvexClient(deploymentUrl: configuration.convexDeploymentURL.absoluteString))
  }

  public func collaborationChannels(orgSlug: String) -> AnyPublisher<[VectorChannelListItem], Error> {
    client
      .subscribe(
        to: VectorConvexFunctions.listCollaborationChannels,
        with: [
          "orgSlug": orgSlug,
          "limit": 100.0,
        ],
        yielding: [VectorChannelListItem].self
      )
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func channelMessages(
    channelId: VectorID,
    pageSize: Int = 50,
    cursor: String? = nil
  ) -> AnyPublisher<VectorPaginatedPage<VectorMessageView>, Error> {
    client
      .subscribe(
        to: VectorConvexFunctions.listChannelMessages,
        with: [
          "channelId": channelId,
          "paginationOpts": VectorConvexArguments.pagination(numItems: pageSize, cursor: cursor),
        ],
        yielding: VectorPaginatedPage<VectorMessageView>.self
      )
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func channelThread(
    rootMessageId: VectorID,
    pageSize: Int = 50,
    cursor: String? = nil
  ) -> AnyPublisher<VectorPaginatedPage<VectorMessageView>, Error> {
    client
      .subscribe(
        to: VectorConvexFunctions.listChannelThread,
        with: [
          "threadRootId": rootMessageId,
          "paginationOpts": VectorConvexArguments.pagination(numItems: pageSize, cursor: cursor),
        ],
        yielding: VectorPaginatedPage<VectorMessageView>.self
      )
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func priorityMessages(orgSlug: String) -> AnyPublisher<[VectorPriorityInboxItem], Error> {
    client
      .subscribe(
        to: VectorConvexFunctions.listPriorityMessages,
        with: [
          "orgSlug": orgSlug,
          "limit": 100.0,
        ],
        yielding: [VectorPriorityInboxItem].self
      )
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func savedMessages(orgSlug: String) -> AnyPublisher<[VectorMessageView], Error> {
    client
      .subscribe(
        to: VectorConvexFunctions.listSavedMessages,
        with: [
          "orgSlug": orgSlug,
          "limit": 100.0,
        ],
        yielding: [VectorMessageView].self
      )
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func channelMembers(channelId: VectorID) -> AnyPublisher<[VectorChannelMemberView], Error> {
    client
      .subscribe(
        to: VectorConvexFunctions.listChannelMembers,
        with: [
          "channelId": channelId,
          "limit": 100.0,
        ],
        yielding: [VectorChannelMemberView].self
      )
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func channelAgents(channelId: VectorID) -> AnyPublisher<[VectorChannelAgentView], Error> {
    client
      .subscribe(
        to: VectorConvexFunctions.listChannelAgents,
        with: [
          "channelId": channelId,
          "limit": 50.0,
        ],
        yielding: [VectorChannelAgentView].self
      )
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func createCollaborationChannel(
    orgSlug: String,
    kind: VectorChannelKind,
    name: String,
    topic: String?,
    memberUserIds: [VectorID]
  ) async throws -> VectorID {
    var arguments: [String: ConvexEncodable?] = [
      "orgSlug": orgSlug,
      "kind": kind.rawValue,
      "name": name,
      "memberUserIds": memberUserIds.map { $0 as ConvexEncodable? },
    ]
    if let topic, !topic.isEmpty {
      arguments["topic"] = topic
    }
    return try await client.mutation(
      VectorConvexFunctions.createCollaborationChannel,
      with: arguments
    )
  }

  public func updateCollaborationChannel(
    channelId: VectorID,
    name: String,
    topic: String?
  ) async throws {
    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.updateCollaborationChannel,
      with: [
        "channelId": channelId,
        "name": name,
        "topic": topic,
      ]
    )
  }

  public func archiveCollaborationChannel(channelId: VectorID) async throws {
    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.archiveCollaborationChannel,
      with: [
        "channelId": channelId,
        "archived": true,
      ]
    )
  }

  public func addChannelMember(channelId: VectorID, userId: VectorID) async throws -> VectorID {
    try await client.mutation(
      VectorConvexFunctions.addChannelMember,
      with: [
        "channelId": channelId,
        "userId": userId,
      ]
    )
  }

  public func removeChannelMember(channelId: VectorID, userId: VectorID) async throws {
    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.removeChannelMember,
      with: [
        "channelId": channelId,
        "userId": userId,
      ]
    )
  }

  public func setChannelPreferences(
    channelId: VectorID,
    notificationMode: VectorChannelNotificationMode
  ) async throws {
    let _: VectorID = try await client.mutation(
      VectorConvexFunctions.setChannelPreferences,
      with: [
        "channelId": channelId,
        "notificationMode": notificationMode.rawValue,
      ]
    )
  }

  public func attachmentURL(attachmentId: VectorID) -> AnyPublisher<VectorAttachmentURL?, Error> {
    client
      .subscribe(
        to: VectorConvexFunctions.getChannelAttachmentURL,
        with: ["attachmentId": attachmentId],
        yielding: VectorAttachmentURL?.self
      )
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func sendChannelMessage(
    channelId: VectorID,
    body: String,
    clientMessageId: String,
    mentionedUserIds: [VectorID],
    mentionedAgentIds: [VectorID],
    attachments: [VectorDraftAttachment],
    threadRootId: VectorID? = nil,
    replyToMessageId: VectorID? = nil
  ) async throws -> VectorSendMessageResult {
    var uploadedAttachments: [[String: ConvexEncodable?]] = []
    for attachment in attachments {
      let uploadURL: String = try await client.mutation(
        VectorConvexFunctions.generateChannelUploadURL,
        with: ["channelId": channelId]
      )
      guard let url = URL(string: uploadURL) else {
        throw VectorMobileError.validation("Vector returned an invalid upload URL.")
      }

      var request = URLRequest(url: url)
      request.httpMethod = "POST"
      request.setValue(attachment.contentType, forHTTPHeaderField: "Content-Type")
      let (data, response) = try await URLSession.shared.upload(for: request, from: attachment.data)
      guard let httpResponse = response as? HTTPURLResponse,
            (200..<300).contains(httpResponse.statusCode)
      else {
        throw VectorMobileError.validation("The attachment could not be uploaded.")
      }
      let result = try JSONDecoder().decode(VectorStorageUploadResponse.self, from: data)
      var uploadedAttachment: [String: ConvexEncodable?] = [
        "storageId": result.storageId,
        "kind": attachment.kind,
        "name": attachment.name,
        "contentType": attachment.contentType,
        "size": Double(attachment.data.count),
      ]
      if let duration = attachment.duration {
        uploadedAttachment["duration"] = duration
      }
      if let width = attachment.width {
        uploadedAttachment["width"] = width
      }
      if let height = attachment.height {
        uploadedAttachment["height"] = height
      }
      uploadedAttachments.append(uploadedAttachment)
    }

    return try await client.mutation(
      VectorConvexFunctions.sendChannelMessage,
      with: VectorConvexArguments.sendChannelMessage(
        channelId: channelId,
        body: body,
        clientMessageId: clientMessageId,
        mentionedUserIds: mentionedUserIds,
        mentionedAgentIds: mentionedAgentIds,
        attachments: uploadedAttachments,
        threadRootId: threadRootId,
        replyToMessageId: replyToMessageId
      )
    )
  }

  public func toggleMessageReaction(messageId: VectorID, emoji: String) async throws -> Bool {
    let result: VectorToggleMessageResult = try await client.mutation(
      VectorConvexFunctions.toggleMessageReaction,
      with: [
        "messageId": messageId,
        "emoji": emoji,
      ]
    )
    return result.active
  }

  public func toggleSavedMessage(messageId: VectorID) async throws -> Bool {
    let result: VectorToggleMessageResult = try await client.mutation(
      VectorConvexFunctions.toggleSavedMessage,
      with: ["messageId": messageId]
    )
    return result.active
  }

  public func scheduleMessageReminder(
    orgSlug: String,
    messageId: VectorID,
    remindAt: Date
  ) async throws {
    let timezone = TimeZone.current.identifier
    let localComponents = Calendar.autoupdatingCurrent.dateComponents(
      in: TimeZone.current,
      from: remindAt
    )
    let localTime = String(
      format: "%02d:%02d",
      localComponents.hour ?? 0,
      localComponents.minute ?? 0
    )
    let _: VectorCreateReminderResponse = try await client.mutation(
      VectorConvexFunctions.createReminder,
      with: [
        "orgSlug": orgSlug,
        "targetType": "message",
        "messageId": messageId,
        "recipientPolicies": ["reminder_creator" as ConvexEncodable?],
        "cadence": "once",
        "localTime": localTime,
        "timezone": timezone,
        "firstFireAt": remindAt.timeIntervalSince1970 * 1_000,
      ]
    )
  }

  public func markChannelRead(channelId: VectorID, messageId: VectorID?) async throws {
    let _: VectorID = try await client.mutation(
      VectorConvexFunctions.markChannelRead,
      with: [
        "channelId": channelId,
        "messageId": messageId,
      ]
    )
  }

  public func requestsPage(
    orgSlug: String,
    scope: VectorRequestScope = .inbox,
    pageSize: Int = 30,
    cursor: String? = nil
  ) -> AnyPublisher<VectorPaginatedPage<VectorRequestRow>, Error> {
    let args: [String: ConvexEncodable?] = [
      "orgSlug": orgSlug,
      "scope": scope.rawValue,
      "paginationOpts": VectorConvexArguments.pagination(numItems: pageSize, cursor: cursor),
    ]
    return client
      .subscribe(to: VectorConvexFunctions.listRequestsPage, with: args, yielding: VectorPaginatedPage<VectorRequestRow>.self)
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func request(orgSlug: String, key: String) -> AnyPublisher<VectorRequestDetail?, Error> {
    client
      .subscribe(
        to: VectorConvexFunctions.getRequestByKey,
        with: ["orgSlug": orgSlug, "requestKey": key],
        yielding: VectorRequestDetail?.self
      )
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func requestCreation(orgSlug: String, clientRequestId: String) -> AnyPublisher<VectorCreateRequestResult?, Error> {
    client
      .subscribe(
        to: VectorConvexFunctions.getRequestByClientRequestId,
        with: ["orgSlug": orgSlug, "clientRequestId": clientRequestId],
        yielding: VectorCreateRequestResult?.self
      )
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func workPage(
    orgSlug: String,
    scope: VectorWorkScope = .active,
    pageSize: Int = 30,
    cursor: String? = nil
  ) -> AnyPublisher<VectorPaginatedPage<VectorWorkRow>, Error> {
    let args: [String: ConvexEncodable?] = [
      "orgSlug": orgSlug,
      "scope": scope.rawValue,
      "paginationOpts": VectorConvexArguments.pagination(numItems: pageSize, cursor: cursor),
    ]
    return client
      .subscribe(to: VectorConvexFunctions.listWorkPage, with: args, yielding: VectorPaginatedPage<VectorWorkRow>.self)
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func work(orgSlug: String, key: String) -> AnyPublisher<VectorWorkDetail?, Error> {
    client
      .subscribe(
        to: VectorConvexFunctions.getWorkByKey,
        with: ["orgSlug": orgSlug, "workKey": key],
        yielding: VectorWorkDetail?.self
      )
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func workSessions(issueId: VectorID) -> AnyPublisher<[VectorWorkSession], Error> {
    client
      .subscribe(
        to: VectorConvexFunctions.listWorkSessions,
        with: ["issueId": issueId],
        yielding: [VectorWorkSession].self
      )
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func delegationTargets() -> AnyPublisher<[VectorDelegationTarget], Error> {
    client
      .subscribe(
        to: VectorConvexFunctions.listDelegationTargets,
        yielding: [VectorDelegationTarget].self
      )
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func agentSession(liveActivityId: VectorID) -> AnyPublisher<VectorAgentSessionSnapshot?, Error> {
    client
      .subscribe(
        to: VectorConvexFunctions.getAgentSessionSnapshot,
        with: ["liveActivityId": liveActivityId],
        yielding: VectorAgentSessionSnapshot?.self
      )
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func issuesPage(
    orgSlug: String,
    scope: VectorIssueScope = .mine,
    pageSize: Int = 30,
    cursor: String? = nil
  ) -> AnyPublisher<VectorPaginatedPage<VectorIssueRow>, Error> {
    let args: [String: ConvexEncodable?] = [
      "orgSlug": orgSlug,
      "scope": scope.rawValue,
      "paginationOpts": VectorConvexArguments.pagination(numItems: pageSize, cursor: cursor),
    ]

    return client
      .subscribe(to: VectorConvexFunctions.listIssuesPage, with: args, yielding: VectorPaginatedPage<VectorIssueRow>.self)
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func issue(orgSlug: String, key: String) -> AnyPublisher<VectorIssueRow?, Error> {
    client
      .subscribe(
        to: VectorConvexFunctions.getIssueByKey,
        with: [
          "orgSlug": orgSlug,
          "issueKey": key,
        ],
        yielding: VectorIssueRow?.self
      )
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func projectsPage(
    orgSlug: String,
    scope: VectorProjectScope = .mine,
    pageSize: Int = 30,
    cursor: String? = nil
  ) -> AnyPublisher<VectorPaginatedPage<VectorProject>, Error> {
    let args: [String: ConvexEncodable?] = [
      "orgSlug": orgSlug,
      "scope": scope.rawValue,
      "paginationOpts": VectorConvexArguments.pagination(numItems: pageSize, cursor: cursor),
    ]

    return client
      .subscribe(to: VectorConvexFunctions.listProjectsPage, with: args, yielding: VectorPaginatedPage<VectorProject>.self)
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func teamsPage(
    orgSlug: String,
    scope: VectorProjectScope = .mine,
    pageSize: Int = 30,
    cursor: String? = nil
  ) -> AnyPublisher<VectorPaginatedPage<VectorTeam>, Error> {
    let args: [String: ConvexEncodable?] = [
      "orgSlug": orgSlug,
      "scope": scope.rawValue,
      "paginationOpts": VectorConvexArguments.pagination(numItems: pageSize, cursor: cursor),
    ]

    return client
      .subscribe(to: VectorConvexFunctions.listTeamsPage, with: args, yielding: VectorPaginatedPage<VectorTeam>.self)
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func documentsPage(
    orgSlug: String,
    pageSize: Int = 30,
    cursor: String? = nil
  ) -> AnyPublisher<VectorPaginatedPage<VectorDocument>, Error> {
    let args: [String: ConvexEncodable?] = [
      "orgSlug": orgSlug,
      "scope": "all",
      "unfiledOnly": true,
      "paginationOpts": VectorConvexArguments.pagination(numItems: pageSize, cursor: cursor),
    ]

    return client
      .subscribe(to: VectorConvexFunctions.listDocumentsPage, with: args, yielding: VectorPaginatedPage<VectorDocument>.self)
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func documentFoldersPage(
    orgSlug: String,
    pageSize: Int = 30,
    cursor: String? = nil
  ) -> AnyPublisher<VectorPaginatedPage<VectorDocumentFolder>, Error> {
    let args: [String: ConvexEncodable?] = [
      "orgSlug": orgSlug,
      "paginationOpts": VectorConvexArguments.pagination(numItems: pageSize, cursor: cursor),
    ]
    return client
      .subscribe(
        to: VectorConvexFunctions.listDocumentFoldersPage,
        with: args,
        yielding: VectorPaginatedPage<VectorDocumentFolder>.self
      )
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func folderDocumentsPage(
    orgSlug: String,
    folderId: VectorID,
    pageSize: Int = 30,
    cursor: String? = nil
  ) -> AnyPublisher<VectorPaginatedPage<VectorDocument>, Error> {
    let args: [String: ConvexEncodable?] = [
      "orgSlug": orgSlug,
      "scope": "all",
      "folderId": folderId,
      "paginationOpts": VectorConvexArguments.pagination(numItems: pageSize, cursor: cursor),
    ]
    return client
      .subscribe(
        to: VectorConvexFunctions.listDocumentsPage,
        with: args,
        yielding: VectorPaginatedPage<VectorDocument>.self
      )
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func document(documentId: VectorID) -> AnyPublisher<VectorDocument?, Error> {
    client
      .subscribe(
        to: VectorConvexFunctions.getDocumentById,
        with: ["documentId": documentId],
        yielding: VectorDocument?.self
      )
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func documentContentPage(
    documentId: VectorID,
    version: String,
    pageSize: Int = 3,
    cursor: String? = nil
  ) -> AnyPublisher<VectorPaginatedPage<VectorDocumentContentChunk>, Error> {
    let args: [String: ConvexEncodable?] = [
      "documentId": documentId,
      "version": version,
      "paginationOpts": VectorConvexArguments.pagination(numItems: pageSize, cursor: cursor),
    ]
    return client
      .subscribe(
        to: VectorConvexFunctions.listDocumentContentChunks,
        with: args,
        yielding: VectorPaginatedPage<VectorDocumentContentChunk>.self
      )
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func workspaceOptions(orgSlug: String) -> AnyPublisher<VectorWorkspaceOptions, Error> {
    client
      .subscribe(
        to: VectorConvexFunctions.getWorkspaceOptions,
        with: ["orgSlug": orgSlug],
        yielding: VectorWorkspaceOptions.self
      )
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func comments(issueId: VectorID) -> AnyPublisher<[VectorComment], Error> {
    client
      .subscribe(to: VectorConvexFunctions.listComments, with: ["issueId": issueId], yielding: [VectorComment].self)
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func assignments(issueId: VectorID) -> AnyPublisher<[VectorIssueAssignment], Error> {
    client
      .subscribe(to: VectorConvexFunctions.getAssignments, with: ["issueId": issueId], yielding: [VectorIssueAssignment].self)
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func issueActivity(issueId: VectorID) -> AnyPublisher<[VectorActivityItem], Error> {
    let args: [String: ConvexEncodable?] = [
      "issueId": issueId,
      "paginationOpts": VectorConvexArguments.pagination(numItems: 30),
    ]

    return client
      .subscribe(to: VectorConvexFunctions.listIssueActivity, with: args, yielding: VectorPaginatedPage<VectorActivityItem>.self)
      .map(\.page)
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func inboxActivityPage(orgSlug: String, pageSize: Int, cursor: String? = nil) -> AnyPublisher<VectorOrgActivityPage, Error> {
    var args: [String: ConvexEncodable?] = [
      "orgSlug": orgSlug,
      "limit": Double(pageSize),
    ]
    if let cursor {
      args["cursor"] = cursor
    }

    return client
      .subscribe(to: VectorConvexFunctions.listOrgActivity, with: args, yielding: VectorOrgActivityPage.self)
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func inboxNotificationsPage(pageSize: Int, cursor: String? = nil) -> AnyPublisher<VectorPaginatedPage<VectorInboxNotification>, Error> {
    let args: [String: ConvexEncodable?] = [
      "filter": "all",
      "paginationOpts": VectorConvexArguments.pagination(numItems: pageSize, cursor: cursor),
    ]

    return client
      .subscribe(to: VectorConvexFunctions.listInboxNotifications, with: args, yielding: VectorPaginatedPage<VectorInboxNotification>.self)
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func userStatus() -> AnyPublisher<VectorUserStatus?, Error> {
    client
      .subscribe(to: VectorConvexFunctions.getCurrentUserStatus, yielding: VectorUserStatus?.self)
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func notificationPreferences() -> AnyPublisher<[VectorNotificationPreference], Error> {
    client
      .subscribe(to: VectorConvexFunctions.getNotificationPreferences, yielding: [VectorNotificationPreference].self)
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func mobilePushTokens() -> AnyPublisher<[VectorMobilePushTokenRegistration], Error> {
    client
      .subscribe(to: VectorConvexFunctions.listMobilePushTokens, yielding: [VectorMobilePushTokenRegistration].self)
      .mapError { $0 as Error }
      .eraseToAnyPublisher()
  }

  public func setPresence(_ presence: VectorPresenceStatus) async throws {
    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.setPresence,
      with: ["presence": presence.rawValue]
    )
  }

  public func setCustomStatus(text: String?, emoji: String?, clearsAt: Double?) async throws {
    var args: [String: ConvexEncodable?] = [:]
    if let text {
      args["customText"] = text
    }
    if let emoji {
      args["customEmoji"] = emoji
    }
    if let clearsAt {
      args["clearsAt"] = clearsAt
    }

    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.setCustomStatus,
      with: args
    )
  }

  public func clearCustomStatus() async throws {
    let _: VectorMutationResponse = try await client.mutation(VectorConvexFunctions.clearCustomStatus)
  }

  public func updateNotificationPreference(_ preference: VectorNotificationPreference) async throws {
    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.updateNotificationPreferences,
      with: [
        "category": preference.category.rawValue,
        "inAppEnabled": preference.inAppEnabled,
        "emailEnabled": preference.emailEnabled,
        "pushEnabled": preference.pushEnabled,
      ]
    )
  }

  public func upsertMobilePushToken(_ token: VectorPushDeviceToken, bundleId: String?, deviceLabel: String?) async throws {
    var args: [String: ConvexEncodable?] = [
      "token": token.value,
      "environment": token.environment,
    ]
    if let bundleId {
      args["bundleId"] = bundleId
    }
    if let deviceLabel {
      args["deviceLabel"] = deviceLabel
    }

    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.upsertMobilePushToken,
      with: args
    )
  }

  public func removeMobilePushToken(_ token: VectorPushDeviceToken) async throws {
    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.removeMobilePushToken,
      with: [
        "token": token.value,
        "environment": token.environment,
      ]
    )
  }

  public func createRequest(
    orgSlug: String,
    title: String,
    description: String?,
    expectedOutput: String,
    reviewGuidance: String?,
    priorityId: VectorID?,
    clientRequestId: String
  ) async throws -> VectorCreateRequestResult {
    var data: [String: ConvexEncodable?] = [
      "title": title,
      "expectedOutput": expectedOutput,
      "visibility": "organization",
      "clientRequestId": clientRequestId,
    ]
    if let description { data["description"] = description }
    if let reviewGuidance { data["reviewGuidance"] = reviewGuidance }
    if let priorityId { data["priorityId"] = priorityId }
    return try await client.mutation(
      VectorConvexFunctions.createRequest,
      with: ["orgSlug": orgSlug, "data": data]
    )
  }

  public func claimRequest(requestId: VectorID) async throws {
    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.claimRequest,
      with: ["requestId": requestId]
    )
  }

  public func requestChanges(requestId: VectorID, note: String) async throws {
    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.requestChanges,
      with: ["requestId": requestId, "note": note]
    )
  }

  public func completeRequest(requestId: VectorID) async throws {
    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.completeRequest,
      with: ["requestId": requestId]
    )
  }

  public func createWork(
    orgSlug: String,
    title: String,
    description: String?,
    ownerId: VectorID?,
    requestIds: [VectorID]?
  ) async throws -> VectorCreateWorkResult {
    var data: [String: ConvexEncodable?] = ["title": title]
    if let description { data["description"] = description }
    if let ownerId { data["ownerId"] = ownerId }
    if let requestIds { data["requestIds"] = requestIds.map { $0 as ConvexEncodable? } }
    return try await client.mutation(
      VectorConvexFunctions.createWork,
      with: ["orgSlug": orgSlug, "data": data]
    )
  }

  public func startWork(workId: VectorID) async throws {
    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.startWork,
      with: ["workId": workId]
    )
  }

  public func setWorkStatus(workId: VectorID, status: VectorWorkStatus) async throws {
    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.setWorkStatus,
      with: ["workId": workId, "status": status.rawValue]
    )
  }

  public func readyWorkForReview(workId: VectorID) async throws {
    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.readyWorkForReview,
      with: ["workId": workId]
    )
  }

  public func completeWork(workId: VectorID) async throws {
    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.completeWork,
      with: ["workId": workId]
    )
  }

  public func respondToWorkHandoff(handoffId: VectorID, accept: Bool) async throws {
    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.respondToWorkHandoff,
      with: ["handoffId": handoffId, "accept": accept]
    )
  }

  public func proposeWorkHandoff(workId: VectorID, toOwnerId: VectorID, summary: String, note: String?) async throws {
    var args: [String: ConvexEncodable?] = [
      "workId": workId,
      "toOwnerId": toOwnerId,
      "summary": summary,
    ]
    if let note { args["note"] = note }
    let _: VectorMutationResponse = try await client.mutation(VectorConvexFunctions.proposeWorkHandoff, with: args)
  }

  public func raiseWorkAttention(workId: VectorID, title: String, details: String?) async throws {
    var args: [String: ConvexEncodable?] = ["workId": workId, "title": title]
    if let details { args["details"] = details }
    let _: VectorMutationResponse = try await client.mutation(VectorConvexFunctions.raiseWorkAttention, with: args)
  }

  public func createTask(workId: VectorID, title: String, assigneeId: VectorID?) async throws -> VectorCreateTaskResult {
    var args: [String: ConvexEncodable?] = ["workId": workId, "title": title]
    if let assigneeId { args["assigneeId"] = assigneeId }
    return try await client.mutation(VectorConvexFunctions.createTask, with: args)
  }

  public func setTaskStatus(taskId: VectorID, status: VectorTaskStatus) async throws {
    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.setTaskStatus,
      with: ["taskId": taskId, "status": status.rawValue]
    )
  }

  public func delegateWorkSession(
    issueId: VectorID,
    deviceId: VectorID,
    workspaceId: VectorID,
    provider: String
  ) async throws -> VectorID {
    let response: VectorDelegateSessionResponse = try await client.mutation(
      VectorConvexFunctions.delegateWorkSession,
      with: [
        "issueId": issueId,
        "deviceId": deviceId,
        "workspaceId": workspaceId,
        "provider": provider,
      ]
    )
    return response.liveActivityId
  }

  public func sendAgentSessionMessage(liveActivityId: VectorID, body: String) async throws -> VectorID {
    try await client.mutation(
      VectorConvexFunctions.sendAgentSessionMessage,
      with: [
        "liveActivityId": liveActivityId,
        "direction": "vector_to_agent",
        "role": "user",
        "body": body,
      ]
    )
  }

  public func changeWorkflowState(issueId: VectorID, stateId: VectorID) async throws {
    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.changeWorkflowState,
      with: VectorConvexArguments.changeWorkflowState(issueId: issueId, stateId: stateId)
    )
  }

  public func changePriority(issueId: VectorID, priorityId: VectorID) async throws {
    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.changePriority,
      with: VectorConvexArguments.changePriority(issueId: issueId, priorityId: priorityId)
    )
  }

  public func updateAssignees(issueId: VectorID, assigneeIds: [VectorID]) async throws {
    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.updateAssignees,
      with: VectorConvexArguments.updateAssignees(issueId: issueId, assigneeIds: assigneeIds)
    )
  }

  public func changeProject(issueId: VectorID, projectId: VectorID?) async throws {
    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.changeProject,
      with: VectorConvexArguments.changeProject(issueId: issueId, projectId: projectId)
    )
  }

  public func changeTeam(issueId: VectorID, teamId: VectorID?) async throws {
    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.changeTeam,
      with: VectorConvexArguments.changeTeam(issueId: issueId, teamId: teamId)
    )
  }

  public func changeVisibility(issueId: VectorID, visibility: String) async throws {
    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.changeVisibility,
      with: [
        "issueId": issueId,
        "visibility": visibility,
      ]
    )
  }

  public func updateTitle(issueId: VectorID, title: String) async throws {
    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.updateTitle,
      with: [
        "issueId": issueId,
        "title": title,
      ]
    )
  }

  public func updateDescription(issueId: VectorID, description: String?) async throws {
    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.updateDescription,
      with: [
        "issueId": issueId,
        "description": description,
      ]
    )
  }

  public func updateDocument(documentId: VectorID, title: String, content: String?) async throws {
    let _: VectorMutationResponse = try await client.mutation(
      VectorConvexFunctions.updateDocument,
      with: [
        "documentId": documentId,
        "data": [
          "title": title,
          "content": content ?? "",
        ] as [String: ConvexEncodable?],
      ]
    )
  }

  public func addComment(issueId: VectorID, body: String, parentId: VectorID? = nil) async throws -> VectorID {
    var args: [String: ConvexEncodable?] = [
      "issueId": issueId,
      "body": body,
    ]
    if let parentId {
      args["parentId"] = parentId
    }

    let response: VectorAddCommentResponse = try await client.mutation(
      VectorConvexFunctions.addComment,
      with: args
    )
    return response.commentId
  }

  public func createIssue(
    orgSlug: String,
    title: String,
    description: String?,
    projectId: VectorID?,
    teamId: VectorID?,
    stateId: VectorID?,
    priorityId: VectorID?,
    assigneeIds: [VectorID]
  ) async throws -> VectorCreateIssueResult {
    var data: [String: ConvexEncodable?] = [
      "title": title,
    ]
    if let description {
      data["description"] = description
    }
    if let projectId {
      data["projectId"] = projectId
    }
    if let stateId {
      data["stateId"] = stateId
    }
    if let priorityId {
      data["priorityId"] = priorityId
    }
    if !assigneeIds.isEmpty {
      data["assigneeIds"] = assigneeIds.map { $0 as ConvexEncodable? }
    }

    return try await client.mutation(
      VectorConvexFunctions.createIssue,
      with: [
        "orgSlug": orgSlug,
        "data": data,
      ]
    )
  }
}

@MainActor
public final class MockVectorRepository: VectorMobileRepository {
  public init() {}

  public func collaborationChannels(orgSlug: String) -> AnyPublisher<[VectorChannelListItem], Error> {
    Just(VectorMockData.collaborationChannels)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func channelMessages(
    channelId: VectorID,
    pageSize: Int,
    cursor: String?
  ) -> AnyPublisher<VectorPaginatedPage<VectorMessageView>, Error> {
    let messages = VectorMockData.collaborationMessages.filter {
      $0.message.channelId == channelId && $0.message.threadRootId == nil
    }
    return mockPage(messages, pageSize: pageSize, cursor: cursor)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func channelThread(
    rootMessageId: VectorID,
    pageSize: Int,
    cursor: String?
  ) -> AnyPublisher<VectorPaginatedPage<VectorMessageView>, Error> {
    let messages = VectorMockData.collaborationMessages.filter {
      $0.message.threadRootId == rootMessageId
    }
    return mockPage(messages, pageSize: pageSize, cursor: cursor)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func priorityMessages(orgSlug: String) -> AnyPublisher<[VectorPriorityInboxItem], Error> {
    Just(VectorMockData.collaborationPriorityMessages)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func savedMessages(orgSlug: String) -> AnyPublisher<[VectorMessageView], Error> {
    Just(VectorMockData.collaborationMessages.filter(\.saved))
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func channelMembers(channelId: VectorID) -> AnyPublisher<[VectorChannelMemberView], Error> {
    let users = [VectorMockData.raj, VectorMockData.maya]
    let members = users.map { user in
      VectorChannelMemberView(
        membership: VectorChannelMembership(
          id: "member-\(channelId)-\(user.id)",
          channelId: channelId,
          userId: user.id
        ),
        user: user
      )
    }
    return Just(members)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func channelAgents(channelId: VectorID) -> AnyPublisher<[VectorChannelAgentView], Error> {
    Just(
      VectorMockData.collaborationChannelAgents.filter {
        $0.membership.channelId == channelId
      }
    )
    .setFailureType(to: Error.self)
    .eraseToAnyPublisher()
  }

  public func createCollaborationChannel(
    orgSlug: String,
    kind: VectorChannelKind,
    name: String,
    topic: String?,
    memberUserIds: [VectorID]
  ) async throws -> VectorID {
    "mock-channel-\(UUID().uuidString.lowercased())"
  }

  public func updateCollaborationChannel(
    channelId: VectorID,
    name: String,
    topic: String?
  ) async throws {}

  public func archiveCollaborationChannel(channelId: VectorID) async throws {}

  public func addChannelMember(channelId: VectorID, userId: VectorID) async throws -> VectorID {
    "mock-member-\(userId)"
  }

  public func removeChannelMember(channelId: VectorID, userId: VectorID) async throws {}

  public func setChannelPreferences(
    channelId: VectorID,
    notificationMode: VectorChannelNotificationMode
  ) async throws {}

  public func attachmentURL(attachmentId: VectorID) -> AnyPublisher<VectorAttachmentURL?, Error> {
    let attachment = VectorMockData.collaborationMessages
      .flatMap(\.attachments)
      .first { $0.id == attachmentId }
    let url = attachment.map {
      let previewURL: String
      if $0.isImage {
        previewURL = "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1600&q=85"
      } else if $0.contentType == "application/pdf" {
        previewURL = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
      } else {
        previewURL = "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8"
      }
      return VectorAttachmentURL(
        attachment: $0,
        url: previewURL
      )
    }
    return Just(url)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func sendChannelMessage(
    channelId: VectorID,
    body: String,
    clientMessageId: String,
    mentionedUserIds: [VectorID],
    mentionedAgentIds: [VectorID],
    attachments: [VectorDraftAttachment],
    threadRootId: VectorID?,
    replyToMessageId: VectorID?
  ) async throws -> VectorSendMessageResult {
    VectorSendMessageResult(messageId: "mock-\(UUID().uuidString)", runIds: [])
  }

  public func toggleMessageReaction(messageId: VectorID, emoji: String) async throws -> Bool {
    true
  }

  public func toggleSavedMessage(messageId: VectorID) async throws -> Bool { true }

  public func scheduleMessageReminder(
    orgSlug: String,
    messageId: VectorID,
    remindAt: Date
  ) async throws {}

  public func markChannelRead(channelId: VectorID, messageId: VectorID?) async throws {}

  public func requestsPage(
    orgSlug: String,
    scope: VectorRequestScope,
    pageSize: Int,
    cursor: String?
  ) -> AnyPublisher<VectorPaginatedPage<VectorRequestRow>, Error> {
    let now = Date().timeIntervalSince1970 * 1000
    let requests = [
      VectorRequestRow(
        id: "request-1",
        key: "REQ-18",
        title: "Make agent handoffs legible",
        expectedOutput: "A reviewed handoff flow with preserved context and ownership history.",
        status: .readyForReview,
        description: "The requester should be able to see what changed and who owns the next step.",
        owner: VectorUser(id: "user-1", name: "Raj"),
        requester: VectorUser(id: "user-2", name: "Maya"),
        linkedWorkCount: 2,
        recipientCount: 1,
        createdAt: now - 172_800_000,
        updatedAt: now - 3_600_000
      ),
      VectorRequestRow(
        id: "request-2",
        key: "REQ-19",
        title: "Tighten mobile notification controls",
        expectedOutput: "Push preferences and actionable review notifications on iOS.",
        status: .routed,
        owner: VectorUser(id: "user-1", name: "Raj"),
        linkedWorkCount: 0,
        recipientCount: 1,
        createdAt: now - 86_400_000,
        updatedAt: now - 7_200_000
      ),
    ]
    return mockPage(requests, pageSize: pageSize, cursor: cursor)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func request(orgSlug: String, key: String) -> AnyPublisher<VectorRequestDetail?, Error> {
    let now = Date().timeIntervalSince1970 * 1000
    let detail = VectorRequestDetail(
      id: key == "REQ-19" ? "request-2" : "request-1",
      key: key,
      title: key == "REQ-19" ? "Tighten mobile notification controls" : "Make agent handoffs legible",
      expectedOutput: key == "REQ-19" ? "Push preferences and actionable review notifications on iOS." : "A reviewed handoff flow with preserved context and ownership history.",
      status: key == "REQ-19" ? .routed : .readyForReview,
      description: "Keep the surface compact, but make the next human decision unmistakable.",
      reviewGuidance: "Verify the previous owner’s context and the current owner’s start boundary.",
      owner: VectorUser(id: "user-1", name: "Raj"),
      requester: VectorUser(id: "user-2", name: "Maya"),
      linkedWork: [VectorLinkedWork(id: "work-1", key: "VEC-42", title: "Request → Work mobile companion", workStatus: .active, relation: "fulfills")],
      createdAt: now - 172_800_000,
      updatedAt: now - 3_600_000
    )
    return Just<VectorRequestDetail?>(detail)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func workPage(
    orgSlug: String,
    scope: VectorWorkScope,
    pageSize: Int,
    cursor: String?
  ) -> AnyPublisher<VectorPaginatedPage<VectorWorkRow>, Error> {
    let now = Date().timeIntervalSince1970 * 1000
    let work = [
      VectorWorkRow(
        id: "work-1",
        key: "VEC-42",
        title: "Request → Work mobile companion",
        workStatus: .active,
        owner: VectorUser(id: "user-1", name: "Raj"),
        ownerId: "user-1",
        effort: "l",
        taskProgress: .init(done: 3, total: 7),
        activeExecutionCount: 2,
        ownerStartedAt: now - 10_800_000,
        lastMeaningfulActivityAt: now - 300_000,
        creationTime: now - 259_200_000
      ),
      VectorWorkRow(
        id: "work-2",
        key: "VEC-37",
        title: "Review notification delivery policy",
        workStatus: .blocked,
        owner: VectorUser(id: "user-1", name: "Raj"),
        ownerId: "user-1",
        effort: "m",
        taskProgress: .init(done: 1, total: 4),
        openAttentionCount: 1,
        lastMeaningfulActivityAt: now - 86_400_000,
        creationTime: now - 604_800_000
      ),
    ]
    return mockPage(work, pageSize: pageSize, cursor: cursor)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func work(orgSlug: String, key: String) -> AnyPublisher<VectorWorkDetail?, Error> {
    let now = Date().timeIntervalSince1970 * 1000
    let owner = VectorUser(id: "user-1", name: "Raj")
    let detail = VectorWorkDetail(
      id: key == "VEC-37" ? "work-2" : "work-1",
      key: key,
      title: key == "VEC-37" ? "Review notification delivery policy" : "Request → Work mobile companion",
      workStatus: key == "VEC-37" ? .blocked : .active,
      description: "Track the focused execution without losing the Requests, Tasks, agent progress, or ownership history around it.",
      owner: owner,
      ownerId: owner.id,
      effort: key == "VEC-37" ? "m" : "l",
      linkedRequests: [VectorLinkedRequest(id: "request-1", key: "REQ-18", title: "Make agent handoffs legible", expectedOutput: "A reviewed handoff flow with preserved context.", status: .readyForReview, relation: "fulfills")],
      tasks: [
        VectorWorkTask(id: "task-1", number: 1, title: "Model explicit owner start", status: .done, assignee: owner),
        VectorWorkTask(id: "task-2", number: 2, title: "Validate notification routing", status: .inProgress, assignee: owner),
        VectorWorkTask(id: "task-3", number: 3, title: "Exercise Simulator flow", status: .todo, assignee: owner),
      ],
      ownershipPeriods: [
        VectorWorkOwnershipPeriod(id: "ownership-1", owner: owner, summary: "Accepted after the routing pass.", startedAt: now - 14_400_000, executionStartedAt: now - 10_800_000),
        VectorWorkOwnershipPeriod(id: "ownership-0", owner: VectorUser(id: "user-2", name: "Maya"), summary: "Established the first mobile direction.", startedAt: now - 259_200_000, executionStartedAt: now - 250_000_000, endedAt: now - 14_400_000),
      ],
      attention: key == "VEC-37" ? [VectorWorkAttention(id: "attention-1", prompt: "Choose whether reminders should escalate after two misses.", details: "A human decision is required before continuing.", status: "open", requestedAt: now - 3_600_000)] : [],
      executions: [
        VectorWorkExecution(id: "execution-1", title: "Building native Work flow", provider: "codex", status: "active", latestSummary: "Compiling and checking the iOS surface in Simulator."),
        VectorWorkExecution(id: "execution-2", title: "Reviewing notification policy", provider: "claude_code", status: "waiting_for_input", latestSummary: "Waiting for the reminder escalation decision."),
      ],
      ownerStartedAt: now - 10_800_000,
      creationTime: now - 604_800_000
    )
    return Just<VectorWorkDetail?>(detail)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func issuesPage(
    orgSlug: String,
    scope: VectorIssueScope,
    pageSize: Int,
    cursor: String?
  ) -> AnyPublisher<VectorPaginatedPage<VectorIssueRow>, Error> {
    mockPage(VectorMockData.issues, pageSize: pageSize, cursor: cursor)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func issue(orgSlug: String, key: String) -> AnyPublisher<VectorIssueRow?, Error> {
    Just(VectorMockData.issues.first { $0.key == key })
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func projectsPage(
    orgSlug: String,
    scope: VectorProjectScope,
    pageSize: Int,
    cursor: String?
  ) -> AnyPublisher<VectorPaginatedPage<VectorProject>, Error> {
    mockPage(VectorMockData.projects, pageSize: pageSize, cursor: cursor)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func teamsPage(
    orgSlug: String,
    scope: VectorProjectScope,
    pageSize: Int,
    cursor: String?
  ) -> AnyPublisher<VectorPaginatedPage<VectorTeam>, Error> {
    mockPage(VectorMockData.teams, pageSize: pageSize, cursor: cursor)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func documentsPage(orgSlug: String, pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorDocument>, Error> {
    mockPage(VectorMockData.documents, pageSize: pageSize, cursor: cursor)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func document(documentId: VectorID) -> AnyPublisher<VectorDocument?, Error> {
    Just(VectorMockData.documents.first { $0.id == documentId })
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func documentContentPage(
    documentId: VectorID,
    version: String,
    pageSize: Int,
    cursor: String?
  ) -> AnyPublisher<VectorPaginatedPage<VectorDocumentContentChunk>, Error> {
    Just(VectorPaginatedPage<VectorDocumentContentChunk>(page: [], isDone: true))
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func workspaceOptions(orgSlug: String) -> AnyPublisher<VectorWorkspaceOptions, Error> {
    Just(VectorMockData.workspaceOptions)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func comments(issueId: VectorID) -> AnyPublisher<[VectorComment], Error> {
    Just(VectorMockData.comments)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func assignments(issueId: VectorID) -> AnyPublisher<[VectorIssueAssignment], Error> {
    let assignments = VectorMockData.issues
      .filter { $0.id == issueId }
      .map {
        VectorIssueAssignment(
          id: "assignment-\($0.id)",
          assigneeId: $0.assigneeId,
          assigneeName: $0.assigneeName,
          assigneeEmail: $0.assigneeEmail,
          assigneeImage: $0.assigneeImage,
          stateId: $0.workflowStateId,
          stateName: $0.workflowStateName,
          stateIcon: $0.workflowStateIcon,
          stateColor: $0.workflowStateColor,
          stateType: $0.workflowStateType
        )
      }

    return Just(assignments)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func issueActivity(issueId: VectorID) -> AnyPublisher<[VectorActivityItem], Error> {
    Just(VectorMockData.activityItems)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func inboxActivityPage(orgSlug: String, pageSize: Int, cursor: String?) -> AnyPublisher<VectorOrgActivityPage, Error> {
    let start = min(cursor.flatMap(Int.init) ?? 0, VectorMockData.activityItems.count)
    let end = min(start + pageSize, VectorMockData.activityItems.count)
    let items = Array(VectorMockData.activityItems[start..<end])
    let nextCursor = end < VectorMockData.activityItems.count ? String(end) : nil

    return Just(VectorOrgActivityPage(items: items, nextCursor: nextCursor))
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func inboxNotificationsPage(pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorInboxNotification>, Error> {
    mockPage(VectorMockData.inboxNotifications, pageSize: pageSize, cursor: cursor)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func userStatus() -> AnyPublisher<VectorUserStatus?, Error> {
    Just(VectorUserStatus(presence: .online, customText: "Building Vector iOS", customEmoji: "V", updatedAt: Date().timeIntervalSince1970 * 1000))
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func notificationPreferences() -> AnyPublisher<[VectorNotificationPreference], Error> {
    Just([
      VectorNotificationPreference(category: .invites, inAppEnabled: true, emailEnabled: true, pushEnabled: false),
      VectorNotificationPreference(category: .assignments, inAppEnabled: true, emailEnabled: true, pushEnabled: true),
      VectorNotificationPreference(category: .mentions, inAppEnabled: true, emailEnabled: true, pushEnabled: true),
      VectorNotificationPreference(category: .comments, inAppEnabled: true, emailEnabled: false, pushEnabled: true),
      VectorNotificationPreference(category: .workSessions, inAppEnabled: true, emailEnabled: false, pushEnabled: true),
      VectorNotificationPreference(category: .teamStatusChanges, inAppEnabled: true, emailEnabled: false, pushEnabled: false),
      VectorNotificationPreference(category: .requests, inAppEnabled: true, emailEnabled: true, pushEnabled: true),
      VectorNotificationPreference(category: .handoffs, inAppEnabled: true, emailEnabled: true, pushEnabled: true),
      VectorNotificationPreference(category: .reviews, inAppEnabled: true, emailEnabled: true, pushEnabled: true),
      VectorNotificationPreference(category: .attention, inAppEnabled: true, emailEnabled: false, pushEnabled: true),
      VectorNotificationPreference(category: .reminders, inAppEnabled: true, emailEnabled: false, pushEnabled: true),
      VectorNotificationPreference(category: .github, inAppEnabled: true, emailEnabled: false, pushEnabled: true),
    ])
    .setFailureType(to: Error.self)
    .eraseToAnyPublisher()
  }

  public func mobilePushTokens() -> AnyPublisher<[VectorMobilePushTokenRegistration], Error> {
    Just([])
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }

  public func setPresence(_ presence: VectorPresenceStatus) async throws {}

  public func setCustomStatus(text: String?, emoji: String?, clearsAt: Double?) async throws {}

  public func clearCustomStatus() async throws {}

  public func updateNotificationPreference(_ preference: VectorNotificationPreference) async throws {}

  public func upsertMobilePushToken(_ token: VectorPushDeviceToken, bundleId: String?, deviceLabel: String?) async throws {}

  public func removeMobilePushToken(_ token: VectorPushDeviceToken) async throws {}

  public func createRequest(orgSlug: String, title: String, description: String?, expectedOutput: String, reviewGuidance: String?, priorityId: VectorID?, clientRequestId: String) async throws -> VectorCreateRequestResult {
    VectorCreateRequestResult(requestId: "request-created", requestKey: "REQ-20")
  }

  public func claimRequest(requestId: VectorID) async throws {}

  public func requestChanges(requestId: VectorID, note: String) async throws {}

  public func completeRequest(requestId: VectorID) async throws {}

  public func createWork(orgSlug: String, title: String, description: String?, ownerId: VectorID?, requestIds: [VectorID]?) async throws -> VectorCreateWorkResult {
    VectorCreateWorkResult(workId: "work-created", workKey: "WORK-20")
  }

  public func startWork(workId: VectorID) async throws {}

  public func setWorkStatus(workId: VectorID, status: VectorWorkStatus) async throws {}

  public func readyWorkForReview(workId: VectorID) async throws {}

  public func completeWork(workId: VectorID) async throws {}

  public func respondToWorkHandoff(handoffId: VectorID, accept: Bool) async throws {}

  public func proposeWorkHandoff(workId: VectorID, toOwnerId: VectorID, summary: String, note: String?) async throws {}

  public func raiseWorkAttention(workId: VectorID, title: String, details: String?) async throws {}

  public func createTask(workId: VectorID, title: String, assigneeId: VectorID?) async throws -> VectorCreateTaskResult {
    VectorCreateTaskResult(taskId: "task-created")
  }

  public func setTaskStatus(taskId: VectorID, status: VectorTaskStatus) async throws {}

  public func updateTitle(issueId: VectorID, title: String) async throws {}

  public func updateDescription(issueId: VectorID, description: String?) async throws {}

  public func updateDocument(documentId: VectorID, title: String, content: String?) async throws {}

  public func changeWorkflowState(issueId: VectorID, stateId: VectorID) async throws {}

  public func changePriority(issueId: VectorID, priorityId: VectorID) async throws {}

  public func updateAssignees(issueId: VectorID, assigneeIds: [VectorID]) async throws {}

  public func changeProject(issueId: VectorID, projectId: VectorID?) async throws {}

  public func changeTeam(issueId: VectorID, teamId: VectorID?) async throws {}

  public func changeVisibility(issueId: VectorID, visibility: String) async throws {}

  public func addComment(issueId: VectorID, body: String, parentId: VectorID? = nil) async throws -> VectorID {
    "mock-comment"
  }

  public func createIssue(
    orgSlug: String,
    title: String,
    description: String?,
    projectId: VectorID?,
    teamId: VectorID?,
    stateId: VectorID?,
    priorityId: VectorID?,
    assigneeIds: [VectorID]
  ) async throws -> VectorCreateIssueResult {
    VectorCreateIssueResult(issueId: "mock-created-issue", key: "MOCK-1")
  }

  private func mockPage<Item: Decodable>(_ items: [Item], pageSize: Int, cursor: String?) -> Just<VectorPaginatedPage<Item>> {
    let start = min(cursor.flatMap(Int.init) ?? 0, items.count)
    let end = min(start + pageSize, items.count)
    let page = Array(items[start..<end])
    return Just(
      VectorPaginatedPage(
        page: page,
        continueCursor: end < items.count ? String(end) : "",
        isDone: end >= items.count
      )
    )
  }
}
