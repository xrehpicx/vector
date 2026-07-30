@preconcurrency import ConvexMobile
import Foundation

public typealias VectorID = String

public struct VectorMobileConfiguration: Equatable, Sendable {
  public var orgSlug: String
  public var convexDeploymentURL: URL
  public var webBaseURL: URL

  public init(
    orgSlug: String,
    convexDeploymentURL: URL,
    webBaseURL: URL
  ) {
    self.orgSlug = orgSlug
    self.convexDeploymentURL = convexDeploymentURL
    self.webBaseURL = webBaseURL
  }

  public static let demo = VectorMobileConfiguration(
    orgSlug: "demo",
    convexDeploymentURL: URL(string: "https://demo.invalid")!,
    webBaseURL: URL(string: "https://vector.imai.studio")!
  )

  public func webURL(path: String) -> URL {
    webBaseURL.appending(path: path)
  }

  public var workspaceWebURL: URL {
    webURL(path: "/\(orgSlug)")
  }
}

public struct VectorOrganization: Decodable, Equatable, Identifiable, Sendable {
  public let id: VectorID
  public let name: String
  public let slug: String
  public let logo: String?

  public init(id: VectorID, name: String, slug: String, logo: String? = nil) {
    self.id = id
    self.name = name
    self.slug = slug
    self.logo = logo
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case name
    case slug
    case logo
  }

  public func logoURL(baseURL: URL) -> URL? {
    guard let logo = logo?.trimmingCharacters(in: .whitespacesAndNewlines), !logo.isEmpty else {
      return nil
    }
    if let url = URL(string: logo), url.scheme != nil {
      return url
    }
    return baseURL.appending(path: "/api/files/\(logo)")
  }
}

public struct VectorAuthenticatedUser: Codable, Equatable, Sendable {
  public let id: String?
  public let email: String?
  public let name: String?
  public let username: String?
  public let image: String?

  public init(id: String? = nil, email: String? = nil, name: String? = nil, username: String? = nil, image: String? = nil) {
    self.id = id
    self.email = email
    self.name = name
    self.username = username
    self.image = image
  }

  public var displayName: String {
    name ?? username ?? email ?? "Signed in"
  }
}

public enum VectorPresenceStatus: String, CaseIterable, Codable, Equatable, Identifiable, Sendable {
  case online
  case idle
  case dnd
  case invisible
  case offline

  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    let rawValue = try container.decode(String.self)
    self = VectorPresenceStatus(rawValue: rawValue) ?? .offline
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    try container.encode(rawValue)
  }

  public var id: String { rawValue }

  public static var selectableCases: [VectorPresenceStatus] {
    [.online, .idle, .dnd, .invisible]
  }

  public var label: String {
    switch self {
    case .online: "Online"
    case .idle: "Idle"
    case .dnd: "Do not disturb"
    case .invisible: "Invisible"
    case .offline: "Offline"
    }
  }

  public var systemImage: String {
    switch self {
    case .online: "circle.fill"
    case .idle: "moon.fill"
    case .dnd: "minus.circle.fill"
    case .invisible: "circle"
    case .offline: "circle"
    }
  }

  public var colorHex: String {
    switch self {
    case .online: "#22c55e"
    case .idle: "#f59e0b"
    case .dnd: "#ef4444"
    case .invisible: "#94a3b8"
    case .offline: "#94a3b8"
    }
  }
}

public struct VectorUserStatus: Decodable, Equatable, Sendable {
  public let presence: VectorPresenceStatus
  public let customText: String?
  public let customEmoji: String?
  @OptionalConvexFloat private var clearsAtValue: Double?
  @OptionalConvexFloat private var updatedAtValue: Double?

  public init(
    presence: VectorPresenceStatus,
    customText: String? = nil,
    customEmoji: String? = nil,
    clearsAt: Double? = nil,
    updatedAt: Double? = nil
  ) {
    self.presence = presence
    self.customText = customText
    self.customEmoji = customEmoji
    self._clearsAtValue = OptionalConvexFloat(wrappedValue: clearsAt)
    self._updatedAtValue = OptionalConvexFloat(wrappedValue: updatedAt)
  }

  private enum CodingKeys: String, CodingKey {
    case presence
    case customText
    case customEmoji
    case clearsAtValue = "clearsAt"
    case updatedAtValue = "updatedAt"
  }

  public var clearsAt: Double? {
    clearsAtValue
  }

  public var updatedAt: Double? {
    updatedAtValue
  }
}

public enum VectorNotificationCategory: String, CaseIterable, Codable, Equatable, Identifiable, Sendable {
  case invites
  case assignments
  case mentions
  case comments
  case workSessions = "work_sessions"
  case teamStatusChanges = "team_status_changes"
  case requests
  case handoffs
  case reviews
  case attention
  case reminders
  case github
  case unknown

  public static let allCases: [VectorNotificationCategory] = [
    .invites,
    .assignments,
    .mentions,
    .comments,
    .workSessions,
    .teamStatusChanges,
    .requests,
    .handoffs,
    .reviews,
    .attention,
    .reminders,
    .github,
  ]

  public init(from decoder: Decoder) throws {
    let value = try decoder.singleValueContainer().decode(String.self)
    self = Self(rawValue: value) ?? .unknown
  }

  public var id: String { rawValue }

