/**
 * Interactive terminal relay for the bridge.
 *
 * For each active work session with a viewer:
 * 1. Creates a linked tmux viewer session (status bar off, targeting the specific pane)
 * 2. Spawns a PTY attached to the viewer session (node-pty)
 * 3. Starts a local WebSocket server (ws) that pipes PTY I/O
 * 4. Opens a public tunnel (localtunnel) so any device can connect
 * 5. Writes both the tunnel URL and local port to Convex
 *    (frontend tries localhost first for low latency, falls back to tunnel)
 *
 * Pure JS — no binary distribution needed.
 */

import { createServer, type Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { ConvexClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api.js';
import type { Id } from '../../../convex/_generated/dataModel';
import * as pty from 'node-pty';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import localtunnel from 'localtunnel';

function findTmuxPath(): string {
  for (const p of [
    '/opt/homebrew/bin/tmux',
    '/usr/local/bin/tmux',
    '/usr/bin/tmux',
  ]) {
    if (existsSync(p)) return p;
  }
  return 'tmux';
}

const TMUX = findTmuxPath();

interface TerminalPeerConfig {
  deviceId: string;
  deviceSecret: string;
  convexUrl: string;
  tunnelHost?: string;
}

interface ActiveTerminal {
  ptyProcess: pty.IPty;
  httpServer: Server;
  wss: WebSocketServer;
  tunnel: { url: string; close: () => void };
  viewerSessionName: string | null;
  token: string;
  workSessionId: string;
  tmuxSessionName: string;
  port: number;
}

function ts() {
  return new Date().toISOString().slice(11, 19);
}

function findPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 9100;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

/**
 * Create a linked tmux session for the web viewer.
 * - Linked to the original session (shares windows)
 * - Status bar hidden
 * - Targets the specific pane if provided
 */
function createViewerSession(targetSession: string, paneId?: string): string {
  const viewerName = `viewer-${randomUUID().slice(0, 8)}`;

  try {
    // Create linked session (shares windows with target)
    execFileSync(TMUX, [
      'new-session',
      '-d',
      '-s',
      viewerName,
      '-t',
      targetSession,
    ]);

    // Hide status bar for the viewer session
    execFileSync(TMUX, ['set-option', '-t', viewerName, 'status', 'off']);

    // Select the specific pane if we have one
    if (paneId) {
      try {
        execFileSync(TMUX, ['select-pane', '-t', paneId]);
      } catch {
        // pane might not exist, ignore
      }
    }

    return viewerName;
  } catch (err) {
    console.error(`[${ts()}] Failed to create viewer session:`, err);
    // Fall back to attaching directly to the original session
    return targetSession;
  }
}

function killViewerSession(sessionName: string): void {
  try {
    execFileSync(TMUX, ['kill-session', '-t', sessionName]);
  } catch {
    // ignore — might already be gone
  }
}

export class TerminalPeerManager {
  private config: TerminalPeerConfig;
  private client: ConvexClient;
  private terminals = new Map<string, ActiveTerminal>();
  private startingSessions = new Set<string>();
  private failedSessions = new Set<string>();
  private failureRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private pendingStops = new Map<string, ReturnType<typeof setTimeout>>();
  private unsubscribers = new Map<string, () => void>();
  private viewerActiveSessions = new Set<string>();

  constructor(config: TerminalPeerConfig) {
    this.config = config;
    this.client = new ConvexClient(config.convexUrl);
  }

  watchSession(
    workSessionId: Id<'workSessions'>,
    tmuxSessionName: string,
    tmuxPaneId?: string,
  ): void {
    if (this.unsubscribers.has(workSessionId)) return;

    const unsub = this.client.onUpdate(
      api.agentBridge.bridgePublic.getWorkSessionTerminalState,
      {
        deviceId: this.config.deviceId as Id<'agentDevices'>,
        deviceSecret: this.config.deviceSecret,
        workSessionId,
      },
      state => {
        if (!state) return;

        if (state.terminalViewerActive) {
          this.viewerActiveSessions.add(workSessionId);
        } else {
          this.viewerActiveSessions.delete(workSessionId);
        }

        const terminal = this.terminals.get(workSessionId);

        if (
          state.terminalViewerActive &&
          !terminal &&
          !this.failedSessions.has(workSessionId)
        ) {
          const pendingStop = this.pendingStops.get(workSessionId);
          if (pendingStop) {
            clearTimeout(pendingStop);
            this.pendingStops.delete(workSessionId);
          }

          console.log(`[${ts()}] Viewer active for ${tmuxSessionName}`);
          void this.startTerminal(
            workSessionId,
            tmuxSessionName,
            tmuxPaneId,
            state.terminalCols,
            state.terminalRows,
          );
        } else if (!state.terminalViewerActive && terminal) {
          if (!this.pendingStops.has(workSessionId)) {
            this.pendingStops.set(
              workSessionId,
              setTimeout(() => {
                this.pendingStops.delete(workSessionId);
                console.log(`[${ts()}] Viewer inactive for ${tmuxSessionName}`);
                this.stopTerminal(workSessionId);
                this.failedSessions.delete(workSessionId);
              }, 2000),
            );
          }
        }
      },
    );
    this.unsubscribers.set(workSessionId, unsub);
  }

  unwatchSession(workSessionId: string): void {
    const unsub = this.unsubscribers.get(workSessionId);
    if (unsub) {
      unsub();
      this.unsubscribers.delete(workSessionId);
    }
    const pendingStop = this.pendingStops.get(workSessionId);
    if (pendingStop) clearTimeout(pendingStop);
    this.pendingStops.delete(workSessionId);
    const retryTimer = this.failureRetryTimers.get(workSessionId);
    if (retryTimer) clearTimeout(retryTimer);
    this.failureRetryTimers.delete(workSessionId);
    this.failedSessions.delete(workSessionId);
    this.viewerActiveSessions.delete(workSessionId);
    this.stopTerminal(workSessionId);
  }

  reconcileWatchedSessions(activeWorkSessionIds: Set<string>): void {
    for (const workSessionId of this.unsubscribers.keys()) {
      if (!activeWorkSessionIds.has(workSessionId)) {
        this.unwatchSession(workSessionId);
      }
    }
  }

  private async startTerminal(
    workSessionId: string,
    tmuxSessionName: string,
    tmuxPaneId: string | undefined,
    cols: number,
    rows: number,
  ): Promise<void> {
    if (
      this.terminals.has(workSessionId) ||
      this.startingSessions.has(workSessionId)
    ) {
      return;
    }
    this.startingSessions.add(workSessionId);

    let viewerSession: string | undefined;
    let viewerIsLinked = false;
    let ptyProcess: pty.IPty | undefined;
    let httpServer: Server | undefined;
    let wss: WebSocketServer | undefined;
    let tunnel: ActiveTerminal['tunnel'] | undefined;

    try {
      // 1. Find a free port
      const port = await findPort();

      // 2. Create a linked viewer session (no status bar, targets pane)
      viewerSession = createViewerSession(tmuxSessionName, tmuxPaneId);
      viewerIsLinked = viewerSession !== tmuxSessionName;
      console.log(
        `[${ts()}] Viewer session: ${viewerSession}${viewerIsLinked ? ' (linked)' : ''}`,
      );

      // 3. Spawn PTY attached to the viewer session
      console.log(
        `[${ts()}] Spawning PTY: ${TMUX} attach-session -t ${viewerSession}`,
      );
      ptyProcess = pty.spawn(TMUX, ['attach-session', '-t', viewerSession], {
        name: 'xterm-256color',
        cols: Math.max(cols, 10),
        rows: Math.max(rows, 4),
        cwd: process.env.HOME ?? '/',
        env: { ...process.env, TERM: 'xterm-256color' },
      });
      const activePtyProcess = ptyProcess;
      const activeViewerSession = viewerSession;
      let ptyExited = false;
      activePtyProcess.onExit(() => {
        ptyExited = true;
        console.log(`[${ts()}] PTY exited for ${tmuxSessionName}`);
        if (this.terminals.has(workSessionId)) {
          this.stopTerminal(workSessionId);
        }
      });
      console.log(`[${ts()}] PTY started`);

      // 4. Generate auth token
      const token = randomUUID();

      // 5. Start WebSocket server
      httpServer = createServer();
      wss = new WebSocketServer({ server: httpServer });

      wss.on('connection', (ws, req) => {
        const url = new URL(req.url ?? '/', `http://localhost`);
        const clientToken = url.searchParams.get('token');
        if (clientToken !== token) {
          console.log(`[${ts()}] Rejected unauthorized connection`);
          ws.close(4401, 'Unauthorized');
          return;
        }

        console.log(`[${ts()}] Client connected (${tmuxSessionName})`);

        // Force tmux to redraw the pane so the client gets a clean initial render
        // (otherwise buffered output from before the WS connected causes garbled display)
        try {
          execFileSync(TMUX, ['refresh-client', '-t', activeViewerSession]);
        } catch {
          // best effort
        }

        const dataHandler = activePtyProcess.onData(data => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        });

        ws.on('message', msg => {
          const str = msg.toString();

          if (str.startsWith('\x00{')) {
            try {
              const parsed = JSON.parse(str.slice(1));
              if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
                activePtyProcess.resize(
                  Math.max(parsed.cols, 10),
                  Math.max(parsed.rows, 4),
                );
                // Force tmux to redraw at the new size
                try {
                  execFileSync(TMUX, [
                    'refresh-client',
                    '-t',
                    activeViewerSession,
                  ]);
                } catch {
                  // best effort
                }
                return;
              }
            } catch {
              // not a control message
            }
          }

          activePtyProcess.write(str);
        });

        ws.on('close', () => {
          console.log(`[${ts()}] Client disconnected (${tmuxSessionName})`);
          dataHandler.dispose();
        });
      });

      await new Promise<void>((resolve, reject) => {
        httpServer!.once('error', reject);
        httpServer!.listen(port, '127.0.0.1', () => {
          httpServer!.off('error', reject);
          resolve();
        });
      });
      console.log(`[${ts()}] WS server on port ${port}`);

      // 6. Open tunnel
      const tunnelOpts: { port: number; host?: string } = { port };
      if (this.config.tunnelHost) {
        tunnelOpts.host = this.config.tunnelHost;
      }
      console.log(
        `[${ts()}] Opening tunnel...${this.config.tunnelHost ? ` (host: ${this.config.tunnelHost})` : ''}`,
      );
      const activeTunnel = await localtunnel(tunnelOpts);
      tunnel = activeTunnel;
      const tunnelUrl = activeTunnel.url;
      console.log(`[${ts()}] Tunnel: ${tunnelUrl}`);

      const wsUrl = tunnelUrl.replace(/^https?:\/\//, 'wss://');
      if (ptyExited) {
        throw new Error('Terminal process exited during startup');
      }
      if (!this.viewerActiveSessions.has(workSessionId)) {
        throw new Error('Terminal viewer disconnected during startup');
      }

      const terminal: ActiveTerminal = {
        ptyProcess,
        httpServer,
        wss,
        tunnel,
        viewerSessionName: viewerIsLinked ? viewerSession : null,
        token,
        workSessionId,
        tmuxSessionName,
        port,
      };
      this.terminals.set(workSessionId, terminal);

      // 7. Write tunnel URL, local port, and token to Convex
      await this.client.mutation(
        api.agentBridge.bridgePublic.updateWorkSessionTerminalUrl,
        {
          deviceId: this.config.deviceId as Id<'agentDevices'>,
          deviceSecret: this.config.deviceSecret,
          workSessionId: workSessionId as Id<'workSessions'>,
          terminalUrl: wsUrl,
          terminalToken: token,
          terminalLocalPort: port,
        },
      );
    } catch (err) {
      console.error(`[${ts()}] Failed to start terminal:`, err);
      if (this.terminals.has(workSessionId)) {
        this.stopTerminal(workSessionId);
      } else {
        try {
          ptyProcess?.kill();
        } catch {
          /* best effort */
        }
        try {
          tunnel?.close();
        } catch {
          /* best effort */
        }
        try {
          wss?.close();
        } catch {
          /* best effort */
        }
        try {
          httpServer?.close();
        } catch {
          /* best effort */
        }
        if (viewerIsLinked && viewerSession) {
          killViewerSession(viewerSession);
        }
      }
      this.failedSessions.add(workSessionId);
      const previousRetry = this.failureRetryTimers.get(workSessionId);
      if (previousRetry) clearTimeout(previousRetry);
      this.failureRetryTimers.set(
        workSessionId,
        setTimeout(() => {
          this.failedSessions.delete(workSessionId);
          this.failureRetryTimers.delete(workSessionId);
          if (
            this.viewerActiveSessions.has(workSessionId) &&
            this.unsubscribers.has(workSessionId)
          ) {
            void this.startTerminal(
              workSessionId,
              tmuxSessionName,
              tmuxPaneId,
              cols,
              rows,
            );
          }
        }, 30_000),
      );
    } finally {
      this.startingSessions.delete(workSessionId);
    }
  }

  private stopTerminal(workSessionId: string): void {
    const terminal = this.terminals.get(workSessionId);
    if (!terminal) return;

    try {
      terminal.ptyProcess.kill();
    } catch {
      /* */
    }
    try {
      terminal.tunnel.close();
    } catch {
      /* */
    }
    try {
      terminal.wss.close();
    } catch {
      /* */
    }
    try {
      terminal.httpServer.close();
    } catch {
      /* */
    }
    // Clean up the linked viewer session
    if (terminal.viewerSessionName) {
      killViewerSession(terminal.viewerSessionName);
    }
    this.terminals.delete(workSessionId);
    console.log(`[${ts()}] Terminal stopped for ${terminal.tmuxSessionName}`);
  }

  stop(): void {
    for (const timeout of this.pendingStops.values()) clearTimeout(timeout);
    this.pendingStops.clear();
    for (const timeout of this.failureRetryTimers.values())
      clearTimeout(timeout);
    this.failureRetryTimers.clear();
    this.viewerActiveSessions.clear();
    for (const unsub of this.unsubscribers.values()) {
      try {
        unsub();
      } catch {
        /* */
      }
    }
    this.unsubscribers.clear();

    for (const id of this.terminals.keys()) {
      this.stopTerminal(id);
    }

    void this.client.close();
  }
}
