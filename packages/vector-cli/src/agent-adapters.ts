import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { homedir, userInfo } from 'os';
import { basename, join } from 'path';
import type { AgentProvider } from '../../../convex/_shared/agentBridge';

export type BridgeProvider =
  'codex' | 'claude_code' | 'cursor' | 'copilot' | 'opencode' | 'pi';

export interface SessionProcessRecord {
  provider: AgentProvider;
  providerLabel: string;
  localProcessId?: string;
  sessionKey: string;
  cwd?: string;
  repoRoot?: string;
  branch?: string;
  title?: string;
  model?: string;
  permissionMode?: 'plan' | 'ask' | 'bypass';
  thinkingLevel?: 'off' | 'low' | 'medium' | 'high' | 'max' | 'xhigh';
  fastMode?: boolean;
  contextLength?: 'default' | 'extended';
  tmuxSessionName?: string;
  tmuxWindowName?: string;
  tmuxPaneId?: string;
  mode: 'observed' | 'managed';
  status: 'observed' | 'waiting';
  supportsInboundMessages: boolean;
}

export interface SessionRunResult extends SessionProcessRecord {
  responseText?: string;
  launchCommand: string;
}

export type AgentSessionEventRole =
  | 'assistant'
  | 'reasoning'
  | 'tool'
  | 'system'
  | 'error'
  | 'auth_request'
  | 'compaction'
  | 'status';

export interface AgentSessionEvent {
  provider: BridgeProvider;
  role: AgentSessionEventRole;
  text: string;
  title?: string;
  status?: 'in_progress' | 'completed' | 'failed';
}

export type AgentSessionEventHandler = (
  event: AgentSessionEvent,
) => Promise<void> | void;

const LSOF_PATHS = ['/usr/sbin/lsof', '/usr/bin/lsof'];
const VECTOR_BRIDGE_CLIENT_VERSION = '0.1.0';

export function discoverAttachableSessions(): SessionProcessRecord[] {
  return dedupeSessions([
    ...discoverTmuxSessions(),
    ...discoverCodexSessions(),
    ...discoverClaudeSessions(),
  ]);
}

export async function launchProviderSession(
  provider: BridgeProvider,
  cwd: string,
  prompt: string,
  onEvent?: AgentSessionEventHandler,
  signal?: AbortSignal,
): Promise<SessionRunResult> {
  if (provider === 'codex') {
    return runCodexAppServerTurn({
      cwd,
      prompt,
      launchCommand: 'codex app-server',
      onEvent,
      signal,
    });
  }

  if (provider === 'claude_code') {
    return runClaudeSdkTurn({
      cwd,
      prompt,
      launchCommand: '@anthropic-ai/claude-agent-sdk query()',
      onEvent,
      signal,
    });
  }

  return runGenericCliAgentTurn({
    provider,
    cwd,
    prompt,
    launchCommand: genericProviderLaunchCommand(provider),
    onEvent,
    signal,
  });
}

export async function resumeProviderSession(
  provider: BridgeProvider,
  sessionKey: string,
  cwd: string,
  prompt: string,
  onEvent?: AgentSessionEventHandler,
  signal?: AbortSignal,
): Promise<SessionRunResult> {
  if (provider === 'codex') {
    return runCodexAppServerTurn({
      cwd,
      prompt,
      sessionKey,
      launchCommand: 'codex app-server (thread/resume)',
      onEvent,
      signal,
    });
  }

  if (provider === 'claude_code') {
    return runClaudeSdkTurn({
      cwd,
      prompt,
      sessionKey,
      launchCommand: '@anthropic-ai/claude-agent-sdk query(resume)',
      onEvent,
      signal,
    });
  }

  throw new Error(
    `${providerLabel(provider)} sessions cannot be resumed reliably by this CLI yet. Start a new session instead.`,
  );
}