  public var label: String {
    switch self {
    case .invites: "Invites"
    case .assignments: "Assignments"
    case .mentions: "Mentions"
    case .comments: "Comments"
    case .workSessions: "Work sessions"
    case .teamStatusChanges: "Team status changes"
    case .requests: "Requests"
    case .handoffs: "Handoffs"
    case .reviews: "Reviews"
    case .attention: "Attention"
    case .reminders: "Reminders"
    case .github: "GitHub"
    case .unknown: "Other"
    }
  }
}

public struct VectorNotificationPreference: Decodable, Equatable, Identifiable, Sendable {
  public var id: VectorNotificationCategory { category }
  public let category: VectorNotificationCategory
  public let inAppEnabled: Bool
  public let emailEnabled: Bool
  public let pushEnabled: Bool

  public init(
    category: VectorNotificationCategory,
    inAppEnabled: Bool,
    emailEnabled: Bool,
    pushEnabled: Bool
  ) {
    self.category = category
    self.inAppEnabled = inAppEnabled
    self.emailEnabled = emailEnabled
    self.pushEnabled = pushEnabled
  }
}

public struct VectorMobilePushTokenRegistration: Decodable, Equatable, Identifiable, Sendable {
  public let id: VectorID
  public let token: String
  public let environment: String
  public let platform: String
  public let bundleId: String?
  public let deviceLabel: String?
  @OptionalConvexFloat private var disabledAtValue: Double?
  @ConvexFloat public var lastSeenAt: Double

  public init(
    id: VectorID,
    token: String,
    environment: String,
    platform: String = "ios",
    bundleId: String? = nil,
    deviceLabel: String? = nil,
    disabledAt: Double? = nil,
    lastSeenAt: Double
  ) {
    self.id = id
    self.token = token
    self.environment = environment
    self.platform = platform
    self.bundleId = bundleId
    self.deviceLabel = deviceLabel
    self._disabledAtValue = OptionalConvexFloat(wrappedValue: disabledAt)
    self._lastSeenAt = ConvexFloat(wrappedValue: lastSeenAt)
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case token
    case environment
    case platform
    case bundleId
    case deviceLabel
    case disabledAtValue = "disabledAt"
    case lastSeenAt
  }

  public var disabledAt: Double? {
    disabledAtValue
  }
}

public struct VectorUser: Decodable, Equatable, Identifiable {
  public let id: VectorID
  public let name: String?
  public let email: String?
  public let image: String?
  public let status: VectorUserStatus?

  public init(id: VectorID, name: String?, email: String? = nil, image: String? = nil, status: VectorUserStatus? = nil) {
    self.id = id
    self.name = name
    self.email = email
    self.image = image
    self.status = status
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case publicId = "id"
    case name
    case email
    case image
    case imageUrl
    case avatarUrl
    case avatarURL
    case profileImage
    case photoURL
    case picture
    case status
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let name = try container.decodeIfPresent(String.self, forKey: .name)
    let email = try container.decodeIfPresent(String.self, forKey: .email)

    self.id = try container.decodeIfPresent(VectorID.self, forKey: .id)
      ?? container.decodeIfPresent(VectorID.self, forKey: .publicId)
      ?? email
      ?? name
      ?? "user"
    self.name = name
    self.email = email
    self.image = [
      try container.decodeIfPresent(String.self, forKey: .image),
      try container.decodeIfPresent(String.self, forKey: .imageUrl),
      try container.decodeIfPresent(String.self, forKey: .avatarUrl),
      try container.decodeIfPresent(String.self, forKey: .avatarURL),
      try container.decodeIfPresent(String.self, forKey: .profileImage),
      try container.decodeIfPresent(String.self, forKey: .photoURL),
      try container.decodeIfPresent(String.self, forKey: .picture),
    ]
    .compactMap { value in
      value?.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    .first { !$0.isEmpty }
    self.status = try container.decodeIfPresent(VectorUserStatus.self, forKey: .status)
  }

  public var displayName: String {
    name ?? email ?? "Unknown user"
  }

  public var mentionHandle: String {
    if let email,
       let prefix = email.split(separator: "@", maxSplits: 1).first
    {
      let emailPrefix = String(prefix)
        .trimmingCharacters(in: .whitespacesAndNewlines)
      if emailPrefix.isEmpty {
        return normalizedMentionHandle(from: displayName)
      }
      return emailPrefix.lowercased()
    }

    return normalizedMentionHandle(from: displayName)
  }

  private func normalizedMentionHandle(from value: String) -> String {
    let normalized = value
      .lowercased()
      .unicodeScalars
      .map { CharacterSet.alphanumerics.contains($0) ? Character($0) : "-" }
    return String(normalized)
      .split(separator: "-", omittingEmptySubsequences: true)
      .joined(separator: "-")
  }
}

public struct VectorState: Decodable, Equatable, Identifiable {
  public let id: VectorID
  public let name: String
  public let color: String?
  public let icon: String?
  public let type: String
  @ConvexFloat public var position: Double

  public init(
    id: VectorID,
    name: String,
    type: String,
    position: Double,
    color: String? = nil,
    icon: String? = nil
  ) {
    self.id = id
    self.name = name
    self.type = type
    self._position = ConvexFloat(wrappedValue: position)
    self.color = color
    self.icon = icon
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case name
    case color
    case icon
    case type
    case position
  }
}

public struct VectorPriority: Decodable, Equatable, Identifiable {
  public let id: VectorID
  public let name: String
  public let color: String?
  public let icon: String?
  @ConvexFloat public var weight: Double

