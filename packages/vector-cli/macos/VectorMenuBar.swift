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
    case "cursor":
      return "Cursor"
    case "copilot":
      return "Copilot"
    case "opencode":
      return "OpenCode"
    case "pi":
      return "Pi"
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
  struct Health: Decodable {
    let state: String
    let updatedAt: String?
    let lastHeartbeatAt: String?
    let lastError: String?
  }

  let configured: Bool
  let running: Bool
  let starting: Bool
  let pid: Int32?
  let config: BridgeConfig?
  let health: Health?
  let stateError: String?
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
    health: nil,
    stateError: nil,
    sessionInfo: SessionInfo(
      orgSlug: "",
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

final class ProcessOutputCollector {
  private let lock = NSLock()
  private var data = Data()

  func append(_ chunk: Data) {
    lock.lock()
    data.append(chunk)
    lock.unlock()
  }

  func string() -> String {
    lock.lock()
    defer { lock.unlock() }
    return String(data: data, encoding: .utf8) ?? ""
  }
}

final class MenuBarController: NSObject, NSApplicationDelegate, ObservableObject {
  private static let autoUpdatePreferenceKey = "VectorMenuBar.autoUpdateEnabled"
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
  @Published private(set) var lastRefreshError: String?
  @Published var autoUpdateEnabled: Bool {
    didSet {
      UserDefaults.standard.set(autoUpdateEnabled, forKey: Self.autoUpdatePreferenceKey)
    }
  }
  private var lastUpdateCheck = Date.distantPast
  private var updateCheckInFlight = false
  private let launchTime = Date()

  init(configDir: URL, cliCommand: String, cliArgs: [String]) {
    self.configDir = configDir
    self.cliCommand = cliCommand
    self.cliArgs = cliArgs
    self.logURL = configDir.appendingPathComponent("menubar.log")
    self.autoUpdateEnabled = UserDefaults.standard.bool(
      forKey: Self.autoUpdatePreferenceKey
    )
    super.init()
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.accessory)
    configureStatusItem()
    configurePopover()
    log("menu bar launched")
    refreshState()

    refreshTimer = Timer.scheduledTimer(withTimeInterval: 8.0, repeats: true) { [weak self] _ in
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
      return lastRefreshError == nil && snapshot.health?.state != "degraded"
        ? "Running"
        : "Degraded"
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
        self.selectingProfileName = nil
        self.refreshState()
        return
      }
      self.beginTransition(.restarting)
      self.runCLI(arguments: ["service", "stop"]) { [weak self] _, _ in
        self?.runCLI(arguments: ["--profile", profile.name, "service", "start"]) {
          [weak self] _, _ in
          self?.selectingProfileName = nil
          self?.refreshState()
        }
      }
    }
  }

  func startBridge() {
    beginTransition(.starting)
    runCLI(arguments: ["service", "start"]) { [weak self] success, output in
      self?.finishBridgeAction(success: success, output: output)
    }
  }

  func stopBridge() {
    beginTransition(.stopping)
    runCLI(arguments: ["service", "stop"]) { [weak self] success, output in
      self?.finishBridgeAction(success: success, output: output)
    }
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
    popover.performClose(nil)
    NSApp.terminate(nil)
  }

  func updateCLI() {
    guard !isUpdating else { return }
    isUpdating = true
    log("starting CLI update")
    runCLI(arguments: ["update"], timeout: 180) { [weak self] success, output in
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
    guard !updateCheckInFlight else { return }
    guard Date().timeIntervalSince(lastUpdateCheck) > 300 else { return }
    lastUpdateCheck = Date()
    updateCheckInFlight = true

    DispatchQueue.global(qos: .utility).async { [weak self] in
      guard let self else { return }
      defer {
        DispatchQueue.main.async {
          self.updateCheckInFlight = false
        }
      }

      // Get dist-tags JSON to find the actual newest version
      let task = Process()
      task.executableURL = URL(fileURLWithPath: "/usr/bin/env")
      task.arguments = ["npm", "view", "@rehpic/vcli", "dist-tags", "--json"]
      let pipe = Pipe()
      task.standardOutput = pipe
      task.standardError = Pipe()

      do {
        try task.run()
        task.waitUntilExit()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        guard let tags = try? JSONSerialization.jsonObject(with: data) as? [String: String] else {
          return
        }
        let latestVersion = tags["latest"] ?? ""

        // Get current version
        let versionTask = Process()
        versionTask.executableURL = URL(fileURLWithPath: self.cliCommand)
        versionTask.arguments = self.cliArgs + ["--version"]
        let versionPipe = Pipe()
        versionTask.standardOutput = versionPipe
        versionTask.standardError = Pipe()
        try versionTask.run()
        versionTask.waitUntilExit()
        let versionData = versionPipe.fileHandleForReading.readDataToEndOfFile()
        let currentVersion =
          String(data: versionData, encoding: .utf8)?
          .split(whereSeparator: \.isNewline)
          .last
          .map(String.init)?
          .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        DispatchQueue.main.async {
          if isVersion(latestVersion, newerThan: currentVersion) {
            self.updateAvailable = latestVersion
            // Auto-update if enabled (but not within the first 5 minutes or while popover is open)
            let uptime = Date().timeIntervalSince(self.launchTime)
            if self.autoUpdateEnabled && !self.isUpdating && uptime > 300 && !self.popover.isShown {
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
    NSApp.activate(ignoringOtherApps: true)
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

    runCLI(
      arguments: ["--json", "service", "menu-state"],
      captureOutput: true,
      timeout: 20
    ) { [weak self] success, output in
      guard let self else { return }
      defer { self.isRefreshing = false }

      if success, let data = output.data(using: .utf8) {
        do {
          self.snapshot = try JSONDecoder().decode(MenuStateSnapshot.self, from: data)
          self.lastRefreshError =
            self.snapshot.stateError
            ?? (self.snapshot.health?.state == "degraded"
              ? self.snapshot.health?.lastError
              : nil)
        } catch {
          self.lastRefreshError = "Status unavailable"
          self.log("menu-state decode failed: \(error)")
        }
      } else {
        self.lastRefreshError = "Status unavailable"
        self.log("menu-state command failed: \(output.prefix(500))")
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
      button.title = " \u{2022}"  // bullet dot
    }

    button.image = brandIcon ?? fallbackStatusIcon()
    button.image?.isTemplate = true
    button.toolTip = "Vector — \(statusBadgeLabel())"
    button.setAccessibilityLabel("Vector")
    button.setAccessibilityHelp(statusBadgeLabel())

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
    timeout: TimeInterval = 45,
    completion: ((Bool, String) -> Void)? = nil
  ) {
    log("running CLI: \(arguments.joined(separator: " "))")

    let process = Process()
    process.executableURL = URL(fileURLWithPath: cliCommand)
    process.arguments = cliArgs + arguments
    process.environment = ProcessInfo.processInfo.environment

    let stdoutPipe = captureOutput ? Pipe() : nil
    let stderrPipe = captureOutput ? Pipe() : nil
    let stdoutCollector = ProcessOutputCollector()
    let stderrCollector = ProcessOutputCollector()
    let drainGroup = DispatchGroup()
    process.standardOutput = stdoutPipe
    process.standardError = stderrPipe

    func drain(_ pipe: Pipe?, into collector: ProcessOutputCollector) {
      guard let pipe else { return }
      drainGroup.enter()
      pipe.fileHandleForReading.readabilityHandler = { handle in
        let chunk = handle.availableData
        if chunk.isEmpty {
          handle.readabilityHandler = nil
          drainGroup.leave()
        } else {
          collector.append(chunk)
        }
      }
    }

    drain(stdoutPipe, into: stdoutCollector)
    drain(stderrPipe, into: stderrCollector)

    let timeoutWorkItem = DispatchWorkItem { [weak process] in
      guard let process, process.isRunning else { return }
      process.terminate()
    }

    process.terminationHandler = { process in
      timeoutWorkItem.cancel()
      DispatchQueue.global(qos: .utility).async {
        _ = drainGroup.wait(timeout: .now() + 2)
        let stdout = stdoutCollector.string()
        let stderr = stderrCollector.string()
        let output = !stdout.isEmpty ? stdout : stderr

        DispatchQueue.main.async {
          self.log(
            "CLI finished (\(process.terminationStatus)): \(arguments.joined(separator: " "))")
          completion?(process.terminationStatus == 0, output)
        }
      }
    }

    do {
      try process.run()
      DispatchQueue.global(qos: .utility).asyncAfter(
        deadline: .now() + timeout,
        execute: timeoutWorkItem
      )
    } catch {
      timeoutWorkItem.cancel()
      stdoutPipe?.fileHandleForReading.readabilityHandler = nil
      stderrPipe?.fileHandleForReading.readabilityHandler = nil
      log("CLI failed to start: \(arguments.joined(separator: " "))")
      transition = nil
      blinkVisible = true
      updateStatusButton()
      completion?(false, "")
    }
  }

  private func finishBridgeAction(success: Bool, output: String) {
    if !success {
      transition = nil
      blinkVisible = true
      log("bridge action failed: \(output.prefix(500))")
    }
    refreshState()
  }

  private func loadBrandIcon() -> NSImage? {
    let candidates = ["vector-menubar"]

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
      if let attributes = try? FileManager.default.attributesOfItem(atPath: logURL.path),
        let size = attributes[.size] as? NSNumber,
        size.intValue > 1_000_000
      {
        let rotatedURL = logURL.appendingPathExtension("previous")
        try? FileManager.default.removeItem(at: rotatedURL)
        try? FileManager.default.moveItem(at: logURL, to: rotatedURL)
      }
    }

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
    sortedProfiles.first(where: \.isDefault) ?? sortedProfiles.first(where: {
      $0.name == controller.snapshot.activeProfile
    }) ?? sortedProfiles.first
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

        StatusChip(text: controller.statusBadgeLabel())
      }

      if let statusError = controller.lastRefreshError, !statusError.isEmpty {
        Label(statusError, systemImage: "exclamationmark.triangle.fill")
          .font(.system(size: 10, weight: .medium))
          .foregroundStyle(.orange)
          .lineLimit(2)
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
                              text: (controller.issueSearchText[process.id] ?? "")
                                .trimmingCharacters(in: .whitespacesAndNewlines).count >= 2
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
                                  Button(
                                    controller.isAttaching(processId: process.id)
                                      ? "Attaching..." : "Attach"
                                  ) {
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

      // Settings row
      HStack(spacing: 12) {
        HStack(spacing: 4) {
          Text("Profile:")
            .font(.system(size: 10))
            .foregroundStyle(.tertiary)
          Menu(currentProfile?.name ?? "None") {
            ForEach(sortedProfiles) { profile in
              Button(profile.name) {
                controller.selectProfile(profile)
              }
              .disabled(profile.isDefault)
            }
          }
          .font(.system(size: 10, weight: .medium))
          .menuStyle(.borderlessButton)
          .fixedSize()
        }

        HStack(spacing: 4) {
          Text("Workspace:")
            .font(.system(size: 10))
            .foregroundStyle(.tertiary)
          Menu(currentWorkspace?.displayLabel ?? "None") {
            ForEach(sortedWorkspaces) { workspace in
              Button(workspace.displayLabel) {
                controller.selectWorkspace(workspace)
              }
              .disabled(workspace.isDefault)
            }
          }
          .font(.system(size: 10, weight: .medium))
          .menuStyle(.borderlessButton)
          .fixedSize()
        }

        Spacer(minLength: 0)

        Toggle(
          isOn: Binding(
            get: { controller.autoUpdateEnabled },
            set: { controller.autoUpdateEnabled = $0 }
          )
        ) {
          Text("Auto-update")
            .font(.system(size: 10))
            .foregroundStyle(.tertiary)
        }
        .toggleStyle(.switch)
        .controlSize(.mini)
      }

      Divider()

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

        Text(
          workspace.defaultBranch.map { "\(workspace.workspaceName) · \($0)" }
            ?? workspace.workspaceName
        )
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
      return session.agentProvider != nil && session.agentProvider != "vector_cli"
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
  case "cursor":
    return Color(red: 0.58, green: 0.42, blue: 0.96)
  case "copilot":
    return Color(red: 0.55, green: 0.65, blue: 0.95)
  case "opencode":
    return Color(red: 0.32, green: 0.76, blue: 0.55)
  case "pi":
    return Color(red: 0.85, green: 0.48, blue: 0.72)
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
  return orgLabel.isEmpty ? deviceName : "\(deviceName) · \(orgLabel)"
}

func summarizeWorkspace(
  workspaces: [DeviceWorkspaceSummary],
  workSessions: [WorkSessionSummary]
) -> String? {
  if let current = workspaces.first(where: \.isDefault) {
    return current.displayLabel
  }

  let workspaces = Array(
    Set<String>(
      workSessions.compactMap { workSession in
        let path = workSession.repoRoot ?? workSession.cwd ?? workSession.workspacePath
        guard let path else { return nil }
        return URL(fileURLWithPath: path).lastPathComponent
      })
  ).sorted()

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

func isVersion(_ candidate: String, newerThan current: String) -> Bool {
  func parse(_ value: String) -> (core: [Int], prerelease: [String])? {
    let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
      .replacingOccurrences(of: "^v", with: "", options: .regularExpression)
    let buildParts = normalized.split(separator: "+", maxSplits: 1)
    let versionParts = buildParts[0].split(separator: "-", maxSplits: 1)
    let core = versionParts[0].split(separator: ".").compactMap { Int($0) }
    guard core.count == 3 else { return nil }
    let prerelease =
      versionParts.count > 1
      ? versionParts[1].split(separator: ".").map(String.init)
      : []
    return (core, prerelease)
  }

  guard let left = parse(candidate), let right = parse(current) else {
    return false
  }
  for index in 0..<3 where left.core[index] != right.core[index] {
    return left.core[index] > right.core[index]
  }
  if left.prerelease.isEmpty != right.prerelease.isEmpty {
    return left.prerelease.isEmpty
  }
  for index in 0..<max(left.prerelease.count, right.prerelease.count) {
    guard index < left.prerelease.count else { return false }
    guard index < right.prerelease.count else { return true }
    let leftPart = left.prerelease[index]
    let rightPart = right.prerelease[index]
    if leftPart == rightPart { continue }
    if let leftNumber = Int(leftPart), let rightNumber = Int(rightPart) {
      return leftNumber > rightNumber
    }
    if Int(leftPart) != nil { return false }
    if Int(rightPart) != nil { return true }
    return leftPart.localizedStandardCompare(rightPart) == .orderedDescending
  }
  return false
}

let environment = ProcessInfo.processInfo.environment
let homeDir = FileManager.default.homeDirectoryForCurrentUser
let configDir = URL(
  fileURLWithPath: environment["VECTOR_HOME"] ?? homeDir.appendingPathComponent(".vector").path)
let cliCommand = environment["VECTOR_CLI_COMMAND"] ?? "/usr/bin/env"
let cliArgs: [String]
if let rawArgs = environment["VECTOR_CLI_ARGS_JSON"], let data = rawArgs.data(using: .utf8) {
  cliArgs = (try? JSONDecoder().decode([String].self, from: data)) ?? []
} else {
  cliArgs = cliCommand == "/usr/bin/env" ? ["vcli"] : []
}

let app = NSApplication.shared
let delegate = MenuBarController(configDir: configDir, cliCommand: cliCommand, cliArgs: cliArgs)
app.delegate = delegate
app.run()
