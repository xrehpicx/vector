import * as acp from '@agentclientprotocol/sdk';
import type { SessionConfigOption } from '@agentclientprotocol/sdk';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { createRequire } from 'module';
import { realpathSync, statSync, type PathLike } from 'fs';
import { relative, resolve, sep } from 'path';
import { Readable, Writable } from 'stream';

export type CollaborationAcpProvider = 'codex' | 'claude_code';
export type CollaborationPermissionMode = 'ask' | 'plan';
export type CollaborationThinkingLevel =
  'off' | 'low' | 'medium' | 'high' | 'max' | 'xhigh';

export type CollaborationRunEventKind =
  | 'status'
  | 'thought'
  | 'plan'
  | 'tool'
  | 'terminal'
  | 'file'
  | 'permission'
  | 'message'
  | 'error';

export interface CollaborationRunEvent {
  sourceId?: string;
  kind: CollaborationRunEventKind;
  title: string;
  body?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface CollaborationAttachment {
  name: string;
  contentType?: string;
  url?: string;
}

export interface CollaborationContextMessage {
  actorLabel: string;
  body: string;
  createdAt: number;
  attachments?: CollaborationAttachment[];
}

export interface CollaborationPromptInput {
  runId: string;
  agentId: string;
  agentHandle: string;
  provider: CollaborationAcpProvider;
  channelId: string;
  channelLabel?: string;
  threadRootId?: string;
  triggerMessageId: string;
  authorLabel: string;
  body: string;
  attachments?: CollaborationAttachment[];
  contextMessages?: CollaborationContextMessage[];
  workspaceRoot: string;
  cwd?: string;
  model?: string;
  permissionMode?: CollaborationPermissionMode;
  thinkingLevel?: CollaborationThinkingLevel;
}

export interface CollaborationRunResult {
  runId: string;
  sessionId?: string;
  stopReason?: string;
  reply?: string;
  status: 'completed' | 'canceled' | 'failed';
  error?: string;
}

export interface CollaborationPermissionOption {
  optionId: string;
  name: string;
  kind?: string;
}

export interface CollaborationPermissionRequest {
  sessionId: string;
  title: string;
  description?: string;
  options: CollaborationPermissionOption[];
  metadata?: Record<string, unknown>;
}

export type CollaborationPermissionResponse =
  { outcome: 'cancelled' } | { outcome: 'selected'; optionId: string };

export interface AcpAdapterUpdate {
  event?: CollaborationRunEvent;
  textChunk?: string;
}

export interface CollaborationSessionConfiguration {
  model?: string;
  permissionMode?: CollaborationPermissionMode;
  thinkingLevel?: CollaborationThinkingLevel;
}

export interface CollaborationAcpAdapter {
  createSession(
    cwd: string,
    configuration?: CollaborationSessionConfiguration,
  ): Promise<{ sessionId: string; configurationWarnings?: string[] }>;
  prompt(
    sessionId: string,
    prompt: string,
    onUpdate: (update: AcpAdapterUpdate) => Promise<void> | void,
  ): Promise<{ stopReason: string }>;
  cancel(sessionId: string): Promise<void>;
  close(): Promise<void>;
}

export interface CollaborationAcpAdapterFactoryContext {
  agentId: string;
  provider: CollaborationAcpProvider;
  requestPermission: (
    request: CollaborationPermissionRequest,
  ) => Promise<CollaborationPermissionResponse>;
  onLog: (message: string) => void;
}

export type CollaborationAcpAdapterFactory = (
  context: CollaborationAcpAdapterFactoryContext,
) => CollaborationAcpAdapter;

interface QueuedPrompt {
  input: CollaborationPromptInput;
  cwd: string;
  canceled: boolean;
  resolve: (result: CollaborationRunResult) => void;
}

interface ConversationState {
  key: string;
  agentKey: string;
  cwd: string;
  pending: QueuedPrompt[];
  running: boolean;
  sessionId?: string;
  sessionConfigurationKey?: string;
}

interface AgentState {
  adapter: CollaborationAcpAdapter;
  activeRunBySession: Map<string, string>;
}

interface ActiveRun {
  input: CollaborationPromptInput;
  conversation: ConversationState;
  canceled: boolean;
}

interface PendingPermission {
  options: Set<string>;
  resolve: (response: CollaborationPermissionResponse) => void;
}

export interface CollaborationAcpRuntimeOptions {
  createAdapter?: CollaborationAcpAdapterFactory;
  onEvent?: (
    input: CollaborationPromptInput,
    event: CollaborationRunEvent,
  ) => Promise<void> | void;
  onStatus?: (
    input: CollaborationPromptInput,
    status:
      | 'starting'
      | 'running'
      | 'waiting_for_permission'
      | 'completed'
      | 'failed'
      | 'canceled',
    summary?: string,
    sessionId?: string,
  ) => Promise<void> | void;
  onReply?: (
    input: CollaborationPromptInput,
    reply: string,
  ) => Promise<void> | void;
}

/**
 * Owns long-lived ACP adapter processes and serializes prompt turns within a
 * channel or thread. Different conversations can progress concurrently.
 */
export class CollaborationAcpRuntime {
  private readonly createAdapter: CollaborationAcpAdapterFactory;
  private readonly agents = new Map<string, AgentState>();
  private readonly conversations = new Map<string, ConversationState>();
  private readonly activeRuns = new Map<string, ActiveRun>();
  private readonly pendingPermissions = new Map<string, PendingPermission>();
  private closed = false;

