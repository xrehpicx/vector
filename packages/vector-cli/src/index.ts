#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { Command } from 'commander';
import { ConvexClient, ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { api } from '../../../convex/_generated/api.js';
import type { Id } from '../../../convex/_generated/dataModel';
import type { Permission } from '../../../convex/_shared/permissions';
import {
  fetchAuthSession,
  fetchConvexToken,
  loginWithPassword,
  logout,
  pollDeviceToken,
  prompt,
  promptSecret,
  requestDeviceCode,
  signUpWithEmail,
} from './auth';
import { createConvexClient, runAction, runMutation, runQuery } from './convex';
import { printOutput } from './output';
import { isNewerVersion } from './version';
import {
  diffWorkSnapshots,
  parseWorkWatchCategories,
  snapshotWork,
  WORK_WATCH_CATEGORIES,
  type WorkWatchEvent,
  type WorkWatchSource,
} from './work-watch';
import {
  clearSession,
  createEmptySession,
  listProfiles,
  readDefaultProfile,
  readSession,
  writeDefaultProfile,
  writeSession,
  type CliSession,
} from './session';

// Machine-readable commands (especially the native menu bar's `menu-state`
// request) require stdout to contain only the requested payload. dotenv 17
// prints promotional diagnostics by default, which corrupts JSON and `--version`.
loadEnv({ path: '.env.local', override: false, quiet: true });
loadEnv({ path: '.env', override: false, quiet: true });

const cliApi = {
  listWorkspaceReferenceData: makeFunctionReference<'action'>(
    'cli:listWorkspaceReferenceData',
  ),
  searchIcons: makeFunctionReference<'action'>('cli:searchIcons'),
  listDocuments: makeFunctionReference<'action'>('cli:listDocuments'),
  getDocument: makeFunctionReference<'action'>('cli:getDocument'),
  createDocument: makeFunctionReference<'action'>('cli:createDocument'),
  updateDocument: makeFunctionReference<'action'>('cli:updateDocument'),
  deleteDocument: makeFunctionReference<'action'>('cli:deleteDocument'),
  moveDocumentToFolder: makeFunctionReference<'action'>(
    'cli:moveDocumentToFolder',
  ),
  listIssues: makeFunctionReference<'action'>('cli:listIssues'),
  getIssue: makeFunctionReference<'action'>('cli:getIssue'),
  createIssue: makeFunctionReference<'action'>('cli:createIssue'),
  updateIssue: makeFunctionReference<'action'>('cli:updateIssue'),
  deleteIssue: makeFunctionReference<'action'>('cli:deleteIssue'),
  assignIssue: makeFunctionReference<'action'>('cli:assignIssue'),
  unassignIssue: makeFunctionReference<'action'>('cli:unassignIssue'),
  listProjects: makeFunctionReference<'action'>('cli:listProjects'),
  getProject: makeFunctionReference<'action'>('cli:getProject'),
  createProject: makeFunctionReference<'action'>('cli:createProject'),
  updateProject: makeFunctionReference<'action'>('cli:updateProject'),
  deleteProject: makeFunctionReference<'action'>('cli:deleteProject'),
  addProjectMember: makeFunctionReference<'action'>('cli:addProjectMember'),
  removeProjectMember: makeFunctionReference<'action'>(
    'cli:removeProjectMember',
  ),
  changeProjectLead: makeFunctionReference<'action'>('cli:changeProjectLead'),
  listTeams: makeFunctionReference<'action'>('cli:listTeams'),
  getTeam: makeFunctionReference<'action'>('cli:getTeam'),
  createTeam: makeFunctionReference<'action'>('cli:createTeam'),
  updateTeam: makeFunctionReference<'action'>('cli:updateTeam'),
  deleteTeam: makeFunctionReference<'action'>('cli:deleteTeam'),
  addTeamMember: makeFunctionReference<'action'>('cli:addTeamMember'),
  removeTeamMember: makeFunctionReference<'action'>('cli:removeTeamMember'),
  changeTeamLead: makeFunctionReference<'action'>('cli:changeTeamLead'),
  listFolders: makeFunctionReference<'action'>('cli:listFolders'),
  createFolder: makeFunctionReference<'action'>('cli:createFolder'),
  updateFolder: makeFunctionReference<'action'>('cli:updateFolder'),
  deleteFolder: makeFunctionReference<'action'>('cli:deleteFolder'),
};

const rolesApi = api.roles.index;
type OrganizationRoleId = Id<'roles'> | Id<'orgRoles'>;

type GlobalOptions = {
  appUrl?: string;
  convexUrl?: string;
  json?: boolean;
  org?: string;
  profile?: string;
};

const CLI_LIST_FETCH_LIMIT = 500;

type Runtime = {
  appUrl: string;
  convexUrl: string;
  json: boolean;
  org?: string;
  profile: string;
  session: CliSession | null;
};

type ProfileSummary = {
  name: string;
  isDefault: boolean;
  hasSession: boolean;
};

const ISSUE_STATE_TYPES = [
  'backlog',
  'todo',
  'in_progress',
  'done',
  'canceled',
] as const;

const PROJECT_STATUS_TYPES = [
  'backlog',
  'planned',
  'in_progress',
  'completed',
  'canceled',
] as const;

const NOTIFICATION_CATEGORIES = [
  'invites',
  'assignments',
  'mentions',
  'comments',
  'work_sessions',
  'team_status_changes',
  'requests',
  'handoffs',
  'reviews',
  'attention',
  'reminders',
  'github',
] as const;

function requiredString(value: string | undefined, label: string) {
  if (!value?.trim()) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function optionalNumber(value: string | undefined, label: string) {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid number`);
  }

  return parsed;
}

function requiredNumber(value: string | undefined, label: string) {
  const parsed = optionalNumber(value, label);
  if (parsed === undefined) {
    throw new Error(`${label} is required`);
  }
  return parsed;
}

function parseBoolean(value: string, label: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`${label} must be "true" or "false"`);
}

function parseList(value: string | undefined) {
  if (!value) return [];
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function buildPaginationOptions(limit?: string, cursor?: string) {
  return {
    cursor: cursor ?? null,
    numItems: optionalNumber(limit, 'limit') ?? 20,
  };
}

function normalizeMatch(value: string | undefined | null) {
  return value?.trim().toLowerCase();
}

type ListItem = Record<string, unknown>;

function parseDate(value: string): number {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw new Error(`Invalid date: ${value}`);
  }
  return ms;
}

function applyListFilters(
  items: ListItem[],
  options: {
    createdAfter?: string;
    createdBefore?: string;
    updatedAfter?: string;
    updatedBefore?: string;
    sort?: string;
    order?: string;
    limit?: string;
  },
): ListItem[] {
  let result = [...items];

  if (options.createdAfter) {
    const threshold = parseDate(options.createdAfter);
    result = result.filter(
      item => typeof item.createdAt === 'number' && item.createdAt >= threshold,
    );
  }
  if (options.createdBefore) {
    const threshold = parseDate(options.createdBefore);
    result = result.filter(
      item => typeof item.createdAt === 'number' && item.createdAt <= threshold,
    );
  }
  if (options.updatedAfter) {
    const threshold = parseDate(options.updatedAfter);
    result = result.filter(
      item =>
        typeof item.lastEditedAt === 'number' && item.lastEditedAt >= threshold,
    );
  }
  if (options.updatedBefore) {
    const threshold = parseDate(options.updatedBefore);
    result = result.filter(
      item =>
        typeof item.lastEditedAt === 'number' && item.lastEditedAt <= threshold,
    );
  }

  if (options.sort) {
    const field = options.sort;
    const desc = options.order?.toLowerCase() === 'desc';
    result.sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number')
        return desc ? bVal - aVal : aVal - bVal;
      return desc
        ? String(bVal).localeCompare(String(aVal))
        : String(aVal).localeCompare(String(bVal));
    });
  }

  if (options.limit) {
    const limit = Number(options.limit);
    if (Number.isFinite(limit) && limit > 0) {
      result = result.slice(0, limit);
    }
  }

  return result;
}

function addEntityUrls(
  items: ListItem[],
  appUrl: string,
  orgSlug: string,
  entityType:
    | 'issues'
    | 'work'
    | 'requests'
    | 'projects'
    | 'teams'
    | 'documents'
    | 'folders',
): ListItem[] {
  return items.map(item => {
    let path: string;
    switch (entityType) {
      case 'issues':
        path = `/${orgSlug}/issues/${item.key}`;
        break;
      case 'work':
        path = `/${orgSlug}/work/${item.key}`;
        break;
      case 'requests':
        path = `/${orgSlug}/requests/${item.key}`;
        break;
      case 'projects':
        path = `/${orgSlug}/projects/${item.key}`;
        break;
      case 'teams':
        path = `/${orgSlug}/teams/${item.key}`;
        break;
      case 'documents':
        path = `/${orgSlug}/documents/${item.id}`;
        break;
      case 'folders':
        path = `/${orgSlug}/documents/folders/${item.id}`;
        break;
    }
    return { ...item, url: `${appUrl}${path}` };
  });
}

function normalizeAppUrl(raw: string): string {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) {
    const isLocal =
      /^localhost(:\d+)?/i.test(url) || /^127\.0\.0\.1(:\d+)?/.test(url);
    url = isLocal ? `http://${url}` : `https://${url}`;
  }
  // Strip trailing slash for consistency
  return url.replace(/\/+$/, '');
}

async function resolveAppUrl(raw: string): Promise<string> {
  const url = normalizeAppUrl(raw);
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    // Use the final URL after redirects, stripped of trailing slash and path
    const resolved = new URL(response.url).origin;
    return resolved;
  } catch {
    return url;
  }
}

async function fetchAppConfig(
  appUrl: string,
): Promise<{ convexUrl: string; tunnelHost?: string }> {
  try {
    const url = new URL('/api/config', appUrl).toString();
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as {
      convexUrl?: string;
      tunnelHost?: string;
    };
    if (data.convexUrl) {
      return {
        convexUrl: data.convexUrl,
        tunnelHost: data.tunnelHost || undefined,
      };
    }
  } catch {
    // Fall through to default
  }
  return { convexUrl: 'http://127.0.0.1:3210' };
}

async function fetchConvexUrl(appUrl: string): Promise<string> {
  const config = await fetchAppConfig(appUrl);
  return config.convexUrl;
}

async function getRuntime(command: Command) {
  const options = command.optsWithGlobals<GlobalOptions>();
  const profile = options.profile ?? (await readDefaultProfile());
  const session = await readSession(profile);
  const appUrlSource =
    options.appUrl ?? session?.appUrl ?? process.env.NEXT_PUBLIC_APP_URL;
  const appUrl = await resolveAppUrl(requiredString(appUrlSource, 'app URL'));
  // An explicit app URL selects a different environment. Never pair it with a
  // Convex URL cached by another app/profile.
  let convexUrl =
    options.convexUrl ?? (options.appUrl ? undefined : session?.convexUrl);

  if (!convexUrl) {
    // When an explicit --app-url is provided, always fetch from the app
    // to avoid using local env vars that may point at a different deployment.
    const fetchedUrl = await fetchConvexUrl(appUrl);
    convexUrl =
      fetchedUrl !== 'http://127.0.0.1:3210'
        ? fetchedUrl
        : (process.env.NEXT_PUBLIC_CONVEX_URL ??
          process.env.CONVEX_URL ??
          fetchedUrl);
  }

  return {
    appUrl,
    convexUrl,
    json: Boolean(options.json),
    org: options.org ?? session?.activeOrgSlug,
    profile,
    session,
  } satisfies Runtime;
}

function requireSession(runtime: Runtime) {
  if (
    !runtime.session ||
    (Object.keys(runtime.session.cookies).length === 0 &&
      !runtime.session.bearerToken)
  ) {
    throw new Error('Not logged in. Run `vcli auth login` first.');
  }
  return runtime.session;
}

function requireOrg(runtime: Runtime, explicit?: string) {
  const orgSlug = explicit ?? runtime.org;
  if (!orgSlug) {
    throw new Error(
      'Organization slug is required. Pass `--org <slug>` or run `vcli org use <slug>`.',
    );
  }
  return orgSlug;
}

function hostForAppUrl(appUrl?: string) {
  if (!appUrl) {
    return undefined;
  }

  try {
    const url = new URL(appUrl);
    return url.port ? `${url.hostname}:${url.port}` : url.hostname;
  } catch {
    return undefined;
  }
}

function decodeSessionClaims(session: CliSession | null): {
  email?: string;
  userId?: string;
} {
  const jwt = session?.cookies?.['__Secure-better-auth.convex_jwt'];
  if (!jwt) {
    return {};
  }

  const parts = jwt.split('.');
  if (parts.length < 2) {
    return {};
  }

  let payload = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
  while (payload.length % 4 !== 0) {
    payload += '=';
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, 'base64').toString('utf8'),
    ) as {
      email?: string;
      sub?: string;
      userId?: string;
    };
    return {
      email: decoded.email,
      userId: decoded.sub ?? decoded.userId,
    };
  } catch {
    return {};
  }
}

function buildMenuSessionInfo(session: CliSession | null) {
  const claims = decodeSessionClaims(session);
  return {
    orgSlug: session?.activeOrgSlug ?? '',
    appUrl: session?.appUrl,
    appDomain: hostForAppUrl(session?.appUrl),
    email: claims.email,
    userId: claims.userId,
  };
}

function projectMenuRecords(value: unknown, keys: string[]): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => {
    if (!item || typeof item !== 'object') return {};
    const record = item as Record<string, unknown>;
    return Object.fromEntries(
      keys.filter(key => key in record).map(key => [key, record[key]]),
    );
  });
}

function parseAgentProvider(
  value: string,
): 'codex' | 'claude_code' | 'vector_cli' {
  if (value === 'codex' || value === 'claude_code' || value === 'vector_cli') {
    return value;
  }
  throw new Error('provider must be one of: codex, claude_code, vector_cli');
}

function isBridgeDeviceAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeData = (error as { data?: unknown }).data;
  return (
    maybeData === 'INVALID_DEVICE_SECRET' || maybeData === 'DEVICE_NOT_FOUND'
  );
}

