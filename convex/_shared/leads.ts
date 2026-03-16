import { ConvexError } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { syncProjectRoleAssignment, syncTeamRoleAssignment } from '../roles';

type ConvexCtx = QueryCtx | MutationCtx;

type LeadLikeMember = {
  userId: Id<'users'>;
  role?: string | null;
  joinedAt?: number;
  _creationTime: number;
};

export function getLeadMembershipFromMembers<T extends LeadLikeMember>(
  members: readonly T[],
): T | null {
  const leadMembers = members
    .filter(member => member.role === 'lead')
    .sort((a, b) => {
      const joinedAtA = a.joinedAt ?? a._creationTime;
      const joinedAtB = b.joinedAt ?? b._creationTime;
      if (joinedAtA !== joinedAtB) {
        return joinedAtA - joinedAtB;
      }
      return a._creationTime - b._creationTime;
    });

  return leadMembers[0] ?? null;
}

export async function getTeamLeadSummary(
  ctx: ConvexCtx,
  team: Doc<'teams'>,
  members?: Doc<'teamMembers'>[],
) {
  const teamMembers =
    members ??
    (await ctx.db
      .query('teamMembers')
      .withIndex('by_team', q => q.eq('teamId', team._id))
      .collect());

  const leadMembership = getLeadMembershipFromMembers(teamMembers);
  const leadId = leadMembership?.userId ?? team.leadId;
  const lead = leadId ? await ctx.db.get('users', leadId) : null;

  return {
    leadId,
    lead,
    leadMembership,
    members: teamMembers,
  };
}

export async function getProjectLeadSummary(
  ctx: ConvexCtx,
  project: Doc<'projects'>,
  members?: Doc<'projectMembers'>[],
) {
  const projectMembers =
    members ??
    (await ctx.db
      .query('projectMembers')
      .withIndex('by_project', q => q.eq('projectId', project._id))
      .collect());

  const leadMembership = getLeadMembershipFromMembers(projectMembers);
  const leadId = leadMembership?.userId ?? project.leadId;
  const lead = leadId ? await ctx.db.get('users', leadId) : null;

  return {
    leadId,
    lead,
    leadMembership,
    members: projectMembers,
  };
}

export async function setTeamLeadMemberRole(
  ctx: MutationCtx,
  team: Doc<'teams'>,
  leadId: Id<'users'> | null,
) {
  const members = await ctx.db
    .query('teamMembers')
    .withIndex('by_team', q => q.eq('teamId', team._id))
    .collect();
  const currentLeadMembers = members.filter(member => member.role === 'lead');
  const previousLeadId =
    getLeadMembershipFromMembers(currentLeadMembers)?.userId ?? team.leadId;

  let nextLeadMembership =
    leadId === null
      ? null
      : (members.find(member => member.userId === leadId) ?? null);

  if (leadId && !nextLeadMembership) {
    const membershipId = await ctx.db.insert('teamMembers', {
      teamId: team._id,
      userId: leadId,
      role: 'lead',
      joinedAt: Date.now(),
    });
    nextLeadMembership = await ctx.db.get('teamMembers', membershipId);
    if (!nextLeadMembership) {
      throw new ConvexError('TEAM_MEMBERSHIP_NOT_FOUND');
    }
  } else if (nextLeadMembership && nextLeadMembership.role !== 'lead') {
    await ctx.db.patch('teamMembers', nextLeadMembership._id, {
      role: 'lead',
    });
  }

  if (leadId) {
    await syncTeamRoleAssignment(ctx, team._id, leadId, 'lead');
  }

  if (team.leadId !== leadId) {
    await ctx.db.patch('teams', team._id, {
      leadId: leadId ?? undefined,
    });
  }

  for (const member of currentLeadMembers) {
    if (member.userId === leadId) {
      continue;
    }
    await ctx.db.patch('teamMembers', member._id, { role: 'member' });
    await syncTeamRoleAssignment(ctx, team._id, member.userId, 'member');
  }

  return {
    previousLeadId,
    nextLeadId: leadId ?? undefined,
  };
}

export async function setProjectLeadMemberRole(
  ctx: MutationCtx,
  project: Doc<'projects'>,
  leadId: Id<'users'> | null,
) {
  const members = await ctx.db
    .query('projectMembers')
    .withIndex('by_project', q => q.eq('projectId', project._id))
    .collect();
  const currentLeadMembers = members.filter(member => member.role === 'lead');
  const previousLeadId =
    getLeadMembershipFromMembers(currentLeadMembers)?.userId ?? project.leadId;

  let nextLeadMembership =
    leadId === null
      ? null
      : (members.find(member => member.userId === leadId) ?? null);

  if (leadId && !nextLeadMembership) {
    const membershipId = await ctx.db.insert('projectMembers', {
      projectId: project._id,
      userId: leadId,
      role: 'lead',
      joinedAt: Date.now(),
    });
    nextLeadMembership = await ctx.db.get('projectMembers', membershipId);
    if (!nextLeadMembership) {
      throw new ConvexError('PROJECT_MEMBERSHIP_NOT_FOUND');
    }
  } else if (nextLeadMembership && nextLeadMembership.role !== 'lead') {
    await ctx.db.patch('projectMembers', nextLeadMembership._id, {
      role: 'lead',
    });
  }

  if (leadId) {
    await syncProjectRoleAssignment(ctx, project._id, leadId, 'lead');
  }

  if (project.leadId !== leadId) {
    await ctx.db.patch('projects', project._id, {
      leadId: leadId ?? undefined,
    });
  }

  for (const member of currentLeadMembers) {
    if (member.userId === leadId) {
      continue;
    }
    await ctx.db.patch('projectMembers', member._id, { role: 'member' });
    await syncProjectRoleAssignment(ctx, project._id, member.userId, 'member');
  }

  return {
    previousLeadId,
    nextLeadId: leadId ?? undefined,
  };
}
