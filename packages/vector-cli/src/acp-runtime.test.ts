import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCollaborationPrompt,
  CollaborationAcpRuntime,
  collaborationConversationKey,
  parseCollaborationContextMessages,
  resolveWorkspaceCwd,
  type AcpAdapterUpdate,
  type CollaborationAcpAdapter,
  type CollaborationAcpAdapterFactoryContext,
  type CollaborationPromptInput,
  type CollaborationRunEvent,
  type CollaborationSessionConfiguration,
} from './acp-runtime';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('ACP collaboration prompt mapping', () => {
  it('uses a thread-specific conversation key when a thread root exists', () => {
    expect(
      collaborationConversationKey({
        channelId: 'channel-1',
        threadRootId: 'message-root',
      }),
    ).toBe('thread:message-root');
    expect(
      collaborationConversationKey({
        channelId: 'channel-1',
      }),
    ).toBe('channel:channel-1');
  });

  it('includes actor, channel, attachments, and reply delivery guidance', () => {
    const prompt = buildCollaborationPrompt({
      agentHandle: 'atlas',
      channelLabel: 'engineering',
      threadRootId: 'root-1',
      authorLabel: 'Raj',
      body: 'Please inspect this failing test.',
      contextMessages: [
        {
          actorLabel: 'Mina',
          body: 'The regression started after the auth refactor.',
          createdAt: Date.UTC(2026, 6, 29, 4, 30),
          attachments: [
            {
              name: 'trace.json',
              contentType: 'application/json',
              url: 'https://vector.test/authorized/trace.json',
            },
          ],
        },
      ],
      attachments: [
        {
          name: 'failure.txt',
          contentType: 'text/plain',
          url: 'https://vector.test/failure.txt',
        },
      ],
    });

    expect(prompt).toContain('@atlas');
    expect(prompt).toContain('#engineering thread');
    expect(prompt).toContain(
      'Recent conversation context (oldest to newest; this may be partial)',
    );
    expect(prompt).toContain('Mina');
    expect(prompt).toContain('The regression started after the auth refactor.');
    expect(prompt).toContain('trace.json');
    expect(prompt).toContain('Triggering message from Raj');
    expect(prompt).toContain('Raj');
    expect(prompt).toContain('Please inspect this failing test.');
    expect(prompt).toContain('failure.txt');
    expect(prompt).toContain('Attachment URLs are sensitive bearer links');
    expect(prompt).toContain('Inspect an attachment only when relevant');
    expect(prompt).toContain('posted back to this conversation by Vector');
    expect(prompt).toContain('Do not invoke vcli only to send the final reply');
  });

  it('parses authorized attachment URLs and legacy attachment names', () => {
    expect(
      parseCollaborationContextMessages([
        {
          actorLabel: 'Mina',
          body: 'Please inspect both files.',
          createdAt: 123,
          attachments: [
            {
              name: 'trace.json',
              contentType: 'application/json',
              url: 'https://vector.test/authorized/trace.json',
            },
            {
              name: 'missing-url.txt',
              contentType: 'text/plain',
            },
          ],
          attachmentNames: ['trace.json', 'legacy.log'],
        },
      ]),
    ).toEqual([
      {
        actorLabel: 'Mina',
        body: 'Please inspect both files.',
        createdAt: 123,
        attachments: [
          {
            name: 'trace.json',
            contentType: 'application/json',
            url: 'https://vector.test/authorized/trace.json',
          },
          {
            name: 'legacy.log',
          },
        ],
      },
    ]);
  });

  it('normalizes serialized ACP permission choices for the backend', async () => {
    const { normalizeCollaborationRunEvent } = await import('./bridge-service');
    const options = Array.from({ length: 24 }, (_, index) => ({
      optionId: `choice-${index}`,
      name: `Choice ${index}`,
      kind: index === 0 ? 'allow_once' : 'reject_once',
    }));

    expect(
      normalizeCollaborationRunEvent({
        kind: 'permission',
        title: 'Run command?',
        metadata: {
          sessionId: 'session-1',
          options: JSON.stringify(options),
        },
      }),
    ).toEqual({
      metadata: {
        sessionId: 'session-1',
      },
      permissionOptions: options.slice(0, 20).map(option => ({
        id: option.optionId,
        label: option.name,
        description: option.kind,
      })),
    });
    expect(
      normalizeCollaborationRunEvent({
        kind: 'permission',
        title: 'Run command?',
        metadata: {
          request: '{"tool":"shell"}',
          options: 'not-json',
        },
      }),
    ).toEqual({
      metadata: {
        request: '{"tool":"shell"}',
      },
      permissionOptions: undefined,
    });
  });
});

