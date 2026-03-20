import AppKit
import Foundation
import SwiftUI

struct BridgeConfig: Decodable {
  let deviceId: String
  let displayName: String
  let userId: String
}

struct WorkSessionSummary: Decodable, Identifiable {
  let _id: String
  let issueKey: String?
  let issueTitle: String?
  let title: String?
  let status: String
  let latestSummary: String?
  let workspacePath: String?
  let cwd: String?
  let repoRoot: String?
  let branch: String?
  let tmuxPaneId: String?
  let agentProvider: String?

  var id: String { _id }

  var providerLabel: String {
    switch agentProvider {
    case "codex":
      return "Codex"
    case "claude_code":
      return "Claude"
    default:
      return "Shell"
    }
  }

  var workspaceLabel: String {
    let source = repoRoot ?? cwd ?? workspacePath ?? issueTitle ?? "Work session"
    if source.contains("/") {
      return URL(fileURLWithPath: source).lastPathComponent
    }
    return source
  }

  var primaryLabel: String {
    let trimmed = title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !trimmed.isEmpty {
      return trimmed
    }
    if let issueTitle, !issueTitle.isEmpty {
      return issueTitle
    }
    return workspaceLabel
  }

  var issueLabel: String? {
    guard let issueKey, !issueKey.isEmpty else {
      return issueTitle
    }

    if let issueTitle, !issueTitle.isEmpty {
      return "\(issueKey) · \(issueTitle)"
    }

    return issueKey
  }

  var repoPathLabel: String? {
    repoRoot ?? cwd ?? workspacePath
  }
}

struct SessionInfo: Decodable {
  let orgSlug: String
  let appUrl: String?
  let appDomain: String?
  let email: String?
  let userId: String?
}

struct ProfileSummary: Decodable, Identifiable {
  let name: String
  let isDefault: Bool
  let hasSession: Bool

  var id: String { name }
}

struct DeviceWorkspaceSummary: Decodable, Identifiable {
  let _id: String
  let label: String
  let path: String
  let repoName: String?
  let defaultBranch: String?
  let isDefault: Bool
  let launchPolicy: String

  var id: String { _id }

  var displayLabel: String {
    let trimmed = label.trimmingCharacters(in: .whitespacesAndNewlines)
    if !trimmed.isEmpty {
      return trimmed
    }
    return workspaceName
  }

  var workspaceName: String {
    if let repoName, !repoName.isEmpty {
      return repoName
    }
    return URL(fileURLWithPath: path).lastPathComponent
  }

  var policyLabel: String {
    switch launchPolicy {
    case "allow_delegated":
      return "Delegated"
    case "manual_only":
      return "Manual"
    default:
      return launchPolicy.replacingOccurrences(of: "_", with: " ")
    }
  }
}

struct AttachableProcess: Decodable, Identifiable {
  let _id: String
  let provider: String
  let providerLabel: String?
  let cwd: String?
  let repoRoot: String?
  let branch: String?
  let title: String?
  let mode: String
  let status: String

  var id: String { _id }

  var resolvedProviderLabel: String {
    if let providerLabel, !providerLabel.isEmpty {
      return providerLabel
    }
    switch provider {
    case "codex":
      return "Codex"
    case "claude_code":
      return "Claude"
    default:
      return provider
    }
  }

  var workspaceLabel: String {
    let source = repoRoot ?? cwd ?? title ?? "Unknown workspace"
    if source.contains("/") {
      return URL(fileURLWithPath: source).lastPathComponent
    }
    return source
  }

  var primaryLabel: String {
    let candidate = title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !candidate.isEmpty {
      return candidate
    }
    return workspaceLabel
  }

  var attachTitle: String? {
    title ?? cwd ?? repoRoot
  }

  var repoPathLabel: String? {
    repoRoot ?? cwd
  }
}

struct IssueSearchResult: Decodable, Identifiable {
  let _id: String
  let key: String
  let title: String
  let stateColor: String?

  var id: String { _id }
}

struct MenuStateSnapshot: Decodable {
  let configured: Bool
  let running: Bool
  let starting: Bool
  let pid: Int32?
  let config: BridgeConfig?
  let sessionInfo: SessionInfo
  let activeProfile: String
  let defaultProfile: String
  let profiles: [ProfileSummary]
  let workspaces: [DeviceWorkspaceSummary]
  let workSessions: [WorkSessionSummary]
  let detectedSessions: [AttachableProcess]

  static let empty = MenuStateSnapshot(
    configured: false,
    running: false,
    starting: false,
    pid: nil,
    config: nil,
    sessionInfo: SessionInfo(
      orgSlug: "oss-lab",
      appUrl: nil,
      appDomain: nil,
      email: nil,
      userId: nil
    ),
    activeProfile: "default",
    defaultProfile: "default",
    profiles: [],
    workspaces: [],
    workSessions: [],
    detectedSessions: []
  )
}

enum BridgeTransition {
  case stopping
  case starting
  case restarting

  var label: String {
    switch self {
    case .stopping:
      return "Stopping..."
    case .starting:
      return "Starting..."
    case .restarting:
      return "Restarting..."
    }
  }
}

final class MenuBarController: NSObject, NSApplicationDelegate, ObservableObject {
  private let configDir: URL
  private let cliCommand: String
  private let cliArgs: [String]
  private let logURL: URL
  private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
  private let popover = NSPopover()
  private var refreshTimer: Timer?
  private var blinkTimer: Timer?
  private var transitionDeadline = Date.distantPast
  private var blinkVisible = true
  private var isRefreshing = false
  private var searchTasks: [String: DispatchWorkItem] = [:]
  private lazy var brandIcon = loadBrandIcon()

