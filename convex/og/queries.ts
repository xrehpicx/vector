/**
 * Public OG metadata queries — no authentication required.
 * Only returns data for entities with visibility === 'public'.
 */
import { query } from '../_generated/server';
import { v } from 'convex/values';
import type { Id } from '../_generated/dataModel';

export const getPublicIssue = query({
  args: {
    orgSlug: v.string(),
    issueKey: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.orgSlug))
      .first();
    if (!org) return null;

    const issue = await ctx.db
      .query('issues')
      .withIndex('by_org_key', q =>
        q.eq('organizationId', org._id).eq('key', args.issueKey),
      )
      .first();
    if (!issue) return null;

    if (issue.visibility !== 'public') {
      return {
        key: issue.key,
        title: null,
        orgName: org.name,
        orgSlug: org.slug,
        state: null,
        priority: null,
        project: null,
      };
    }

    const state = issue.workflowStateId
      ? await ctx.db.get('issueStates', issue.workflowStateId)
      : null;
    const priority = issue.priorityId
      ? await ctx.db.get('issuePriorities', issue.priorityId)
      : null;
    const project = issue.projectId
      ? await ctx.db.get('projects', issue.projectId)
      : null;

    return {
      key: issue.key,
      title: issue.title,
      orgName: org.name,
      orgSlug: org.slug,
      state: state
        ? { name: state.name, color: state.color, type: state.type }
        : null,
      priority: priority
        ? { name: priority.name, color: priority.color }
        : null,
      project: project ? { name: project.name, key: project.key } : null,
    };
  },
});

export const getPublicProject = query({
  args: {
    orgSlug: v.string(),
    projectKey: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.orgSlug))
      .first();
    if (!org) return null;

    const project = await ctx.db
      .query('projects')
      .withIndex('by_org_key', q =>
        q.eq('organizationId', org._id).eq('key', args.projectKey),
      )
      .first();
    if (!project || project.visibility !== 'public') return null;

    const status = project.statusId
      ? await ctx.db.get('projectStatuses', project.statusId)
      : null;

    const issueCount = (
      await ctx.db
        .query('issues')
        .withIndex('by_project', q => q.eq('projectId', project._id))
        .collect()
    ).filter(issue => issue.visibility === 'public').length;

    return {
      key: project.key,
      name: project.name,
      description: project.description ?? null,
      orgName: org.name,
      orgSlug: org.slug,
      status: status
        ? { name: status.name, color: status.color, type: status.type }
        : null,
      issueCount,
    };
  },
});

export const getPublicTeam = query({
  args: {
    orgSlug: v.string(),
    teamKey: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.orgSlug))
      .first();
    if (!org) return null;

    const team = await ctx.db
      .query('teams')
      .withIndex('by_org_key', q =>
        q.eq('organizationId', org._id).eq('key', args.teamKey),
      )
      .first();
    if (!team || team.visibility !== 'public') return null;

    const memberCount = (
      await ctx.db
        .query('teamMembers')
        .withIndex('by_team', q => q.eq('teamId', team._id))
        .collect()
    ).length;

    return {
      key: team.key,
      name: team.name,
      description: team.description ?? null,
      orgName: org.name,
      orgSlug: org.slug,
      icon: team.icon ?? null,
      color: team.color ?? null,
      memberCount,
    };
  },
});

// ─── Rich public pages (for /public routes) ─────────────────────────────

