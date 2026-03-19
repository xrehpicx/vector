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
import { execFileSync, execSync } from 'child_process';
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
import type { AgentProvider } from '../../../convex/_shared/agentBridge';
import {
  discoverAttachableSessions,
  launchProviderSession,
  resumeProviderSession,
  type BridgeProvider,
  type SessionProcessRecord,
  type SessionRunResult,
} from './agent-adapters';

// ── Config ──────────────────────────────────────────────────────────────────

const CONFIG_DIR =
  process.env.VECTOR_HOME?.trim() || join(homedir(), '.vector');
const BRIDGE_CONFIG_FILE = join(CONFIG_DIR, 'bridge.json');
const PID_FILE = join(CONFIG_DIR, 'bridge.pid');
const LIVE_ACTIVITIES_CACHE = join(CONFIG_DIR, 'live-activities.json');
const LAUNCHAGENT_DIR = join(homedir(), 'Library', 'LaunchAgents');
const LAUNCHAGENT_PLIST = join(LAUNCHAGENT_DIR, 'com.vector.bridge.plist');
const LAUNCHAGENT_LABEL = 'com.vector.bridge';
const LEGACY_MENUBAR_LAUNCHAGENT_LABEL = 'com.vector.menubar';
const LEGACY_MENUBAR_LAUNCHAGENT_PLIST = join(
  LAUNCHAGENT_DIR,
  `${LEGACY_MENUBAR_LAUNCHAGENT_LABEL}.plist`,
);

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

function writeLiveActivitiesCache(activities: unknown[]): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(LIVE_ACTIVITIES_CACHE, JSON.stringify(activities, null, 2));
}

interface PendingBridgeCommand {
  _id: Id<'agentCommands'>;
  kind: string;
  payload?: unknown;
  liveActivityId?: Id<'issueLiveActivities'>;
  processId?: Id<'agentProcesses'>;
  liveActivity?: {
    _id: Id<'issueLiveActivities'>;
    issueId: Id<'issues'>;
    issueKey?: string;
    issueTitle?: string;
    provider: AgentProvider;
    title?: string;
    status: string;
  } | null;
  process?: {
    _id: Id<'agentProcesses'>;
    provider: AgentProvider;
    providerLabel?: string;
    sessionKey?: string;
    cwd?: string;
    repoRoot?: string;
    branch?: string;
    title?: string;
    model?: string;
    mode: string;
    status: string;
    supportsInboundMessages: boolean;
  } | null;
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