async function runGenericCliAgentTurn(args: {
  provider: Exclude<BridgeProvider, 'codex' | 'claude_code'>;
  cwd: string;
  prompt: string;
  sessionKey?: string;
  launchCommand: string;
  onEvent?: AgentSessionEventHandler;
  signal?: AbortSignal;
}): Promise<SessionRunResult> {
  throwIfAborted(args.signal);
  const command = genericProviderCommand(args.provider);
  const child = spawn(command.bin, [...command.args, args.prompt], {
    cwd: args.cwd,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  const abort = () => child.kill('SIGTERM');
  args.signal?.addEventListener('abort', abort, { once: true });
  await Promise.resolve(
    args.onEvent?.({
      provider: args.provider,
      role: 'status',
      text: `Starting ${providerLabel(args.provider)} CLI session`,
      status: 'in_progress',
    }),
  );

  child.stdout.on('data', chunk => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', chunk => {
    stderr += chunk.toString();
  });

  const exit = await new Promise<{
    code: number | null;
    signal: string | null;
  }>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal }));
  }).finally(() => {
    args.signal?.removeEventListener('abort', abort);
  });

  throwIfAborted(args.signal);

  if (exit.code && exit.code !== 0) {
    const message =
      stderr.trim() ||
      `${providerLabel(args.provider)} exited with code ${exit.code}`;
    await Promise.resolve(
      args.onEvent?.({
        provider: args.provider,
        role: 'error',
        text: message,
        title: `${providerLabel(args.provider)} failed`,
        status: 'failed',
      }),
    );
    throw new Error(message);
  }

  const responseText = stdout.trim();
  if (responseText) {
    await Promise.resolve(
      args.onEvent?.({
        provider: args.provider,
        role: 'assistant',
        text: responseText,
        status: 'completed',
      }),
    );
  }

  return {
    provider: args.provider,
    providerLabel: providerLabel(args.provider),
    sessionKey: args.sessionKey ?? `${args.provider}:${Date.now()}`,
    cwd: args.cwd,
    ...getGitInfo(args.cwd),
    title:
      summarizeTitle(responseText, args.cwd) ?? providerLabel(args.provider),
    mode: 'managed',
    status: 'waiting',
    supportsInboundMessages: false,
    responseText,
    launchCommand: args.launchCommand,
  };
}

function genericProviderCommand(
  provider: Exclude<BridgeProvider, 'codex' | 'claude_code'>,
): { bin: string; args: string[] } {
  if (provider === 'cursor') return { bin: 'cursor-agent', args: ['--print'] };
  if (provider === 'copilot') return { bin: 'copilot', args: [] };
  if (provider === 'opencode') return { bin: 'opencode', args: ['run'] };
  return { bin: 'pi', args: [] };
}

function genericProviderLaunchCommand(
  provider: Exclude<BridgeProvider, 'codex' | 'claude_code'>,
): string {
  const command = genericProviderCommand(provider);
  return [command.bin, ...command.args].join(' ');
}

function providerLabel(provider: BridgeProvider): string {
  if (provider === 'codex') return 'Codex';
  if (provider === 'claude_code') return 'Claude';
  if (provider === 'cursor') return 'Cursor';
  if (provider === 'copilot') return 'GitHub Copilot';
  if (provider === 'opencode') return 'OpenCode';
  return 'Pi';
}