export const getPublicIssueFull = query({
  args: {
    orgSlug: v.string(),
    issueKey: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.orgSlug))
      .first();
    if (!org) return null;

    const issue = await ctx.db
      .query('issues')
      .withIndex('by_org_key', q =>
        q.eq('organizationId', org._id).eq('key', args.issueKey),
      )
      .first();
    if (!issue || issue.visibility !== 'public') return null;

    const [state, priority, project, team] = await Promise.all([
      issue.workflowStateId
        ? ctx.db.get('issueStates', issue.workflowStateId)
        : null,
      issue.priorityId ? ctx.db.get('issuePriorities', issue.priorityId) : null,
      issue.projectId ? ctx.db.get('projects', issue.projectId) : null,
      issue.teamId ? ctx.db.get('teams', issue.teamId) : null,
    ]);

    // Load assignees
    const assignments = await ctx.db
      .query('issueAssignees')
      .withIndex('by_issue', q => q.eq('issueId', issue._id))
      .collect();
    const assigneeIds = assignments
      .map(a => a.assigneeId)
      .filter((id): id is Id<'users'> => !!id);
    const assigneeUsers = await Promise.all(
      assigneeIds.map(id => ctx.db.get('users', id)),
    );

    // Load labels
    const labelAssignments = await ctx.db
      .query('issueLabelAssignments')
      .withIndex('by_issue', q => q.eq('issueId', issue._id))
      .collect();
    const labels = await Promise.all(
      labelAssignments.map(la => ctx.db.get('issueLabels', la.labelId)),
    );

    // Load sub-issues (public ones only)
    const childIssues = await ctx.db
      .query('issues')
      .withIndex('by_parent', q => q.eq('parentIssueId', issue._id))
      .collect();
    const publicChildren = childIssues.filter(c => c.visibility === 'public');
    const childStates = await Promise.all(
      publicChildren.map(c =>
        c.workflowStateId ? ctx.db.get('issueStates', c.workflowStateId) : null,
      ),
    );

    return {
      key: issue.key,
      title: issue.title,
      description: issue.description ?? null,
      orgName: org.name,
      orgSlug: org.slug,
      startDate: issue.startDate ?? null,
      dueDate: issue.dueDate ?? null,
      createdAt: issue._creationTime,
      state: state
        ? {
            name: state.name,
            color: state.color ?? null,
            type: state.type,
            icon: state.icon ?? null,
          }
        : null,
      priority: priority
        ? {
            name: priority.name,
            color: priority.color ?? null,
            icon: priority.icon ?? null,
          }
        : null,
      project: project ? { name: project.name, key: project.key } : null,
      team: team
        ? {
            name: team.name,
            key: team.key,
            icon: team.icon ?? null,
            color: team.color ?? null,
          }
        : null,
      assignees: assigneeUsers
        .filter((u): u is NonNullable<typeof u> => !!u)
        .map(u => ({
          name: u.name ?? u.email ?? 'Unknown',
          image: u.image ?? null,
        })),
      labels: labels
        .filter((l): l is NonNullable<typeof l> => !!l)
        .map(l => ({ name: l.name, color: l.color ?? null })),
      subIssues: publicChildren.map((c, i) => ({
        key: c.key,
        title: c.title,
        state: childStates[i]
          ? {
              name: childStates[i]!.name,
              color: childStates[i]!.color ?? null,
              type: childStates[i]!.type,
              icon: childStates[i]!.icon ?? null,
            }
          : null,
      })),
    };
  },
});

export const getPublicProjectFull = query({
  args: {
    orgSlug: v.string(),
    projectKey: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.orgSlug))
      .first();
    if (!org) return null;

    const project = await ctx.db
      .query('projects')
      .withIndex('by_org_key', q =>
        q.eq('organizationId', org._id).eq('key', args.projectKey),
      )
      .first();
    if (!project || project.visibility !== 'public') return null;

    const [status, team, lead] = await Promise.all([
      project.statusId ? ctx.db.get('projectStatuses', project.statusId) : null,
      project.teamId ? ctx.db.get('teams', project.teamId) : null,
      project.leadId ? ctx.db.get('users', project.leadId) : null,
    ]);

    // Get public issues for this project
    const allIssues = await ctx.db
      .query('issues')
      .withIndex('by_project', q => q.eq('projectId', project._id))
      .collect();

    // Show all issues — full detail for public, limited for others
    const [issueStates, issuePriorities] = await Promise.all([
      Promise.all(
        allIssues.map(i =>
          i.workflowStateId
            ? ctx.db.get('issueStates', i.workflowStateId)
            : null,
        ),
      ),
      Promise.all(
        allIssues.map(i =>
          i.priorityId ? ctx.db.get('issuePriorities', i.priorityId) : null,
        ),
      ),
    ]);

    const issues = allIssues.map((issue, idx) => {
      const isPublic = issue.visibility === 'public';
      const s = issueStates[idx];
      const priority = issuePriorities[idx];
      return {
        _id: issue._id,
        key: issue.key,
        title: issue.title,
        isPublic,
        description: isPublic ? (issue.description ?? null) : null,
        status: s
          ? {
              name: s.name,
              color: s.color ?? null,
              type: s.type,
              icon: s.icon ?? null,
            }
          : null,
        priority:
          isPublic && priority
            ? {
                name: priority.name,
                color: priority.color ?? null,
                icon: priority.icon ?? null,
              }
            : null,
      };
    });

    return {
      key: project.key,
      name: project.name,
      description: project.description ?? null,
      orgName: org.name,
      orgSlug: org.slug,
      startDate: project.startDate ?? null,
      dueDate: project.dueDate ?? null,
      status: status
        ? {
            name: status.name,
            color: status.color ?? null,
            type: status.type,
            icon: status.icon ?? null,
          }
        : null,
      team: team
        ? {
            name: team.name,
            key: team.key,
            icon: team.icon ?? null,
            color: team.color ?? null,
          }
        : null,
      lead: lead
        ? {
            name: lead.name ?? lead.email ?? 'Unknown',
            image: lead.image ?? null,
          }
        : null,
      issues,
      totalIssues: allIssues.length,
      publicIssueCount: allIssues.filter(i => i.visibility === 'public').length,
    };
  },
});

