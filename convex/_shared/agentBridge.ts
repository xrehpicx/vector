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

export const AGENT_PROVIDERS = ['codex', 'claude_code', 'vector_cli'] as const;
export type AgentProvider = (typeof AGENT_PROVIDERS)[number];

export const agentProviderValidator = v.union(
  ...AGENT_PROVIDERS.map(p => v.literal(p)),
);

/** User-visible labels per provider (branding rules). */
export const AGENT_PROVIDER_LABELS: Record<AgentProvider, string> = {
  codex: 'Codex',
  claude_code: 'Claude',
  vector_cli: 'Vector CLI',
};

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

// ── Agent Commands ──────────────────────────────────────────────────────────

export const AGENT_COMMAND_KINDS = [
  'message',
  'resume',
  'stop',
  'request_status',
  'attach_issue',
  'detach_issue',
  'launch',
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