async function runCodexAppServerTurn(args: {
  cwd: string;
  prompt: string;
  sessionKey?: string;
  launchCommand: string;
  onEvent?: AgentSessionEventHandler;
  signal?: AbortSignal;
}): Promise<SessionRunResult> {
  throwIfAborted(args.signal);
  const child = spawn('codex', ['app-server'], {
    cwd: args.cwd,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stderr = '';
  let stdoutBuffer = '';
  let sessionKey = args.sessionKey;
  let finalAssistantText = '';
  let activeAssistantText = '';
  const eventWrites: Promise<void>[] = [];
  let completed = false;
  let nextRequestId = 1;
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  let completeTurn: (() => void) | undefined;
  let failTurn: ((error: Error) => void) | undefined;
  let activeTurnId: string | undefined;
  const turnCompleted = new Promise<void>((resolve, reject) => {
    completeTurn = () => {
      completed = true;
      resolve();
    };
    failTurn = error => {
      completed = true;
      reject(error);
    };
  });
  const emitEvent = (event: AgentSessionEvent): void => {
    eventWrites.push(Promise.resolve(args.onEvent?.(event)));
  };

  const waitForExit = new Promise<never>((_, reject) => {
    child.on('error', error => reject(error));
    child.on('close', code => {
      if (!completed) {
        const detail =
          stderr.trim() || `codex app-server exited with code ${code}`;
        reject(new Error(detail));
      }
    });
  });

  child.stdout.on('data', chunk => {
    stdoutBuffer += chunk.toString();

    while (true) {
      const newlineIndex = stdoutBuffer.indexOf('\n');
      if (newlineIndex < 0) {
        break;
      }

      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (!line) {
        continue;
      }

      const payload = tryParseJson(line);
      if (!payload || typeof payload !== 'object') {
        continue;
      }

      const responseId = readProperty(payload, 'id');
      if (typeof responseId === 'number' && pending.has(responseId)) {
        const entry = pending.get(responseId)!;
        pending.delete(responseId);
        const errorRecord = asObject(readProperty(payload, 'error'));
        if (errorRecord) {
          entry.reject(
            new Error(
              `codex app-server error: ${asString(errorRecord.message) ?? 'Unknown JSON-RPC error'}`,
            ),
          );
          continue;
        }

        entry.resolve(readProperty(payload, 'result'));
        continue;
      }

      const method = asString(readProperty(payload, 'method'));
      const params = asObject(readProperty(payload, 'params'));
      if (!method || !params) {
        continue;
      }

      if (method === 'thread/started') {
        sessionKey =
          asString(asObject(params.thread)?.id) ??
          asString(asObject(params.thread)?.threadId) ??
          sessionKey;
        continue;
      }

      if (method === 'item/agentMessage/delta') {
        const delta = asString(params.delta) ?? '';
        finalAssistantText += delta;
        activeAssistantText += delta;
        continue;
      }

      if (method === 'item/completed') {
        const item = asObject(params.item);
        const itemType = asString(item?.type);
        if (itemType === 'agentMessage') {
          finalAssistantText = asString(item?.text) ?? finalAssistantText;
          const text = finalAssistantText || activeAssistantText;
          if (text.trim()) {
            emitEvent({
              provider: 'codex',
              role: 'assistant',
              text: text.trim(),
              status: 'completed',
            });
          }
          activeAssistantText = '';
        } else if (itemType === 'reasoning') {
          const text = asString(item?.text) ?? asString(item?.summary);
          if (text?.trim()) {
            emitEvent({
              provider: 'codex',
              role: 'reasoning',
              text: text.trim(),
              status: 'completed',
            });
          }
        } else if (itemType === 'toolCall') {
          const title =
            asString(item?.title) ??
            asString(item?.name) ??
            asString(item?.command) ??
            'Tool';
          const text =
            asString(item?.text) ??
            asString(item?.output) ??
            asString(item?.command) ??
            title;
          emitEvent({
            provider: 'codex',
            role: 'tool',
            title,
            text,
            status:
              asString(item?.status) === 'failed' ? 'failed' : 'completed',
          });
        }
        continue;
      }

      if (method === 'turn/completed') {
        const turn = asObject(params.turn);
        const status = asString(turn?.status);
        if (status === 'failed') {
          const turnError = asObject(turn?.error);
          emitEvent({
            provider: 'codex',
            role: 'error',
            title: 'Codex turn failed',
            text:
              asString(turnError?.message) ??
              'Codex turn failed without an error message',
            status: 'failed',
          });
          failTurn?.(
            new Error(
              asString(turnError?.message) ??
                'Codex turn failed without an error message',
            ),
          );
        } else if (status === 'interrupted') {
          emitEvent({
            provider: 'codex',
            role: 'status',
            text: 'Codex turn was interrupted',
            status: 'failed',
          });
          failTurn?.(new Error('Codex turn was interrupted'));
        } else {
          completeTurn?.();
        }
      }
      if (method === 'turn/started') {
        const turn = asObject(params.turn);
        activeTurnId =
          asString(turn?.id) ?? asString(turn?.turnId) ?? activeTurnId;
      }
    }
  });

  child.stderr.on('data', chunk => {
    stderr += chunk.toString();
  });

  const request = (method: string, params?: unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = nextRequestId++;
      pending.set(id, { resolve, reject });
      child.stdin.write(
        `${JSON.stringify({ method, id, params })}\n`,
        error => {
          if (!error) return;
          pending.delete(id);
          reject(error);
        },
      );
    });

  const notify = (method: string, params?: unknown): void => {
    if (!child.stdin.destroyed) {
      child.stdin.write(`${JSON.stringify({ method, params })}\n`);
    }
  };

  const abort = (): void => {
    if (sessionKey && activeTurnId) {
      notify('turn/interrupt', {
        threadId: sessionKey,
        turnId: activeTurnId,
      });
    }
    child.kill('SIGTERM');
    failTurn?.(new Error('Agent turn interrupted'));
  };
  if (typeof child.stdin.on === 'function') {
    child.stdin.on('error', error => {
      failTurn?.(error);
    });
  }
  args.signal?.addEventListener('abort', abort, { once: true });

  try {
    await Promise.race([
      request('initialize', {
        clientInfo: {
          name: 'vector_bridge',
          title: 'Vector Bridge',
          version: VECTOR_BRIDGE_CLIENT_VERSION,
        },
      }),
      waitForExit,
    ]);
    notify('initialized', {});

    const threadResult = asObject(
      await Promise.race([
        args.sessionKey
          ? request('thread/resume', {
              threadId: args.sessionKey,
              cwd: args.cwd,
              approvalPolicy: 'never',
              personality: 'pragmatic',
            })
          : request('thread/start', {
              cwd: args.cwd,
              approvalPolicy: 'never',
              personality: 'pragmatic',
              serviceName: 'vector_bridge',
            }),
        waitForExit,
      ]),
    );

    sessionKey =
      asString(asObject(readProperty(threadResult, 'thread'))?.id) ??
      asString(asObject(readProperty(threadResult, 'thread'))?.threadId) ??
      sessionKey;

    if (!sessionKey) {
      throw new Error('Codex app-server did not return a thread id');
    }

    await Promise.race([
      request('turn/start', {
        threadId: sessionKey,
        input: [{ type: 'text', text: args.prompt }],
        cwd: args.cwd,
        approvalPolicy: 'never',
        personality: 'pragmatic',
      }),
      waitForExit,
    ]);
    throwIfAborted(args.signal);

    await Promise.race([turnCompleted, waitForExit]);
    await Promise.allSettled(eventWrites);

    const gitInfo = getGitInfo(args.cwd);

    return {
      provider: 'codex',
      providerLabel: 'Codex',
      sessionKey,
      cwd: args.cwd,
      ...gitInfo,
      title: summarizeTitle(undefined, args.cwd),
      mode: 'managed',
      status: 'waiting',
      supportsInboundMessages: true,
      responseText: finalAssistantText.trim() || undefined,
      launchCommand: args.launchCommand,
    };
  } finally {
    args.signal?.removeEventListener('abort', abort);
    for (const entry of pending.values()) {
      entry.reject(
        new Error('codex app-server closed before request resolved'),
      );
    }
    pending.clear();
    child.kill();
  }
}

async function runClaudeSdkTurn(args: {
  cwd: string;
  prompt: string;
  sessionKey?: string;
  launchCommand: string;
  onEvent?: AgentSessionEventHandler;
  signal?: AbortSignal;
}): Promise<SessionRunResult> {
  throwIfAborted(args.signal);
  const { query } = await import('@anthropic-ai/claude-agent-sdk');

  const stream = query({
    prompt: args.prompt,
    options: {
      cwd: args.cwd,
      resume: args.sessionKey,
      persistSession: true,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      env: {
        ...process.env,
        CLAUDE_AGENT_SDK_CLIENT_APP: `vector-bridge/${VECTOR_BRIDGE_CLIENT_VERSION}`,
      },
    },
  });

  let sessionKey = args.sessionKey;
  let responseText = '';
  let emittedAssistantText = '';
  let model: string | undefined;
  const abort = (): void => {
    stream.close();
  };
  args.signal?.addEventListener('abort', abort, { once: true });

  try {
    for await (const message of stream) {
      throwIfAborted(args.signal);
      if (!message || typeof message !== 'object') {
        continue;
      }

      sessionKey = asString(readProperty(message, 'session_id')) ?? sessionKey;

      if (readProperty(message, 'type') === 'assistant') {
        const assistantText = extractClaudeMessageTexts(
          readProperty(message, 'message'),
        )
          .join('\n\n')
          .trim();
        if (assistantText) {
          responseText = assistantText;
          emittedAssistantText = assistantText;
          await args.onEvent?.({
            provider: 'claude_code',
            role: 'assistant',
            text: assistantText,
            status: 'completed',
          });
        }
        continue;
      }

      if (readProperty(message, 'type') !== 'result') {
        continue;
      }

      if (readProperty(message, 'subtype') === 'success') {
        const resultText = asString(readProperty(message, 'result'));
        if (resultText) {
          responseText = resultText;
          if (resultText !== emittedAssistantText) {
            await args.onEvent?.({
              provider: 'claude_code',
              role: 'assistant',
              text: resultText,
              status: 'completed',
            });
            emittedAssistantText = resultText;
          }
        }
        model = firstObjectKey(readProperty(message, 'modelUsage'));
        continue;
      }

      const errors = readProperty(message, 'errors');
      const detail =
        Array.isArray(errors) && errors.length > 0
          ? errors.join('\n')
          : 'Claude execution failed';
      throw new Error(detail);
    }
  } finally {
    args.signal?.removeEventListener('abort', abort);
    stream.close();
  }

  throwIfAborted(args.signal);

  if (!sessionKey) {
    throw new Error('Claude Agent SDK did not return a session id');
  }

  const gitInfo = getGitInfo(args.cwd);

  return {
    provider: 'claude_code',
    providerLabel: 'Claude',
    sessionKey,
    cwd: args.cwd,
    ...gitInfo,
    title: summarizeTitle(undefined, args.cwd),
    model,
    mode: 'managed',
    status: 'waiting',
    supportsInboundMessages: true,
    responseText: responseText.trim() || undefined,
    launchCommand: args.launchCommand,
  };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error('Agent turn interrupted');
  }
}