  constructor(private readonly options: CollaborationAcpRuntimeOptions = {}) {
    this.createAdapter =
      options.createAdapter ?? createProcessCollaborationAcpAdapter;
  }

  enqueue(input: CollaborationPromptInput): Promise<CollaborationRunResult> {
    if (this.closed) {
      return Promise.resolve({
        runId: input.runId,
        status: 'failed',
        error: 'ACP runtime is closed',
      });
    }

    if (this.activeRuns.has(input.runId)) {
      return Promise.resolve({
        runId: input.runId,
        status: 'failed',
        error: `Collaboration run ${input.runId} is already active`,
      });
    }

    let cwd: string;
    try {
      cwd = resolveWorkspaceCwd(input.workspaceRoot, input.cwd);
    } catch (error) {
      return Promise.resolve({
        runId: input.runId,
        status: 'failed',
        error: errorMessage(error),
      });
    }

    const agentKey = collaborationAgentKey(input);
    const key = `${agentKey}:${collaborationConversationKey(input)}`;
    let conversation = this.conversations.get(key);
    if (!conversation || conversation.cwd !== cwd) {
      conversation = {
        key,
        agentKey,
        cwd,
        pending: [],
        running: false,
      };
      this.conversations.set(key, conversation);
    }

    return new Promise(resolveResult => {
      conversation.pending.push({
        input,
        cwd,
        canceled: false,
        resolve: resolveResult,
      });
      void this.drainConversation(conversation);
    });
  }

  isActive(runId: string): boolean {
    if (this.activeRuns.has(runId)) return true;
    for (const conversation of this.conversations.values()) {
      if (conversation.pending.some(queued => queued.input.runId === runId)) {
        return true;
      }
    }
    return false;
  }

  async cancel(runId: string): Promise<boolean> {
    const active = this.activeRuns.get(runId);
    if (active) {
      active.canceled = true;
      this.resolvePermission(runId, null);
      const agent = this.agents.get(active.conversation.agentKey);
      if (agent && active.conversation.sessionId) {
        await agent.adapter.cancel(active.conversation.sessionId);
      }
      return true;
    }

    for (const conversation of this.conversations.values()) {
      const index = conversation.pending.findIndex(
        queued => queued.input.runId === runId,
      );
      if (index < 0) continue;

      const [queued] = conversation.pending.splice(index, 1);
      queued.canceled = true;
      queued.resolve({
        runId,
        status: 'canceled',
      });
      await this.emitStatus(queued.input, 'canceled', 'Canceled before start');
      return true;
    }

    return false;
  }

  resolvePermission(runId: string, optionId: string | null): boolean {
    const pending = this.pendingPermissions.get(runId);
    if (!pending) return false;
    if (optionId !== null && !pending.options.has(optionId)) return false;

    this.pendingPermissions.delete(runId);
    pending.resolve(
      optionId === null
        ? { outcome: 'cancelled' }
        : { outcome: 'selected', optionId },
    );
    return true;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    for (const runId of this.pendingPermissions.keys()) {
      this.resolvePermission(runId, null);
    }

    for (const conversation of this.conversations.values()) {
      for (const queued of conversation.pending.splice(0)) {
        queued.resolve({
          runId: queued.input.runId,
          status: 'canceled',
        });
      }
    }

    await Promise.allSettled(
      [...this.agents.values()].map(agent => agent.adapter.close()),
    );
    this.agents.clear();
    this.conversations.clear();
    this.activeRuns.clear();
  }