  @Published private(set) var snapshot = MenuStateSnapshot.empty
  @Published private(set) var transition: BridgeTransition?
  @Published var issueSearchText: [String: String] = [:]
  @Published private(set) var issueResults: [String: [IssueSearchResult]] = [:]
  @Published private(set) var searchingProcessIds: Set<String> = []
  @Published private(set) var attachingProcessIds: Set<String> = []
  @Published private(set) var selectingWorkspaceId: String?
  @Published private(set) var selectingProfileName: String?
  @Published private(set) var updateAvailable: String?
  @Published private(set) var isUpdating = false
  @Published var autoUpdateEnabled = true
  private var lastUpdateCheck = Date.distantPast

  init(configDir: URL, cliCommand: String, cliArgs: [String]) {
    self.configDir = configDir
    self.cliCommand = cliCommand
    self.cliArgs = cliArgs
    self.logURL = configDir.appendingPathComponent("menubar.log")
    super.init()
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.accessory)
    configureStatusItem()
    configurePopover()
    log("menu bar launched")
    refreshState()

    refreshTimer = Timer.scheduledTimer(withTimeInterval: 4.0, repeats: true) { [weak self] _ in
      self?.refreshState()
    }
    blinkTimer = Timer.scheduledTimer(withTimeInterval: 0.45, repeats: true) { [weak self] _ in
      guard let self else { return }
      guard self.transition != nil else { return }
      self.blinkVisible.toggle()
      self.updateStatusButton()
    }
  }

  func applicationWillTerminate(_ notification: Notification) {
    refreshTimer?.invalidate()
    blinkTimer?.invalidate()
  }

  func statusTitle() -> String {
    "Vector"
  }

  func statusBadgeLabel() -> String {
    if let transition {
      return transition.label.replacingOccurrences(of: "...", with: "")
    }
    if snapshot.running {
      return "Running"
    }
    if snapshot.starting {
      return "Starting"
    }
    if snapshot.configured {
      return "Offline"
    }
    return "Not configured"
  }

  func metadataLine() -> String {
    guard let config = snapshot.config else {
      return "Run vcli service start to configure this device"
    }
    return buildMetadataLine(
      config: config,
      sessionInfo: snapshot.sessionInfo,
      activeProfile: snapshot.activeProfile,
      defaultProfile: snapshot.defaultProfile,
      profiles: snapshot.profiles,
      workspaces: snapshot.workspaces,
      workSessions: snapshot.workSessions
    )
  }

  func issueSearchBinding(for processId: String) -> Binding<String> {
    Binding(
      get: { self.issueSearchText[processId] ?? "" },
      set: { self.updateIssueSearch(processId: processId, query: $0) }
    )
  }

  func isSearching(processId: String) -> Bool {
    searchingProcessIds.contains(processId)
  }

  func isAttaching(processId: String) -> Bool {
    attachingProcessIds.contains(processId)
  }

  func isSelecting(workspaceId: String) -> Bool {
    selectingWorkspaceId == workspaceId
  }

  func isSelecting(profileName: String) -> Bool {
    selectingProfileName == profileName
  }

  func results(for processId: String) -> [IssueSearchResult] {
    issueResults[processId] ?? []
  }

  func openIssue(_ workSession: WorkSessionSummary) {
    guard
      let issueKey = workSession.issueKey,
      let raw = buildIssueUrl(sessionInfo: snapshot.sessionInfo, issueKey: issueKey),
      let url = URL(string: raw)
    else {
      return
    }
    NSWorkspace.shared.open(url)
  }

  func openVector() {
    guard
      let appUrl = snapshot.sessionInfo.appUrl,
      let url = URL(string: appUrl)
    else {
      return
    }
    NSWorkspace.shared.open(url)
  }

  func selectWorkspace(_ workspace: DeviceWorkspaceSummary) {
    selectingWorkspaceId = workspace.id
    runCLI(
      arguments: [
        "--json",
        "service",
        "set-default-workspace",
        "--workspace-id",
        workspace._id,
      ]
    ) { [weak self] success, _ in
      guard let self else { return }
      if !success {
        self.log("failed to set default workspace: \(workspace._id)")
      }
      self.selectingWorkspaceId = nil
      self.refreshState()
    }
  }

  func selectProfile(_ profile: ProfileSummary) {
    selectingProfileName = profile.name
    runCLI(
      arguments: [
        "--json",
        "auth",
        "use-profile",
        profile.name,
      ]
    ) { [weak self] success, _ in
      guard let self else { return }
      if !success {
        self.log("failed to switch default profile: \(profile.name)")
      }
      self.selectingProfileName = nil
      self.refreshState()
    }
  }

  func startBridge() {
    beginTransition(.starting)
    runCLI(arguments: ["service", "start"])
  }

  func stopBridge() {
    beginTransition(.stopping)
    runCLI(arguments: ["service", "stop"])
  }

  func restartBridge() {
    beginTransition(.restarting)
    runCLI(arguments: ["service", "stop"]) { [weak self] success, _ in
      guard let self else { return }
      guard success else {
        self.transition = nil
        self.refreshState()
        return
      }
      self.transition = .starting
      self.transitionDeadline = Date().addingTimeInterval(20)
      self.runCLI(arguments: ["service", "start"])
    }
  }

  func quitVector() {
    log("quit vector clicked")
    runCLI(arguments: ["service", "stop"]) { _ , _ in
      DispatchQueue.main.async {
        self.popover.performClose(nil)
        NSApp.terminate(nil)
      }
    }
  }

  func updateCLI() {
    guard !isUpdating else { return }
    isUpdating = true
    log("starting CLI update")
    runCLI(arguments: ["update"]) { [weak self] success, output in
      guard let self else { return }
      self.isUpdating = false
      if success {
        self.updateAvailable = nil
        self.log("CLI update completed")
      } else {
        self.log("CLI update failed: \(output)")
      }
      self.refreshState()
    }
  }

  private func checkForUpdate() {
    // Only check every 5 minutes
    guard Date().timeIntervalSince(lastUpdateCheck) > 300 else { return }
    lastUpdateCheck = Date()

    DispatchQueue.global(qos: .utility).async { [weak self] in
      guard let self else { return }
      let task = Process()
      task.executableURL = URL(fileURLWithPath: "/usr/bin/env")
      task.arguments = ["npm", "view", "@rehpic/vcli", "version"]
      let pipe = Pipe()
      task.standardOutput = pipe
      task.standardError = Pipe()

      do {
        try task.run()
        task.waitUntilExit()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let latestVersion = String(data: data, encoding: .utf8)?
          .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        // Get current version from menu-state (already in snapshot via CLI)
        // Compare by running vcli --version
        let versionTask = Process()
        versionTask.executableURL = URL(fileURLWithPath: self.cliCommand)
        versionTask.arguments = self.cliArgs + ["--version"]
        let versionPipe = Pipe()
        versionTask.standardOutput = versionPipe
        versionTask.standardError = Pipe()
        try versionTask.run()
        versionTask.waitUntilExit()
        let versionData = versionPipe.fileHandleForReading.readDataToEndOfFile()
        let currentVersion = String(data: versionData, encoding: .utf8)?
          .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        DispatchQueue.main.async {
          if !latestVersion.isEmpty && !currentVersion.isEmpty
            && latestVersion != currentVersion
          {
            self.updateAvailable = latestVersion
            // Auto-update if enabled
            if self.autoUpdateEnabled && !self.isUpdating {
              self.log("auto-updating to \(latestVersion)")
              self.updateCLI()
            }
          } else {
            self.updateAvailable = nil
          }
        }
      } catch {
        self.log("update check failed: \(error)")
      }
    }
  }

  func updateIssueSearch(processId: String, query: String) {
    issueSearchText[processId] = query
    searchTasks[processId]?.cancel()

    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmed.count >= 2 else {
      searchingProcessIds.remove(processId)
      issueResults[processId] = []
      return
    }

    let workItem = DispatchWorkItem { [weak self] in
      self?.performIssueSearch(processId: processId, query: trimmed)
    }
    searchTasks[processId] = workItem
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25, execute: workItem)
  }

  func attach(process: AttachableProcess, to issue: IssueSearchResult) {
    guard let deviceId = snapshot.config?.deviceId else {
      return
    }

    attachingProcessIds.insert(process.id)

    var args = [
      "--json",
      "service",
      "attach-process",
      "--issue-id",
      issue._id,
      "--device-id",
      deviceId,
      "--process-id",
      process._id,
      "--provider",
      process.provider,
    ]
    if let title = process.attachTitle, !title.isEmpty {
      args.append(contentsOf: ["--title", title])
    }

    runCLI(arguments: args) { [weak self] success, _ in
      guard let self else { return }
      self.attachingProcessIds.remove(process.id)
      if success {
        self.issueSearchText[process.id] = ""
        self.issueResults[process.id] = []
      }
      self.refreshState()
    }
  }

  private func configureStatusItem() {
    guard let button = statusItem.button else { return }
    button.target = self
    button.action = #selector(togglePopover)
    button.sendAction(on: [.leftMouseUp, .rightMouseUp])
    updateStatusButton()
  }

  private func configurePopover() {
    popover.behavior = .transient
    popover.animates = false
    popover.contentSize = NSSize(width: 460, height: 560)
    popover.contentViewController = NSHostingController(
      rootView: TrayPopoverView(controller: self)
    )
  }

  @objc private func togglePopover() {
    guard let button = statusItem.button else { return }
    if popover.isShown {
      popover.performClose(nil)
      return
    }
    refreshState()
    popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
    popover.contentViewController?.view.window?.becomeKey()
  }

  private func beginTransition(_ nextTransition: BridgeTransition) {
    transition = nextTransition
    transitionDeadline = Date().addingTimeInterval(20)
    blinkVisible = true
    updateStatusButton()
  }

  private func refreshState() {
    if isRefreshing {
      return
    }
    isRefreshing = true

    runCLI(arguments: ["--json", "service", "menu-state"], captureOutput: true) { [weak self] success, output in
      guard let self else { return }
      defer { self.isRefreshing = false }

      if success,
         let data = output.data(using: .utf8),
         let state = try? JSONDecoder().decode(MenuStateSnapshot.self, from: data) {
        self.snapshot = state
      }

      self.reconcileTransition()
      self.updateStatusButton()
      self.checkForUpdate()
    }
  }

  private func reconcileTransition() {
    if transition != nil && Date() > transitionDeadline {
      transition = nil
      blinkVisible = true
    }

    if transition == .stopping && !snapshot.running {
      transition = nil
      blinkVisible = true
    }

    if (transition == .starting || transition == .restarting) && snapshot.running {
      transition = nil
      blinkVisible = true
    }
  }

  private func updateStatusButton() {
    guard let button = statusItem.button else { return }
    button.title = ""

    // Show update dot indicator
    if updateAvailable != nil {
      button.title = " \u{2022}" // bullet dot
    }

    button.image = brandIcon ?? fallbackStatusIcon()
    button.image?.isTemplate = false

    // Dim icon when bridge is not running (and not transitioning)
    if transition != nil && !blinkVisible {
      button.alphaValue = 0.35
    } else if !snapshot.running && !snapshot.starting && transition == nil {
      button.alphaValue = 0.5
    } else {
      button.alphaValue = 1.0
    }
  }

  private func performIssueSearch(processId: String, query: String) {
    searchingProcessIds.insert(processId)
    runCLI(
      arguments: ["--json", "service", "search-issues", query, "--limit", "8"],
      captureOutput: true
    ) { [weak self] success, output in
      guard let self else { return }
      self.searchingProcessIds.remove(processId)

      guard success,
            let data = output.data(using: .utf8),
            let issues = try? JSONDecoder().decode([IssueSearchResult].self, from: data)
      else {
        self.issueResults[processId] = []
        return
      }

      self.issueResults[processId] = issues
    }
  }

  private func runCLI(
    arguments: [String],
    captureOutput: Bool = false,
    completion: ((Bool, String) -> Void)? = nil
  ) {
    log("running CLI: \(arguments.joined(separator: " "))")

    let process = Process()
    process.executableURL = URL(fileURLWithPath: cliCommand)
    process.arguments = cliArgs + arguments
    process.environment = ProcessInfo.processInfo.environment

    let stdoutPipe = captureOutput ? Pipe() : nil
    let stderrPipe = captureOutput ? Pipe() : nil
    process.standardOutput = stdoutPipe
    process.standardError = stderrPipe

    process.terminationHandler = { process in
      let stdout = stdoutPipe.flatMap { pipe in
        String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)
      } ?? ""
      let stderr = stderrPipe.flatMap { pipe in
        String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)
      } ?? ""
      let output = !stdout.isEmpty ? stdout : stderr

      DispatchQueue.main.async {
        self.log("CLI finished (\(process.terminationStatus)): \(arguments.joined(separator: " "))")
        completion?(process.terminationStatus == 0, output)
        self.refreshState()
      }
    }

    do {
      try process.run()
    } catch {
      log("CLI failed to start: \(arguments.joined(separator: " "))")
      transition = nil
      blinkVisible = true
      updateStatusButton()
      completion?(false, "")
    }
  }

  private func loadBrandIcon() -> NSImage? {
    let candidates = [
      "vector-menubar@2x",
      "vector-menubar",
    ]

    for name in candidates {
      guard let url = Bundle.main.url(forResource: name, withExtension: "png") else {
        continue
      }
      guard let image = NSImage(contentsOf: url) else {
        continue
      }
      image.size = NSSize(width: 18, height: 18)
      return image
    }

    return nil
  }

  private func fallbackStatusIcon() -> NSImage? {
    let symbolName: String
    if transition != nil {
      symbolName = "bolt.circle"
    } else if snapshot.running {
      symbolName = "bolt.circle.fill"
    } else {
      symbolName = "bolt.circle"
    }

    return NSImage(systemSymbolName: symbolName, accessibilityDescription: "Vector Bridge")
  }

  private func log(_ message: String) {
    let formatter = ISO8601DateFormatter()
    let line = "[\(formatter.string(from: Date()))] \(message)\n"
    let data = Data(line.utf8)

    if FileManager.default.fileExists(atPath: logURL.path) {
      if let handle = try? FileHandle(forWritingTo: logURL) {
        _ = try? handle.seekToEnd()
        try? handle.write(contentsOf: data)
        try? handle.close()
      }
      return
    }

    try? data.write(to: logURL)
  }
}

