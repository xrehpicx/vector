import { db } from "@/db";
import {
  member,
  organization,
  project,
  issue,
  team,
  invitation,
  user,
  type NonOwnerMemberRole,
  issueState,
  issuePriority,
  issueAssignee,
} from "@/db/schema";
import { eq, and, count, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { randomUUID } from "crypto";
import { env } from "@/env";
import { notify } from "@/notifications/core";

export class OrganizationService {
  /**
   * Verify user has access to organization and get organization details
   */
  static async verifyUserOrganizationAccess(userId: string, orgSlug: string) {
    // Fetch the membership row (if any)
    const orgMembership = await db
      .select({
        organizationId: member.organizationId,
        role: member.role,
        organizationName: organization.name,
        organizationSlug: organization.slug,
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(and(eq(member.userId, userId), eq(organization.slug, orgSlug)))
      .limit(1);

    if (orgMembership.length === 0) {
      return null;
    }

    const membership = orgMembership[0];

    // Auto-promote the very first member to OWNER if no owner exists yet.
    if (membership.role !== "owner") {
      // Check if the organisation already has an owner.
      const ownerCountRes = await db
        .select({ count: count() })
        .from(member)
        .where(
          and(
            eq(member.organizationId, membership.organizationId),
            eq(member.role, "owner"),
          ),
        );

      const ownerCount = ownerCountRes[0]?.count ?? 0;

      if (ownerCount === 0) {
        // Promote current user to owner.
        await db
          .update(member)
          .set({ role: "owner" })
          .where(
            and(
              eq(member.organizationId, membership.organizationId),
              eq(member.userId, userId),
            ),
          );

        // Reflect change locally
        membership.role = "owner";
      }
    }

    return membership;
  }

  /**
   * Get organization dashboard stats
   */
  static async getOrganizationStats(orgSlug: string) {
    // Resolve slug to organization id first
    const orgRow = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, orgSlug))
      .limit(1);

    const orgId = orgRow[0]?.id;
    if (!orgId) {
      return { projectCount: 0, issueCount: 0, memberCount: 0 } as const;
    }

    const [projectStats, issueStats, memberStats] = await Promise.all([
      // Project count
      db
        .select({ count: count() })
        .from(project)
        .where(eq(project.organizationId, orgId)),

      // Issue stats
      db
        .select({
          total: count(),
        })
        .from(issue)
        .innerJoin(project, eq(issue.projectId, project.id))
        .where(eq(project.organizationId, orgId)),

      // Member count
      db
        .select({ count: count() })
        .from(member)
        .where(eq(member.organizationId, orgId)),
    ]);

    return {
      projectCount: projectStats[0]?.count || 0,
      issueCount: issueStats[0]?.total || 0,
      memberCount: memberStats[0]?.count || 0,
    };
  }

  /**
   * Get recent projects for organization
   */
  static async getRecentProjects(orgSlug: string, limit = 5) {
    const orgRow = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, orgSlug))
      .limit(1);

    const orgId = orgRow[0]?.id;
    if (!orgId) return [];

    const leadUser = alias(user, "leadUser");
    const { projectStatus } = await import("@/db/schema/projects");

    return await db
      .select({
        id: project.id,
        key: project.key,
        name: project.name,
        description: project.description,
        updatedAt: project.updatedAt,
        createdAt: project.createdAt,
        startDate: project.startDate,
        dueDate: project.dueDate,
        // Status details
        statusId: project.statusId,
        statusName: projectStatus.name,
        statusColor: projectStatus.color,
        statusIcon: projectStatus.icon,
        statusType: projectStatus.type,
        // Team details
        teamId: project.teamId,
        teamName: team.name,
        teamKey: team.key,
        // Lead details
        leadId: project.leadId,
        leadName: leadUser.name,
        leadEmail: leadUser.email,
      })
      .from(project)
      .leftJoin(projectStatus, eq(project.statusId, projectStatus.id))
      .leftJoin(team, eq(project.teamId, team.id))
      .leftJoin(leadUser, eq(project.leadId, leadUser.id))
      .where(eq(project.organizationId, orgId))
      .orderBy(desc(project.updatedAt))
      .limit(limit);
  }

  /**
   * Get recent issues for organization
   */
  static async getRecentIssues(orgSlug: string, limit = 5) {
    const orgRow = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, orgSlug))
      .limit(1);

    const orgId = orgRow[0]?.id;
    if (!orgId) return [];

    const assigneeUser = alias(user, "assigneeUser");
    const reporterUser = alias(user, "reporterUser");
    const assignment = alias(issueAssignee, "assignment");

    return await db
      .select({
        id: issue.id,
        key: issue.key,
        title: issue.title,
        stateId: assignment.stateId,
        priorityId: issue.priorityId,
        projectName: project.name,
        projectKey: project.key,
        teamName: team.name,
        teamKey: team.key,
        updatedAt: issue.updatedAt,
        sequenceNumber: issue.sequenceNumber,
        assigneeId: assignment.assigneeId,
        assigneeName: assigneeUser.name,
        assigneeEmail: assigneeUser.email,
        reporterName: reporterUser.name,
        // State details
        stateName: issueState.name,
        stateColor: issueState.color,
        stateIcon: issueState.icon,
        stateType: issueState.type,
        // Priority details
        priorityName: issuePriority.name,
        priorityWeight: issuePriority.weight,
        priorityColor: issuePriority.color,
        priorityIcon: issuePriority.icon,
      })
      .from(issue)
      .leftJoin(assignment, eq(issue.id, assignment.issueId))
      .leftJoin(project, eq(issue.projectId, project.id))
      .leftJoin(team, eq(issue.teamId, team.id))
      .leftJoin(issueState, eq(assignment.stateId, issueState.id))
      .leftJoin(issuePriority, eq(issue.priorityId, issuePriority.id))
      .leftJoin(assigneeUser, eq(assignment.assigneeId, assigneeUser.id))
      .leftJoin(reporterUser, eq(issue.reporterId, reporterUser.id))
      .where(eq(issue.organizationId, orgId))
      .orderBy(desc(issue.updatedAt))
      .limit(limit);
  }

  /**
   * Get all teams in organization
   */
  static async getOrganizationTeams(orgSlug: string) {
    const orgRow = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, orgSlug))
      .limit(1);

    const orgId = orgRow[0]?.id;
    if (!orgId) return [];

    return await db
      .select({
        id: team.id,
        name: team.name,
        description: team.description,
        key: team.key,
        icon: team.icon,
        color: team.color,
        createdAt: team.createdAt,
      })
      .from(team)
      .where(eq(team.organizationId, orgId))
      .orderBy(desc(team.createdAt));
  }

  /**
   * Update organization name and/or slug.
   * Pass in the organization id (UUID) directly for fast lookup.
   * Returns updated row.
   */
  static async updateOrganization(
    orgId: string,
    data: { name?: string; slug?: string },
  ) {
    if (!data.name && !data.slug) return;

    // If slug is being changed → ensure uniqueness
    if (data.slug) {
      const existingSlug = await db
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.slug, data.slug))
        .limit(1);

      if (existingSlug.length > 0 && existingSlug[0].id !== orgId) {
        throw new Error("Slug already in use");
      }
    }

    await db
      .update(organization)
      .set({
        ...(data.name ? { name: data.name } : {}),
        ...(data.slug ? { slug: data.slug } : {}),
      })
      .where(eq(organization.id, orgId));

    const updated = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      })
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1);
    return updated[0];
  }

  static async getUserOrganizations(userId: string) {
    return await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(eq(member.userId, userId));
  }

  // ------------------------------------------------------------------
  // Members & Invitations
  // ------------------------------------------------------------------

  /** List all members of organization */
  static async listMembers(orgId: string) {
    return await db
      .select({
        userId: member.userId,
        name: user.name,
        email: user.email,
        role: member.role,
        joinedAt: member.createdAt,
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(eq(member.organizationId, orgId))
      .orderBy(member.createdAt);
  }

  /** Invite a member (owner/admin only) */
  static async inviteMember(
    orgId: string,
    email: string,
    role: NonOwnerMemberRole,
    inviterId: string,
  ) {
    const token = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7); // 7 days

    await db.insert(invitation).values({
      id: token,
      organizationId: orgId,
      email,
      role,
      status: "pending",
      inviterId,
      expiresAt,
      createdAt: now,
    });

    // Dispatch notification (email by default).
    const inviterName =
      (
        await db
          .select({ name: user.name })
          .from(user)
          .where(eq(user.id, inviterId))
      )[0]?.name ?? "Someone";

    await notify(
      "organization.invite",
      {
        inviterName,
        inviteLink: `${env.APP_URL}/invite/${token}`,
      },
      {
        email: { to: email },
      },
    );

    return { token } as const;
  }

  /** Accept an invitation given token and userId */
  static async acceptInvitation(token: string, userId: string) {
    const rows = await db
      .select()
      .from(invitation)
      .where(eq(invitation.id, token))
      .limit(1);
    if (rows.length === 0) throw new Error("Invalid invitation token");
    const invite = rows[0];
    if (invite.status !== "pending") throw new Error("Invitation already used");
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      throw new Error("Invitation expired");
    }

    // Add membership
    await db.transaction(async (tx) => {
      await tx.insert(member).values({
        id: randomUUID(),
        organizationId: invite.organizationId,
        userId,
        role: invite.role ?? "member",
        createdAt: new Date(),
      });

      await tx
        .update(invitation)
        .set({
          status: "accepted",
          acceptedAt: new Date(),
        })
        .where(eq(invitation.id, token));
    });
  }

  static async revokeInvitation(token: string) {
    await db
      .update(invitation)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(eq(invitation.id, token));
  }

  static async listPendingInvites(orgId: string) {
    return await db
      .select()
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, orgId),
          eq(invitation.status, "pending"),
        ),
      );
  }

  static async updateMemberRole(
    orgId: string,
    userId: string,
    role: NonOwnerMemberRole,
  ) {
    await db
      .update(member)
      .set({ role })
      .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)));
  }

  /**
   * Remove a member from an organization.
   * Safeguard: cannot remove the last remaining member.
   */
  static async removeMember(orgId: string, userId: string) {
    // Count current members
    const countRes = await db
      .select({ cnt: count() })
      .from(member)
      .where(eq(member.organizationId, orgId));

    const memberCount = Number(countRes[0]?.cnt ?? 0);

    if (memberCount <= 1) {
      throw new Error("Cannot remove the last member of the organization");
    }

    await db
      .delete(member)
      .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)));
  }

  static async getIssuesPaged(orgSlug: string, page = 1, pageSize = 25) {
    const orgRow = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, orgSlug))
      .limit(1);
    const orgId = orgRow[0]?.id;
    if (!orgId) return { issues: [], total: 0, counts: {} } as const;

    // Base query assembling issue rows similar to getRecentIssues
    const assigneeUser = alias(user, "assigneeUser");
    const reporterUser = alias(user, "reporterUser");
    const assignment = alias(issueAssignee, "assignment");

    const issues = await db
      .select({
        id: issue.id,
        key: issue.key,
        title: issue.title,
        stateId: assignment.stateId,
        priorityId: issue.priorityId,
        projectName: project.name,
        projectKey: project.key,
        teamName: team.name,
        teamKey: team.key,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        sequenceNumber: issue.sequenceNumber,
        assigneeId: assignment.assigneeId,
        assigneeName: assigneeUser.name,
        assigneeEmail: assigneeUser.email,
        reporterName: reporterUser.name,
        // State details
        stateName: issueState.name,
        stateColor: issueState.color,
        stateIcon: issueState.icon,
        stateType: issueState.type,
        // Priority details
        priorityName: issuePriority.name,
        priorityWeight: issuePriority.weight,
        priorityColor: issuePriority.color,
        priorityIcon: issuePriority.icon,
      })
      .from(issue)
      .leftJoin(assignment, eq(issue.id, assignment.issueId))
      .leftJoin(project, eq(issue.projectId, project.id))
      .leftJoin(team, eq(issue.teamId, team.id))
      .leftJoin(issueState, eq(assignment.stateId, issueState.id))
      .leftJoin(issuePriority, eq(issue.priorityId, issuePriority.id))
      .leftJoin(assigneeUser, eq(assignment.assigneeId, assigneeUser.id))
      .leftJoin(reporterUser, eq(issue.reporterId, reporterUser.id))
      .where(eq(issue.organizationId, orgId))
      .orderBy(desc(issue.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    // total count
    const totalRows = await db
      .select({ cnt: count() })
      .from(issue)
      .where(eq(issue.organizationId, orgId));

    const total = totalRows[0]?.cnt ?? 0;

    // counts by state type
    const countsRows = await db
      .select({ type: issueState.type, cnt: count() })
      .from(issue)
      .leftJoin(assignment, eq(issue.id, assignment.issueId))
      .leftJoin(issueState, eq(assignment.stateId, issueState.id))
      .where(eq(issue.organizationId, orgId))
      .groupBy(issueState.type);

    const counts: Record<string, number> = {};
    countsRows.forEach((r) => {
      counts[r.type as unknown as string] = Number(r.cnt);
    });

    return { issues, total, counts } as const;
  }

  /**
   * Paginated projects list with counts grouped by status type (mirrors getIssuesPaged)
   */
  static async getProjectsPaged(orgSlug: string, page = 1, pageSize = 25) {
    const orgRow = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, orgSlug))
      .limit(1);

    const orgId = orgRow[0]?.id;
    if (!orgId) return { projects: [], total: 0, counts: {} } as const;

    const leadUser = alias(user, "leadUser");
    const { projectStatus } = await import("@/db/schema/projects");

    // Main paged query
    const projectsRows = await db
      .select({
        id: project.id,
        key: project.key,
        name: project.name,
        description: project.description,
        updatedAt: project.updatedAt,
        createdAt: project.createdAt,
        startDate: project.startDate,
        dueDate: project.dueDate,
        // Status details
        statusId: project.statusId,
        statusName: projectStatus.name,
        statusColor: projectStatus.color,
        statusIcon: projectStatus.icon,
        statusType: projectStatus.type,
        // Team details
        teamId: project.teamId,
        teamName: team.name,
        teamKey: team.key,
        // Lead details
        leadId: project.leadId,
        leadName: leadUser.name,
        leadEmail: leadUser.email,
      })
      .from(project)
      .leftJoin(projectStatus, eq(project.statusId, projectStatus.id))
      .leftJoin(team, eq(project.teamId, team.id))
      .leftJoin(leadUser, eq(project.leadId, leadUser.id))
      .where(eq(project.organizationId, orgId))
      .orderBy(desc(project.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    // Total count of projects in org
    const totalRows = await db
      .select({ cnt: count() })
      .from(project)
      .where(eq(project.organizationId, orgId));

    const total = totalRows[0]?.cnt ?? 0;

    // Counts by statusType
    const countsRows = await db
      .select({ type: projectStatus.type, cnt: count() })
      .from(project)
      .leftJoin(projectStatus, eq(project.statusId, projectStatus.id))
      .where(eq(project.organizationId, orgId))
      .groupBy(projectStatus.type);

    const counts: Record<string, number> = {};
    countsRows.forEach((r) => {
      counts[r.type as unknown as string] = Number(r.cnt);
    });

    return { projects: projectsRows, total, counts } as const;
  }

  /**
   * Paginated teams list (mirrors structure of getProjectsPaged but simpler)
   */
  static async getTeamsPaged(orgSlug: string, page = 1, pageSize = 25) {
    // Resolve slug → organization id
    const orgRow = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, orgSlug))
      .limit(1);

    const orgId = orgRow[0]?.id;
    if (!orgId) return { teams: [], total: 0 } as const;

    // Main paged query – ordered by newest first (createdAt desc)
    const teamsRows = await db
      .select({
        id: team.id,
        name: team.name,
        description: team.description,
        key: team.key,
        icon: team.icon,
        color: team.color,
        createdAt: team.createdAt,
      })
      .from(team)
      .where(eq(team.organizationId, orgId))
      .orderBy(desc(team.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    // Total count for pagination controls
    const totalRows = await db
      .select({ cnt: count() })
      .from(team)
      .where(eq(team.organizationId, orgId));

    const total = totalRows[0]?.cnt ?? 0;

    return { teams: teamsRows, total } as const;
  }

  /**
   * Get all assignments for a specific issue with user and state details
   */
  static async getIssueAssignments(issueId: string) {
    const assigneeUser = alias(user, "assigneeUser");

    return await db
      .select({
        id: issueAssignee.id,
        issueId: issueAssignee.issueId,
        assigneeId: issueAssignee.assigneeId,
        assigneeName: assigneeUser.name,
        assigneeEmail: assigneeUser.email,
        stateId: issueAssignee.stateId,
        stateName: issueState.name,
        stateColor: issueState.color,
        stateIcon: issueState.icon,
        stateType: issueState.type,
        createdAt: issueAssignee.createdAt,
        updatedAt: issueAssignee.updatedAt,
      })
      .from(issueAssignee)
      .leftJoin(assigneeUser, eq(issueAssignee.assigneeId, assigneeUser.id))
      .leftJoin(issueState, eq(issueAssignee.stateId, issueState.id))
      .where(eq(issueAssignee.issueId, issueId))
      .orderBy(issueAssignee.createdAt);
  }
}
