import { createTool, type ToolCtx } from '@convex-dev/agent';
import type { Tool } from 'ai';
import { z } from 'zod';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import type { ActivityEventType } from '../_shared/activity';
import { searchAvailableIcons } from './icons';
import type { AssistantPageContext } from './lib';

type AssistantToolCtx = ToolCtx & {
  organizationId: Id<'organizations'>;
  userId: Id<'users'>;
  assistantThreadId: Id<'assistantThreads'>;
  currentPageContext: AssistantPageContext;
};

type StartIssueDeviceWorkSessionInput = {
  issueKey?: string;
  deviceId?: string;
  workspaceId?: string;
  provider?: 'codex' | 'claude_code' | 'vector_cli';
};

type AttachIssueToObservedDeviceSessionInput = {
  issueKey?: string;
  deviceId?: string;
  processId?: string;
};

export const listWorkspaceReferenceData: any = createTool({
  description:
    'List available teams, projects, members, issue priorities, issue states, and project statuses for the current organization. Call this before creating or updating entities to look up valid identifiers.',
  args: z.object({}),
  handler: async (ctx: AssistantToolCtx) => {
    return await ctx.runQuery(internal.ai.internal.listWorkspaceReferenceData, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
    });
  },
});

export const searchIcons: any = createTool({
  description:
    'Search available icons by keyword. Use this to find valid icon values before setting an icon on a team, project, document, or folder. Returns matching icon values, labels, and categories.',
  args: z.object({
    query: z
      .string()
      .describe(
        'Search keyword (e.g. "rocket", "fire", "target", "git", "star")',
      ),
    limit: z.number().int().positive().max(20).optional(),
  }),
  handler: async (
    _ctx: AssistantToolCtx,
    args: { query: string; limit?: number },
  ) => {
    const results = searchAvailableIcons(args.query, args.limit ?? 10);
    return {
      icons: results,
      hint: 'Use the "value" field when setting an icon on an entity.',
    };
  },
});

export const listDocuments: any = createTool({
  description:
    'List documents. If folderId is omitted, defaults to the current document folder when the user is on a folder page, otherwise lists recent visible documents.',
  args: z.object({
    folderId: z.string().optional(),
    limit: z.number().int().positive().max(50).optional(),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runQuery(internal.ai.internal.listDocuments, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      folderId: args.folderId,
      limit: args.limit,
    });
  },
});

export const getDocument: any = createTool({
  description:
    'Get one document by id. If documentId is omitted, defaults to the current document page.',
  args: z.object({
    documentId: z.string().optional(),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runQuery(internal.ai.internal.getDocument, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      documentId: args.documentId,
    });
  },
});

export const createDocument: any = createTool({
  description:
    'Create a document. On a document folder page it defaults to that folder; on a project or team detail page it defaults to that scope.',
  args: z.object({
    title: z.string().min(1),
    content: z.string().optional(),
    visibility: z.enum(['private', 'organization', 'public']).optional(),
    teamKey: z.string().optional(),
    projectKey: z.string().optional(),
    folderId: z.string().optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(internal.ai.internal.createDocument, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      ...args,
    });
  },
});

export const updateDocument: any = createTool({
  description:
    'Update a document. If documentId is omitted, defaults to the current document page.',
  args: z.object({
    documentId: z.string().optional(),
    title: z.string().optional(),
    content: z.string().optional(),
    visibility: z.enum(['private', 'organization', 'public']).optional(),
    teamKey: z.string().nullable().optional(),
    projectKey: z.string().nullable().optional(),
    folderId: z.string().nullable().optional(),
    icon: z.string().nullable().optional(),
    color: z.string().nullable().optional(),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(internal.ai.internal.updateDocument, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      ...args,
    });
  },
});

export const requestDeleteDocument: any = createTool({
  description:
    'Prepare deletion of a document. This does not delete immediately; it creates a pending confirmation in the UI.',
  args: z.object({
    documentId: z.string().optional(),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(internal.ai.internal.setPendingDeleteAction, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      assistantThreadId: ctx.assistantThreadId,
      pageContext: ctx.currentPageContext,
      entityType: 'document',
      documentId: args.documentId,
    });
  },
});

