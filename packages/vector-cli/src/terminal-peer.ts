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
import { api } from '../../../convex/_generated/api';
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
  tunnel: { close: () => void };
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
  private failedSessions = new Set<string>();
  private pendingStops = new Map<string, ReturnType<typeof setTimeout>>();
  private unsubscribers = new Map<string, () => void>();

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
    this.stopTerminal(workSessionId);
  }

  private async startTerminal(
    workSessionId: string,
    tmuxSessionName: string,
    tmuxPaneId: string | undefined,
    cols: number,
    rows: number,
  ): Promise<void> {
    if (this.terminals.has(workSessionId)) return;

    try {
      // 1. Find a free port
      const port = await findPort();

      // 2. Create a linked viewer session (no status bar, targets pane)
      const viewerSession = createViewerSession(tmuxSessionName, tmuxPaneId);
      const isLinked = viewerSession !== tmuxSessionName;
      console.log(
        `[${ts()}] Viewer session: ${viewerSession}${isLinked ? ' (linked)' : ''}`,
      );

      // 3. Spawn PTY attached to the viewer session
      console.log(
        `[${ts()}] Spawning PTY: ${TMUX} attach-session -t ${viewerSession}`,
      );
      const ptyProcess = pty.spawn(
        TMUX,
        ['attach-session', '-t', viewerSession],
        {
          name: 'xterm-256color',
          cols: Math.max(cols, 10),
          rows: Math.max(rows, 4),
          cwd: process.env.HOME ?? '/',
          env: { ...process.env, TERM: 'xterm-256color' },
        },
      );
      console.log(`[${ts()}] PTY started`);

      // 4. Generate auth token
      const token = randomUUID();

      // 5. Start WebSocket server
      const httpServer = createServer();
      const wss = new WebSocketServer({ server: httpServer });

      wss.on('connection', (ws, req) => {
        const url = new URL(req.url ?? '/', `http://localhost`);
        const clientToken = url.searchParams.get('token');
        if (clientToken !== token) {
          console.log(`[${ts()}] Rejected unauthorized connection`);
          ws.close(4401, 'Unauthorized');
          return;
        }

        console.log(`[${ts()}] Client connected (${tmuxSessionName})`);

        const dataHandler = ptyProcess.onData(data => {
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
                ptyProcess.resize(
                  Math.max(parsed.cols, 10),
                  Math.max(parsed.rows, 4),
                );
                return;
              }
            } catch {
              // not a control message
            }
          }

          ptyProcess.write(str);
        });

        ws.on('close', () => {
          console.log(`[${ts()}] Client disconnected (${tmuxSessionName})`);
          dataHandler.dispose();
        });
      });

      await new Promise<void>(resolve => {
        httpServer.listen(port, '0.0.0.0', resolve);
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
      const tunnel = await localtunnel(tunnelOpts);
      const tunnelUrl = tunnel.url;
      console.log(`[${ts()}] Tunnel: ${tunnelUrl}`);

      const wsUrl = tunnelUrl.replace(/^https?:\/\//, 'wss://');

      const terminal: ActiveTerminal = {
        ptyProcess,
        httpServer,
        wss,
        tunnel,
        viewerSessionName: isLinked ? viewerSession : null,
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

      ptyProcess.onExit(() => {
        console.log(`[${ts()}] PTY exited for ${tmuxSessionName}`);
        this.stopTerminal(workSessionId);
      });
    } catch (err) {
      console.error(`[${ts()}] Failed to start terminal:`, err);
      this.failedSessions.add(workSessionId);
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