  private async drainConversation(
    conversation: ConversationState,
  ): Promise<void> {
    if (conversation.running || this.closed) return;
    conversation.running = true;

    try {
      while (!this.closed) {
        const queued = conversation.pending.shift();
        if (!queued) break;
        if (queued.canceled) continue;

        const result = await this.runPrompt(conversation, queued);
        queued.resolve(result);
      }
    } finally {
      conversation.running = false;
    }
  }

  private async runPrompt(
    conversation: ConversationState,
    queued: QueuedPrompt,
  ): Promise<CollaborationRunResult> {
    const { input } = queued;
    const active: ActiveRun = {
      input,
      conversation,
      canceled: false,
    };
    this.activeRuns.set(input.runId, active);

    try {
      await this.emitStatus(input, 'starting', 'Starting local agent');
      const agent = this.getOrCreateAgent(input);
      const sessionConfigurationKey =
        collaborationSessionConfigurationKey(input);
      if (
        !conversation.sessionId ||
        conversation.sessionConfigurationKey !== sessionConfigurationKey
      ) {
        const session = await agent.adapter.createSession(queued.cwd, {
          model: input.model,
          permissionMode: input.permissionMode,
          thinkingLevel: input.thinkingLevel,
        });
        conversation.sessionId = session.sessionId;
        conversation.sessionConfigurationKey = sessionConfigurationKey;
        for (const warning of session.configurationWarnings ?? []) {
          await this.emitEvent(input, {
            kind: 'status',
            title: 'Agent setting unavailable',
            body: warning,
          });
        }
      }

      const sessionId = conversation.sessionId;
      agent.activeRunBySession.set(sessionId, input.runId);
      await this.emitStatus(input, 'running', 'Agent is working', sessionId);

      const replySegments = [''];
      let isCollectingReplySegment = false;
      const promptResult = await agent.adapter.prompt(
        sessionId,
        buildCollaborationPrompt(input),
        async update => {
          if (update.textChunk) {
            if (
              !isCollectingReplySegment &&
              replySegments[replySegments.length - 1].trim()
            ) {
              replySegments.push('');
            }
            replySegments[replySegments.length - 1] += update.textChunk;
            isCollectingReplySegment = true;
          }
          if (update.event) {
            await this.emitEvent(input, update.event);
            if (
              update.event.kind !== 'message' &&
              update.event.kind !== 'status'
            ) {
              isCollectingReplySegment = false;
            }
          }
        },
      );

      if (active.canceled) {
        await this.emitStatus(
          input,
          'canceled',
          'Agent turn canceled',
          sessionId,
        );
        return {
          runId: input.runId,
          sessionId,
          stopReason: promptResult.stopReason,
          status: 'canceled',
        };
      }

      const finalReply =
        replySegments.findLast(segment => segment.trim().length > 0)?.trim() ??
        '';
      if (finalReply) {
        await this.options.onReply?.(input, finalReply);
      }
      await this.emitStatus(
        input,
        'completed',
        finalReply || 'Agent turn completed',
        sessionId,
      );
      return {
        runId: input.runId,
        sessionId,
        stopReason: promptResult.stopReason,
        reply: finalReply || undefined,
        status: 'completed',
      };
    } catch (error) {
      if (active.canceled) {
        await this.emitStatus(input, 'canceled', 'Agent turn canceled');
        return {
          runId: input.runId,
          sessionId: conversation.sessionId,
          status: 'canceled',
        };
      }

      const message = errorMessage(error);
      await this.emitEvent(input, {
        kind: 'error',
        title: 'Agent run failed',
        body: message,
      });
      await this.emitStatus(input, 'failed', message);
      return {
        runId: input.runId,
        sessionId: conversation.sessionId,
        status: 'failed',
        error: message,
      };
    } finally {
      this.resolvePermission(input.runId, null);
      this.activeRuns.delete(input.runId);
      const agent = this.agents.get(conversation.agentKey);
      if (agent && conversation.sessionId) {
        agent.activeRunBySession.delete(conversation.sessionId);
      }
    }
  }

