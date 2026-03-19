'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { useTheme } from 'next-themes';
import { useCachedQuery, useMutation } from '@/lib/convex';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

const TERMINAL_THEME_DARK = {
  background: '#000000',
  foreground: '#c7c7c7',
  cursor: '#ffffff',
  cursorAccent: '#000000',
  selectionBackground: '#ffffff40',
  black: '#000000',
  red: '#c91b00',
  green: '#00c200',
  yellow: '#c7c400',
  blue: '#0225c7',
  magenta: '#c930c7',
  cyan: '#00c5c7',
  white: '#c7c7c7',
  brightBlack: '#676767',
  brightRed: '#ff6d67',
  brightGreen: '#5ff967',
  brightYellow: '#fefb67',
  brightBlue: '#6871ff',
  brightMagenta: '#ff76ff',
  brightCyan: '#5ffdff',
  brightWhite: '#feffff',
} as const;

const TERMINAL_THEME_LIGHT = {
  background: '#ffffff',
  foreground: '#000000',
  cursor: '#000000',
  cursorAccent: '#ffffff',
  selectionBackground: '#00000040',
  black: '#000000',
  red: '#c91b00',
  green: '#00c200',
  yellow: '#c7c400',
  blue: '#0225c7',
  magenta: '#c930c7',
  cyan: '#00c5c7',
  white: '#c7c7c7',
  brightBlack: '#676767',
  brightRed: '#ff6d67',
  brightGreen: '#5ff967',
  brightYellow: '#fefb67',
  brightBlue: '#6871ff',
  brightMagenta: '#ff76ff',
  brightCyan: '#5ffdff',
  brightWhite: '#feffff',
} as const;

const CONTROL_PREFIX = '\x00';

export function WorkSessionTerminal({
  snapshot,
  tmuxSessionName,
  workSessionId,
  isTerminal,
}: {
  snapshot: string;
  tmuxSessionName?: string;
  workSessionId?: Id<'workSessions'>;
  isTerminal?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [rtcConnected, setRtcConnected] = useState(false);
  const processedSignalsRef = useRef(new Set<string>());
  const { resolvedTheme } = useTheme();

  const terminalTheme = useMemo(
    () =>
      resolvedTheme === 'dark' ? TERMINAL_THEME_DARK : TERMINAL_THEME_LIGHT,
    [resolvedTheme],
  );

  const canUseRtc = Boolean(tmuxSessionName && workSessionId && !isTerminal);

  const sendSignal = useMutation(api.agentBridge.mutations.sendTerminalSignal);

  const signals = useCachedQuery(
    api.agentBridge.queries.getTerminalSignals,
    canUseRtc && workSessionId
      ? { workSessionId, for: 'browser' as const }
      : 'skip',
  );

  // Process incoming signals from bridge
  useEffect(() => {
    if (!signals || !pcRef.current) return;

    for (const signal of signals) {
      if (processedSignalsRef.current.has(signal._id)) continue;
      processedSignalsRef.current.add(signal._id);

      if (signal.type === 'answer') {
        const answer = JSON.parse(signal.data);
        void pcRef.current
          .setRemoteDescription(new RTCSessionDescription(answer))
          .catch(() => {});
      } else if (signal.type === 'candidate') {
        const candidate = JSON.parse(signal.data);
        void pcRef.current
          .addIceCandidate(
            new RTCIceCandidate({
              candidate: candidate.candidate,
              sdpMid: candidate.sdpMid ?? '0',
            }),
          )
          .catch(() => {});
      }
    }
  }, [signals]);

  // Initialize xterm.js (only once, stable deps)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || terminalRef.current) return;

    const terminal = new Terminal({
      allowTransparency: false,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: 'block',
      disableStdin: false,
      drawBoldTextInBrightColors: true,
      fontFamily:
        '"SF Mono", SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      scrollback: 5000,
      theme: terminalTheme,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    fitAddon.fit();
    terminal.focus();

    // Forward ALL keystrokes to DataChannel
    terminal.onData(data => {
      const dc = dcRef.current;
      if (dc && dc.readyState === 'open') {
        dc.send(data);
      }
    });

    // Also forward binary data (special keys)
    terminal.onBinary(data => {
      const dc = dcRef.current;
      if (dc && dc.readyState === 'open') {
        dc.send(data);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const dc = dcRef.current;
      const dims = fitAddon.proposeDimensions();
      if (dc && dc.readyState === 'open' && dims) {
        dc.send(
          CONTROL_PREFIX +
            JSON.stringify({
              type: 'resize',
              cols: dims.cols,
              rows: dims.rows,
            }),
        );
      }
    });
    resizeObserver.observe(container);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update theme without recreating terminal
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.theme = terminalTheme;
  }, [terminalTheme]);

  // WebRTC connection — separate from terminal lifecycle
  useEffect(() => {
    if (!canUseRtc || !workSessionId || !tmuxSessionName) return;

    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) return;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    pcRef.current = pc;

    const dc = pc.createDataChannel('terminal', { ordered: true });
    dcRef.current = dc;

    dc.binaryType = 'arraybuffer';

    dc.onopen = () => {
      setRtcConnected(true);
      terminal.clear();
      terminal.focus();

      // Send initial resize so PTY matches browser dimensions
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        dc.send(
          CONTROL_PREFIX +
            JSON.stringify({
              type: 'resize',
              cols: dims.cols,
              rows: dims.rows,
            }),
        );
      }
    };

    dc.onmessage = event => {
      terminal.write(
        typeof event.data === 'string'
          ? event.data
          : new Uint8Array(event.data),
      );
    };

    dc.onclose = () => {
      setRtcConnected(false);
      dcRef.current = null;
    };

    pc.onicecandidate = event => {
      if (event.candidate) {
        void sendSignal({
          workSessionId,
          from: 'browser',
          type: 'candidate',
          data: JSON.stringify({
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
          }),
        });
      }
    };

    // Create and send offer
    void (async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await sendSignal({
        workSessionId,
        from: 'browser',
        type: 'offer',
        data: JSON.stringify({
          sdp: offer.sdp,
          type: offer.type,
        }),
      });
    })();

    return () => {
      dc.close();
      pc.close();
      dcRef.current = null;
      pcRef.current = null;
      setRtcConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseRtc, workSessionId, tmuxSessionName]);

  // Render snapshots only when NOT connected via WebRTC
  useEffect(() => {
    if (rtcConnected) return;
    const terminal = terminalRef.current;
    if (!terminal) return;

    terminal.write('\u001b[2J\u001b[H');
    if (snapshot.trim()) {
      // For snapshot mode, manually convert line endings
      terminal.write(snapshot.replace(/\r?\n/g, '\r\n'));
    }
    fitAddonRef.current?.fit();
  }, [snapshot, rtcConnected]);

  return (
    <div
      className='overflow-hidden rounded-md'
      onClick={() => terminalRef.current?.focus()}
    >
      <div
        ref={containerRef}
        className='vector-terminal h-[350px] w-full'
        style={{ backgroundColor: terminalTheme.background }}
      />
    </div>
  );
}