function discoverCodexSessions(): SessionProcessRecord[] {
  const historyBySession = buildCodexHistoryIndex();

  return listLiveProcessIds('codex')
    .flatMap(pid => {
      const transcriptPath = getCodexTranscriptPath(pid);
      if (!transcriptPath) {
        return [];
      }

      const processCwd = getProcessCwd(pid);
      const parsed = parseObservedCodexSession(
        pid,
        transcriptPath,
        processCwd,
        historyBySession,
      );
      return parsed ? [parsed] : [];
    })
    .sort(compareObservedSessions);
}

function discoverClaudeSessions(): SessionProcessRecord[] {
  const historyBySession = buildClaudeHistoryIndex();

  return listLiveProcessIds('claude')
    .flatMap(pid => {
      const sessionMeta = readClaudePidSession(pid);
      if (!sessionMeta?.sessionId) {
        return [];
      }

      const transcriptPath = findClaudeTranscriptPath(sessionMeta.sessionId);
      const parsed = parseObservedClaudeSession(
        pid,
        sessionMeta,
        transcriptPath,
        historyBySession,
      );
      return parsed ? [parsed] : [];
    })
    .sort(compareObservedSessions);
}

function discoverTmuxSessions(): SessionProcessRecord[] {
  try {
    const output = execSync(
      "tmux list-panes -a -F '#{pane_id}\t#{pane_pid}\t#{session_name}\t#{window_name}\t#{pane_current_path}\t#{pane_current_command}\t#{pane_title}'",
      {
        encoding: 'utf-8',
        timeout: 3000,
      },
    );

    return output
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .flatMap(line => {
        const [
          paneId,
          panePid,
          sessionName,
          windowName,
          cwd,
          currentCommand,
          paneTitle,
        ] = line.split('\t');

        if (!paneId || !panePid || !sessionName || !windowName || !cwd) {
          return [];
        }

        const normalizedCommand = (currentCommand ?? '').trim().toLowerCase();
        if (normalizedCommand === 'codex' || normalizedCommand === 'claude') {
          return [];
        }

        const gitInfo = getGitInfo(cwd);
        const title = summarizeTitle(
          buildTmuxPaneTitle({
            paneTitle,
            sessionName,
            windowName,
            cwd,
            currentCommand,
          }),
          cwd,
        );

        return [
          {
            provider: 'vector_cli' as const,
            providerLabel: 'Tmux',
            localProcessId: panePid,
            sessionKey: `tmux:${paneId}`,
            cwd,
            ...gitInfo,
            title,
            tmuxSessionName: sessionName,
            tmuxWindowName: windowName,
            tmuxPaneId: paneId,
            mode: 'observed' as const,
            status: 'observed' as const,
            supportsInboundMessages: true as const,
          },
        ];
      })
      .sort(compareObservedSessions);
  } catch {
    return [];
  }
}