  public init(id: VectorID, name: String, weight: Double, color: String? = nil, icon: String? = nil) {
    self.id = id
    self.name = name
    self._weight = ConvexFloat(wrappedValue: weight)
    self.color = color
    self.icon = icon
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case name
    case color
    case icon
    case weight
  }
}

public struct VectorProjectStatus: Decodable, Equatable, Identifiable {
  public let id: VectorID
  public let name: String
  public let type: String
  public let color: String?
  public let icon: String?
  @ConvexFloat public var position: Double

  public init(
    id: VectorID,
    name: String,
    type: String,
    position: Double,
    color: String? = nil,
    icon: String? = nil
  ) {
    self.id = id
    self.name = name
    self.type = type
    self._position = ConvexFloat(wrappedValue: position)
    self.color = color
    self.icon = icon
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case name
    case type
    case color
    case icon
    case position
  }
}

public struct VectorIssueAssignment: Decodable, Equatable, Identifiable {
  public let id: VectorID
  public let assigneeId: VectorID?
  public let assigneeName: String?
  public let assigneeEmail: String?
  public let assigneeImage: String?
  public let stateId: VectorID?
  public let stateName: String?
  public let stateIcon: String?
  public let stateColor: String?
  public let stateType: String?
  public let note: String?

  public init(
    id: VectorID,
    assigneeId: VectorID?,
    assigneeName: String?,
    assigneeEmail: String? = nil,
    assigneeImage: String? = nil,
    stateId: VectorID?,
    stateName: String?,
    stateIcon: String? = nil,
    stateColor: String? = nil,
    stateType: String? = nil,
    note: String? = nil
  ) {
    self.id = id
    self.assigneeId = assigneeId
    self.assigneeName = assigneeName
    self.assigneeEmail = assigneeEmail
    self.assigneeImage = assigneeImage
    self.stateId = stateId
    self.stateName = stateName
    self.stateIcon = stateIcon
    self.stateColor = stateColor
    self.stateType = stateType
    self.note = note
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case assignmentId
    case assignee
    case assigneeId
    case assigneeName
    case assigneeEmail
    case assigneeImage
    case state
    case stateId
    case stateName
    case stateIcon
    case stateColor
    case stateType
    case note
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let nestedAssignee = try container.decodeIfPresent(VectorUser.self, forKey: .assignee)
    let nestedState = try container.decodeIfPresent(VectorState.self, forKey: .state)

    self.id = try container.decodeIfPresent(VectorID.self, forKey: .assignmentId)
      ?? container.decodeIfPresent(VectorID.self, forKey: .id)
      ?? "assignment"
    self.assigneeId = try container.decodeIfPresent(VectorID.self, forKey: .assigneeId) ?? nestedAssignee?.id
    self.assigneeName = try container.decodeIfPresent(String.self, forKey: .assigneeName) ?? nestedAssignee?.name
    self.assigneeEmail = try container.decodeIfPresent(String.self, forKey: .assigneeEmail) ?? nestedAssignee?.email
    self.assigneeImage = try container.decodeIfPresent(String.self, forKey: .assigneeImage) ?? nestedAssignee?.image
    self.stateId = try container.decodeIfPresent(VectorID.self, forKey: .stateId) ?? nestedState?.id
    self.stateName = try container.decodeIfPresent(String.self, forKey: .stateName) ?? nestedState?.name
    self.stateIcon = try container.decodeIfPresent(String.self, forKey: .stateIcon) ?? nestedState?.icon
    self.stateColor = try container.decodeIfPresent(String.self, forKey: .stateColor) ?? nestedState?.color
    self.stateType = try container.decodeIfPresent(String.self, forKey: .stateType) ?? nestedState?.type
    self.note = try container.decodeIfPresent(String.self, forKey: .note)
  }
}

public struct VectorPullRequestSummary: Decodable, Equatable, Identifiable {
  public var id: String { url }
  @ConvexFloat private var numberValue: Double
  public let state: String
  public let url: String

  public var number: Int {
    Int(numberValue)
  }

  public init(number: Int, state: String, url: String) {
    self._numberValue = ConvexFloat(wrappedValue: Double(number))
    self.state = state
    self.url = url
  }

  private enum CodingKeys: String, CodingKey {
    case numberValue = "number"
    case state
    case url
  }
}

public struct VectorIssueRow: Decodable, Equatable, Identifiable {
  public let id: VectorID
  public let key: String
  public let title: String
  public let description: String?
  public let projectId: VectorID?
  public let projectKey: String?
  public let teamId: VectorID?
  public let teamKey: String?
  public let priorityId: VectorID?
  public let priorityName: String?
  public let priorityIcon: String?
  public let priorityColor: String?
  public let workflowStateId: VectorID?
  public let workflowStateName: String?
  public let workflowStateIcon: String?
  public let workflowStateColor: String?
  public let workflowStateType: String?
  public let reporterName: String?
  public let parentIssueKey: String?
  public let assignmentId: VectorID?
  public let assigneeId: VectorID?
  public let assigneeName: String?
  public let assigneeEmail: String?
  public let assigneeImage: String?
  public let dueDate: String?
  public let visibility: String?
  public let lastActivityEventType: String?
  public let linkedPrs: [VectorPullRequestSummary]
  public let canEdit: Bool?
  @ConvexFloat public var creationTime: Double
  @OptionalConvexFloat private var updatedAtValue: Double?