async function validateStoredBridgeConfig(
  config: Awaited<ReturnType<typeof setupBridgeDevice>>,
): Promise<boolean> {
  const client = new ConvexHttpClient(config.convexUrl);

  try {
    await client.mutation(api.agentBridge.bridgePublic.heartbeat, {
      deviceId: config.deviceId as Id<'agentDevices'>,
      deviceSecret: config.deviceSecret,
    });
    return true;
  } catch (error) {
    if (isBridgeDeviceAuthError(error)) {
      return false;
    }
    throw error;
  }
}

async function getClient(command: Command) {
  const runtime = await getRuntime(command);
  const session = requireSession(runtime);
  const client = await createConvexClient(
    session,
    runtime.appUrl,
    runtime.convexUrl,
  );
  return { client, runtime, session };
}

async function ensureBridgeConfig(
  command: Command,
): Promise<Awaited<ReturnType<typeof setupBridgeDevice>>> {
  let config = loadBridgeConfig();

  try {
    const runtime = await getRuntime(command);
    const session = requireSession(runtime);
    const client = await createConvexClient(
      session,
      runtime.appUrl,
      runtime.convexUrl,
    );
    const user = await runQuery(client, api.users.currentUser);
    if (!user) {
      throw new Error('Not logged in. Run `vcli auth login` first.');
    }

    const backendDevice = config
      ? await runQuery(client, api.agentBridge.queries.getDevice, {
          deviceId: config.deviceId as Id<'agentDevices'>,
        })
      : null;

    const needsRegistration =
      !config ||
      config.userId !== user._id ||
      config.convexUrl !== runtime.convexUrl ||
      !backendDevice ||
      !(await validateStoredBridgeConfig(config));

    if (needsRegistration) {
      config = await setupBridgeDevice(client, runtime.convexUrl);
    }

    if (!config) {
      throw new Error('Bridge device is not configured.');
    }

    // Fetch tunnel host from app config
    const appConfig = await fetchAppConfig(runtime.appUrl);
    if (appConfig.tunnelHost) {
      config.tunnelHost = appConfig.tunnelHost;
    }

    saveBridgeConfig(config);
    return config;
  } catch (error) {
    throw error;
  }
}

async function resolveMemberId(
  client: Awaited<ReturnType<typeof createConvexClient>>,
  orgSlug: string,
  ref: string,
): Promise<Id<'users'>> {
  const members = await runQuery(
    client,
    api.organizations.queries.listMembers,
    {
      orgSlug,
    },
  );
  const needle = normalizeMatch(ref);
  const matches = members.filter(member => {
    const user = member.user;
    if (!user) return false;
    return (
      normalizeMatch(String(user._id)) === needle ||
      normalizeMatch(user.email) === needle ||
      normalizeMatch(user.name) === needle ||
      normalizeMatch(user.username) === needle
    );
  });

  if (matches.length === 0) {
    throw new Error(`No member matched "${ref}"`);
  }
  if (matches.length > 1) {
    throw new Error(`Multiple members matched "${ref}"`);
  }
  return matches[0]!.user!._id;
}

async function resolveRoleId(
  client: Awaited<ReturnType<typeof createConvexClient>>,
  orgSlug: string,
  ref: string,
): Promise<OrganizationRoleId> {
  const roles = await runQuery(client, rolesApi.list, { orgSlug });
  const needle = normalizeMatch(ref);
  const matches = roles.filter(role => {
    const candidate = role as { _id: string; name?: string; key?: string };
    return (
      normalizeMatch(String(candidate._id)) === needle ||
      normalizeMatch(candidate.name) === needle ||
      normalizeMatch(candidate.key) === needle
    );
  });

  if (matches.length === 0) {
    throw new Error(`No role matched "${ref}"`);
  }
  if (matches.length > 1) {
    throw new Error(`Multiple roles matched "${ref}"`);
  }
  return matches[0]!._id;
}

function parsePermissions(value: string): Permission[] {
  return value
    .split(',')
    .map(permission => permission.trim())
    .filter(Boolean) as Permission[];
}

function nullableOption(value: string | undefined, clear = false) {
  if (clear) return null;
  return value;
}

function mimeTypeForFile(filePath: string) {
  switch (extname(filePath).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

async function uploadFile(uploadUrl: string, filePath: string) {
  const body = await readFile(filePath);
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': mimeTypeForFile(filePath),
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Upload failed with HTTP ${response.status}`);
  }

  const data = (await response.json()) as { storageId?: Id<'_storage'> };
  if (!data.storageId) {
    throw new Error('Upload response did not include a storageId');
  }

  return data.storageId;
}

async function resolveTeamId(
  client: Awaited<ReturnType<typeof createConvexClient>>,
  orgSlug: string,
  teamKey?: string,
) {
  if (!teamKey) {
    return undefined;
  }
  const team = await runAction(client, cliApi.getTeam, { orgSlug, teamKey });
  return team.id as Id<'teams'>;
}

async function resolveProjectId(
  client: Awaited<ReturnType<typeof createConvexClient>>,
  orgSlug: string,
  projectKey?: string,
) {
  if (!projectKey) {
    return undefined;
  }
  const project = await runAction(client, cliApi.getProject, {
    orgSlug,
    projectKey,
  });
  return project.id as Id<'projects'>;
}

async function resolveIssueId(
  client: Awaited<ReturnType<typeof createConvexClient>>,
  orgSlug: string,
  issueKey: string,
) {
  const issue = await runAction(client, cliApi.getIssue, { orgSlug, issueKey });
  return issue.id as Id<'issues'>;
}

async function resolveWork(
  client: ConvexHttpClient,
  orgSlug: string,
  workKey: string,
) {
  const work = await runQuery(client, api.work.queries.getByKey, {
    orgSlug,
    workKey,
  });
  if (!work) throw new Error(`Work not found: ${workKey}`);
  return work;
}

async function resolveRequest(
  client: ConvexHttpClient,
  orgSlug: string,
  requestKey: string,
) {
  const request = await runQuery(client, api.requests.queries.getByKey, {
    orgSlug,
    requestKey,
  });
  if (!request) throw new Error(`Request not found: ${requestKey}`);
  return request;
}

async function resolveTask(
  client: ConvexHttpClient,
  workId: Id<'issues'>,
  taskNumber: string,
) {
  const number = requiredNumber(taskNumber, 'task number');
  const tasks = await runQuery(client, api.tasks.queries.listByWork, {
    workId,
  });
  const task = tasks.find(item => item.number === number);
  if (!task) throw new Error(`Task not found: #${number}`);
  return task;
}

async function resolveDocumentId(
  client: Awaited<ReturnType<typeof createConvexClient>>,
  orgSlug: string,
  documentId: string,
) {
  const document = await runAction(client, cliApi.getDocument, {
    orgSlug,
    documentId,
  });
  return document.id as Id<'documents'>;
}

async function resolveIssueStateId(
  client: Awaited<ReturnType<typeof createConvexClient>>,
  orgSlug: string,
  ref: string,
) {
  const states = await runQuery(
    client,
    api.organizations.queries.listIssueStates,
    {
      orgSlug,
    },
  );
  const needle = normalizeMatch(ref);
  const match = states.find(state => {
    return (
      normalizeMatch(String(state._id)) === needle ||
      normalizeMatch(state.name) === needle ||
      normalizeMatch(state.type) === needle
    );
  });

  if (!match) {
    throw new Error(`No issue state matched "${ref}"`);
  }

  return match._id;
}

async function resolveIssuePriorityId(
  client: Awaited<ReturnType<typeof createConvexClient>>,
  orgSlug: string,
  ref: string,
) {
  const priorities = await runQuery(
    client,
    api.organizations.queries.listIssuePriorities,
    { orgSlug },
  );
  const needle = normalizeMatch(ref);
  const match = priorities.find(priority => {
    return (
      normalizeMatch(String(priority._id)) === needle ||
      normalizeMatch(priority.name) === needle
    );
  });

  if (!match) {
    throw new Error(`No issue priority matched "${ref}"`);
  }

  return match._id;
}

async function resolveProjectStatusId(
  client: Awaited<ReturnType<typeof createConvexClient>>,
  orgSlug: string,
  ref: string,
) {
  const statuses = await runQuery(
    client,
    api.organizations.queries.listProjectStatuses,
    { orgSlug },
  );
  const needle = normalizeMatch(ref);
  const match = statuses.find(status => {
    return (
      normalizeMatch(String(status._id)) === needle ||
      normalizeMatch(status.name) === needle ||
      normalizeMatch(status.type) === needle
    );
  });

  if (!match) {
    throw new Error(`No project status matched "${ref}"`);
  }

  return match._id;
}

async function parseEstimatedTimes(
  client: Awaited<ReturnType<typeof createConvexClient>>,
  orgSlug: string,
  value: string,
) {
  const entries = parseList(value);
  const estimatedTimes: Record<string, number> = {};

  for (const entry of entries) {
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex <= 0) {
      throw new Error(
        'estimated times must use the format "state=hours,state=hours"',
      );
    }

    const stateRef = entry.slice(0, separatorIndex).trim();
    const hours = Number(entry.slice(separatorIndex + 1).trim());
    if (!Number.isFinite(hours)) {
      throw new Error(`Invalid estimate for "${stateRef}"`);
    }

    const stateId = await resolveIssueStateId(client, orgSlug, stateRef);
    estimatedTimes[String(stateId)] = hours;
  }

  return estimatedTimes;
}

const program = new Command();

function readPackageVersionSync(): string {
  try {
    const dir = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(dir, '..', 'package.json'), 'utf8');
    return (JSON.parse(raw) as { version?: string }).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

program
  .name('vcli')
  .description('Vector CLI')
  .version(readPackageVersionSync(), '-v, --version')
  .showHelpAfterError()
  .option(
    '--app-url <url>',
    'Vector app URL. Required unless saved in the profile or NEXT_PUBLIC_APP_URL is set.',
  )
  .option('--convex-url <url>', 'Convex deployment URL')
  .option('--org <slug>', 'Organization slug override')
  .option('--profile <name>', 'CLI profile name')
  .option('--json', 'Output JSON');

const authCommand = program.command('auth').description('Authentication');

authCommand
  .command('signup')
  .option('--email <email>', 'Email address')
  .option('--username <username>', 'Username')
  .option('--password <password>', 'Password')
  .action(async (options, command) => {
    const runtime = await getRuntime(command);
    const email = requiredString(
      options.email?.trim() || (await prompt('Email: ')),
      'email',
    ).toLowerCase();
    const username = requiredString(
      options.username?.trim() || (await prompt('Username: ')),
      'username',
    );
    const password =
      options.password?.trim() || (await promptSecret('Password: '));

    let session = createEmptySession();
    session.appUrl = runtime.appUrl;
    session.convexUrl = runtime.convexUrl;

    session = await signUpWithEmail(
      session,
      runtime.appUrl,
      email,
      username,
      password,
    );
    const authState = await fetchAuthSession(session, runtime.appUrl);
    session = authState.session;

    const client = await createConvexClient(
      session,
      runtime.appUrl,
      runtime.convexUrl,
    );
    const orgs = await runQuery(client, api.users.getOrganizations, {});
    session.activeOrgSlug = orgs[0]?.slug ?? session.activeOrgSlug;

    await writeSession(session, runtime.profile);
    printOutput(
      {
        signedUpAs:
          authState.user?.email ??
          authState.user?.username ??
          authState.user?.name,
        activeOrgSlug: session.activeOrgSlug ?? null,
      },
      runtime.json,
    );
  });

authCommand
  .command('login [identifier]')
  .option('--password <password>', 'Password (uses device flow if omitted)')
  .action(async (identifier, options, command) => {
    const runtime = await getRuntime(command);
    let session = createEmptySession();
    session.appUrl = runtime.appUrl;
    session.convexUrl = runtime.convexUrl;

    const usePassword = Boolean(identifier || options.password);

    if (usePassword) {
      const loginId =
        identifier?.trim() || (await prompt('Email or username: '));
      const password =
        options.password?.trim() || (await promptSecret('Password: '));
      session = await loginWithPassword(
        session,
        runtime.appUrl,
        loginId,
        password,
      );
    } else {
      const deviceResp = await requestDeviceCode(runtime.appUrl, 'vcli');
      const verifyUrl = `${runtime.appUrl}/device?user_code=${deviceResp.user_code}`;
      const writeLoginProgress = runtime.json ? console.error : console.log;

      writeLoginProgress();
      writeLoginProgress(`  Open this URL in your browser to log in:`);
      writeLoginProgress();
      writeLoginProgress(`    ${verifyUrl}`);
      writeLoginProgress();
      writeLoginProgress(`  Or go to ${runtime.appUrl}/device and enter code:`);
      writeLoginProgress();
      writeLoginProgress(`    ${deviceResp.user_code}`);
      writeLoginProgress();

      const open = await import('open').then(m => m.default).catch(() => null);
      if (open) {
        await open(verifyUrl).catch(() => {});
      }

      writeLoginProgress('  Waiting for authorization...');
      session = await pollDeviceToken(
        session,
        runtime.appUrl,
        deviceResp.device_code,
        'vcli',
        deviceResp.interval,
        deviceResp.expires_in,
      );
    }

    const authState = await fetchAuthSession(session, runtime.appUrl);
    session = authState.session;

    const client = await createConvexClient(
      session,
      runtime.appUrl,
      runtime.convexUrl,
    );
    const orgs = await runQuery(client, api.users.getOrganizations, {});
    session.activeOrgSlug = orgs[0]?.slug ?? session.activeOrgSlug;

    await writeSession(session, runtime.profile);
    printOutput(
      {
        loggedInAs:
          authState.user?.email ??
          authState.user?.username ??
          authState.user?.name,
        activeOrgSlug: session.activeOrgSlug ?? null,
      },
      runtime.json,
    );
  });

authCommand.command('logout').action(async (_options, command) => {
  const runtime = await getRuntime(command);
  const session = requireSession(runtime);
  try {
    await logout(session, runtime.appUrl);
  } catch (error) {
    console.error(
      `Warning: remote logout failed; the local session was still cleared (${error instanceof Error ? error.message : String(error)}).`,
    );
  }
  await clearSession(runtime.profile);
  printOutput({ success: true }, runtime.json);
});

authCommand.command('whoami').action(async (_options, command) => {
  const { client, runtime } = await getClient(command);
  const [user, orgs] = await Promise.all([
    runQuery(client, api.users.getCurrentUser, {}),
    runQuery(client, api.users.getOrganizations, {}),
  ]);
  printOutput(
    {
      user,
      organizations: orgs,
      activeOrgSlug: runtime.org ?? null,
    },
    runtime.json,
  );
});

authCommand.command('profiles').action(async (_options, command) => {
  const options = command.optsWithGlobals() as GlobalOptions;
  const explicitProfile = options.profile?.trim();
  const defaultProfile = await readDefaultProfile();
  const profiles = await listProfiles();
  const activeProfile = explicitProfile || defaultProfile;
  printOutput(
    {
      activeProfile,
      defaultProfile,
      profiles,
    },
    Boolean(options.json),
  );
});

authCommand
  .command('use-profile <name>')
  .action(async (name, _options, command) => {
    const options = command.optsWithGlobals() as GlobalOptions;
    const profile = name.trim();
    if (!profile) {
      throw new Error('Profile name is required.');
    }
    await writeDefaultProfile(profile);
    const session = await readSession(profile);
    printOutput(
      {
        ok: true,
        defaultProfile: profile,
        hasSession: session !== null,
      },
      Boolean(options.json),
    );
  });

const orgCommand = program.command('org').description('Organizations');

orgCommand.command('list').action(async (_options, command) => {
  const { client, runtime } = await getClient(command);
  const orgs = await runQuery(client, api.users.getOrganizations, {});
  printOutput(orgs, runtime.json);
});

orgCommand.command('current').action(async (_options, command) => {
  const runtime = await getRuntime(command);
  printOutput({ activeOrgSlug: runtime.org ?? null }, runtime.json);
});

orgCommand.command('use <slug>').action(async (slug, _options, command) => {
  const runtime = await getRuntime(command);
  const session = requireSession(runtime);
  session.activeOrgSlug = slug;
  session.appUrl = runtime.appUrl;
  session.convexUrl = runtime.convexUrl;
  await writeSession(session, runtime.profile);
  printOutput({ activeOrgSlug: slug }, runtime.json);
});

orgCommand
  .command('create')
  .requiredOption('--name <name>')
  .requiredOption('--slug <slug>')
  .action(async (options, command) => {
    const { client, runtime, session } = await getClient(command);
    const result = await runMutation(
      client,
      api.organizations.mutations.create,
      {
        data: {
          name: options.name,
          slug: options.slug,
        },
      },
    );
    if (session) {
      session.activeOrgSlug = options.slug;
      session.appUrl = runtime.appUrl;
      session.convexUrl = runtime.convexUrl;
      await writeSession(session, runtime.profile);
    }
    printOutput(result, runtime.json);
  });

orgCommand
  .command('update [slug]')
  .option('--name <name>')
  .option('--new-slug <slug>')
  .action(async (slug, options, command) => {
    const { client, runtime, session } = await getClient(command);
    const orgSlug = requireOrg(runtime, slug);
    const result = await runMutation(
      client,
      api.organizations.mutations.update,
      {
        orgSlug,
        data: {
          ...(options.name ? { name: options.name } : {}),
          ...(options.newSlug ? { slug: options.newSlug } : {}),
        },
      },
    );
    if (session && options.newSlug && session.activeOrgSlug === orgSlug) {
      session.activeOrgSlug = options.newSlug;
      await writeSession(session, runtime.profile);
    }
    printOutput(result, runtime.json);
  });

orgCommand.command('stats [slug]').action(async (slug, _options, command) => {
  const { client, runtime } = await getClient(command);
  const orgSlug = requireOrg(runtime, slug);
  const result = await runQuery(
    client,
    api.organizations.queries.getOrganizationStats,
    { orgSlug },
  );
  printOutput(result, runtime.json);
});

orgCommand
  .command('logo [slug]')
  .option('--file <path>')
  .option('--remove')
  .action(async (slug, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime, slug);

    if (options.remove) {
      throw new Error(
        'Organization logo removal is not exposed by the current backend API.',
      );
    }

    const filePath = requiredString(options.file, 'file');
    const uploadUrl = await runMutation(
      client,
      api.organizations.mutations.generateLogoUploadUrl,
      { orgSlug },
    );
    const storageId = await uploadFile(uploadUrl, filePath);
    const result = await runMutation(
      client,
      api.organizations.mutations.updateLogoWithStorageId,
      {
        orgSlug,
        storageId,
      },
    );
    printOutput(
      { ...(result ?? { success: true }), storageId, orgSlug },
      runtime.json,
    );
  });

orgCommand.command('members [slug]').action(async (slug, _options, command) => {
  const { client, runtime } = await getClient(command);
  const orgSlug = requireOrg(runtime, slug);
  const members = await runQuery(
    client,
    api.organizations.queries.listMembersWithRoles,
    {
      orgSlug,
    },
  );
  printOutput(members, runtime.json);
});

orgCommand.command('invites [slug]').action(async (slug, _options, command) => {
  const { client, runtime } = await getClient(command);
  const orgSlug = requireOrg(runtime, slug);
  const invites = await runQuery(
    client,
    api.organizations.queries.listInvites,
    {
      orgSlug,
    },
  );
  printOutput(invites, runtime.json);
});

orgCommand
  .command('invite [slug]')
  .requiredOption('--email <email>')
  .option('--role <role>', 'member or admin', 'member')
  .action(async (slug, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime, slug);
    const result = await runMutation(
      client,
      api.organizations.mutations.invite,
      {
        orgSlug,
        email: options.email,
        role: options.role,
      },
    );
    printOutput(result, runtime.json);
  });