struct TrayPopoverView: View {
  @ObservedObject var controller: MenuBarController
  @State private var workSessionsExpanded = true
  @State private var processesExpanded = true
  @State private var expandedProcessIds: Set<String> = []
  @State private var workSessionFilter: WorkSessionFilter = .all

  private var sortedProfiles: [ProfileSummary] {
    controller.snapshot.profiles.sorted { lhs, rhs in
      if lhs.isDefault != rhs.isDefault {
        return lhs.isDefault && !rhs.isDefault
      }
      if lhs.hasSession != rhs.hasSession {
        return lhs.hasSession && !rhs.hasSession
      }
      return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
    }
  }

  private var sortedWorkspaces: [DeviceWorkspaceSummary] {
    controller.snapshot.workspaces.sorted { lhs, rhs in
      if lhs.isDefault != rhs.isDefault {
        return lhs.isDefault && !rhs.isDefault
      }
      return lhs.displayLabel.localizedCaseInsensitiveCompare(rhs.displayLabel) == .orderedAscending
    }
  }

  private var filteredWorkSessions: [WorkSessionSummary] {
    controller.snapshot.workSessions.filter { workSessionFilter.matches($0) }
  }

  private var currentProfile: ProfileSummary? {
    sortedProfiles.first(where: \.isDefault) ??
      sortedProfiles.first(where: { $0.name == controller.snapshot.activeProfile }) ??
      sortedProfiles.first
  }

