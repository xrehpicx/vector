import Combine
import ConvexMobile
import XCTest
@testable import VectorMobile

final class VectorMobileTests: XCTestCase {
  func testFunctionNamesUseNestedConvexPathSyntax() {
    XCTAssertEqual(VectorConvexFunctions.getOrganizations, "users:getOrganizations")
    XCTAssertEqual(VectorConvexFunctions.listRequestsPage, "requests/queries:list")
    XCTAssertEqual(VectorConvexFunctions.getRequestByKey, "requests/queries:getByKey")
    XCTAssertEqual(VectorConvexFunctions.getRequestByClientRequestId, "requests/queries:getByClientRequestId")
    XCTAssertEqual(VectorConvexFunctions.listWorkPage, "work/queries:list")
    XCTAssertEqual(VectorConvexFunctions.getWorkByKey, "work/queries:getByKey")
    XCTAssertEqual(VectorConvexFunctions.createWork, "work/mutations:create")
    XCTAssertEqual(VectorConvexFunctions.startWork, "work/mutations:start")
    XCTAssertEqual(VectorConvexFunctions.proposeWorkHandoff, "work/mutations:proposeHandoff")
    XCTAssertEqual(VectorConvexFunctions.raiseWorkAttention, "work/mutations:raiseAttention")
    XCTAssertEqual(VectorConvexFunctions.createTask, "tasks/mutations:create")
    XCTAssertEqual(VectorConvexFunctions.setTaskStatus, "tasks/mutations:setStatus")
    XCTAssertEqual(VectorConvexFunctions.listWorkSessions, "agentBridge/queries:listIssueLiveActivities")
    XCTAssertEqual(VectorConvexFunctions.listDelegationTargets, "agentBridge/queries:listDelegationTargets")
    XCTAssertEqual(VectorConvexFunctions.getAgentSessionSnapshot, "agentBridge/queries:getAgentSessionSnapshot")
    XCTAssertEqual(VectorConvexFunctions.delegateWorkSession, "agentBridge/mutations:delegateIssue")
    XCTAssertEqual(VectorConvexFunctions.sendAgentSessionMessage, "agentBridge/mutations:appendLiveMessage")
    XCTAssertEqual(VectorConvexFunctions.listIssuesPage, "issues/queries:listIssuesPage")
    XCTAssertEqual(VectorConvexFunctions.getIssueByKey, "issues/queries:getByKey")
    XCTAssertEqual(VectorConvexFunctions.createIssue, "issues/mutations:create")
    XCTAssertEqual(VectorConvexFunctions.changeWorkflowState, "issues/mutations:changeWorkflowState")
    XCTAssertEqual(VectorConvexFunctions.updateTitle, "issues/mutations:updateTitle")
    XCTAssertEqual(VectorConvexFunctions.updateDescription, "issues/mutations:updateDescription")
    XCTAssertEqual(VectorConvexFunctions.changeProject, "issues/mutations:changeProject")
    XCTAssertEqual(VectorConvexFunctions.changeVisibility, "issues/mutations:changeVisibility")
    XCTAssertEqual(VectorConvexFunctions.getWorkspaceOptions, "organizations/queries:getWorkspaceOptions")
    XCTAssertEqual(VectorConvexFunctions.listProjectActivity, "activities/queries:listProjectActivity")
    XCTAssertEqual(VectorConvexFunctions.listOrgActivity, "activities/queries:listOrgActivity")
    XCTAssertEqual(VectorConvexFunctions.listDocumentFoldersPage, "documents/folderQueries:listFoldersPage")
    XCTAssertEqual(VectorConvexFunctions.listDocumentsPage, "documents/queries:listPage")
    XCTAssertEqual(VectorConvexFunctions.listDocumentContentChunks, "documents/content:listChunks")
    XCTAssertEqual(VectorConvexFunctions.listInboxNotifications, "notifications/queries:listInbox")
    XCTAssertEqual(VectorConvexFunctions.getCurrentUserStatus, "status:getCurrentUserStatus")
    XCTAssertEqual(VectorConvexFunctions.upsertMobilePushToken, "notifications/mutations:upsertMobilePushToken")
    XCTAssertEqual(VectorConvexFunctions.listCollaborationChannels, "collaboration/channels:list")
    XCTAssertEqual(VectorConvexFunctions.listChannelMessages, "collaboration/messages:listChannel")
    XCTAssertEqual(VectorConvexFunctions.listChannelThread, "collaboration/messages:listThread")
    XCTAssertEqual(VectorConvexFunctions.listPriorityMessages, "collaboration/messages:listPriorityInbox")
    XCTAssertEqual(VectorConvexFunctions.listSavedMessages, "collaboration/messages:listSaved")
    XCTAssertEqual(VectorConvexFunctions.toggleSavedMessage, "collaboration/messages:toggleSaved")
  }

  func testCollaborationModelsDecodeMessagesAgentsAndPriorityMetadata() throws {
    let payload = """
      {
        "message": {
          "message": {
            "_id": "message-1",
            "channelId": "channel-1",
            "actorKind": "agent",
            "authorAgentId": "agent-1",
            "body": "Native collaboration is ready.",
            "format": "markdown",
            "mentionedUserIds": [],
            "mentionedAgentIds": [],
            "replyCount": 2,
            "createdAt": 1774560000000
          },
          "authorUser": null,
          "authorAgent": {
            "_id": "agent-1",
            "name": "Design Agent",
            "handle": "design-agent",
            "avatar": null,
            "ownerUserId": "user-1",
            "provider": "codex",
            "lifecycleStatus": "ready"
          },
          "attachments": [],
          "reactions": [],
          "saved": true,
          "following": true
        },
        "channel": {
          "_id": "channel-1",
          "kind": "public",
          "name": "general",
          "slug": "general",
          "topic": "Company-wide conversation",
          "description": null,
          "icon": null,
          "color": null,
          "isDefault": true,
          "lastMessageAt": 1774560000000,
          "createdAt": 1774550000000,
          "updatedAt": 1774560000000
        },
        "reason": "mention",
        "occurredAt": 1774560000000
      }
      """.data(using: .utf8)!

    let item = try JSONDecoder().decode(VectorPriorityInboxItem.self, from: payload)

    XCTAssertEqual(item.message.authorAgent?.handle, "design-agent")
    XCTAssertEqual(item.message.message.replyCount, 2)
    XCTAssertTrue(item.message.saved)
    XCTAssertEqual(item.channel.kind, .public)
    XCTAssertEqual(item.reason, "mention")
  }

  func testNotificationCategoryRawValuesMatchBackend() {
    XCTAssertEqual(VectorNotificationCategory.teamStatusChanges.rawValue, "team_status_changes")
    XCTAssertEqual(VectorNotificationCategory.teamStatusChanges.label, "Team status changes")
    XCTAssertEqual(VectorNotificationCategory.requests.label, "Requests")
    XCTAssertEqual(VectorNotificationCategory.handoffs.label, "Handoffs")
    XCTAssertEqual(VectorNotificationCategory.reviews.label, "Reviews")
    XCTAssertEqual(VectorNotificationCategory.attention.label, "Attention")
    XCTAssertEqual(VectorNotificationCategory.reminders.label, "Reminders")
    XCTAssertEqual(VectorNotificationCategory.github.label, "GitHub")
  }

  func testRequestAndWorkRowsDecodeNewConvexSurfaces() throws {
    let requestPayload = #"{"_id":"request-1","key":"REQ-1","title":"Ship the flow","expectedOutput":"A reviewed release","status":"ready_for_review","priorityId":"priority-high","linkedWorkCount":2,"recipientCount":1,"createdAt":1774560000000,"updatedAt":1774560300000}"#.data(using: .utf8)!
    let workPayload = #"{"_id":"work-1","key":"VEC-42","title":"Build the flow","workStatus":"active","taskProgress":{"done":3,"total":5},"activeExecutionCount":2,"openAttentionCount":1,"ownerStartedAt":1774560000000,"lastMeaningfulActivityAt":1774560300000,"_creationTime":1774550000000}"#.data(using: .utf8)!

    let request = try JSONDecoder().decode(VectorRequestRow.self, from: requestPayload)
    let work = try JSONDecoder().decode(VectorWorkRow.self, from: workPayload)

    XCTAssertEqual(request.status, .readyForReview)
    XCTAssertEqual(request.priorityId, "priority-high")
    XCTAssertEqual(request.linkedWorkCount, 2)
    XCTAssertEqual(work.workStatus, .active)
    XCTAssertEqual(work.taskProgress.done, 3)
    XCTAssertEqual(work.ownerStartedAt, 1_774_560_000_000)
  }