orgCommand
  .command('member-role <member>')
  .requiredOption('--role <role>', 'member or admin')
  .action(async (member, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const userId = await resolveMemberId(client, orgSlug, member);
    const result = await runMutation(
      client,
      api.organizations.mutations.updateMemberRole,
      {
        orgSlug,
        userId,
        role: options.role,
      },
    );
    printOutput(result, runtime.json);
  });

orgCommand
  .command('remove-member <member>')
  .action(async (member, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const userId = await resolveMemberId(client, orgSlug, member);
    const result = await runMutation(
      client,
      api.organizations.mutations.removeMember,
      {
        orgSlug,
        userId,
      },
    );
    printOutput(result ?? { success: true }, runtime.json);
  });

orgCommand
  .command('revoke-invite <inviteId>')
  .action(async (inviteId, _options, command) => {
    const { client, runtime } = await getClient(command);
    const result = await runMutation(
      client,
      api.organizations.mutations.revokeInvite,
      {
        inviteId,
      },
    );
    printOutput(result ?? { success: true }, runtime.json);
  });

const roleCommand = program.command('role').description('Organization roles');

roleCommand.command('list [slug]').action(async (slug, _options, command) => {
  const { client, runtime } = await getClient(command);
  const orgSlug = requireOrg(runtime, slug);
  const roles = await runQuery(client, rolesApi.list, { orgSlug });
  printOutput(roles, runtime.json);
});

roleCommand.command('get <role>').action(async (role, _options, command) => {
  const { client, runtime } = await getClient(command);
  const orgSlug = requireOrg(runtime);
  const roleId = await resolveRoleId(client, orgSlug, role);
  const [summary, permissions] = await Promise.all([
    runQuery(client, rolesApi.get, { orgSlug, roleId }),
    runQuery(client, rolesApi.getPermissions, { roleId }),
  ]);
  printOutput({ summary, permissions }, runtime.json);
});

roleCommand
  .command('create')
  .requiredOption('--name <name>')
  .requiredOption('--permissions <permissions>', 'Comma-separated permissions')
  .option('--description <description>')
  .action(async (options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runMutation(client, rolesApi.create, {
      orgSlug,
      name: options.name,
      description: options.description,
      permissions: parsePermissions(options.permissions),
    });
    printOutput({ roleId: result }, runtime.json);
  });

roleCommand
  .command('update <role>')
  .requiredOption('--name <name>')
  .requiredOption('--permissions <permissions>', 'Comma-separated permissions')
  .option('--description <description>')
  .action(async (role, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const roleId = await resolveRoleId(client, orgSlug, role);
    const result = await runMutation(client, rolesApi.update, {
      orgSlug,
      roleId,
      name: options.name,
      description: options.description,
      permissions: parsePermissions(options.permissions),
    });
    printOutput(result ?? { success: true }, runtime.json);
  });

roleCommand
  .command('assign <role> <member>')
  .action(async (role, member, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const [roleId, userId] = await Promise.all([
      resolveRoleId(client, orgSlug, role),
      resolveMemberId(client, orgSlug, member),
    ]);
    const result = await runMutation(client, rolesApi.assign, {
      orgSlug,
      roleId,
      userId,
    });
    printOutput({ assignmentId: result }, runtime.json);
  });

roleCommand
  .command('unassign <role> <member>')
  .action(async (role, member, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const [roleId, userId] = await Promise.all([
      resolveRoleId(client, orgSlug, role),
      resolveMemberId(client, orgSlug, member),
    ]);
    const result = await runMutation(client, rolesApi.removeAssignment, {
      orgSlug,
      roleId,
      userId,
    });
    printOutput(result ?? { success: true }, runtime.json);
  });

const inviteCommand = program.command('invite').description('Invitations');

inviteCommand.command('list').action(async (_options, command) => {
  const { client, runtime } = await getClient(command);
  const invites = await runQuery(client, api.users.getPendingInvitations, {});
  printOutput(invites, runtime.json);
});

inviteCommand
  .command('accept <inviteId>')
  .action(async (inviteId, _options, command) => {
    const { client, runtime } = await getClient(command);
    const result = await runMutation(
      client,
      api.organizations.mutations.acceptInvitation,
      { inviteId },
    );
    printOutput(result ?? { success: true }, runtime.json);
  });

inviteCommand
  .command('decline <inviteId>')
  .action(async (inviteId, _options, command) => {
    const { client, runtime } = await getClient(command);
    const result = await runMutation(
      client,
      api.organizations.mutations.declineInvitation,
      { inviteId },
    );
    printOutput(result ?? { success: true }, runtime.json);
  });

program.command('refdata [slug]').action(async (slug, _options, command) => {
  const { client, runtime } = await getClient(command);
  const orgSlug = requireOrg(runtime, slug);
  const result = await runAction(client, cliApi.listWorkspaceReferenceData, {
    orgSlug,
  });
  printOutput(result, runtime.json);
});

program
  .command('icons <query>')
  .option('--limit <n>')
  .action(async (query, options, command) => {
    const { client, runtime } = await getClient(command);
    const result = await runAction(client, cliApi.searchIcons, {
      query,
      limit: options.limit ? Number(options.limit) : undefined,
    });
    printOutput(result, runtime.json);
  });

program
  .command('search <query>')
  .option('--limit <n>')
  .action(async (query, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runQuery(client, api.search.queries.searchEntities, {
      orgSlug,
      query,
      limit: optionalNumber(options.limit, 'limit'),
    });
    printOutput(result, runtime.json);
  });

const permissionCommand = program
  .command('permission')
  .description('Permission checks');

permissionCommand
  .command('check <permission>')
  .option('--team <teamKey>')
  .option('--project <projectKey>')
  .action(async (permission, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const [teamId, projectId] = await Promise.all([
      resolveTeamId(client, orgSlug, options.team),
      resolveProjectId(client, orgSlug, options.project),
    ]);
    const result = await runQuery(client, api.permissions.utils.has, {
      orgSlug,
      permission,
      teamId,
      projectId,
    });
    printOutput(
      { permission, allowed: result, teamId, projectId },
      runtime.json,
    );
  });

permissionCommand
  .command('check-many <permissions>')
  .option('--team <teamKey>')
  .option('--project <projectKey>')
  .action(async (permissions, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const [teamId, projectId] = await Promise.all([
      resolveTeamId(client, orgSlug, options.team),
      resolveProjectId(client, orgSlug, options.project),
    ]);
    const permissionList = parsePermissions(permissions);
    const result = await runQuery(client, api.permissions.utils.hasMultiple, {
      orgSlug,
      permissions: permissionList,
      teamId,
      projectId,
    });
    printOutput(result, runtime.json);
  });

const activityCommand = program
  .command('activity')
  .description('Activity feed');

activityCommand
  .command('list')
  .description(
    'List org-wide activity with optional filters by entity type, event type, and time range',
  )
  .option(
    '--entity-type <type>',
    'Filter by entity type: issue, project, team, document',
  )
  .option(
    '--event-type <type>',
    'Filter by event type (e.g. issue_created, issue_priority_changed)',
  )
  .option(
    '--since <datetime>',
    'Start of time range (ISO date or shorthand: today, yesterday, 7d, 30d)',
  )
  .option(
    '--until <datetime>',
    'End of time range (ISO date or shorthand: today, now)',
  )
  .option('--limit <n>')
  .option('--cursor <cursor>')
  .action(async (options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);

    function parseTimeArg(
      value: string | undefined,
      bound: 'start' | 'end',
    ): number | undefined {
      if (!value) return undefined;
      const now = new Date();
      const startOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );
      const endOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        23,
        59,
        59,
        999,
      );
      switch (value) {
        case 'now':
          return now.getTime();
        case 'today':
          return bound === 'start'
            ? startOfToday.getTime()
            : endOfToday.getTime();
        case 'yesterday':
          return bound === 'start'
            ? startOfToday.getTime() - 86400000
            : startOfToday.getTime() - 1;
        default: {
          const daysMatch = value.match(/^(\d+)d$/);
          if (daysMatch) {
            return now.getTime() - Number(daysMatch[1]) * 86400000;
          }
          const parsed = new Date(value).getTime();
          if (Number.isNaN(parsed)) {
            throw new Error(`Invalid time value: ${value}`);
          }
          return parsed;
        }
      }
    }

    const result = await runQuery(
      client,
      api.activities.queries.listOrgActivity,
      {
        orgSlug,
        entityType: options.entityType ?? undefined,
        eventType: options.eventType ?? undefined,
        since: parseTimeArg(options.since, 'start'),
        until: parseTimeArg(options.until, 'end'),
        limit: optionalNumber(options.limit, 'limit') ?? undefined,
        cursor: options.cursor ?? undefined,
      },
    );
    printOutput(result, runtime.json);
  });

activityCommand
  .command('project <projectKey>')
  .option('--limit <n>')
  .option('--cursor <cursor>')
  .action(async (projectKey, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const projectId = await resolveProjectId(client, orgSlug, projectKey);
    const result = await runQuery(
      client,
      api.activities.queries.listProjectActivity,
      {
        projectId: projectId!,
        paginationOpts: buildPaginationOptions(options.limit, options.cursor),
      },
    );
    printOutput(result, runtime.json);
  });

