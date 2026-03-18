import AppKit
import Foundation

struct BridgeConfig: Decodable {
  let deviceId: String
  let displayName: String
  let userId: String
}

struct LiveActivity: Decodable {
  let _id: String
  let issueKey: String
  let issueTitle: String
  let provider: String
  let title: String?
  let latestSummary: String?
  let cwd: String?
  let repoRoot: String?
  let branch: String?
}

struct SessionFile: Decodable {
  let activeOrgSlug: String?
  let appUrl: String?
  let cookies: [String: String]?
}

struct SessionInfo {
  let orgSlug: String
  let appUrl: String?
  let appDomain: String?
  let email: String?
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

final class MenuBarController: NSObject, NSApplicationDelegate {
  private let configDir: URL
  private let cliCommand: String
  private let cliArgs: [String]
  private let logURL: URL

  private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
  private var refreshTimer: Timer?
  private var blinkTimer: Timer?
  private var transition: BridgeTransition?
  private var transitionDeadline = Date.distantPast
  private var blinkVisible = true
  private lazy var brandIcon = loadBrandIcon()

  init(configDir: URL, cliCommand: String, cliArgs: [String]) {
    self.configDir = configDir
    self.cliCommand = cliCommand
    self.cliArgs = cliArgs
    self.logURL = configDir.appendingPathComponent("menubar.log")
    super.init()
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.accessory)
    log("menu bar launched")
    refreshMenu()

    refreshTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
      self?.refreshMenu()
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

  private func refreshMenu() {
    if transition != nil && Date() > transitionDeadline {
      transition = nil
      blinkVisible = true
    }

    let state = loadState()
    if transition == .stopping && !state.running {
      transition = nil
      blinkVisible = true
    }
    if (transition == .starting || transition == .restarting) && state.running {
      transition = nil
      blinkVisible = true
    }

    updateStatusButton()
    statusItem.menu = buildMenu(state: state)
  }

  private func updateStatusButton() {
    guard let button = statusItem.button else { return }
    if transition != nil && !blinkVisible {
      button.image = nil
      button.title = " "
      return
    }

    button.title = ""
    button.image = brandIcon ?? fallbackStatusIcon()
    button.image?.isTemplate = false
  }

