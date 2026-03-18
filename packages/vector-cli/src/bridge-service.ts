/**
 * Vector Bridge Service — runs as a foreground process or installed as a system service.
 *
 * Called by:
 *   vcli service start     — runs the bridge loop in the foreground
 *   vcli start             — installs + starts via LaunchAgent (macOS) or systemd (Linux)
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { execSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from 'fs';
import { homedir, hostname, platform } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

// ── Config ──────────────────────────────────────────────────────────────────

const CONFIG_DIR = join(homedir(), '.vector');
const BRIDGE_CONFIG_FILE = join(CONFIG_DIR, 'bridge.json');
const PID_FILE = join(CONFIG_DIR, 'bridge.pid');
const LIVE_ACTIVITIES_CACHE = join(CONFIG_DIR, 'live-activities.json');
const LAUNCHAGENT_DIR = join(homedir(), 'Library', 'LaunchAgents');
const LAUNCHAGENT_PLIST = join(LAUNCHAGENT_DIR, 'com.vector.bridge.plist');
const LAUNCHAGENT_LABEL = 'com.vector.bridge';

const HEARTBEAT_INTERVAL_MS = 30_000;
const COMMAND_POLL_INTERVAL_MS = 5_000;
const PROCESS_DISCOVERY_INTERVAL_MS = 60_000;

export interface BridgeConfig {
  deviceId: string;
  deviceKey: string;
  deviceSecret: string;
  userId: string;
  displayName: string;
  convexUrl: string;
  registeredAt: string;
}

// ── Config persistence ──────────────────────────────────────────────────────

export function loadBridgeConfig(): BridgeConfig | null {
  if (!existsSync(BRIDGE_CONFIG_FILE)) return null;
  try {
    return JSON.parse(readFileSync(BRIDGE_CONFIG_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveBridgeConfig(config: BridgeConfig): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(BRIDGE_CONFIG_FILE, JSON.stringify(config, null, 2));
}

// ── Process Discovery ───────────────────────────────────────────────────────

interface DiscoveredProcess {
  provider: 'claude_code' | 'codex';
  providerLabel: string;
  localProcessId: string;
  sessionKey: string;
  cwd?: string;
  repoRoot?: string;
  branch?: string;
  mode: 'observed';
  status: 'observed';
  supportsInboundMessages: false;
}

function discoverLocalProcesses(): DiscoveredProcess[] {
  const processes: DiscoveredProcess[] = [];

  const patterns: Array<{
    grep: string;
    provider: 'claude_code' | 'codex';
    label: string;
    prefix: string;
  }> = [
    {
      grep: '[c]laude',
      provider: 'claude_code',
      label: 'Claude',
      prefix: 'claude',
    },
    { grep: '[c]odex', provider: 'codex', label: 'Codex', prefix: 'codex' },
  ];

  for (const { grep, provider, label, prefix } of patterns) {
    try {
      const ps = execSync(
        `ps aux | grep -E '${grep}' | grep -v vector-bridge | grep -v grep`,
        { encoding: 'utf-8', timeout: 5000 },
      );
      for (const line of ps.trim().split('\n').filter(Boolean)) {
        const pid = line.split(/\s+/)[1];
        if (!pid) continue;

        let cwd: string | undefined;
        try {
          cwd =
            execSync(
              `lsof -p ${pid} 2>/dev/null | grep cwd | awk '{print $NF}'`,
              { encoding: 'utf-8', timeout: 3000 },
            ).trim() || undefined;
        } catch {
          /* skip */
        }

        const gitInfo = cwd ? getGitInfo(cwd) : {};
        processes.push({
          provider,
          providerLabel: label,
          localProcessId: pid,
          sessionKey: `${prefix}-${pid}`,
          cwd,
          ...gitInfo,
          mode: 'observed',
          status: 'observed',
          supportsInboundMessages: false,
        });
      }
    } catch {
      /* no processes */
    }
  }

  return processes;
}

function getGitInfo(cwd: string): { repoRoot?: string; branch?: string } {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf-8',
      cwd,
      timeout: 3000,
    }).trim();
    const repoRoot = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      cwd,
      timeout: 3000,
    }).trim();
    return { branch, repoRoot };
  } catch {
    return {};
  }
}

// ── Reply generation (placeholder until real agent integration) ─────────────