  public init(
    id: VectorID,
    key: String,
    title: String,
    description: String? = nil,
    projectId: VectorID? = nil,
    projectKey: String? = nil,
    teamId: VectorID? = nil,
    teamKey: String? = nil,
    priorityId: VectorID? = nil,
    priorityName: String? = nil,
    priorityIcon: String? = nil,
    priorityColor: String? = nil,
    workflowStateId: VectorID? = nil,
    workflowStateName: String? = nil,
    workflowStateIcon: String? = nil,
    workflowStateColor: String? = nil,
    workflowStateType: String? = nil,
    reporterName: String? = nil,
    parentIssueKey: String? = nil,
    assignmentId: VectorID? = nil,
    assigneeId: VectorID? = nil,
    assigneeName: String? = nil,
    assigneeEmail: String? = nil,
    assigneeImage: String? = nil,
    dueDate: String? = nil,
    visibility: String? = "organization",
    lastActivityEventType: String? = nil,
    linkedPrs: [VectorPullRequestSummary] = [],
    canEdit: Bool? = nil,
    creationTime: Double,
    updatedAt: Double? = nil
  ) {
    self.id = id
    self.key = key
    self.title = title
    self.description = description
    self.projectId = projectId
    self.projectKey = projectKey
    self.teamId = teamId
    self.teamKey = teamKey
    self.priorityId = priorityId
    self.priorityName = priorityName
    self.priorityIcon = priorityIcon
    self.priorityColor = priorityColor
    self.workflowStateId = workflowStateId
    self.workflowStateName = workflowStateName
    self.workflowStateIcon = workflowStateIcon
    self.workflowStateColor = workflowStateColor
    self.workflowStateType = workflowStateType
    self.reporterName = reporterName
    self.parentIssueKey = parentIssueKey
    self.assignmentId = assignmentId
    self.assigneeId = assigneeId
    self.assigneeName = assigneeName
    self.assigneeEmail = assigneeEmail
    self.assigneeImage = assigneeImage
    self.dueDate = dueDate
    self.visibility = visibility
    self.lastActivityEventType = lastActivityEventType
    self.linkedPrs = linkedPrs
    self.canEdit = canEdit
    self._creationTime = ConvexFloat(wrappedValue: creationTime)
    self._updatedAtValue = OptionalConvexFloat(wrappedValue: updatedAt)
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case key
    case title
    case description
    case projectId
    case projectKey
    case teamId
    case teamKey
    case priorityId
    case priorityName
    case priorityIcon
    case priorityColor
    case workflowStateId
    case workflowStateName
    case workflowStateIcon
    case workflowStateColor
    case workflowStateType
    case reporterName
    case parentIssueKey
    case assignmentId
    case assigneeId
    case assigneeName
    case assigneeEmail
    case assigneeImage
    case dueDate
    case visibility
    case lastActivityEventType
    case linkedPrs
    case canEdit
    case creationTime = "_creationTime"
    case updatedAtValue = "updatedAt"
  }

  public var updatedAt: Double {
    updatedAtValue ?? creationTime
  }

  public var rowId: String {
    "\(id):\(assignmentId ?? assigneeId ?? "unassigned")"
  }

  public var stateLabel: String {
    workflowStateName ?? "No status"
  }

  public var assigneeLabel: String {
    assigneeName ?? "Unassigned"
  }

  public func withTitle(_ title: String) -> VectorIssueRow {
    copying(title: title, updatedAt: Date().timeIntervalSince1970 * 1000)
  }

  public func withDescription(_ description: String?) -> VectorIssueRow {
    copying(description: .some(description), updatedAt: Date().timeIntervalSince1970 * 1000)
  }

  public func withWorkflowState(_ state: VectorState) -> VectorIssueRow {
    copying(
      workflowStateId: state.id,
      workflowStateName: state.name,
      workflowStateIcon: state.icon,
      workflowStateColor: state.color,
      workflowStateType: state.type,
      updatedAt: Date().timeIntervalSince1970 * 1000
    )
  }

  public func withPriority(_ priority: VectorPriority) -> VectorIssueRow {
    copying(
      priorityId: priority.id,
      priorityName: priority.name,
      priorityIcon: priority.icon,
      priorityColor: priority.color,
      updatedAt: Date().timeIntervalSince1970 * 1000
    )
  }

  public func withProject(_ project: VectorProject?) -> VectorIssueRow {
    copying(
      projectId: .some(project?.id),
      projectKey: .some(project?.key),
      updatedAt: Date().timeIntervalSince1970 * 1000
    )
  }

  public func withTeam(_ team: VectorTeam?) -> VectorIssueRow {
    copying(
      teamId: .some(team?.id),
      teamKey: .some(team?.key),
      updatedAt: Date().timeIntervalSince1970 * 1000
    )
  }