describe('ACP collaboration workspace containment', () => {
  it('allows the registered workspace and nested folders', () => {
    const root = createTemporaryWorkspace();
    const nested = join(root, 'apps', 'web');
    mkdirSync(nested, { recursive: true });
    const canonicalRoot = realpathSync(root);
    const canonicalNested = realpathSync(nested);

    expect(resolveWorkspaceCwd(root)).toBe(canonicalRoot);
    expect(resolveWorkspaceCwd(root, 'apps/web')).toBe(canonicalNested);
    expect(resolveWorkspaceCwd(root, nested)).toBe(canonicalNested);
  });

  it('rejects traversal and symlinks outside the registered workspace', () => {
    const root = createTemporaryWorkspace();
    const outside = createTemporaryWorkspace();
    const link = join(root, 'outside-link');
    symlinkSync(outside, link);

    expect(() => resolveWorkspaceCwd(root, '..')).toThrow(
      'must stay inside registered workspace',
    );
    expect(() => resolveWorkspaceCwd(root, link)).toThrow(
      'must stay inside registered workspace',
    );
  });
});

describe('CollaborationAcpRuntime', () => {
  it('reuses one session and serializes prompts in the same channel', async () => {
    const adapter = new FakeAdapter();
    const replies: string[] = [];
    const runtime = new CollaborationAcpRuntime({
      createAdapter: () => adapter,
      onReply: (_input, reply) => {
        replies.push(reply);
      },
    });
    const workspaceRoot = createTemporaryWorkspace();

    const first = runtime.enqueue(
      promptInput({
        runId: 'run-1',
        workspaceRoot,
        body: 'first',
        model: 'gpt-test',
        permissionMode: 'ask',
        thinkingLevel: 'high',
      }),
    );
    const second = runtime.enqueue(
      promptInput({
        runId: 'run-2',
        workspaceRoot,
        body: 'second',
        model: 'gpt-test',
        permissionMode: 'ask',
        thinkingLevel: 'high',
      }),
    );

    await vi.waitFor(() => {
      expect(adapter.promptCalls).toHaveLength(1);
    });
    expect(runtime.isActive('run-1')).toBe(true);
    expect(runtime.isActive('run-2')).toBe(true);
    expect(adapter.promptCalls[0].prompt).toContain('first');

    await adapter.finish(0, 'First reply');
    await expect(first).resolves.toMatchObject({
      status: 'completed',
      reply: 'First reply',
    });
    await vi.waitFor(() => {
      expect(adapter.promptCalls).toHaveLength(2);
    });
    expect(adapter.promptCalls[1].prompt).toContain('second');

    await adapter.finish(1, 'Second reply');
    await expect(second).resolves.toMatchObject({
      status: 'completed',
      reply: 'Second reply',
    });
    expect(runtime.isActive('run-1')).toBe(false);
    expect(runtime.isActive('run-2')).toBe(false);
    expect(adapter.createdCwds).toEqual([realpathSync(workspaceRoot)]);
    expect(adapter.createdConfigurations).toEqual([
      {
        model: 'gpt-test',
        permissionMode: 'ask',
        thinkingLevel: 'high',
      },
    ]);
    expect(replies).toEqual(['First reply', 'Second reply']);
    await runtime.close();
  });

  it('surfaces unsupported session configuration in run activity', async () => {
    const adapter = new FakeAdapter();
    adapter.configurationWarnings.push(
      'Model "missing-model" is not supported.',
    );
    const events: Array<{ title: string; body?: string }> = [];
    const runtime = new CollaborationAcpRuntime({
      createAdapter: () => adapter,
      onEvent: (_input, event) => {
        events.push({ title: event.title, body: event.body });
      },
    });
    const workspaceRoot = createTemporaryWorkspace();

    const result = runtime.enqueue(
      promptInput({
        runId: 'unsupported-config',
        workspaceRoot,
        model: 'missing-model',
      }),
    );
    await vi.waitFor(() => {
      expect(adapter.promptCalls).toHaveLength(1);
    });
    await adapter.finish(0, 'Ready');
    await expect(result).resolves.toMatchObject({ status: 'completed' });
    expect(events).toContainEqual({
      title: 'Agent setting unavailable',
      body: 'Model "missing-model" is not supported.',
    });
    await runtime.close();
  });

  it('posts only the final assistant segment after intermediate tool work', async () => {
    const adapter = new FakeAdapter();
    const replies: string[] = [];
    const runtime = new CollaborationAcpRuntime({
      createAdapter: () => adapter,
      onReply: (_input, reply) => {
        replies.push(reply);
      },
    });
    const workspaceRoot = createTemporaryWorkspace();
    const result = runtime.enqueue(
      promptInput({ runId: 'final-segment', workspaceRoot }),
    );

    await vi.waitFor(() => {
      expect(adapter.promptCalls).toHaveLength(1);
    });
    const call = adapter.promptCalls[0];
    await call.onUpdate({
      textChunk: 'I will inspect the requested file.',
      event: {
        kind: 'message',
        title: 'Agent reply',
        body: 'I will inspect the requested file.',
      },
    });
    await call.onUpdate({
      event: {
        kind: 'tool',
        title: 'Read package.json',
        body: 'completed',
      },
    });
    await call.onUpdate({
      textChunk: 'The collaboration port is 4200.',
      event: {
        kind: 'message',
        title: 'Agent reply',
        body: 'The collaboration port is 4200.',
      },
    });
    call.resolve({ stopReason: 'end_turn' });

    await expect(result).resolves.toMatchObject({
      status: 'completed',
      reply: 'The collaboration port is 4200.',
    });
    expect(replies).toEqual(['The collaboration port is 4200.']);
    await runtime.close();
  });

  it('allows different threads to run concurrently with separate sessions', async () => {
    const adapter = new FakeAdapter();
    const runtime = new CollaborationAcpRuntime({
      createAdapter: () => adapter,
    });
    const workspaceRoot = createTemporaryWorkspace();

    const first = runtime.enqueue(
      promptInput({
        runId: 'thread-1',
        workspaceRoot,
        threadRootId: 'root-1',
      }),
    );
    const second = runtime.enqueue(
      promptInput({
        runId: 'thread-2',
        workspaceRoot,
        threadRootId: 'root-2',
      }),
    );

    await vi.waitFor(() => {
      expect(adapter.promptCalls).toHaveLength(2);
    });
    expect(adapter.createdCwds).toHaveLength(2);

    await Promise.all([adapter.finish(0, 'one'), adapter.finish(1, 'two')]);
    await expect(first).resolves.toMatchObject({ status: 'completed' });
    await expect(second).resolves.toMatchObject({ status: 'completed' });
    await runtime.close();
  });

  it('cancels queued and active runs without starting another turn', async () => {
    const adapter = new FakeAdapter();
    const runtime = new CollaborationAcpRuntime({
      createAdapter: () => adapter,
    });
    const workspaceRoot = createTemporaryWorkspace();

    const active = runtime.enqueue(
      promptInput({ runId: 'active', workspaceRoot }),
    );
    const queued = runtime.enqueue(
      promptInput({ runId: 'queued', workspaceRoot }),
    );
    await vi.waitFor(() => {
      expect(adapter.promptCalls).toHaveLength(1);
    });

    await expect(runtime.cancel('queued')).resolves.toBe(true);
    await expect(queued).resolves.toMatchObject({ status: 'canceled' });
    await expect(runtime.cancel('active')).resolves.toBe(true);
    await expect(active).resolves.toMatchObject({ status: 'canceled' });
    expect(adapter.canceledSessions).toEqual(['session-1']);
    expect(adapter.promptCalls).toHaveLength(1);
    await runtime.close();
  });

  it('waits for an explicit permission response instead of auto-allowing', async () => {
    let factoryContext: CollaborationAcpAdapterFactoryContext | undefined;
    const events: CollaborationRunEvent[] = [];
    const adapter = new PermissionAdapter(() => factoryContext!);
    const runtime = new CollaborationAcpRuntime({
      createAdapter: context => {
        factoryContext = context;
        return adapter;
      },
      onEvent: (_input, event) => {
        events.push(event);
      },
    });
    const workspaceRoot = createTemporaryWorkspace();

    const result = runtime.enqueue(
      promptInput({ runId: 'permission-run', workspaceRoot }),
    );
    await vi.waitFor(() => {
      expect(events.some(event => event.kind === 'permission')).toBe(true);
    });
    const permissionEvent = events.find(event => event.kind === 'permission');
    expect(JSON.parse(String(permissionEvent?.metadata?.options))).toEqual([
      {
        optionId: 'allow-once',
        name: 'Allow once',
        kind: 'allow_once',
      },
      {
        optionId: 'reject-once',
        name: 'Reject',
        kind: 'reject_once',
      },
    ]);
    expect(adapter.permissionResolved).toBe(false);

    expect(runtime.resolvePermission('permission-run', 'allow-once')).toBe(
      true,
    );
    await expect(result).resolves.toMatchObject({ status: 'completed' });
    expect(adapter.permissionResolved).toBe(true);
    await runtime.close();
  });
});