function getCodexHistoryFile(): string {
  return join(getRealHomeDir(), '.codex', 'history.jsonl');
}

function getClaudeProjectsDir(): string {
  return join(getRealHomeDir(), '.claude', 'projects');
}

function getClaudeSessionStateDir(): string {
  return join(getRealHomeDir(), '.claude', 'sessions');
}

function getClaudeHistoryFile(): string {
  return join(getRealHomeDir(), '.claude', 'history.jsonl');
}

function getRealHomeDir(): string {
  try {
    const realHome = userInfo().homedir?.trim();
    if (realHome) {
      return realHome;
    }
  } catch {
    /* fall back */
  }

  return homedir();
}

function resolveExecutable(
  fallbackCommand: string,
  absoluteCandidates: string[],
): string | undefined {
  for (const candidate of absoluteCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    const output = execSync(`command -v ${fallbackCommand}`, {
      encoding: 'utf-8',
      timeout: 1000,
    }).trim();
    return output || undefined;
  } catch {
    return undefined;
  }
}

function listLiveProcessIds(commandName: string): string[] {
  try {
    const output = execSync('ps -axo pid=,comm=', {
      encoding: 'utf-8',
      timeout: 3000,
    });

    return output
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => line.split(/\s+/, 2))
      .filter(([, command]) => command === commandName)
      .map(([pid]) => pid)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getProcessCwd(pid: string): string | undefined {
  const lsofCommand = resolveExecutable('lsof', LSOF_PATHS);
  if (!lsofCommand) {
    return undefined;
  }

  try {
    const output = execSync(`${lsofCommand} -a -p ${pid} -Fn -d cwd`, {
      encoding: 'utf-8',
      timeout: 3000,
    });

    return output
      .split('\n')
      .map(line => line.trim())
      .find(line => line.startsWith('n'))
      ?.slice(1);
  } catch {
    return undefined;
  }
}

function getCodexTranscriptPath(pid: string): string | undefined {
  const lsofCommand = resolveExecutable('lsof', LSOF_PATHS);
  if (!lsofCommand) {
    return undefined;
  }

  try {
    const output = execSync(`${lsofCommand} -p ${pid} -Fn`, {
      encoding: 'utf-8',
      timeout: 3000,
    });

    return output
      .split('\n')
      .map(line => line.trim())
      .find(
        line =>
          line.startsWith('n') &&
          line.includes('/.codex/sessions/') &&
          line.endsWith('.jsonl'),
      )
      ?.slice(1);
  } catch {
    return undefined;
  }
}

function readClaudePidSession(
  pid: string,
): { sessionId: string; cwd?: string; startedAt?: number } | null {
  const path = join(getClaudeSessionStateDir(), `${pid}.json`);
  if (!existsSync(path)) {
    return null;
  }

  try {
    const payload = JSON.parse(readFileSync(path, 'utf-8'));
    const sessionId = asString(payload.sessionId);
    if (!sessionId) {
      return null;
    }

    return {
      sessionId,
      cwd: asString(payload.cwd),
      startedAt:
        typeof payload.startedAt === 'number' ? payload.startedAt : undefined,
    };
  } catch {
    return null;
  }
}

function findClaudeTranscriptPath(sessionId: string): string | undefined {
  return findJsonlFileByStem(getClaudeProjectsDir(), sessionId);
}

function findJsonlFileByStem(root: string, stem: string): string | undefined {
  if (!existsSync(root)) {
    return undefined;
  }

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = findJsonlFileByStem(path, stem);
      if (nested) {
        return nested;
      }
      continue;
    }

    if (entry.isFile() && entry.name === `${stem}.jsonl`) {
      return path;
    }
  }

  return undefined;
}