  public func withPrimaryAssignee(_ member: VectorWorkspaceMember?) -> VectorIssueRow {
    copying(
      assigneeId: .some(member?.userId),
      assigneeName: .some(member?.displayName),
      assigneeEmail: .some(member?.email),
      assigneeImage: .some(member?.image),
      updatedAt: Date().timeIntervalSince1970 * 1000
    )
  }

  public func withVisibility(_ visibility: String) -> VectorIssueRow {
    copying(visibility: visibility, updatedAt: Date().timeIntervalSince1970 * 1000)
  }

  private func copying(
    title: String? = nil,
    description: String?? = nil,
    projectId: VectorID?? = nil,
    projectKey: String?? = nil,
    teamId: VectorID?? = nil,
    teamKey: String?? = nil,
    priorityId: VectorID? = nil,
    priorityName: String? = nil,
    priorityIcon: String? = nil,
    priorityColor: String? = nil,
    workflowStateId: VectorID? = nil,
    workflowStateName: String? = nil,
    workflowStateIcon: String? = nil,
    workflowStateColor: String? = nil,
    workflowStateType: String? = nil,
    assigneeId: VectorID?? = nil,
    assigneeName: String?? = nil,
    assigneeEmail: String?? = nil,
    assigneeImage: String?? = nil,
    visibility: String? = nil,
    updatedAt: Double? = nil
  ) -> VectorIssueRow {
    VectorIssueRow(
      id: id,
      key: key,
      title: title ?? self.title,
      description: description ?? self.description,
      projectId: projectId ?? self.projectId,
      projectKey: projectKey ?? self.projectKey,
      teamId: teamId ?? self.teamId,
      teamKey: teamKey ?? self.teamKey,
      priorityId: priorityId ?? self.priorityId,
      priorityName: priorityName ?? self.priorityName,
      priorityIcon: priorityIcon ?? self.priorityIcon,
      priorityColor: priorityColor ?? self.priorityColor,
      workflowStateId: workflowStateId ?? self.workflowStateId,
      workflowStateName: workflowStateName ?? self.workflowStateName,
      workflowStateIcon: workflowStateIcon ?? self.workflowStateIcon,
      workflowStateColor: workflowStateColor ?? self.workflowStateColor,
      workflowStateType: workflowStateType ?? self.workflowStateType,
      reporterName: reporterName,
      parentIssueKey: parentIssueKey,
      assignmentId: assignmentId,
      assigneeId: assigneeId ?? self.assigneeId,
      assigneeName: assigneeName ?? self.assigneeName,
      assigneeEmail: assigneeEmail ?? self.assigneeEmail,
      assigneeImage: assigneeImage ?? self.assigneeImage,
      dueDate: dueDate,
      visibility: visibility ?? self.visibility,
      lastActivityEventType: lastActivityEventType,
      linkedPrs: linkedPrs,
      canEdit: canEdit,
      creationTime: creationTime,
      updatedAt: updatedAt ?? self.updatedAt
    )
  }
}

public struct VectorIssueMetadataValue: Equatable {
  public let id: VectorID?
  public let name: String
  public let icon: String?
  public let color: String?

  public init(id: VectorID?, name: String, icon: String?, color: String?) {
    self.id = id
    self.name = name
    self.icon = icon
    self.color = color
  }
}

public enum VectorIssueMetadataResolver {
  public static func state(
    for issue: VectorIssueRow,
    options: VectorWorkspaceOptions?
  ) -> VectorIssueMetadataValue {
    if let state = options?.issueStates.first(where: { $0.id == issue.workflowStateId }) {
      return VectorIssueMetadataValue(
        id: state.id,
        name: state.name,
        icon: state.icon,
        color: state.color
      )
    }

    return VectorIssueMetadataValue(
      id: issue.workflowStateId,
      name: issue.stateLabel,
      icon: issue.workflowStateIcon,
      color: issue.workflowStateColor
    )
  }

  public static func priority(
    for issue: VectorIssueRow,
    options: VectorWorkspaceOptions?
  ) -> VectorIssueMetadataValue? {
    if let priority = options?.issuePriorities.first(where: { $0.id == issue.priorityId }) {
      return VectorIssueMetadataValue(
        id: priority.id,
        name: priority.name,
        icon: priority.icon,
        color: priority.color
      )
    }

    guard let priorityName = issue.priorityName else {
      return nil
    }

    return VectorIssueMetadataValue(
      id: issue.priorityId,
      name: priorityName,
      icon: issue.priorityIcon,
      color: issue.priorityColor
    )
  }
}

public struct VectorIssueDetail: Decodable, Equatable, Identifiable {
  public let id: VectorID
  public let key: String
  public let title: String
  public let description: String?
  public let priority: VectorPriority?
  public let workflowState: VectorState?
  public let project: VectorProject?
  public let assignees: [VectorUser]
  public let createdBy: VectorUser?
  public let children: [VectorIssueRow]
  @ConvexFloat public var creationTime: Double