export const listIssues: any = createTool({
  description:
    'List issues with key details. If projectKey or teamKey is omitted, the current project or team page scope is used when available. Filter by assignee using assigneeName. Returns key, title, priority, state, assignee, dates, and parent for each issue.',
  args: z.object({
    projectKey: z.string().optional(),
    teamKey: z.string().optional(),
    assigneeName: z
      .string()
      .optional()
      .describe(
        'Filter by assignee name or email. Use listWorkspaceReferenceData to look up member names.',
      ),
    limit: z.number().int().positive().max(50).optional(),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runQuery(internal.ai.internal.listIssues, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      ...args,
    });
  },
});

export const getIssue: any = createTool({
  description:
    'Get full details of one issue including assignees, state, dates, and parent. If issueKey is omitted, defaults to the current issue page.',
  args: z.object({
    issueKey: z.string().optional(),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runQuery(internal.ai.internal.getIssue, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      issueKey: args.issueKey,
    });
  },
});

export const createIssue: any = createTool({
  description:
    'Create an issue with full details. On a project or team page, project and team scope default from the current page. Use listWorkspaceReferenceData to look up valid priority names, team keys, project keys, member names, and state types before creating.',
  args: z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    projectKey: z.string().optional(),
    teamKey: z.string().optional(),
    priorityName: z.string().optional(),
    visibility: z.enum(['private', 'organization', 'public']).optional(),
    assigneeName: z
      .string()
      .optional()
      .describe('Name or email of a workspace member to assign this issue to'),
    stateName: z
      .string()
      .optional()
      .describe(
        'Issue state name (e.g. "Backlog", "Todo", "In Progress", "Done", "Canceled"). Defaults to the first todo state.',
      ),
    startDate: z
      .string()
      .optional()
      .describe('ISO date string (YYYY-MM-DD) for when work should start'),
    dueDate: z
      .string()
      .optional()
      .describe('ISO date string (YYYY-MM-DD) for the deadline'),
    parentIssueKey: z
      .string()
      .optional()
      .describe(
        'Key of the parent issue (e.g. "PROJ-1") to make this a sub-issue',
      ),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(internal.ai.internal.createIssue, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      ...args,
    });
  },
});

export const updateIssue: any = createTool({
  description:
    'Update any field on an issue. If issueKey is omitted, defaults to the current issue page. Pass null to clear optional fields. Use listWorkspaceReferenceData to look up valid values before updating.',
  args: z.object({
    issueKey: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    priorityName: z.string().nullable().optional(),
    teamKey: z.string().nullable().optional(),
    projectKey: z.string().nullable().optional(),
    visibility: z.enum(['private', 'organization', 'public']).optional(),
    assigneeName: z
      .string()
      .nullable()
      .optional()
      .describe(
        'Name or email of a workspace member to assign. Pass null to unassign.',
      ),
    stateName: z
      .string()
      .optional()
      .describe(
        'Issue state name (e.g. "Backlog", "Todo", "In Progress", "Done", "Canceled") to transition the issue to.',
      ),
    startDate: z
      .string()
      .nullable()
      .optional()
      .describe('ISO date string (YYYY-MM-DD). Pass null to clear.'),
    dueDate: z
      .string()
      .nullable()
      .optional()
      .describe('ISO date string (YYYY-MM-DD). Pass null to clear.'),
    parentIssueKey: z
      .string()
      .nullable()
      .optional()
      .describe(
        'Key of parent issue. Pass null to remove sub-issue relationship.',
      ),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(internal.ai.internal.updateIssue, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      ...args,
    });
  },
});

export const changeIssueKey: any = createTool({
  description:
    'Change an issue\'s key prefix by regenerating it based on a different scope. This changes the KEY PREFIX (e.g. PROJ-5 → ENG-3), NOT the issue visibility. Use "project" to base the key on the issue\'s project key, "team" on the team key, "org" on the organization slug, or "user" on the current user\'s name/username. The issue must already have the relevant team or project assigned for those scopes.',
  args: z.object({
    issueKey: z
      .string()
      .optional()
      .describe(
        'Key of the issue to change. Defaults to the current issue page.',
      ),
    context: z
      .enum(['team', 'project', 'user', 'org'])
      .describe(
        'Which scope to derive the new key prefix from: "project" uses the project key, "team" uses the team key, "org" uses the uppercased org slug, "user" uses the user\'s username or initials.',
      ),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(internal.ai.internal.changeIssueKey, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      issueKey: args.issueKey,
      context: args.context,
    });
  },
});

