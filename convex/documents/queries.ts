import { query } from '../_generated/server';
import { v } from 'convex/values';
import { getOrganizationBySlug } from '../authz';
import { canViewDocument } from '../access';

export const getById = query({
  args: {
    documentId: v.id('documents'),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get('documents', args.documentId);
    if (!doc) return null;

    if (!(await canViewDocument(ctx, doc))) {
      return null;
    }

    const [author, lastEditor, team, project] = await Promise.all([
      ctx.db.get('users', doc.createdBy),
      doc.lastEditedBy ? ctx.db.get('users', doc.lastEditedBy) : null,
      doc.teamId ? ctx.db.get('teams', doc.teamId) : null,
      doc.projectId ? ctx.db.get('projects', doc.projectId) : null,
    ]);

    return {
      ...doc,
      author: author
        ? { _id: author._id, name: author.name, email: author.email }
        : null,
      lastEditor: lastEditor
        ? {
            _id: lastEditor._id,
            name: lastEditor.name,
            email: lastEditor.email,
          }
        : null,
      team: team
        ? {
            _id: team._id,
            name: team.name,
            key: team.key,
            icon: team.icon,
            color: team.color,
          }
        : null,
      project: project
        ? {
            _id: project._id,
            name: project.name,
            key: project.key,
            icon: project.icon,
            color: project.color,
          }
        : null,
    };
  },
});

export const list = query({
  args: {
    orgSlug: v.string(),
    folderId: v.optional(v.id('documentFolders')),
    teamId: v.optional(v.id('teams')),
    projectId: v.optional(v.id('projects')),
  },
  handler: async (ctx, args) => {
    const org = await getOrganizationBySlug(ctx, args.orgSlug);

    let documents;
    if (args.folderId) {
      documents = await ctx.db
        .query('documents')
        .withIndex('by_folder', q => q.eq('folderId', args.folderId!))
        .collect();
      // Filter to org
      documents = documents.filter(d => d.organizationId === org._id);
    } else if (args.teamId) {
      documents = await ctx.db
        .query('documents')
        .withIndex('by_org_team', q =>
          q.eq('organizationId', org._id).eq('teamId', args.teamId!),
        )
        .collect();
    } else if (args.projectId) {
      documents = await ctx.db
        .query('documents')
        .withIndex('by_org_project', q =>
          q.eq('organizationId', org._id).eq('projectId', args.projectId!),
        )
        .collect();
    } else {
      documents = await ctx.db
        .query('documents')
        .withIndex('by_organizationId', q => q.eq('organizationId', org._id))
        .collect();
    }

    // Access control filtering
    const visibleDocs = [];
    for (const doc of documents) {
      if (await canViewDocument(ctx, doc)) {
        visibleDocs.push(doc);
      }
    }

    // Enrich each doc with related entities
    return Promise.all(
      visibleDocs.map(async doc => {
        const [author, team, project] = await Promise.all([
          ctx.db.get('users', doc.createdBy),
          doc.teamId ? ctx.db.get('teams', doc.teamId) : null,
          doc.projectId ? ctx.db.get('projects', doc.projectId) : null,
        ]);

        return {
          ...doc,
          author: author
            ? { _id: author._id, name: author.name, email: author.email }
            : null,
          team: team
            ? {
                _id: team._id,
                name: team.name,
                key: team.key,
                icon: team.icon,
                color: team.color,
              }
            : null,
          project: project
            ? {
                _id: project._id,
                name: project.name,
                key: project.key,
                icon: project.icon,
                color: project.color,
              }
            : null,
        };
      }),
    );
  },
});

/**
 * Get documents that mention a given entity (user, team, project, or issue).
 * Used on entity detail pages to show "linked documents".
 */
export const listByMention = query({
  args: {
    orgSlug: v.string(),
    mentionType: v.union(
      v.literal('user'),
      v.literal('team'),
      v.literal('project'),
      v.literal('issue'),
    ),
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await getOrganizationBySlug(ctx, args.orgSlug);

    const mentions = await ctx.db
      .query('documentMentions')
      .withIndex('by_org_entity', q =>
        q
          .eq('organizationId', org._id)
          .eq('mentionType', args.mentionType)
          .eq('entityId', args.entityId),
      )
      .collect();

    const docs = await Promise.all(
      mentions.map(async m => {
        const doc = await ctx.db.get('documents', m.documentId);
        if (!doc) return null;
        if (!(await canViewDocument(ctx, doc))) return null;
        return {
          _id: doc._id,
          title: doc.title,
          icon: doc.icon,
          color: doc.color,
          lastEditedAt: doc.lastEditedAt,
          _creationTime: doc._creationTime,
        };
      }),
    );

    return docs.filter(Boolean) as {
      _id: string;
      title: string;
      icon?: string;
      color?: string;
      lastEditedAt?: number;
      _creationTime: number;
    }[];
  },
});

export const search = query({
  args: {
    orgSlug: v.string(),
    searchQuery: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await getOrganizationBySlug(ctx, args.orgSlug);

    const documents = await ctx.db
      .query('documents')
      .withSearchIndex('search_title', q =>
        q.search('title', args.searchQuery).eq('organizationId', org._id),
      )
      .take(20);

    const visibleDocs = [];
    for (const doc of documents) {
      if (await canViewDocument(ctx, doc)) {
        visibleDocs.push(doc);
      }
    }

    return visibleDocs.map(doc => ({
      _id: doc._id,
      title: doc.title,
      teamId: doc.teamId,
      projectId: doc.projectId,
      _creationTime: doc._creationTime,
    }));
  },
});