function readJsonLines(path: string): unknown[] {
  try {
    return readFileSync(path, 'utf-8')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(tryParseJson)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function dedupeSessions(
  sessions: SessionProcessRecord[],
): SessionProcessRecord[] {
  const seen = new Set<string>();
  return sessions.filter(session => {
    const key = `${session.provider}:${session.localProcessId ?? session.sessionKey}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function compareObservedSessions(
  a: SessionProcessRecord,
  b: SessionProcessRecord,
): number {
  return Number(b.localProcessId ?? 0) - Number(a.localProcessId ?? 0);
}

function parseObservedCodexSession(
  pid: string,
  transcriptPath: string,
  processCwd?: string,
  historyBySession?: Map<string, string[]>,
): SessionProcessRecord | null {
  const entries = readJsonLines(transcriptPath);
  let sessionKey: string | undefined;
  let cwd = processCwd;
  const userMessages: string[] = [];
  const assistantMessages: string[] = [];

  for (const rawEntry of entries) {
    const entry = asObject(rawEntry);
    if (!entry) {
      continue;
    }

    if (entry.type === 'session_meta') {
      const payload = asObject(entry.payload);
      sessionKey = asString(payload?.id) ?? sessionKey;
      cwd = asString(payload?.cwd) ?? cwd;
    }

    if (entry.type === 'event_msg') {
      const payload = asObject(entry.payload);
      if (payload?.type === 'user_message') {
        pushIfPresent(userMessages, payload.message);
      }
    }

    if (
      entry.type === 'response_item' &&
      asObject(entry.payload)?.type === 'message' &&
      asObject(entry.payload)?.role === 'user'
    ) {
      userMessages.push(
        ...extractTextSegments(asObject(entry.payload)?.content),
      );
    }

    if (entry.type === 'event_msg') {
      const payload = asObject(entry.payload);
      if (payload?.type === 'agent_message') {
        pushIfPresent(assistantMessages, payload.message);
      }
    }

    if (
      entry.type === 'response_item' &&
      asObject(entry.payload)?.type === 'message' &&
      asObject(entry.payload)?.role === 'assistant'
    ) {
      assistantMessages.push(
        ...extractTextSegments(asObject(entry.payload)?.content),
      );
    }
  }

  if (!sessionKey) {
    return null;
  }

  const gitInfo = cwd ? getGitInfo(cwd) : {};
  const historyTitle = sessionKey
    ? selectSessionTitle(historyBySession?.get(sessionKey) ?? [])
    : undefined;

  return {
    provider: 'codex',
    providerLabel: 'Codex',
    localProcessId: pid,
    sessionKey,
    cwd,
    ...gitInfo,
    title: summarizeTitle(
      historyTitle ??
        selectSessionTitle(userMessages) ??
        selectSessionTitle(assistantMessages),
      cwd,
    ),
    mode: 'observed',
    status: 'observed',
    supportsInboundMessages: true,
  };
}

function parseObservedClaudeSession(
  pid: string,
  sessionMeta: { sessionId: string; cwd?: string; startedAt?: number },
  transcriptPath?: string,
  historyBySession?: Map<string, string[]>,
): SessionProcessRecord | null {
  const entries = transcriptPath ? readJsonLines(transcriptPath) : [];
  let cwd = sessionMeta.cwd;
  let branch: string | undefined;
  let model: string | undefined;
  const userMessages: string[] = [];
  const assistantMessages: string[] = [];

  for (const rawEntry of entries) {
    const entry = asObject(rawEntry);
    if (!entry) {
      continue;
    }

    cwd = asString(entry.cwd) ?? cwd;
    branch = asString(entry.gitBranch) ?? branch;

    if (entry.type === 'user') {
      userMessages.push(...extractClaudeMessageTexts(entry.message));
    }

    if (entry.type === 'assistant') {
      const message = asObject(entry.message);
      model = asString(message?.model) ?? model;
      assistantMessages.push(...extractClaudeMessageTexts(entry.message));
    }
  }

  const gitInfo = cwd ? getGitInfo(cwd) : {};
  const historyTitle = selectSessionTitle(
    historyBySession?.get(sessionMeta.sessionId) ?? [],
  );

  return {
    provider: 'claude_code',
    providerLabel: 'Claude',
    localProcessId: pid,
    sessionKey: sessionMeta.sessionId,
    cwd,
    repoRoot: gitInfo.repoRoot,
    branch: branch ?? gitInfo.branch,
    title: summarizeTitle(
      historyTitle ??
        selectSessionTitle(userMessages) ??
        selectSessionTitle(assistantMessages),
      cwd,
    ),
    model,
    mode: 'observed',
    status: 'observed',
    supportsInboundMessages: true,
  };
}

function summarizeTitle(message: string | undefined, cwd?: string): string {
  if (message) {
    return truncate(message.replace(/\s+/g, ' ').trim(), 96);
  }

  if (cwd) {
    return basename(cwd);
  }

  return 'Local session';
}

function buildTmuxPaneTitle(args: {
  paneTitle?: string;
  sessionName: string;
  windowName: string;
  cwd: string;
  currentCommand?: string;
}): string {
  const paneTitle = cleanSessionTitleCandidate(args.paneTitle ?? '');
  if (paneTitle) {
    return paneTitle;
  }

  const command = asString(args.currentCommand);
  if (command && !['zsh', 'bash', 'fish', 'sh', 'nu'].includes(command)) {
    return `${command} in ${basename(args.cwd)}`;
  }

  return `${basename(args.cwd)} (${args.sessionName}:${args.windowName})`;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength
    ? `${value.slice(0, maxLength - 3).trimEnd()}...`
    : value;
}

function firstObjectKey(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const [firstKey] = Object.keys(value);
  return firstKey ? normalizeModelKey(firstKey) : undefined;
}

function normalizeModelKey(value: string): string | undefined {
  const normalized = stripAnsi(value)
    .replace(/\[\d+(?:;\d+)*m$/g, '')
    .trim();
  return normalized || undefined;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function readProperty(value: unknown, key: string): unknown {
  return isRecord(value) ? Reflect.get(value, key) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function pushIfPresent(target: string[], value: unknown): void {
  const text = asString(value);
  if (text) {
    target.push(text);
  }
}

function extractClaudeMessageTexts(message: unknown): string[] {
  if (!message || typeof message !== 'object') {
    return [];
  }

  return extractTextSegments((message as { content?: unknown }).content);
}

function extractTextSegments(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(extractTextSegmentFromBlock).filter(Boolean);
}

function extractTextSegmentFromBlock(block: unknown): string[] {
  if (!block || typeof block !== 'object') {
    return [];
  }

  const typedBlock = block as {
    type?: unknown;
    text?: unknown;
    content?: unknown;
  };

  const blockType = asString(typedBlock.type);
  if (blockType && isIgnoredContentBlockType(blockType)) {
    return [];
  }

  const directText = asString(typedBlock.text);
  if (directText) {
    return [directText];
  }

  if (typeof typedBlock.content === 'string') {
    return [typedBlock.content];
  }

  return [];
}

function isIgnoredContentBlockType(blockType: string): boolean {
  return [
    'tool_result',
    'tool_use',
    'image',
    'thinking',
    'reasoning',
    'contextCompaction',
  ].includes(blockType);
}

function buildCodexHistoryIndex(): Map<string, string[]> {
  const historyBySession = new Map<string, string[]>();

  for (const rawEntry of readJsonLines(getCodexHistoryFile())) {
    const entry = asObject(rawEntry);
    if (!entry) {
      continue;
    }

    const sessionId = asString(entry.session_id);
    const text = asString(entry.text);
    if (!sessionId || !text) {
      continue;
    }

    appendHistoryEntry(historyBySession, sessionId, text);
  }

  return historyBySession;
}

function buildClaudeHistoryIndex(): Map<string, string[]> {
  const historyBySession = new Map<string, string[]>();

  for (const rawEntry of readJsonLines(getClaudeHistoryFile())) {
    const entry = asObject(rawEntry);
    if (!entry) {
      continue;
    }

    const sessionId = asString(entry.sessionId);
    if (!sessionId) {
      continue;
    }

    const texts = extractClaudeHistoryTexts(entry);
    for (const text of texts) {
      appendHistoryEntry(historyBySession, sessionId, text);
    }
  }

  return historyBySession;
}

function appendHistoryEntry(
  historyBySession: Map<string, string[]>,
  sessionId: string,
  text: string,
): void {
  const existing = historyBySession.get(sessionId);
  if (existing) {
    existing.push(text);
    return;
  }

  historyBySession.set(sessionId, [text]);
}

function extractClaudeHistoryTexts(entry: unknown): string[] {
  if (!entry || typeof entry !== 'object') {
    return [];
  }

  const record = entry as {
    display?: unknown;
    pastedContents?: unknown;
  };

  const pastedTexts = extractClaudePastedTexts(record.pastedContents);
  if (pastedTexts.length > 0) {
    return pastedTexts;
  }

  const display = asString(record.display);
  return display ? [display] : [];
}

function extractClaudePastedTexts(value: unknown): string[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.values(value as Record<string, unknown>)
    .flatMap(item => {
      if (!item || typeof item !== 'object') {
        return [];
      }

      const record = item as {
        type?: unknown;
        content?: unknown;
      };

      return record.type === 'text' && typeof record.content === 'string'
        ? [record.content]
        : [];
    })
    .filter(Boolean);
}

function selectSessionTitle(messages: string[]): string | undefined {
  for (const message of messages) {
    const cleaned = cleanSessionTitleCandidate(message);
    if (cleaned) {
      return cleaned;
    }
  }

  return undefined;
}

function cleanSessionTitleCandidate(message: string): string | undefined {
  const normalized = stripAnsi(message).replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return undefined;
  }

  if (normalized.length < 4) {
    return undefined;
  }

  if (
    normalized.startsWith('/') ||
    looksLikeGeneratedTagEnvelope(normalized) ||
    looksLikeGeneratedImageSummary(normalized) ||
    looksLikeStandaloneImagePath(normalized) ||
    looksLikeInstructionScaffold(normalized)
  ) {
    return undefined;
  }

  return normalized;
}

function looksLikeGeneratedTagEnvelope(value: string): boolean {
  return /^<[\w:-]+>[\s\S]*<\/[\w:-]+>$/.test(value);
}

function looksLikeGeneratedImageSummary(value: string): boolean {
  return (
    /^\[image:/i.test(value) ||
    (/displayed at/i.test(value) && /coordinates/i.test(value))
  );
}

function looksLikeStandaloneImagePath(value: string): boolean {
  return (
    /^\/\S+\.(png|jpe?g|gif|webp|heic|bmp)$/i.test(value) ||
    /^file:\S+\.(png|jpe?g|gif|webp|heic|bmp)$/i.test(value)
  );
}

function looksLikeInstructionScaffold(value: string): boolean {
  if (value.length < 700) {
    return false;
  }

  const headingCount = value.match(/^#{1,3}\s/gm)?.length ?? 0;
  const tagCount = value.match(/<\/?[\w:-]+>/g)?.length ?? 0;
  const bulletCount = value.match(/^\s*[-*]\s/gm)?.length ?? 0;

  return headingCount + tagCount + bulletCount >= 6;
}

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;]*m/g, '');
}

function getGitInfo(cwd: string): { repoRoot?: string; branch?: string } {
  try {
    const repoRoot = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf-8',
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim();

    return {
      repoRoot: repoRoot || undefined,
      branch: branch || undefined,
    };
  } catch {
    return {};
  }
}