activityCommand
  .command('team <teamKey>')
  .option('--limit <n>')
  .option('--cursor <cursor>')
  .action(async (teamKey, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const teamId = await resolveTeamId(client, orgSlug, teamKey);
    const result = await runQuery(
      client,
      api.activities.queries.listTeamActivity,
      {
        teamId: teamId!,
        paginationOpts: buildPaginationOptions(options.limit, options.cursor),
      },
    );
    printOutput(result, runtime.json);
  });

activityCommand
  .command('issue <issueKey>')
  .option('--limit <n>')
  .option('--cursor <cursor>')
  .action(async (issueKey, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const issueId = await resolveIssueId(client, orgSlug, issueKey);
    const result = await runQuery(
      client,
      api.activities.queries.listIssueActivity,
      {
        issueId,
        paginationOpts: buildPaginationOptions(options.limit, options.cursor),
      },
    );
    printOutput(result, runtime.json);
  });

activityCommand
  .command('document <documentId>')
  .option('--limit <n>')
  .option('--cursor <cursor>')
  .action(async (documentId, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const resolvedDocumentId = await resolveDocumentId(
      client,
      orgSlug,
      documentId,
    );
    const result = await runQuery(
      client,
      api.activities.queries.listDocumentActivity,
      {
        documentId: resolvedDocumentId,
        paginationOpts: buildPaginationOptions(options.limit, options.cursor),
      },
    );
    printOutput(result, runtime.json);
  });

const notificationCommand = program
  .command('notification')
  .description('Notifications');

notificationCommand
  .command('inbox')
  .option('--filter <filter>', 'all or unread')
  .option('--limit <n>')
  .option('--cursor <cursor>')
  .action(async (options, command) => {
    const { client, runtime } = await getClient(command);
    const result = await runQuery(client, api.notifications.queries.listInbox, {
      filter: options.filter,
      paginationOpts: buildPaginationOptions(options.limit, options.cursor),
    });
    printOutput(result, runtime.json);
  });

notificationCommand
  .command('unread-count')
  .action(async (_options, command) => {
    const { client, runtime } = await getClient(command);
    const result = await runQuery(
      client,
      api.notifications.queries.unreadCount,
      {},
    );
    printOutput({ unreadCount: result }, runtime.json);
  });

notificationCommand
  .command('mark-read <recipientId>')
  .action(async (recipientId, _options, command) => {
    const { client, runtime } = await getClient(command);
    const result = await runMutation(
      client,
      api.notifications.mutations.markRead,
      {
        recipientId,
      },
    );
    printOutput(result, runtime.json);
  });

notificationCommand
  .command('mark-all-read')
  .action(async (_options, command) => {
    const { client, runtime } = await getClient(command);
    const result = await runMutation(
      client,
      api.notifications.mutations.markAllRead,
      {},
    );
    printOutput(result, runtime.json);
  });

notificationCommand
  .command('archive <recipientId>')
  .action(async (recipientId, _options, command) => {
    const { client, runtime } = await getClient(command);
    const result = await runMutation(
      client,
      api.notifications.mutations.archive,
      {
        recipientId,
      },
    );
    printOutput(result, runtime.json);
  });

notificationCommand.command('preferences').action(async (_options, command) => {
  const { client, runtime } = await getClient(command);
  const result = await runQuery(
    client,
    api.notifications.queries.getPreferences,
    {},
  );
  printOutput(result, runtime.json);
});

notificationCommand
  .command('set-preference <category>')
  .requiredOption('--in-app <true|false>')
  .requiredOption('--email <true|false>')
  .requiredOption('--push <true|false>')
  .action(async (category, options, command) => {
    const { client, runtime } = await getClient(command);
    if (!NOTIFICATION_CATEGORIES.includes(category)) {
      throw new Error(
        `category must be one of: ${NOTIFICATION_CATEGORIES.join(', ')}`,
      );
    }
    const result = await runMutation(
      client,
      api.notifications.mutations.updatePreferences,
      {
        category,
        inAppEnabled: parseBoolean(options.inApp, 'in-app'),
        emailEnabled: parseBoolean(options.email, 'email'),
        pushEnabled: parseBoolean(options.push, 'push'),
      },
    );
    printOutput(result, runtime.json);
  });

notificationCommand
  .command('subscriptions')
  .action(async (_options, command) => {
    const { client, runtime } = await getClient(command);
    const result = await runQuery(
      client,
      api.notifications.queries.listPushSubscriptions,
      {},
    );
    printOutput(result, runtime.json);
  });

notificationCommand
  .command('remove-subscription <subscriptionId>')
  .action(async (subscriptionId, _options, command) => {
    const { client, runtime } = await getClient(command);
    const result = await runMutation(
      client,
      api.notifications.mutations.removePushSubscription,
      { subscriptionId },
    );
    printOutput(result, runtime.json);
  });

const priorityCommand = program
  .command('priority')
  .description('Issue priorities');

priorityCommand
  .command('list [slug]')
  .action(async (slug, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime, slug);
    const result = await runQuery(
      client,
      api.organizations.queries.listIssuePriorities,
      { orgSlug },
    );
    printOutput(result, runtime.json);
  });

priorityCommand
  .command('create')
  .requiredOption('--name <name>')
  .requiredOption('--weight <n>')
  .requiredOption('--color <hex>')
  .option('--icon <icon>')
  .action(async (options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runMutation(
      client,
      api.organizations.mutations.createIssuePriority,
      {
        orgSlug,
        name: options.name,
        weight: requiredNumber(options.weight, 'weight'),
        color: options.color,
        icon: options.icon,
      },
    );
    printOutput(result, runtime.json);
  });

priorityCommand
  .command('update <priority>')
  .requiredOption('--name <name>')
  .requiredOption('--color <hex>')
  .option('--weight <n>')
  .option('--icon <icon>')
  .option('--clear-icon')
  .action(async (priority, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const priorityId = await resolveIssuePriorityId(client, orgSlug, priority);
    const result = await runMutation(
      client,
      api.organizations.mutations.updateIssuePriority,
      {
        orgSlug,
        priorityId,
        name: options.name,
        weight: optionalNumber(options.weight, 'weight'),
        color: options.color,
        icon: nullableOption(options.icon, options.clearIcon),
      },
    );
    printOutput(result ?? { success: true }, runtime.json);
  });

priorityCommand
  .command('delete <priority>')
  .action(async (priority, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const priorityId = await resolveIssuePriorityId(client, orgSlug, priority);
    const result = await runMutation(
      client,
      api.organizations.mutations.deleteIssuePriority,
      {
        orgSlug,
        priorityId,
      },
    );
    printOutput(result ?? { success: true }, runtime.json);
  });

priorityCommand
  .command('reset [slug]')
  .action(async (slug, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime, slug);
    const result = await runMutation(
      client,
      api.organizations.mutations.resetIssuePriorities,
      { orgSlug },
    );
    printOutput(result ?? { success: true }, runtime.json);
  });

const stateCommand = program.command('state').description('Issue states');

stateCommand.command('list [slug]').action(async (slug, _options, command) => {
  const { client, runtime } = await getClient(command);
  const orgSlug = requireOrg(runtime, slug);
  const result = await runQuery(
    client,
    api.organizations.queries.listIssueStates,
    {
      orgSlug,
    },
  );
  printOutput(result, runtime.json);
});

stateCommand
  .command('create')
  .requiredOption('--name <name>')
  .requiredOption('--position <n>')
  .requiredOption('--type <type>')
  .requiredOption('--color <hex>')
  .option('--icon <icon>')
  .action(async (options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    if (!ISSUE_STATE_TYPES.includes(options.type)) {
      throw new Error(`type must be one of: ${ISSUE_STATE_TYPES.join(', ')}`);
    }
    const result = await runMutation(
      client,
      api.organizations.mutations.createIssueState,
      {
        orgSlug,
        name: options.name,
        position: requiredNumber(options.position, 'position'),
        type: options.type,
        color: options.color,
        icon: options.icon,
      },
    );
    printOutput(result, runtime.json);
  });

stateCommand
  .command('update <state>')
  .requiredOption('--name <name>')
  .requiredOption('--position <n>')
  .requiredOption('--type <type>')
  .requiredOption('--color <hex>')
  .option('--icon <icon>')
  .option('--clear-icon')
  .action(async (state, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    if (!ISSUE_STATE_TYPES.includes(options.type)) {
      throw new Error(`type must be one of: ${ISSUE_STATE_TYPES.join(', ')}`);
    }
    const stateId = await resolveIssueStateId(client, orgSlug, state);
    const result = await runMutation(
      client,
      api.organizations.mutations.updateIssueState,
      {
        orgSlug,
        stateId,
        name: options.name,
        position: requiredNumber(options.position, 'position'),
        type: options.type,
        color: options.color,
        icon: nullableOption(options.icon, options.clearIcon),
      },
    );
    printOutput(result ?? { success: true }, runtime.json);
  });

stateCommand
  .command('delete <state>')
  .action(async (state, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const stateId = await resolveIssueStateId(client, orgSlug, state);
    const result = await runMutation(
      client,
      api.organizations.mutations.deleteIssueState,
      {
        orgSlug,
        stateId,
      },
    );
    printOutput(result ?? { success: true }, runtime.json);
  });

stateCommand.command('reset [slug]').action(async (slug, _options, command) => {
  const { client, runtime } = await getClient(command);
  const orgSlug = requireOrg(runtime, slug);
  const result = await runMutation(
    client,
    api.organizations.mutations.resetIssueStates,
    { orgSlug },
  );
  printOutput(result ?? { success: true }, runtime.json);
});

const statusCommand = program.command('status').description('Project statuses');

statusCommand.command('list [slug]').action(async (slug, _options, command) => {
  const { client, runtime } = await getClient(command);
  const orgSlug = requireOrg(runtime, slug);
  const result = await runQuery(
    client,
    api.organizations.queries.listProjectStatuses,
    { orgSlug },
  );
  printOutput(result, runtime.json);
});

statusCommand
  .command('create')
  .requiredOption('--name <name>')
  .requiredOption('--position <n>')
  .requiredOption('--type <type>')
  .requiredOption('--color <hex>')
  .option('--icon <icon>')
  .action(async (options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    if (!PROJECT_STATUS_TYPES.includes(options.type)) {
      throw new Error(
        `type must be one of: ${PROJECT_STATUS_TYPES.join(', ')}`,
      );
    }
    const result = await runMutation(
      client,
      api.organizations.mutations.createProjectStatus,
      {
        orgSlug,
        name: options.name,
        position: requiredNumber(options.position, 'position'),
        type: options.type,
        color: options.color,
        icon: options.icon,
      },
    );
    printOutput(result, runtime.json);
  });

statusCommand
  .command('update <status>')
  .requiredOption('--name <name>')
  .requiredOption('--position <n>')
  .requiredOption('--type <type>')
  .requiredOption('--color <hex>')
  .option('--icon <icon>')
  .option('--clear-icon')
  .action(async (status, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    if (!PROJECT_STATUS_TYPES.includes(options.type)) {
      throw new Error(
        `type must be one of: ${PROJECT_STATUS_TYPES.join(', ')}`,
      );
    }
    const statusId = await resolveProjectStatusId(client, orgSlug, status);
    const result = await runMutation(
      client,
      api.organizations.mutations.updateProjectStatus,
      {
        orgSlug,
        statusId,
        name: options.name,
        position: requiredNumber(options.position, 'position'),
        type: options.type,
        color: options.color,
        icon: nullableOption(options.icon, options.clearIcon),
      },
    );
    printOutput(result ?? { success: true }, runtime.json);
  });

statusCommand
  .command('delete <status>')
  .action(async (status, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const statusId = await resolveProjectStatusId(client, orgSlug, status);
    const result = await runMutation(
      client,
      api.organizations.mutations.deleteProjectStatus,
      {
        orgSlug,
        statusId,
      },
    );
    printOutput(result ?? { success: true }, runtime.json);
  });

statusCommand
  .command('reset [slug]')
  .action(async (slug, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime, slug);
    const result = await runMutation(
      client,
      api.organizations.mutations.resetProjectStatuses,
      { orgSlug },
    );
    printOutput(result ?? { success: true }, runtime.json);
  });

// ── User presence / custom status ──────────────────────────────────────────

const presenceCommand = program
  .command('presence')
  .description('User presence and custom status (Discord-like)');

presenceCommand.command('get').action(async (_options, command) => {
  const { client, runtime } = await getClient(command);
  const result = await runQuery(client, api.status.getCurrentUserStatus, {});
  printOutput(result ?? { presence: 'online' }, runtime.json);
});

presenceCommand
  .command('set <presence>')
  .description('Set presence: online, idle, dnd, invisible')
  .action(async (presence, _options, command) => {
    const valid = ['online', 'idle', 'dnd', 'invisible'] as const;
    if (!valid.includes(presence as (typeof valid)[number])) {
      throw new Error(
        `Invalid presence "${presence}". Must be one of: ${valid.join(', ')}`,
      );
    }
    const { client, runtime } = await getClient(command);
    await runMutation(client, api.status.setPresence, {
      presence: presence as 'online' | 'idle' | 'dnd' | 'invisible',
    });
    printOutput({ ok: true, presence }, runtime.json);
  });

presenceCommand
  .command('custom')
  .description('Set a custom status with emoji and text')
  .option('--emoji <emoji>', 'Status emoji')
  .option('--text <text>', 'Status text')
  .option(
    '--clear-after <duration>',
    'Auto-clear: 30m, 1h, 4h, today, or never (default)',
  )
  .action(async (options, command) => {
    const emoji = (options as { emoji?: string }).emoji?.trim();
    const text = (options as { text?: string }).text?.trim();
    const clearAfterRaw = (options as { clearAfter?: string }).clearAfter;

    if (!emoji && !text) {
      throw new Error('At least --emoji or --text is required.');
    }

    let clearsAt: number | undefined;
    if (clearAfterRaw) {
      const durations: Record<string, number | 'today'> = {
        '30m': 30 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '4h': 4 * 60 * 60 * 1000,
        today: 'today',
        never: 0,
      };
      const dur = durations[clearAfterRaw];
      if (dur === undefined) {
        throw new Error(
          `Invalid --clear-after "${clearAfterRaw}". Must be one of: 30m, 1h, 4h, today, never`,
        );
      }
      if (dur === 'today') {
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        clearsAt = end.getTime();
      } else if (dur > 0) {
        clearsAt = Date.now() + dur;
      }
    }

    const { client, runtime } = await getClient(command);
    await runMutation(client, api.status.setCustomStatus, {
      customEmoji: emoji,
      customText: text,
      clearsAt,
    });
    printOutput({ ok: true, emoji, text, clearsAt }, runtime.json);
  });