  private getOrCreateAgent(input: CollaborationPromptInput): AgentState {
    const key = collaborationAgentKey(input);
    const existing = this.agents.get(key);
    if (existing) return existing;

    const state: AgentState = {
      activeRunBySession: new Map(),
      adapter: this.createAdapter({
        agentId: input.agentId,
        provider: input.provider,
        requestPermission: request => this.requestPermission(key, request),
        onLog: message => {
          // Adapter stderr can contain local diagnostics that should stay on
          // the device. Structured ACP updates are the only activity sent to
          // the shared workspace.
          console.error(`[Vector ACP ${input.provider}] ${message}`);
        },
      }),
    };
    this.agents.set(key, state);
    return state;
  }

  private async requestPermission(
    agentKey: string,
    request: CollaborationPermissionRequest,
  ): Promise<CollaborationPermissionResponse> {
    const agent = this.agents.get(agentKey);
    const runId = agent?.activeRunBySession.get(request.sessionId);
    const run = runId ? this.activeRuns.get(runId) : undefined;
    if (!run || run.canceled) return { outcome: 'cancelled' };

    await this.emitEvent(run.input, {
      kind: 'permission',
      title: request.title,
      body: request.description,
      metadata: {
        sessionId: request.sessionId,
        options: metadataJson(request.options),
        ...(request.metadata
          ? { request: metadataJson(request.metadata) }
          : {}),
      },
    });
    await this.emitStatus(
      run.input,
      'waiting_for_permission',
      request.title,
      request.sessionId,
    );

    return new Promise(resolveResponse => {
      this.pendingPermissions.set(run.input.runId, {
        options: new Set(request.options.map(option => option.optionId)),
        resolve: resolveResponse,
      });
    });
  }

  private async emitEvent(
    input: CollaborationPromptInput,
    event: CollaborationRunEvent,
  ): Promise<void> {
    try {
      await this.options.onEvent?.(input, event);
    } catch (error) {
      console.error(
        `[Vector ACP] Could not report run event: ${errorMessage(error)}`,
      );
    }
  }

  private async emitStatus(
    input: CollaborationPromptInput,
    status:
      | 'starting'
      | 'running'
      | 'waiting_for_permission'
      | 'completed'
      | 'failed'
      | 'canceled',
    summary?: string,
    sessionId?: string,
  ): Promise<void> {
    try {
      await this.options.onStatus?.(input, status, summary, sessionId);
    } catch (error) {
      console.error(
        `[Vector ACP] Could not report run status: ${errorMessage(error)}`,
      );
    }
  }
}

export function collaborationConversationKey(
  input: Pick<CollaborationPromptInput, 'channelId' | 'threadRootId'>,
): string {
  return input.threadRootId
    ? `thread:${input.threadRootId}`
    : `channel:${input.channelId}`;
}

export function buildCollaborationPrompt(
  input: Pick<
    CollaborationPromptInput,
    | 'agentHandle'
    | 'channelLabel'
    | 'threadRootId'
    | 'authorLabel'
    | 'body'
    | 'attachments'
    | 'contextMessages'
  >,
): string {
  const location = input.channelLabel
    ? `#${input.channelLabel}`
    : 'a Vector channel';
  const thread = input.threadRootId ? ' thread' : '';
  const attachments =
    input.attachments && input.attachments.length > 0
      ? [
          '',
          'Attachments:',
          ...input.attachments.map(attachment => {
            const details = [attachment.contentType, attachment.url].filter(
              Boolean,
            );
            return `- ${attachment.name}${details.length ? ` (${details.join(', ')})` : ''}`;
          }),
        ]
      : [];
  const contextMessages = (input.contextMessages ?? []).slice(-20);
  const context =
    contextMessages.length > 0
      ? [
          'Recent conversation context (oldest to newest; this may be partial):',
          ...contextMessages.flatMap(message => [
            `[${new Date(message.createdAt).toISOString()}] ${message.actorLabel}:`,
            message.body,
            ...formatAttachmentLines(message.attachments),
            '',
          ]),
        ]
      : [];

  return [
    `You are @${input.agentHandle}, a registered agent participating in ${location}${thread}.`,
    ...context,
    ...(context.length > 0 ? ['---', ''] : []),
    `Triggering message from ${input.authorLabel}:`,
    '',
    input.body.trim(),
    ...attachments,
    '',
    'Work from your configured local folder. Your final assistant message will be posted back to this conversation by Vector.',
    'Do not invoke vcli only to send the final reply. Use vcli when you need to read or update Vector Requests, Work, Tasks, or other linked workspace context.',
  ].join('\n');
}

function formatAttachmentLines(
  attachments?: CollaborationAttachment[],
): string[] {
  if (!attachments?.length) return [];
  const lines = [
    'Attachments:',
    ...attachments.map(attachment => {
      const details = [attachment.contentType, attachment.url].filter(Boolean);
      return `- ${attachment.name}${details.length ? ` (${details.join(', ')})` : ''}`;
    }),
  ];
  if (attachments.some(attachment => attachment.url)) {
    lines.push(
      'Attachment URLs are sensitive bearer links provided only to this authorized local run. Inspect an attachment only when relevant, and never repeat its URL in a reply.',
    );
  }
  return lines;
}

export function parseCollaborationContextMessages(
  value: unknown,
): CollaborationContextMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .flatMap(item => {
      const record = asRecord(item);
      const actorLabel = (
        recordString(record, 'actorLabel') ??
        recordString(record, 'authorLabel')
      )?.trim();
      const bodyValue = Reflect.get(record, 'body');
      const body = typeof bodyValue === 'string' ? bodyValue : undefined;
      const createdAt = Reflect.get(record, 'createdAt');
      const attachments = parseContextAttachments(record);
      if (
        !actorLabel ||
        body === undefined ||
        typeof createdAt !== 'number' ||
        !Number.isFinite(createdAt) ||
        (!body.trim() && attachments.length === 0)
      ) {
        return [];
      }
      return [{ actorLabel, body, createdAt, attachments }];
    })
    .slice(-20);
}