  private var currentWorkspace: DeviceWorkspaceSummary? {
    sortedWorkspaces.first(where: \.isDefault) ?? sortedWorkspaces.first
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Text(controller.statusTitle())
          .font(.system(size: 13, weight: .semibold))
        Text(controller.metadataLine())
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(.secondary)
          .lineLimit(1)
          .truncationMode(.tail)
        Spacer(minLength: 0)

        // Settings menu
        Menu {
          // Profile section
          Menu("Profile: \(currentProfile?.name ?? "None")") {
            if sortedProfiles.isEmpty {
              Text("No CLI profiles found")
            } else {
              ForEach(sortedProfiles) { profile in
                Button {
                  controller.selectProfile(profile)
                } label: {
                  Label {
                    Text(profile.name)
                  } icon: {
                    Image(
                      systemName:
                        profile.isDefault ? "checkmark.circle.fill" : "circle"
                    )
                  }
                }
                .disabled(profile.isDefault || controller.isSelecting(profileName: profile.name))
              }
            }
          }

          // Workspace section
          Menu("Workspace: \(currentWorkspace?.displayLabel ?? "None")") {
            if sortedWorkspaces.isEmpty {
              Text("No workspaces configured")
            } else {
              ForEach(sortedWorkspaces) { workspace in
                Button {
                  controller.selectWorkspace(workspace)
                } label: {
                  Label {
                    VStack(alignment: .leading, spacing: 1) {
                      Text(workspace.displayLabel)
                      Text(workspace.path)
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                    }
                  } icon: {
                    Image(
                      systemName:
                        workspace.isDefault ? "checkmark.circle.fill" : "circle"
                    )
                  }
                }
                .disabled(workspace.isDefault || controller.isSelecting(workspaceId: workspace.id))
              }
            }
          }

          Divider()

          // Auto-update toggle
          Toggle("Auto-update CLI", isOn: Binding(
            get: { controller.autoUpdateEnabled },
            set: { controller.autoUpdateEnabled = $0 }
          ))
        } label: {
          Image(systemName: "gearshape")
            .font(.system(size: 11))
            .foregroundStyle(.secondary)
        }
        .menuStyle(.borderlessButton)
        .frame(width: 20)

        StatusChip(text: controller.statusBadgeLabel())
      }