presenceCommand
  .command('clear')
  .description('Clear custom status')
  .action(async (_options, command) => {
    const { client, runtime } = await getClient(command);
    await runMutation(client, api.status.clearCustomStatus, {});
    printOutput({ ok: true }, runtime.json);
  });

const adminCommand = program.command('admin').description('Platform admin');

adminCommand.command('branding').action(async (_options, command) => {
  const { client, runtime } = await getClient(command);
  const result = await runQuery(
    client,
    api.platformAdmin.queries.getBranding,
    {},
  );
  printOutput(result, runtime.json);
});

adminCommand
  .command('set-branding')
  .option('--name <name>')
  .option('--description <description>')
  .option('--theme-color <hex>')
  .option('--accent-color <hex>')
  .option('--logo <path>')
  .option('--remove-logo')
  .action(async (options, command) => {
    const { client, runtime } = await getClient(command);
    let logoStorageId: Id<'_storage'> | undefined;
    if (options.logo) {
      const uploadUrl = await runMutation(
        client,
        api.platformAdmin.mutations.generateBrandLogoUploadUrl,
        {},
      );
      logoStorageId = await uploadFile(uploadUrl, options.logo);
    }

    const result = await runMutation(
      client,
      api.platformAdmin.mutations.updateBranding,
      {
        name: options.name,
        description: options.description,
        logoStorageId,
        removeLogo: options.removeLogo ? true : undefined,
        themeColor: options.themeColor,
        accentColor: options.accentColor,
      },
    );
    printOutput(
      {
        ...(result ?? { success: true }),
        logoStorageId: logoStorageId ?? null,
      },
      runtime.json,
    );
  });

adminCommand.command('signup-policy').action(async (_options, command) => {
  const { client, runtime } = await getClient(command);
  const result = await runQuery(
    client,
    api.platformAdmin.queries.getSignupPolicy,
    {},
  );
  printOutput(result, runtime.json);
});

adminCommand
  .command('set-signup-policy')
  .option('--blocked <domains>')
  .option('--allowed <domains>')
  .action(async (options, command) => {
    const { client, runtime } = await getClient(command);
    const result = await runMutation(
      client,
      api.platformAdmin.mutations.updateSignupEmailDomainPolicy,
      {
        blockedDomains: parseList(options.blocked),
        allowedDomains: parseList(options.allowed),
      },
    );
    printOutput(result ?? { success: true }, runtime.json);
  });

adminCommand
  .command('sync-disposable-domains')
  .action(async (_options, command) => {
    const { client, runtime } = await getClient(command);
    const result = await runAction(
      client,
      api.platformAdmin.actions.runDisposableDomainSyncNow,
      {},
    );
    printOutput(result, runtime.json);
  });

const teamCommand = program.command('team').description('Teams');

teamCommand
  .command('list [slug]')
  .option('--limit <n>')
  .option('--created-after <date>', 'Filter: created on or after date (ISO)')
  .option('--created-before <date>', 'Filter: created on or before date (ISO)')
  .option('--sort <field>', 'Sort by field (e.g. createdAt, name, key)')
  .option('--order <direction>', 'Sort order: asc or desc (default: asc)')
  .action(async (slug, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime, slug);
    const raw = await runAction(client, cliApi.listTeams, {
      orgSlug,
      limit: CLI_LIST_FETCH_LIMIT,
    });
    const filtered = applyListFilters(raw, options);
    const result = addEntityUrls(filtered, runtime.appUrl, orgSlug, 'teams');
    printOutput(result, runtime.json);
  });

teamCommand
  .command('get <teamKey>')
  .action(async (teamKey, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runAction(client, cliApi.getTeam, {
      orgSlug,
      teamKey,
    });
    printOutput(result, runtime.json);
  });

teamCommand
  .command('create')
  .requiredOption('--key <key>')
  .requiredOption('--name <name>')
  .option('--description <description>')
  .option('--visibility <visibility>')
  .option('--icon <icon>')
  .option('--color <color>')
  .action(async (options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runAction(client, cliApi.createTeam, {
      orgSlug,
      key: options.key,
      name: options.name,
      description: options.description,
      visibility: options.visibility,
      icon: options.icon,
      color: options.color,
    });
    printOutput(result, runtime.json);
  });

teamCommand
  .command('update <teamKey>')
  .option('--name <name>')
  .option('--description <description>')
  .option('--clear-description')
  .option('--visibility <visibility>')
  .option('--icon <icon>')
  .option('--clear-icon')
  .option('--color <color>')
  .option('--clear-color')
  .action(async (teamKey, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runAction(client, cliApi.updateTeam, {
      orgSlug,
      teamKey,
      name: options.name,
      description: nullableOption(
        options.description,
        options.clearDescription,
      ),
      visibility: options.visibility,
      icon: nullableOption(options.icon, options.clearIcon),
      color: nullableOption(options.color, options.clearColor),
    });
    printOutput(result, runtime.json);
  });

teamCommand
  .command('delete <teamKey>')
  .action(async (teamKey, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runAction(client, cliApi.deleteTeam, {
      orgSlug,
      teamKey,
    });
    printOutput(result, runtime.json);
  });

teamCommand
  .command('members <teamKey>')
  .action(async (teamKey, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const team = await runAction(client, cliApi.getTeam, { orgSlug, teamKey });
    const result = await runQuery(client, api.teams.queries.listMembers, {
      teamId: team.id as any,
    });
    printOutput(result, runtime.json);
  });

teamCommand
  .command('add-member <teamKey> <member>')
  .option('--role <role>', 'member or lead', 'member')
  .action(async (teamKey, member, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runAction(client, cliApi.addTeamMember, {
      orgSlug,
      teamKey,
      memberName: member,
      role: options.role,
    });
    printOutput(result, runtime.json);
  });

teamCommand
  .command('remove-member <teamKey> <member>')
  .action(async (teamKey, member, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runAction(client, cliApi.removeTeamMember, {
      orgSlug,
      teamKey,
      memberName: member,
    });
    printOutput(result, runtime.json);
  });

teamCommand
  .command('set-lead <teamKey> <member>')
  .action(async (teamKey, member, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const leadName = member === 'null' ? null : member;
    const result = await runAction(client, cliApi.changeTeamLead, {
      orgSlug,
      teamKey,
      leadName,
    });
    printOutput(result, runtime.json);
  });

const projectCommand = program.command('project').description('Projects');

projectCommand
  .command('list [slug]')
  .option('--team <teamKey>')
  .option('--limit <n>')
  .option('--created-after <date>', 'Filter: created on or after date (ISO)')
  .option('--created-before <date>', 'Filter: created on or before date (ISO)')
  .option('--sort <field>', 'Sort by field (e.g. createdAt, name, key)')
  .option('--order <direction>', 'Sort order: asc or desc (default: asc)')
  .action(async (slug, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime, slug);
    const raw = await runAction(client, cliApi.listProjects, {
      orgSlug,
      teamKey: options.team,
      limit: CLI_LIST_FETCH_LIMIT,
    });
    const filtered = applyListFilters(raw, options);
    const result = addEntityUrls(filtered, runtime.appUrl, orgSlug, 'projects');
    printOutput(result, runtime.json);
  });

projectCommand
  .command('get <projectKey>')
  .action(async (projectKey, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runAction(client, cliApi.getProject, {
      orgSlug,
      projectKey,
    });
    printOutput(result, runtime.json);
  });

projectCommand
  .command('create')
  .requiredOption('--key <key>')
  .requiredOption('--name <name>')
  .option('--description <description>')
  .option('--team <teamKey>')
  .option('--status <statusName>')
  .option('--visibility <visibility>')
  .option('--icon <icon>')
  .option('--color <color>')
  .action(async (options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runAction(client, cliApi.createProject, {
      orgSlug,
      key: options.key,
      name: options.name,
      description: options.description,
      teamKey: options.team,
      statusName: options.status,
      visibility: options.visibility,
      icon: options.icon,
      color: options.color,
    });
    printOutput(result, runtime.json);
  });

projectCommand
  .command('update <projectKey>')
  .option('--name <name>')
  .option('--description <description>')
  .option('--team <teamKey>')
  .option('--clear-team')
  .option('--status <statusName>')
  .option('--clear-status')
  .option('--visibility <visibility>')
  .option('--start-date <date>')
  .option('--clear-start-date')
  .option('--due-date <date>')
  .option('--clear-due-date')
  .option('--icon <icon>')
  .option('--clear-icon')
  .option('--color <color>')
  .option('--clear-color')
  .action(async (projectKey, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runAction(client, cliApi.updateProject, {
      orgSlug,
      projectKey,
      name: options.name,
      description: options.description,
      teamKey: nullableOption(options.team, options.clearTeam),
      statusName: nullableOption(options.status, options.clearStatus),
      visibility: options.visibility,
      startDate: nullableOption(options.startDate, options.clearStartDate),
      dueDate: nullableOption(options.dueDate, options.clearDueDate),
      icon: nullableOption(options.icon, options.clearIcon),
      color: nullableOption(options.color, options.clearColor),
    });
    printOutput(result, runtime.json);
  });

projectCommand
  .command('delete <projectKey>')
  .action(async (projectKey, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runAction(client, cliApi.deleteProject, {
      orgSlug,
      projectKey,
    });
    printOutput(result, runtime.json);
  });

projectCommand
  .command('members <projectKey>')
  .action(async (projectKey, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const project = await runAction(client, cliApi.getProject, {
      orgSlug,
      projectKey,
    });
    const result = await runQuery(client, api.projects.queries.listMembers, {
      projectId: project.id as any,
    });
    printOutput(result, runtime.json);
  });

projectCommand
  .command('add-member <projectKey> <member>')
  .option('--role <role>', 'member or lead', 'member')
  .action(async (projectKey, member, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runAction(client, cliApi.addProjectMember, {
      orgSlug,
      projectKey,
      memberName: member,
      role: options.role,
    });
    printOutput(result, runtime.json);
  });

projectCommand
  .command('remove-member <projectKey> <member>')
  .action(async (projectKey, member, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runAction(client, cliApi.removeProjectMember, {
      orgSlug,
      projectKey,
      memberName: member,
    });
    printOutput(result, runtime.json);
  });

projectCommand
  .command('set-lead <projectKey> <member>')
  .action(async (projectKey, member, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const leadName = member === 'null' ? null : member;
    const result = await runAction(client, cliApi.changeProjectLead, {
      orgSlug,
      projectKey,
      leadName,
    });
    printOutput(result, runtime.json);
  });

const requestCommand = program
  .command('request')
  .description('Request intake, routing, and review');

requestCommand
  .command('list [slug]')
  .option('--scope <scope>', 'inbox, mine, requested, or all', 'inbox')
  .option('--limit <n>', 'Number of requests', '50')
  .action(async (slug, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime, slug);
    const result = await runQuery(client, api.requests.queries.list, {
      orgSlug,
      scope: options.scope,
      paginationOpts: buildPaginationOptions(options.limit),
    });
    printOutput(
      addEntityUrls(result.page, runtime.appUrl, orgSlug, 'requests'),
      runtime.json,
    );
  });

requestCommand
  .command('get <requestKey>')
  .action(async (requestKey, _options, command) => {
    const { client, runtime } = await getClient(command);
    const result = await resolveRequest(
      client,
      requireOrg(runtime),
      requestKey,
    );
    printOutput(result, runtime.json);
  });

requestCommand
  .command('create')
  .requiredOption('--title <title>')
  .requiredOption(
    '--expected-output <output>',
    'What should be true when this request is delivered',
  )
  .option('--description <description>')
  .option('--review-guidance <guidance>')
  .option('--recipients <members>', 'Comma-separated member names or emails')
  .option('--project <projectKey>')
  .option('--due-date <date>')
  .action(async (options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const recipientIds = await Promise.all(
      parseList(options.recipients).map(member =>
        resolveMemberId(client, orgSlug, member),
      ),
    );
    const projectId = options.project
      ? await resolveProjectId(client, orgSlug, options.project)
      : undefined;
    const result = await runMutation(client, api.requests.mutations.create, {
      orgSlug,
      data: {
        title: options.title,
        description: options.description,
        expectedOutput: options.expectedOutput,
        reviewGuidance: options.reviewGuidance,
        recipientIds,
        projectId,
        dueDate: options.dueDate,
      },
    });
    printOutput(result, runtime.json);
  });

requestCommand
  .command('route <requestKey> <members>')
  .description(
    'Route to one or more comma-separated members without starting Work',
  )
  .action(async (requestKey, members, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const request = await resolveRequest(client, orgSlug, requestKey);
    const recipientIds = await Promise.all(
      parseList(members).map(member =>
        resolveMemberId(client, orgSlug, member),
      ),
    );
    const result = await runMutation(client, api.requests.mutations.route, {
      requestId: request._id,
      recipientIds,
    });
    printOutput(result, runtime.json);
  });

requestCommand
  .command('claim <requestKey>')
  .description(
    'Accept responsibility for planning the request; does not Start Work',
  )
  .action(async (requestKey, _options, command) => {
    const { client, runtime } = await getClient(command);
    const request = await resolveRequest(
      client,
      requireOrg(runtime),
      requestKey,
    );
    printOutput(
      await runMutation(client, api.requests.mutations.claim, {
        requestId: request._id,
      }),
      runtime.json,
    );
  });

requestCommand
  .command('link-work <requestKey> <workKey>')
  .option('--relation <relation>', 'fulfills or contributes', 'fulfills')
  .action(async (requestKey, workKey, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const [request, work] = await Promise.all([
      resolveRequest(client, orgSlug, requestKey),
      resolveWork(client, orgSlug, workKey),
    ]);
    printOutput(
      await runMutation(client, api.requests.mutations.linkWork, {
        requestId: request._id,
        workId: work._id,
        relation: options.relation,
      }),
      runtime.json,
    );
  });