export const requestDeleteIssue: any = createTool({
  description:
    'Prepare deletion of an issue. This creates a pending confirmation in the UI instead of deleting immediately.',
  args: z.object({
    issueKey: z.string().optional(),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(internal.ai.internal.setPendingDeleteAction, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      assistantThreadId: ctx.assistantThreadId,
      pageContext: ctx.currentPageContext,
      entityType: 'issue',
      issueKey: args.issueKey,
    });
  },
});

export const listProjects: any = createTool({
  description:
    'List projects. If teamKey is omitted, defaults to the current team page when available.',
  args: z.object({
    teamKey: z.string().optional(),
    limit: z.number().int().positive().max(50).optional(),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runQuery(internal.ai.internal.listProjects, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      ...args,
    });
  },
});

export const getProject: any = createTool({
  description:
    'Get one project by key. If projectKey is omitted, defaults to the current project page.',
  args: z.object({
    projectKey: z.string().optional(),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runQuery(internal.ai.internal.getProject, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      projectKey: args.projectKey,
    });
  },
});

export const createProject: any = createTool({
  description:
    'Create a project. On a team page, team scope defaults from the current page. Use searchIcons to find a valid icon value before setting one.',
  args: z.object({
    key: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    teamKey: z.string().optional(),
    statusName: z.string().optional(),
    visibility: z.enum(['private', 'organization', 'public']).optional(),
    icon: z.string().optional().describe('Icon value from searchIcons'),
    color: z.string().optional().describe('Hex color (e.g. "#6366f1")'),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(internal.ai.internal.createProject, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      ...args,
    });
  },
});

export const updateProject: any = createTool({
  description:
    'Update a project. If projectKey is omitted, defaults to the current project page. Use searchIcons to find a valid icon value before setting one.',
  args: z.object({
    projectKey: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    teamKey: z.string().nullable().optional(),
    statusName: z.string().nullable().optional(),
    visibility: z.enum(['private', 'organization', 'public']).optional(),
    startDate: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    icon: z
      .string()
      .nullable()
      .optional()
      .describe('Icon value from searchIcons. Pass null to clear.'),
    color: z
      .string()
      .nullable()
      .optional()
      .describe('Hex color. Pass null to clear.'),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(internal.ai.internal.updateProject, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      ...args,
    });
  },
});

export const requestDeleteProject: any = createTool({
  description:
    'Prepare deletion of a project. This creates a pending confirmation in the UI instead of deleting immediately.',
  args: z.object({
    projectKey: z.string().optional(),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(internal.ai.internal.setPendingDeleteAction, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      assistantThreadId: ctx.assistantThreadId,
      pageContext: ctx.currentPageContext,
      entityType: 'project',
      projectKey: args.projectKey,
    });
  },
});

export const listTeams: any = createTool({
  description: 'List teams in the current organization.',
  args: z.object({
    limit: z.number().int().positive().max(50).optional(),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runQuery(internal.ai.internal.listTeams, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      limit: args.limit,
    });
  },
});

export const getTeam: any = createTool({
  description:
    'Get one team by key. If teamKey is omitted, defaults to the current team page.',
  args: z.object({
    teamKey: z.string().optional(),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runQuery(internal.ai.internal.getTeam, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      teamKey: args.teamKey,
    });
  },
});

export const createTeam: any = createTool({
  description:
    'Create a team in the current organization. Use searchIcons to find a valid icon value before setting one.',
  args: z.object({
    key: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    visibility: z.enum(['private', 'organization', 'public']).optional(),
    icon: z.string().optional().describe('Icon value from searchIcons'),
    color: z.string().optional().describe('Hex color (e.g. "#6366f1")'),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(internal.ai.internal.createTeam, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      ...args,
    });
  },
});