      Divider()

      ScrollView {
        VStack(alignment: .leading, spacing: 12) {
          VStack(alignment: .leading, spacing: 8) {
            Button {
              workSessionsExpanded.toggle()
            } label: {
              SectionLabel(
                title: "Work Sessions",
                count: controller.snapshot.workSessions.count,
                expanded: workSessionsExpanded
              )
            }
            .buttonStyle(.plain)

            if workSessionsExpanded {
              VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                  ForEach(WorkSessionFilter.allCases) { filter in
                    Button {
                      workSessionFilter = filter
                    } label: {
                      Text(filter.title)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(workSessionFilter == filter ? .primary : .secondary)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 5)
                        .background(
                          Capsule(style: .continuous)
                            .fill(
                              workSessionFilter == filter
                                ? Color.white.opacity(0.11)
                                : Color.white.opacity(0.035)
                            )
                        )
                    }
                    .buttonStyle(.plain)
                  }
                }

                if filteredWorkSessions.isEmpty {
                  EmptySectionLabel(
                    text: controller.snapshot.workSessions.isEmpty
                      ? "No work sessions on this device."
                      : "No work sessions match this filter."
                  )
                } else {
                  ForEach(filteredWorkSessions) { workSession in
                    Button(action: { controller.openIssue(workSession) }) {
                      WorkSessionRow(workSession: workSession)
                    }
                    .buttonStyle(.plain)
                    .help(buildWorkSessionTooltip(workSession))
                  }
                }
              }
            }
          }

          VStack(alignment: .leading, spacing: 8) {
            Button {
              processesExpanded.toggle()
            } label: {
              SectionLabel(
                title: "Detected Sessions",
                count: controller.snapshot.detectedSessions.count,
                expanded: processesExpanded
              )
            }
            .buttonStyle(.plain)

            if processesExpanded {
              VStack(alignment: .leading, spacing: 8) {
                if controller.snapshot.detectedSessions.isEmpty {
                  EmptySectionLabel(text: "No attachable Codex or Claude sessions detected.")
                } else {
                  ForEach(controller.snapshot.detectedSessions) { process in
                    let isExpanded = expandedProcessIds.contains(process.id)

                    VStack(alignment: .leading, spacing: isExpanded ? 10 : 0) {
                      Button {
                        if isExpanded {
                          expandedProcessIds.remove(process.id)
                        } else {
                          expandedProcessIds.insert(process.id)
                        }
                      } label: {
                        ProcessRow(process: process, expanded: isExpanded)
                      }
                      .buttonStyle(.plain)

                      if isExpanded {
                        VStack(alignment: .leading, spacing: 8) {
                          TextField(
                            "Search issue key or title...",
                            text: controller.issueSearchBinding(for: process.id)
                          )
                          .textFieldStyle(.roundedBorder)
                          .font(.system(size: 12))

                          if controller.isSearching(processId: process.id) {
                            HStack(spacing: 8) {
                              ProgressView()
                                .controlSize(.small)
                              Text("Searching issues")
                                .font(.system(size: 11))
                                .foregroundStyle(.secondary)
                            }
                          } else if controller.results(for: process.id).isEmpty {
                            EmptySectionLabel(
                              text: (controller.issueSearchText[process.id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).count >= 2
                                ? "No matching issues."
                                : "Type at least 2 characters to search."
                            )
                          } else {
                            VStack(alignment: .leading, spacing: 6) {
                              ForEach(controller.results(for: process.id)) { issue in
                                HStack(alignment: .center, spacing: 8) {
                                  Circle()
                                    .fill(color(from: issue.stateColor))
                                    .frame(width: 8, height: 8)
                                  VStack(alignment: .leading, spacing: 2) {
                                    Text(issue.key)
                                      .font(.system(size: 11, weight: .semibold))
                                    Text(issue.title)
                                      .font(.system(size: 11))
                                      .foregroundStyle(.secondary)
                                      .lineLimit(2)
                                  }
                                  Spacer(minLength: 0)
                                  Button(controller.isAttaching(processId: process.id) ? "Attaching..." : "Attach") {
                                    controller.attach(process: process, to: issue)
                                  }
                                  .buttonStyle(.borderedProminent)
                                  .controlSize(.small)
                                  .disabled(controller.isAttaching(processId: process.id))
                                }
                                .padding(.vertical, 2)
                              }
                            }
                          }
                        }
                        .transition(.opacity.combined(with: .move(edge: .top)))
                      }
                    }
                    .padding(12)
                    .background(SessionCardBackground(isExpanded: isExpanded))
                  }
                }
              }
            }
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .frame(maxHeight: 360)

      Divider()

      // Update banner
      if let latestVersion = controller.updateAvailable {
        HStack(spacing: 8) {
          Image(systemName: "arrow.triangle.2.circlepath")
            .foregroundColor(.blue)
            .font(.system(size: 11))
          Text("Update available: v\(latestVersion)")
            .font(.system(size: 11))
            .foregroundColor(.secondary)
          Spacer(minLength: 0)
          Button(controller.isUpdating ? "Updating..." : "Update") {
            controller.updateCLI()
          }
          .buttonStyle(.borderedProminent)
          .controlSize(.small)
          .disabled(controller.isUpdating)
        }
        .padding(.horizontal, 2)
        .padding(.vertical, 4)

        Divider()
      }

      HStack(spacing: 8) {
        if controller.isUpdating {
          StatusChip(text: "Updating CLI...")
        } else if let transition = controller.transition {
          StatusChip(text: transition.label)
        } else if controller.snapshot.running {
          Button("Stop Bridge") {
            controller.stopBridge()
          }
          .buttonStyle(.bordered)

          Button("Restart Bridge") {
            controller.restartBridge()
          }
          .buttonStyle(.bordered)
        } else if controller.snapshot.configured {
          Button("Start Bridge") {
            controller.startBridge()
          }
          .buttonStyle(.borderedProminent)
        }

        Spacer(minLength: 0)

        Button("Open Vector") {
          controller.openVector()
        }
        .buttonStyle(.bordered)

        Button("Quit") {
          controller.quitVector()
        }
        .buttonStyle(.borderedProminent)
        .tint(.red)
      }
    }
    .padding(14)
    .frame(width: 460)
  }
}