function generateReply(userMessage: string): string {
  const lower = userMessage.toLowerCase().trim();
  if (['hey', 'hi', 'hello'].includes(lower)) {
    return "Hey! I'm running on your local machine via the Vector bridge. What would you like me to work on?";
  }
  if (lower.includes('status') || lower.includes('progress')) {
    return "I'm making good progress. Currently reviewing the changes and running tests.";
  }
  if (lower.includes('stop') || lower.includes('cancel')) {
    return 'Understood — wrapping up the current step.';
  }
  return `Got it — "${userMessage}". I'll incorporate that into my current work.`;
}

// ── Bridge Service Class ────────────────────────────────────────────────────

export class BridgeService {
  private client: ConvexHttpClient;
  private config: BridgeConfig;
  private timers: ReturnType<typeof setInterval>[] = [];

  constructor(config: BridgeConfig) {
    this.config = config;
    this.client = new ConvexHttpClient(config.convexUrl);
  }

  async heartbeat(): Promise<void> {
    await this.client.mutation(api.agentBridge.bridgePublic.heartbeat, {
      deviceId: this.config.deviceId as Id<'agentDevices'>,
      deviceSecret: this.config.deviceSecret,
    });
  }

  async pollCommands(): Promise<void> {
    const commands = await this.client.query(
      api.agentBridge.bridgePublic.getPendingCommands,
      {
        deviceId: this.config.deviceId as Id<'agentDevices'>,
        deviceSecret: this.config.deviceSecret,
      },
    );

    if (commands.length > 0) {
      console.log(`[${ts()}] ${commands.length} pending command(s)`);
    }

    for (const cmd of commands) {
      await this.handleCommand(cmd);
    }
  }

  private async handleCommand(cmd: {
    _id: Id<'agentCommands'>;
    kind: string;
    payload?: unknown;
    liveActivityId?: Id<'issueLiveActivities'>;
  }): Promise<void> {
    console.log(`  ${cmd.kind}: ${cmd._id}`);

    if (cmd.kind === 'message' && cmd.liveActivityId) {
      const payload = cmd.payload as { body?: string } | undefined;
      const body = payload?.body ?? '';
      console.log(`  > "${body}"`);

      const reply = generateReply(body);
      await this.client.mutation(
        api.agentBridge.bridgePublic.postAgentMessage,
        {
          deviceId: this.config.deviceId as Id<'agentDevices'>,
          deviceSecret: this.config.deviceSecret,
          liveActivityId: cmd.liveActivityId,
          role: 'assistant',
          body: reply,
        },
      );
      console.log(`  < "${reply.slice(0, 60)}..."`);
    }

    await this.client.mutation(api.agentBridge.bridgePublic.completeCommand, {
      deviceId: this.config.deviceId as Id<'agentDevices'>,
      deviceSecret: this.config.deviceSecret,
      commandId: cmd._id,
      status: 'delivered',
    });
  }

  async reportProcesses(): Promise<void> {
    const processes = discoverLocalProcesses();
    for (const proc of processes) {
      try {
        await this.client.mutation(api.agentBridge.bridgePublic.reportProcess, {
          deviceId: this.config.deviceId as Id<'agentDevices'>,
          deviceSecret: this.config.deviceSecret,
          ...proc,
        });
      } catch {
        /* skip individual failures */
      }
    }
    if (processes.length > 0) {
      console.log(`[${ts()}] Discovered ${processes.length} local process(es)`);
    }
  }

  async refreshLiveActivities(): Promise<void> {
    try {
      const activities = await this.client.query(
        api.agentBridge.bridgePublic.getDeviceLiveActivities,
        {
          deviceId: this.config.deviceId as Id<'agentDevices'>,
          deviceSecret: this.config.deviceSecret,
        },
      );
      // Write cache for the menu bar app to read
      writeFileSync(LIVE_ACTIVITIES_CACHE, JSON.stringify(activities, null, 2));
    } catch {
      /* non-critical */
    }
  }