interface PromptCall {
  sessionId: string;
  prompt: string;
  onUpdate: (update: AcpAdapterUpdate) => Promise<void> | void;
  resolve: (result: { stopReason: string }) => void;
}

class FakeAdapter implements CollaborationAcpAdapter {
  readonly createdCwds: string[] = [];
  readonly createdConfigurations: CollaborationSessionConfiguration[] = [];
  readonly promptCalls: PromptCall[] = [];
  readonly canceledSessions: string[] = [];
  readonly configurationWarnings: string[] = [];

  async createSession(
    cwd: string,
    configuration: CollaborationSessionConfiguration = {},
  ): Promise<{
    sessionId: string;
    configurationWarnings?: string[];
  }> {
    this.createdCwds.push(cwd);
    this.createdConfigurations.push(configuration);
    return {
      sessionId: `session-${this.createdCwds.length}`,
      configurationWarnings:
        this.configurationWarnings.length > 0
          ? this.configurationWarnings
          : undefined,
    };
  }

  prompt(
    sessionId: string,
    prompt: string,
    onUpdate: (update: AcpAdapterUpdate) => Promise<void> | void,
  ): Promise<{ stopReason: string }> {
    return new Promise(resolve => {
      this.promptCalls.push({ sessionId, prompt, onUpdate, resolve });
    });
  }