struct CompactSelectorChip: View {
  let title: String
  let value: String
  let detail: String

  var body: some View {
    HStack(spacing: 8) {
      VStack(alignment: .leading, spacing: 1) {
        Text(title)
          .font(.system(size: 9, weight: .semibold))
          .foregroundStyle(.tertiary)
        Text(value)
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(.primary)
          .lineLimit(1)
        Text(detail)
          .font(.system(size: 10, weight: .medium))
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
      Spacer(minLength: 0)
      Image(systemName: "chevron.down")
        .font(.system(size: 10, weight: .semibold))
        .foregroundStyle(.tertiary)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 7)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      RoundedRectangle(cornerRadius: 11, style: .continuous)
        .fill(Color.white.opacity(0.05))
    )
  }
}

struct SectionLabel: View {
  let title: String
  let count: Int
  let expanded: Bool

  var body: some View {
    HStack(spacing: 8) {
      Text(title)
        .font(.system(size: 12, weight: .semibold))
      Spacer(minLength: 0)
      Text("\(count)")
        .font(.system(size: 10, weight: .semibold))
        .foregroundStyle(.secondary)
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(Capsule().fill(Color(NSColor.quaternaryLabelColor).opacity(0.15)))
      Image(systemName: expanded ? "chevron.down" : "chevron.right")
        .font(.system(size: 10, weight: .semibold))
        .foregroundStyle(.tertiary)
    }
  }
}

struct EmptySectionLabel: View {
  let text: String

  var body: some View {
    Text(text)
      .font(.system(size: 11))
      .foregroundStyle(.secondary)
      .padding(.vertical, 2)
  }
}

struct StatusChip: View {
  let text: String

  var body: some View {
    Text(text)
      .font(.system(size: 11, weight: .semibold))
      .padding(.horizontal, 10)
      .padding(.vertical, 6)
      .background(Capsule().fill(Color(NSColor.selectedControlColor).opacity(0.12)))
  }
}

struct WorkspaceRow: View {
  let workspace: DeviceWorkspaceSummary
  let isSelecting: Bool

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      ZStack {
        Circle()
          .fill(workspace.isDefault ? Color.accentColor.opacity(0.22) : Color.white.opacity(0.1))
          .frame(width: 18, height: 18)
        if workspace.isDefault {
          Image(systemName: "checkmark")
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(Color.accentColor)
        } else {
          Circle()
            .fill(Color.secondary.opacity(0.8))
            .frame(width: 6, height: 6)
        }
      }
      .padding(.top, 2)

      VStack(alignment: .leading, spacing: 4) {
        HStack(alignment: .center, spacing: 8) {
          Text(workspace.displayLabel)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(.primary)
            .lineLimit(1)
          Spacer(minLength: 0)
          HStack(spacing: 6) {
            Text(workspace.policyLabel)
              .font(.system(size: 10, weight: .semibold))
              .foregroundStyle(.secondary)
              .padding(.horizontal, 7)
              .padding(.vertical, 4)
              .background(
                Capsule(style: .continuous)
                  .fill(Color.white.opacity(0.055))
              )
            if workspace.isDefault {
              Text("Default")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(Color.accentColor)
                .padding(.horizontal, 7)
                .padding(.vertical, 4)
                .background(
                  Capsule(style: .continuous)
                    .fill(Color.accentColor.opacity(0.12))
                )
            } else if isSelecting {
              Text("Selecting…")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.secondary)
            }
          }
        }

        Text(workspace.defaultBranch.map { "\(workspace.workspaceName) · \($0)" } ?? workspace.workspaceName)
          .font(.system(size: 11))
          .foregroundStyle(.secondary)
          .lineLimit(1)