function parseContextAttachments(
  message: Record<string, unknown>,
): CollaborationAttachment[] {
  const attachmentsValue = Reflect.get(message, 'attachments');
  const attachments: CollaborationAttachment[] = Array.isArray(attachmentsValue)
    ? attachmentsValue.flatMap(value => {
        const record = asRecord(value);
        const name = recordString(record, 'name')?.trim();
        const contentType = recordString(record, 'contentType')?.trim();
        const url = recordString(record, 'url')?.trim();
        return name && contentType && url ? [{ name, contentType, url }] : [];
      })
    : [];
  const seenNames = new Set(attachments.map(attachment => attachment.name));
  const attachmentNames = Reflect.get(message, 'attachmentNames');
  if (Array.isArray(attachmentNames)) {
    for (const value of attachmentNames) {
      if (typeof value !== 'string') continue;
      const name = value.trim();
      if (!name || seenNames.has(name)) continue;
      seenNames.add(name);
      attachments.push({ name });
    }
  }
  return attachments;
}

/**
 * Resolves a user-selected working directory and rejects symlink/path traversal
 * outside the registered device workspace.
 */
export function resolveWorkspaceCwd(
  workspaceRoot: PathLike,
  requestedCwd?: string,
): string {
  const root = realpathSync(workspaceRoot);
  if (!statSync(root).isDirectory()) {
    throw new Error(`Registered workspace is not a directory: ${root}`);
  }

  const candidate = requestedCwd ? resolve(root, requestedCwd) : root;
  const resolved = realpathSync(candidate);
  if (!statSync(resolved).isDirectory()) {
    throw new Error(`Agent working directory is not a directory: ${resolved}`);
  }

  const relativePath = relative(root, resolved);
  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    resolve(root, relativePath) !== resolved
  ) {
    throw new Error(
      `Agent working directory must stay inside registered workspace ${root}`,
    );
  }
  return resolved;
}

function collaborationAgentKey(
  input: Pick<CollaborationPromptInput, 'agentId' | 'provider'>,
): string {
  return `${input.agentId}:${input.provider}`;
}

function collaborationSessionConfigurationKey(
  input: CollaborationSessionConfiguration,
): string {
  return JSON.stringify([
    input.model ?? null,
    input.permissionMode ?? null,
    input.thinkingLevel ?? null,
  ]);
}

