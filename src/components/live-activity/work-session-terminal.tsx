'use client';

import { useEffect, useMemo, useRef, useCallback } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { useTheme } from 'next-themes';
import { useMutation } from '@/lib/convex';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { cn } from '@/lib/utils';

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
  terminalUrl,
  terminalToken,
  terminalLocalPort,
  workSessionId,
  isTerminal,
  canInteract: canInteractProp,
  fullscreen,
}: {
  snapshot: string;
  terminalUrl?: string;
  terminalToken?: string;
  terminalLocalPort?: number;
  workSessionId?: Id<'workSessions'>;
  isTerminal?: boolean;
  canInteract?: boolean;
  fullscreen?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const connectedRef = useRef(false);
  const { resolvedTheme } = useTheme();

  const terminalTheme = useMemo(
    () =>
      resolvedTheme === 'dark' ? TERMINAL_THEME_DARK : TERMINAL_THEME_LIGHT,
    [resolvedTheme],
  );

  // Only allow interaction if the session is active AND the user has controller access
  const canInteract = Boolean(
    workSessionId && !isTerminal && (canInteractProp ?? true),
  );
  const setViewer = useMutation(api.agentBridge.mutations.setTerminalViewer);

  // Initialize xterm.js (once)
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
        '"SF Mono", SFMono-Regular, ui-monospace, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
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

    // Forward keystrokes to WebSocket (only if user has controller access)
    terminal.onData(data => {
      if (!canInteract) return;
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
    terminal.onBinary(data => {
      if (!canInteract) return;
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (!canInteract) return; // Viewers can't resize the pane
      const ws = wsRef.current;
      const dims = fitAddon.proposeDimensions();
      if (ws && ws.readyState === WebSocket.OPEN && dims) {
        ws.send(
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

  // Update theme
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.theme = terminalTheme;
  }, [terminalTheme]);

  // Tell bridge a viewer is active (triggers PTY + tunnel)
  useEffect(() => {
    if (!canInteract || !workSessionId) return;

    const fitAddon = fitAddonRef.current;
    const dims = fitAddon?.proposeDimensions();

    void setViewer({
      workSessionId,
      active: true,
      cols: dims?.cols ?? 80,
      rows: dims?.rows ?? 24,
    });

    return () => {
      void setViewer({ workSessionId, active: false });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canInteract, workSessionId]);

  // Connect to WebSocket — try localhost first for low latency, fall back to tunnel
  useEffect(() => {
    if (!terminalToken || !terminalRef.current) return;
    if (!terminalUrl && !terminalLocalPort) return;

    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    let currentWs: WebSocket | null = null;

    function attachWs(ws: WebSocket): void {
      currentWs = ws;
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(
          '[Terminal] Connected via',
          ws.url.includes('localhost') ? 'localhost' : 'tunnel',
        );
        connectedRef.current = true;
        terminal.clear();
        terminal.focus();

        // Only controllers can resize the pane
        if (canInteract) {
          const dims = fitAddon?.proposeDimensions();
          if (dims) {
            ws.send(
              CONTROL_PREFIX +
                JSON.stringify({
                  type: 'resize',
                  cols: dims.cols,
                  rows: dims.rows,
                }),
            );
          }
        }
      };

      ws.onmessage = event => {
        if (typeof event.data === 'string') {
          terminal.write(event.data);
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          connectedRef.current = false;
          wsRef.current = null;
        }
      };

      ws.onerror = () => {};
    }

    // Try localhost first (near-zero latency)
    if (terminalLocalPort) {
      const localUrl = `ws://localhost:${terminalLocalPort}`;
      console.log('[Terminal] Trying localhost:', localUrl);
      const localWs = new WebSocket(
        `${localUrl}?token=${encodeURIComponent(terminalToken)}`,
      );

      const fallbackTimer = setTimeout(() => {
        // If localhost didn't connect in 1s, try tunnel
        if (localWs.readyState !== WebSocket.OPEN && terminalUrl) {
          console.log('[Terminal] Localhost timeout, falling back to tunnel');
          localWs.close();
          const tunnelWs = new WebSocket(
            `${terminalUrl}?token=${encodeURIComponent(terminalToken)}`,
          );
          attachWs(tunnelWs);
        }
      }, 1000);

      localWs.onopen = () => {
        clearTimeout(fallbackTimer);
        attachWs(localWs);
        // Re-trigger onopen since we just attached
        connectedRef.current = true;
        terminal.clear();
        terminal.focus();
        const dims = fitAddon?.proposeDimensions();
        if (dims) {
          localWs.send(
            CONTROL_PREFIX +
              JSON.stringify({
                type: 'resize',
                cols: dims.cols,
                rows: dims.rows,
              }),
          );
        }
        console.log('[Terminal] Connected via localhost');
      };

      localWs.onerror = () => {
        clearTimeout(fallbackTimer);
        if (terminalUrl) {
          console.log('[Terminal] Localhost failed, using tunnel');
          const tunnelWs = new WebSocket(
            `${terminalUrl}?token=${encodeURIComponent(terminalToken)}`,
          );
          attachWs(tunnelWs);
        }
      };
    } else if (terminalUrl) {
      // No local port available, use tunnel directly
      const tunnelWs = new WebSocket(
        `${terminalUrl}?token=${encodeURIComponent(terminalToken)}`,
      );
      attachWs(tunnelWs);
    }

    return () => {
      currentWs?.close();
      wsRef.current = null;
      connectedRef.current = false;
    };
  }, [terminalUrl, terminalToken, terminalLocalPort]);

  // Render snapshot fallback when not connected via WebSocket
  useEffect(() => {
    if (connectedRef.current) return;
    const terminal = terminalRef.current;
    if (!terminal || !snapshot) return;

    terminal.write('\u001b[2J\u001b[H');
    terminal.write(snapshot.replace(/\r?\n/g, '\r\n'));
    fitAddonRef.current?.fit();
  }, [snapshot]);

  return (
    <div
      className={cn('overflow-hidden', fullscreen ? 'h-full' : 'rounded-md')}
      onClick={() => terminalRef.current?.focus()}
    >
      <div
        ref={containerRef}
        className={cn(
          'vector-terminal w-full',
          fullscreen ? 'h-full' : 'h-[350px]',
        )}
        style={{ backgroundColor: terminalTheme.background }}
      />
    </div>
  );
}