        Text(workspace.path)
          .font(.system(size: 10, weight: .medium, design: .monospaced))
          .foregroundStyle(.tertiary)
          .lineLimit(1)
      }

      if !workspace.isDefault {
        Image(systemName: "chevron.right")
          .font(.system(size: 10, weight: .semibold))
          .foregroundStyle(.tertiary)
          .padding(.top, 4)
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(SessionCardBackground(isExpanded: workspace.isDefault || isSelecting))
  }
}

struct ProfileRow: View {
  let profile: ProfileSummary
  let isActive: Bool
  let isSelecting: Bool

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      ZStack {
        Circle()
          .fill(profile.isDefault ? Color.accentColor.opacity(0.22) : Color.white.opacity(0.1))
          .frame(width: 18, height: 18)
        if profile.isDefault {
          Image(systemName: "checkmark")
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(Color.accentColor)
        } else {
          Circle()
            .fill(Color.secondary.opacity(0.8))
            .frame(width: 6, height: 6)
        }
      }
      .padding(.top, 2)

      VStack(alignment: .leading, spacing: 4) {
        HStack(alignment: .center, spacing: 8) {
          Text(profile.name)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(.primary)
            .lineLimit(1)
          Spacer(minLength: 0)
          HStack(spacing: 6) {
            if isActive {
              Text("Active")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.primary)
                .padding(.horizontal, 7)
                .padding(.vertical, 4)
                .background(
                  Capsule(style: .continuous)
                    .fill(Color.white.opacity(0.08))
                )
            }
            if profile.isDefault {
              Text("Default")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(Color.accentColor)
                .padding(.horizontal, 7)
                .padding(.vertical, 4)
                .background(
                  Capsule(style: .continuous)
                    .fill(Color.accentColor.opacity(0.12))
                )
            } else if isSelecting {
              Text("Switching…")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.secondary)
            }
          }
        }

        Text(profile.hasSession ? "Signed in profile" : "No saved session yet")
          .font(.system(size: 11))
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }

      if !profile.isDefault {
        Image(systemName: "chevron.right")
          .font(.system(size: 10, weight: .semibold))
          .foregroundStyle(.tertiary)
          .padding(.top, 4)
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(SessionCardBackground(isExpanded: profile.isDefault || isSelecting))
  }
}

enum WorkSessionFilter: String, CaseIterable, Identifiable {
  case all
  case agent
  case manual

  var id: String { rawValue }

  var title: String {
    switch self {
    case .all:
      return "All"
    case .agent:
      return "Agent"
    case .manual:
      return "Manual"
    }
  }

  func matches(_ session: WorkSessionSummary) -> Bool {
    switch self {
    case .all:
      return true
    case .agent:
      return session.agentProvider == "codex" || session.agentProvider == "claude_code"
    case .manual:
      return session.agentProvider == nil || session.agentProvider == "vector_cli"
    }
  }
}

struct WorkSessionRow: View {
  let workSession: WorkSessionSummary

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      Circle()
        .fill(providerColor(workSession.agentProvider))
        .frame(width: 8, height: 8)
        .padding(.top, 6)
      VStack(alignment: .leading, spacing: 4) {
        HStack(alignment: .top, spacing: 8) {
          VStack(alignment: .leading, spacing: 3) {
            Text(workSession.primaryLabel)
              .font(.system(size: 12, weight: .semibold))
              .foregroundStyle(.primary)
              .lineLimit(2)
              .fixedSize(horizontal: false, vertical: true)
            if let issueLabel = workSession.issueLabel, !issueLabel.isEmpty {
              Text(issueLabel)
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
                .lineLimit(2)
            }
          }
          Spacer(minLength: 0)
          HStack(spacing: 8) {
            Text(workSession.providerLabel)
              .font(.system(size: 10, weight: .semibold))
              .foregroundStyle(providerColor(workSession.agentProvider))
              .padding(.horizontal, 7)
              .padding(.vertical, 4)
              .background(
                Capsule(style: .continuous)
                  .fill(providerColor(workSession.agentProvider).opacity(0.16))
              )
            Text(workSession.status.replacingOccurrences(of: "_", with: " "))
              .font(.system(size: 10, weight: .medium))
              .foregroundStyle(.secondary)
          }
        }
        Text(workSessionMeta(workSession))
          .font(.system(size: 11))
          .foregroundStyle(.secondary)
          .lineLimit(1)
        if let repoPathLabel = workSession.repoPathLabel, !repoPathLabel.isEmpty {
          Text(repoPathLabel)
            .font(.system(size: 10, weight: .medium, design: .monospaced))
            .foregroundStyle(.tertiary)
            .lineLimit(1)
        }
        if let latestSummary = workSession.latestSummary, !latestSummary.isEmpty {
          Text(latestSummary)
            .font(.system(size: 11))
            .foregroundStyle(.secondary)
            .lineLimit(2)
        }
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(SessionCardBackground(isExpanded: false))
  }
}

