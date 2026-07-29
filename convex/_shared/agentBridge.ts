import { v } from 'convex/values';

// ── Agent Device ────────────────────────────────────────────────────────────

export const AGENT_DEVICE_STATUSES = ['online', 'stale', 'offline'] as const;
export type AgentDeviceStatus = (typeof AGENT_DEVICE_STATUSES)[number];

export const AGENT_DEVICE_SERVICE_TYPES = [
  'launchagent',
  'systemd_user',
  'foreground',
] as const;
export type AgentDeviceServiceType =
  (typeof AGENT_DEVICE_SERVICE_TYPES)[number];

export const agentDeviceStatusValidator = v.union(
  ...AGENT_DEVICE_STATUSES.map(s => v.literal(s)),
);

export const agentDeviceServiceTypeValidator = v.union(
  ...AGENT_DEVICE_SERVICE_TYPES.map(s => v.literal(s)),
);

// ── Agent Provider ──────────────────────────────────────────────────────────

export const AGENT_PROVIDERS = [
  'codex',
  'claude_code',
  'cursor',
  'copilot',
  'opencode',
  'pi',
  'vector_cli',
] as const;
export type AgentProvider = (typeof AGENT_PROVIDERS)[number];

export const agentProviderValidator = v.union(
  ...AGENT_PROVIDERS.map(p => v.literal(p)),
);

/** User-visible labels per provider (branding rules). */
export const AGENT_PROVIDER_LABELS: Record<AgentProvider, string> = {
  codex: 'Codex',
  claude_code: 'Claude',
  cursor: 'Cursor',
  copilot: 'GitHub Copilot',
  opencode: 'OpenCode',
  pi: 'Pi',
  vector_cli: 'Vector CLI',
};

export const AGENT_PERMISSION_MODES = ['plan', 'ask', 'bypass'] as const;
export type AgentPermissionMode = (typeof AGENT_PERMISSION_MODES)[number];

export const agentPermissionModeValidator = v.union(
  ...AGENT_PERMISSION_MODES.map(mode => v.literal(mode)),
);

export const AGENT_THINKING_LEVELS = [
  'off',
  'low',
  'medium',
  'high',
  'max',
  'xhigh',
] as const;
export type AgentThinkingLevel = (typeof AGENT_THINKING_LEVELS)[number];

export const agentThinkingLevelValidator = v.union(
  ...AGENT_THINKING_LEVELS.map(level => v.literal(level)),
);

export const AGENT_CONTEXT_LENGTHS = ['default', 'extended'] as const;
export type AgentContextLength = (typeof AGENT_CONTEXT_LENGTHS)[number];

export const agentContextLengthValidator = v.union(
  ...AGENT_CONTEXT_LENGTHS.map(length => v.literal(length)),
);

export const agentReplyReferenceValidator = v.object({
  id: v.string(),
  role: v.string(),
  label: v.string(),
  preview: v.string(),
  title: v.optional(v.union(v.string(), v.null())),
});

export const queuedAgentMessageValidator = v.object({
  id: v.string(),
  text: v.string(),
  attachments: v.array(v.string()),
  mode: v.union(
    v.literal('after-turn'),
    v.literal('after-tool'),
    v.literal('stop'),
  ),
  model: v.union(v.string(), v.null()),
  thinkingLevel: v.union(agentThinkingLevelValidator, v.null()),
  permissionMode: v.union(agentPermissionModeValidator, v.null()),
  fastMode: v.optional(v.union(v.boolean(), v.null())),
  replyTo: v.optional(v.union(agentReplyReferenceValidator, v.null())),
});

export const pendingAgentApprovalValidator = v.object({
  kind: v.union(v.literal('command'), v.literal('file-change')),
  title: v.string(),
  detail: v.optional(v.union(v.string(), v.null())),
  reason: v.optional(v.union(v.string(), v.null())),
  command: v.optional(v.union(v.string(), v.null())),
  cwd: v.optional(v.union(v.string(), v.null())),
  grantRoot: v.optional(v.union(v.string(), v.null())),
  canApproveForSession: v.optional(v.boolean()),
  createdAt: v.number(),
});