  public init(
    id: VectorID,
    key: String,
    title: String,
    description: String?,
    priority: VectorPriority?,
    workflowState: VectorState?,
    project: VectorProject?,
    assignees: [VectorUser],
    createdBy: VectorUser?,
    children: [VectorIssueRow],
    creationTime: Double
  ) {
    self.id = id
    self.key = key
    self.title = title
    self.description = description
    self.priority = priority
    self.workflowState = workflowState
    self.project = project
    self.assignees = assignees
    self.createdBy = createdBy
    self.children = children
    self._creationTime = ConvexFloat(wrappedValue: creationTime)
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case key
    case title
    case description
    case priority
    case workflowState
    case project
    case assignees
    case createdBy
    case children
    case creationTime = "_creationTime"
  }
}

public struct VectorProject: Decodable, Equatable, Identifiable {
  public let id: VectorID
  public let key: String
  public let name: String
  public let description: String?
  public let icon: String?
  public let color: String?
  public let teamId: VectorID?
  public let lead: VectorUser?
  public let status: VectorProjectStatus?
  public let visibility: String?
  @ConvexFloat public var creationTime: Double

  public init(
    id: VectorID,
    key: String,
    name: String,
    description: String? = nil,
    icon: String? = nil,
    color: String? = nil,
    teamId: VectorID? = nil,
    lead: VectorUser? = nil,
    status: VectorProjectStatus? = nil,
    visibility: String? = "organization",
    creationTime: Double
  ) {
    self.id = id
    self.key = key
    self.name = name
    self.description = description
    self.icon = icon
    self.color = color
    self.teamId = teamId
    self.lead = lead
    self.status = status
    self.visibility = visibility
    self._creationTime = ConvexFloat(wrappedValue: creationTime)
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case key
    case name
    case description
    case icon
    case color
    case teamId
    case lead
    case status
    case visibility
    case creationTime = "_creationTime"
  }
}

public struct VectorTeam: Decodable, Equatable, Identifiable {
  public let id: VectorID
  public let key: String
  public let name: String
  public let description: String?
  public let icon: String?
  public let color: String?
  public let lead: VectorUser?
  public let visibility: String?
  @ConvexFloat public var creationTime: Double
  @OptionalConvexFloat private var memberCountValue: Double?

  public init(
    id: VectorID,
    key: String,
    name: String,
    description: String? = nil,
    icon: String? = nil,
    color: String? = nil,
    lead: VectorUser? = nil,
    visibility: String? = "organization",
    memberCount: Int? = nil,
    creationTime: Double
  ) {
    self.id = id
    self.key = key
    self.name = name
    self.description = description
    self.icon = icon
    self.color = color
    self.lead = lead
    self.visibility = visibility
    self._creationTime = ConvexFloat(wrappedValue: creationTime)
    self._memberCountValue = OptionalConvexFloat(wrappedValue: memberCount.map(Double.init))
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case key
    case name
    case description
    case icon
    case color
    case lead
    case visibility
    case creationTime = "_creationTime"
    case memberCountValue = "memberCount"
  }

  public var memberCount: Int? {
    memberCountValue.map(Int.init)
  }
}

public struct VectorDocumentFolder: Decodable, Equatable, Identifiable {
  public let id: VectorID
  public let name: String
  public let description: String?
  public let icon: String?
  public let color: String?
  @ConvexFloat public var creationTime: Double

  public init(
    id: VectorID,
    name: String,
    description: String? = nil,
    icon: String? = nil,
    color: String? = nil,
    creationTime: Double
  ) {
    self.id = id
    self.name = name
    self.description = description
    self.icon = icon
    self.color = color
    self._creationTime = ConvexFloat(wrappedValue: creationTime)
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case name
    case description
    case icon
    case color
    case creationTime = "_creationTime"
  }
}

public struct VectorDocument: Decodable, Equatable, Identifiable {
  public let id: VectorID
  public let title: String
  public let content: String?
  public let contentVersion: String?
  public let icon: String?
  public let color: String?
  public let team: VectorTeamSummary?
  public let project: VectorProjectSummary?
  public let author: VectorUser?
  public let visibility: String?
  @ConvexFloat public var creationTime: Double
  @OptionalConvexFloat private var lastEditedAtValue: Double?

  public init(
    id: VectorID,
    title: String,
    content: String? = nil,
    contentVersion: String? = nil,
    icon: String? = nil,
    color: String? = nil,
    team: VectorTeamSummary? = nil,
    project: VectorProjectSummary? = nil,
    author: VectorUser? = nil,
    visibility: String? = "organization",
    creationTime: Double,
    lastEditedAt: Double? = nil
  ) {
    self.id = id
    self.title = title
    self.content = content
    self.contentVersion = contentVersion
    self.icon = icon
    self.color = color
    self.team = team
    self.project = project
    self.author = author
    self.visibility = visibility
    self._creationTime = ConvexFloat(wrappedValue: creationTime)
    self._lastEditedAtValue = OptionalConvexFloat(wrappedValue: lastEditedAt)
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case title
    case content
    case contentVersion
    case icon
    case color
    case team
    case project
    case author
    case visibility
    case creationTime = "_creationTime"
    case lastEditedAtValue = "lastEditedAt"
  }

  public var updatedAt: Double {
    lastEditedAtValue ?? creationTime
  }
}

public struct VectorDocumentContentChunk: Decodable, Equatable, Identifiable {
  public let id: VectorID
  public let documentId: VectorID
  public let version: String
  @ConvexFloat private var chunkIndexValue: Double
  public let content: String

