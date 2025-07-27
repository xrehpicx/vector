import { db } from "@/db";
import {
  issueState,
  projectStatus,
  organization,
  issue,
  project as projectTable,
  issuePriority,
  issueStateTypeEnum,
  issueAssignee,
} from "@/db/schema";
import { projectStatusTypeEnum } from "@/db/schema/projects";
import { eq, and, count, InferInsertModel } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface StatePayload {
  name: string;
  position: number;
  color: string;
  icon?: string | null;
  type: string;
}

export interface PriorityPayload {
  name: string;
  weight: number;
  color: string;
  icon?: string | null;
}

// ---------------------------------------------------------------------------
// Default definitions (same semantic mapping used in earlier static UI)
// ---------------------------------------------------------------------------

const ISSUE_STATE_DEFAULTS: StatePayload[] = [
  {
    name: "Backlog",
    position: 0,
    color: "#6b7280",
    type: "backlog",
    icon: "Circle",
  },
  {
    name: "To Do",
    position: 1,
    color: "#3b82f6",
    type: "todo",
    icon: "CircleDot",
  },
  {
    name: "In Progress",
    position: 2,
    color: "#f59e0b",
    type: "in_progress",
    icon: "Loader",
  },
  {
    name: "Done",
    position: 3,
    color: "#10b981",
    type: "done",
    icon: "CheckCircle",
  },
  {
    name: "Canceled",
    position: 4,
    color: "#ef4444",
    type: "canceled",
    icon: "XCircle",
  },
];

const PROJECT_STATUS_DEFAULTS: StatePayload[] = [
  {
    name: "Backlog",
    position: 0,
    color: "#6b7280",
    type: "backlog",
    icon: "Square",
  },
  {
    name: "Planned",
    position: 1,
    color: "#3b82f6",
    type: "planned",
    icon: "CircleDot",
  },
  {
    name: "In Progress",
    position: 2,
    color: "#f59e0b",
    type: "in_progress",
    icon: "Play",
  },
  {
    name: "Completed",
    position: 3,
    color: "#10b981",
    type: "completed",
    icon: "Check",
  },
  {
    name: "Canceled",
    position: 4,
    color: "#ef4444",
    type: "canceled",
    icon: "X",
  },
];

const ISSUE_PRIORITY_DEFAULTS: PriorityPayload[] = [
  {
    name: "No priority",
    weight: 0,
    color: "#94a3b8",
    icon: "Minus",
  },
  { name: "Low", weight: 1, color: "#10b981", icon: "ArrowDown" },
  { name: "Medium", weight: 2, color: "#f59e0b", icon: "ArrowRight" },
  { name: "High", weight: 3, color: "#ef4444", icon: "ArrowUp" },
  { name: "Urgent", weight: 4, color: "#dc2626", icon: "ChevronsUp" },
];

// ---------------------------------------------------------------------------
// Helpers to seed defaults without using any-casts or generic tricks
// ---------------------------------------------------------------------------

type IssueStateInsert = InferInsertModel<typeof issueState>;
async function ensureIssueStateDefaults(orgId: string) {
  const existing = await db
    .select({ type: issueState.type })
    .from(issueState)
    .where(eq(issueState.organizationId, orgId));

  const existingSet = new Set<string>(existing.map((r) => r.type));
  const missing = ISSUE_STATE_DEFAULTS.filter((d) => !existingSet.has(d.type));

  if (missing.length === 0) return;

  const rows: IssueStateInsert[] = missing.map((d) => ({
    id: randomUUID(),
    organizationId: orgId,
    name: d.name,
    position: d.position,
    color: d.color,
    icon: d.icon ?? null,
    type: d.type as IssueStateInsert["type"],
  }));

  await db.insert(issueState).values(rows).onConflictDoNothing();
}

