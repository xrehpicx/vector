import { action, type ActionCtx } from './_generated/server';
import { ConvexError, v } from 'convex/values';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { searchAvailableIcons } from './ai/icons';

const visibilityValidator = v.union(
  v.literal('private'),
  v.literal('organization'),
  v.literal('public'),
);

const nullableVisibilityValidator = v.optional(visibilityValidator);

const optionalStringOrNull = v.optional(v.union(v.string(), v.null()));

async function requireActionUserId(ctx: ActionCtx): Promise<Id<'users'>> {
  const user = await ctx.runQuery(api.users.getCurrentUser, {});
  if (!user) {
    throw new ConvexError('UNAUTHORIZED');
  }
  return user._id;
}

export const listWorkspaceReferenceData: any = action({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runQuery(internal.ai.internal.listWorkspaceReferenceData, {
      orgSlug: args.orgSlug,
      userId,
    });
  },
});

export const searchIcons: any = action({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    return {
      icons: searchAvailableIcons(args.query, args.limit ?? 10),
      hint: 'Use the "value" field when setting an icon on an entity.',
    };
  },
});

export const listDocuments: any = action({
  args: {
    orgSlug: v.string(),
    folderId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runQuery(internal.ai.internal.listDocuments, {
      orgSlug: args.orgSlug,
      userId,
      folderId: args.folderId,
      limit: args.limit,
    });
  },
});

export const getDocument: any = action({
  args: {
    orgSlug: v.string(),
    documentId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runQuery(internal.ai.internal.getDocument, {
      orgSlug: args.orgSlug,
      userId,
      documentId: args.documentId,
    });
  },
});

export const createDocument: any = action({
  args: {
    orgSlug: v.string(),
    title: v.string(),
    content: v.optional(v.string()),
    visibility: nullableVisibilityValidator,
    teamKey: v.optional(v.string()),
    projectKey: v.optional(v.string()),
    folderId: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runMutation(internal.ai.internal.createDocument, {
      ...args,
      userId,
    });
  },
});

