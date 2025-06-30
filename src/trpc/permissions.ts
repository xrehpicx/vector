import { TRPCError } from "@trpc/server";
import { db } from "@/db";
import {
  projectMember as projectMemberTable,
  issue as issueTable,
  issueAssignee as assignmentTable,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { Context, ProtectedContext } from "@/trpc/init";

/**
 * Throws UNAUTHORIZED if the requester is not logged in.
 * @deprecated Use protectedProcedure instead which automatically ensures authentication
 */
export function assertAuthenticated(ctx: Context): asserts ctx is Context & {
  session: { user: { id: string; role: string } };
} {
  if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" });
}

export function assertAdmin(ctx: ProtectedContext) {
  if (ctx.session.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin role required" });
  }
}

export async function assertProjectLeadOrAdmin(
  ctx: ProtectedContext,
  projectId: string,
) {
  if (ctx.session.user.role === "admin") return;

  const rows = await db
    .select({ role: projectMemberTable.role })
    .from(projectMemberTable)
    .where(
      and(
        eq(projectMemberTable.projectId, projectId),
        eq(projectMemberTable.userId, ctx.session.user.id),
      ),
    )
    .limit(1);

  if (rows.length === 0 || rows[0].role !== "lead") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Lead role required" });
  }
}

export async function assertAssigneeOrLeadOrAdmin(
  ctx: ProtectedContext,
  issueId: string,
) {
  if (ctx.session.user.role === "admin") return;

  // Check if user is assignee on this issue via assignment table
  const assignmentRows = await db
    .select({ id: assignmentTable.id })
    .from(assignmentTable)
    .where(
      and(
        eq(assignmentTable.issueId, issueId),
        eq(assignmentTable.assigneeId, ctx.session.user.id),
      ),
    )
    .limit(1);

  if (assignmentRows.length > 0) return; // is assignee

  // Fall back to lead/admin via project membership
  const issueRows = await db
    .select({ projectId: issueTable.projectId })
    .from(issueTable)
    .where(eq(issueTable.id, issueId))
    .limit(1);

  if (issueRows.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  const projectId = issueRows[0].projectId;
  if (projectId) {
    await assertProjectLeadOrAdmin(ctx, projectId);
    return;
  }

  throw new TRPCError({ code: "FORBIDDEN" });
}