requestCommand
  .command('request-changes <requestKey>')
  .requiredOption('--note <note>')
  .action(async (requestKey, options, command) => {
    const { client, runtime } = await getClient(command);
    const request = await resolveRequest(
      client,
      requireOrg(runtime),
      requestKey,
    );
    printOutput(
      await runMutation(client, api.requests.mutations.requestChanges, {
        requestId: request._id,
        note: options.note,
      }),
      runtime.json,
    );
  });

requestCommand
  .command('complete <requestKey>')
  .option('--note <note>')
  .action(async (requestKey, options, command) => {
    const { client, runtime } = await getClient(command);
    const request = await resolveRequest(
      client,
      requireOrg(runtime),
      requestKey,
    );
    printOutput(
      await runMutation(client, api.requests.mutations.complete, {
        requestId: request._id,
        note: options.note,
      }),
      runtime.json,
    );
  });

const workCommand = program
  .command('work')
  .description('Outcome-focused Work and agent context');

workCommand
  .command('list [slug]')
  .option('--scope <scope>', 'active, mine, attention, or all', 'active')
  .option('--limit <n>', 'Number of Work records', '50')
  .action(async (slug, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime, slug);
    const result = await runQuery(client, api.work.queries.list, {
      orgSlug,
      scope: options.scope,
      paginationOpts: buildPaginationOptions(options.limit),
    });
    printOutput(
      addEntityUrls(result.page, runtime.appUrl, orgSlug, 'work'),
      runtime.json,
    );
  });

workCommand
  .command('get <workKey>')
  .action(async (workKey, _options, command) => {
    const { client, runtime } = await getClient(command);
    printOutput(
      await resolveWork(client, requireOrg(runtime), workKey),
      runtime.json,
    );
  });

workCommand
  .command('create')
  .requiredOption('--title <title>')
  .option('--workpad <markdown>')
  .option('--owner <member>')
  .option('--request <requestKeys>', 'Comma-separated Request keys')
  .option('--project <projectKey>')
  .option('--due-date <date>')
  .option('--effort <effort>', 'unknown, xs, s, m, or l', 'unknown')
  .action(async (options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const ownerId = options.owner
      ? await resolveMemberId(client, orgSlug, options.owner)
      : undefined;
    const projectId = options.project
      ? await resolveProjectId(client, orgSlug, options.project)
      : undefined;
    const requests = await Promise.all(
      parseList(options.request).map(key =>
        resolveRequest(client, orgSlug, key),
      ),
    );
    const result = await runMutation(client, api.work.mutations.create, {
      orgSlug,
      data: {
        title: options.title,
        description: options.workpad,
        ownerId,
        projectId,
        dueDate: options.dueDate,
        effort: options.effort,
        requestIds: requests.map(request => request._id),
      },
    });
    printOutput(result, runtime.json);
  });

workCommand
  .command('start <workKey>')
  .description(
    'Explicitly begin Work; assignment or agent attachment never does this',
  )
  .action(async (workKey, _options, command) => {
    const { client, runtime } = await getClient(command);
    const work = await resolveWork(client, requireOrg(runtime), workKey);
    printOutput(
      await runMutation(client, api.work.mutations.start, { workId: work._id }),
      runtime.json,
    );
  });

workCommand
  .command('status <workKey> <status>')
  .description(
    'Set planned, active, waiting, blocked, or canceled; active explicitly starts or resumes your ownership period',
  )
  .action(async (workKey, status, _options, command) => {
    const { client, runtime } = await getClient(command);
    const work = await resolveWork(client, requireOrg(runtime), workKey);
    const result =
      status === 'active'
        ? await runMutation(client, api.work.mutations.start, {
            workId: work._id,
          })
        : await runMutation(client, api.work.mutations.setStatus, {
            workId: work._id,
            status,
          });
    printOutput(result, runtime.json);
  });

workCommand
  .command('context <workKey>')
  .option('--task <number>', 'Limit context to one Task')
  .action(async (workKey, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const work = await resolveWork(client, orgSlug, workKey);
    const task = options.task
      ? await resolveTask(client, work._id, options.task)
      : undefined;
    printOutput(
      await runQuery(client, api.work.queries.getContext, {
        orgSlug,
        workKey,
        taskId: task?._id,
      }),
      runtime.json,
    );
  });

workCommand
  .command('watch <workKey>')
  .description('Watch Work for real-time task, request, and lifecycle changes')
  .option(
    '--events <categories>',
    `Comma-separated: ${WORK_WATCH_CATEGORIES.join(', ')}, or all`,
    'all',
  )
  .option('--initial', 'Emit the current Work snapshot before watching')
  .option('--once', 'Exit after the first matching change')
  .option('--timeout <seconds>', 'Exit after this many seconds')
  .action(async (workKey, options, command) => {
    const { runtime, session } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const categories = parseWorkWatchCategories(options.events);
    const timeoutSeconds = options.timeout
      ? requiredNumber(options.timeout, 'timeout')
      : undefined;
    if (timeoutSeconds !== undefined && timeoutSeconds <= 0) {
      throw new Error('timeout must be greater than zero');
    }

    const realtime = new ConvexClient(runtime.convexUrl);
    realtime.setAuth(async () => {
      const { token } = await fetchConvexToken(session, runtime.appUrl);
      return token;
    });

    let previous: ReturnType<typeof snapshotWork> | undefined;
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    let timer: NodeJS.Timeout | undefined;

    const emit = (event: WorkWatchEvent & { observedAt: string }) => {
      if (runtime.json) {
        console.log(JSON.stringify(event));
      } else {
        console.log(
          `${event.observedAt}  ${event.type.padEnd(19)}  ${event.summary}`,
        );
      }
    };

    const stop = async () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      unsubscribe?.();
      await realtime.close();
    };

    if (!runtime.json) {
      console.error(
        `Watching ${workKey} for ${categories.join(', ')} changes. Press Ctrl+C to stop.`,
      );
    }

    await new Promise<void>((resolve, reject) => {
      const finish = () => void stop().then(resolve, reject);
      const onSignal = () => finish();
      process.once('SIGINT', onSignal);
      process.once('SIGTERM', onSignal);

      if (timeoutSeconds !== undefined) {
        timer = setTimeout(finish, timeoutSeconds * 1000);
      }

      unsubscribe = realtime.onUpdate(
        api.work.queries.getByKey,
        { orgSlug, workKey },
        result => {
          if (!result) {
            reject(
              new Error(`Work not found or no longer visible: ${workKey}`),
            );
            void stop();
            return;
          }
          const next = snapshotWork(result as WorkWatchSource);
          if (!previous) {
            previous = next;
            if (options.initial) {
              emit({
                category: 'work',
                type: 'work.snapshot',
                workKey: next.work.key,
                entityId: next.work._id,
                summary: `Watching Work ${next.work.key}`,
                after: next as unknown as Record<string, unknown>,
                observedAt: new Date().toISOString(),
              });
            }
            return;
          }

          const events = diffWorkSnapshots(previous, next, categories);
          previous = next;
          for (const event of events) {
            emit({ ...event, observedAt: new Date().toISOString() });
          }
          if (options.once && events.length > 0) finish();
        },
        error => {
          reject(error);
          void stop();
        },
      );
    });
  });

workCommand
  .command('ready-for-review <workKey>')
  .action(async (workKey, _options, command) => {
    const { client, runtime } = await getClient(command);
    const work = await resolveWork(client, requireOrg(runtime), workKey);
    printOutput(
      await runMutation(client, api.work.mutations.readyForReview, {
        workId: work._id,
      }),
      runtime.json,
    );
  });

workCommand
  .command('complete <workKey>')
  .action(async (workKey, _options, command) => {
    const { client, runtime } = await getClient(command);
    const work = await resolveWork(client, requireOrg(runtime), workKey);
    printOutput(
      await runMutation(client, api.work.mutations.complete, {
        workId: work._id,
      }),
      runtime.json,
    );
  });

workCommand
  .command('handoff <workKey> <member>')
  .option('--note <note>')
  .requiredOption(
    '--summary <summary>',
    'What has been completed and where the next owner should resume',
  )
  .action(async (workKey, member, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const [work, toOwnerId] = await Promise.all([
      resolveWork(client, orgSlug, workKey),
      resolveMemberId(client, orgSlug, member),
    ]);
    printOutput(
      await runMutation(client, api.work.mutations.proposeHandoff, {
        workId: work._id,
        toOwnerId,
        note: options.note,
        summary: options.summary,
      }),
      runtime.json,
    );
  });

workCommand
  .command('respond-handoff <handoffId>')
  .requiredOption('--accept <true|false>')
  .action(async (handoffId, options, command) => {
    const { client, runtime } = await getClient(command);
    printOutput(
      await runMutation(client, api.work.mutations.respondToHandoff, {
        handoffId,
        accept: parseBoolean(options.accept, 'accept'),
      }),
      runtime.json,
    );
  });

workCommand
  .command('attention <workKey>')
  .requiredOption('--title <title>')
  .option('--details <details>')
  .option('--task <number>')
  .option(
    '--execution <liveActivityId>',
    'Attribute the attention request to a live agent execution',
  )
  .action(async (workKey, options, command) => {
    const { client, runtime } = await getClient(command);
    const work = await resolveWork(client, requireOrg(runtime), workKey);
    const task = options.task
      ? await resolveTask(client, work._id, options.task)
      : undefined;
    printOutput(
      await runMutation(client, api.work.mutations.raiseAttention, {
        workId: work._id,
        taskId: task?._id,
        liveActivityId: options.execution as
          Id<'issueLiveActivities'> | undefined,
        title: options.title,
        details: options.details,
      }),
      runtime.json,
    );
  });

const taskCommand = program
  .command('task')
  .description('Tracked Tasks within Work');

taskCommand
  .command('list <workKey>')
  .action(async (workKey, _options, command) => {
    const { client, runtime } = await getClient(command);
    const work = await resolveWork(client, requireOrg(runtime), workKey);
    printOutput(
      await runQuery(client, api.tasks.queries.listByWork, {
        workId: work._id,
      }),
      runtime.json,
    );
  });

taskCommand
  .command('create <workKey>')
  .requiredOption('--title <title>')
  .option('--description <description>')
  .option('--assignee <member>')
  .option(
    '--execution <liveActivityId>',
    'Create as the attached agent execution, preserving attribution and Work policy',
  )
  .action(async (workKey, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const work = await resolveWork(client, orgSlug, workKey);
    const assigneeId = options.assignee
      ? await resolveMemberId(client, orgSlug, options.assignee)
      : undefined;
    const result = options.execution
      ? await runMutation(client, api.tasks.mutations.createFromExecution, {
          workId: work._id,
          liveActivityId: options.execution as Id<'issueLiveActivities'>,
          title: options.title,
          description: options.description,
          assigneeId,
        })
      : await runMutation(client, api.tasks.mutations.create, {
          workId: work._id,
          title: options.title,
          description: options.description,
          assigneeId,
        });
    printOutput(result, runtime.json);
  });

taskCommand
  .command('status <workKey> <taskNumber> <status>')
  .description('Set todo, in_progress, waiting, blocked, done, or canceled')
  .action(async (workKey, taskNumber, status, _options, command) => {
    const { client, runtime } = await getClient(command);
    const work = await resolveWork(client, requireOrg(runtime), workKey);
    const task = await resolveTask(client, work._id, taskNumber);
    printOutput(
      await runMutation(client, api.tasks.mutations.setStatus, {
        taskId: task._id,
        status,
      }),
      runtime.json,
    );
  });

taskCommand
  .command('assign <workKey> <taskNumber> [member]')
  .description('Assign a member, or omit member to clear the assignee')
  .action(async (workKey, taskNumber, member, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const work = await resolveWork(client, orgSlug, workKey);
    const [task, assigneeId] = await Promise.all([
      resolveTask(client, work._id, taskNumber),
      member
        ? resolveMemberId(client, orgSlug, member)
        : Promise.resolve(undefined),
    ]);
    printOutput(
      await runMutation(client, api.tasks.mutations.assign, {
        taskId: task._id,
        assigneeId,
      }),
      runtime.json,
    );
  });

const issueCommand = program
  .command('issue')
  .description('Legacy Issue compatibility (use request, work, and task)');

issueCommand
  .command('list [slug]')
  .option('--project <projectKey>')
  .option('--team <teamKey>')
  .option('--assignee <name>', 'Filter by assignee name or email')
  .option('--limit <n>')
  .option('--created-after <date>', 'Filter: created on or after date (ISO)')
  .option('--created-before <date>', 'Filter: created on or before date (ISO)')
  .option('--sort <field>', 'Sort by field (e.g. createdAt, title, key)')
  .option('--order <direction>', 'Sort order: asc or desc (default: asc)')
  .action(async (slug, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime, slug);
    const raw = await runAction(client, cliApi.listIssues, {
      orgSlug,
      projectKey: options.project,
      teamKey: options.team,
      assigneeName: options.assignee,
      limit: CLI_LIST_FETCH_LIMIT,
    });
    const filtered = applyListFilters(raw, options);
    const result = addEntityUrls(filtered, runtime.appUrl, orgSlug, 'issues');
    printOutput(result, runtime.json);
  });

issueCommand
  .command('get <issueKey>')
  .action(async (issueKey, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runAction(client, cliApi.getIssue, {
      orgSlug,
      issueKey,
    });
    printOutput(result, runtime.json);
  });

issueCommand
  .command('create')
  .requiredOption('--title <title>')
  .option('--description <description>')
  .option('--project <projectKey>')
  .option('--team <teamKey>')
  .option('--priority <priorityName>')
  .option('--visibility <visibility>')
  .option('--assignee <member>')
  .option('--state <stateName>')
  .option('--start-date <date>')
  .option('--due-date <date>')
  .option('--parent <issueKey>')
  .action(async (options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runAction(client, cliApi.createIssue, {
      orgSlug,
      title: options.title,
      description: options.description,
      projectKey: options.project,
      teamKey: options.team,
      priorityName: options.priority,
      visibility: options.visibility,
      assigneeName: options.assignee,
      stateName: options.state,
      startDate: options.startDate,
      dueDate: options.dueDate,
      parentIssueKey: options.parent,
    });
    printOutput(result, runtime.json);
  });