export const updateDocument: any = action({
  args: {
    orgSlug: v.string(),
    documentId: v.string(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    visibility: nullableVisibilityValidator,
    teamKey: optionalStringOrNull,
    projectKey: optionalStringOrNull,
    folderId: optionalStringOrNull,
    icon: optionalStringOrNull,
    color: optionalStringOrNull,
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runMutation(internal.ai.internal.updateDocument, {
      ...args,
      userId,
    });
  },
});

export const deleteDocument: any = action({
  args: {
    orgSlug: v.string(),
    documentId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    const document = await ctx.runQuery(internal.ai.internal.getDocument, {
      orgSlug: args.orgSlug,
      userId,
      documentId: args.documentId,
    });

    return await ctx.runMutation(api.documents.mutations.remove, {
      documentId: document.id as any,
    });
  },
});

export const moveDocumentToFolder: any = action({
  args: {
    orgSlug: v.string(),
    documentId: v.string(),
    folderId: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runMutation(internal.ai.internal.moveDocumentToFolder, {
      ...args,
      userId,
    });
  },
});

export const listIssues: any = action({
  args: {
    orgSlug: v.string(),
    projectKey: v.optional(v.string()),
    teamKey: v.optional(v.string()),
    assigneeName: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runQuery(internal.ai.internal.listIssues, {
      ...args,
      userId,
    });
  },
});

export const getIssue: any = action({
  args: {
    orgSlug: v.string(),
    issueKey: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runQuery(internal.ai.internal.getIssue, {
      ...args,
      userId,
    });
  },
});

export const createIssue: any = action({
  args: {
    orgSlug: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    projectKey: v.optional(v.string()),
    teamKey: v.optional(v.string()),
    priorityName: v.optional(v.string()),
    visibility: nullableVisibilityValidator,
    assigneeName: v.optional(v.string()),
    stateName: v.optional(v.string()),
    startDate: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    parentIssueKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runMutation(internal.ai.internal.createIssue, {
      ...args,
      userId,
    });
  },
});

export const updateIssue: any = action({
  args: {
    orgSlug: v.string(),
    issueKey: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    priorityName: optionalStringOrNull,
    teamKey: optionalStringOrNull,
    projectKey: optionalStringOrNull,
    visibility: nullableVisibilityValidator,
    assigneeName: optionalStringOrNull,
    stateName: v.optional(v.string()),
    startDate: optionalStringOrNull,
    dueDate: optionalStringOrNull,
    parentIssueKey: optionalStringOrNull,
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runMutation(internal.ai.internal.updateIssue, {
      ...args,
      userId,
    });
  },
});

export const deleteIssue: any = action({
  args: {
    orgSlug: v.string(),
    issueKey: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    const issue = await ctx.runQuery(internal.ai.internal.getIssue, {
      orgSlug: args.orgSlug,
      userId,
      issueKey: args.issueKey,
    });

    return await ctx.runMutation(api.issues.mutations.deleteIssue, {
      issueId: issue.id as any,
    });
  },
});

export const assignIssue: any = action({
  args: {
    orgSlug: v.string(),
    issueKey: v.string(),
    assigneeName: v.string(),
    stateName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runMutation(internal.ai.internal.assignIssue, {
      ...args,
      userId,
    });
  },
});

export const unassignIssue: any = action({
  args: {
    orgSlug: v.string(),
    issueKey: v.string(),
    assigneeName: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runMutation(internal.ai.internal.unassignIssue, {
      ...args,
      userId,
    });
  },
});

export const listProjects: any = action({
  args: {
    orgSlug: v.string(),
    teamKey: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runQuery(internal.ai.internal.listProjects, {
      ...args,
      userId,
    });
  },
});

export const getProject: any = action({
  args: {
    orgSlug: v.string(),
    projectKey: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runQuery(internal.ai.internal.getProject, {
      ...args,
      userId,
    });
  },
});

export const createProject: any = action({
  args: {
    orgSlug: v.string(),
    key: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    teamKey: v.optional(v.string()),
    statusName: v.optional(v.string()),
    visibility: nullableVisibilityValidator,
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runMutation(internal.ai.internal.createProject, {
      ...args,
      userId,
    });
  },
});

export const updateProject: any = action({
  args: {
    orgSlug: v.string(),
    projectKey: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    teamKey: optionalStringOrNull,
    statusName: optionalStringOrNull,
    visibility: nullableVisibilityValidator,
    startDate: optionalStringOrNull,
    dueDate: optionalStringOrNull,
    icon: optionalStringOrNull,
    color: optionalStringOrNull,
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runMutation(internal.ai.internal.updateProject, {
      ...args,
      userId,
    });
  },
});

export const deleteProject: any = action({
  args: {
    orgSlug: v.string(),
    projectKey: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    const project = await ctx.runQuery(internal.ai.internal.getProject, {
      orgSlug: args.orgSlug,
      userId,
      projectKey: args.projectKey,
    });

    return await ctx.runMutation(api.projects.mutations.deleteProject, {
      projectId: project.id as any,
    });
  },
});

export const addProjectMember: any = action({
  args: {
    orgSlug: v.string(),
    projectKey: v.string(),
    memberName: v.string(),
    role: v.optional(v.union(v.literal('lead'), v.literal('member'))),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runMutation(internal.ai.internal.addProjectMember, {
      ...args,
      userId,
    });
  },
});

export const removeProjectMember: any = action({
  args: {
    orgSlug: v.string(),
    projectKey: v.string(),
    memberName: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runMutation(internal.ai.internal.removeProjectMember, {
      ...args,
      userId,
    });
  },
});

export const changeProjectLead: any = action({
  args: {
    orgSlug: v.string(),
    projectKey: v.string(),
    leadName: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runMutation(internal.ai.internal.changeProjectLead, {
      ...args,
      userId,
    });
  },
});

export const listTeams: any = action({
  args: {
    orgSlug: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runQuery(internal.ai.internal.listTeams, {
      ...args,
      userId,
    });
  },
});

export const getTeam: any = action({
  args: {
    orgSlug: v.string(),
    teamKey: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runQuery(internal.ai.internal.getTeam, {
      ...args,
      userId,
    });
  },
});

export const createTeam: any = action({
  args: {
    orgSlug: v.string(),
    key: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    visibility: nullableVisibilityValidator,
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runMutation(internal.ai.internal.createTeam, {
      ...args,
      userId,
    });
  },
});

export const updateTeam: any = action({
  args: {
    orgSlug: v.string(),
    teamKey: v.string(),
    name: v.optional(v.string()),
    description: optionalStringOrNull,
    visibility: nullableVisibilityValidator,
    icon: optionalStringOrNull,
    color: optionalStringOrNull,
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runMutation(internal.ai.internal.updateTeam, {
      ...args,
      userId,
    });
  },
});

export const deleteTeam: any = action({
  args: {
    orgSlug: v.string(),
    teamKey: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    const team = await ctx.runQuery(internal.ai.internal.getTeam, {
      orgSlug: args.orgSlug,
      userId,
      teamKey: args.teamKey,
    });

    return await ctx.runMutation(api.teams.mutations.deleteTeam, {
      teamId: team.id as any,
    });
  },
});

export const addTeamMember: any = action({
  args: {
    orgSlug: v.string(),
    teamKey: v.string(),
    memberName: v.string(),
    role: v.optional(v.union(v.literal('lead'), v.literal('member'))),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runMutation(internal.ai.internal.addTeamMember, {
      ...args,
      userId,
    });
  },
});

export const removeTeamMember: any = action({
  args: {
    orgSlug: v.string(),
    teamKey: v.string(),
    memberName: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runMutation(internal.ai.internal.removeTeamMember, {
      ...args,
      userId,
    });
  },
});

export const changeTeamLead: any = action({
  args: {
    orgSlug: v.string(),
    teamKey: v.string(),
    leadName: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runMutation(internal.ai.internal.changeTeamLead, {
      ...args,
      userId,
    });
  },
});

export const listFolders: any = action({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runQuery(internal.ai.internal.listFolders, {
      ...args,
      userId,
    });
  },
});

export const createFolder: any = action({
  args: {
    orgSlug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runMutation(internal.ai.internal.createFolder, {
      ...args,
      userId,
    });
  },
});

export const updateFolder: any = action({
  args: {
    orgSlug: v.string(),
    folderId: v.string(),
    name: v.optional(v.string()),
    description: optionalStringOrNull,
    icon: optionalStringOrNull,
    color: optionalStringOrNull,
  },
  handler: async (ctx, args) => {
    const userId = await requireActionUserId(ctx);
    return await ctx.runMutation(internal.ai.internal.updateFolder, {
      ...args,
      userId,
    });
  },
});

export const deleteFolder: any = action({
  args: {
    orgSlug: v.string(),
    folderId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireActionUserId(ctx);
    const folders = await ctx.runQuery(
      api.documents.folderQueries.listFolders,
      {
        orgSlug: args.orgSlug,
      },
    );
    const folder = folders.find(
      (item: { _id: string }) => String(item._id) === args.folderId,
    );

    if (!folder) {
      throw new ConvexError('FOLDER_NOT_FOUND');
    }

    return await ctx.runMutation(api.documents.folderMutations.removeFolder, {
      folderId: args.folderId as any,
    });
  },
});