export const updateTeam: any = createTool({
  description:
    'Update a team. If teamKey is omitted, defaults to the current team page. Use searchIcons to find a valid icon value before setting one.',
  args: z.object({
    teamKey: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    visibility: z.enum(['private', 'organization', 'public']).optional(),
    icon: z
      .string()
      .nullable()
      .optional()
      .describe('Icon value from searchIcons. Pass null to clear.'),
    color: z
      .string()
      .nullable()
      .optional()
      .describe('Hex color. Pass null to clear.'),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(internal.ai.internal.updateTeam, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      ...args,
    });
  },
});

// ──── Team member management ────

export const addTeamMember: any = createTool({
  description:
    'Add a workspace member to a team. Look up the member name via listWorkspaceReferenceData first.',
  args: z.object({
    teamKey: z
      .string()
      .optional()
      .describe('Team key. Defaults to current team page.'),
    memberName: z
      .string()
      .describe('Name or email of the workspace member to add'),
    role: z
      .enum(['lead', 'member'])
      .optional()
      .describe('Role in the team. Defaults to member.'),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(internal.ai.internal.addTeamMember, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      ...args,
    });
  },
});

export const removeTeamMember: any = createTool({
  description: 'Remove a member from a team.',
  args: z.object({
    teamKey: z
      .string()
      .optional()
      .describe('Team key. Defaults to current team page.'),
    memberName: z.string().describe('Name or email of the member to remove'),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(internal.ai.internal.removeTeamMember, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      ...args,
    });
  },
});

export const changeTeamLead: any = createTool({
  description:
    'Change the lead of a team. Pass null to remove the current lead.',
  args: z.object({
    teamKey: z
      .string()
      .optional()
      .describe('Team key. Defaults to current team page.'),
    leadName: z
      .string()
      .nullable()
      .describe('Name or email of the new lead, or null to remove'),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(internal.ai.internal.changeTeamLead, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      ...args,
    });
  },
});

// ──── Project member management ────

export const addProjectMember: any = createTool({
  description:
    'Add a workspace member to a project. Look up the member name via listWorkspaceReferenceData first.',
  args: z.object({
    projectKey: z
      .string()
      .optional()
      .describe('Project key. Defaults to current project page.'),
    memberName: z
      .string()
      .describe('Name or email of the workspace member to add'),
    role: z
      .enum(['lead', 'member'])
      .optional()
      .describe('Role in the project. Defaults to member.'),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(internal.ai.internal.addProjectMember, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      ...args,
    });
  },
});

export const removeProjectMember: any = createTool({
  description: 'Remove a member from a project.',
  args: z.object({
    projectKey: z
      .string()
      .optional()
      .describe('Project key. Defaults to current project page.'),
    memberName: z.string().describe('Name or email of the member to remove'),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(internal.ai.internal.removeProjectMember, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      ...args,
    });
  },
});

export const changeProjectLead: any = createTool({
  description:
    'Change the lead of a project. Pass null to remove the current lead.',
  args: z.object({
    projectKey: z
      .string()
      .optional()
      .describe('Project key. Defaults to current project page.'),
    leadName: z
      .string()
      .nullable()
      .describe('Name or email of the new lead, or null to remove'),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(internal.ai.internal.changeProjectLead, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      ...args,
    });
  },
});

// ──── Issue assignment (delegation) ────

export const assignIssue: any = createTool({
  description:
    'Assign a workspace member to an issue. Optionally set the assignment state. Use for delegating work.',
  args: z.object({
    issueKey: z
      .string()
      .optional()
      .describe('Issue key. Defaults to current issue page.'),
    assigneeName: z.string().describe('Name or email of the member to assign'),
    stateName: z
      .string()
      .optional()
      .describe('Issue state name for this assignment (e.g. "In Progress")'),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(internal.ai.internal.assignIssue, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      ...args,
    });
  },
});

export const unassignIssue: any = createTool({
  description: 'Remove an assignee from an issue.',
  args: z.object({
    issueKey: z
      .string()
      .optional()
      .describe('Issue key. Defaults to current issue page.'),
    assigneeName: z
      .string()
      .describe('Name or email of the member to unassign'),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(internal.ai.internal.unassignIssue, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      ...args,
    });
  },
});

