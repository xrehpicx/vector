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
import { TerminalPeerManager } from './terminal-peer';
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
import type {
  AgentProvider,
  LiveActivityStatus,
} from '../../../convex/_shared/agentBridge';
import {
  discoverAttachableSessions,
  resumeProviderSession,
  type BridgeProvider,
  type SessionProcessRecord,
} from './agent-adapters';

// ── Config ──────────────────────────────────────────────────────────────────

const CONFIG_DIR =
  process.env.VECTOR_HOME?.trim() || join(homedir(), '.vector');
const BRIDGE_CONFIG_FILE = join(CONFIG_DIR, 'bridge.json');
const DEVICE_KEY_FILE = join(CONFIG_DIR, 'device-key');
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
const LIVE_ACTIVITY_SYNC_INTERVAL_MS = 5_000;
const PROCESS_DISCOVERY_INTERVAL_MS = 60_000;

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
  persistDeviceKey(config.deviceKey);
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
    tmuxSessionName?: string;
    tmuxWindowName?: string;
    tmuxPaneId?: string;
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
  private terminalPeer: TerminalPeerManager | null = null;

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
      console.error(`  ! ${message}`);
      await this.postCommandError(cmd, message);
      await this.completeCommand(cmd._id, 'failed');
    }
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
      writeLiveActivitiesCache(activities);

      // Watch active sessions for interactive terminal viewers
      if (this.terminalPeer) {
        for (const activity of activities) {
          if (activity.workSessionId && activity.tmuxSessionName) {
            this.terminalPeer.watchSession(
              activity.workSessionId,
              activity.tmuxSessionName,
              activity.tmuxPaneId,
            );
          }
        }
      }
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
    },
  ): Promise<void> {
    if (!workSessionId || !metadata.tmuxPaneId) {
      return;
    }

    const terminalSnapshot = captureTmuxPane(metadata.tmuxPaneId);
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
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(PID_FILE, String(process.pid));

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
        this.refreshLiveActivities().catch(e =>
          console.error(`[${ts()}] Live activity sync error:`, e.message),
        );
      }, LIVE_ACTIVITY_SYNC_INTERVAL_MS),
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
    console.log(`  > "${truncateForLog(body)}"`);

    if (cmd.workSession?.tmuxPaneId) {
      sendTextToTmuxPane(cmd.workSession.tmuxPaneId, body);
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
      !isBridgeProvider(process.provider)
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

  private async handleResizeCommand(cmd: PendingBridgeCommand): Promise<void> {
    const payload = cmd.payload as { cols?: number; rows?: number } | undefined;
    const cols = payload?.cols;
    const rows = payload?.rows;
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
    const requestedProvider = payload?.provider;
    const provider =
      requestedProvider && isBridgeProvider(requestedProvider)
        ? requestedProvider
        : undefined;
    const issueKey = payload?.issueKey ?? cmd.liveActivity?.issueKey ?? 'ISSUE';
    const issueTitle =
      payload?.issueTitle ?? cmd.liveActivity?.issueTitle ?? 'Untitled issue';
    const prompt = buildLaunchPrompt(issueKey, issueTitle, workspacePath);
    const launchLabel = provider ? providerLabel(provider) : 'shell session';
    const workSessionTitle = `${issueKey}: ${issueTitle}`;
    const sessionsBeforeLaunch = provider
      ? listObservedSessionsForWorkspace(provider, workspacePath)
      : [];

    await this.updateLiveActivity(cmd.liveActivityId, {
      status: 'active',
      latestSummary: `Launching ${launchLabel} in ${workspacePath}`,
      delegatedRunId: payload?.delegatedRunId,
      launchStatus: 'launching',
      title: workSessionTitle,
    });
    await this.postAgentMessage(
      cmd.liveActivityId,
      'status',
      `Launching ${launchLabel} in ${workspacePath}`,
    );

    const tmuxSession = createTmuxWorkSession({
      workspacePath,
      issueKey,
      issueTitle,
      provider,
      prompt,
    });
    const attachedSession = provider
      ? await this.attachObservedAgentSession(
          provider,
          workspacePath,
          sessionsBeforeLaunch,
          tmuxSession.paneProcessId,
        )
      : null;

    await this.refreshWorkSessionTerminal(cmd.workSession?._id, {
      tmuxSessionName: tmuxSession.sessionName,
      tmuxWindowName: tmuxSession.windowName,
      tmuxPaneId: tmuxSession.paneId,
      cwd: workspacePath,
      repoRoot: workspacePath,
      branch: currentGitBranch(workspacePath),
      agentProvider: provider,
      agentSessionKey: attachedSession?.process.sessionKey,
    });

    if (provider && !attachedSession) {
      await this.postAgentMessage(
        cmd.liveActivityId,
        'status',
        `Started tmux session ${tmuxSession.sessionName}:${tmuxSession.windowName}. Waiting to verify ${providerLabel(provider)} in ${tmuxSession.paneId}.`,
      );
      await this.updateLiveActivity(cmd.liveActivityId, {
        status: 'active',
        latestSummary: `Running in ${tmuxSession.sessionName}:${tmuxSession.windowName}; waiting to verify ${providerLabel(provider)}`,
        delegatedRunId: payload?.delegatedRunId,
        launchStatus: 'running',
        title: `${providerLabel(provider)} on ${this.config.displayName}`,
      });
      return;
    }

    await this.updateLiveActivity(cmd.liveActivityId, {
      status: 'active',
      latestSummary: `Running in ${tmuxSession.sessionName}:${tmuxSession.windowName}`,
      delegatedRunId: payload?.delegatedRunId,
      launchStatus: 'running',
      processId: attachedSession?.processId,
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

  return `claude --permission-mode bypassPermissions --dangerously-skip-permissions ${shellQuote(prompt)}`;
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

function getStableDeviceKey(): string {
  const existingConfig = loadBridgeConfig();
  const existingKey = existingConfig?.deviceKey?.trim();
  if (existingKey) {
    persistDeviceKey(existingKey);
    return existingKey;
  }

  if (existsSync(DEVICE_KEY_FILE)) {
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
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(DEVICE_KEY_FILE, `${deviceKey}\n`);
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

function isBridgeProvider(provider: AgentProvider): provider is BridgeProvider {
  return provider === 'codex' || provider === 'claude_code';
}

function providerLabel(provider: AgentProvider): string {
  if (provider === 'codex') {
    return 'Codex';
  }
  if (provider === 'claude_code') {
    return 'Claude';
  }
  return 'Vector CLI';
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
    '  <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>',
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
