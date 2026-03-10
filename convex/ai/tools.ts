import { createTool, type ToolCtx } from '@convex-dev/agent';
import { z } from 'zod';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import type { AssistantPageContext } from './lib';

type AssistantToolCtx = ToolCtx & {
  organizationId: Id<'organizations'>;
  userId: Id<'users'>;
  assistantThreadId: Id<'assistantThreads'>;
  currentPageContext: AssistantPageContext;
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
    'List issues with key details. If projectKey or teamKey is omitted, the current project or team page scope is used when available. Returns key, title, priority, state, assignee, dates, and parent for each issue.',
  args: z.object({
    projectKey: z.string().optional(),
    teamKey: z.string().optional(),
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
    'Create a project. On a team page, team scope defaults from the current page.',
  args: z.object({
    key: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    teamKey: z.string().optional(),
    statusName: z.string().optional(),
    visibility: z.enum(['private', 'organization', 'public']).optional(),
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
    'Update a project. If projectKey is omitted, defaults to the current project page.',
  args: z.object({
    projectKey: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    teamKey: z.string().nullable().optional(),
    statusName: z.string().nullable().optional(),
    visibility: z.enum(['private', 'organization', 'public']).optional(),
    startDate: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
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
  description: 'Create a team in the current organization.',
  args: z.object({
    key: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    visibility: z.enum(['private', 'organization', 'public']).optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
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
    'Update a team. If teamKey is omitted, defaults to the current team page.',
  args: z.object({
    teamKey: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    visibility: z.enum(['private', 'organization', 'public']).optional(),
    icon: z.string().nullable().optional(),
    color: z.string().nullable().optional(),
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

// ──── Document folder management ────

export const createFolder: any = createTool({
  description: 'Create a document folder for organizing documents.',
  args: z.object({
    name: z.string().min(1).describe('Folder name'),
    description: z.string().optional(),
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
  description: 'Update a document folder name, description, or color.',
  args: z.object({
    folderId: z.string().describe('Folder ID'),
    name: z.string().optional(),
    description: z.string().nullable().optional(),
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