  private async handleCommand(cmd: PendingBridgeCommand): Promise<void> {
    const claimed = await this.client.mutation(
      api.agentBridge.bridgePublic.claimCommand,
      {
        deviceId: this.config.deviceId as Id<'agentDevices'>,
        deviceSecret: this.config.deviceSecret,
        commandId: cmd._id,
      },
    );
    if (!claimed) {
      return;
    }

    console.log(`  ${cmd.kind}: ${cmd._id}`);

    try {
      switch (cmd.kind) {
        case 'message':
          await this.handleMessageCommand(cmd);
          await this.completeCommand(cmd._id, 'delivered');
          return;
        case 'launch':
          await this.handleLaunchCommand(cmd);
          await this.completeCommand(cmd._id, 'delivered');
          return;
        default:
          throw new Error(`Unsupported bridge command: ${cmd.kind}`);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown bridge error';
      console.error(`  ! ${message}`);
      await this.postCommandError(cmd, message);
      await this.completeCommand(cmd._id, 'failed');
    }
  }

  async reportProcesses(): Promise<void> {
    const processes = discoverAttachableSessions();
    for (const proc of processes) {
      try {
        await this.reportProcess(proc);
      } catch {
        /* skip individual failures */
      }
    }
    if (processes.length > 0) {
      console.log(
        `[${ts()}] Discovered ${processes.length} attachable session(s)`,
      );
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
      writeLiveActivitiesCache(activities);
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
      try {
        writeLiveActivitiesCache([]);
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

  private async handleMessageCommand(cmd: PendingBridgeCommand): Promise<void> {
    if (!cmd.liveActivityId) {
      throw new Error('Message command is missing liveActivityId');
    }

    const payload = cmd.payload as { body?: string } | undefined;
    const body = payload?.body?.trim();
    if (!body) {
      throw new Error('Message command is missing a body');
    }

    const process = cmd.process;
    if (
      !process ||
      !process.supportsInboundMessages ||
      !process.sessionKey ||
      !process.cwd ||
      !isBridgeProvider(process.provider)
    ) {
      throw new Error('No resumable local session is attached to this issue');
    }

    console.log(`  > "${truncateForLog(body)}"`);

    await this.reportProcess({
      provider: process.provider,
      providerLabel: process.providerLabel ?? providerLabel(process.provider),
      sessionKey: process.sessionKey,
      cwd: process.cwd,
      repoRoot: process.repoRoot,
      branch: process.branch,
      title: process.title,
      model: process.model,
      mode: 'managed',
      status: 'waiting',
      supportsInboundMessages: true,
    });

    await this.updateLiveActivity(cmd.liveActivityId, {
      status: 'active',
      processId: process._id,
      title: cmd.liveActivity?.title ?? process.title,
    });

    const result = await resumeProviderSession(
      process.provider,
      process.sessionKey,
      process.cwd,
      body,
    );
    const processId = await this.reportProcess(result);

    if (result.responseText) {
      await this.postAgentMessage(
        cmd.liveActivityId,
        'assistant',
        result.responseText,
      );
      console.log(`  < "${truncateForLog(result.responseText)}"`);
    }

    await this.updateLiveActivity(cmd.liveActivityId, {
      processId,
      status: 'waiting_for_input',
      latestSummary: summarizeMessage(result.responseText),
      title: cmd.liveActivity?.title ?? process.title,
    });
  }

  private async handleLaunchCommand(cmd: PendingBridgeCommand): Promise<void> {
    if (!cmd.liveActivityId) {
      throw new Error('Launch command is missing liveActivityId');
    }

    const payload = cmd.payload as
      | {
          issueKey?: string;
          issueTitle?: string;
          provider?: AgentProvider;
          workspacePath?: string;
          workspaceLabel?: string;
          delegatedRunId?: Id<'delegatedRuns'>;
          liveActivityId?: Id<'issueLiveActivities'>;
        }
      | undefined;

    const workspacePath = payload?.workspacePath?.trim();
    if (!workspacePath) {
      throw new Error('Launch command is missing workspacePath');
    }
    if (!payload?.provider || !isBridgeProvider(payload.provider)) {
      throw new Error('Launch command is missing a supported provider');
    }

    const provider = payload.provider;
    const issueKey = payload.issueKey ?? cmd.liveActivity?.issueKey ?? 'ISSUE';
    const issueTitle =
      payload.issueTitle ?? cmd.liveActivity?.issueTitle ?? 'Untitled issue';
    const prompt = buildLaunchPrompt(issueKey, issueTitle, workspacePath);

    await this.updateLiveActivity(cmd.liveActivityId, {
      status: 'active',
      latestSummary: `Launching ${providerLabel(provider)} in ${workspacePath}`,
      delegatedRunId: payload.delegatedRunId,
      launchStatus: 'launching',
      title: `${providerLabel(provider)} on ${this.config.displayName}`,
    });
    await this.postAgentMessage(
      cmd.liveActivityId,
      'status',
      `Launching ${providerLabel(provider)} in ${workspacePath}`,
    );

    const result = await launchProviderSession(provider, workspacePath, prompt);
    const processId = await this.reportProcess({
      ...result,
      title: `${issueKey}: ${issueTitle}`,
    });

    await this.updateLiveActivity(cmd.liveActivityId, {
      processId,
      status: 'waiting_for_input',
      latestSummary: summarizeMessage(result.responseText),
      delegatedRunId: payload.delegatedRunId,
      launchStatus: 'running',
      title: `${providerLabel(provider)} on ${this.config.displayName}`,
    });

    if (result.responseText) {
      await this.postAgentMessage(
        cmd.liveActivityId,
        'assistant',
        result.responseText,
      );
      console.log(`  < "${truncateForLog(result.responseText)}"`);
    }
  }

  private async reportProcess(
    process: SessionProcessRecord,
  ): Promise<Id<'agentProcesses'>> {
    const {
      provider,
      providerLabel,
      localProcessId,
      sessionKey,
      cwd,
      repoRoot,
      branch,
      title,
      model,
      mode,
      status,
      supportsInboundMessages,
    } = process;

    return await this.client.mutation(
      api.agentBridge.bridgePublic.reportProcess,
      {
        deviceId: this.config.deviceId as Id<'agentDevices'>,
        deviceSecret: this.config.deviceSecret,
        provider,
        providerLabel,
        localProcessId,
        sessionKey,
        cwd,
        repoRoot,
        branch,
        title,
        model,
        mode,
        status,
        supportsInboundMessages,
      },
    );
  }

  private async updateLiveActivity(
    liveActivityId: Id<'issueLiveActivities'>,
    args: {
      status:
        | 'active'
        | 'waiting_for_input'
        | 'paused'
        | 'completed'
        | 'failed'
        | 'canceled'
        | 'disconnected';
      latestSummary?: string;
      title?: string;
      processId?: Id<'agentProcesses'>;
      delegatedRunId?: Id<'delegatedRuns'>;
      launchStatus?:
        | 'pending'
        | 'launching'
        | 'running'
        | 'completed'
        | 'failed'
        | 'canceled';
    },
  ): Promise<void> {
    await this.client.mutation(
      api.agentBridge.bridgePublic.updateLiveActivityState,
      {
        deviceId: this.config.deviceId as Id<'agentDevices'>,
        deviceSecret: this.config.deviceSecret,
        liveActivityId,
        ...args,
      },
    );
  }

  private async postAgentMessage(
    liveActivityId: Id<'issueLiveActivities'>,
    role: 'status' | 'assistant',
    body: string,
  ): Promise<void> {
    await this.client.mutation(api.agentBridge.bridgePublic.postAgentMessage, {
      deviceId: this.config.deviceId as Id<'agentDevices'>,
      deviceSecret: this.config.deviceSecret,
      liveActivityId,
      role,
      body,
    });
  }

  private async completeCommand(
    commandId: Id<'agentCommands'>,
    status: 'delivered' | 'failed',
  ): Promise<void> {
    await this.client.mutation(api.agentBridge.bridgePublic.completeCommand, {
      deviceId: this.config.deviceId as Id<'agentDevices'>,
      deviceSecret: this.config.deviceSecret,
      commandId,
      status,
    });
  }

  private async postCommandError(
    cmd: PendingBridgeCommand,
    errorMessage: string,
  ): Promise<void> {
    if (cmd.kind === 'launch' && cmd.liveActivityId) {
      const payload = cmd.payload as
        | { delegatedRunId?: Id<'delegatedRuns'> }
        | undefined;
      await this.updateLiveActivity(cmd.liveActivityId, {
        status: 'failed',
        latestSummary: errorMessage,
        delegatedRunId: payload?.delegatedRunId,
        launchStatus: 'failed',
      });
      await this.postAgentMessage(cmd.liveActivityId, 'status', errorMessage);
      return;
    }

    if (cmd.kind === 'message' && cmd.liveActivityId) {
      await this.postAgentMessage(cmd.liveActivityId, 'status', errorMessage);
      await this.updateLiveActivity(cmd.liveActivityId, {
        status: 'waiting_for_input',
        latestSummary: errorMessage,
      });
    }
  }
}

// ── Device Setup ────────────────────────────────────────────────────────────

export async function setupBridgeDevice(
  client: ConvexHttpClient,
  convexUrl: string,
): Promise<BridgeConfig> {
  const deviceKey = `${hostname()}-${randomUUID().slice(0, 8)}`;
  const displayName = `${process.env.USER ?? 'user'}'s ${platform() === 'darwin' ? 'Mac' : 'machine'}`;

  const result = await client.mutation(
    api.agentBridge.mutations.registerBridgeDevice,
    {
      deviceKey,
      displayName,
      hostname: hostname(),
      platform: platform(),
      serviceType: 'foreground',
      cliVersion: '0.1.0',
      capabilities: ['codex', 'claude_code'],
    },
  );

  const config: BridgeConfig = {
    deviceId: result.deviceId,
    deviceKey,
    deviceSecret: result.deviceSecret,
    userId: result.userId,
    displayName,
    convexUrl,
    registeredAt: new Date().toISOString(),
  };

  saveBridgeConfig(config);
  return config;
}

function buildLaunchPrompt(
  issueKey: string,
  issueTitle: string,
  workspacePath: string,
): string {
  return [
    `You are working on Vector issue ${issueKey}: ${issueTitle}.`,
    `The repository is already checked out at ${workspacePath}.`,
    'Inspect the codebase, identify the relevant implementation area, and start the work.',
    'In your first reply, summarize your plan and the first concrete step you are taking.',
  ].join('\n\n');
}

function summarizeMessage(message: string | undefined): string | undefined {
  if (!message) {
    return undefined;
  }

  return message.length > 120
    ? `${message.slice(0, 117).trimEnd()}...`
    : message;
}

function truncateForLog(message: string): string {
  return message.length > 80 ? `${message.slice(0, 77).trimEnd()}...` : message;
}

function isBridgeProvider(provider: AgentProvider): provider is BridgeProvider {
  return provider === 'codex' || provider === 'claude_code';
}

function providerLabel(provider: BridgeProvider): string {
  return provider === 'codex' ? 'Codex' : 'Claude';
}

// ── LaunchAgent (macOS) ─────────────────────────────────────────────────────

export function installLaunchAgent(vcliPath: string): void {
  if (platform() !== 'darwin') {
    console.error('LaunchAgent is macOS only. Use systemd on Linux.');
    return;
  }

  const programArguments = getLaunchAgentProgramArguments(vcliPath);
  const environmentVariables = [
    '  <key>PATH</key>',
    '  <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>',
    ...(process.env.VECTOR_HOME?.trim()
      ? [
          '  <key>VECTOR_HOME</key>',
          `  <string>${process.env.VECTOR_HOME.trim()}</string>`,
        ]
      : []),
  ].join('\n');

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHAGENT_LABEL}</string>
  <key>ProgramArguments</key>
  ${programArguments}
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
${environmentVariables}
  </dict>
</dict>
</plist>`;

  if (!existsSync(LAUNCHAGENT_DIR)) {
    mkdirSync(LAUNCHAGENT_DIR, { recursive: true });
  }
  removeLegacyMenuBarLaunchAgent();
  writeFileSync(LAUNCHAGENT_PLIST, plist);
  console.log(`Installed LaunchAgent: ${LAUNCHAGENT_PLIST}`);
}

function getLaunchAgentProgramArguments(vcliPath: string): string {
  const args = resolveCliInvocation(vcliPath);
  return [
    '<array>',
    ...args.map(arg => `    <string>${arg}</string>`),
    '    <string>service</string>',
    '    <string>run</string>',
    '  </array>',
  ].join('\n');
}

function resolveCliInvocation(vcliPath: string): string[] {
  if (vcliPath.endsWith('.js')) {
    return [process.execPath, vcliPath];
  }

  if (vcliPath.endsWith('.ts')) {
    const tsxPath = join(
      import.meta.dirname ?? process.cwd(),
      '..',
      '..',
      '..',
      'node_modules',
      '.bin',
      'tsx',
    );

    if (existsSync(tsxPath)) {
      return [tsxPath, vcliPath];
    }
  }

  return [vcliPath];
}

export function loadLaunchAgent(): void {
  if (runLaunchctl(['bootstrap', launchctlGuiDomain(), LAUNCHAGENT_PLIST])) {
    runLaunchctl([
      'kickstart',
      '-k',
      `${launchctlGuiDomain()}/${LAUNCHAGENT_LABEL}`,
    ]);
    console.log(
      'LaunchAgent loaded. Bridge will start automatically on login.',
    );
    return;
  }

  if (
    runLaunchctl([
      'kickstart',
      '-k',
      `${launchctlGuiDomain()}/${LAUNCHAGENT_LABEL}`,
    ]) ||
    runLaunchctl(['load', LAUNCHAGENT_PLIST])
  ) {
    console.log(
      'LaunchAgent loaded. Bridge will start automatically on login.',
    );
    return;
  }

  console.error('Failed to load LaunchAgent');
}

export function unloadLaunchAgent(): boolean {
  if (
    runLaunchctl(['bootout', `${launchctlGuiDomain()}/${LAUNCHAGENT_LABEL}`]) ||
    runLaunchctl(['bootout', launchctlGuiDomain(), LAUNCHAGENT_PLIST]) ||
    runLaunchctl(['unload', LAUNCHAGENT_PLIST])
  ) {
    console.log('LaunchAgent unloaded.');
    return true;
  }

  console.error('Failed to unload LaunchAgent (may not be loaded)');
  return false;
}

export function uninstallLaunchAgent(): void {
  unloadLaunchAgent();
  removeLegacyMenuBarLaunchAgent();
  try {
    unlinkSync(LAUNCHAGENT_PLIST);
    console.log('LaunchAgent removed.');
  } catch {
    /* already gone */
  }
}

// ── Menu Bar ────────────────────────────────────────────────────────────────

const MENUBAR_PID_FILE = join(CONFIG_DIR, 'menubar.pid');

function removeLegacyMenuBarLaunchAgent(): void {
  if (
    platform() !== 'darwin' ||
    !existsSync(LEGACY_MENUBAR_LAUNCHAGENT_PLIST)
  ) {
    return;
  }

  try {
    execSync(`launchctl unload ${LEGACY_MENUBAR_LAUNCHAGENT_PLIST}`, {
      stdio: 'pipe',
    });
  } catch {
    /* may already be unloaded */
  }

  try {
    unlinkSync(LEGACY_MENUBAR_LAUNCHAGENT_PLIST);
  } catch {
    /* already gone */
  }
}

function launchctlGuiDomain(): string {
  const uid =
    typeof process.getuid === 'function'
      ? process.getuid()
      : typeof process.geteuid === 'function'
        ? process.geteuid()
        : 0;
  return `gui/${uid}`;
}

function runLaunchctl(args: string[]): boolean {
  try {
    execFileSync('launchctl', args, {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function findCliEntrypoint(): string | null {
  const candidates = [
    join(import.meta.dirname ?? '', 'index.js'),
    join(import.meta.dirname ?? '', 'index.ts'),
    join(import.meta.dirname ?? '', '..', 'dist', 'index.js'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function getCurrentCliInvocation(): string[] | null {
  const entrypoint = findCliEntrypoint();
  if (!entrypoint) {
    return null;
  }
  return resolveCliInvocation(entrypoint);
}

function findMenuBarExecutable(): string | null {
  const candidates = [
    join(
      import.meta.dirname ?? '',
      '..',
      'native',
      'VectorMenuBar.app',
      'Contents',
      'MacOS',
      'VectorMenuBar',
    ),
    join(
      import.meta.dirname ?? '',
      'native',
      'VectorMenuBar.app',
      'Contents',
      'MacOS',
      'VectorMenuBar',
    ),
  ];

  for (const p of candidates) {
    if (existsSync(p)) {
      return p;
    }
  }

  return null;
}

function isKnownMenuBarProcess(pid: number): boolean {
  try {
    const command = execSync(`ps -p ${pid} -o args=`, {
      encoding: 'utf-8',
      timeout: 3000,
    });
    return (
      command.includes('menubar.js') ||
      command.includes('menubar.ts') ||
      command.includes('VectorMenuBar')
    );
  } catch {
    return false;
  }
}

/** Kill any existing menu bar process. */
function killExistingMenuBar(): void {
  if (existsSync(MENUBAR_PID_FILE)) {
    try {
      const pid = Number(readFileSync(MENUBAR_PID_FILE, 'utf-8').trim());
      if (Number.isFinite(pid) && pid > 0 && isKnownMenuBarProcess(pid)) {
        process.kill(pid, 'SIGTERM');
      }
    } catch {
      // Already dead
    }
    try {
      unlinkSync(MENUBAR_PID_FILE);
    } catch {
      /* ignore */
    }
  }
}

function getRunningMenuBarPid(): number | null {
  if (!existsSync(MENUBAR_PID_FILE)) {
    return null;
  }

  try {
    const pid = Number(readFileSync(MENUBAR_PID_FILE, 'utf-8').trim());
    if (Number.isFinite(pid) && pid > 0 && isKnownMenuBarProcess(pid)) {
      process.kill(pid, 0);
      return pid;
    }
  } catch {
    /* stale pid */
  }

  try {
    unlinkSync(MENUBAR_PID_FILE);
  } catch {
    /* ignore */
  }

  return null;
}

export async function launchMenuBar(): Promise<void> {
  if (platform() !== 'darwin') return;

  removeLegacyMenuBarLaunchAgent();

  const executable = findMenuBarExecutable();
  const cliInvocation = getCurrentCliInvocation();
  if (!executable || !cliInvocation) return;

  const existingPid = getRunningMenuBarPid();
  if (existingPid) {
    return;
  }

  killExistingMenuBar();

  try {
    const { spawn: spawnChild } = await import('child_process');
    const child = spawnChild(executable, [], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        VECTOR_CLI_COMMAND: cliInvocation[0],
        VECTOR_CLI_ARGS_JSON: JSON.stringify(cliInvocation.slice(1)),
      },
    });
    child.unref();

    // Save the PID so we can kill it later
    if (child.pid) {
      writeFileSync(MENUBAR_PID_FILE, String(child.pid));
    }
  } catch {
    // Non-critical — menu bar is optional
  }
}

export function stopMenuBar(): void {
  killExistingMenuBar();
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
    starting =
      runLaunchctl(['print', `${launchctlGuiDomain()}/${LAUNCHAGENT_LABEL}`]) ||
      runLaunchctl(['list', LAUNCHAGENT_LABEL]);
  }

  return { configured: true, running, starting, pid, config };
}

export function stopBridge(options?: { includeMenuBar?: boolean }): boolean {
  if (options?.includeMenuBar) {
    killExistingMenuBar();
  }
  try {
    writeLiveActivitiesCache([]);
  } catch {
    /* ok */
  }
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