  public init(
    id: VectorID,
    documentId: VectorID,
    version: String,
    chunkIndex: Int,
    content: String
  ) {
    self.id = id
    self.documentId = documentId
    self.version = version
    self._chunkIndexValue = ConvexFloat(wrappedValue: Double(chunkIndex))
    self.content = content
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case documentId
    case version
    case chunkIndexValue = "chunkIndex"
    case content
  }

  public var chunkIndex: Int {
    Int(chunkIndexValue)
  }
}

public struct VectorTeamSummary: Decodable, Equatable, Identifiable {
  public let id: VectorID
  public let name: String
  public let key: String
  public let icon: String?
  public let color: String?

  public init(id: VectorID, name: String, key: String, icon: String? = nil, color: String? = nil) {
    self.id = id
    self.name = name
    self.key = key
    self.icon = icon
    self.color = color
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case name
    case key
    case icon
    case color
  }
}

public struct VectorProjectSummary: Decodable, Equatable, Identifiable {
  public let id: VectorID
  public let name: String
  public let key: String
  public let icon: String?
  public let color: String?

  public init(id: VectorID, name: String, key: String, icon: String? = nil, color: String? = nil) {
    self.id = id
    self.name = name
    self.key = key
    self.icon = icon
    self.color = color
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case name
    case key
    case icon
    case color
  }
}

public struct VectorComment: Decodable, Equatable, Identifiable {
  public let id: VectorID
  public let body: String
  public let author: VectorUser?
  public let parentId: VectorID?
  @ConvexFloat public var creationTime: Double

  public init(id: VectorID, body: String, author: VectorUser?, parentId: VectorID? = nil, creationTime: Double) {
    self.id = id
    self.body = body
    self.author = author
    self.parentId = parentId
    self._creationTime = ConvexFloat(wrappedValue: creationTime)
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case body
    case author
    case parentId
    case creationTime = "_creationTime"
  }
}

public struct VectorWorkspaceMember: Decodable, Equatable, Identifiable {
  public let id: VectorID
  public let userId: VectorID?
  public let user: VectorUser?
  public let role: String?

  public init(id: VectorID, userId: VectorID?, user: VectorUser?, role: String? = nil) {
    self.id = id
    self.userId = userId
    self.user = user
    self.role = role
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case userId
    case user
    case role
  }

  public var displayName: String {
    user?.displayName ?? "Unknown member"
  }

  public var email: String? {
    user?.email
  }

  public var image: String? {
    user?.image
  }
}

public struct VectorWorkspaceOptions: Decodable, Equatable {
  public let members: [VectorWorkspaceMember]
  public let teams: [VectorTeam]
  public let projects: [VectorProject]
  public let issueStates: [VectorState]
  public let issuePriorities: [VectorPriority]
  public let projectStatuses: [VectorProjectStatus]

  public init(
    members: [VectorWorkspaceMember],
    teams: [VectorTeam],
    projects: [VectorProject],
    issueStates: [VectorState],
    issuePriorities: [VectorPriority],
    projectStatuses: [VectorProjectStatus]
  ) {
    self.members = members
    self.teams = teams
    self.projects = projects
    self.issueStates = issueStates
    self.issuePriorities = issuePriorities
    self.projectStatuses = projectStatuses
  }

  public func memberStatus(userId: VectorID?, email: String?) -> VectorUserStatus? {
    guard userId != nil || email != nil else {
      return nil
    }

    return members.first { member in
      if let userId, member.userId == userId || member.user?.id == userId {
        return true
      }
      if let email, member.email == email {
        return true
      }
      return false
    }?.user?.status
  }
}

public struct VectorActivityTarget: Decodable, Equatable {
  public let type: String
  public let id: VectorID?
  public let key: String?
  public let name: String?

  public init(type: String, id: VectorID?, key: String?, name: String?) {
    self.type = type
    self.id = id
    self.key = key
    self.name = name
  }
}

public struct VectorActivityDetails: Decodable, Equatable {
  public let field: String?
  public let fromLabel: String?
  public let toLabel: String?
  public let roleName: String?
  public let commentId: VectorID?
  public let commentPreview: String?
  public let addedUserNames: [String]
  public let removedUserNames: [String]

  public init(
    field: String? = nil,
    fromLabel: String? = nil,
    toLabel: String? = nil,
    roleName: String? = nil,
    commentId: VectorID? = nil,
    commentPreview: String? = nil,
    addedUserNames: [String] = [],
    removedUserNames: [String] = []
  ) {
    self.field = field
    self.fromLabel = fromLabel
    self.toLabel = toLabel
    self.roleName = roleName
    self.commentId = commentId
    self.commentPreview = commentPreview
    self.addedUserNames = addedUserNames
    self.removedUserNames = removedUserNames
  }

  private enum CodingKeys: String, CodingKey {
    case field
    case fromLabel
    case toLabel
    case roleName
    case commentId
    case commentPreview
    case addedUserNames
    case removedUserNames
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.field = try container.decodeIfPresent(String.self, forKey: .field)
    self.fromLabel = try container.decodeIfPresent(String.self, forKey: .fromLabel)
    self.toLabel = try container.decodeIfPresent(String.self, forKey: .toLabel)
    self.roleName = try container.decodeIfPresent(String.self, forKey: .roleName)
    self.commentId = try container.decodeIfPresent(VectorID.self, forKey: .commentId)
    self.commentPreview = try container.decodeIfPresent(String.self, forKey: .commentPreview)
    self.addedUserNames = try container.decodeIfPresent([String].self, forKey: .addedUserNames) ?? []
    self.removedUserNames = try container.decodeIfPresent([String].self, forKey: .removedUserNames) ?? []
  }
}

public struct VectorActivityItem: Decodable, Equatable, Identifiable {
  public let id: VectorID
  public let entityType: String
  public let eventType: String
  public let actor: VectorUser?
  public let subjectUser: VectorUser?
  public let target: VectorActivityTarget
  public let details: VectorActivityDetails
  @ConvexFloat public var createdAt: Double