export const pendingPlanApprovalValidator = v.object({
  plan: v.string(),
  createdAt: v.number(),
});

export const pendingQuestionValidator = v.object({
  questions: v.array(
    v.object({
      id: v.optional(v.string()),
      question: v.string(),
      header: v.string(),
      options: v.array(
        v.object({
          label: v.string(),
          description: v.string(),
          preview: v.optional(v.string()),
        }),
      ),
      multiSelect: v.boolean(),
    }),
  ),
  createdAt: v.number(),
});

export const codexPlanValidator = v.object({
  items: v.array(v.object({ text: v.string(), completed: v.boolean() })),
  updatedAt: v.number(),
});

export const agentUsageStatsValidator = v.object({
  model: v.union(v.string(), v.null()),
  inputTokens: v.number(),
  outputTokens: v.number(),
  cachedInputTokens: v.number(),
  contextWindow: v.union(v.number(), v.null()),
  usedTokens: v.union(v.number(), v.null()),
  totalProcessedTokens: v.union(v.number(), v.null()),
  compactsAutomatically: v.boolean(),
  updatedAt: v.number(),
});

// ── Agent Process ───────────────────────────────────────────────────────────

export const AGENT_PROCESS_MODES = ['observed', 'managed'] as const;
export type AgentProcessMode = (typeof AGENT_PROCESS_MODES)[number];

export const AGENT_PROCESS_STATUSES = [
  'observed',
  'managed',
  'waiting',
  'running',
  'completed',
  'failed',
  'disconnected',
] as const;
export type AgentProcessStatus = (typeof AGENT_PROCESS_STATUSES)[number];

export const agentProcessModeValidator = v.union(
  ...AGENT_PROCESS_MODES.map(m => v.literal(m)),
);

export const agentProcessStatusValidator = v.union(
  ...AGENT_PROCESS_STATUSES.map(s => v.literal(s)),
);

// ── Issue Live Activity ─────────────────────────────────────────────────────

export const LIVE_ACTIVITY_STATUSES = [
  'active',
  'waiting_for_input',
  'paused',
  'completed',
  'failed',
  'canceled',
  'disconnected',
] as const;
export type LiveActivityStatus = (typeof LIVE_ACTIVITY_STATUSES)[number];

export const liveActivityStatusValidator = v.union(
  ...LIVE_ACTIVITY_STATUSES.map(s => v.literal(s)),
);

// ── Live Messages ───────────────────────────────────────────────────────────

export const LIVE_MESSAGE_DIRECTIONS = [
  'agent_to_vector',
  'vector_to_agent',
] as const;
export type LiveMessageDirection = (typeof LIVE_MESSAGE_DIRECTIONS)[number];

export const LIVE_MESSAGE_ROLES = [
  'status',
  'assistant',
  'user',
  'system',
  'reasoning',
  'tool',
  'error',
  'auth_request',
  'compaction',
] as const;
export type LiveMessageRole = (typeof LIVE_MESSAGE_ROLES)[number];

export const LIVE_MESSAGE_DELIVERY_STATUSES = [
  'sent',
  'pending',
  'delivered',
  'failed',
] as const;
export type LiveMessageDeliveryStatus =
  (typeof LIVE_MESSAGE_DELIVERY_STATUSES)[number];

export const liveMessageDirectionValidator = v.union(
  ...LIVE_MESSAGE_DIRECTIONS.map(d => v.literal(d)),
);

export const liveMessageRoleValidator = v.union(
  ...LIVE_MESSAGE_ROLES.map(r => v.literal(r)),
);

export const liveMessageDeliveryStatusValidator = v.union(
  ...LIVE_MESSAGE_DELIVERY_STATUSES.map(s => v.literal(s)),
);