type ProjectStatusInsert = InferInsertModel<typeof projectStatus>;
async function ensureProjectStatusDefaults(orgId: string) {
  const existing = await db
    .select({ type: projectStatus.type })
    .from(projectStatus)
    .where(eq(projectStatus.organizationId, orgId));

  const existingSet = new Set<string>(existing.map((r) => r.type));
  const missing = PROJECT_STATUS_DEFAULTS.filter(
    (d) => !existingSet.has(d.type),
  );

  if (missing.length === 0) return;

  const rows: ProjectStatusInsert[] = missing.map((d) => ({
    id: randomUUID(),
    organizationId: orgId,
    name: d.name,
    position: d.position,
    color: d.color,
    icon: d.icon ?? null,
    type: d.type as ProjectStatusInsert["type"],
  }));

  await db.insert(projectStatus).values(rows).onConflictDoNothing();
}

// Helper: ensure default priorities exist for org
async function ensurePriorityDefaults(
  orgId: string,
  defaults: PriorityPayload[],
) {
  const existingRows = await db
    .select({ weight: issuePriority.weight })
    .from(issuePriority)
    .where(eq(issuePriority.organizationId, orgId));

  const existingWeights = new Set<number>(existingRows.map((r) => r.weight));

  const toInsert = defaults.filter((d) => !existingWeights.has(d.weight));

  if (toInsert.length > 0) {
    const rows: InferInsertModel<typeof issuePriority>[] = toInsert.map(
      (d) => ({
        id: randomUUID(),
        organizationId: orgId,
        name: d.name,
        weight: d.weight,
        color: d.color,
        icon: d.icon ?? null,
      }),
    );

    await db.insert(issuePriority).values(rows).onConflictDoNothing();
  }
}