export const listMyDeviceSessionOptions: Tool<{}, unknown> = createTool({
  description:
    "List the authenticated user's own online bridge devices, delegated workspaces, active work sessions, and attachable observed sessions. Use this when the user wants you to run or attach work on their computer and you need to inspect available device context. The results are limited to the current user's own devices only.",
  args: z.object({}),
  handler: async (ctx: AssistantToolCtx): Promise<unknown> => {
    return await ctx.runQuery(internal.ai.internal.listMyDeviceSessionOptions, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
    });
  },
});

export const startIssueDeviceWorkSession: Tool<
  StartIssueDeviceWorkSessionInput,
  unknown
> = createTool({
  description:
    'Start a new tmux-backed work session for an issue on the authenticated user\'s own bridge device. If provider is omitted, default to Codex. Use provider "vector_cli" for a manual shell session with no managed agent. If deviceId or workspaceId is omitted, this prefers the user\'s single online device and default delegated workspace when unambiguous. If the result returns status "needs_selection", ask one short clarifying question using the provided options.',
  args: z.object({
    issueKey: z
      .string()
      .optional()
      .describe('Issue key. Defaults to the current issue page when omitted.'),
    deviceId: z
      .string()
      .optional()
      .describe(
        'Device id from listMyDeviceSessionOptions when selection is needed.',
      ),
    workspaceId: z
      .string()
      .optional()
      .describe(
        'Workspace id from listMyDeviceSessionOptions when selection is needed.',
      ),
    provider: z
      .enum(['codex', 'claude_code', 'vector_cli'])
      .optional()
      .describe(
        'Managed agent to launch, or "vector_cli" for a manual shell session.',
      ),
  }),
  handler: async (
    ctx: AssistantToolCtx,
    args: StartIssueDeviceWorkSessionInput,
  ): Promise<unknown> => {
    return await ctx.runMutation(
      internal.ai.internal.startIssueDeviceWorkSession,
      {
        orgSlug: ctx.currentPageContext.orgSlug,
        userId: ctx.userId,
        pageContext: ctx.currentPageContext,
        ...args,
      },
    );
  },
});

export const attachIssueToObservedDeviceSession: Tool<
  AttachIssueToObservedDeviceSessionInput,
  unknown
> = createTool({
  description:
    'Attach an existing observed tmux, Codex, or Claude session from the authenticated user\'s own device to an issue, so future Vector messages go to that running work. If processId is omitted, this auto-selects only when there is a single clear attachable session. If the result returns status "needs_selection", ask one short clarifying question using the provided options.',
  args: z.object({
    issueKey: z
      .string()
      .optional()
      .describe('Issue key. Defaults to the current issue page when omitted.'),
    deviceId: z
      .string()
      .optional()
      .describe(
        'Device id from listMyDeviceSessionOptions when multiple devices are online.',
      ),
    processId: z
      .string()
      .optional()
      .describe(
        'Observed session id from listMyDeviceSessionOptions when multiple attachable sessions are available.',
      ),
  }),
  handler: async (
    ctx: AssistantToolCtx,
    args: AttachIssueToObservedDeviceSessionInput,
  ): Promise<unknown> => {
    return await ctx.runMutation(
      internal.ai.internal.attachIssueToObservedDeviceSession,
      {
        orgSlug: ctx.currentPageContext.orgSlug,
        userId: ctx.userId,
        pageContext: ctx.currentPageContext,
        ...args,
      },
    );
  },
});