issueCommand
  .command('update <issueKey>')
  .option('--title <title>')
  .option('--description <description>')
  .option('--priority <priorityName>')
  .option('--clear-priority')
  .option('--team <teamKey>')
  .option('--clear-team')
  .option('--project <projectKey>')
  .option('--clear-project')
  .option('--visibility <visibility>')
  .option('--assignee <member>')
  .option('--clear-assignee')
  .option('--state <stateName>')
  .option('--start-date <date>')
  .option('--clear-start-date')
  .option('--due-date <date>')
  .option('--clear-due-date')
  .option('--parent <issueKey>')
  .option('--clear-parent')
  .action(async (issueKey, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runAction(client, cliApi.updateIssue, {
      orgSlug,
      issueKey,
      title: options.title,
      description: options.description,
      priorityName: nullableOption(options.priority, options.clearPriority),
      teamKey: nullableOption(options.team, options.clearTeam),
      projectKey: nullableOption(options.project, options.clearProject),
      visibility: options.visibility,
      assigneeName: nullableOption(options.assignee, options.clearAssignee),
      stateName: options.state,
      startDate: nullableOption(options.startDate, options.clearStartDate),
      dueDate: nullableOption(options.dueDate, options.clearDueDate),
      parentIssueKey: nullableOption(options.parent, options.clearParent),
    });
    printOutput(result, runtime.json);
  });

issueCommand
  .command('delete <issueKey>')
  .action(async (issueKey, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runAction(client, cliApi.deleteIssue, {
      orgSlug,
      issueKey,
    });
    printOutput(result, runtime.json);
  });

issueCommand
  .command('assign <issueKey> <member>')
  .option('--state <stateName>')
  .action(async (issueKey, member, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runAction(client, cliApi.assignIssue, {
      orgSlug,
      issueKey,
      assigneeName: member,
      stateName: options.state,
    });
    printOutput(result, runtime.json);
  });

issueCommand
  .command('unassign <issueKey> <member>')
  .action(async (issueKey, member, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runAction(client, cliApi.unassignIssue, {
      orgSlug,
      issueKey,
      assigneeName: member,
    });
    printOutput(result, runtime.json);
  });

issueCommand
  .command('assignments <issueKey>')
  .action(async (issueKey, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const issueId = await resolveIssueId(client, orgSlug, issueKey);
    const result = await runQuery(client, api.issues.queries.getAssignments, {
      issueId,
    });
    printOutput(result, runtime.json);
  });

issueCommand
  .command('set-assignment-state <assignmentId> <state>')
  .action(async (assignmentId, state, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const stateId = await resolveIssueStateId(client, orgSlug, state);
    const result = await runMutation(
      client,
      api.issues.mutations.changeAssignmentState,
      {
        assignmentId,
        stateId,
      },
    );
    printOutput(result ?? { success: true }, runtime.json);
  });

issueCommand
  .command('reassign-assignment <assignmentId> <member>')
  .action(async (assignmentId, member, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const assigneeId = await resolveMemberId(client, orgSlug, member);
    const result = await runMutation(
      client,
      api.issues.mutations.updateAssignmentAssignee,
      {
        assignmentId,
        assigneeId,
      },
    );
    printOutput(result ?? { success: true }, runtime.json);
  });

issueCommand
  .command('remove-assignment <assignmentId>')
  .action(async (assignmentId, _options, command) => {
    const { client, runtime } = await getClient(command);
    const result = await runMutation(
      client,
      api.issues.mutations.deleteAssignment,
      {
        assignmentId,
      },
    );
    printOutput(result ?? { success: true }, runtime.json);
  });

issueCommand
  .command('set-priority <issueKey> <priority>')
  .action(async (issueKey, priority, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const [issueId, priorityId] = await Promise.all([
      resolveIssueId(client, orgSlug, issueKey),
      resolveIssuePriorityId(client, orgSlug, priority),
    ]);
    const result = await runMutation(
      client,
      api.issues.mutations.changePriority,
      {
        issueId,
        priorityId,
      },
    );
    printOutput(result ?? { success: true }, runtime.json);
  });

issueCommand
  .command('replace-assignees <issueKey> <members>')
  .action(async (issueKey, members, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const issueId = await resolveIssueId(client, orgSlug, issueKey);
    const assigneeIds = await Promise.all(
      parseList(members).map(member =>
        resolveMemberId(client, orgSlug, member),
      ),
    );
    const result = await runMutation(
      client,
      api.issues.mutations.updateAssignees,
      {
        issueId,
        assigneeIds,
      },
    );
    printOutput(result ?? { success: true }, runtime.json);
  });

issueCommand
  .command('set-estimates <issueKey>')
  .requiredOption('--values <state=hours,...>')
  .action(async (issueKey, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const issueId = await resolveIssueId(client, orgSlug, issueKey);
    const estimatedTimes = await parseEstimatedTimes(
      client,
      orgSlug,
      options.values,
    );
    const result = await runMutation(
      client,
      api.issues.mutations.updateEstimatedTimes,
      {
        issueId,
        estimatedTimes,
      },
    );
    printOutput(result ?? { success: true }, runtime.json);
  });

issueCommand
  .command('comment <issueKey>')
  .requiredOption('--body <body>')
  .action(async (issueKey, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const issue = await runAction(client, cliApi.getIssue, {
      orgSlug,
      issueKey,
    });
    const result = await runMutation(client, api.issues.mutations.addComment, {
      issueId: issue.id as any,
      body: options.body,
    });
    printOutput(result, runtime.json);
  });

issueCommand
  .command('link-github <issueKey> <url>')
  .description('Link a GitHub pull request, issue, or commit URL to an issue')
  .action(async (issueKey, url, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    await runAction(client, api.github.actions.linkArtifactByUrl, {
      orgSlug,
      issueKey,
      url,
    });
    printOutput({ success: true, issueKey, url }, runtime.json);
  });

const documentCommand = program.command('document').description('Documents');

documentCommand
  .command('list [slug]')
  .option('--folder-id <id>')
  .option('--limit <n>')
  .option('--created-after <date>', 'Filter: created on or after date (ISO)')
  .option('--created-before <date>', 'Filter: created on or before date (ISO)')
  .option(
    '--updated-after <date>',
    'Filter: last edited on or after date (ISO)',
  )
  .option(
    '--updated-before <date>',
    'Filter: last edited on or before date (ISO)',
  )
  .option(
    '--sort <field>',
    'Sort by field (e.g. createdAt, title, lastEditedAt)',
  )
  .option('--order <direction>', 'Sort order: asc or desc (default: asc)')
  .action(async (slug, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime, slug);
    const raw = await runAction(client, cliApi.listDocuments, {
      orgSlug,
      folderId: options.folderId,
      limit: CLI_LIST_FETCH_LIMIT,
    });
    const filtered = applyListFilters(raw, options);
    const result = addEntityUrls(
      filtered,
      runtime.appUrl,
      orgSlug,
      'documents',
    );
    printOutput(result, runtime.json);
  });

documentCommand
  .command('get <documentId>')
  .action(async (documentId, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runAction(client, cliApi.getDocument, {
      orgSlug,
      documentId,
    });
    printOutput(result, runtime.json);
  });

documentCommand
  .command('create')
  .requiredOption('--title <title>')
  .option('--content <content>')
  .option('--team <teamKey>')
  .option('--project <projectKey>')
  .option('--folder-id <id>')
  .option('--visibility <visibility>')
  .option('--icon <icon>')
  .option('--color <color>')
  .action(async (options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runAction(client, cliApi.createDocument, {
      orgSlug,
      title: options.title,
      content: options.content,
      teamKey: options.team,
      projectKey: options.project,
      folderId: options.folderId,
      visibility: options.visibility,
      icon: options.icon,
      color: options.color,
    });
    printOutput(result, runtime.json);
  });

documentCommand
  .command('update <documentId>')
  .option('--title <title>')
  .option('--content <content>')
  .option('--team <teamKey>')
  .option('--clear-team')
  .option('--project <projectKey>')
  .option('--clear-project')
  .option('--folder-id <id>')
  .option('--clear-folder')
  .option('--visibility <visibility>')
  .option('--icon <icon>')
  .option('--clear-icon')
  .option('--color <color>')
  .option('--clear-color')
  .action(async (documentId, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runAction(client, cliApi.updateDocument, {
      orgSlug,
      documentId,
      title: options.title,
      content: options.content,
      teamKey: nullableOption(options.team, options.clearTeam),
      projectKey: nullableOption(options.project, options.clearProject),
      folderId: nullableOption(options.folderId, options.clearFolder),
      visibility: options.visibility,
      icon: nullableOption(options.icon, options.clearIcon),
      color: nullableOption(options.color, options.clearColor),
    });
    printOutput(result, runtime.json);
  });

documentCommand
  .command('move <documentId>')
  .option('--folder-id <id>')
  .option('--clear-folder')
  .action(async (documentId, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const folderId = options.clearFolder
      ? null
      : requiredString(options.folderId, 'folder-id');
    const result = await runAction(client, cliApi.moveDocumentToFolder, {
      orgSlug,
      documentId,
      folderId,
    });
    printOutput(result, runtime.json);
  });

documentCommand
  .command('delete <documentId>')
  .action(async (documentId, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runAction(client, cliApi.deleteDocument, {
      orgSlug,
      documentId,
    });
    printOutput(result, runtime.json);
  });

const folderCommand = program.command('folder').description('Document folders');

folderCommand
  .command('list [slug]')
  .option('--limit <n>')
  .option('--created-after <date>', 'Filter: created on or after date (ISO)')
  .option('--created-before <date>', 'Filter: created on or before date (ISO)')
  .option('--sort <field>', 'Sort by field (e.g. createdAt, name)')
  .option('--order <direction>', 'Sort order: asc or desc (default: asc)')
  .action(async (slug, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime, slug);
    const raw = await runAction(client, cliApi.listFolders, { orgSlug });
    const filtered = applyListFilters(raw, options);
    const result = addEntityUrls(filtered, runtime.appUrl, orgSlug, 'folders');
    printOutput(result, runtime.json);
  });

folderCommand
  .command('create')
  .requiredOption('--name <name>')
  .option('--description <description>')
  .option('--icon <icon>')
  .option('--color <color>')
  .action(async (options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runAction(client, cliApi.createFolder, {
      orgSlug,
      name: options.name,
      description: options.description,
      icon: options.icon,
      color: options.color,
    });
    printOutput(result, runtime.json);
  });

folderCommand
  .command('update <folderId>')
  .option('--name <name>')
  .option('--description <description>')
  .option('--clear-description')
  .option('--icon <icon>')
  .option('--clear-icon')
  .option('--color <color>')
  .option('--clear-color')
  .action(async (folderId, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runAction(client, cliApi.updateFolder, {
      orgSlug,
      folderId,
      name: options.name,
      description: nullableOption(
        options.description,
        options.clearDescription,
      ),
      icon: nullableOption(options.icon, options.clearIcon),
      color: nullableOption(options.color, options.clearColor),
    });
    printOutput(result, runtime.json);
  });

folderCommand
  .command('delete <folderId>')
  .action(async (folderId, _options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runAction(client, cliApi.deleteFolder, {
      orgSlug,
      folderId,
    });
    printOutput(result, runtime.json);
  });

// ═══════════════════════════════════════════════════════════════════════════════
// Agent Bridge Service
// ═══════════════════════════════════════════════════════════════════════════════

import {
  BridgeService,
  getBridgeStatus,
  installLaunchAgent,
  isLaunchAgentInstalled,
  launchMenuBar,
  loadBridgeConfig,
  loadLaunchAgent,
  saveBridgeConfig,
  setupBridgeDevice,
  stopBridge,
  stopMenuBar,
  uninstallLaunchAgent,
  unloadLaunchAgent,
} from './bridge-service';
import { platform as osPlatform } from 'os';

const VECTOR_HOME =
  process.env.VECTOR_HOME?.trim() || `${process.env.HOME ?? '~'}/.vector`;

const serviceCommand = program
  .command('service')
  .description('Manage the local bridge service');

async function selectExplicitBridgeProfile(command: Command): Promise<void> {
  const options = command.optsWithGlobals() as GlobalOptions;
  const profile = options.profile?.trim();
  if (profile) {
    // The bridge is a single per-user daemon. Persist an explicitly selected
    // profile so its future LaunchAgent invocations use the same account.
    await writeDefaultProfile(profile);
  }
}

function startLaunchAgent(vcliPath: string): void {
  installLaunchAgent(vcliPath);
  if (!loadLaunchAgent()) {
    throw new Error(
      `Could not start the bridge LaunchAgent. Check ${VECTOR_HOME}/bridge.err.log`,
    );
  }
}

serviceCommand
  .command('start')
  .description('Start the bridge service via LaunchAgent (macOS) or foreground')
  .action(async (_options, command) => {
    await selectExplicitBridgeProfile(command);
    const existing = getBridgeStatus();
    const { spinner } = await import('@clack/prompts');
    const s = spinner();

    // An explicit start is also the repair/reconciliation path. Do not silently
    // reuse a device registered for a different account or deployment.
    s.start('Ensuring device registration...');
    const config = await ensureBridgeConfig(command);
    s.stop(`Device ready: ${config.displayName}`);

    if (osPlatform() === 'darwin') {
      s.start(
        existing.running
          ? 'Repairing bridge service...'
          : 'Starting bridge service...',
      );
      const vcliPath = process.argv[1] ?? 'vcli';
      startLaunchAgent(vcliPath);
      s.stop(
        existing.running
          ? 'Bridge service repaired and restarted.'
          : 'Bridge service started.',
      );
    } else {
      // Linux / other: run in foreground
      console.log(
        'Starting bridge in foreground (use systemd for background)...',
      );
      const bridge = new BridgeService(config);
      await bridge.run();
    }
  });

serviceCommand
  .command('run')
  .description('Run the bridge service in the foreground (used by LaunchAgent)')
  .action(async () => {
    // Registration is reconciled by `service start`/`install`. The daemon must
    // still launch while offline so its retry loops can recover connectivity.
    const config = loadBridgeConfig();
    if (!config) {
      throw new Error('Bridge not configured. Run: vcli service start');
    }

    if (osPlatform() === 'darwin') {
      await launchMenuBar();
    }

    const bridge = new BridgeService(config);
    await bridge.run();
  });

