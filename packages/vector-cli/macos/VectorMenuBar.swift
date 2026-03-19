import AppKit
import Foundation
import SwiftUI

struct BridgeConfig: Decodable {
  let deviceId: String
  let displayName: String
  let userId: String
}

struct LiveActivity: Decodable, Identifiable {
  let _id: String
  let issueKey: String
  let issueTitle: String
  let provider: String
  let title: String?
  let latestSummary: String?
  let cwd: String?
  let repoRoot: String?
  let branch: String?

  var id: String { _id }
}

struct SessionInfo: Decodable {
  let orgSlug: String
  let appUrl: String?
  let appDomain: String?
  let email: String?
  let userId: String?
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

  var attachTitle: String? {
    title ?? cwd ?? repoRoot
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
  let liveActivities: [LiveActivity]
  let processes: [AttachableProcess]

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
    liveActivities: [],
    processes: []
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
    if let transition {
      return "Vector Bridge — \(transition.label)"
    }
    if snapshot.running, let pid = snapshot.pid {
      return "Vector Bridge — Running (PID \(pid))"
    }
    if snapshot.starting {
      return "Vector Bridge — Starting..."
    }
    if snapshot.configured {
      return "Vector Bridge — Offline"
    }
    return "Vector Bridge — Not Configured"
  }