export const linkGitHubArtifactToIssue: any = createTool({
  description:
    'Link an already-ingested GitHub pull request, GitHub issue, or commit URL to a Vector issue. If issueKey is omitted, defaults to the current issue page. Use this after webhook ingestion when the link should be attached intentionally.',
  args: z.object({
    issueKey: z
      .string()
      .optional()
      .describe('Issue key. Defaults to the current issue page.'),
    url: z
      .string()
      .describe('GitHub PR, issue, or commit URL to link to the issue'),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(
      internal.ai.internal.linkGitHubArtifactToIssue,
      {
        orgSlug: ctx.currentPageContext.orgSlug,
        userId: ctx.userId,
        pageContext: ctx.currentPageContext,
        ...args,
      },
    );
  },
});

// ──── Document folder management ────

export const createFolder: any = createTool({
  description:
    'Create a document folder for organizing documents. Use searchIcons to find a valid icon value before setting one.',
  args: z.object({
    name: z.string().min(1).describe('Folder name'),
    description: z.string().optional(),
    icon: z.string().optional().describe('Icon value from searchIcons'),
    color: z.string().optional().describe('Hex color for the folder'),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(internal.ai.internal.createFolder, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      ...args,
    });
  },
});

export const updateFolder: any = createTool({
  description:
    'Update a document folder name, description, icon, or color. Use searchIcons to find a valid icon value before setting one.',
  args: z.object({
    folderId: z.string().describe('Folder ID'),
    name: z.string().optional(),
    description: z.string().nullable().optional(),
    icon: z
      .string()
      .nullable()
      .optional()
      .describe('Icon value from searchIcons. Pass null to clear.'),
    color: z.string().nullable().optional(),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(internal.ai.internal.updateFolder, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      ...args,
    });
  },
});

export const requestDeleteFolder: any = createTool({
  description:
    'Prepare deletion of a document folder. This creates a pending confirmation. Documents in the folder will be unlinked, not deleted.',
  args: z.object({
    folderId: z.string().describe('Folder ID to delete'),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(internal.ai.internal.requestDeleteFolder, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      assistantThreadId: ctx.assistantThreadId,
      ...args,
    });
  },
});

export const moveDocumentToFolder: any = createTool({
  description:
    'Move a document into a folder, or pass null folderId to remove from its current folder.',
  args: z.object({
    documentId: z
      .string()
      .optional()
      .describe('Document ID. Defaults to current document page.'),
    folderId: z
      .string()
      .nullable()
      .describe('Target folder ID, or null to remove from folder'),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(internal.ai.internal.moveDocumentToFolder, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      ...args,
    });
  },
});

export const listFolders: any = createTool({
  description:
    'List all document folders in the organization with their document counts.',
  args: z.object({}),
  handler: async (ctx: AssistantToolCtx) => {
    return await ctx.runQuery(internal.ai.internal.listFolders, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
    });
  },
});

// ──── Display tools (render entity lists in chat) ────

export const showIssues: any = createTool({
  description:
    'Display a rich list of issues to the user inline in the conversation. Use this when the user asks to see, show, or browse issues. Returns detailed issue data that renders as interactive entity cards in the chat. Prefer this over listIssues when the user wants to visually see issues.',
  args: z.object({
    projectKey: z.string().optional(),
    teamKey: z.string().optional(),
    assigneeName: z
      .string()
      .optional()
      .describe('Filter by assignee name or email'),
    limit: z.number().int().positive().max(10).optional(),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    const items = await ctx.runQuery(internal.ai.internal.listIssues, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      ...args,
    });
    return {
      _display: 'issues',
      orgSlug: ctx.currentPageContext.orgSlug,
      items,
    };
  },
});

export const showProjects: any = createTool({
  description:
    'Display a rich list of projects to the user inline in the conversation. Use this when the user asks to see, show, or browse projects.',
  args: z.object({
    teamKey: z.string().optional(),
    limit: z.number().int().positive().max(10).optional(),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    const items = await ctx.runQuery(internal.ai.internal.listProjects, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      ...args,
    });
    return {
      _display: 'projects',
      orgSlug: ctx.currentPageContext.orgSlug,
      items,
    };
  },
});

export const showTeams: any = createTool({
  description:
    'Display a rich list of teams to the user inline in the conversation. Use this when the user asks to see, show, or browse teams.',
  args: z.object({
    limit: z.number().int().positive().max(10).optional(),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    const items = await ctx.runQuery(internal.ai.internal.listTeams, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      ...args,
    });
    return {
      _display: 'teams',
      orgSlug: ctx.currentPageContext.orgSlug,
      items,
    };
  },
});