class ProcessCollaborationAcpAdapter implements CollaborationAcpAdapter {
  private child?: ChildProcessWithoutNullStreams;
  private connection?: acp.ClientConnection;
  private context?: acp.ClientContext;
  private initializePromise?: Promise<void>;
  private readonly sessions = new Map<string, acp.ActiveSession>();

  constructor(private readonly config: CollaborationAcpAdapterFactoryContext) {}

  async createSession(
    cwd: string,
    configuration: CollaborationSessionConfiguration = {},
  ): Promise<{ sessionId: string; configurationWarnings?: string[] }> {
    await this.initialize();
    const context = this.requireContext();
    try {
      const session = await context
        .buildSession({ cwd, mcpServers: [] })
        .start();
      this.sessions.set(session.sessionId, session);
      const configurationWarnings = await this.configureSession(
        session,
        configuration,
      );
      return {
        sessionId: session.sessionId,
        configurationWarnings:
          configurationWarnings.length > 0 ? configurationWarnings : undefined,
      };
    } catch (error) {
      throw new Error(
        `Could not create ${providerLabel(this.config.provider)} ACP session. Ensure the provider is signed in on this device. ${errorMessage(error)}`,
      );
    }
  }

  async prompt(
    sessionId: string,
    prompt: string,
    onUpdate: (update: AcpAdapterUpdate) => Promise<void> | void,
  ): Promise<{ stopReason: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown ACP session ${sessionId}`);
    }

    void session.prompt(prompt);
    for (;;) {
      const message = await session.nextUpdate();
      if (message.kind === 'stop') {
        return { stopReason: String(message.stopReason) };
      }
      await onUpdate(mapAcpSessionUpdate(message.update));
    }
  }

  async cancel(sessionId: string): Promise<void> {
    if (!this.context) return;
    await this.context.notify(acp.methods.agent.session.cancel, {
      sessionId,
    });
  }

  async close(): Promise<void> {
    for (const session of this.sessions.values()) {
      session.dispose();
    }
    this.sessions.clear();
    this.connection?.close();
    const child = this.child;
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
    }
    await Promise.race([
      this.connection?.closed ?? Promise.resolve(),
      child
        ? new Promise<void>(resolveExit => {
            if (child.exitCode !== null || child.signalCode !== null) {
              resolveExit();
              return;
            }
            child.once('exit', () => resolveExit());
          })
        : Promise.resolve(),
      new Promise<void>(resolveWait => setTimeout(resolveWait, 1_000)),
    ]);
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
  }

  private initialize(): Promise<void> {
    this.initializePromise ??= this.start();
    return this.initializePromise;
  }

  private async start(): Promise<void> {
    const entry = resolveAdapterEntry(this.config.provider);
    const env = { ...process.env };
    if (this.config.provider === 'codex') {
      // `agent` keeps edits workspace-scoped and lets ACP surface approvals.
      env.INITIAL_AGENT_MODE = 'agent';
    }

    const child = spawn(process.execPath, [entry], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      for (const line of String(chunk).split('\n')) {
        const message = line.trim();
        if (message) this.config.onLog(message);
      }
    });

    const stream = acp.ndJsonStream(
      Writable.toWeb(child.stdin),
      Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    );
    const app = acp
      .client({ name: 'vector-vcli' })
      .onRequest(
        acp.methods.client.session.requestPermission,
        async requestContext => {
          const params = requestContext.params;
          const response = await this.config.requestPermission({
            sessionId: String(params.sessionId),
            title:
              recordString(params, 'title') ??
              recordString(params.toolCall, 'title') ??
              'Agent permission requested',
            description: recordString(params, 'description'),
            options: params.options.map(option => ({
              optionId: String(option.optionId),
              name: option.name,
              kind: option.kind,
            })),
            metadata: {
              toolCall: params.toolCall,
            },
          });
          return {
            outcome:
              response.outcome === 'cancelled'
                ? { outcome: 'cancelled' as const }
                : {
                    outcome: 'selected' as const,
                    optionId: response.optionId,
                  },
          };
        },
      );

    const connection = app.connect(stream);
    this.connection = connection;
    this.context = connection.agent;
    const initialized = await connection.agent.request(
      acp.methods.agent.initialize,
      {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {
          fs: {
            readTextFile: false,
            writeTextFile: false,
          },
          session: {
            configOptions: {},
          },
          terminal: false,
        },
        clientInfo: {
          name: 'vector-vcli',
          title: 'Vector CLI',
          version: '0.1.0',
        },
      },
    );
    if (initialized.protocolVersion !== acp.PROTOCOL_VERSION) {
      connection.close();
      throw new Error(
        `Unsupported ACP protocol version ${initialized.protocolVersion}; Vector requires ${acp.PROTOCOL_VERSION}`,
      );
    }
  }

  private requireContext(): acp.ClientContext {
    if (!this.context) throw new Error('ACP adapter is not initialized');
    return this.context;
  }

  private async configureSession(
    session: acp.ActiveSession,
    configuration: CollaborationSessionConfiguration,
  ): Promise<string[]> {
    const context = this.requireContext();
    const warnings: string[] = [];
    let configOptions = session.newSessionResponse.configOptions ?? [];

    if (configuration.permissionMode) {
      const targets =
        configuration.permissionMode === 'plan'
          ? ['plan', 'plan mode', 'read only', 'read-only']
          : ['ask', 'manual', 'default', 'agent'];
      const mode = findNamedValue(
        session.modes?.availableModes ?? [],
        targets,
        value => value.id,
        value => value.name,
      );
      if (mode) {
        if (mode.id !== session.modes?.currentModeId) {
          try {
            await context.request(acp.methods.agent.session.setMode, {
              sessionId: session.sessionId,
              modeId: mode.id,
            });
          } catch (error) {
            warnings.push(
              `Could not apply permission mode "${configuration.permissionMode}": ${errorMessage(error)}`,
            );
          }
        }
      } else {
        const result = await setSelectConfiguration(
          context,
          session.sessionId,
          configOptions,
          'mode',
          targets,
        );
        configOptions = result.configOptions;
        if (!result.applied) {
          warnings.push(
            result.error ??
              `Permission mode "${configuration.permissionMode}" is not supported by this ${providerLabel(this.config.provider)} session.`,
          );
        }
      }
    }

    if (configuration.model) {
      const result = await setSelectConfiguration(
        context,
        session.sessionId,
        configOptions,
        'model',
        [configuration.model],
      );
      configOptions = result.configOptions;
      if (!result.applied) {
        warnings.push(
          result.error ??
            `Model "${configuration.model}" is not supported by this ${providerLabel(this.config.provider)} session.`,
        );
      }
    }

    if (configuration.thinkingLevel) {
      const result = await setSelectConfiguration(
        context,
        session.sessionId,
        configOptions,
        'thought_level',
        [configuration.thinkingLevel],
      );
      if (!result.applied) {
        warnings.push(
          result.error ??
            `Thinking level "${configuration.thinkingLevel}" is not supported by this ${providerLabel(this.config.provider)} session.`,
        );
      }
    }

    return warnings;
  }
}

interface SelectConfigurationResult {
  applied: boolean;
  configOptions: SessionConfigOption[];
  error?: string;
}

async function setSelectConfiguration(
  context: acp.ClientContext,
  sessionId: string,
  configOptions: SessionConfigOption[],
  category: 'mode' | 'model' | 'thought_level',
  targets: string[],
): Promise<SelectConfigurationResult> {
  const config = configOptions.find(
    option => option.type === 'select' && option.category === category,
  );
  if (!config || config.type !== 'select') {
    return { applied: false, configOptions };
  }

  const choices = config.options.flatMap(option =>
    'options' in option ? option.options : [option],
  );
  const choice = findNamedValue(
    choices,
    targets,
    value => value.value,
    value => value.name,
  );
  if (!choice) {
    return { applied: false, configOptions };
  }
  if (config.currentValue === choice.value) {
    return { applied: true, configOptions };
  }

  try {
    const response = await context.request(
      acp.methods.agent.session.setConfigOption,
      {
        sessionId,
        configId: config.id,
        value: choice.value,
      },
    );
    return { applied: true, configOptions: response.configOptions };
  } catch (error) {
    return {
      applied: false,
      configOptions,
      error: `Could not apply ${category.replace('_', ' ')} setting "${choice.name}": ${errorMessage(error)}`,
    };
  }
}

function findNamedValue<T>(
  values: T[],
  targets: string[],
  valueOf: (value: T) => string,
  nameOf: (value: T) => string,
): T | undefined {
  const normalizedTargets = new Set(targets.map(normalizeSettingName));
  return values.find(
    value =>
      normalizedTargets.has(normalizeSettingName(valueOf(value))) ||
      normalizedTargets.has(normalizeSettingName(nameOf(value))),
  );
}

function normalizeSettingName(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function createProcessCollaborationAcpAdapter(
  context: CollaborationAcpAdapterFactoryContext,
): CollaborationAcpAdapter {
  return new ProcessCollaborationAcpAdapter(context);
}

export function mapAcpSessionUpdate(update: unknown): AcpAdapterUpdate {
  const record = asRecord(update);
  const sessionUpdate = recordString(record, 'sessionUpdate');
  if (!sessionUpdate) {
    return {
      event: {
        kind: 'status',
        title: 'Agent update',
        metadata: { update: metadataJson(record) },
      },
    };
  }

  if (sessionUpdate === 'agent_message_chunk') {
    const content = asRecord(record.content);
    const text =
      recordString(content, 'type') === 'text'
        ? recordString(content, 'text')
        : undefined;
    return {
      textChunk: text,
      event: text
        ? {
            kind: 'message',
            title: 'Agent reply',
            body: text,
          }
        : undefined,
    };
  }

  if (sessionUpdate === 'agent_thought_chunk') {
    const content = asRecord(record.content);
    return {
      event: {
        kind: 'thought',
        title: 'Agent reasoning',
        body: recordString(content, 'text'),
      },
    };
  }

  if (sessionUpdate === 'plan') {
    return {
      event: {
        kind: 'plan',
        title: 'Agent plan',
        body: summarizePlan(record.entries),
        metadata: { update: metadataJson(record) },
      },
    };
  }

  if (sessionUpdate === 'tool_call' || sessionUpdate === 'tool_call_update') {
    const locations = Array.isArray(record.locations)
      ? record.locations
      : undefined;
    return {
      event: {
        sourceId: recordString(record, 'toolCallId'),
        kind: 'tool',
        title:
          recordString(record, 'title') ??
          (sessionUpdate === 'tool_call' ? 'Agent tool' : 'Agent tool update'),
        body: recordString(record, 'status'),
        metadata: {
          update: metadataJson(record),
          ...(locations ? { locations: metadataJson(locations) } : {}),
        },
      },
    };
  }

  if (sessionUpdate.includes('terminal')) {
    return {
      event: {
        sourceId: recordString(record, 'terminalId'),
        kind: 'terminal',
        title: 'Agent terminal',
        body: recordString(record, 'command') ?? recordString(record, 'data'),
        metadata: { update: metadataJson(record) },
      },
    };
  }

  return {
    event: {
      kind: 'status',
      title: humanizeUpdateName(sessionUpdate),
      metadata: { update: metadataJson(record) },
    },
  };
}

function resolveAdapterEntry(provider: CollaborationAcpProvider): string {
  const require = createRequire(import.meta.url);
  try {
    return provider === 'codex'
      ? require.resolve('@agentclientprotocol/codex-acp')
      : require.resolve('@agentclientprotocol/claude-agent-acp/dist/index.js');
  } catch {
    throw new Error(
      `${providerLabel(provider)} ACP adapter is unavailable. Reinstall the project-local Vector CLI dependencies.`,
    );
  }
}

function providerLabel(provider: CollaborationAcpProvider): string {
  return provider === 'codex' ? 'Codex' : 'Claude';
}

function summarizePlan(entries: unknown): string | undefined {
  if (!Array.isArray(entries)) return undefined;
  const lines = entries
    .map(entry => {
      const record = asRecord(entry);
      return (
        recordString(record, 'content') ??
        recordString(record, 'title') ??
        recordString(record, 'description')
      );
    })
    .filter((value): value is string => Boolean(value));
  return lines.length ? lines.map(line => `- ${line}`).join('\n') : undefined;
}

function humanizeUpdateName(value: string): string {
  return value
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function recordString(value: unknown, key: string): string | undefined {
  const property = asRecord(value)[key];
  return typeof property === 'string' ? property : undefined;
}

function metadataJson(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 12_000);
  } catch {
    return '[unserializable ACP metadata]';
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
