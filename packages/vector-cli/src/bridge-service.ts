/**
 * Vector Bridge Service — runs as a foreground process or installed as a system service.
 *
 * Called by:
 *   vcli service start     — runs the bridge loop in the foreground
 *   vcli start             — installs + starts via LaunchAgent (macOS) or systemd (Linux)
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api.js';
import type { Id, TableNames } from '../../../convex/_generated/dataModel';
import { execFileSync, execSync } from 'child_process';
import { TerminalPeerManager } from './terminal-peer';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
  unlinkSync,
} from 'fs';
import { homedir, hostname, platform } from 'os';
import { dirname, isAbsolute, join } from 'path';
import { randomUUID } from 'crypto';
import type {
  AgentContextLength,
  AgentPermissionMode,
  AgentProvider,
  AgentThinkingLevel,
  LiveActivityStatus,
} from '../../../convex/_shared/agentBridge';
import {
  discoverAttachableSessions,
  launchProviderSession,
  resumeProviderSession,
  type BridgeProvider,
  type AgentSessionEvent,
  type AgentSessionEventRole,
  type SessionProcessRecord,
} from './agent-adapters';

// ── Config ──────────────────────────────────────────────────────────────────

const configuredVectorHome = process.env.VECTOR_HOME?.trim();
if (configuredVectorHome && !isAbsolute(configuredVectorHome)) {
  throw new Error('VECTOR_HOME must be an absolute path.');
}
const CONFIG_DIR = configuredVectorHome || join(homedir(), '.vector');
const BRIDGE_CONFIG_FILE = join(CONFIG_DIR, 'bridge.json');
const DEVICE_KEY_FILE = join(CONFIG_DIR, 'device-key');
const PID_FILE = join(CONFIG_DIR, 'bridge.pid');
const LIVE_ACTIVITIES_CACHE = join(CONFIG_DIR, 'live-activities.json');
const BRIDGE_HEALTH_FILE = join(CONFIG_DIR, 'bridge-health.json');
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
const LIVE_ACTIVITY_SYNC_INTERVAL_MS = 5_000;
const PROCESS_DISCOVERY_INTERVAL_MS = 60_000;
const TERMINAL_SNAPSHOT_REFRESH_INTERVAL_MS = 180_000;

export interface BridgeConfig {
  deviceId: string;
  deviceKey: string;
  deviceSecret: string;
  userId: string;
  displayName: string;
  convexUrl: string;
  registeredAt: string;
  tunnelHost?: string;
}

export interface BridgeHealth {
  state: 'starting' | 'healthy' | 'degraded' | 'stopped';
  updatedAt: string;
  lastHeartbeatAt?: string;
  lastError?: string;
}

// ── Config persistence ──────────────────────────────────────────────────────

export function loadBridgeConfig(): BridgeConfig | null {
  if (!existsSync(BRIDGE_CONFIG_FILE)) return null;
  try {
    ensureConfigDir();
    try {
      chmodSync(BRIDGE_CONFIG_FILE, 0o600);
    } catch {
      // Reading an existing config must not fail solely because its ownership
      // prevents this best-effort permission migration.
    }
    return JSON.parse(readFileSync(BRIDGE_CONFIG_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveBridgeConfig(config: BridgeConfig): void {
  writePrivateFileSync(BRIDGE_CONFIG_FILE, JSON.stringify(config, null, 2));
  persistDeviceKey(config.deviceKey);
}

function writeLiveActivitiesCache(activities: unknown[]): void {
  writePrivateFileSync(
    LIVE_ACTIVITIES_CACHE,
    JSON.stringify(activities, null, 2),
  );
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  try {
    chmodSync(CONFIG_DIR, 0o700);
  } catch {
    // Best effort on filesystems that do not expose POSIX permissions.
  }
}

function writePrivateFileSync(filePath: string, contents: string): void {
  ensureConfigDir();
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, contents, { encoding: 'utf8', mode: 0o600 });
  renameSync(temporaryPath, filePath);
  try {
    chmodSync(filePath, 0o600);
  } catch {
    // Best effort on filesystems that do not expose POSIX permissions.
  }
}

function writeBridgeHealth(health: BridgeHealth): void {
  writePrivateFileSync(BRIDGE_HEALTH_FILE, JSON.stringify(health, null, 2));
}

function loadBridgeHealth(): BridgeHealth | null {
  try {
    return JSON.parse(readFileSync(BRIDGE_HEALTH_FILE, 'utf8')) as BridgeHealth;
  } catch {
    return null;
  }
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
    workSessionId?: Id<'workSessions'>;
  } | null;
  workSession?: {
    _id: Id<'workSessions'>;
    tmuxSessionName?: string;
    tmuxWindowName?: string;
    tmuxPaneId?: string;
    workspacePath?: string;
    cwd?: string;
    repoRoot?: string;
    branch?: string;
    terminalSnapshot?: string;
    agentProvider?: AgentProvider;
    agentSessionKey?: string;
    model?: string;
    permissionMode?: AgentPermissionMode;
    thinkingLevel?: AgentThinkingLevel;
    fastMode?: boolean;
    contextLength?: AgentContextLength;
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
    permissionMode?: AgentPermissionMode;
    thinkingLevel?: AgentThinkingLevel;
    fastMode?: boolean;
    contextLength?: AgentContextLength;
    tmuxSessionName?: string;
    tmuxWindowName?: string;
    tmuxPaneId?: string;
    mode: string;
    status: string;
    supportsInboundMessages: boolean;
  } | null;
}

interface AgentMessageStructuredPayload {
  source?: 'cells_agent_event';
  provider?: AgentProvider;
  title?: string;
  metadata?: string | null;
  attachments?: string[];
  replyTo?: {
    id: string;
    role: string;
    label: string;
    preview: string;
    title?: string | null;
  } | null;
  authLoginUrl?: string | null;
  parentToolUseId?: string | null;
  toolUseId?: string | null;
  usage?: {
    model: string | null;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    contextWindow: number | null;
    usedTokens: number | null;
    totalProcessedTokens: number | null;
    compactsAutomatically: boolean;
    updatedAt: number;
  };
  status?: 'in_progress' | 'completed' | 'failed';
}

// ── Bridge Service Class ────────────────────────────────────────────────────

export class BridgeService {
  private client: ConvexHttpClient;
  private config: BridgeConfig;
  private timers: ReturnType<typeof setInterval>[] = [];
  private terminalPeer: TerminalPeerManager | null = null;
  private stopping = false;
  private runningLoops = new Set<string>();
  private activeAgentRuns = new Map<string, AbortController>();
  private deviceLiveActivities: Array<{
    _id: Id<'issueLiveActivities'>;
    title?: string;
    workSessionId?: Id<'workSessions'>;
    workspacePath?: string;
    tmuxPaneId?: string;
    cwd?: string;
    repoRoot?: string;
    branch?: string;
    agentProvider?: AgentProvider;
    agentProcessId?: Id<'agentProcesses'>;
    agentSessionKey?: string;
  }> = [];

  constructor(config: BridgeConfig) {
    this.config = config;
    this.client = new ConvexHttpClient(config.convexUrl);
  }

  async heartbeat(): Promise<void> {
    try {
      await this.client.mutation(api.agentBridge.bridgePublic.heartbeat, {
        deviceId: this.config.deviceId as Id<'agentDevices'>,
        deviceSecret: this.config.deviceSecret,
      });
      const now = new Date().toISOString();
      writeBridgeHealth({
        state: 'healthy',
        updatedAt: now,
        lastHeartbeatAt: now,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const previous = loadBridgeHealth();
      writeBridgeHealth({
        state: 'degraded',
        updatedAt: new Date().toISOString(),
        lastHeartbeatAt: previous?.lastHeartbeatAt,
        lastError: message,
      });
      throw error;
    }
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

  private scheduleLoop(
    name: string,
    intervalMs: number,
    run: () => Promise<void>,
  ): void {
    this.timers.push(
      setInterval(() => {
        if (this.stopping || this.runningLoops.has(name)) {
          return;
        }

        this.runningLoops.add(name);
        run()
          .catch(error => {
            const message =
              error instanceof Error ? error.message : String(error);
            console.error(`[${ts()}] ${name} error:`, message);
          })
          .finally(() => {
            this.runningLoops.delete(name);
          });
      }, intervalMs),
    );
  }

  private async runStartupStep(
    label: string,
    step: () => Promise<void>,
  ): Promise<void> {
    try {
      await step();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${ts()}] Startup ${label} failed: ${message}`);
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

    if (
      cmd.kind === 'settings_update' ||
      cmd.kind === 'queue_update' ||
      cmd.kind === 'approval_response' ||
      cmd.kind === 'plan_response' ||
      cmd.kind === 'question_response' ||
      cmd.kind === 'stop' ||
      cmd.kind === 'resume'
    ) {
      try {
        await this.handleAgentControlCommand(cmd);
        await this.completeCommand(cmd._id, 'delivered');
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown bridge error';
        console.error(`  ! ${message}`);
        await this.postCommandError(cmd, message);
        await this.completeCommand(cmd._id, 'failed');
      }
      return;
    }

    console.log(`  ${cmd.kind}: ${cmd._id}`);

    if (cmd.kind === 'launch' || cmd.kind === 'message') {
      this.runAgentCommandInBackground(cmd);
      return;
    }

    await this.runClaimedCommand(cmd);
  }

  private runAgentCommandInBackground(cmd: PendingBridgeCommand): void {
    const runKey = this.agentRunKey(cmd);
    const controller = new AbortController();
    this.activeAgentRuns.set(runKey, controller);

    void this.runClaimedCommand(cmd, controller.signal).finally(() => {
      if (this.activeAgentRuns.get(runKey) === controller) {
        this.activeAgentRuns.delete(runKey);
      }
    });
  }

  private async runClaimedCommand(
    cmd: PendingBridgeCommand,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      switch (cmd.kind) {
        case 'message':
          await this.handleMessageCommand(cmd, signal);
          await this.completeCommand(cmd._id, 'delivered');
          return;
        case 'launch':
          await this.handleLaunchCommand(cmd, signal);
          await this.completeCommand(cmd._id, 'delivered');
          return;
        case 'resize':
          await this.handleResizeCommand(cmd);
          await this.completeCommand(cmd._id, 'delivered');
          return;
        default:
          throw new Error(`Unsupported bridge command: ${cmd.kind}`);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown bridge error';
      if (message === 'Agent turn interrupted') {
        await this.completeCommand(cmd._id, 'delivered');
        return;
      }
      console.error(`  ! ${message}`);
      await this.postCommandError(cmd, message);
      await this.completeCommand(cmd._id, 'failed');
    }
  }

  private agentRunKey(cmd: PendingBridgeCommand): string {
    return (
      cmd.liveActivityId ?? cmd.workSession?._id ?? cmd.process?._id ?? cmd._id
    );
  }

  async reportProcesses(): Promise<void> {
    const processes = discoverAttachableSessions();
    const activeSessionKeys = processes
      .map(proc => proc.sessionKey)
      .filter((value): value is string => Boolean(value));
    const activeLocalProcessIds = processes
      .map(proc => proc.localProcessId)
      .filter((value): value is string => Boolean(value));

    for (const proc of processes) {
      try {
        await this.reportProcess(proc);
      } catch {
        /* skip individual failures */
      }
    }

    try {
      await this.client.mutation(
        api.agentBridge.bridgePublic.reconcileObservedProcesses,
        {
          deviceId: this.config.deviceId as Id<'agentDevices'>,
          deviceSecret: this.config.deviceSecret,
          activeSessionKeys,
          activeLocalProcessIds,
        },
      );
    } catch {
      /* best effort */
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
      this.deviceLiveActivities = activities;
      writeLiveActivitiesCache(activities);

      // Watch active sessions for interactive terminal viewers
      // and auto-update titles from tmux pane state
      const activeTerminalSessionIds = new Set<string>();
      for (const activity of activities) {
        if (activity.workSessionId && activity.tmuxSessionName) {
          activeTerminalSessionIds.add(activity.workSessionId);
          this.terminalPeer?.watchSession(
            activity.workSessionId,
            activity.tmuxSessionName,
            activity.tmuxPaneId,
          );
        }

        // Auto-generate title from tmux pane
        if (activity.workSessionId && activity.tmuxPaneId) {
          try {
            const paneTitle = execFileSync(
              'tmux',
              [
                'display-message',
                '-p',
                '-t',
                activity.tmuxPaneId,
                '#{pane_title}',
              ],
              { encoding: 'utf-8', timeout: 3000 },
            ).trim();
            if (
              paneTitle &&
              paneTitle !== activity.workSessionTitle &&
              !activity.titleLockedByUser
            ) {
              void this.client.mutation(
                api.agentBridge.bridgePublic.updateWorkSessionAutoTitle,
                {
                  deviceId: this.config.deviceId as Id<'agentDevices'>,
                  deviceSecret: this.config.deviceSecret,
                  workSessionId: activity.workSessionId,
                  title: paneTitle,
                },
              );
            }
          } catch {
            // tmux pane might not exist
          }
        }
      }
      this.terminalPeer?.reconcileWatchedSessions(activeTerminalSessionIds);
    } catch {
      /* non-critical */
    }
  }

  private async syncWorkSessionTerminals(
    activities: Array<{
      _id: Id<'issueLiveActivities'>;
      title?: string;
      workSessionId?: Id<'workSessions'>;
      workspacePath?: string;
      tmuxPaneId?: string;
      cwd?: string;
      repoRoot?: string;
      branch?: string;
      agentProvider?: AgentProvider;
      agentProcessId?: Id<'agentProcesses'>;
      agentSessionKey?: string;
    }>,
  ): Promise<void> {
    for (const activity of activities) {
      if (!activity.workSessionId || !activity.tmuxPaneId) {
        continue;
      }

      try {
        await this.refreshWorkSessionTerminal(activity.workSessionId, {
          tmuxPaneId: activity.tmuxPaneId,
          cwd: activity.cwd,
          repoRoot: activity.repoRoot,
          branch: activity.branch,
          agentProvider: activity.agentProvider,
          agentSessionKey: activity.agentSessionKey,
        });
        await this.verifyManagedWorkSession(activity);
      } catch {
        /* best effort */
      }
    }
  }

  private async verifyManagedWorkSession(activity: {
    _id: Id<'issueLiveActivities'>;
    title?: string;
    workSessionId?: Id<'workSessions'>;
    workspacePath?: string;
    tmuxPaneId?: string;
    cwd?: string;
    repoRoot?: string;
    branch?: string;
    agentProvider?: AgentProvider;
    agentProcessId?: Id<'agentProcesses'>;
    agentSessionKey?: string;
  }): Promise<void> {
    if (
      !activity.workSessionId ||
      !activity.tmuxPaneId ||
      !activity.agentProvider ||
      !isBridgeProvider(activity.agentProvider) ||
      activity.agentProcessId
    ) {
      return;
    }

    const workspacePath =
      activity.workspacePath ?? activity.cwd ?? activity.repoRoot;
    if (!workspacePath) {
      return;
    }

    const attachedSession = await this.attachObservedAgentSession(
      activity.agentProvider,
      workspacePath,
    );
    if (!attachedSession) {
      return;
    }

    await this.refreshWorkSessionTerminal(activity.workSessionId, {
      tmuxPaneId: activity.tmuxPaneId,
      cwd: attachedSession.process.cwd ?? activity.cwd ?? workspacePath,
      repoRoot:
        attachedSession.process.repoRoot ?? activity.repoRoot ?? workspacePath,
      branch: attachedSession.process.branch ?? activity.branch,
      agentProvider: attachedSession.process.provider,
      agentSessionKey: attachedSession.process.sessionKey,
    });
    await this.postAgentMessage(
      activity._id,
      'status',
      `Verified ${providerLabel(attachedSession.process.provider)} in ${activity.tmuxPaneId}`,
    );
    await this.updateLiveActivity(activity._id, {
      status: 'active',
      latestSummary: `Verified ${providerLabel(attachedSession.process.provider)} in ${activity.tmuxPaneId}`,
      processId: attachedSession.processId,
      title: activity.title,
    });
  }

  private async refreshWorkSessionTerminal(
    workSessionId: Id<'workSessions'> | undefined,
    metadata: {
      tmuxSessionName?: string;
      tmuxWindowName?: string;
      tmuxPaneId?: string;
      cwd?: string;
      repoRoot?: string;
      branch?: string;
      agentProvider?: AgentProvider;
      agentSessionKey?: string;
      agentProcessId?: Id<'agentProcesses'>;
      model?: string;
      permissionMode?: AgentPermissionMode;
      thinkingLevel?: AgentThinkingLevel;
      fastMode?: boolean;
      contextLength?: AgentContextLength;
    },
  ): Promise<void> {
    if (!workSessionId) {
      return;
    }

    const terminalSnapshot = metadata.tmuxPaneId
      ? captureTmuxPane(metadata.tmuxPaneId)
      : undefined;
    await this.client.mutation(
      api.agentBridge.bridgePublic.updateWorkSessionTerminal,
      {
        deviceId: this.config.deviceId as Id<'agentDevices'>,
        deviceSecret: this.config.deviceSecret,
        workSessionId,
        terminalSnapshot,
        tmuxSessionName: metadata.tmuxSessionName,
        tmuxWindowName: metadata.tmuxWindowName,
        tmuxPaneId: metadata.tmuxPaneId,
        cwd: metadata.cwd,
        repoRoot: metadata.repoRoot,
        branch: metadata.branch,
        agentProvider: metadata.agentProvider,
        agentSessionKey: metadata.agentSessionKey,
        agentProcessId: metadata.agentProcessId,
        model: metadata.model,
        permissionMode: metadata.permissionMode,
        thinkingLevel: metadata.thinkingLevel,
        fastMode: metadata.fastMode,
        contextLength: metadata.contextLength,
      },
    );
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
    writePrivateFileSync(PID_FILE, String(process.pid));
    writeBridgeHealth({
      state: 'starting',
      updatedAt: new Date().toISOString(),
    });

    // Start WebRTC terminal peer manager
    try {
      this.terminalPeer = new TerminalPeerManager({
        deviceId: this.config.deviceId,
        deviceSecret: this.config.deviceSecret,
        convexUrl: this.config.convexUrl,
        tunnelHost: this.config.tunnelHost,
      });
      console.log(
        `  Terminal: ready${this.config.tunnelHost ? ` (tunnel: ${this.config.tunnelHost})` : ''}`,
      );
    } catch (e) {
      console.error(
        `  WebRTC:  failed (${e instanceof Error ? e.message : 'unknown'})`,
      );
    }
    console.log('');

    process.on('uncaughtException', error => {
      console.error(`[${ts()}] Uncaught error:`, error.message);
      writeBridgeHealth({
        state: 'degraded',
        updatedAt: new Date().toISOString(),
        lastHeartbeatAt: loadBridgeHealth()?.lastHeartbeatAt,
        lastError: error.message,
      });
    });
    process.on('unhandledRejection', reason => {
      const message = reason instanceof Error ? reason.message : String(reason);
      console.error(`[${ts()}] Unhandled rejection:`, message);
      writeBridgeHealth({
        state: 'degraded',
        updatedAt: new Date().toISOString(),
        lastHeartbeatAt: loadBridgeHealth()?.lastHeartbeatAt,
        lastError: message,
      });
    });

    // Initial sync is best-effort. A network or auth blip should leave the
    // bridge alive so the periodic loops can recover without LaunchAgent churn.
    await this.runStartupStep('heartbeat', () => this.heartbeat());
    await this.runStartupStep('process discovery', () =>
      this.reportProcesses(),
    );
    await this.runStartupStep('live activity sync', () =>
      this.refreshLiveActivities(),
    );
    await this.runStartupStep('terminal snapshot sync', () =>
      this.syncWorkSessionTerminals(this.deviceLiveActivities),
    );
    console.log(`[${ts()}] Service running. Ctrl+C to stop.\n`);

    this.scheduleLoop('Heartbeat', HEARTBEAT_INTERVAL_MS, () =>
      this.heartbeat(),
    );
    this.scheduleLoop('Command poll', COMMAND_POLL_INTERVAL_MS, () =>
      this.pollCommands(),
    );
    this.scheduleLoop(
      'Live activity sync',
      LIVE_ACTIVITY_SYNC_INTERVAL_MS,
      () => this.refreshLiveActivities(),
    );
    this.scheduleLoop('Discovery', PROCESS_DISCOVERY_INTERVAL_MS, () =>
      this.reportProcesses(),
    );
    this.scheduleLoop(
      'Terminal snapshot refresh',
      TERMINAL_SNAPSHOT_REFRESH_INTERVAL_MS,
      () => this.syncWorkSessionTerminals(this.deviceLiveActivities),
    );

    // Graceful shutdown
    const shutdown = () => {
      if (this.stopping) {
        return;
      }
      this.stopping = true;
      console.log(`\n[${ts()}] Shutting down...`);
      for (const t of this.timers) clearInterval(t);
      this.terminalPeer?.stop();
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
      writeBridgeHealth({
        state: 'stopped',
        updatedAt: new Date().toISOString(),
      });
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep alive
    await new Promise(() => {});
  }

  private async handleMessageCommand(
    cmd: PendingBridgeCommand,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!cmd.liveActivityId) {
      throw new Error('Message command is missing liveActivityId');
    }

    const body = readPayloadString(cmd.payload, 'body')?.trim();
    if (!body) {
      throw new Error('Message command is missing a body');
    }
    const issueContext = readPayloadValue(cmd.payload, 'issueContext');

    const process = cmd.process;
    console.log(`  > "${truncateForLog(body)}"`);

    if (cmd.workSession?.tmuxPaneId) {
      const terminalInput =
        cmd.workSession.agentProvider &&
        isBridgeProvider(cmd.workSession.agentProvider)
          ? buildFollowUpPrompt(body, issueContext)
          : body;
      sendTextToTmuxPane(cmd.workSession.tmuxPaneId, terminalInput);
      const attachedSession =
        cmd.workSession.agentProvider &&
        isBridgeProvider(cmd.workSession.agentProvider)
          ? await this.attachObservedAgentSession(
              cmd.workSession.agentProvider,
              cmd.workSession.workspacePath ??
                cmd.workSession.cwd ??
                process?.cwd,
            )
          : null;
      await this.postAgentMessage(
        cmd.liveActivityId,
        'status',
        'Sent input to work session terminal',
      );
      await this.refreshWorkSessionTerminal(cmd.workSession._id, {
        tmuxSessionName: cmd.workSession.tmuxSessionName,
        tmuxWindowName: cmd.workSession.tmuxWindowName,
        tmuxPaneId: cmd.workSession.tmuxPaneId,
        cwd: cmd.workSession.cwd,
        repoRoot: cmd.workSession.repoRoot,
        branch: cmd.workSession.branch,
        agentProvider:
          attachedSession?.process.provider ?? cmd.workSession.agentProvider,
        agentSessionKey:
          attachedSession?.process.sessionKey ??
          cmd.workSession.agentSessionKey,
      });
      await this.updateLiveActivity(cmd.liveActivityId, {
        status: 'waiting_for_input',
        latestSummary: `Input sent to ${cmd.workSession.tmuxPaneId}`,
        title: cmd.liveActivity?.title,
        processId: attachedSession?.processId ?? process?._id,
      });
      return;
    }

    if (
      !process ||
      !process.supportsInboundMessages ||
      !process.sessionKey ||
      !process.cwd ||
      !isBridgeProvider(process.provider) ||
      (process.provider !== 'codex' && process.provider !== 'claude_code')
    ) {
      throw new Error('No resumable local session is attached to this issue');
    }

    await this.reportProcess({
      provider: process.provider,
      providerLabel: process.providerLabel ?? providerLabel(process.provider),
      sessionKey: process.sessionKey,
      cwd: process.cwd,
      repoRoot: process.repoRoot,
      branch: process.branch,
      title: process.title,
      model: process.model,
      permissionMode: process.permissionMode,
      thinkingLevel: process.thinkingLevel,
      fastMode: process.fastMode,
      contextLength: process.contextLength,
      mode: 'managed',
      status: 'waiting',
      supportsInboundMessages: true,
    });

    await this.updateLiveActivity(cmd.liveActivityId, {
      status: 'active',
      processId: process._id,
      title: cmd.liveActivity?.title ?? process.title,
    });

    const liveActivityId = cmd.liveActivityId;
    let emittedAssistantEvent = false;
    const result = await resumeProviderSession(
      process.provider,
      process.sessionKey,
      process.cwd,
      buildFollowUpPrompt(body, issueContext),
      event => {
        if (event.role === 'assistant') emittedAssistantEvent = true;
        return this.postAgentSessionEvent(liveActivityId, event);
      },
      signal,
    );
    const processId = await this.reportProcess(result);

    if (result.responseText && !emittedAssistantEvent) {
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

  private async handleResizeCommand(cmd: PendingBridgeCommand): Promise<void> {
    const cols = readPayloadNumber(cmd.payload, 'cols');
    const rows = readPayloadNumber(cmd.payload, 'rows');
    const paneId = cmd.workSession?.tmuxPaneId;

    if (!paneId || !cols || !rows) {
      throw new Error('Resize command missing paneId, cols, or rows');
    }

    console.log(`  Resize ${paneId} → ${cols}x${rows}`);
    resizeTmuxPane(paneId, cols, rows);

    // Capture fresh snapshot after resize
    if (cmd.workSession) {
      await this.refreshWorkSessionTerminal(cmd.workSession._id, {
        tmuxSessionName: cmd.workSession.tmuxSessionName,
        tmuxWindowName: cmd.workSession.tmuxWindowName,
        tmuxPaneId: paneId,
        cwd: cmd.workSession.cwd,
        repoRoot: cmd.workSession.repoRoot,
        branch: cmd.workSession.branch,
        agentProvider: cmd.workSession.agentProvider,
        agentSessionKey: cmd.workSession.agentSessionKey,
      });
    }
  }

  private async handleAgentControlCommand(
    cmd: PendingBridgeCommand,
  ): Promise<void> {
    if (!cmd.liveActivityId) {
      throw new Error(`${cmd.kind} command is missing liveActivityId`);
    }

    if (cmd.kind === 'settings_update') {
      await this.postAgentMessage(
        cmd.liveActivityId,
        'status',
        'Updated agent settings',
      );
      return;
    }

    if (cmd.kind === 'queue_update') {
      await this.postAgentMessage(
        cmd.liveActivityId,
        'status',
        'Updated queued agent messages',
      );
      return;
    }

    if (cmd.kind === 'stop') {
      const runKey = this.agentRunKey(cmd);
      const activeRun = this.activeAgentRuns.get(runKey);
      activeRun?.abort();
      await this.updateLiveActivity(cmd.liveActivityId, {
        status: 'paused',
        latestSummary: activeRun
          ? 'Agent turn paused'
          : 'Agent turn stop requested',
      });
      await this.postAgentMessage(
        cmd.liveActivityId,
        'status',
        activeRun
          ? 'Paused the local agent session'
          : 'Stop requested for the local agent session',
      );
      return;
    }

    if (cmd.kind === 'resume') {
      await this.updateLiveActivity(cmd.liveActivityId, {
        status: 'active',
        latestSummary: 'Agent session resumed',
      });
      return;
    }

    const label =
      cmd.kind === 'approval_response'
        ? 'approval'
        : cmd.kind === 'plan_response'
          ? 'plan approval'
          : 'question response';
    await this.postAgentMessage(
      cmd.liveActivityId,
      'status',
      `Received ${label}; the provider runtime will continue when supported`,
    );
  }

  private async handleLaunchCommand(
    cmd: PendingBridgeCommand,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!cmd.liveActivityId) {
      throw new Error('Launch command is missing liveActivityId');
    }

    const workspacePath = readPayloadString(
      cmd.payload,
      'workspacePath',
    )?.trim();
    if (!workspacePath) {
      throw new Error('Launch command is missing workspacePath');
    }
    const requestedProvider = readPayloadAgentProvider(cmd.payload, 'provider');
    const provider =
      requestedProvider && isBridgeProvider(requestedProvider)
        ? requestedProvider
        : undefined;
    const issueKey =
      readPayloadString(cmd.payload, 'issueKey') ??
      cmd.liveActivity?.issueKey ??
      'ISSUE';
    const issueTitle =
      readPayloadString(cmd.payload, 'issueTitle') ??
      cmd.liveActivity?.issueTitle ??
      'Untitled issue';
    const issueDescription = readPayloadString(cmd.payload, 'issueDescription');
    const issueContext = readPayloadValue(cmd.payload, 'issueContext');
    const model = readPayloadString(cmd.payload, 'model');
    const permissionMode = readPayloadPermissionMode(
      cmd.payload,
      'permissionMode',
    );
    const thinkingLevel = readPayloadThinkingLevel(
      cmd.payload,
      'thinkingLevel',
    );
    const fastMode = readPayloadBoolean(cmd.payload, 'fastMode');
    const contextLength = readPayloadContextLength(
      cmd.payload,
      'contextLength',
    );
    const initialPrompt = readPayloadString(cmd.payload, 'initialPrompt');
    const delegatedRunId = readPayloadId<'delegatedRuns'>(
      cmd.payload,
      'delegatedRunId',
    );
    const prompt = buildLaunchPrompt(
      issueKey,
      issueTitle,
      workspacePath,
      issueDescription,
      issueContext,
      initialPrompt,
    );
    const launchLabel = provider ? providerLabel(provider) : 'shell session';
    const workSessionTitle = `${issueKey}: ${issueTitle}`;

    await this.updateLiveActivity(cmd.liveActivityId, {
      status: 'active',
      latestSummary: `Launching ${launchLabel} in ${workspacePath}`,
      delegatedRunId,
      launchStatus: 'launching',
      title: workSessionTitle,
    });

    if (provider) {
      await this.postAgentMessage(
        cmd.liveActivityId,
        'status',
        `Starting ${launchLabel} session in ${workspacePath}`,
      );

      const liveActivityId = cmd.liveActivityId;
      const result = await launchProviderSession(
        provider,
        workspacePath,
        prompt,
        event => this.postAgentSessionEvent(liveActivityId, event),
        signal,
      );
      const processId = await this.reportProcess(result);

      await this.refreshWorkSessionTerminal(cmd.workSession?._id, {
        cwd: workspacePath,
        repoRoot: result.repoRoot ?? workspacePath,
        branch: result.branch ?? currentGitBranch(workspacePath),
        agentProvider: result.provider,
        agentSessionKey: result.sessionKey,
        agentProcessId: processId,
        model,
        permissionMode,
        thinkingLevel,
        fastMode,
        contextLength,
      });

      await this.updateLiveActivity(cmd.liveActivityId, {
        status: 'waiting_for_input',
        latestSummary: summarizeMessage(result.responseText),
        delegatedRunId,
        launchStatus: 'running',
        title: workSessionTitle,
        processId,
      });
      return;
    }

    const tmuxSession = createTmuxWorkSession({
      workspacePath,
      issueKey,
      issueTitle,
      provider,
      prompt,
    });

    await this.refreshWorkSessionTerminal(cmd.workSession?._id, {
      tmuxSessionName: tmuxSession.sessionName,
      tmuxWindowName: tmuxSession.windowName,
      tmuxPaneId: tmuxSession.paneId,
      cwd: workspacePath,
      repoRoot: workspacePath,
      branch: currentGitBranch(workspacePath),
      agentProvider: provider,
      model,
      permissionMode,
      thinkingLevel,
      fastMode,
      contextLength,
    });

    await this.updateLiveActivity(cmd.liveActivityId, {
      status: 'active',
      latestSummary: `Running ${launchLabel} in ${tmuxSession.sessionName}`,
      delegatedRunId,
      launchStatus: 'running',
      title: workSessionTitle,
    });
  }

  private async attachObservedAgentSession(
    provider: BridgeProvider,
    workspacePath?: string,
    sessionsBeforeLaunch: SessionProcessRecord[] = [],
    paneProcessId?: string,
  ): Promise<{
    process: SessionProcessRecord;
    processId: Id<'agentProcesses'>;
  } | null> {
    if (!workspacePath) {
      return null;
    }

    const existingKeys = new Set(
      sessionsBeforeLaunch.map(sessionIdentityKey).filter(Boolean),
    );

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const observedSessions = listObservedSessionsForWorkspace(
        provider,
        workspacePath,
      );
      const candidate =
        (paneProcessId
          ? findObservedSessionInProcessTree(observedSessions, paneProcessId)
          : undefined) ??
        observedSessions.find(
          session => !existingKeys.has(sessionIdentityKey(session)),
        ) ??
        (attempt === 9 ? observedSessions[0] : undefined);

      if (candidate) {
        const processId = await this.reportProcess(candidate);
        return {
          process: candidate,
          processId,
        };
      }

      await sleep(750);
    }

    return null;
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
      permissionMode,
      thinkingLevel,
      fastMode,
      contextLength,
      tmuxSessionName,
      tmuxWindowName,
      tmuxPaneId,
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
        permissionMode,
        thinkingLevel,
        fastMode,
        contextLength,
        tmuxSessionName,
        tmuxWindowName,
        tmuxPaneId,
        mode,
        status,
        supportsInboundMessages,
      },
    );
  }

  private async updateLiveActivity(
    liveActivityId: Id<'issueLiveActivities'>,
    args: {
      status: LiveActivityStatus;
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
    role: AgentSessionEventRole | 'user',
    body: string,
    structuredPayload?: AgentMessageStructuredPayload,
  ): Promise<void> {
    await this.client.mutation(api.agentBridge.bridgePublic.postAgentMessage, {
      deviceId: this.config.deviceId as Id<'agentDevices'>,
      deviceSecret: this.config.deviceSecret,
      liveActivityId,
      role,
      body,
      structuredPayload,
    });
  }

  private async postAgentSessionEvent(
    liveActivityId: Id<'issueLiveActivities'>,
    event: AgentSessionEvent,
  ): Promise<void> {
    const body = event.text.trim();
    if (!body) return;

    await this.postAgentMessage(liveActivityId, event.role, body, {
      source: 'cells_agent_event',
      provider: event.provider,
      title: event.title,
      status: event.status,
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
      await this.updateLiveActivity(cmd.liveActivityId, {
        status: 'failed',
        latestSummary: errorMessage,
        delegatedRunId: readPayloadId<'delegatedRuns'>(
          cmd.payload,
          'delegatedRunId',
        ),
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

function createTmuxWorkSession(args: {
  workspacePath: string;
  issueKey: string;
  issueTitle: string;
  provider?: BridgeProvider;
  prompt: string;
}): {
  sessionName: string;
  windowName: string;
  paneId: string;
  paneProcessId: string;
} {
  const slug = sanitizeTmuxName(args.issueKey.toLowerCase());
  const sessionName = `vector-${slug}-${randomUUID().slice(0, 8)}`;
  const windowName = sanitizeTmuxName(
    args.provider === 'codex'
      ? 'codex'
      : args.provider === 'claude_code'
        ? 'claude'
        : 'shell',
  );

  execFileSync('tmux', [
    'new-session',
    '-d',
    '-s',
    sessionName,
    '-n',
    windowName,
    '-c',
    args.workspacePath,
  ]);

  const paneId = execFileSync(
    'tmux',
    [
      'display-message',
      '-p',
      '-t',
      `${sessionName}:${windowName}.0`,
      '#{pane_id}',
    ],
    { encoding: 'utf-8' },
  ).trim();
  const paneProcessId = execFileSync(
    'tmux',
    ['display-message', '-p', '-t', paneId, '#{pane_pid}'],
    { encoding: 'utf-8' },
  ).trim();

  if (args.provider) {
    execFileSync('tmux', [
      'send-keys',
      '-t',
      paneId,
      buildManagedLaunchCommand(args.provider, args.prompt),
      'Enter',
    ]);
  } else {
    execFileSync('tmux', [
      'send-keys',
      '-t',
      paneId,
      `printf '%s\\n\\n' ${shellQuote(args.prompt)}`,
      'Enter',
    ]);
  }

  return {
    sessionName,
    windowName,
    paneId,
    paneProcessId,
  };
}

function sendTextToTmuxPane(paneId: string, text: string): void {
  execFileSync('tmux', ['set-buffer', '--', text]);
  execFileSync('tmux', ['paste-buffer', '-t', paneId]);
  execFileSync('tmux', ['send-keys', '-t', paneId, 'Enter']);
  execFileSync('tmux', ['delete-buffer']);
}

function captureTmuxPane(paneId: string): string {
  return execFileSync(
    'tmux',
    ['capture-pane', '-p', '-e', '-t', paneId, '-S', '-120'],
    { encoding: 'utf-8' },
  ).trimEnd();
}

function resizeTmuxPane(paneId: string, cols: number, rows: number): void {
  try {
    execFileSync('tmux', [
      'resize-pane',
      '-t',
      paneId,
      '-x',
      String(cols),
      '-y',
      String(rows),
    ]);
  } catch (e) {
    console.error(`Failed to resize pane ${paneId}:`, e);
  }
}

function currentGitBranch(cwd: string): string | undefined {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf-8',
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim();
  } catch {
    return undefined;
  }
}

function buildManagedLaunchCommand(
  provider: BridgeProvider,
  prompt: string,
): string {
  if (provider === 'codex') {
    return `codex --no-alt-screen -a never ${shellQuote(prompt)}`;
  }
  if (provider === 'claude_code') {
    return `claude --permission-mode bypassPermissions --dangerously-skip-permissions ${shellQuote(prompt)}`;
  }
  if (provider === 'cursor')
    return `cursor-agent --print ${shellQuote(prompt)}`;
  if (provider === 'copilot') return `copilot ${shellQuote(prompt)}`;
  if (provider === 'opencode') return `opencode run ${shellQuote(prompt)}`;
  return `pi ${shellQuote(prompt)}`;
}

function sanitizeTmuxName(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'work';
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

// ── Device Setup ────────────────────────────────────────────────────────────

export async function setupBridgeDevice(
  client: ConvexHttpClient,
  convexUrl: string,
): Promise<BridgeConfig> {
  const deviceKey = getStableDeviceKey();
  const displayName = `${process.env.USER ?? 'user'}'s ${platform() === 'darwin' ? 'Mac' : 'machine'}`;

  const result = await client.mutation(
    api.agentBridge.mutations.registerBridgeDevice,
    {
      deviceKey,
      displayName,
      hostname: hostname(),
      platform: platform(),
      serviceType: 'foreground',
      cliVersion: readCliVersion(),
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

function getStableDeviceKey(): string {
  const existingConfig = loadBridgeConfig();
  const existingKey = existingConfig?.deviceKey?.trim();
  if (existingKey) {
    persistDeviceKey(existingKey);
    return existingKey;
  }

  if (existsSync(DEVICE_KEY_FILE)) {
    try {
      chmodSync(DEVICE_KEY_FILE, 0o600);
    } catch {
      // Best effort migration for existing installs.
    }
    const savedKey = readFileSync(DEVICE_KEY_FILE, 'utf-8').trim();
    if (savedKey) {
      return savedKey;
    }
  }

  const generatedKey = `${hostname()}-${randomUUID().slice(0, 8)}`;
  persistDeviceKey(generatedKey);
  return generatedKey;
}

function persistDeviceKey(deviceKey: string): void {
  writePrivateFileSync(DEVICE_KEY_FILE, `${deviceKey}\n`);
}

function buildLaunchPrompt(
  issueKey: string,
  issueTitle: string,
  workspacePath: string,
  issueDescription?: string,
  issueContext?: unknown,
  initialPrompt?: string,
): string {
  const lines = [`You are working on Vector Work ${issueKey}: ${issueTitle}`];

  if (issueDescription?.trim()) {
    lines.push('', 'Work description:', issueDescription.trim());
  }

  const contextLines = formatIssueContext(issueContext);
  if (contextLines.length > 0) {
    lines.push('', 'Vector context:', ...contextLines);
  }

  if (initialPrompt?.trim()) {
    lines.push('', 'User instruction:', initialPrompt.trim());
  }

  lines.push(
    '',
    `The repository is at ${workspacePath}.`,
    'Do exactly and only what this Work and its linked Requests describe — nothing more, nothing less.',
    'If anything is unclear or ambiguous, ask clarifying questions before making changes.',
    'Do not refactor, clean up, or "improve" code that is not part of the Work scope.',
  );

  return lines.join('\n');
}

function buildFollowUpPrompt(
  userMessage: string,
  issueContext?: unknown,
): string {
  const contextLines = formatIssueContext(issueContext);
  if (contextLines.length === 0) {
    return userMessage;
  }

  return [
    'Vector context for the current issue:',
    ...contextLines,
    '',
    'User message:',
    userMessage,
  ].join('\n');
}

function formatIssueContext(issueContext: unknown): string[] {
  const lines: string[] = [];
  const organization = readPayloadValue(issueContext, 'organization');
  const organizationName = readPayloadString(organization, 'name');
  const organizationSlug = readPayloadString(organization, 'slug');
  if (organizationName || organizationSlug) {
    lines.push(
      `- Organization: ${[organizationName, organizationSlug ? `(${organizationSlug})` : undefined].filter(Boolean).join(' ')}`,
    );
  }

  const team = readPayloadValue(issueContext, 'team');
  const teamName = readPayloadString(team, 'name');
  const teamKey = readPayloadString(team, 'key');
  if (teamName || teamKey) {
    lines.push(
      `- Team: ${[teamName, teamKey ? `(${teamKey})` : undefined].filter(Boolean).join(' ')}`,
    );
  }

  const project = readPayloadValue(issueContext, 'project');
  const projectName = readPayloadString(project, 'name');
  const projectKey = readPayloadString(project, 'key');
  const projectDescription = readPayloadString(project, 'description');
  if (projectName || projectKey) {
    lines.push(
      `- Project: ${[projectName, projectKey ? `(${projectKey})` : undefined].filter(Boolean).join(' ')}`,
    );
  }
  if (projectDescription) {
    lines.push(`- Project description: ${projectDescription}`);
  }

  const state = readPayloadValue(issueContext, 'state');
  const stateName = readPayloadString(state, 'name');
  const stateType = readPayloadString(state, 'type');
  if (stateName || stateType) {
    lines.push(
      `- State: ${[stateName, stateType ? `(${stateType})` : undefined].filter(Boolean).join(' ')}`,
    );
  }

  const priority = readPayloadString(issueContext, 'priority');
  if (priority) lines.push(`- Priority: ${priority}`);

  const reporter = readPayloadString(issueContext, 'reporter');
  if (reporter) lines.push(`- Reporter: ${reporter}`);

  const assignees = readPayloadStringArray(issueContext, 'assignees');
  if (assignees.length > 0) {
    lines.push(`- Assignees: ${assignees.join(', ')}`);
  }

  const labels = readPayloadStringArray(issueContext, 'labels');
  if (labels.length > 0) {
    lines.push(`- Labels: ${labels.join(', ')}`);
  }

  const dates = readPayloadValue(issueContext, 'dates');
  const startDate = readPayloadString(dates, 'startDate');
  const dueDate = readPayloadString(dates, 'dueDate');
  if (startDate || dueDate) {
    lines.push(
      `- Dates: ${[startDate ? `start ${startDate}` : undefined, dueDate ? `due ${dueDate}` : undefined].filter(Boolean).join(', ')}`,
    );
  }

  const recentComments = readPayloadArray(issueContext, 'recentComments');
  if (recentComments.length > 0) {
    lines.push('- Recent comments:');
    for (const comment of recentComments) {
      const author = readPayloadString(comment, 'authorName') ?? 'Unknown';
      const body = readPayloadString(comment, 'body');
      if (body) {
        lines.push(`  - ${author}: ${body}`);
      }
    }
  }

  return lines;
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

function listObservedSessionsForWorkspace(
  provider: BridgeProvider,
  workspacePath: string,
): SessionProcessRecord[] {
  return discoverAttachableSessions()
    .filter(
      session =>
        session.provider === provider &&
        matchesWorkspacePath(session, workspacePath),
    )
    .sort(compareLocalSessionRecency);
}

function findObservedSessionInProcessTree(
  sessions: SessionProcessRecord[],
  paneProcessId: string,
): SessionProcessRecord | undefined {
  const descendantIds = listDescendantProcessIds(paneProcessId);
  if (descendantIds.size === 0) {
    return undefined;
  }

  return sessions.find(session =>
    session.localProcessId ? descendantIds.has(session.localProcessId) : false,
  );
}

function listDescendantProcessIds(rootPid: string): Set<string> {
  const descendants = new Set<string>([rootPid]);

  try {
    const output = execSync('ps -axo pid=,ppid=', {
      encoding: 'utf-8',
      timeout: 3000,
    });

    const parentToChildren = new Map<string, string[]>();
    for (const line of output
      .split('\n')
      .map(value => value.trim())
      .filter(Boolean)) {
      const [pid, ppid] = line.split(/\s+/, 2);
      if (!pid || !ppid) {
        continue;
      }

      const children = parentToChildren.get(ppid) ?? [];
      children.push(pid);
      parentToChildren.set(ppid, children);
    }

    const queue = [rootPid];
    while (queue.length > 0) {
      const currentPid = queue.shift();
      if (!currentPid) {
        continue;
      }

      for (const childPid of parentToChildren.get(currentPid) ?? []) {
        if (descendants.has(childPid)) {
          continue;
        }
        descendants.add(childPid);
        queue.push(childPid);
      }
    }
  } catch {
    return descendants;
  }

  return descendants;
}

function matchesWorkspacePath(
  session: SessionProcessRecord,
  workspacePath: string,
): boolean {
  const normalizedWorkspace = normalizePath(workspacePath);
  const candidatePaths = [session.cwd, session.repoRoot]
    .filter((value): value is string => Boolean(value))
    .map(normalizePath);

  return candidatePaths.some(path => path === normalizedWorkspace);
}

function normalizePath(value: string): string {
  return value.replace(/\/+$/, '');
}

function sessionIdentityKey(session: SessionProcessRecord): string {
  return [
    session.provider,
    session.sessionKey,
    session.localProcessId,
    session.cwd,
  ]
    .filter(Boolean)
    .join('::');
}

function compareLocalSessionRecency(
  a: SessionProcessRecord,
  b: SessionProcessRecord,
): number {
  return Number(b.localProcessId ?? 0) - Number(a.localProcessId ?? 0);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readPayloadValue(payload: unknown, key: string): unknown {
  return payload !== null && typeof payload === 'object'
    ? Reflect.get(payload, key)
    : undefined;
}

function readPayloadString(payload: unknown, key: string): string | undefined {
  const value = readPayloadValue(payload, key);
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readPayloadNumber(payload: unknown, key: string): number | undefined {
  const value = readPayloadValue(payload, key);
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function readPayloadBoolean(
  payload: unknown,
  key: string,
): boolean | undefined {
  const value = readPayloadValue(payload, key);
  return typeof value === 'boolean' ? value : undefined;
}

function readPayloadPermissionMode(
  payload: unknown,
  key: string,
): AgentPermissionMode | undefined {
  const value = readPayloadValue(payload, key);
  return value === 'plan' || value === 'ask' || value === 'bypass'
    ? value
    : undefined;
}

function readPayloadThinkingLevel(
  payload: unknown,
  key: string,
): AgentThinkingLevel | undefined {
  const value = readPayloadValue(payload, key);
  return value === 'off' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'max' ||
    value === 'xhigh'
    ? value
    : undefined;
}

function readPayloadContextLength(
  payload: unknown,
  key: string,
): AgentContextLength | undefined {
  const value = readPayloadValue(payload, key);
  return value === 'default' || value === 'extended' ? value : undefined;
}

function readPayloadArray(payload: unknown, key: string): unknown[] {
  const value = readPayloadValue(payload, key);
  return Array.isArray(value) ? value : [];
}

function readPayloadStringArray(payload: unknown, key: string): string[] {
  return readPayloadArray(payload, key).filter(
    (value): value is string =>
      typeof value === 'string' && value.trim() !== '',
  );
}

function readPayloadId<TableName extends TableNames>(
  payload: unknown,
  key: string,
): Id<TableName> | undefined {
  const value = readPayloadString(payload, key);
  return value as Id<TableName> | undefined;
}

function readPayloadAgentProvider(
  payload: unknown,
  key: string,
): AgentProvider | undefined {
  const value = readPayloadValue(payload, key);
  return value === 'codex' ||
    value === 'claude_code' ||
    value === 'cursor' ||
    value === 'copilot' ||
    value === 'opencode' ||
    value === 'pi' ||
    value === 'vector_cli'
    ? value
    : undefined;
}

function isBridgeProvider(provider: AgentProvider): provider is BridgeProvider {
  return (
    provider === 'codex' ||
    provider === 'claude_code' ||
    provider === 'cursor' ||
    provider === 'copilot' ||
    provider === 'opencode' ||
    provider === 'pi'
  );
}

function providerLabel(provider: AgentProvider): string {
  if (provider === 'codex') {
    return 'Codex';
  }
  if (provider === 'claude_code') {
    return 'Claude';
  }
  if (provider === 'cursor') {
    return 'Cursor';
  }
  if (provider === 'copilot') {
    return 'GitHub Copilot';
  }
  if (provider === 'opencode') {
    return 'OpenCode';
  }
  if (provider === 'pi') {
    return 'Pi';
  }
  return 'Vector CLI';
}

function readCliVersion(): string {
  try {
    const packagePath = join(import.meta.dirname ?? '', '..', 'package.json');
    return (
      JSON.parse(readFileSync(packagePath, 'utf8')) as { version: string }
    ).version;
  } catch {
    return process.env.npm_package_version ?? 'unknown';
  }
}

// ── LaunchAgent (macOS) ─────────────────────────────────────────────────────

export function installLaunchAgent(vcliPath: string): void {
  if (platform() !== 'darwin') {
    console.error('LaunchAgent is macOS only. Use systemd on Linux.');
    return;
  }

  const programArguments = getLaunchAgentProgramArguments(vcliPath);
  const resolvedInvocation = resolveCliInvocation(vcliPath);
  const executable = resolvedInvocation[0];
  if (executable?.startsWith('/') && !existsSync(executable)) {
    throw new Error(`LaunchAgent executable does not exist: ${executable}`);
  }
  const launchPath = buildLaunchAgentPath();
  const environmentVariables = [
    '  <key>PATH</key>',
    `  <string>${escapePlistString(launchPath)}</string>`,
    ...(process.env.VECTOR_HOME?.trim()
      ? [
          '  <key>VECTOR_HOME</key>',
          `  <string>${escapePlistString(process.env.VECTOR_HOME.trim())}</string>`,
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
  writeFileSync(LAUNCHAGENT_PLIST, plist, { encoding: 'utf8', mode: 0o600 });
  chmodSync(LAUNCHAGENT_PLIST, 0o600);
  console.log(`Installed LaunchAgent: ${LAUNCHAGENT_PLIST}`);
}

export function isLaunchAgentInstalled(): boolean {
  return platform() === 'darwin' && existsSync(LAUNCHAGENT_PLIST);
}

function getLaunchAgentProgramArguments(vcliPath: string): string {
  const args = resolveCliInvocation(vcliPath);
  return [
    '<array>',
    ...args.map(arg => `    <string>${escapePlistString(arg)}</string>`),
    '    <string>service</string>',
    '    <string>run</string>',
    '  </array>',
  ].join('\n');
}

function resolveCliInvocation(vcliPath: string): string[] {
  const resolvedPath = resolveExecutablePath(vcliPath);

  if (resolvedPath.endsWith('.js')) {
    return [process.execPath, resolvedPath];
  }

  if (resolvedPath.endsWith('.ts')) {
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
      return [tsxPath, resolvedPath];
    }
  }

  return [resolvedPath];
}

function resolveExecutablePath(executablePath: string): string {
  try {
    return realpathSync(executablePath);
  } catch {
    return executablePath;
  }
}

function buildLaunchAgentPath(): string {
  const entries = [
    ...(process.env.PATH?.split(':') ?? []),
    dirname(process.execPath),
    join(homedir(), '.volta', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ];
  return [...new Set(entries.filter(Boolean))].join(':');
}

function escapePlistString(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function loadLaunchAgent(): boolean {
  if (runLaunchctl(['bootstrap', launchctlGuiDomain(), LAUNCHAGENT_PLIST])) {
    if (
      !runLaunchctl([
        'kickstart',
        '-k',
        `${launchctlGuiDomain()}/${LAUNCHAGENT_LABEL}`,
      ])
    ) {
      console.error('LaunchAgent was installed but could not be started');
      return false;
    }
    console.log(
      'LaunchAgent loaded. Bridge will start automatically on login.',
    );
    return true;
  }

  if (
    runLaunchctl([
      'kickstart',
      '-k',
      `${launchctlGuiDomain()}/${LAUNCHAGENT_LABEL}`,
    ])
  ) {
    console.log(
      'LaunchAgent loaded. Bridge will start automatically on login.',
    );
    return true;
  }

  if (
    runLaunchctl(['load', LAUNCHAGENT_PLIST]) &&
    runLaunchctl([
      'kickstart',
      '-k',
      `${launchctlGuiDomain()}/${LAUNCHAGENT_LABEL}`,
    ])
  ) {
    console.log(
      'LaunchAgent loaded. Bridge will start automatically on login.',
    );
    return true;
  }

  console.error('Failed to load LaunchAgent');
  return false;
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
    execFileSync('launchctl', ['unload', LEGACY_MENUBAR_LAUNCHAGENT_PLIST], {
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

export async function launchMenuBar(): Promise<void> {
  if (platform() !== 'darwin') return;

  removeLegacyMenuBarLaunchAgent();

  const executable = findMenuBarExecutable();
  const cliInvocation = getCurrentCliInvocation();
  if (!executable || !cliInvocation) return;

  // Relaunch on every bridge start so an npm update cannot leave an older tray
  // binary or CLI invocation running indefinitely.
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
      writePrivateFileSync(MENUBAR_PID_FILE, String(child.pid));
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
  health?: BridgeHealth;
} {
  const config = loadBridgeConfig();
  if (!config) return { configured: false, running: false, starting: false };

  const pid = getRunningBridgePid() ?? undefined;
  const running = pid !== undefined;
  let starting = false;

  // Check if LaunchAgent is loaded but PID file not yet written (starting up)
  if (!running && platform() === 'darwin') {
    starting = getLaunchAgentState() === 'running';
  }

  let health = loadBridgeHealth() ?? undefined;
  if (running && health) {
    const referenceTime = health.lastHeartbeatAt ?? health.updatedAt;
    const heartbeatAge = Date.now() - Date.parse(referenceTime);
    if (
      heartbeatAge > HEARTBEAT_INTERVAL_MS * 3 &&
      (health.state === 'starting' || health.lastHeartbeatAt)
    ) {
      health = {
        ...health,
        state: 'degraded',
        lastError:
          health.lastError ??
          (health.lastHeartbeatAt
            ? 'Heartbeat is stale'
            : 'Bridge did not complete its first heartbeat'),
      };
    }
  }
  return { configured: true, running, starting, pid, config, health };
}

export function stopBridge(options?: { includeMenuBar?: boolean }): boolean {
  if (options?.includeMenuBar) {
    killExistingMenuBar();
  }
  if (existsSync(BRIDGE_CONFIG_FILE)) {
    try {
      writeLiveActivitiesCache([]);
    } catch {
      /* ok */
    }
  }
  const pid = getRunningBridgePid();
  if (!pid) return false;
  try {
    process.kill(pid, 'SIGTERM');
    writeBridgeHealth({
      state: 'stopped',
      updatedAt: new Date().toISOString(),
    });
    return true;
  } catch {
    return false;
  }
}

function getRunningBridgePid(): number | null {
  if (!existsSync(PID_FILE)) return null;

  let pid: number;
  try {
    pid = Number(readFileSync(PID_FILE, 'utf-8').trim());
  } catch {
    removeStaleBridgePidFile();
    return null;
  }
  if (!Number.isInteger(pid) || pid <= 0) {
    removeStaleBridgePidFile();
    return null;
  }
  try {
    process.kill(pid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
      // EPERM still proves that a process owns this PID.
      return pid;
    }
    removeStaleBridgePidFile();
    return null;
  }

  let command: string;
  try {
    command = execFileSync('ps', ['-p', String(pid), '-o', 'args='], {
      encoding: 'utf8',
      timeout: 3000,
    });
  } catch {
    // A transient ps failure must not make a live bridge unmanageable. The
    // signal-0 probe above already established that the PID exists.
    return pid;
  }

  if (!command.includes('service run')) {
    removeStaleBridgePidFile();
    return null;
  }
  return pid;
}

function removeStaleBridgePidFile(): void {
  try {
    unlinkSync(PID_FILE);
  } catch {
    // Already removed.
  }
}

function getLaunchAgentState(): string | null {
  try {
    const output = execFileSync(
      'launchctl',
      ['print', `${launchctlGuiDomain()}/${LAUNCHAGENT_LABEL}`],
      { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return output.match(/^\s*state\s*=\s*(\S+)/m)?.[1] ?? null;
  } catch {
    return null;
  }
}

function ts(): string {
  return new Date().toLocaleTimeString();
}