export const showDocuments: any = createTool({
  description:
    'Display a rich list of documents to the user inline in the conversation. Use this when the user asks to see, show, or browse documents.',
  args: z.object({
    folderId: z.string().optional(),
    limit: z.number().int().positive().max(10).optional(),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    const items = await ctx.runQuery(internal.ai.internal.listDocuments, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      pageContext: ctx.currentPageContext,
      ...args,
    });
    return {
      _display: 'documents',
      orgSlug: ctx.currentPageContext.orgSlug,
      items,
    };
  },
});

// ──── Organization member management ────

export const listOrgMembers: any = createTool({
  description:
    'List all members of the current organization with their names, emails, and roles (owner/admin/member).',
  args: z.object({}),
  handler: async (ctx: AssistantToolCtx) => {
    return await ctx.runQuery(internal.ai.internal.listOrgMembers, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
    });
  },
});

export const listOrgInvites: any = createTool({
  description:
    'List pending invitations for the current organization. Shows email, role, who invited them, and expiry.',
  args: z.object({}),
  handler: async (ctx: AssistantToolCtx) => {
    return await ctx.runQuery(internal.ai.internal.listOrgInvites, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
    });
  },
});

export const inviteOrgMember: any = createTool({
  description:
    'Invite someone to the organization by email. They will receive an invitation email. Role can be "member" or "admin".',
  args: z.object({
    email: z.string().describe('Email address to invite'),
    role: z
      .enum(['member', 'admin'])
      .optional()
      .describe('Organization role. Defaults to member.'),
  }),
  handler: async (
    ctx: AssistantToolCtx,
    args: { email: string; role?: 'member' | 'admin' },
  ) => {
    return await ctx.runMutation(internal.ai.internal.inviteOrgMember, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      email: args.email,
      role: args.role ?? 'member',
    });
  },
});

export const revokeOrgInvite: any = createTool({
  description:
    'Revoke a pending invitation. Use listOrgInvites first to find the inviteId.',
  args: z.object({
    inviteId: z.string().describe('The invitation ID to revoke'),
  }),
  handler: async (ctx: AssistantToolCtx, args: { inviteId: string }) => {
    return await ctx.runMutation(internal.ai.internal.revokeOrgInvite, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      inviteId: args.inviteId,
    });
  },
});

export const removeOrgMember: any = createTool({
  description:
    'Remove a member from the organization entirely. This also removes them from all teams and projects. Cannot remove the owner. Use listOrgMembers or listWorkspaceReferenceData to find the member name first.',
  args: z.object({
    memberName: z
      .string()
      .describe('Name or email of the member to remove from the organization'),
  }),
  handler: async (ctx: AssistantToolCtx, args: { memberName: string }) => {
    return await ctx.runMutation(internal.ai.internal.removeOrgMember, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      memberName: args.memberName,
    });
  },
});

export const updateOrgMemberRole: any = createTool({
  description:
    'Change a member\'s organization role to "member" or "admin". Cannot change the owner\'s role.',
  args: z.object({
    memberName: z
      .string()
      .describe('Name or email of the member whose role to change'),
    role: z.enum(['member', 'admin']).describe('New organization role'),
  }),
  handler: async (
    ctx: AssistantToolCtx,
    args: { memberName: string; role: 'member' | 'admin' },
  ) => {
    return await ctx.runMutation(internal.ai.internal.updateOrgMemberRole, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      memberName: args.memberName,
      role: args.role,
    });
  },
});

export const renameMember: any = createTool({
  description:
    'Rename another user in the organization. Requires admin or owner role.',
  args: z.object({
    memberName: z
      .string()
      .describe('Current name, username, or email of the member to rename'),
    newName: z.string().min(1).describe('The new display name to set'),
  }),
  handler: async (
    ctx: AssistantToolCtx,
    args: { memberName: string; newName: string },
  ) => {
    return await ctx.runMutation(internal.ai.internal.renameMember, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      memberName: args.memberName,
      newName: args.newName,
    });
  },
});