  public init(
    id: VectorID,
    entityType: String,
    eventType: String,
    actor: VectorUser?,
    subjectUser: VectorUser? = nil,
    target: VectorActivityTarget,
    details: VectorActivityDetails,
    createdAt: Double
  ) {
    self.id = id
    self.entityType = entityType
    self.eventType = eventType
    self.actor = actor
    self.subjectUser = subjectUser
    self.target = target
    self.details = details
    self._createdAt = ConvexFloat(wrappedValue: createdAt)
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case createdAt
    case entityType
    case eventType
    case actor
    case subjectUser
    case target
    case details
  }
}

public struct VectorPaginatedPage<Item: Decodable>: Decodable {
  public let page: [Item]
  public let continueCursor: String
  public let isDone: Bool

  public init(page: [Item], continueCursor: String = "", isDone: Bool) {
    self.page = page
    self.continueCursor = continueCursor
    self.isDone = isDone
  }

  public var nextCursor: String? {
    let cursor = continueCursor.trimmingCharacters(in: .whitespacesAndNewlines)
    return isDone || cursor.isEmpty ? nil : cursor
  }
}

public struct VectorOrgActivityPage: Decodable {
  public let items: [VectorActivityItem]
  public let nextCursor: String?

  public init(items: [VectorActivityItem], nextCursor: String? = nil) {
    self.items = items
    self.nextCursor = nextCursor
  }

  public var isDone: Bool {
    nextCursor?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true
  }
}

public struct VectorInboxNotification: Decodable, Equatable, Identifiable {
  public let id: VectorID
  public let category: VectorNotificationCategory
  public let eventType: String
  public let title: String
  public let body: String
  public let href: String?
  public let issueId: VectorID?
  public let requestId: VectorID?
  public let taskId: VectorID?
  public let projectId: VectorID?
  public let teamId: VectorID?
  public let actorId: VectorID?
  public let actorName: String?
  public let actorImage: String?
  public let isRead: Bool
  public let isArchived: Bool
  @ConvexFloat public var createdAt: Double

  public init(
    id: VectorID,
    category: VectorNotificationCategory,
    eventType: String,
    title: String,
    body: String,
    href: String? = nil,
    issueId: VectorID? = nil,
    requestId: VectorID? = nil,
    taskId: VectorID? = nil,
    projectId: VectorID? = nil,
    teamId: VectorID? = nil,
    actorId: VectorID? = nil,
    actorName: String? = nil,
    actorImage: String? = nil,
    isRead: Bool = false,
    isArchived: Bool = false,
    createdAt: Double
  ) {
    self.id = id
    self.category = category
    self.eventType = eventType
    self.title = title
    self.body = body
    self.href = href
    self.issueId = issueId
    self.requestId = requestId
    self.taskId = taskId
    self.projectId = projectId
    self.teamId = teamId
    self.actorId = actorId
    self.actorName = actorName
    self.actorImage = actorImage
    self.isRead = isRead
    self.isArchived = isArchived
    self._createdAt = ConvexFloat(wrappedValue: createdAt)
  }

  private enum CodingKeys: String, CodingKey {
    case id = "_id"
    case category
    case eventType
    case title
    case body
    case href
    case issueId
    case requestId
    case taskId
    case projectId
    case teamId
    case actorId
    case actorName
    case actorImage
    case isRead
    case isArchived
    case createdAt
  }

  public var actor: VectorUser? {
    guard actorId != nil || actorName != nil || actorImage != nil else {
      return nil
    }

    return VectorUser(
      id: actorId ?? actorName ?? id,
      name: actorName,
      image: actorImage
    )
  }

  public var issueKey: String? {
    pathKey(after: "issues")
  }

  public var workKey: String? {
    pathKey(after: "work")
  }

  public var requestKey: String? {
    pathKey(after: "requests")
  }

  private func pathKey(after segment: String) -> String? {
    guard let href else {
      return nil
    }

    let parts = href.split(separator: "/").map(String.init)
    guard let segmentIndex = parts.firstIndex(of: segment), parts.indices.contains(segmentIndex + 1) else {
      return nil
    }

    let rawKey = parts[segmentIndex + 1]
    let withoutFragment = rawKey.split(separator: "#", maxSplits: 1).first ?? Substring(rawKey)
    let withoutQuery = withoutFragment.split(separator: "?", maxSplits: 1).first ?? withoutFragment
    let key = String(withoutQuery).trimmingCharacters(in: .whitespacesAndNewlines)
    return key.isEmpty ? nil : key
  }
}

public struct VectorCreateIssueResult: Decodable, Equatable {
  public let issueId: VectorID
  public let key: String

  public init(issueId: VectorID, key: String) {
    self.issueId = issueId
    self.key = key
  }
}