  async cancel(sessionId: string): Promise<void> {
    this.canceledSessions.push(sessionId);
    const call = this.promptCalls.find(
      promptCall => promptCall.sessionId === sessionId,
    );
    call?.resolve({ stopReason: 'cancelled' });
  }

  async close(): Promise<void> {}

  async finish(
    index: number,
    reply: string,
    stopReason = 'end_turn',
  ): Promise<void> {
    const call = this.promptCalls[index];
    await call.onUpdate({
      textChunk: reply,
      event: {
        kind: 'message',
        title: 'Agent reply',
        body: reply,
      },
    });
    call.resolve({ stopReason });
  }
}

class PermissionAdapter implements CollaborationAcpAdapter {
  permissionResolved = false;

  constructor(
    private readonly context: () => CollaborationAcpAdapterFactoryContext,
  ) {}

  async createSession(): Promise<{ sessionId: string }> {
    return { sessionId: 'permission-session' };
  }

  async prompt(): Promise<{ stopReason: string }> {
    const response = await this.context().requestPermission({
      sessionId: 'permission-session',
      title: 'Run tests?',
      options: [
        {
          optionId: 'allow-once',
          name: 'Allow once',
          kind: 'allow_once',
        },
        {
          optionId: 'reject-once',
          name: 'Reject',
          kind: 'reject_once',
        },
      ],
    });
    this.permissionResolved = true;
    expect(response).toEqual({
      outcome: 'selected',
      optionId: 'allow-once',
    });
    return { stopReason: 'end_turn' };
  }

  async cancel(): Promise<void> {}

  async close(): Promise<void> {}
}

function promptInput(
  overrides: Partial<CollaborationPromptInput> & {
    runId: string;
    workspaceRoot: string;
  },
): CollaborationPromptInput {
  return {
    agentId: 'agent-1',
    agentHandle: 'atlas',
    provider: 'codex',
    channelId: 'channel-1',
    triggerMessageId: `message-${overrides.runId}`,
    authorLabel: 'Raj',
    body: 'Please help',
    ...overrides,
  };
}

function createTemporaryWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'vector-acp-runtime-'));
  temporaryRoots.push(root);
  return root;
}