export const liveMessageStructuredPayloadValidator = v.object({
  source: v.optional(v.literal('cells_agent_event')),
  provider: v.optional(agentProviderValidator),
  title: v.optional(v.string()),
  metadata: v.optional(v.union(v.string(), v.null())),
  attachments: v.optional(v.array(v.string())),
  replyTo: v.optional(v.union(agentReplyReferenceValidator, v.null())),
  authLoginUrl: v.optional(v.union(v.string(), v.null())),
  parentToolUseId: v.optional(v.union(v.string(), v.null())),
  toolUseId: v.optional(v.union(v.string(), v.null())),
  usage: v.optional(agentUsageStatsValidator),
  status: v.optional(
    v.union(
      v.literal('in_progress'),
      v.literal('completed'),
      v.literal('failed'),
    ),
  ),
});

// ── Agent Commands ──────────────────────────────────────────────────────────

export const AGENT_COMMAND_KINDS = [
  'message',
  'resume',
  'stop',
  'approval_response',
  'plan_response',
  'question_response',
  'queue_update',
  'settings_update',
  'request_status',
  'attach_issue',
  'detach_issue',
  'launch',
  'resize',
  'collaboration_prompt',
  'collaboration_cancel',
] as const;
export type AgentCommandKind = (typeof AGENT_COMMAND_KINDS)[number];

export const AGENT_COMMAND_STATUSES = [
  'pending',
  'claimed',
  'delivered',
  'failed',
  'expired',
] as const;
export type AgentCommandStatus = (typeof AGENT_COMMAND_STATUSES)[number];

export const agentCommandKindValidator = v.union(
  ...AGENT_COMMAND_KINDS.map(k => v.literal(k)),
);

export const agentCommandStatusValidator = v.union(
  ...AGENT_COMMAND_STATUSES.map(s => v.literal(s)),
);

// ── Delegated Runs ──────────────────────────────────────────────────────────

export const DELEGATED_RUN_LAUNCH_STATUSES = [
  'pending',
  'launching',
  'running',
  'completed',
  'failed',
  'canceled',
] as const;
export type DelegatedRunLaunchStatus =
  (typeof DELEGATED_RUN_LAUNCH_STATUSES)[number];

export const delegatedRunLaunchStatusValidator = v.union(
  ...DELEGATED_RUN_LAUNCH_STATUSES.map(s => v.literal(s)),
);

// ── Work Sessions ───────────────────────────────────────────────────────────

export const WORK_SESSION_ACCESS_LEVELS = ['viewer', 'controller'] as const;
export type WorkSessionAccessLevel =
  (typeof WORK_SESSION_ACCESS_LEVELS)[number];

export const workSessionAccessLevelValidator = v.union(
  ...WORK_SESSION_ACCESS_LEVELS.map(level => v.literal(level)),
);

// ── Comment Author Kind ─────────────────────────────────────────────────────

export const COMMENT_AUTHOR_KINDS = ['user', 'agent'] as const;
export type CommentAuthorKind = (typeof COMMENT_AUTHOR_KINDS)[number];

export const commentAuthorKindValidator = v.union(
  ...COMMENT_AUTHOR_KINDS.map(k => v.literal(k)),
);

export const COMMENT_AGENT_SOURCES = [
  'vector',
  'codex',
  'claude_code',
  'cursor',
  'copilot',
  'opencode',
  'pi',
] as const;
export type CommentAgentSource = (typeof COMMENT_AGENT_SOURCES)[number];

export const commentAgentSourceValidator = v.union(
  ...COMMENT_AGENT_SOURCES.map(s => v.literal(s)),
);

export const COMMENT_GENERATION_STATUSES = [
  'thinking',
  'done',
  'error',
] as const;
export type CommentGenerationStatus =
  (typeof COMMENT_GENERATION_STATUSES)[number];

export const commentGenerationStatusValidator = v.union(
  ...COMMENT_GENERATION_STATUSES.map(s => v.literal(s)),
);

// ── Workspace Launch Policy ─────────────────────────────────────────────────

export const WORKSPACE_LAUNCH_POLICIES = [
  'allow_delegated',
  'manual_only',
] as const;
export type WorkspaceLaunchPolicy = (typeof WORKSPACE_LAUNCH_POLICIES)[number];

export const workspaceLaunchPolicyValidator = v.union(
  ...WORKSPACE_LAUNCH_POLICIES.map(p => v.literal(p)),
);