  async run(): Promise<void> {
    console.log('Vector Bridge Service');
    console.log(
      `  Device:  ${this.config.displayName} (${this.config.deviceId})`,
    );
    console.log(`  Convex:  ${this.config.convexUrl}`);
    console.log(`  PID:     ${process.pid}`);
    console.log('');

    // Write PID
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(PID_FILE, String(process.pid));

    // Initial sync
    await this.heartbeat();
    await this.reportProcesses();
    await this.refreshLiveActivities();
    console.log(`[${ts()}] Service running. Ctrl+C to stop.\n`);

    // Loops
    this.timers.push(
      setInterval(() => {
        this.heartbeat().catch(e =>
          console.error(`[${ts()}] Heartbeat error:`, e.message),
        );
        this.refreshLiveActivities().catch(() => {});
      }, HEARTBEAT_INTERVAL_MS),
    );

    this.timers.push(
      setInterval(() => {
        this.pollCommands().catch(e =>
          console.error(`[${ts()}] Command poll error:`, e.message),
        );
      }, COMMAND_POLL_INTERVAL_MS),
    );

    this.timers.push(
      setInterval(() => {
        this.reportProcesses().catch(e =>
          console.error(`[${ts()}] Discovery error:`, e.message),
        );
      }, PROCESS_DISCOVERY_INTERVAL_MS),
    );

    // Graceful shutdown
    const shutdown = () => {
      console.log(`\n[${ts()}] Shutting down...`);
      for (const t of this.timers) clearInterval(t);
      try {
        unlinkSync(PID_FILE);
      } catch {
        /* ok */
      }
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep alive
    await new Promise(() => {});
  }
}

// ── Device Setup ────────────────────────────────────────────────────────────

export async function setupBridgeDevice(
  convexUrl: string,
  userId: string,
): Promise<BridgeConfig> {
  const client = new ConvexHttpClient(convexUrl);
  const deviceKey = `${hostname()}-${randomUUID().slice(0, 8)}`;
  const deviceSecret = randomUUID();
  const displayName = `${process.env.USER ?? 'user'}'s ${platform() === 'darwin' ? 'Mac' : 'machine'}`;

  const result = await client.mutation(
    api.agentBridge.bridgePublic.setupDevice,
    {
      userId: userId as Id<'users'>,
      deviceKey,
      deviceSecret,
      displayName,
      hostname: hostname(),
      platform: platform(),
      cliVersion: '0.1.0',
      capabilities: ['codex', 'claude_code'],
    },
  );

  const config: BridgeConfig = {
    deviceId: result.deviceId,
    deviceKey,
    deviceSecret,
    userId,
    displayName,
    convexUrl,
    registeredAt: new Date().toISOString(),
  };

  saveBridgeConfig(config);
  return config;
}

// ── LaunchAgent (macOS) ─────────────────────────────────────────────────────

export function installLaunchAgent(vcliPath: string): void {
  if (platform() !== 'darwin') {
    console.error('LaunchAgent is macOS only. Use systemd on Linux.');
    return;
  }

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHAGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${vcliPath}</string>
    <string>service</string>
    <string>run</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${CONFIG_DIR}/bridge.log</string>
  <key>StandardErrorPath</key>
  <string>${CONFIG_DIR}/bridge.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>`;

  // Also install the menu bar helper LaunchAgent if the binary exists.
  // Search common locations for the compiled VectorMenuBar binary.
  const menuBarCandidates = [
    join(CONFIG_DIR, 'VectorMenuBar'),
    '/usr/local/bin/VectorMenuBar',
    join(homedir(), '.local', 'bin', 'VectorMenuBar'),
  ];
  const menuBarBinary = menuBarCandidates.find(p => existsSync(p));
  if (menuBarBinary) {
    const menuBarPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.vector.menubar</string>
  <key>ProgramArguments</key>
  <array>
    <string>${menuBarBinary}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
</dict>
</plist>`;
    const menuBarPlistPath = join(LAUNCHAGENT_DIR, 'com.vector.menubar.plist');
    writeFileSync(menuBarPlistPath, menuBarPlist);
    try {
      execSync(`launchctl load ${menuBarPlistPath}`, { stdio: 'pipe' });
      console.log('Menu bar helper installed.');
    } catch {
      // Already loaded or failed — non-critical
    }
  }

  if (!existsSync(LAUNCHAGENT_DIR)) {
    mkdirSync(LAUNCHAGENT_DIR, { recursive: true });
  }
  writeFileSync(LAUNCHAGENT_PLIST, plist);
  console.log(`Installed LaunchAgent: ${LAUNCHAGENT_PLIST}`);
}

export function loadLaunchAgent(): void {
  try {
    execSync(`launchctl load ${LAUNCHAGENT_PLIST}`, { stdio: 'inherit' });
    console.log(
      'LaunchAgent loaded. Bridge will start automatically on login.',
    );
  } catch {
    console.error('Failed to load LaunchAgent');
  }
}