serviceCommand
  .command('stop')
  .description('Stop the bridge service')
  .action(() => {
    let unloaded = false;
    if (osPlatform() === 'darwin') {
      unloaded = unloadLaunchAgent();
    }
    if (stopBridge() || unloaded) {
      console.log('Bridge stopped.');
    } else if (osPlatform() !== 'darwin') {
      console.log('Bridge is not running.');
    } else {
      console.log('Bridge is not running.');
    }
  });

serviceCommand
  .command('status')
  .description('Show bridge service status')
  .action(() => {
    const status = getBridgeStatus();
    if (!status.configured) {
      console.log('Bridge not configured. Run: vcli service start');
      return;
    }
    console.log('Vector Bridge');
    console.log(
      `  Device:  ${status.config!.displayName} (${status.config!.deviceId})`,
    );
    console.log(`  User:    ${status.config!.userId}`);
    const statusLabel = status.running
      ? status.health?.state === 'degraded'
        ? `Degraded (PID ${status.pid}): ${status.health.lastError ?? 'heartbeat is stale'}`
        : `Running (PID ${status.pid})`
      : status.starting
        ? 'Starting...'
        : status.health?.lastError
          ? `Not running: ${status.health.lastError}`
          : 'Not running';
    console.log(`  Status:  ${statusLabel}`);
    console.log(`  Config:  ${VECTOR_HOME}/bridge.json`);
  });

serviceCommand
  .command('menu-state')
  .description('Return JSON state for the macOS tray')
  .action(async (_options, command) => {
    const status = getBridgeStatus();
    const globalOptions = command.optsWithGlobals() as GlobalOptions;
    const profile = globalOptions.profile ?? (await readDefaultProfile());
    const session = await readSession(profile);
    const profiles: ProfileSummary[] = await listProfiles();
    const defaultProfile = await readDefaultProfile();
    let workspaces: unknown[] = [];
    let workSessions: unknown[] = [];
    let detectedSessions: unknown[] = [];
    let stateError: string | undefined;

    try {
      const runtime = await getRuntime(command);
      if (runtime.session && status.config?.deviceId) {
        const client = await createConvexClient(
          runtime.session,
          runtime.appUrl,
          runtime.convexUrl,
        );
        workspaces = projectMenuRecords(
          await runQuery(client, api.agentBridge.queries.listDeviceWorkspaces, {
            deviceId: status.config.deviceId as Id<'agentDevices'>,
          }),
          [
            '_id',
            'label',
            'path',
            'repoName',
            'defaultBranch',
            'isDefault',
            'launchPolicy',
          ],
        );
        workSessions = projectMenuRecords(
          await runQuery(
            client,
            api.agentBridge.queries.listDeviceWorkSessions,
            {
              deviceId: status.config.deviceId as Id<'agentDevices'>,
            },
          ),
          [
            '_id',
            'issueKey',
            'issueTitle',
            'title',
            'status',
            'latestSummary',
            'workspacePath',
            'cwd',
            'repoRoot',
            'branch',
            'tmuxPaneId',
            'agentProvider',
          ],
        );
        const devices = await runQuery(
          client,
          api.agentBridge.queries.listProcessesForAttach,
          {},
        );
        const currentDevice = devices.find(
          (entry: { device: { _id: string } }) =>
            entry.device._id === status.config?.deviceId,
        );
        detectedSessions = projectMenuRecords(currentDevice?.processes, [
          '_id',
          'provider',
          'providerLabel',
          'cwd',
          'repoRoot',
          'branch',
          'title',
          'mode',
          'status',
        ]);
      }
    } catch (error) {
      workspaces = [];
      workSessions = [];
      detectedSessions = [];
      stateError = error instanceof Error ? error.message : String(error);
    }

    printOutput(
      {
        configured: status.configured,
        running: status.running,
        starting: status.starting,
        pid: status.pid,
        config: status.config
          ? {
              deviceId: status.config.deviceId,
              displayName: status.config.displayName,
              userId: status.config.userId,
            }
          : undefined,
        health: status.health,
        stateError,
        sessionInfo: buildMenuSessionInfo(session),
        activeProfile: profile,
        defaultProfile,
        profiles,
        workspaces,
        workSessions,
        detectedSessions,
      },
      Boolean(globalOptions.json),
    );
  });

serviceCommand
  .command('set-default-workspace')
  .description('Set the default workspace for this device')
  .requiredOption('--workspace-id <id>')
  .action(async (options, command) => {
    const { client, runtime } = await getClient(command);
    const workspaceId = await runMutation(
      client,
      api.agentBridge.mutations.setDefaultWorkspace,
      {
        workspaceId: options.workspaceId as Id<'deviceWorkspaces'>,
      },
    );
    printOutput({ ok: true, workspaceId }, runtime.json);
  });

serviceCommand
  .command('search-issues <query>')
  .description('Search issues for tray attach actions')
  .option('--limit <n>')
  .action(async (query, options, command) => {
    const { client, runtime } = await getClient(command);
    const orgSlug = requireOrg(runtime);
    const result = await runQuery(client, api.search.queries.searchEntities, {
      orgSlug,
      query,
      limit: optionalNumber(options.limit, 'limit') ?? 8,
    });
    printOutput(result.issues ?? [], runtime.json);
  });

serviceCommand
  .command('attach-process')
  .description('Attach a detected local process to an issue')
  .requiredOption('--issue-id <id>')
  .requiredOption('--device-id <id>')
  .requiredOption('--process-id <id>')
  .requiredOption('--provider <provider>')
  .option('--title <title>')
  .action(async (options, command) => {
    const { client, runtime } = await getClient(command);
    const liveActivityId = await runMutation(
      client,
      api.agentBridge.mutations.attachLiveActivity,
      {
        issueId: options.issueId as Id<'issues'>,
        deviceId: options.deviceId as Id<'agentDevices'>,
        processId: options.processId as Id<'agentProcesses'>,
        provider: parseAgentProvider(options.provider),
        title: options.title?.trim() || undefined,
      },
    );
    printOutput({ ok: true, liveActivityId }, runtime.json);
  });

serviceCommand
  .command('install')
  .description('Install the bridge as a system service (macOS LaunchAgent)')
  .action(async (_options, command) => {
    if (osPlatform() !== 'darwin') {
      console.error('Service install is currently macOS only (LaunchAgent).');
      console.error('On Linux, use systemd --user manually for now.');
      return;
    }

    await selectExplicitBridgeProfile(command);
    const { spinner } = await import('@clack/prompts');
    const s = spinner();

    s.start('Ensuring device registration...');
    const config = await ensureBridgeConfig(command);
    s.stop(`Device ready: ${config.displayName}`);

    s.start('Installing LaunchAgent...');
    const vcliPath = process.argv[1] ?? 'vcli';
    installLaunchAgent(vcliPath);
    s.stop('LaunchAgent installed');

    s.start('Starting bridge service...');
    if (!loadLaunchAgent()) {
      throw new Error(
        `Could not start the bridge LaunchAgent. Check ${VECTOR_HOME}/bridge.err.log`,
      );
    }
    s.stop('Bridge service started');

    console.log('');
    console.log(
      'Bridge installed and running. Will start automatically on login.',
    );
  });

serviceCommand
  .command('uninstall')
  .description('Stop the bridge and uninstall the system service')
  .action(() => {
    stopBridge({ includeMenuBar: true });
    uninstallLaunchAgent();
    stopMenuBar();
    console.log('Bridge stopped and service uninstalled.');
  });

serviceCommand
  .command('logs')
  .description('Show bridge service logs')
  .action(async () => {
    const fs = await import('fs');
    const p = await import('path');
    const logPath = p.join(VECTOR_HOME, 'bridge.log');
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf-8');
      const lines = content.split('\n');
      console.log(lines.slice(-50).join('\n'));
    } else {
      console.log(`No log file found at ${logPath}`);
    }
  });

serviceCommand
  .command('enable')
  .description('Enable bridge to start at login (macOS LaunchAgent)')
  .action(async (_options, command) => {
    if (osPlatform() !== 'darwin') {
      console.error('Login item is macOS only.');
      return;
    }
    await selectExplicitBridgeProfile(command);
    if (!loadBridgeConfig()) {
      throw new Error('Bridge not configured. Run: vcli service start');
    }
    const vcliPath = process.argv[1] ?? 'vcli';
    startLaunchAgent(vcliPath);
    console.log('Bridge will start automatically on login.');
  });

serviceCommand
  .command('disable')
  .description('Disable bridge from starting at login')
  .action(() => {
    uninstallLaunchAgent();
    stopMenuBar();
    console.log('Bridge will no longer start at login.');
  });

// `vcli bridge` — top-level shortcut commands
const bridgeCommand = program
  .command('bridge')
  .description('Start/stop the local agent bridge');

bridgeCommand
  .command('start')
  .description('Register device, install service, and start the bridge')
  .action(async (_options, command) => {
    await selectExplicitBridgeProfile(command);
    const existingConfig = loadBridgeConfig();
    const config = await ensureBridgeConfig(command);
    if (
      !existingConfig ||
      existingConfig.deviceId !== config.deviceId ||
      existingConfig.userId !== config.userId
    ) {
      console.log(
        `Device registered: ${config.displayName} (${config.deviceId})`,
      );
    }

    if (osPlatform() === 'darwin') {
      const vcliPath = process.argv[1] ?? 'vcli';
      startLaunchAgent(vcliPath);
      console.log('\nBridge installed and started as LaunchAgent.');
      console.log('It will restart automatically on login.');
      console.log('Run `vcli service status` to check.');
    } else {
      console.log('Starting bridge in foreground...');
      const bridge = new BridgeService(config);
      await bridge.run();
    }
  });

bridgeCommand
  .command('stop')
  .description('Stop the bridge service')
  .action(() => {
    let unloaded = false;
    if (osPlatform() === 'darwin') {
      uninstallLaunchAgent();
      unloaded = true;
    }
    if (stopBridge() || unloaded) {
      console.log('Bridge stopped.');
    } else {
      console.log('Bridge is not running.');
    }
  });

bridgeCommand
  .command('status')
  .description('Show bridge status')
  .action(() => {
    const s = getBridgeStatus();
    if (!s.configured) {
      console.log('Bridge not configured. Run: vcli bridge start');
      return;
    }
    console.log('Vector Bridge');
    console.log(`  Device:  ${s.config!.displayName} (${s.config!.deviceId})`);
    console.log(
      `  Status:  ${
        s.running
          ? s.health?.state === 'degraded'
            ? `Degraded (PID ${s.pid})`
            : `Running (PID ${s.pid})`
          : s.health?.lastError
            ? `Not running: ${s.health.lastError}`
            : 'Not running'
      }`,
    );
  });

// ═══════════════════════════════════════════════════════════════════════════════
// CLI Update
// ═══════════════════════════════════════════════════════════════════════════════

function detectInstallMethod(version: string): {
  method: 'volta' | 'npm' | 'pnpm' | 'yarn' | 'unknown';
  command: string[];
} {
  const execPath = process.argv[1] ?? '';
  const pkg = `@rehpic/vcli@${version}`;

  if (execPath.includes('.volta')) {
    return {
      method: 'volta',
      command: ['volta', 'install', pkg],
    };
  }

  if (execPath.includes('pnpm')) {
    return {
      method: 'pnpm',
      command: ['pnpm', 'add', '-g', pkg],
    };
  }

  if (execPath.includes('yarn')) {
    return {
      method: 'yarn',
      command: ['yarn', 'global', 'add', pkg],
    };
  }

  return {
    method: 'npm',
    command: ['npm', 'install', '-g', pkg],
  };
}

async function checkForUpdate(): Promise<{
  current: string;
  latest: string;
  hasUpdate: boolean;
} | null> {
  try {
    const { execFileSync: exec } = await import('child_process');
    const latestRaw = exec(
      'npm',
      ['view', '@rehpic/vcli@latest', 'version', '--json'],
      {
        encoding: 'utf-8',
        timeout: 10000,
      },
    ).trim();
    const latest = JSON.parse(latestRaw) as string;
    const current = readPackageVersionSync();
    return {
      current,
      latest,
      hasUpdate: Boolean(latest) && isNewerVersion(latest, current),
    };
  } catch {
    return null;
  }
}

program
  .command('update')
  .description('Update the CLI to the latest version')
  .action(async () => {
    const { spinner, log } = await import('@clack/prompts');
    const s = spinner();

    // 1. Check for updates
    s.start('Checking for updates...');
    const updateInfo = await checkForUpdate();
    if (!updateInfo) {
      s.stop('Could not check for updates.');
      return;
    }
    if (!updateInfo.hasUpdate) {
      s.stop(`Already on the latest version (${updateInfo.current}).`);
      return;
    }
    s.stop(`Update available: ${updateInfo.current} → ${updateInfo.latest}`);

    const install = detectInstallMethod(updateInfo.latest);
    log.info(`Install method: ${install.method}`);

    // Install first. A failed package-manager command must not take a working
    // bridge and tray offline.
    const previousStatus = getBridgeStatus();
    s.start(`Updating via ${install.method}...`);
    try {
      const { execFileSync: exec } = await import('child_process');
      exec(install.command[0], install.command.slice(1), {
        stdio: 'inherit',
        timeout: 120000,
      });
      s.stop('CLI updated successfully.');
    } catch {
      s.stop('Update failed.');
      log.error(`Run manually: ${install.command.join(' ')}`);
      return;
    }

    // Regenerate the LaunchAgent with the new Node/package paths. Configured
    // but previously broken services are repaired as part of the update.
    const shouldRestartBridge =
      previousStatus.running ||
      previousStatus.starting ||
      isLaunchAgentInstalled();
    if (shouldRestartBridge) {
      if (osPlatform() === 'darwin') {
        s.start('Restarting bridge service...');
        try {
          // Keep the current tray alive until the newly installed service starts;
          // the new bridge replaces it only after a successful launch.
          unloadLaunchAgent();
          stopBridge();
          const { execFileSync: exec } = await import('child_process');
          // `enable` repairs and starts the LaunchAgent from the existing device
          // config without making a package update depend on network access.
          exec('vcli', ['service', 'enable'], {
            stdio: 'inherit',
            timeout: 30000,
          });
          s.stop('Bridge restarted.');
        } catch {
          s.stop('Could not auto-restart. Run: vcli service start');
        }
      } else {
        log.info('Restart the bridge service to use the new CLI version.');
      }
    }

    log.success(`Updated to v${updateInfo.latest}`);
  });

async function main() {
  await program.parseAsync(process.argv);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