export const getPublicTeamFull = query({
  args: {
    orgSlug: v.string(),
    teamKey: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.orgSlug))
      .first();
    if (!org) return null;

    const team = await ctx.db
      .query('teams')
      .withIndex('by_org_key', q =>
        q.eq('organizationId', org._id).eq('key', args.teamKey),
      )
      .first();
    if (!team || team.visibility !== 'public') return null;

    const [lead, members] = await Promise.all([
      team.leadId ? ctx.db.get('users', team.leadId) : null,
      ctx.db
        .query('teamMembers')
        .withIndex('by_team', q => q.eq('teamId', team._id))
        .collect(),
    ]);

    // Get projects linked to this team
    const projects = await ctx.db
      .query('projects')
      .withIndex('by_team', q => q.eq('teamId', team._id))
      .collect();
    const publicProjects = projects.filter(p => p.visibility === 'public');
    const projectStatuses = await Promise.all(
      publicProjects.map(p =>
        p.statusId ? ctx.db.get('projectStatuses', p.statusId) : null,
      ),
    );

    // Get public issues for this team
    const allIssues = await ctx.db
      .query('issues')
      .withIndex('by_team', q => q.eq('teamId', team._id))
      .collect();
    const [issueStates, issuePriorities] = await Promise.all([
      Promise.all(
        allIssues.map(i =>
          i.workflowStateId
            ? ctx.db.get('issueStates', i.workflowStateId)
            : null,
        ),
      ),
      Promise.all(
        allIssues.map(i =>
          i.priorityId ? ctx.db.get('issuePriorities', i.priorityId) : null,
        ),
      ),
    ]);

    const issues = allIssues.map((issue, idx) => {
      const isPublic = issue.visibility === 'public';
      const s = issueStates[idx];
      const priority = issuePriorities[idx];
      return {
        _id: issue._id,
        key: issue.key,
        title: issue.title,
        isPublic,
        description: isPublic ? (issue.description ?? null) : null,
        status: s
          ? {
              name: s.name,
              color: s.color ?? null,
              type: s.type,
              icon: s.icon ?? null,
            }
          : null,
        priority:
          isPublic && priority
            ? {
                name: priority.name,
                color: priority.color ?? null,
                icon: priority.icon ?? null,
              }
            : null,
      };
    });

    return {
      key: team.key,
      name: team.name,
      description: team.description ?? null,
      icon: team.icon ?? null,
      color: team.color ?? null,
      orgName: org.name,
      orgSlug: org.slug,
      memberCount: members.length,
      lead: lead
        ? {
            name: lead.name ?? lead.email ?? 'Unknown',
            image: lead.image ?? null,
          }
        : null,
      projects: publicProjects.map((p, i) => ({
        key: p.key,
        name: p.name,
        status: projectStatuses[i]
          ? {
              name: projectStatuses[i]!.name,
              color: projectStatuses[i]!.color ?? null,
              icon: projectStatuses[i]!.icon ?? null,
            }
          : null,
      })),
      issues,
      totalIssues: allIssues.length,
    };
  },
});

export const getPublicDocument = query({
  args: {
    orgSlug: v.string(),
    documentId: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.orgSlug))
      .first();
    if (!org) return null;

    let doc;
    try {
      doc = await ctx.db.get('documents', args.documentId as Id<'documents'>);
    } catch {
      return null;
    }
    if (!doc || doc.organizationId !== org._id || doc.visibility !== 'public')
      return null;

    const author = doc.createdBy
      ? await ctx.db.get('users', doc.createdBy)
      : null;

    return {
      title: doc.title,
      orgName: org.name,
      orgSlug: org.slug,
      icon: doc.icon ?? null,
      color: doc.color ?? null,
      author: author ? { name: author.name ?? author.email } : null,
    };
  },
});

export const getPublicDocumentFull = query({
  args: {
    orgSlug: v.string(),
    documentId: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.orgSlug))
      .first();
    if (!org) return null;

    let doc;
    try {
      doc = await ctx.db.get('documents', args.documentId as Id<'documents'>);
    } catch {
      return null;
    }
    if (!doc || doc.organizationId !== org._id || doc.visibility !== 'public') {
      return null;
    }

    const [author, lastEditor, team, project] = await Promise.all([
      ctx.db.get('users', doc.createdBy),
      doc.lastEditedBy ? ctx.db.get('users', doc.lastEditedBy) : null,
      doc.teamId ? ctx.db.get('teams', doc.teamId) : null,
      doc.projectId ? ctx.db.get('projects', doc.projectId) : null,
    ]);

    return {
      _id: doc._id,
      title: doc.title,
      content: doc.content ?? '',
      orgName: org.name,
      orgSlug: org.slug,
      icon: doc.icon ?? null,
      color: doc.color ?? null,
      createdAt: doc._creationTime,
      lastEditedAt: doc.lastEditedAt ?? null,
      author: author
        ? {
            name: author.name ?? author.email ?? 'Unknown',
            email: author.email ?? null,
            image: author.image ?? null,
            userId: author._id,
          }
        : null,
      lastEditor: lastEditor
        ? {
            name: lastEditor.name ?? lastEditor.email ?? 'Unknown',
            email: lastEditor.email ?? null,
            image: lastEditor.image ?? null,
            userId: lastEditor._id,
          }
        : null,
      team: team
        ? {
            name: team.name,
            key: team.key,
            icon: team.icon ?? null,
            color: team.color ?? null,
          }
        : null,
      project: project
        ? {
            name: project.name,
            key: project.key,
            icon: project.icon ?? null,
            color: project.color ?? null,
          }
        : null,
    };
  },
});