export const sendEmailToMember: any = createTool({
  description:
    'Send an email to an organization member. Requires admin or owner role. The email is sent from the workspace SMTP configuration.',
  args: z.object({
    recipientName: z
      .string()
      .describe('Name, username, or email of the member to email'),
    subject: z.string().min(1).describe('Email subject line'),
    body: z
      .string()
      .min(1)
      .describe(
        'Email body content (plain text, will be rendered in the Vector email template)',
      ),
  }),
  handler: async (
    ctx: AssistantToolCtx,
    args: { recipientName: string; subject: string; body: string },
  ) => {
    return await ctx.runMutation(internal.ai.internal.sendEmailToMember, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      recipientName: args.recipientName,
      subject: args.subject,
      body: args.body,
    });
  },
});

// ──── Activity feed ────

export const listActivity: any = createTool({
  description:
    'List recent activity across the organization. Filter by entity type (issue, project, team, document), specific event type (e.g. issue_created, issue_priority_changed), and time range. Use this to answer questions like "what happened today?", "what issues were created this week?", or "show me recent activity".',
  args: z.object({
    entityType: z
      .enum(['issue', 'project', 'team', 'document'])
      .optional()
      .describe('Filter by entity type'),
    eventType: z
      .string()
      .optional()
      .describe(
        'Filter by specific event type (e.g. issue_created, issue_priority_changed, project_status_changed, document_created)',
      ),
    since: z
      .string()
      .optional()
      .describe(
        'ISO date string for start of time range (e.g. "2026-03-17T00:00:00Z")',
      ),
    until: z
      .string()
      .optional()
      .describe(
        'ISO date string for end of time range (e.g. "2026-03-17T23:59:59Z")',
      ),
    limit: z.number().int().positive().max(100).optional(),
    cursor: z
      .string()
      .optional()
      .describe('Pagination cursor from previous call'),
  }),
  handler: async (
    ctx: AssistantToolCtx,
    args: {
      entityType?: 'issue' | 'project' | 'team' | 'document';
      eventType?: string;
      since?: string;
      until?: string;
      limit?: number;
      cursor?: string;
    },
  ) => {
    return await ctx.runQuery(internal.ai.internal.listActivity, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      entityType: args.entityType,
      eventType: args.eventType as ActivityEventType | undefined,
      since: args.since ? new Date(args.since).getTime() : undefined,
      until: args.until ? new Date(args.until).getTime() : undefined,
      limit: args.limit,
      cursor: args.cursor,
    });
  },
});

// ──── Client action queue ────

export const performClientAction: any = createTool({
  description:
    'Perform a UI action on the user\'s client. Supported types: "navigate" (redirect to a page), "open_tab" (open URL in new tab), "copy" (copy text to clipboard), "toast" (show a notification toast). Use this to guide users to relevant pages after creating or updating entities.',
  args: z.object({
    type: z
      .enum(['navigate', 'open_tab', 'copy', 'toast'])
      .describe('Action type'),
    url: z
      .string()
      .optional()
      .describe(
        'URL path for navigate/open_tab (e.g. "/org-slug/issues/PROJ-1")',
      ),
    text: z.string().optional().describe('Text for copy or toast message'),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    const payload: Record<string, string> = {};
    if (args.url) payload.url = args.url;
    if (args.text) payload.text = args.text;

    const result = await ctx.runMutation(
      internal.ai.internal.enqueueClientAction,
      {
        orgSlug: ctx.currentPageContext.orgSlug,
        userId: ctx.userId,
        type: args.type,
        payload,
      },
    );
    return { message: `Queued ${args.type} action`, actionId: result.actionId };
  },
});

export const requestDeleteTeam: any = createTool({
  description:
    'Prepare deletion of a team. This creates a pending confirmation in the UI instead of deleting immediately.',
  args: z.object({
    teamKey: z.string().optional(),
  }),
  handler: async (ctx: AssistantToolCtx, args) => {
    return await ctx.runMutation(internal.ai.internal.setPendingDeleteAction, {
      orgSlug: ctx.currentPageContext.orgSlug,
      userId: ctx.userId,
      assistantThreadId: ctx.assistantThreadId,
      pageContext: ctx.currentPageContext,
      entityType: 'team',
      teamKey: args.teamKey,
    });
  },
});
