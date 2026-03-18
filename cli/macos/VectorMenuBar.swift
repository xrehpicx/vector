import AppKit
import Foundation

// ── Config ──────────────────────────────────────────────────────────────────

let executablePath = CommandLine.arguments[0]
let executableDir = (executablePath as NSString).deletingLastPathComponent
let assetsDir = executableDir + "/assets"
let configDir = NSHomeDirectory() + "/.vector"
let bridgeConfigPath = configDir + "/bridge.json"
let pidFilePath = configDir + "/bridge.pid"
let logFilePath = configDir + "/bridge.log"
let liveActivitiesPath = configDir + "/live-activities.json"

struct BridgeConfig: Codable {
    let deviceId: String
    let deviceKey: String
    let displayName: String
    let userId: String
    let convexUrl: String
    let registeredAt: String
}

struct LiveActivity: Codable {
    let _id: String
    let issueId: String
    let issueKey: String
    let issueTitle: String
    let provider: String
    let title: String?
    let status: String
    let latestSummary: String?
    let startedAt: Double
    let lastEventAt: Double
}

// ── State ───────────────────────────────────────────────────────────────────

func loadConfig() -> BridgeConfig? {
    guard let data = try? Data(contentsOf: URL(fileURLWithPath: bridgeConfigPath)),
          let config = try? JSONDecoder().decode(BridgeConfig.self, from: data)
    else { return nil }
    return config
}

func loadLiveActivities() -> [LiveActivity] {
    guard let data = try? Data(contentsOf: URL(fileURLWithPath: liveActivitiesPath)),
          let activities = try? JSONDecoder().decode([LiveActivity].self, from: data)
    else { return [] }
    return activities
}

func isBridgeRunning() -> (running: Bool, pid: Int?) {
    guard let pidStr = try? String(contentsOfFile: pidFilePath, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines),
          let pid = Int(pidStr)
    else { return (false, nil) }
    let result = kill(Int32(pid), 0)
    return (result == 0, pid)
}

func providerLabel(_ provider: String) -> String {
    switch provider {
    case "claude_code": return "Claude"
    case "codex": return "Codex"
    default: return provider
    }
}

func statusEmoji(_ status: String) -> String {
    switch status {
    case "active": return "🟢"
    case "waiting_for_input": return "🟡"
    case "paused": return "⏸"
    case "completed": return "✅"
    case "failed": return "❌"
    case "disconnected": return "⚪"
    default: return "⚪"
    }
}

func appBaseUrl() -> String {
    // Default to localhost for dev
    return "http://localhost:3000"
}

func orgSlug() -> String {
    // Try to read from CLI session
    let sessionPath = NSHomeDirectory() + "/.vector/cli-default.json"
    if let data = try? Data(contentsOf: URL(fileURLWithPath: sessionPath)),
       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
       let slug = json["activeOrgSlug"] as? String {
        return slug
    }
    return "oss-lab"
}

// ── Menu Bar App ────────────────────────────────────────────────────────────

