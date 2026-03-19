/**
 * WebRTC-based terminal peer for the bridge.
 *
 * Uses Convex for signaling (via ConvexClient reactive subscriptions) and
 * node-datachannel for the P2P DataChannel connection.
 * When a browser sends an offer, the bridge creates a PeerConnection,
 * spawns a PTY running `tmux attach-session`, and pipes I/O over the DataChannel.
 */

import { ConvexClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { PeerConnection, type DataChannel } from 'node-datachannel';
import * as pty from 'node-pty';
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';

function findTmuxPath(): string {
  // Check common paths directly (fastest, no subprocess)
  for (const p of [
    '/opt/homebrew/bin/tmux',
    '/usr/local/bin/tmux',
    '/usr/bin/tmux',
  ]) {
    if (existsSync(p)) return p;
  }

  // Fallback: ask the shell
  try {
    return execFileSync('/usr/bin/env', ['which', 'tmux'], {
      encoding: 'utf-8',
    }).trim();
  } catch {
    return 'tmux';
  }
}

interface TerminalPeerConfig {
  deviceId: string;
  deviceSecret: string;
  convexUrl: string;
}

interface ActiveSession {
  peer: PeerConnection;
  channel: DataChannel | null;
  ptyProcess: pty.IPty | null;
  workSessionId: string;
}

function ts() {
  return new Date().toISOString().slice(11, 19);
}

export class TerminalPeerManager {
  private config: TerminalPeerConfig;
  private client: ConvexClient;
  private sessions = new Map<string, ActiveSession>();
  private unsubscribers = new Map<string, () => void>();
  private processedSignals = new Set<string>();

  constructor(config: TerminalPeerConfig) {
    this.config = config;
    this.client = new ConvexClient(config.convexUrl);
  }

  /**
   * Start watching for WebRTC offers on a specific work session.
   * Called when a live activity has an active tmux session.
   */
  watchSession(
    workSessionId: Id<'workSessions'>,
    tmuxSessionName: string,
  ): void {
    if (this.unsubscribers.has(workSessionId)) return;

    const unsub = this.client.onUpdate(
      api.agentBridge.bridgePublic.getTerminalSignals,
      {
        deviceId: this.config.deviceId as Id<'agentDevices'>,
        deviceSecret: this.config.deviceSecret,
        workSessionId,
      },
      signals => {
        if (!signals || signals.length === 0) return;

        for (const signal of signals) {
          const signalKey = signal._id;
          if (this.processedSignals.has(signalKey)) continue;
          this.processedSignals.add(signalKey);

          if (signal.type === 'offer') {
            console.log(`[${ts()}] WebRTC offer for ${tmuxSessionName}`);
            void this.handleOffer(workSessionId, tmuxSessionName, signal.data);
          } else if (signal.type === 'candidate') {
            const session = this.sessions.get(workSessionId);
            if (session) {
              try {
                const candidate = JSON.parse(signal.data);
                session.peer.addRemoteCandidate(
                  candidate.candidate,
                  candidate.sdpMid ?? '0',
                );
              } catch {
                // ignore malformed candidates
              }
            }
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
    this.cleanupSession(workSessionId);
  }

  private async handleOffer(
    workSessionId: string,
    tmuxSessionName: string,
    offerData: string,
  ): Promise<void> {
    // Clean up existing session if re-negotiating
    this.cleanupSession(workSessionId);

    const offer = JSON.parse(offerData);
    const peer = new PeerConnection('bridge', {
      iceServers: ['stun:stun.l.google.com:19302'],
    });

    const session: ActiveSession = {
      peer,
      channel: null,
      ptyProcess: null,
      workSessionId,
    };
    this.sessions.set(workSessionId, session);

    // Log connection state changes
    peer.onStateChange(state => {
      console.log(
        `[${ts()}] PeerConnection state: ${state} (${tmuxSessionName})`,
      );
    });

    peer.onGatheringStateChange(state => {
      console.log(`[${ts()}] ICE gathering: ${state} (${tmuxSessionName})`);
    });

    // Send ICE candidates to Convex
    peer.onLocalCandidate((candidate, sdpMid) => {
      console.log(`[${ts()}] Local ICE candidate: ${sdpMid}`);
      void this.sendSignal(workSessionId, 'candidate', { candidate, sdpMid });
    });

    // Handle incoming data channel from browser
    peer.onDataChannel(dc => {
      console.log(`[${ts()}] onDataChannel received: ${dc.getLabel()}`);
      session.channel = dc;
      this.setupDataChannel(session, tmuxSessionName, dc);
    });

    // Set remote description (the offer from browser)
    console.log(
      `[${ts()}] Setting remote description (offer type: ${offer.type})`,
    );
    peer.setRemoteDescription(offer.sdp, offer.type);

    // Wait for ICE gathering to complete
    await new Promise<void>(resolve => {
      const checkGathering = () => {
        const state = peer.gatheringState();
        if (state === 'complete') {
          resolve();
        } else {
          setTimeout(checkGathering, 100);
        }
      };
      // Also resolve after 3 seconds max
      setTimeout(resolve, 3000);
      checkGathering();
    });

    const localDesc = peer.localDescription();
    if (localDesc) {
      console.log(
        `[${ts()}] Sending answer (type: ${localDesc.type}, sdp length: ${localDesc.sdp.length})`,
      );
      await this.sendSignal(workSessionId, 'answer', {
        sdp: localDesc.sdp,
        type: localDesc.type,
      });
      console.log(`[${ts()}] WebRTC answer sent for ${tmuxSessionName}`);
    } else {
      console.error(
        `[${ts()}] No local description available after setting remote offer`,
      );
    }
  }

  private async sendSignal(
    workSessionId: string,
    type: 'answer' | 'candidate',
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.client.mutation(
        api.agentBridge.bridgePublic.sendTerminalSignal,
        {
          deviceId: this.config.deviceId as Id<'agentDevices'>,
          deviceSecret: this.config.deviceSecret,
          workSessionId: workSessionId as Id<'workSessions'>,
          type,
          data: JSON.stringify(data),
        },
      );
    } catch (err) {
      console.error(`[${ts()}] Failed to send signal:`, err);
    }
  }

  private setupDataChannel(
    session: ActiveSession,
    tmuxSessionName: string,
    dc: DataChannel,
  ): void {
    dc.onOpen(() => {
      console.log(`[${ts()}] DataChannel open for ${tmuxSessionName}`);

      try {
        const tmuxBin = findTmuxPath();
        const ptyProcess = pty.spawn(
          tmuxBin,
          ['attach-session', '-t', tmuxSessionName],
          {
            name: 'xterm-256color',
            cols: 80,
            rows: 24,
            cwd: process.env.HOME ?? '/',
            env: {
              ...process.env,
              TERM: 'xterm-256color',
              PATH: ['/opt/homebrew/bin', '/usr/local/bin', process.env.PATH]
                .filter(Boolean)
                .join(':'),
            },
          },
        );
        session.ptyProcess = ptyProcess;

        // PTY output → DataChannel
        ptyProcess.onData(data => {
          try {
            if (dc.isOpen()) {
              dc.sendMessage(data);
            }
          } catch {
            // channel closed
          }
        });

        ptyProcess.onExit(() => {
          console.log(`[${ts()}] PTY exited for ${tmuxSessionName}`);
          try {
            dc.close();
          } catch {
            // ignore
          }
          this.cleanupSession(session.workSessionId);
        });
      } catch (err) {
        console.error(`[${ts()}] Failed to spawn PTY:`, err);
        try {
          dc.close();
        } catch {
          // ignore
        }
      }
    });

    // DataChannel input → PTY stdin
    dc.onMessage(msg => {
      if (!session.ptyProcess) return;

      const str =
        typeof msg === 'string'
          ? msg
          : Buffer.from(msg as unknown as ArrayBuffer).toString();

      // Check for control messages (resize)
      if (str.startsWith('\x00{')) {
        try {
          const parsed = JSON.parse(str.slice(1));
          if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
            session.ptyProcess.resize(
              Math.max(parsed.cols, 10),
              Math.max(parsed.rows, 4),
            );
            return;
          }
        } catch {
          // Not a control message
        }
      }

      session.ptyProcess.write(str);
    });

    dc.onClosed(() => {
      console.log(`[${ts()}] DataChannel closed for ${tmuxSessionName}`);
      this.cleanupSession(session.workSessionId);
    });

    dc.onError(err => {
      console.error(`[${ts()}] DataChannel error:`, err);
      this.cleanupSession(session.workSessionId);
    });
  }

  private cleanupSession(workSessionId: string): void {
    const session = this.sessions.get(workSessionId);
    if (!session) return;

    try {
      session.ptyProcess?.kill();
    } catch {
      // ignore
    }
    try {
      session.channel?.close();
    } catch {
      // ignore
    }
    try {
      session.peer.close();
    } catch {
      // ignore
    }
    this.sessions.delete(workSessionId);
  }

  stop(): void {
    for (const unsub of this.unsubscribers.values()) {
      try {
        unsub();
      } catch {
        // ignore
      }
    }
    this.unsubscribers.clear();

    for (const id of this.sessions.keys()) {
      this.cleanupSession(id);
    }

    void this.client.close();
  }
}