  func testUnknownWorkModelStatusesRemainDecodable() throws {
    let decoder = JSONDecoder()

    XCTAssertEqual(
      try decoder.decode(VectorRequestStatus.self, from: Data(#""queued""#.utf8)),
      .unknown
    )
    XCTAssertEqual(
      try decoder.decode(VectorWorkStatus.self, from: Data(#""paused_by_policy""#.utf8)),
      .unknown
    )
    XCTAssertEqual(
      try decoder.decode(VectorTaskStatus.self, from: Data(#""skipped""#.utf8)),
      .unknown
    )
    XCTAssertEqual(
      try decoder.decode(VectorNotificationCategory.self, from: Data(#""new_backend_category""#.utf8)),
      .unknown
    )
    XCTAssertFalse(VectorNotificationCategory.allCases.contains(.unknown))
  }

  func testWorkDetailDecodesExecutionHandoffAttentionAndWaitingTask() throws {
    let payload = #"{"_id":"work-1","key":"VEC-42","title":"Build the flow","workStatus":"active","linkedRequests":[],"tasks":[{"_id":"task-1","number":1,"title":"Wait for review","status":"waiting"}],"ownershipPeriods":[],"handoffs":[{"_id":"handoff-1","status":"pending","fromOwner":null,"toOwner":null,"isRecipient":true,"createdAt":1774560000000}],"attention":[{"_id":"attention-1","title":"Choose a rollout path","details":"Blue or green?","status":"open","createdAt":1774560100000}],"executions":[{"_id":"execution-1","provider":"codex","status":"waiting_for_input","latestSummary":"Needs a decision"}],"canEdit":true,"_creationTime":1774550000000}"#.data(using: .utf8)!

    let work = try JSONDecoder().decode(VectorWorkDetail.self, from: payload)

    XCTAssertEqual(work.tasks.first?.status, .waiting)
    XCTAssertNil(work.handoffs.first?.summary)
    XCTAssertEqual(work.handoffs.first?.initiatedAt, 1_774_560_000_000)
    XCTAssertEqual(work.attention.first?.prompt, "Choose a rollout path")
    XCTAssertEqual(work.attention.first?.requestedAt, 1_774_560_100_000)
    XCTAssertNil(work.executions.first?.title)
  }

  func testWorkSessionAndTranscriptDecodeConvexPayloads() throws {
    let sessionPayload = #"{"_id":"activity-1","provider":"codex","providerLabel":"Codex","title":"Implement service mode","status":"active","latestSummary":"Running tests","deviceName":"Raj’s Mac","canInteract":true,"lastEventAt":1774560300000,"workSession":{"_id":"session-1","title":"VEC-42: Service mode","agentProvider":"codex","cwd":"/workspace/vector","repoRoot":"/workspace/vector","branch":"main","canInteract":true,"canManage":true}}"#.data(using: .utf8)!
    let snapshotPayload = #"{"liveActivityId":"activity-1","workSessionId":"session-1","agent":"codex","title":"VEC-42: Service mode","status":"active","cwd":"/workspace/vector","messages":[{"id":"message-1","role":"assistant","text":"Service is running","status":"completed","direction":"agent_to_vector","deliveryStatus":"delivered","createdAt":1774560300000}]}"#.data(using: .utf8)!

    let session = try JSONDecoder().decode(VectorWorkSession.self, from: sessionPayload)
    let snapshot = try JSONDecoder().decode(VectorAgentSessionSnapshot.self, from: snapshotPayload)

    XCTAssertEqual(session.deviceName, "Raj’s Mac")
    XCTAssertEqual(session.displayTitle, "VEC-42: Service mode")
    XCTAssertEqual(session.workSession?.branch, "main")
    XCTAssertTrue(session.canInteract)
    XCTAssertEqual(snapshot.title, "VEC-42: Service mode")
    XCTAssertEqual(snapshot.messages.first?.text, "Service is running")
    XCTAssertEqual(snapshot.messages.first?.direction, "agent_to_vector")
  }

  func testWorkSessionMessagingAvailabilityHandlesAccessAndLifecycle() throws {
    let payload = #"{"_id":"activity-1","provider":"codex","providerLabel":"Codex","status":"active","deviceName":"Raj’s Mac","canInteract":true,"lastEventAt":1774560300000}"#.data(using: .utf8)!
    let session = try JSONDecoder().decode(VectorWorkSession.self, from: payload)

    XCTAssertEqual(session.messagingAvailability(), .available)
    XCTAssertEqual(session.messagingAvailability(effectiveStatus: "waiting_for_input"), .available)
    XCTAssertEqual(session.messagingAvailability(effectiveStatus: "disconnected"), .offline)
    XCTAssertEqual(session.messagingAvailability(effectiveStatus: "completed"), .ended)

    let readOnlyPayload = #"{"_id":"activity-2","provider":"codex","providerLabel":"Codex","status":"active","deviceName":"Shared Mac","canInteract":false,"lastEventAt":1774560300000}"#.data(using: .utf8)!
    let readOnlySession = try JSONDecoder().decode(VectorWorkSession.self, from: readOnlyPayload)
    XCTAssertEqual(readOnlySession.messagingAvailability(), .readOnly)
    XCTAssertEqual(readOnlySession.messagingAvailability(effectiveStatus: "offline"), .offline)
    XCTAssertEqual(readOnlySession.messagingAvailability(effectiveStatus: "failed"), .ended)
  }

  func testNotificationDeepLinksRecognizeRequestAndWorkRoutes() throws {
    let requestPayload = #"{"_id":"notification-1","category":"reviews","eventType":"request_ready_for_review","title":"Ready","body":"Review it","href":"/vector/requests/REQ-8","requestId":"request-8","isRead":false,"isArchived":false,"createdAt":1774560000000}"#.data(using: .utf8)!
    let workPayload = #"{"_id":"notification-2","category":"attention","eventType":"work_blocked","title":"Blocked","body":"Needs input","href":"/vector/work/VEC-9","issueId":"work-9","isRead":false,"isArchived":false,"createdAt":1774560000000}"#.data(using: .utf8)!
    let legacyPayload = #"{"_id":"notification-3","category":"attention","eventType":"work_blocked","title":"Legacy","body":"Open safely","href":"/vector/issues/VEC-10","issueId":"legacy-10","isRead":false,"isArchived":false,"createdAt":1774560000000}"#.data(using: .utf8)!

    let request = try JSONDecoder().decode(VectorInboxNotification.self, from: requestPayload)
    let work = try JSONDecoder().decode(VectorInboxNotification.self, from: workPayload)
    let legacy = try JSONDecoder().decode(VectorInboxNotification.self, from: legacyPayload)

    XCTAssertEqual(request.requestKey, "REQ-8")
    XCTAssertEqual(request.requestId, "request-8")
    XCTAssertEqual(work.workKey, "VEC-9")
    XCTAssertEqual(work.issueId, "work-9")
    XCTAssertNil(legacy.workKey)
    XCTAssertEqual(legacy.issueKey, "VEC-10")
  }

  func testAuthNormalizesAppURLLikeCLI() throws {
    XCTAssertEqual(try VectorAuthClient.normalizeAppURL("vector.example.com").absoluteString, "https://vector.example.com")
    XCTAssertEqual(try VectorAuthClient.normalizeAppURL("https://vector.example.com/").absoluteString, "https://vector.example.com")
    XCTAssertEqual(try VectorAuthClient.normalizeAppURL("localhost:3000/").absoluteString, "http://localhost:3000")
    XCTAssertThrowsError(try VectorAuthClient.normalizeAppURL(""))
  }

  func testCookieHeaderSplitPreservesExpiresCommas() {
    let rawHeader = "session=abc; Path=/; Expires=Wed, 24 Jun 2026 12:00:00 GMT, token=def; Path=/; HttpOnly"

    let cookies = VectorAuthClient.splitSetCookieHeader(rawHeader)

    XCTAssertEqual(cookies.count, 2)
    XCTAssertTrue(cookies[0].contains("Expires=Wed, 24 Jun 2026"))
    XCTAssertTrue(cookies[1].hasPrefix("token=def"))
  }

  func testAuthProviderPrefersFreshSessionOverStaleStoredSession() async throws {
    let appURL = URL(string: "https://vector.example.com")!
    let convexURL = URL(string: "https://example.convex.cloud")!
    let stale = VectorStoredSession(
      appURL: appURL,
      convexURL: convexURL,
      cookies: ["session": "stale"]
    )
    let fresh = VectorStoredSession(
      appURL: appURL,
      convexURL: convexURL,
      cookies: ["session": "fresh"]
    )
    let store = InMemorySessionStore(session: stale)
    let provider = VectorBetterAuthProvider(
      session: fresh,
      authClient: VectorAuthClient(transport: FreshSessionAuthTransport()),
      sessionStore: store
    )

    let result = try await provider.loginFromCache { _ in }

    XCTAssertEqual(result.token, "convex-token")
    XCTAssertEqual(store.session?.cookies["session"], "fresh")
  }

  func testAuthRefreshPreservesWorkspaceOwnedBySharedSessionState() async throws {
    let appURL = URL(string: "https://vector.example.com")!
    let convexURL = URL(string: "https://example.convex.cloud")!
    let session = VectorStoredSession(
      appURL: appURL,
      convexURL: convexURL,
      orgSlug: "imai",
      cookies: ["session": "fresh"]
    )
    let store = InMemorySessionStore(session: session)
    let sessionState = VectorSessionState(session: session, store: store)
    let provider = VectorBetterAuthProvider(
      sessionState: sessionState,
      authClient: VectorAuthClient(transport: FreshSessionAuthTransport())
    )

    try sessionState.selectWorkspace("vector")
    _ = try await provider.loginFromCache { _ in }

    XCTAssertEqual(sessionState.snapshot().orgSlug, "vector")
    XCTAssertEqual(store.session?.orgSlug, "vector")
  }

  func testWorkspaceSelectionRemainsActiveWhenPersistenceFails() {
    let session = VectorStoredSession(
      appURL: URL(string: "https://vector.example.com")!,
      convexURL: URL(string: "https://example.convex.cloud")!,
      orgSlug: "imai"
    )
    let sessionState = VectorSessionState(
      session: session,
      store: FailingSaveSessionStore(session: session)
    )

    XCTAssertThrowsError(try sessionState.selectWorkspace("vector"))
    XCTAssertEqual(sessionState.snapshot().orgSlug, "vector")
  }

  @MainActor
  func testRestoredSessionFallsBackWhenStoredWorkspaceWasRemoved() throws {
    let organizations = [
      VectorOrganization(id: "org-1", name: "Current", slug: "current"),
      VectorOrganization(id: "org-2", name: "Second", slug: "second"),
    ]

    let restored = try VectorMobileSessionController.selectOrganization(
      from: organizations,
      requestedOrgSlug: "removed",
      allowFallback: true
    )

    XCTAssertEqual(restored.slug, "current")
    XCTAssertThrowsError(
      try VectorMobileSessionController.selectOrganization(
        from: organizations,
        requestedOrgSlug: "removed",
        allowFallback: false
      )
    )
  }

  func testAppConfigFallsBackToLocalConvexForLocalDevelopment() async throws {
    let client = VectorAuthClient(transport: FailingAuthTransport())
    let config = try await client.fetchAppConfig(appURL: URL(string: "http://localhost:3000")!)

    XCTAssertEqual(config.convexURL.absoluteString, "http://127.0.0.1:3210")
  }

  func testAppConfigDoesNotFallbackForRemoteInstances() async {
    let client = VectorAuthClient(transport: FailingAuthTransport())

    do {
      _ = try await client.fetchAppConfig(appURL: URL(string: "https://vector.example.com")!)
      XCTFail("Expected remote config fetch to fail.")
    } catch {
      XCTAssertTrue(error is URLError)
    }
  }

  func testAuthErrorsUseReadableMessages() {
    XCTAssertEqual(
      VectorAuthClient.authenticationErrorMessage(
        statusCode: 401,
        data: Data(#"{"message":"Unauthorized"}"#.utf8),
        unauthorizedMessage: "The account or password is incorrect."
      ),
      "The account or password is incorrect."
    )
    XCTAssertEqual(
      VectorAuthClient.authenticationErrorMessage(
        statusCode: 400,
        data: Data(#"{"message":"Email address is not valid."}"#.utf8)
      ),
      "Email address is not valid."
    )
    XCTAssertEqual(
      VectorAuthClient.authenticationErrorMessage(statusCode: 429, data: Data()),
      "Too many sign-in attempts. Wait a moment and try again."
    )
    XCTAssertEqual(
      VectorAuthClient.authenticationErrorMessage(
        statusCode: 500,
        data: Data(#"{"message":"Internal database details"}"#.utf8)
      ),
      "This Vector instance is temporarily unavailable. Try again shortly."
    )
    XCTAssertEqual(
      VectorAuthClient.authenticationErrorMessage(statusCode: 401, data: Data()),
      "Your session is no longer valid. Sign in again."
    )
  }

  func testIssueRowDecodesConvexNumberFields() throws {
    let payload = """
      {
        "_id": "issue-1",
        "_creationTime": 1774550000000,
        "updatedAt": 1774560000000,
        "key": "ROADMAP-1",
        "title": "Native issue detail",
        "description": "Build the compact native issue detail screen.",
        "projectId": "project-1",
        "projectKey": "ROADMAP",
        "teamId": "team-1",
        "teamKey": "PROD",
        "priorityId": "priority-1",
        "priorityName": "High",
        "priorityIcon": "signal-high",
        "priorityColor": "#ef4444",
        "workflowStateId": "state-1",
        "workflowStateName": "In Progress",
        "workflowStateIcon": "loader",
        "workflowStateColor": "#f59e0b",
        "workflowStateType": "in_progress",
        "reporterName": "raj",
        "assignmentId": "assignment-1",
        "assigneeId": "user-1",
        "assigneeName": "raj",
        "assigneeEmail": "raj@example.com",
        "dueDate": "2026-07-08",
        "visibility": "organization",
        "canEdit": true,
        "lastActivityEventType": "comment_added",
        "linkedPrs": [
          { "number": 24, "state": "open", "url": "https://github.com/xrehpicx/vector/pull/24" }
        ]
      }
      """.data(using: .utf8)!

    let issue = try JSONDecoder().decode(VectorIssueRow.self, from: payload)

    XCTAssertEqual(issue.id, "issue-1")
    XCTAssertEqual(issue.key, "ROADMAP-1")
    XCTAssertEqual(issue.rowId, "issue-1:assignment-1")
    XCTAssertEqual(issue.stateLabel, "In Progress")
    XCTAssertEqual(issue.assigneeLabel, "raj")
    XCTAssertEqual(issue.canEdit, true)
    XCTAssertEqual(issue.linkedPrs.first?.number, 24)
    XCTAssertEqual(issue.updatedAt, 1_774_560_000_000)
  }

  func testPaginationArgsEncodeNumItemsAsConvexNumber() throws {
    let encoded = try VectorConvexArguments.pagination(numItems: 30).convexEncode()

    XCTAssertTrue(encoded.contains("\"numItems\":30"))
    XCTAssertTrue(encoded.contains("\"cursor\":null"))
    XCTAssertFalse(encoded.contains("$integer"))
  }

  func testOrganizationDecodesLogoStorageId() throws {
    let payload = """
      {
        "_id": "org-1",
        "name": "Vector",
        "slug": "imai",
        "logo": "storage-logo-1"
      }
      """.data(using: .utf8)!

    let organization = try JSONDecoder().decode(VectorOrganization.self, from: payload)

    XCTAssertEqual(organization.logo, "storage-logo-1")
    XCTAssertEqual(
      organization.logoURL(baseURL: URL(string: "https://imai.tech")!)?.absoluteString,
      "https://imai.tech/api/files/storage-logo-1"
    )
  }

  func testOrganizationLogoURLHandlesAbsoluteAndEmptyValues() {
    let baseURL = URL(string: "https://imai.tech")!
    let absolute = VectorOrganization(
      id: "org-absolute",
      name: "Vector",
      slug: "vector",
      logo: "https://cdn.example.com/vector.png"
    )
    let empty = VectorOrganization(
      id: "org-empty",
      name: "Vector",
      slug: "vector",
      logo: "  "
    )

    XCTAssertEqual(absolute.logoURL(baseURL: baseURL)?.absoluteString, "https://cdn.example.com/vector.png")
    XCTAssertNil(empty.logoURL(baseURL: baseURL))
  }

  func testChangeWorkflowStateArgsUseBackendStateIdName() throws {
    let encoded = try VectorConvexArguments
      .changeWorkflowState(issueId: "issue-1", stateId: "state-1")
      .convexEncode()

    XCTAssertTrue(encoded.contains("\"issueId\":\"issue-1\""))
    XCTAssertTrue(encoded.contains("\"stateId\":\"state-1\""))
    XCTAssertFalse(encoded.contains("workflowStateId"))
  }

  func testUpdateAssigneesArgsEncodeUserIds() throws {
    let encoded = try VectorConvexArguments
      .updateAssignees(issueId: "issue-1", assigneeIds: ["user-1", "user-2"])
      .convexEncode()

    XCTAssertTrue(encoded.contains("\"issueId\":\"issue-1\""))
    XCTAssertTrue(encoded.contains("\"assigneeIds\":[\"user-1\",\"user-2\"]"))
  }

  func testMutationResponseDecodesObjectPayloads() throws {
    let commentPayload = #"{"commentId":"comment-1"}"#.data(using: .utf8)!
    let successPayload = #"{"success":true}"#.data(using: .utf8)!
    let nullPayload = #"null"#.data(using: .utf8)!
    let scalarPayload = #"true"#.data(using: .utf8)!

    XCTAssertNoThrow(try JSONDecoder().decode(VectorMutationResponse.self, from: commentPayload))
    XCTAssertNoThrow(try JSONDecoder().decode(VectorMutationResponse.self, from: successPayload))
    XCTAssertNoThrow(try JSONDecoder().decode(VectorMutationResponse.self, from: nullPayload))
    XCTAssertNoThrow(try JSONDecoder().decode(VectorMutationResponse.self, from: scalarPayload))
  }

  func testActivityDetailsDecodesCommentId() throws {
    let payload = """
      {
        "commentId": "comment-1",
        "commentPreview": "A useful mobile comment"
      }
      """.data(using: .utf8)!

    let details = try JSONDecoder().decode(VectorActivityDetails.self, from: payload)

    XCTAssertEqual(details.commentId, "comment-1")
    XCTAssertEqual(details.commentPreview, "A useful mobile comment")
  }

  func testUserDecodesProfileImageAliases() throws {
    let payload = """
      {
        "id": "user-1",
        "name": "Nithin",
        "email": "nithin@example.com",
        "avatarUrl": "/api/avatar/user-1"
      }
      """.data(using: .utf8)!

    let user = try JSONDecoder().decode(VectorUser.self, from: payload)

    XCTAssertEqual(user.id, "user-1")
    XCTAssertEqual(user.displayName, "Nithin")
    XCTAssertEqual(user.image, "/api/avatar/user-1")
  }

  func testMarkdownParserBuildsDocumentBlocks() {
    let blocks = VectorMarkdownParser.parse(
      """
      # Goal

      Build the **native** detail view.

      - Render Markdown
      - Keep it compact

      ```swift
      Text("Vector")
      ```
      """
    )

    XCTAssertEqual(blocks.count, 4)
    XCTAssertEqual(blocks[0], .heading(level: 1, text: "Goal"))
    XCTAssertEqual(blocks[1], .paragraph("Build the **native** detail view."))
    XCTAssertEqual(blocks[2], .unorderedList(["Render Markdown", "Keep it compact"]))
    XCTAssertEqual(blocks[3], .codeBlock("Text(\"Vector\")"))
  }

  func testMarkdownParserHidesHTMLCommentMarkers() {
    let blocks = VectorMarkdownParser.parse(
      """
      <!-- vector-github-pr-summary:start -->

      ## GitHub PR Summary

      Four pull requests are merged.

      <!-- vector-github-pr-summary:end -->
      """
    )

    XCTAssertEqual(blocks, [
      .heading(level: 2, text: "GitHub PR Summary"),
      .paragraph("Four pull requests are merged."),
    ])
  }

  func testMarkdownParserPreservesHTMLInsideCodeFences() {
    let blocks = VectorMarkdownParser.parse(
      """
      ```html
      <!-- Keep this example -->
      <section>Visible code</section>
      ```
      """
    )

    XCTAssertEqual(blocks, [
      .codeBlock("<!-- Keep this example -->\n<section>Visible code</section>"),
    ])
  }

  func testIssueRowFallsBackToCreationTimeWhenUpdatedAtIsMissing() throws {
    let payload = """
      {
        "_id": "issue-2",
        "_creationTime": 1774550000000,
        "key": "ROADMAP-2",
        "title": "Offline issue card",
        "linkedPrs": []
      }
      """.data(using: .utf8)!

    let issue = try JSONDecoder().decode(VectorIssueRow.self, from: payload)

    XCTAssertEqual(issue.updatedAt, issue.creationTime)
    XCTAssertEqual(issue.rowId, "issue-2:unassigned")
  }

  func testAssignmentDecodesNestedConvexResponse() throws {
    let payload = """
      {
        "_id": "assignment-1",
        "note": "Own the mobile detail view",
        "assignee": {
          "_id": "user-1",
          "name": "raj",
          "email": "raj@example.com",
          "image": "https://example.com/avatar.png"
        },
        "state": {
          "_id": "state-1",
          "name": "In Progress",
          "type": "in_progress",
          "position": 2,
          "color": "#f59e0b",
          "icon": "loader"
        }
      }
      """.data(using: .utf8)!

    let assignment = try JSONDecoder().decode(VectorIssueAssignment.self, from: payload)

    XCTAssertEqual(assignment.id, "assignment-1")
    XCTAssertEqual(assignment.assigneeName, "raj")
    XCTAssertEqual(assignment.assigneeEmail, "raj@example.com")
    XCTAssertEqual(assignment.stateName, "In Progress")
    XCTAssertEqual(assignment.stateType, "in_progress")
  }

  func testWorkspaceOptionsDecodeMembersAndIssueMetadata() throws {
    let payload = """
      {
        "members": [
          {
            "_id": "member-1",
            "userId": "user-1",
            "role": "admin",
            "user": {
              "_id": "user-1",
              "name": "raj",
              "email": "raj@example.com",
              "image": null
            }
          }
        ],
        "teams": [],
        "projects": [],
        "issueStates": [
          { "_id": "state-1", "name": "In Progress", "type": "in_progress", "position": 2, "color": "#f59e0b", "icon": "loader" }
        ],
        "issuePriorities": [
          { "_id": "priority-1", "name": "High", "weight": 3, "color": "#ef4444", "icon": "signal-high" }
        ],
        "projectStatuses": []
      }
      """.data(using: .utf8)!

    let options = try JSONDecoder().decode(VectorWorkspaceOptions.self, from: payload)

    XCTAssertEqual(options.members.first?.displayName, "raj")
    XCTAssertEqual(options.members.first?.userId, "user-1")
    XCTAssertEqual(options.issueStates.first?.name, "In Progress")
    XCTAssertEqual(options.issuePriorities.first?.name, "High")
  }

  @MainActor
  func testIssueMetadataResolverPrefersWorkspaceConfigById() throws {
    let issue = VectorMockData.issues[0]
    let stateId = try XCTUnwrap(issue.workflowStateId)
    let priorityId = try XCTUnwrap(issue.priorityId)
    let options = VectorWorkspaceOptions(
      members: [],
      teams: [],
      projects: [],
      issueStates: [
        VectorState(
          id: stateId,
          name: "Workspace Done",
          type: "done",
          position: 12,
          color: "#123456",
          icon: "sparkles"
        ),
      ],
      issuePriorities: [
        VectorPriority(
          id: priorityId,
          name: "Workspace Critical",
          weight: 9,
          color: "#654321",
          icon: "flame"
        ),
      ],
      projectStatuses: []
    )

    let status = VectorIssueMetadataResolver.state(for: issue, options: options)
    let priority = try XCTUnwrap(VectorIssueMetadataResolver.priority(for: issue, options: options))

    XCTAssertEqual(status.name, "Workspace Done")
    XCTAssertEqual(status.color, "#123456")
    XCTAssertEqual(status.icon, "sparkles")
    XCTAssertEqual(priority.name, "Workspace Critical")
    XCTAssertEqual(priority.color, "#654321")
    XCTAssertEqual(priority.icon, "flame")
  }

  @MainActor
  func testIssueMetadataResolverFallsBackToRowFieldsBeforeOptionsLoad() throws {
    let issue = VectorMockData.issues[0]

    let status = VectorIssueMetadataResolver.state(for: issue, options: nil)
    let priority = try XCTUnwrap(VectorIssueMetadataResolver.priority(for: issue, options: nil))

    XCTAssertEqual(status.name, issue.workflowStateName ?? "No status")
    XCTAssertEqual(status.color, issue.workflowStateColor)
    XCTAssertEqual(status.icon, issue.workflowStateIcon)
    XCTAssertEqual(priority.name, issue.priorityName ?? "")
    XCTAssertEqual(priority.color, issue.priorityColor)
    XCTAssertEqual(priority.icon, issue.priorityIcon)
  }

  @MainActor
  func testMockRepositoryReturnsCoreMobileData() throws {
    let repository = MockVectorRepository()
    var issues: [VectorIssueRow] = []
    var detailIssue: VectorIssueRow?
    var projects: [VectorProject] = []
    var teams: [VectorTeam] = []
    var documents: [VectorDocument] = []
    var inboxNotifications: [VectorInboxNotification] = []
    var workspaceOptions: VectorWorkspaceOptions?

    let issuesCancellable = repository.issuesPage(orgSlug: "imai", scope: .mine, pageSize: 10, cursor: nil)
      .sink(receiveCompletion: { _ in }, receiveValue: { issues = $0.page })
    let detailCancellable = repository.issue(orgSlug: "imai", key: "ROADMAP-5")
      .sink(receiveCompletion: { _ in }, receiveValue: { detailIssue = $0 })
    let projectsCancellable = repository.projectsPage(orgSlug: "imai", scope: .mine, pageSize: 10, cursor: nil)
      .sink(receiveCompletion: { _ in }, receiveValue: { projects = $0.page })
    let teamsCancellable = repository.teamsPage(orgSlug: "imai", scope: .mine, pageSize: 10, cursor: nil)
      .sink(receiveCompletion: { _ in }, receiveValue: { teams = $0.page })
    let docsCancellable = repository.documentsPage(orgSlug: "imai", pageSize: 10, cursor: nil)
      .sink(receiveCompletion: { _ in }, receiveValue: { documents = $0.page })
    let inboxCancellable = repository.inboxNotificationsPage(pageSize: 10, cursor: nil)
      .sink(receiveCompletion: { _ in }, receiveValue: { inboxNotifications = $0.page })
    let optionsCancellable = repository.workspaceOptions(orgSlug: "imai")
      .sink(receiveCompletion: { _ in }, receiveValue: { workspaceOptions = $0 })

    XCTAssertFalse(issues.isEmpty)
    XCTAssertEqual(detailIssue?.key, "ROADMAP-5")
    XCTAssertEqual(detailIssue?.canEdit, true)
    XCTAssertFalse(projects.isEmpty)
    XCTAssertFalse(teams.isEmpty)
    XCTAssertFalse(documents.isEmpty)
    XCTAssertFalse(inboxNotifications.isEmpty)
    XCTAssertFalse(workspaceOptions?.members.isEmpty ?? true)

    withExtendedLifetime([issuesCancellable, detailCancellable, projectsCancellable, teamsCancellable, docsCancellable, inboxCancellable, optionsCancellable]) {}
  }

  @MainActor
  func testViewModelReusesLiveQuerySubscriptionsAcrossRefreshes() {
    let repository = CountingVectorRepository()
    let viewModel = VectorMobileViewModel(configuration: .demo, repository: repository)

    XCTAssertEqual(repository.issueListCalls[.mine, default: 0], 1)
    XCTAssertEqual(repository.projectListCalls[.mine, default: 0], 1)
    XCTAssertEqual(repository.teamListCalls[.mine, default: 0], 1)
    XCTAssertEqual(repository.documentListCalls, 1)
    XCTAssertEqual(repository.inboxNotificationCalls, 1)
    XCTAssertEqual(repository.workspaceOptionsCalls, 1)
    XCTAssertEqual(repository.userStatusCalls, 1)

    viewModel.refresh()
    viewModel.loadSettings()

    XCTAssertEqual(repository.issueListCalls[.mine, default: 0], 1)
    XCTAssertEqual(repository.projectListCalls[.mine, default: 0], 1)
    XCTAssertEqual(repository.teamListCalls[.mine, default: 0], 1)
    XCTAssertEqual(repository.documentListCalls, 1)
    XCTAssertEqual(repository.inboxNotificationCalls, 1)
    XCTAssertEqual(repository.workspaceOptionsCalls, 1)
    XCTAssertEqual(repository.userStatusCalls, 1)

    viewModel.issueScope = .all
    viewModel.refresh()
    XCTAssertEqual(repository.issueListCalls[.all, default: 0], 1)

    viewModel.issueScope = .mine
    viewModel.refresh()
    XCTAssertEqual(repository.issueListCalls[.mine, default: 0], 1)

    viewModel.projectScope = .all
    viewModel.refresh()
    XCTAssertEqual(repository.projectListCalls[.all, default: 0], 1)
    XCTAssertEqual(repository.teamListCalls[.all, default: 0], 1)
  }

  @MainActor
  func testPrimaryInitialLoadDefersSecondarySubscriptions() {
    let repository = CountingVectorRepository()
    let viewModel = VectorMobileViewModel(
      configuration: .demo,
      repository: repository,
      initialLoadPolicy: .primarySurfaces
    )

    XCTAssertEqual(repository.requestListCalls[.inbox, default: 0], 1)
    XCTAssertEqual(repository.workListCalls[.active, default: 0], 1)
    XCTAssertEqual(repository.inboxNotificationCalls, 1)
    XCTAssertTrue(repository.issueListCalls.isEmpty)
    XCTAssertTrue(repository.projectListCalls.isEmpty)
    XCTAssertTrue(repository.teamListCalls.isEmpty)
    XCTAssertEqual(repository.documentListCalls, 0)
    XCTAssertEqual(repository.workspaceOptionsCalls, 1)
    XCTAssertEqual(repository.userStatusCalls, 0)

    viewModel.loadWorkspaceOptions()
    viewModel.loadSettings()

    XCTAssertEqual(repository.workspaceOptionsCalls, 1)
    XCTAssertEqual(repository.userStatusCalls, 1)

    viewModel.refresh()

    XCTAssertEqual(repository.requestListCalls[.inbox, default: 0], 2)
    XCTAssertEqual(repository.workListCalls[.active, default: 0], 2)
    XCTAssertEqual(repository.inboxNotificationCalls, 1)
    XCTAssertEqual(repository.workspaceOptionsCalls, 1)
    XCTAssertEqual(repository.issueListCalls[.mine, default: 0], 1)
    XCTAssertEqual(repository.projectListCalls[.mine, default: 0], 1)
    XCTAssertEqual(repository.teamListCalls[.mine, default: 0], 1)
    XCTAssertEqual(repository.documentListCalls, 1)
  }

  @MainActor
  func testOpeningWorkspaceLoadsDeferredWorkspaceContent() {
    let repository = CountingVectorRepository()
    let viewModel = VectorMobileViewModel(
      configuration: .demo,
      repository: repository,
      initialLoadPolicy: .primarySurfaces
    )

    viewModel.loadWorkspaceContent()

    XCTAssertEqual(repository.projectListCalls[.mine, default: 0], 1)
    XCTAssertEqual(repository.teamListCalls[.mine, default: 0], 1)
    XCTAssertEqual(repository.documentListCalls, 1)
  }

  @MainActor
  func testOpeningWorkspaceMergesFolderedDocuments() async {
    let repository = CountingVectorRepository()
    let folder = VectorDocumentFolder(
      id: "folder-1",
      name: "Handbook",
      creationTime: 1
    )
    let folderDocument = VectorDocument(
      id: "folder-document-1",
      title: "Foldered chapter",
      creationTime: 2
    )
    repository.documentsOverride = []
    repository.documentFolders = [folder]
    repository.folderDocuments[folder.id] = [folderDocument]
    let viewModel = VectorMobileViewModel(
      configuration: .demo,
      repository: repository,
      initialLoadPolicy: .primarySurfaces
    )

    viewModel.loadWorkspaceContent()
    await waitUntil {
      viewModel.documents.map(\.id) == [folderDocument.id]
    }

    XCTAssertEqual(repository.documentFolderPageCalls, 1)
    XCTAssertEqual(repository.folderDocumentPageCalls, [folder.id])
    XCTAssertFalse(viewModel.isLoadingDocuments)
  }

  @MainActor
  func testMissingRequestAndWorkDetailsStopShowingSkeletons() async {
    let repository = CountingVectorRepository()
    let viewModel = VectorMobileViewModel(configuration: .demo, repository: repository)
    let request = VectorRequestRow(
      id: "request-missing",
      key: "REQ-404",
      title: "Missing request",
      expectedOutput: "Nothing",
      status: .new,
      createdAt: 1,
      updatedAt: 1
    )
    let work = VectorWorkRow(
      id: "work-missing",
      key: "WORK-404",
      title: "Missing work",
      workStatus: .planned,
      creationTime: 1
    )

    viewModel.loadRequest(request)
    viewModel.loadWork(work)

    await waitUntil {
      viewModel.selectedRequestError != nil && viewModel.selectedWorkError != nil
    }
    XCTAssertNil(viewModel.selectedRequest)
    XCTAssertNil(viewModel.selectedWork)
  }

  @MainActor
  func testProfilePresenceIgnoresStaleSubscriptionWhileMutationIsPending() async {
    let repository = CountingVectorRepository()
    let viewModel = VectorMobileViewModel(configuration: .demo, repository: repository)
    let initialStatus = VectorUserStatus(presence: .online, customText: "Focused", customEmoji: "V")
    let confirmedStatus = VectorUserStatus(presence: .dnd, customText: "Focused", customEmoji: "V")
    var presenceContinuation: CheckedContinuation<Void, Error>?

    repository.userStatusSubject.send(initialStatus)
    await waitUntil {
      viewModel.userStatus?.presence == .online
    }

    repository.setPresenceAction = { _ in
      try await withCheckedThrowingContinuation { continuation in
        presenceContinuation = continuation
      }
    }

    viewModel.setPresence(.dnd)
    XCTAssertEqual(viewModel.userStatus?.presence, .dnd)
    XCTAssertEqual(viewModel.pendingPresence, .dnd)

    repository.userStatusSubject.send(initialStatus)
    await waitUntil {
      viewModel.userStatus?.presence == .dnd
    }

    presenceContinuation?.resume()
    repository.userStatusSubject.send(confirmedStatus)
    await waitUntil {
      viewModel.userStatus?.presence == .dnd && viewModel.pendingPresence == nil && !viewModel.isUpdatingUserStatus
    }
    XCTAssertEqual(repository.setPresenceCalls, [.dnd])
  }

  @MainActor
  func testViewModelLoadsAdditionalIssuePages() async throws {
    let repository = PagingVectorRepository()
    let viewModel = VectorMobileViewModel(configuration: .demo, repository: repository)
    await waitUntil {
      viewModel.issues.map(\.id) == [VectorMockData.issues[0].id]
    }

    XCTAssertEqual(viewModel.issues.map(\.id), [VectorMockData.issues[0].id])
    XCTAssertTrue(viewModel.canLoadMoreIssues)

    viewModel.loadMoreIssues()
    await waitUntil {
      viewModel.issues.map(\.id) == [VectorMockData.issues[0].id, VectorMockData.issues[1].id]
    }

    XCTAssertEqual(viewModel.issues.map(\.id), [VectorMockData.issues[0].id, VectorMockData.issues[1].id])
    XCTAssertFalse(viewModel.canLoadMoreIssues)
    XCTAssertEqual(repository.issuePageCursors, [nil, "next"])
  }

  @MainActor
  func testViewModelLoadsAdditionalWorkspaceAndInboxPages() async throws {
    let repository = PagingVectorRepository()
    let viewModel = VectorMobileViewModel(configuration: .demo, repository: repository)

    await waitUntil {
      viewModel.projects.map(\.id) == [VectorMockData.projects[0].id]
        && viewModel.teams.map(\.id) == [VectorMockData.teams[0].id]
        && viewModel.documents.map(\.id) == [VectorMockData.documents[0].id]
        && viewModel.inboxNotifications.map(\.id) == [VectorMockData.inboxNotifications[0].id]
    }

    XCTAssertTrue(viewModel.canLoadMoreProjects)
    XCTAssertTrue(viewModel.canLoadMoreTeams)
    XCTAssertTrue(viewModel.canLoadMoreDocuments)
    XCTAssertTrue(viewModel.canLoadMoreInboxNotifications)

    viewModel.loadMoreProjects()
    viewModel.loadMoreTeams()
    viewModel.loadMoreDocuments()
    viewModel.loadMoreInboxNotifications()

    await waitUntil {
      viewModel.projects.map(\.id) == [VectorMockData.projects[0].id, VectorMockData.projects[1].id]
        && viewModel.teams.map(\.id) == [VectorMockData.teams[0].id, VectorMockData.teams[1].id]
        && viewModel.documents.map(\.id) == VectorMockData.documents.map(\.id)
        && viewModel.inboxNotifications.map(\.id) == VectorMockData.inboxNotifications.map(\.id)
    }

    XCTAssertFalse(viewModel.canLoadMoreProjects)
    XCTAssertFalse(viewModel.canLoadMoreTeams)
    XCTAssertFalse(viewModel.canLoadMoreDocuments)
    XCTAssertFalse(viewModel.canLoadMoreInboxNotifications)
    XCTAssertEqual(repository.projectPageCursors, [nil, "next"])
    XCTAssertEqual(repository.teamPageCursors, [nil, "next"])
    XCTAssertEqual(repository.documentPageCursors, [nil, "next"])
    XCTAssertEqual(repository.inboxNotificationCursors, [nil, "next"])
  }

  @MainActor
  func testConfigurePushPreferencesWritesEnabledAndDisabledChoicesBeforePreferencesLoad() async throws {
    let repository = CountingVectorRepository()
    let viewModel = VectorMobileViewModel(configuration: .demo, repository: repository)

    viewModel.configurePushPreferences(
      enabledCategories: [.assignments],
      disabledCategories: [.invites, .teamStatusChanges]
    )

    XCTAssertEqual(viewModel.notificationPreferences.count, 3)
    XCTAssertEqual(viewModel.notificationPreferences.first { $0.category == .invites }?.inAppEnabled, true)
    XCTAssertEqual(viewModel.notificationPreferences.first { $0.category == .invites }?.emailEnabled, true)
    XCTAssertEqual(viewModel.notificationPreferences.first { $0.category == .invites }?.pushEnabled, false)
    XCTAssertEqual(viewModel.notificationPreferences.first { $0.category == .assignments }?.pushEnabled, true)
    XCTAssertEqual(viewModel.notificationPreferences.first { $0.category == .teamStatusChanges }?.pushEnabled, false)

    await waitUntil {
      repository.updatedNotificationPreferences.count == 3
    }
    XCTAssertEqual(
      Set(repository.updatedNotificationPreferences.map(\.category)),
      Set([.invites, .assignments, .teamStatusChanges])
    )
  }

  @MainActor
  func testCreateIssueReturnsCreatedIssueWhenPostCreateTeamChangeFails() async throws {
    let repository = CountingVectorRepository()
    repository.changeTeamError = VectorMobileError.validation("Not allowed")
    let viewModel = VectorMobileViewModel(configuration: .demo, repository: repository)

    let result = try await viewModel.createIssue(
      title: "Created from iOS",
      description: nil,
      project: nil,
      team: VectorMockData.teams[0],
      state: nil,
      priority: nil,
      assigneeIds: []
    )

    XCTAssertEqual(result.issueId, "issue-created")
    XCTAssertEqual(repository.createdIssueTitles, ["Created from iOS"])
    XCTAssertEqual(repository.changeTeamCalls.count, 1)
    XCTAssertEqual(viewModel.settingsErrorMessage, "Issue TEST-1 was created, but the team could not be changed.")
  }

  @MainActor
  func testRequestCreationExposesProgressAndFailure() async {
    let repository = CountingVectorRepository()
    let viewModel = VectorMobileViewModel(configuration: .demo, repository: repository)
    var continuation: CheckedContinuation<Void, Error>?
    repository.createRequestAction = {
      try await withCheckedThrowingContinuation { continuation = $0 }
    }

    let createTask = Task {
      await viewModel.createRequest(
        title: "Mobile QA request",
        description: nil,
        expectedOutput: "Visible completion",
        reviewGuidance: nil
      )
    }
    await waitUntil { viewModel.pendingWorkModelActions.contains("create-request") }
    XCTAssertNil(viewModel.workModelActionError)

    continuation?.resume(throwing: VectorMobileError.validation("Request creation failed"))
    let created = await createTask.value
    XCTAssertFalse(created)
    XCTAssertFalse(viewModel.pendingWorkModelActions.contains("create-request"))
    XCTAssertEqual(viewModel.workModelActionError, "Request creation failed")

    viewModel.clearWorkModelActionError()
    XCTAssertNil(viewModel.workModelActionError)
  }

  @MainActor
  func testRequestCreationTimesOutAndClearsProgressWhenMutationStalls() async {
    let repository = CountingVectorRepository()
    var stalledMutation: CheckedContinuation<Void, Error>?
    repository.createRequestAction = {
      try await withCheckedThrowingContinuation { stalledMutation = $0 }
    }
    let viewModel = VectorMobileViewModel(
      configuration: .demo,
      repository: repository,
      requestCreationTimeout: .milliseconds(100)
    )

    let created = await viewModel.createRequest(
      title: "Request that loses its response",
      description: nil,
      expectedOutput: "A confirmed result",
      reviewGuidance: nil
    )

    XCTAssertFalse(created)
    XCTAssertFalse(viewModel.pendingWorkModelActions.contains("create-request"))
    XCTAssertEqual(
      viewModel.workModelActionError,
      "Vector could not confirm the request yet. Try Create again; it will not create a duplicate."
    )
    XCTAssertEqual(repository.requestListCalls[.inbox, default: 0], 2)

    // A late SDK response cannot put the UI back into its completed attempt.
    stalledMutation?.resume(returning: ())
    await waitUntil { repository.createRequestCompletedCalls == 1 }
    XCTAssertFalse(viewModel.pendingWorkModelActions.contains("create-request"))
  }

  @MainActor
  func testRequestCreationCancellationClearsProgressWithoutShowingAnError() async {
    let repository = CountingVectorRepository()
    repository.createRequestAction = {
      try await Task.sleep(nanoseconds: 60_000_000_000)
    }
    let viewModel = VectorMobileViewModel(
      configuration: .demo,
      repository: repository,
      requestCreationTimeout: .seconds(60)
    )

    let createTask = Task {
      await viewModel.createRequest(
        title: "Canceled request",
        description: nil,
        expectedOutput: "Nothing after cancellation",
        reviewGuidance: nil
      )
    }
    await waitUntil { viewModel.pendingWorkModelActions.contains("create-request") }

    createTask.cancel()
    let created = await createTask.value

    XCTAssertFalse(created)
    XCTAssertFalse(viewModel.pendingWorkModelActions.contains("create-request"))
    XCTAssertNil(viewModel.workModelActionError)
    XCTAssertEqual(repository.requestListCalls[.inbox, default: 0], 2)
  }

  @MainActor
  func testSuccessfulRequestCreationRefreshesRequestsAndClearsProgress() async {
    let repository = CountingVectorRepository()
    let viewModel = VectorMobileViewModel(configuration: .demo, repository: repository)

    let created = await viewModel.createRequest(
      title: "A fresh request",
      description: nil,
      expectedOutput: "A visible request",
      reviewGuidance: nil,
      priorityId: "priority-high"
    )

    XCTAssertTrue(created)
    XCTAssertFalse(viewModel.pendingWorkModelActions.contains("create-request"))
    XCTAssertNil(viewModel.workModelActionError)
    XCTAssertEqual(repository.requestListCalls[.inbox, default: 0], 2)
    XCTAssertEqual(repository.createRequestPriorityIds, ["priority-high"])
  }

  @MainActor
  func testChunkedDocumentContentLoadsEveryPageInOrder() async {
    let repository = CountingVectorRepository()
    let document = VectorDocument(
      id: "document-large",
      title: "Large handbook",
      contentVersion: "version-1",
      creationTime: 1
    )
    repository.documentDetailOverride = document
    repository.documentChunkPages["__root"] = VectorPaginatedPage(
      page: [
        VectorDocumentContentChunk(id: "chunk-0", documentId: document.id, version: "version-1", chunkIndex: 0, content: "First "),
        VectorDocumentContentChunk(id: "chunk-1", documentId: document.id, version: "version-1", chunkIndex: 1, content: "second "),
      ],
      continueCursor: "next",
      isDone: false
    )
    repository.documentChunkPages["next"] = VectorPaginatedPage(
      page: [
        VectorDocumentContentChunk(id: "chunk-2", documentId: document.id, version: "version-1", chunkIndex: 2, content: "third")
      ],
      isDone: true
    )
    let viewModel = VectorMobileViewModel(configuration: .demo, repository: repository)

    viewModel.loadDocument(document)

    await waitUntil { viewModel.selectedDocument?.content == "First second third" }
    XCTAssertEqual(viewModel.selectedDocument?.content, "First second third")
    XCTAssertEqual(viewModel.selectedDocument?.contentVersion, "version-1")
    XCTAssertEqual(repository.documentContentPageCursors, [nil, "next"])
    XCTAssertFalse(viewModel.isLoadingDocumentContent)
    XCTAssertNil(viewModel.documentContentError)
  }

  @MainActor
  func testRequestCreationSucceedsWhenReactiveConfirmationArrivesBeforeMutationResponse() async {
    let repository = CountingVectorRepository()
    var stalledMutation: CheckedContinuation<Void, Error>?
    repository.createRequestAction = {
      try await withCheckedThrowingContinuation { stalledMutation = $0 }
    }
    let viewModel = VectorMobileViewModel(
      configuration: .demo,
      repository: repository,
      requestCreationTimeout: .seconds(2)
    )

    let createTask = Task {
      await viewModel.createRequest(
        title: "Confirmed from the query",
        description: nil,
        expectedOutput: "A closed creation sheet",
        reviewGuidance: nil
      )
    }
    await waitUntil { viewModel.pendingWorkModelActions.contains("create-request") }
    repository.requestCreationSubject.send(
      VectorCreateRequestResult(requestId: "confirmed-request", requestKey: "REQ-21")
    )

    let created = await createTask.value
    XCTAssertTrue(created)
    XCTAssertFalse(viewModel.pendingWorkModelActions.contains("create-request"))
    stalledMutation?.resume(returning: ())
  }

  @MainActor
  func testRequestCreationRetryReusesIdempotencyKeyAfterTimeout() async {
    let repository = CountingVectorRepository()
    var firstMutation: CheckedContinuation<Void, Error>?
    repository.createRequestAction = {
      if firstMutation == nil {
        try await withCheckedThrowingContinuation { firstMutation = $0 }
      }
    }
    let viewModel = VectorMobileViewModel(
      configuration: .demo,
      repository: repository,
      requestCreationTimeout: .milliseconds(50)
    )

    let firstResult = await viewModel.createRequest(
      title: "Safe retry",
      description: nil,
      expectedOutput: "Exactly one request",
      reviewGuidance: nil
    )
    let interveningResult = await viewModel.createRequest(
      title: "A different request",
      description: nil,
      expectedOutput: "A separate result",
      reviewGuidance: nil
    )
    let retryResult = await viewModel.createRequest(
      title: "Safe retry",
      description: nil,
      expectedOutput: "Exactly one request",
      reviewGuidance: nil
    )

    XCTAssertFalse(firstResult)
    XCTAssertTrue(interveningResult)
    XCTAssertTrue(retryResult)
    XCTAssertEqual(repository.createRequestClientIds.count, 3)
    XCTAssertNotEqual(repository.createRequestClientIds[0], repository.createRequestClientIds[1])
    XCTAssertEqual(repository.createRequestClientIds[0], repository.createRequestClientIds[2])
    firstMutation?.resume(returning: ())
  }

  @MainActor
  func testAgentMessageTimeoutClearsGlobalSendingGuard() async {
    let repository = CountingVectorRepository()
    var stalledSend: CheckedContinuation<Void, Error>?
    repository.sendAgentSessionAction = {
      try await withCheckedThrowingContinuation { stalledSend = $0 }
    }
    let viewModel = VectorMobileViewModel(
      configuration: .demo,
      repository: repository,
      mutationTimeout: .milliseconds(50)
    )

    let sent = await viewModel.sendAgentSessionMessage(
      liveActivityId: "activity-1",
      body: "Continue with the release"
    )

    XCTAssertFalse(sent)
    XCTAssertNil(viewModel.sendingAgentSessionId)
    XCTAssertEqual(
      viewModel.agentSessionSendError,
      "Vector could not confirm this change. Check the item before trying again."
    )
    stalledSend?.resume(returning: ())
  }

  @MainActor
  private func waitUntil(
    timeout: TimeInterval = 1,
    file: StaticString = #filePath,
    line: UInt = #line,
    _ condition: @MainActor @escaping () -> Bool
  ) async {
    let deadline = Date().addingTimeInterval(timeout)
    while !condition(), Date() < deadline {
      try? await Task.sleep(nanoseconds: 1_000_000)
    }
    XCTAssertTrue(condition(), file: file, line: line)
  }
}

private struct FailingAuthTransport: VectorAuthTransport {
  func data(for request: URLRequest) async throws -> (Data, URLResponse) {
    throw URLError(.notConnectedToInternet)
  }
}

private struct FreshSessionAuthTransport: VectorAuthTransport {
  func data(for request: URLRequest) async throws -> (Data, URLResponse) {
    let isFresh = request.value(forHTTPHeaderField: "Cookie")?.contains("session=fresh") == true
    let statusCode = isFresh ? 200 : 401
    let data = isFresh
      ? Data(#"{"token":"convex-token"}"#.utf8)
      : Data(#"{"message":"Unauthorized"}"#.utf8)
    let response = HTTPURLResponse(
      url: request.url!,
      statusCode: statusCode,
      httpVersion: nil,
      headerFields: nil
    )!
    return (data, response)
  }
}

private final class InMemorySessionStore: VectorSessionStore, @unchecked Sendable {
  var session: VectorStoredSession?

  init(session: VectorStoredSession?) {
    self.session = session
  }

  func load() throws -> VectorStoredSession? {
    session
  }

  func save(_ session: VectorStoredSession) throws {
    self.session = session
  }

  func clear() throws {
    session = nil
  }
}

private final class FailingSaveSessionStore: VectorSessionStore, @unchecked Sendable {
  private let session: VectorStoredSession

  init(session: VectorStoredSession) {
    self.session = session
  }

  func load() throws -> VectorStoredSession? {
    session
  }

  func save(_ session: VectorStoredSession) throws {
    throw VectorAuthError.requestFailed("Unable to save Vector session.")
  }

  func clear() throws {}
}

@MainActor
private final class CountingVectorRepository: VectorMobileRepository {
  var requestListCalls: [VectorRequestScope: Int] = [:]
  var workListCalls: [VectorWorkScope: Int] = [:]
  var issueListCalls: [VectorIssueScope: Int] = [:]
  var projectListCalls: [VectorProjectScope: Int] = [:]
  var teamListCalls: [VectorProjectScope: Int] = [:]
  var documentListCalls = 0
  var documentFolderPageCalls = 0
  var folderDocumentPageCalls: [VectorID] = []
  var documentsOverride: [VectorDocument]?
  var documentFolders: [VectorDocumentFolder] = []
  var folderDocuments: [VectorID: [VectorDocument]] = [:]
  var inboxNotificationCalls = 0
  var workspaceOptionsCalls = 0
  var userStatusCalls = 0
  var updatedNotificationPreferences: [VectorNotificationPreference] = []
  var createdIssueTitles: [String] = []
  var changeTeamCalls: [(issueId: VectorID, teamId: VectorID?)] = []
  var changeTeamError: Error?
  let userStatusSubject = CurrentValueSubject<VectorUserStatus?, Error>(nil)
  var setPresenceCalls: [VectorPresenceStatus] = []
  var setPresenceAction: ((VectorPresenceStatus) async throws -> Void)?
  var createRequestAction: (() async throws -> Void)?
  var createRequestCompletedCalls = 0
  var createRequestClientIds: [String] = []
  var createRequestPriorityIds: [VectorID?] = []
  let requestCreationSubject = CurrentValueSubject<VectorCreateRequestResult?, Error>(nil)
  var sendAgentSessionAction: (() async throws -> Void)?
  var documentDetailOverride: VectorDocument?
  var documentChunkPages: [String: VectorPaginatedPage<VectorDocumentContentChunk>] = [:]
  var documentContentPageCursors: [String?] = []

  func requestsPage(orgSlug: String, scope: VectorRequestScope, pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorRequestRow>, Error> {
    requestListCalls[scope, default: 0] += 1
    return publisher(VectorPaginatedPage(page: [], isDone: true))
  }

  func requestCreation(orgSlug: String, clientRequestId: String) -> AnyPublisher<VectorCreateRequestResult?, Error> {
    requestCreationSubject.eraseToAnyPublisher()
  }

  func workPage(orgSlug: String, scope: VectorWorkScope, pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorWorkRow>, Error> {
    workListCalls[scope, default: 0] += 1
    return publisher(VectorPaginatedPage(page: [], isDone: true))
  }

  func issuesPage(orgSlug: String, scope: VectorIssueScope, pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorIssueRow>, Error> {
    issueListCalls[scope, default: 0] += 1
    return publisher(VectorPaginatedPage(page: VectorMockData.issues, isDone: true))
  }

  func issue(orgSlug: String, key: String) -> AnyPublisher<VectorIssueRow?, Error> {
    publisher(VectorMockData.issues.first { $0.key == key })
  }

  func projectsPage(orgSlug: String, scope: VectorProjectScope, pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorProject>, Error> {
    projectListCalls[scope, default: 0] += 1
    return publisher(VectorPaginatedPage(page: VectorMockData.projects, isDone: true))
  }

  func teamsPage(orgSlug: String, scope: VectorProjectScope, pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorTeam>, Error> {
    teamListCalls[scope, default: 0] += 1
    return publisher(VectorPaginatedPage(page: VectorMockData.teams, isDone: true))
  }

  func documentsPage(orgSlug: String, pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorDocument>, Error> {
    documentListCalls += 1
    return publisher(VectorPaginatedPage(page: documentsOverride ?? VectorMockData.documents, isDone: true))
  }

  func documentFoldersPage(orgSlug: String, pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorDocumentFolder>, Error> {
    documentFolderPageCalls += 1
    return publisher(VectorPaginatedPage(page: documentFolders, isDone: true))
  }

  func folderDocumentsPage(orgSlug: String, folderId: VectorID, pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorDocument>, Error> {
    folderDocumentPageCalls.append(folderId)
    return publisher(VectorPaginatedPage(page: folderDocuments[folderId] ?? [], isDone: true))
  }

  func document(documentId: VectorID) -> AnyPublisher<VectorDocument?, Error> {
    publisher(documentDetailOverride ?? VectorMockData.documents.first { $0.id == documentId })
  }

  func documentContentPage(documentId: VectorID, version: String, pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorDocumentContentChunk>, Error> {
    documentContentPageCursors.append(cursor)
    return publisher(documentChunkPages[cursor ?? "__root"] ?? VectorPaginatedPage(page: [], isDone: true))
  }

  func workspaceOptions(orgSlug: String) -> AnyPublisher<VectorWorkspaceOptions, Error> {
    workspaceOptionsCalls += 1
    return publisher(VectorMockData.workspaceOptions)
  }

  func comments(issueId: VectorID) -> AnyPublisher<[VectorComment], Error> {
    publisher([])
  }

  func assignments(issueId: VectorID) -> AnyPublisher<[VectorIssueAssignment], Error> {
    publisher([])
  }

  func issueActivity(issueId: VectorID) -> AnyPublisher<[VectorActivityItem], Error> {
    publisher([])
  }

  func inboxActivityPage(orgSlug: String, pageSize: Int, cursor: String?) -> AnyPublisher<VectorOrgActivityPage, Error> {
    publisher(VectorOrgActivityPage(items: []))
  }

  func inboxNotificationsPage(pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorInboxNotification>, Error> {
    inboxNotificationCalls += 1
    return publisher(VectorPaginatedPage(page: VectorMockData.inboxNotifications, isDone: true))
  }

  func userStatus() -> AnyPublisher<VectorUserStatus?, Error> {
    userStatusCalls += 1
    return userStatusSubject.eraseToAnyPublisher()
  }

  func notificationPreferences() -> AnyPublisher<[VectorNotificationPreference], Error> {
    publisher([])
  }

  func mobilePushTokens() -> AnyPublisher<[VectorMobilePushTokenRegistration], Error> {
    publisher([])
  }

  func setPresence(_ presence: VectorPresenceStatus) async throws {
    setPresenceCalls.append(presence)
    if let setPresenceAction {
      try await setPresenceAction(presence)
    }
  }

  func setCustomStatus(text: String?, emoji: String?, clearsAt: Double?) async throws {}

  func clearCustomStatus() async throws {}

  func updateNotificationPreference(_ preference: VectorNotificationPreference) async throws {
    updatedNotificationPreferences.append(preference)
  }

  func upsertMobilePushToken(_ token: VectorPushDeviceToken, bundleId: String?, deviceLabel: String?) async throws {}

  func removeMobilePushToken(_ token: VectorPushDeviceToken) async throws {}

  func sendAgentSessionMessage(liveActivityId: VectorID, body: String) async throws -> VectorID {
    if let sendAgentSessionAction { try await sendAgentSessionAction() }
    return "message-created"
  }

  func createRequest(orgSlug: String, title: String, description: String?, expectedOutput: String, reviewGuidance: String?, priorityId: VectorID?, clientRequestId: String) async throws -> VectorCreateRequestResult {
    createRequestClientIds.append(clientRequestId)
    createRequestPriorityIds.append(priorityId)
    if let createRequestAction { try await createRequestAction() }
    createRequestCompletedCalls += 1
    return VectorCreateRequestResult(requestId: "request-created", requestKey: "REQ-20")
  }

  func updateTitle(issueId: VectorID, title: String) async throws {}

  func updateDescription(issueId: VectorID, description: String?) async throws {}

  func updateDocument(documentId: VectorID, title: String, content: String?) async throws {}

  func changeWorkflowState(issueId: VectorID, stateId: VectorID) async throws {}

  func changePriority(issueId: VectorID, priorityId: VectorID) async throws {}

  func updateAssignees(issueId: VectorID, assigneeIds: [VectorID]) async throws {}

  func changeProject(issueId: VectorID, projectId: VectorID?) async throws {}

  func changeTeam(issueId: VectorID, teamId: VectorID?) async throws {
    changeTeamCalls.append((issueId: issueId, teamId: teamId))
    if let changeTeamError {
      throw changeTeamError
    }
  }

  func changeVisibility(issueId: VectorID, visibility: String) async throws {}

  func addComment(issueId: VectorID, body: String, parentId: VectorID?) async throws -> VectorID {
    "test-comment"
  }

  func createIssue(
    orgSlug: String,
    title: String,
    description: String?,
    projectId: VectorID?,
    teamId: VectorID?,
    stateId: VectorID?,
    priorityId: VectorID?,
    assigneeIds: [VectorID]
  ) async throws -> VectorCreateIssueResult {
    createdIssueTitles.append(title)
    return VectorCreateIssueResult(issueId: "issue-created", key: "TEST-1")
  }

  private func publisher<Value>(_ value: Value) -> AnyPublisher<Value, Error> {
    Just(value)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }
}

@MainActor
private final class PagingVectorRepository: VectorMobileRepository {
  var issuePageCursors: [String?] = []
  var projectPageCursors: [String?] = []
  var teamPageCursors: [String?] = []
  var documentPageCursors: [String?] = []
  var inboxNotificationCursors: [String?] = []
  var inboxActivityCursors: [String?] = []

  func issuesPage(orgSlug: String, scope: VectorIssueScope, pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorIssueRow>, Error> {
    issuePageCursors.append(cursor)
    if cursor == nil {
      return publisher(VectorPaginatedPage(page: [VectorMockData.issues[0]], continueCursor: "next", isDone: false))
    }
    return publisher(VectorPaginatedPage(page: [VectorMockData.issues[0], VectorMockData.issues[1]], isDone: true))
  }

  func issue(orgSlug: String, key: String) -> AnyPublisher<VectorIssueRow?, Error> {
    publisher(VectorMockData.issues.first { $0.key == key })
  }

  func projectsPage(orgSlug: String, scope: VectorProjectScope, pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorProject>, Error> {
    projectPageCursors.append(cursor)
    if cursor == nil {
      return publisher(VectorPaginatedPage(page: [VectorMockData.projects[0]], continueCursor: "next", isDone: false))
    }
    return publisher(VectorPaginatedPage(page: [VectorMockData.projects[0], VectorMockData.projects[1]], isDone: true))
  }

  func teamsPage(orgSlug: String, scope: VectorProjectScope, pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorTeam>, Error> {
    teamPageCursors.append(cursor)
    if cursor == nil {
      return publisher(VectorPaginatedPage(page: [VectorMockData.teams[0]], continueCursor: "next", isDone: false))
    }
    return publisher(VectorPaginatedPage(page: [VectorMockData.teams[0], VectorMockData.teams[1]], isDone: true))
  }

  func documentsPage(orgSlug: String, pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorDocument>, Error> {
    documentPageCursors.append(cursor)
    if cursor == nil {
      return publisher(VectorPaginatedPage(page: [VectorMockData.documents[0]], continueCursor: "next", isDone: false))
    }
    return publisher(VectorPaginatedPage(page: VectorMockData.documents, isDone: true))
  }

  func document(documentId: VectorID) -> AnyPublisher<VectorDocument?, Error> {
    publisher(VectorMockData.documents.first { $0.id == documentId })
  }

  func workspaceOptions(orgSlug: String) -> AnyPublisher<VectorWorkspaceOptions, Error> {
    publisher(VectorMockData.workspaceOptions)
  }

  func comments(issueId: VectorID) -> AnyPublisher<[VectorComment], Error> {
    publisher([])
  }

  func assignments(issueId: VectorID) -> AnyPublisher<[VectorIssueAssignment], Error> {
    publisher([])
  }

  func issueActivity(issueId: VectorID) -> AnyPublisher<[VectorActivityItem], Error> {
    publisher([])
  }

  func inboxActivityPage(orgSlug: String, pageSize: Int, cursor: String?) -> AnyPublisher<VectorOrgActivityPage, Error> {
    inboxActivityCursors.append(cursor)
    if cursor == nil {
      return publisher(VectorOrgActivityPage(items: [VectorMockData.activityItems[0]], nextCursor: "next"))
    }
    return publisher(VectorOrgActivityPage(items: [VectorMockData.activityItems[0], VectorMockData.activityItems[1]]))
  }

  func inboxNotificationsPage(pageSize: Int, cursor: String?) -> AnyPublisher<VectorPaginatedPage<VectorInboxNotification>, Error> {
    inboxNotificationCursors.append(cursor)
    if cursor == nil {
      return publisher(VectorPaginatedPage(page: [VectorMockData.inboxNotifications[0]], continueCursor: "next", isDone: false))
    }
    return publisher(VectorPaginatedPage(page: VectorMockData.inboxNotifications, isDone: true))
  }

  func userStatus() -> AnyPublisher<VectorUserStatus?, Error> {
    publisher(nil)
  }

  func notificationPreferences() -> AnyPublisher<[VectorNotificationPreference], Error> {
    publisher([])
  }

  func mobilePushTokens() -> AnyPublisher<[VectorMobilePushTokenRegistration], Error> {
    publisher([])
  }

  func setPresence(_ presence: VectorPresenceStatus) async throws {}

  func setCustomStatus(text: String?, emoji: String?, clearsAt: Double?) async throws {}

  func clearCustomStatus() async throws {}

  func updateNotificationPreference(_ preference: VectorNotificationPreference) async throws {}

  func upsertMobilePushToken(_ token: VectorPushDeviceToken, bundleId: String?, deviceLabel: String?) async throws {}

  func removeMobilePushToken(_ token: VectorPushDeviceToken) async throws {}

  func updateTitle(issueId: VectorID, title: String) async throws {}

  func updateDescription(issueId: VectorID, description: String?) async throws {}

  func updateDocument(documentId: VectorID, title: String, content: String?) async throws {}

  func changeWorkflowState(issueId: VectorID, stateId: VectorID) async throws {}

  func changePriority(issueId: VectorID, priorityId: VectorID) async throws {}

  func updateAssignees(issueId: VectorID, assigneeIds: [VectorID]) async throws {}

  func changeProject(issueId: VectorID, projectId: VectorID?) async throws {}

  func changeTeam(issueId: VectorID, teamId: VectorID?) async throws {}

  func changeVisibility(issueId: VectorID, visibility: String) async throws {}

  func addComment(issueId: VectorID, body: String, parentId: VectorID?) async throws -> VectorID {
    "test-comment"
  }

  func createIssue(
    orgSlug: String,
    title: String,
    description: String?,
    projectId: VectorID?,
    teamId: VectorID?,
    stateId: VectorID?,
    priorityId: VectorID?,
    assigneeIds: [VectorID]
  ) async throws -> VectorCreateIssueResult {
    VectorCreateIssueResult(issueId: "issue-created", key: "TEST-1")
  }

  private func publisher<Value>(_ value: Value) -> AnyPublisher<Value, Error> {
    Just(value)
      .setFailureType(to: Error.self)
      .eraseToAnyPublisher()
  }
}