class VectorMenuBarApp: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var refreshTimer: Timer?
    var cachedActivities: [LiveActivity] = []

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        refreshMenu()

        refreshTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            self?.refreshMenu()
        }
    }

    func refreshMenu() {
        let (running, pid) = isBridgeRunning()
        let config = loadConfig()
        cachedActivities = loadLiveActivities()

        // Icon — use Vector brand mark
        if let button = statusItem.button {
            // Try @2x first for retina, fallback to 1x
            let iconPath2x = assetsDir + "/vector-menubar@2x.png"
            let iconPath1x = assetsDir + "/vector-menubar.png"

            if let img = NSImage(contentsOfFile: iconPath2x) ?? NSImage(contentsOfFile: iconPath1x) {
                img.size = NSSize(width: 18, height: 18)
                img.isTemplate = true
                button.image = img
            } else {
                // Fallback to system symbol if brand icon not found
                button.image = NSImage(systemSymbolName: "antenna.radiowaves.left.and.right", accessibilityDescription: "Vector")
                button.image?.isTemplate = true
            }

            // Dim icon when offline
            button.appearsDisabled = !running && config != nil

            // Show activity count
            if !cachedActivities.isEmpty {
                button.title = " \(cachedActivities.count)"
            } else {
                button.title = ""
            }
        }

        // Build menu
        let menu = NSMenu()

        // ── Status header ──
        if running, let config = config {
            let headerItem = NSMenuItem(title: "Vector Bridge — Running", action: nil, keyEquivalent: "")
            headerItem.isEnabled = false
            menu.addItem(headerItem)

            let deviceItem = NSMenuItem(title: "  \(config.displayName)  (PID \(pid ?? 0))", action: nil, keyEquivalent: "")
            deviceItem.isEnabled = false
            menu.addItem(deviceItem)
        } else if config != nil {
            let headerItem = NSMenuItem(title: "Vector Bridge — Offline", action: nil, keyEquivalent: "")
            headerItem.isEnabled = false
            menu.addItem(headerItem)
        } else {
            let headerItem = NSMenuItem(title: "Vector Bridge — Not Configured", action: nil, keyEquivalent: "")
            headerItem.isEnabled = false
            menu.addItem(headerItem)
            let helpItem = NSMenuItem(title: "  Run: vcli service start", action: nil, keyEquivalent: "")
            helpItem.isEnabled = false
            menu.addItem(helpItem)
        }

        // ── Live Activities ──
        if !cachedActivities.isEmpty {
            menu.addItem(NSMenuItem.separator())

            let activitiesHeader = NSMenuItem(title: "Active Sessions", action: nil, keyEquivalent: "")
            activitiesHeader.isEnabled = false
            menu.addItem(activitiesHeader)

            for activity in cachedActivities {
                let label = providerLabel(activity.provider)
                let emoji = statusEmoji(activity.status)
                let title = activity.title ?? activity.issueTitle
                let menuTitle = "\(emoji)  \(activity.issueKey) — \(title)  (\(label))"

                let item = NSMenuItem(title: menuTitle, action: #selector(openIssue(_:)), keyEquivalent: "")
                item.target = self
                item.representedObject = activity.issueKey
                item.toolTip = activity.latestSummary ?? activity.issueTitle
                menu.addItem(item)
            }
        }

        // ── Controls ──
        menu.addItem(NSMenuItem.separator())

        if running {
            let stopItem = NSMenuItem(title: "Stop Bridge", action: #selector(stopBridge), keyEquivalent: "")
            stopItem.target = self
            menu.addItem(stopItem)

            let restartItem = NSMenuItem(title: "Restart Bridge", action: #selector(restartBridge), keyEquivalent: "")
            restartItem.target = self
            menu.addItem(restartItem)
        } else if config != nil {
            let startItem = NSMenuItem(title: "Start Bridge", action: #selector(startBridge), keyEquivalent: "")
            startItem.target = self
            menu.addItem(startItem)
        }

        menu.addItem(NSMenuItem.separator())

        let openItem = NSMenuItem(title: "Open Vector", action: #selector(openVector), keyEquivalent: "o")
        openItem.target = self
        menu.addItem(openItem)

        let logsItem = NSMenuItem(title: "View Logs", action: #selector(viewLogs), keyEquivalent: "l")
        logsItem.target = self
        menu.addItem(logsItem)

        menu.addItem(NSMenuItem.separator())

        let quitItem = NSMenuItem(title: "Quit Menu Bar", action: #selector(quitApp), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        statusItem.menu = menu
    }

    // ── Actions ──

    @objc func openIssue(_ sender: NSMenuItem) {
        guard let issueKey = sender.representedObject as? String else { return }
        let slug = orgSlug()
        let urlStr = "\(appBaseUrl())/\(slug)/issues/\(issueKey)"
        if let url = URL(string: urlStr) {
            NSWorkspace.shared.open(url)
        }
    }

    @objc func startBridge() {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/bin/bash")
        task.arguments = ["-c", "vcli service start &"]
        try? task.run()
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            self?.refreshMenu()
        }
    }

    @objc func stopBridge() {
        let (_, pid) = isBridgeRunning()
        if let pid = pid {
            kill(Int32(pid), SIGTERM)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
            self?.refreshMenu()
        }
    }

    @objc func restartBridge() {
        stopBridge()
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            self?.startBridge()
        }
    }

    @objc func openVector() {
        if let url = URL(string: appBaseUrl()) {
            NSWorkspace.shared.open(url)
        }
    }

    @objc func viewLogs() {
        if FileManager.default.fileExists(atPath: logFilePath) {
            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/usr/bin/open")
            task.arguments = ["-a", "Console", logFilePath]
            try? task.run()
        }
    }

    @objc func quitApp() {
        NSApplication.shared.terminate(nil)
    }
}

// ── Main ────────────────────────────────────────────────────────────────────

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = VectorMenuBarApp()
app.delegate = delegate
app.run()