  private func buildMenu(state: BridgeState) -> NSMenu {
    let menu = NSMenu()

    let statusTitle: String
    if let transition {
      statusTitle = "Vector Bridge — \(transition.label)"
    } else if state.running, let pid = state.pid {
      statusTitle = "Vector Bridge — Running (PID \(pid))"
    } else if state.config != nil {
      statusTitle = "Vector Bridge — Offline"
    } else {
      statusTitle = "Vector Bridge — Not Configured"
    }

    let headerItem = NSMenuItem(title: statusTitle, action: nil, keyEquivalent: "")
    headerItem.isEnabled = false
    menu.addItem(headerItem)

    if let config = state.config {
      let metadataLine = buildMetadataLine(config: config, sessionInfo: state.sessionInfo, activities: state.activities)
      if !metadataLine.isEmpty {
        let metadataItem = NSMenuItem(title: "  \(metadataLine)", action: nil, keyEquivalent: "")
        metadataItem.isEnabled = false
        menu.addItem(metadataItem)
      }
    } else {
      let setupItem = NSMenuItem(title: "  Run: vcli service start", action: nil, keyEquivalent: "")
      setupItem.isEnabled = false
      menu.addItem(setupItem)
    }

    if !state.activities.isEmpty {
      menu.addItem(.separator())

      let sessionsHeader = NSMenuItem(title: "Active Sessions", action: nil, keyEquivalent: "")
      sessionsHeader.isEnabled = false
      menu.addItem(sessionsHeader)

      for activity in state.activities {
        let item = NSMenuItem(title: buildActivityLabel(activity), action: #selector(openIssue(_:)), keyEquivalent: "")
        item.target = self
        item.representedObject = buildIssueUrl(sessionInfo: state.sessionInfo, issueKey: activity.issueKey)
        item.toolTip = buildActivityTooltip(activity)
        menu.addItem(item)
      }
    }

    menu.addItem(.separator())

    if transition != nil {
      let transitionItem = NSMenuItem(title: transition!.label, action: nil, keyEquivalent: "")
      transitionItem.isEnabled = false
      menu.addItem(transitionItem)
    } else if state.running {
      menu.addItem(makeActionItem(title: "Stop Bridge", action: #selector(stopBridgeAction)))
      menu.addItem(makeActionItem(title: "Restart Bridge", action: #selector(restartBridgeAction)))
    } else if state.config != nil {
      menu.addItem(makeActionItem(title: "Start Bridge", action: #selector(startBridgeAction)))
    }

    menu.addItem(.separator())
    menu.addItem(makeActionItem(title: "Open Vector", action: #selector(openVector)))
    menu.addItem(makeActionItem(title: "Quit Vector", action: #selector(quitVector)))

    return menu
  }

  private func makeActionItem(title: String, action: Selector) -> NSMenuItem {
    let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
    item.target = self
    return item
  }

  @objc private func openIssue(_ sender: NSMenuItem) {
    guard
      let raw = sender.representedObject as? String,
      let url = URL(string: raw)
    else {
      return
    }
    NSWorkspace.shared.open(url)
  }

  @objc private func openVector() {
    let state = loadState()
    guard
      let appUrl = state.sessionInfo.appUrl,
      let url = URL(string: appUrl)
    else {
      return
    }
    NSWorkspace.shared.open(url)
  }

  @objc private func stopBridgeAction() {
    log("stop bridge clicked")
    transition = .stopping
    transitionDeadline = Date().addingTimeInterval(15)
    blinkVisible = true
    refreshMenu()
    runCLI(arguments: ["service", "stop"])
  }

  @objc private func startBridgeAction() {
    log("start bridge clicked")
    transition = .starting
    transitionDeadline = Date().addingTimeInterval(15)
    blinkVisible = true
    refreshMenu()
    runCLI(arguments: ["service", "start"])
  }

  @objc private func restartBridgeAction() {
    log("restart bridge clicked")
    transition = .restarting
    transitionDeadline = Date().addingTimeInterval(15)
    blinkVisible = true
    refreshMenu()
    runCLI(arguments: ["service", "stop"]) { [weak self] success in
      guard let self else { return }
      guard success else {
        self.transition = nil
        self.refreshMenu()
        return
      }
      self.transition = .starting
      self.transitionDeadline = Date().addingTimeInterval(15)
      self.runCLI(arguments: ["service", "start"])
    }
  }

  @objc private func quitVector() {
    log("quit vector clicked")
    runCLI(arguments: ["service", "stop"]) { _ in
      DispatchQueue.main.async {
        NSApp.terminate(nil)
      }
    }
  }

  private func runCLI(arguments: [String], completion: ((Bool) -> Void)? = nil) {
    log("running CLI: \(arguments.joined(separator: " "))")
    let process = Process()
    process.executableURL = URL(fileURLWithPath: cliCommand)
    process.arguments = cliArgs + arguments
    process.environment = ProcessInfo.processInfo.environment
    process.standardOutput = nil
    process.standardError = nil
    process.terminationHandler = { process in
      DispatchQueue.main.async {
        self.log("CLI finished (\(process.terminationStatus)): \(arguments.joined(separator: " "))")
        completion?(process.terminationStatus == 0)
        self.refreshMenu()
      }
    }

    do {
      try process.run()
    } catch {
      log("CLI failed to start: \(arguments.joined(separator: " "))")
      transition = nil
      refreshMenu()
      completion?(false)
    }
  }

  private func loadState() -> BridgeState {
    let config = decodeJSON(BridgeConfig.self, from: configDir.appendingPathComponent("bridge.json"))
    let pidPath = configDir.appendingPathComponent("bridge.pid")
    let runningPid = readRunningPID(from: pidPath)

    let activities = decodeJSON([LiveActivity].self, from: configDir.appendingPathComponent("live-activities.json")) ?? []
    let sessionInfo = loadSessionInfo(config: config)

    return BridgeState(
      config: config,
      pid: runningPid,
      running: runningPid != nil,
      activities: activities,
      sessionInfo: sessionInfo
    )
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
    } else if loadState().running {
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

  private func loadSessionInfo(config: BridgeConfig?) -> SessionInfo {
    let sessions = listSessionFiles()
    let matchingSession = sessions.first { session in
      guard let config else { return false }
      return decodeJWTClaims(session.cookies).userId == config.userId
    } ?? sessions.first

    guard let session = matchingSession else {
      return SessionInfo(orgSlug: "oss-lab", appUrl: nil, appDomain: nil, email: nil)
    }

    let claims = decodeJWTClaims(session.cookies)
    return SessionInfo(
      orgSlug: session.activeOrgSlug ?? "oss-lab",
      appUrl: session.appUrl,
      appDomain: host(for: session.appUrl),
      email: claims.email
    )
  }

  private func listSessionFiles() -> [SessionFile] {
    guard let entries = try? FileManager.default.contentsOfDirectory(at: configDir, includingPropertiesForKeys: nil) else {
      return []
    }

    return entries
      .filter { $0.lastPathComponent.hasPrefix("cli-") && $0.pathExtension == "json" }
      .sorted { $0.lastPathComponent < $1.lastPathComponent }
      .compactMap { decodeJSON(SessionFile.self, from: $0) }
  }
}

struct BridgeState {
  let config: BridgeConfig?
  let pid: Int32?
  let running: Bool
  let activities: [LiveActivity]
  let sessionInfo: SessionInfo
}

func decodeJSON<T: Decodable>(_ type: T.Type, from url: URL) -> T? {
  guard let data = try? Data(contentsOf: url) else {
    return nil
  }
  return try? JSONDecoder().decode(T.self, from: data)
}

func readRunningPID(from url: URL) -> Int32? {
  guard
    let raw = try? String(contentsOf: url, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines),
    let pid = Int32(raw),
    kill(pid, 0) == 0
  else {
    return nil
  }
  return pid
}

func decodeJWTClaims(_ cookies: [String: String]?) -> (email: String?, userId: String?) {
  guard
    let jwt = cookies?["__Secure-better-auth.convex_jwt"]
  else {
    return (nil, nil)
  }

  let parts = jwt.split(separator: ".")
  guard parts.count > 1 else {
    return (nil, nil)
  }

  var payload = String(parts[1])
    .replacingOccurrences(of: "-", with: "+")
    .replacingOccurrences(of: "_", with: "/")
  while payload.count % 4 != 0 {
    payload.append("=")
  }

  guard
    let data = Data(base64Encoded: payload),
    let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
  else {
    return (nil, nil)
  }

  return (object["email"] as? String, (object["sub"] as? String) ?? (object["userId"] as? String))
}

func buildMetadataLine(config: BridgeConfig, sessionInfo: SessionInfo, activities: [LiveActivity]) -> String {
  let userLabel = sessionInfo.email?.split(separator: "@").first.map(String.init)
  let workspaceLabel = summarizeWorkspace(activities)
  let orgLabel = sessionInfo.appDomain.map { "\(sessionInfo.orgSlug) @ \($0)" } ?? sessionInfo.orgSlug
  return [userLabel, config.displayName, workspaceLabel, orgLabel]
    .compactMap { $0 }
    .joined(separator: " | ")
}

func summarizeWorkspace(_ activities: [LiveActivity]) -> String? {
  let workspaces = Array(Set<String>(activities.compactMap { activity in
    let path = activity.repoRoot ?? activity.cwd
    guard let path else { return nil }
    return URL(fileURLWithPath: path).lastPathComponent
  }))

  guard !workspaces.isEmpty else { return nil }
  if workspaces.count == 1 {
    return workspaces[0]
  }
  return "\(workspaces.count) workspaces"
}

func buildActivityLabel(_ activity: LiveActivity) -> String {
  let workspaceSource = activity.repoRoot ?? activity.cwd ?? activity.title ?? activity.issueTitle
  let workspace = URL(fileURLWithPath: workspaceSource).lastPathComponent
  let provider = activity.provider == "claude_code" ? "Claude" : activity.provider == "codex" ? "Codex" : activity.provider
  let parts = [provider, workspace, activity.branch].compactMap { $0 }.joined(separator: " · ")
  return "\(activity.issueKey) — \(parts)"
}

func buildActivityTooltip(_ activity: LiveActivity) -> String {
  [activity.title ?? activity.issueTitle, activity.latestSummary]
    .compactMap { $0 }
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

func host(for appUrl: String?) -> String? {
  guard
    let appUrl,
    let url = URL(string: appUrl)
  else {
    return nil
  }
  return url.host.map { host in
    if let port = url.port {
      return "\(host):\(port)"
    }
    return host
  }
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