export class WorkflowService {
  /* -------------------------------------------------------------------------- */
  /*                             Issue State APIs                              */
  /* -------------------------------------------------------------------------- */
  static async listIssueStates(orgSlug: string) {
    // Ensure defaults exist first
    const orgRow = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, orgSlug))
      .limit(1);

    if (!orgRow[0]) return [] as const;

    await WorkflowService.ensureDefaultsForOrg(orgRow[0].id);

    return db
      .select({
        id: issueState.id,
        name: issueState.name,
        position: issueState.position,
        color: issueState.color,
        icon: issueState.icon,
        type: issueState.type,
      })
      .from(issueState)
      .where(eq(issueState.organizationId, orgRow[0].id))
      .orderBy(issueState.position);
  }

  static async createIssueState(orgSlug: string, data: StatePayload) {
    const org = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, orgSlug))
      .limit(1);

    if (!org[0]) throw new Error("Organization not found");

    const id = randomUUID();
    await db.insert(issueState).values({
      id,
      organizationId: org[0].id,
      name: data.name,
      position: data.position,
      color: data.color,
      icon: data.icon,
      type: data.type as (typeof issueStateTypeEnum.enumValues)[number],
    });
    return { id } as const;
  }

  static async updateIssueState(
    stateId: string,
    orgId: string,
    data: Omit<StatePayload, "position"> & { position?: number },
  ) {
    // Ensure the state belongs to the organization first
    const rows = await db
      .select({ id: issueState.id })
      .from(issueState)
      .where(
        and(eq(issueState.id, stateId), eq(issueState.organizationId, orgId)),
      )
      .limit(1);

    if (!rows[0]) throw new Error("FORBIDDEN");

    await db
      .update(issueState)
      .set({
        ...(data.name ? { name: data.name } : {}),
        ...(data.color ? { color: data.color } : {}),
        ...(data.icon !== undefined ? { icon: data.icon } : {}),
        ...(data.type
          ? {
              type: data.type as (typeof issueStateTypeEnum.enumValues)[number],
            }
          : {}),
        ...(data.position !== undefined ? { position: data.position } : {}),
      })
      .where(eq(issueState.id, stateId));
  }

  /* -------------------------------------------------------------------------- */
  /*                            Project Status APIs                             */
  /* -------------------------------------------------------------------------- */

  static async listProjectStatuses(orgSlug: string) {
    const orgRow = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, orgSlug))
      .limit(1);

    if (!orgRow[0]) return [] as const;

    await WorkflowService.ensureDefaultsForOrg(orgRow[0].id);

    return db
      .select({
        id: projectStatus.id,
        name: projectStatus.name,
        position: projectStatus.position,
        color: projectStatus.color,
        icon: projectStatus.icon,
        type: projectStatus.type,
      })
      .from(projectStatus)
      .where(eq(projectStatus.organizationId, orgRow[0].id))
      .orderBy(projectStatus.position);
  }

  static async createProjectStatus(orgSlug: string, data: StatePayload) {
    const org = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, orgSlug))
      .limit(1);
    if (!org[0]) throw new Error("Organization not found");

    const id = randomUUID();
    await db.insert(projectStatus).values({
      id,
      organizationId: org[0].id,
      name: data.name,
      position: data.position,
      color: data.color,
      icon: data.icon,
      type: data.type as (typeof projectStatusTypeEnum.enumValues)[number],
    });

    return { id } as const;
  }

  static async updateProjectStatus(
    statusId: string,
    orgId: string,
    data: Omit<StatePayload, "position"> & { position?: number },
  ) {
    const rows = await db
      .select({ id: projectStatus.id })
      .from(projectStatus)
      .where(
        and(
          eq(projectStatus.id, statusId),
          eq(projectStatus.organizationId, orgId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new Error("FORBIDDEN");

    await db
      .update(projectStatus)
      .set({
        ...(data.name ? { name: data.name } : {}),
        ...(data.color ? { color: data.color } : {}),
        ...(data.icon !== undefined ? { icon: data.icon } : {}),
        ...(data.type
          ? {
              type: data.type as (typeof projectStatusTypeEnum.enumValues)[number],
            }
          : {}),
        ...(data.position !== undefined ? { position: data.position } : {}),
      })
      .where(eq(projectStatus.id, statusId));
  }

  /* -------------------------------------------------------------------------- */
  /*                             Issue Priority APIs                            */
  /* -------------------------------------------------------------------------- */

  static async listIssuePriorities(orgSlug: string) {
    // Ensure defaults exist first
    const orgRow = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, orgSlug))
      .limit(1);

    if (!orgRow[0]) return [] as const;

    await WorkflowService.ensureDefaultsForOrg(orgRow[0].id);

    return db
      .select({
        id: issuePriority.id,
        name: issuePriority.name,
        weight: issuePriority.weight,
        color: issuePriority.color,
        icon: issuePriority.icon,
      })
      .from(issuePriority)
      .where(eq(issuePriority.organizationId, orgRow[0].id))
      .orderBy(issuePriority.weight);
  }

  static async createIssuePriority(orgSlug: string, data: PriorityPayload) {
    const org = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, orgSlug))
      .limit(1);
    if (!org[0]) throw new Error("Organization not found");

    const id = randomUUID();
    await db.insert(issuePriority).values({
      id,
      organizationId: org[0].id,
      name: data.name,
      weight: data.weight,
      color: data.color,
      icon: data.icon,
    });
    return { id } as const;
  }

  static async updateIssuePriority(
    priorityId: string,
    orgId: string,
    data: Partial<PriorityPayload>,
  ) {
    const rows = await db
      .select({ id: issuePriority.id })
      .from(issuePriority)
      .where(
        and(
          eq(issuePriority.id, priorityId),
          eq(issuePriority.organizationId, orgId),
        ),
      )
      .limit(1);

    if (!rows[0]) throw new Error("FORBIDDEN");

    await db
      .update(issuePriority)
      .set({
        ...(data.name ? { name: data.name } : {}),
        ...(data.weight !== undefined ? { weight: data.weight } : {}),
        ...(data.color ? { color: data.color } : {}),
        ...(data.icon !== undefined ? { icon: data.icon } : {}),
      })
      .where(eq(issuePriority.id, priorityId));
  }

  static async deleteIssuePriority(priorityId: string, orgId: string) {
    const rows = await db
      .select({ id: issuePriority.id })
      .from(issuePriority)
      .where(
        and(
          eq(issuePriority.id, priorityId),
          eq(issuePriority.organizationId, orgId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new Error("FORBIDDEN");

    // Prevent deletion if any issues reference this priority
    const usage = await db
      .select({ cnt: count() })
      .from(issue)
      .innerJoin(projectTable, eq(issue.projectId, projectTable.id))
      .where(
        and(
          eq(issue.priorityId, priorityId),
          eq(projectTable.organizationId, orgId),
        ),
      );

    if (usage[0].cnt > 0) {
      throw new Error("Priority is in use by existing issues");
    }

    await db.delete(issuePriority).where(eq(issuePriority.id, priorityId));
  }

  static async resetIssuePriorities(orgSlug: string) {
    const org = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, orgSlug))
      .limit(1);
    if (!org[0]) throw new Error("Organization not found");
    await ensurePriorityDefaults(org[0].id, ISSUE_PRIORITY_DEFAULTS);
  }

  /* -------------------------------------------------------------------- */
  /*  Defaults / Reset                                                    */
  /* -------------------------------------------------------------------- */

  static async ensureDefaultsForOrg(orgId: string) {
    await ensureIssueStateDefaults(orgId);
    await ensureProjectStatusDefaults(orgId);
    await ensurePriorityDefaults(orgId, ISSUE_PRIORITY_DEFAULTS);
  }

  static async resetIssueStates(orgSlug: string) {
    const org = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, orgSlug))
      .limit(1);
    if (!org[0]) throw new Error("Organization not found");
    await ensureIssueStateDefaults(org[0].id);
  }

  static async resetProjectStatuses(orgSlug: string) {
    const org = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, orgSlug))
      .limit(1);
    if (!org[0]) throw new Error("Organization not found");
    await ensureProjectStatusDefaults(org[0].id);
  }

  /* -------------------------------------------------------------------- */
  /*  Deletion with safety checks                                         */
  /* -------------------------------------------------------------------- */

  static async deleteIssueState(stateId: string, orgId: string) {
    // Ensure belongs to org
    const rows = await db
      .select({ id: issueState.id })
      .from(issueState)
      .where(
        and(eq(issueState.id, stateId), eq(issueState.organizationId, orgId)),
      )
      .limit(1);
    if (!rows[0]) throw new Error("FORBIDDEN");

    // Check usage in issues
    const usage = await db
      .select({ cnt: count() })
      .from(issueAssignee)
      .innerJoin(issue, eq(issueAssignee.issueId, issue.id))
      .innerJoin(projectTable, eq(issue.projectId, projectTable.id))
      .where(
        and(
          eq(issueAssignee.stateId, stateId),
          eq(projectTable.organizationId, orgId),
        ),
      );

    if (usage[0].cnt > 0) {
      throw new Error("State is in use by existing issues");
    }

    await db.delete(issueState).where(eq(issueState.id, stateId));
  }

  static async deleteProjectStatus(statusId: string, orgId: string) {
    const rows = await db
      .select({ id: projectStatus.id })
      .from(projectStatus)
      .where(
        and(
          eq(projectStatus.id, statusId),
          eq(projectStatus.organizationId, orgId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new Error("FORBIDDEN");

    const usage = await db
      .select({ cnt: count() })
      .from(projectTable)
      .where(
        and(
          eq(projectTable.statusId, statusId),
          eq(projectTable.organizationId, orgId),
        ),
      );

    if (usage[0].cnt > 0) {
      throw new Error("Status is in use by existing projects");
    }

    await db.delete(projectStatus).where(eq(projectStatus.id, statusId));
  }
}