struct ProcessRow: View {
  let process: AttachableProcess
  let expanded: Bool

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      Circle()
        .fill(providerColor(process.provider))
        .frame(width: 8, height: 8)
        .padding(.top, 6)
      VStack(alignment: .leading, spacing: 3) {
        HStack(alignment: .top, spacing: 8) {
          Text(process.primaryLabel)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(.primary)
            .lineLimit(2)
            .fixedSize(horizontal: false, vertical: true)
          Spacer(minLength: 0)
          HStack(spacing: 8) {
            ProviderBadge(process: process)
            Image(systemName: expanded ? "chevron.down" : "chevron.right")
              .font(.system(size: 10, weight: .semibold))
              .foregroundStyle(.tertiary)
          }
          .padding(.top, 1)
        }
        Text(processMeta(process))
          .font(.system(size: 11))
          .foregroundStyle(.secondary)
          .lineLimit(1)
        if let repoPathLabel = process.repoPathLabel, !repoPathLabel.isEmpty {
          Text(repoPathLabel)
            .font(.system(size: 10, weight: .medium, design: .monospaced))
            .foregroundStyle(.tertiary)
            .lineLimit(1)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

struct ProviderBadge: View {
  let process: AttachableProcess

  var body: some View {
    Text(process.resolvedProviderLabel)
      .font(.system(size: 10, weight: .semibold))
      .foregroundStyle(providerColor(process.provider))
      .padding(.horizontal, 7)
      .padding(.vertical, 4)
      .background(
        Capsule(style: .continuous)
          .fill(providerColor(process.provider).opacity(0.16))
      )
  }
}

struct SessionCardBackground: View {
  let isExpanded: Bool

  var body: some View {
    RoundedRectangle(cornerRadius: 14, style: .continuous)
      .fill(Color.white.opacity(isExpanded ? 0.052 : 0.032))
      .overlay(
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .stroke(Color.white.opacity(isExpanded ? 0.08 : 0.045), lineWidth: 1)
      )
  }
}

func providerColor(_ provider: String?) -> Color {
  switch provider {
  case "claude_code":
    return Color(red: 0.95, green: 0.55, blue: 0.28)
  case "codex":
    return Color(red: 0.22, green: 0.62, blue: 0.96)
  case "vector_cli", nil:
    return Color(red: 0.58, green: 0.62, blue: 0.7)
  default:
    return Color.gray
  }
}

func color(from hex: String?) -> Color {
  guard let hex else {
    return .gray
  }

  let sanitized = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
  guard let value = Int(sanitized, radix: 16) else {
    return .gray
  }

  let red = Double((value >> 16) & 0xFF) / 255.0
  let green = Double((value >> 8) & 0xFF) / 255.0
  let blue = Double(value & 0xFF) / 255.0
  return Color(red: red, green: green, blue: blue)
}

func processMeta(_ process: AttachableProcess) -> String {
  let workspace = summarizeWorkspacePath(process.repoRoot ?? process.cwd)
  let primary = normalizeProcessLabel(process.primaryLabel)
  let secondaryWorkspace = workspace.flatMap { label -> String? in
    guard normalizeProcessLabel(label) != primary else {
      return nil
    }
    return label
  }

  return [secondaryWorkspace, process.branch, process.mode]
    .compactMap { value in
      guard let value, !value.isEmpty else { return nil }
      return value
    }
    .joined(separator: " · ")
}

func summarizeWorkspacePath(_ value: String?) -> String? {
  guard let value, !value.isEmpty else {
    return nil
  }
  if value.contains("/") {
    return URL(fileURLWithPath: value).lastPathComponent
  }
  return value
}

func normalizeProcessLabel(_ value: String) -> String {
  value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
}

func workSessionMeta(_ workSession: WorkSessionSummary) -> String {
  let workspace = summarizeWorkspacePath(
    workSession.repoRoot ?? workSession.cwd ?? workSession.workspacePath
  )
  return [workspace, workSession.branch, workSession.tmuxPaneId]
    .compactMap { value in
      guard let value, !value.isEmpty else { return nil }
      return value
    }
    .joined(separator: " · ")
}

func buildMetadataLine(
  config: BridgeConfig,
  sessionInfo: SessionInfo,
  activeProfile: String,
  defaultProfile: String,
  profiles: [ProfileSummary],
  workspaces: [DeviceWorkspaceSummary],
  workSessions: [WorkSessionSummary]
) -> String {
  let deviceName = config.displayName
  let orgLabel = sessionInfo.orgSlug
  return "\(deviceName) · \(orgLabel)"
}

func summarizeWorkspace(
  workspaces: [DeviceWorkspaceSummary],
  workSessions: [WorkSessionSummary]
) -> String? {
  if let current = workspaces.first(where: \.isDefault) {
    return current.displayLabel
  }

  let workspaces = Array(Set<String>(workSessions.compactMap { workSession in
    let path = workSession.repoRoot ?? workSession.cwd ?? workSession.workspacePath
    guard let path else { return nil }
    return URL(fileURLWithPath: path).lastPathComponent
  })).sorted()

  guard !workspaces.isEmpty else { return nil }
  if workspaces.count == 1 {
    return workspaces[0]
  }
  return "\(workspaces.count) workspaces"
}

func buildWorkSessionTooltip(_ workSession: WorkSessionSummary) -> String {
  [workSession.issueLabel, workSession.title, workSession.latestSummary]
    .compactMap { value in
      guard let value, !value.isEmpty else { return nil }
      return value
    }
    .joined(separator: "\n")
}

func buildIssueUrl(sessionInfo: SessionInfo, issueKey: String) -> String? {
  guard
    let appUrl = sessionInfo.appUrl,
    let base = URL(string: appUrl)
  else {
    return nil
  }
  return base.appending(path: "\(sessionInfo.orgSlug)/issues/\(issueKey)").absoluteString
}

let environment = ProcessInfo.processInfo.environment
let homeDir = FileManager.default.homeDirectoryForCurrentUser
let configDir = URL(fileURLWithPath: environment["VECTOR_HOME"] ?? homeDir.appendingPathComponent(".vector").path)
let cliCommand = environment["VECTOR_CLI_COMMAND"] ?? "/usr/bin/env"
let cliArgs: [String]
if let rawArgs = environment["VECTOR_CLI_ARGS_JSON"], let data = rawArgs.data(using: .utf8) {
  cliArgs = (try? JSONDecoder().decode([String].self, from: data)) ?? []
} else {
  cliArgs = []
}

let app = NSApplication.shared
let delegate = MenuBarController(configDir: configDir, cliCommand: cliCommand, cliArgs: cliArgs)
app.delegate = delegate
app.run()