  func metadataLine() -> String {
    guard let config = snapshot.config else {
      return "Run vcli service start to configure this device"
    }
    return buildMetadataLine(
      config: config,
      sessionInfo: snapshot.sessionInfo,
      activities: snapshot.liveActivities
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

  func results(for processId: String) -> [IssueSearchResult] {
    issueResults[processId] ?? []
  }

  func openIssue(_ activity: LiveActivity) {
    guard
      let raw = buildIssueUrl(sessionInfo: snapshot.sessionInfo, issueKey: activity.issueKey),
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
    button.image = brandIcon ?? fallbackStatusIcon()
    button.image?.isTemplate = false
    button.alphaValue = transition != nil && !blinkVisible ? 0.35 : 1.0
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
  @State private var liveActivitiesExpanded = true
  @State private var processesExpanded = true
  @State private var expandedProcessIds: Set<String> = []

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        Text(controller.statusTitle())
          .font(.system(size: 15, weight: .semibold))
        Text(controller.metadataLine())
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }

      Divider()

      ScrollView {
        VStack(alignment: .leading, spacing: 12) {
          DisclosureGroup(isExpanded: $liveActivitiesExpanded) {
            VStack(alignment: .leading, spacing: 8) {
              if controller.snapshot.liveActivities.isEmpty {
                EmptySectionLabel(text: "No live activities on this device.")
              } else {
                ForEach(controller.snapshot.liveActivities) { activity in
                  Button(action: { controller.openIssue(activity) }) {
                    HStack(alignment: .top, spacing: 10) {
                      Circle()
                        .fill(providerColor(activity.provider))
                        .frame(width: 8, height: 8)
                        .padding(.top, 6)
                      VStack(alignment: .leading, spacing: 3) {
                        Text("\(activity.issueKey) — \(activity.issueTitle)")
                          .font(.system(size: 12, weight: .semibold))
                          .foregroundStyle(.primary)
                          .lineLimit(2)
                        Text(activityMeta(activity))
                          .font(.system(size: 11))
                          .foregroundStyle(.secondary)
                          .lineLimit(1)
                        if let latestSummary = activity.latestSummary, !latestSummary.isEmpty {
                          Text(latestSummary)
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                        }
                      }
                      Spacer(minLength: 0)
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Color(NSColor.controlBackgroundColor)))
                  }
                  .buttonStyle(.plain)
                  .help(buildActivityTooltip(activity))
                }
              }
            }
            .padding(.top, 8)
          } label: {
            SectionLabel(title: "Live Activities", count: controller.snapshot.liveActivities.count)
          }

          DisclosureGroup(isExpanded: $processesExpanded) {
            VStack(alignment: .leading, spacing: 8) {
              if controller.snapshot.processes.isEmpty {
                EmptySectionLabel(text: "No attachable Codex or Claude sessions detected.")
              } else {
                ForEach(controller.snapshot.processes) { process in
                  let binding = Binding(
                    get: { expandedProcessIds.contains(process.id) },
                    set: { isExpanded in
                      if isExpanded {
                        expandedProcessIds.insert(process.id)
                      } else {
                        expandedProcessIds.remove(process.id)
                      }
                    }
                  )

                  DisclosureGroup(isExpanded: binding) {
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
                    .padding(.top, 8)
                  } label: {
                    ProcessRow(process: process)
                  }
                  .padding(10)
                  .background(RoundedRectangle(cornerRadius: 10).fill(Color(NSColor.controlBackgroundColor)))
                }
              }
            }
            .padding(.top, 8)
          } label: {
            SectionLabel(title: "Detected Sessions", count: controller.snapshot.processes.count)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .frame(maxHeight: 360)

      Divider()

      HStack(spacing: 8) {
        if let transition = controller.transition {
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

struct SectionLabel: View {
  let title: String
  let count: Int

  var body: some View {
    HStack(spacing: 8) {
      Text(title)
        .font(.system(size: 12, weight: .semibold))
      Text("\(count)")
        .font(.system(size: 10, weight: .semibold))
        .foregroundStyle(.secondary)
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(Capsule().fill(Color(NSColor.quaternaryLabelColor).opacity(0.15)))
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

struct ProcessRow: View {
  let process: AttachableProcess

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      Circle()
        .fill(providerColor(process.provider))
        .frame(width: 8, height: 8)
        .padding(.top, 6)
      VStack(alignment: .leading, spacing: 3) {
        HStack(spacing: 6) {
          Text(process.resolvedProviderLabel)
            .font(.system(size: 12, weight: .semibold))
          Text(process.workspaceLabel)
            .font(.system(size: 11))
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        Text(processMeta(process))
          .font(.system(size: 11))
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

func providerColor(_ provider: String) -> Color {
  switch provider {
  case "claude_code":
    return Color(red: 0.95, green: 0.55, blue: 0.28)
  case "codex":
    return Color(red: 0.22, green: 0.62, blue: 0.96)
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
  [process.repoRoot ?? process.cwd, process.branch, process.mode]
    .compactMap { value in
      guard let value, !value.isEmpty else { return nil }
      if value.contains("/") {
        return URL(fileURLWithPath: value).lastPathComponent
      }
      return value
    }
    .joined(separator: " · ")
}

func activityMeta(_ activity: LiveActivity) -> String {
  let provider = activity.provider == "claude_code"
    ? "Claude"
    : activity.provider == "codex"
      ? "Codex"
      : activity.provider
  let workspaceSource = activity.repoRoot ?? activity.cwd ?? activity.title ?? activity.issueTitle
  let workspace = workspaceSource.contains("/")
    ? URL(fileURLWithPath: workspaceSource).lastPathComponent
    : workspaceSource
  return [provider, workspace, activity.branch].compactMap { $0 }.joined(separator: " · ")
}

func buildMetadataLine(config: BridgeConfig, sessionInfo: SessionInfo, activities: [LiveActivity]) -> String {
  let userLabel = sessionInfo.email?.split(separator: "@").first.map(String.init)
  let workspaceLabel = summarizeWorkspace(activities)
  let orgLabel = sessionInfo.appDomain.map { "\(sessionInfo.orgSlug) @ \($0)" } ?? sessionInfo.orgSlug
  return [userLabel, config.displayName, workspaceLabel, orgLabel]
    .compactMap { value in
      guard let value, !value.isEmpty else { return nil }
      return value
    }
    .joined(separator: " | ")
}

func summarizeWorkspace(_ activities: [LiveActivity]) -> String? {
  let workspaces = Array(Set<String>(activities.compactMap { activity in
    let path = activity.repoRoot ?? activity.cwd
    guard let path else { return nil }
    return URL(fileURLWithPath: path).lastPathComponent
  })).sorted()

  guard !workspaces.isEmpty else { return nil }
  if workspaces.count == 1 {
    return workspaces[0]
  }
  return "\(workspaces.count) workspaces"
}

func buildActivityTooltip(_ activity: LiveActivity) -> String {
  [activity.title ?? activity.issueTitle, activity.latestSummary]
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