export function unloadLaunchAgent(): void {
  try {
    execSync(`launchctl unload ${LAUNCHAGENT_PLIST}`, { stdio: 'inherit' });
    console.log('LaunchAgent unloaded.');
  } catch {
    console.error('Failed to unload LaunchAgent (may not be loaded)');
  }
}

export function uninstallLaunchAgent(): void {
  unloadLaunchAgent();
  try {
    unlinkSync(LAUNCHAGENT_PLIST);
    console.log('LaunchAgent removed.');
  } catch {
    /* already gone */
  }
}

// ── Menu Bar ────────────────────────────────────────────────────────────────

const MENUBAR_BINARY = join(CONFIG_DIR, 'VectorMenuBar');
const MENUBAR_SWIFT_URL =
  'https://raw.githubusercontent.com/xrehpicx/vector/main/cli/macos/VectorMenuBar.swift';

/** Ensure the native menu bar binary exists, compiling if needed. */
async function ensureMenuBarBinary(): Promise<string | null> {
  if (platform() !== 'darwin') return null;
  if (existsSync(MENUBAR_BINARY)) return MENUBAR_BINARY;

  // Check for Swift compiler
  try {
    execSync('which swiftc', { stdio: 'pipe' });
  } catch {
    return null;
  }

  // Try local source first (dev), then download from GitHub
  const localSource = join(
    process.cwd(),
    'cli',
    'macos',
    'VectorMenuBar.swift',
  );
  let swiftSource: string;

  if (existsSync(localSource)) {
    swiftSource = localSource;
  } else {
    // Download the Swift source
    const downloadPath = join(CONFIG_DIR, 'VectorMenuBar.swift');
    try {
      execSync(`curl -fsSL "${MENUBAR_SWIFT_URL}" -o "${downloadPath}"`, {
        stdio: 'pipe',
        timeout: 15000,
      });
      swiftSource = downloadPath;
    } catch {
      return null;
    }
  }

  // Compile
  try {
    execSync(
      `swiftc -o "${MENUBAR_BINARY}" "${swiftSource}" -framework AppKit`,
      { stdio: 'pipe', timeout: 30000 },
    );
    // Copy icon assets if available
    const assetsSource = join(swiftSource, '..', 'assets');
    const assetsDest = join(CONFIG_DIR, 'assets');
    if (existsSync(assetsSource)) {
      mkdirSync(assetsDest, { recursive: true });
      for (const f of ['vector-menubar.png', 'vector-menubar@2x.png']) {
        const src = join(assetsSource, f);
        if (existsSync(src))
          writeFileSync(join(assetsDest, f), readFileSync(src));
      }
    }
    return MENUBAR_BINARY;
  } catch {
    return null;
  }
}

export async function launchMenuBar(): Promise<void> {
  if (platform() !== 'darwin') return;

  const binary = await ensureMenuBarBinary();
  if (!binary) return;

  try {
    const { spawn: spawnChild } = await import('child_process');
    const child = spawnChild(binary, [], { detached: true, stdio: 'ignore' });
    child.unref();
    console.log('Menu bar started.');
  } catch {
    // Non-critical
  }
}

// ── Status ──────────────────────────────────────────────────────────────────

export function getBridgeStatus(): {
  configured: boolean;
  running: boolean;
  starting: boolean;
  pid?: number;
  config?: BridgeConfig;
} {
  const config = loadBridgeConfig();
  if (!config) return { configured: false, running: false, starting: false };

  let running = false;
  let starting = false;
  let pid: number | undefined;
  if (existsSync(PID_FILE)) {
    const pidStr = readFileSync(PID_FILE, 'utf-8').trim();
    pid = Number(pidStr);
    try {
      process.kill(pid, 0);
      running = true;
    } catch {
      running = false;
    }
  }

  // Check if LaunchAgent is loaded but PID file not yet written (starting up)
  if (!running && platform() === 'darwin') {
    try {
      const result = execSync(
        `launchctl list ${LAUNCHAGENT_LABEL} 2>/dev/null`,
        { encoding: 'utf-8', timeout: 3000 },
      );
      if (result.includes(LAUNCHAGENT_LABEL)) {
        starting = true;
      }
    } catch {
      // Not loaded
    }
  }

  return { configured: true, running, starting, pid, config };
}

export function stopBridge(): boolean {
  if (!existsSync(PID_FILE)) return false;
  const pid = Number(readFileSync(PID_FILE, 'utf-8').trim());
  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}

function ts(): string {
  return new Date().toLocaleTimeString();
}
