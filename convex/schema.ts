import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import {
  activityDetailsValidator,
  activityEntityTypeValidator,
  activityEventTypeValidator,
  activitySnapshotValidator,
} from './_shared/activity';
import {
  agentCommandKindValidator,
  agentCommandStatusValidator,
  agentContextLengthValidator,
  agentDeviceServiceTypeValidator,
  agentDeviceStatusValidator,
  agentPermissionModeValidator,
  agentProcessModeValidator,
  agentProcessStatusValidator,
  agentProviderValidator,
  agentThinkingLevelValidator,
  agentUsageStatsValidator,
  codexPlanValidator,
  commentAgentSourceValidator,
  commentAuthorKindValidator,
  commentGenerationStatusValidator,
  delegatedRunLaunchStatusValidator,
  liveActivityStatusValidator,
  liveMessageDeliveryStatusValidator,
  liveMessageDirectionValidator,
  liveMessageRoleValidator,
  liveMessageStructuredPayloadValidator,
  pendingAgentApprovalValidator,
  pendingPlanApprovalValidator,
  pendingQuestionValidator,
  queuedAgentMessageValidator,
  workSessionAccessLevelValidator,
  workspaceLaunchPolicyValidator,
} from './_shared/agentBridge';
import {
  agentInteractionPolicyValidator,
  agentWakeModeValidator,
  attachmentKindValidator,
  channelKindValidator,
  channelMemberRoleValidator,
  channelNotificationModeValidator,
  collaborationEntityTypeValidator,
  collaborationRunEventKindValidator,
  collaborationRunStatusValidator,
  messageActorKindValidator,
  messageFormatValidator,
  registeredAgentStatusValidator,
} from './_shared/collaboration';
import { PERMISSION_VALUES, SYSTEM_ROLE_KEYS } from './_shared/permissions';
import {
  actorOriginKindValidator,
  agentTaskCreationPolicyValidator,
  notificationActionStateValidator,
  reminderCadenceValidator,
  reminderRecipientPolicyValidator,
  reminderTargetTypeValidator,
  requestRecipientRoleValidator,
  requestSourceValidator,
  requestStatusValidator,
  requestWorkRelationValidator,
  taskCreationSourceValidator,
  taskStatusValidator,
  workAttentionStatusValidator,
  workCompletionPolicyValidator,
  workCreationSourceValidator,
  workEffortValidator,
  workHandoffStatusValidator,
  workKindValidator,
  workStatusValidator,
} from './_shared/work';
import {
  notificationCategoryValidator,
  notificationChannelValidator,
  notificationDeliveryStatusValidator,
  notificationEventTypeValidator,
  notificationPayloadValidator,
} from './notifications/shared';
import { KANBAN_BORDER_COLOR_OPTIONS } from '../src/lib/kanban-border-tags';
import { SOCIAL_LINK_PLATFORMS } from '../src/lib/social-links';

const permissionValidator = v.union(
  ...PERMISSION_VALUES.map(permission => v.literal(permission)),
);

const roleScopeTypeValidator = v.union(
  v.literal('organization'),
  v.literal('team'),
  v.literal('project'),
);

const systemRoleKeyValidator = v.union(
  ...Object.values(SYSTEM_ROLE_KEYS).map(key => v.literal(key)),
);

const socialLinkPlatformValidator = v.union(
  ...SOCIAL_LINK_PLATFORMS.map(platform => v.literal(platform)),
);

const kanbanBorderTagValidator = v.union(
  ...KANBAN_BORDER_COLOR_OPTIONS.map(option => v.literal(option.value)),
);

const kanbanBorderTagSettingValidator = v.object({
  id: kanbanBorderTagValidator,
  name: v.string(),
  color: v.string(),
});

export default defineSchema({
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // Our custom fields
    username: v.optional(v.string()),
    role: v.optional(v.string()),
    // GitHub identity (linked via OAuth)
    githubUserId: v.optional(v.number()),
    githubUsername: v.optional(v.string()),
  })
    .index('email', ['email'])
    .index('phone', ['phone'])
    .index('by_role', ['role'])
    .index('by_username', ['username'])
    .index('by_github_user_id', ['githubUserId'])
    .index('by_github_username', ['githubUsername'])
    .searchIndex('by_name_email_username', {
      searchField: 'name',
    }),

  siteSettings: defineTable({
    signupBlockedEmailDomains: v.optional(v.array(v.string())),
    signupAllowedEmailDomains: v.optional(v.array(v.string())),
    showPublicSignupButton: v.optional(v.boolean()),
    signupDisposableDomainSync: v.optional(
      v.object({
        lastStartedAt: v.optional(v.number()),
        lastSyncedAt: v.optional(v.number()),
        lastFailureAt: v.optional(v.number()),
        lastFailureMessage: v.optional(v.string()),
        totalRulesCount: v.number(),
        fetchedCount: v.number(),
        insertedCount: v.number(),
        updatedCount: v.number(),
        deletedCount: v.number(),
        skippedCount: v.number(),
      }),
    ),
    // Email configuration
    emailFromAddress: v.optional(v.string()),
    // Platform branding (white-label)
    brandName: v.optional(v.string()),
    brandDescription: v.optional(v.string()),
    brandLogo: v.optional(v.id('_storage')),
    brandThemeColor: v.optional(v.string()),
    brandAccentColor: v.optional(v.string()),
    publicFooterAttributionEnabled: v.optional(v.boolean()),
    publicFooterAttributionText: v.optional(v.string()),
    defaultOrgSlug: v.optional(v.string()),
    // Assistant model configuration
    assistantModels: v.optional(
      v.array(
        v.object({
          modelId: v.string(),
          name: v.string(),
          hint: v.optional(v.string()),
        }),
      ),
    ),
    defaultAssistantModel: v.optional(v.string()),
    assistantThinkingLevels: v.optional(
      v.array(
        v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
      ),
    ),
    defaultAssistantThinkingLevel: v.optional(
      v.union(
        v.literal('off'),
        v.literal('low'),
        v.literal('medium'),
        v.literal('high'),
      ),
    ),
    // WIP: reserved for future GitHub App install/auth flows.
    // Do not treat these as the primary workspace GitHub integration source;
    // workspace webhook/token state lives on githubIntegrations.
    githubAppId: v.optional(v.string()),
    githubAppEncryptedPrivateKey: v.optional(v.string()),
    githubAppEncryptedWebhookSecret: v.optional(v.string()),
    // WIP: legacy/experimental app-install metadata. New workspace integration
    // work should avoid depending on this until the app-install flow is revived.
    githubAppInstallationId: v.optional(v.number()),
    githubAppAccountLogin: v.optional(v.string()),
    githubAppAccountType: v.optional(v.string()),
    githubAppEncryptedToken: v.optional(v.string()),
    githubAppTokenFingerprint: v.optional(v.string()),
    githubAppConnectedAt: v.optional(v.number()),
    githubAppUpdatedAt: v.optional(v.number()),
  }),

  signupEmailDomainRules: defineTable({
    domain: v.string(),
    type: v.union(v.literal('blocked'), v.literal('allowed')),
    source: v.union(v.literal('manual'), v.literal('upstream_disposable')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_source', ['source'])
    .index('by_type_domain', ['type', 'domain']),

  // Organizations (equivalent to Drizzle 'organization' table)
  organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    logo: v.optional(v.id('_storage')),
    metadata: v.optional(v.string()),
    subtitle: v.optional(v.string()),
    publicDescription: v.optional(v.string()),
    publicLandingViewId: v.optional(v.id('views')),
    publicSocialLinks: v.optional(
      v.array(
        v.object({
          platform: socialLinkPlatformValidator,
          url: v.string(),
        }),
      ),
    ),
    kanbanBorderTags: v.optional(v.array(kanbanBorderTagSettingValidator)),
    agentContext: v.optional(v.string()),
    agentContextDocumentId: v.optional(v.id('documents')),
    requestAutoRoutingEnabled: v.optional(v.boolean()),
    requestRoutingRules: v.optional(v.string()),
    // Public issue submission: when enabled, anonymous visitors on the
    // org's public landing page can submit an issue that lands in the
    // configured project. The optional view is surfaced on the public
    // page so visitors can browse existing public requests.
    publicIssueSubmissionEnabled: v.optional(v.boolean()),
    publicIssueProjectId: v.optional(v.id('projects')),
    publicIssueViewId: v.optional(v.id('views')),
  }).index('by_slug', ['slug']),

  organizationSequences: defineTable({
    organizationId: v.id('organizations'),
    namespace: v.union(v.literal('request')),
    value: v.number(),
    updatedAt: v.number(),
  }).index('by_org_namespace', ['organizationId', 'namespace']),

  // Fixed-window quotas for the anonymous Request intake endpoint. Keeping
  // these counters in Convex makes the public mutation safe even when it is
  // called directly instead of through the web form.
  publicRequestRateLimits: defineTable({
    organizationId: v.id('organizations'),
    scope: v.string(),
    windowStartedAt: v.number(),
    count: v.number(),
    updatedAt: v.number(),
  }).index('by_org_scope', ['organizationId', 'scope']),

  // Organization members (equivalent to Drizzle 'member' table)
  members: defineTable({
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    role: v.union(v.literal('owner'), v.literal('admin'), v.literal('member')),
  })
    .index('by_organization', ['organizationId'])
    .index('by_user', ['userId'])
    .index('by_org_user', ['organizationId', 'userId']),

  // Organization invitations (equivalent to Drizzle 'invitation' table)
  invitations: defineTable({
    organizationId: v.id('organizations'),
    email: v.string(),
    role: v.union(v.literal('owner'), v.literal('admin'), v.literal('member')),
    customRoleId: v.optional(v.union(v.id('roles'), v.id('orgRoles'))),
    status: v.union(
      v.literal('pending'),
      v.literal('accepted'),
      v.literal('expired'),
      v.literal('revoked'),
    ),
    acceptedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    expiresAt: v.number(),
    inviterId: v.id('users'),
  })
    .index('by_organization', ['organizationId'])
    .index('by_email', ['email'])
    .index('by_status', ['status']),

  // Unified scoped roles for organization, team, and project authorization
  roles: defineTable({
    organizationId: v.id('organizations'),
    scopeType: roleScopeTypeValidator,
    teamId: v.optional(v.id('teams')),
    projectId: v.optional(v.id('projects')),
    key: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    system: v.boolean(),
    systemKey: v.optional(systemRoleKeyValidator),
  })
    .index('by_organization', ['organizationId'])
    .index('by_org_key', ['organizationId', 'key'])
    .index('by_org_scope', ['organizationId', 'scopeType'])
    .index('by_team', ['teamId'])
    .index('by_project', ['projectId'])
    .index('by_team_key', ['teamId', 'key'])
    .index('by_project_key', ['projectId', 'key']),

  rolePermissions: defineTable({
    roleId: v.id('roles'),
    permission: permissionValidator,
  })
    .index('by_role', ['roleId'])
    .index('by_role_permission', ['roleId', 'permission']),

  roleAssignments: defineTable({
    roleId: v.id('roles'),
    userId: v.id('users'),
    organizationId: v.id('organizations'),
    teamId: v.optional(v.id('teams')),
    projectId: v.optional(v.id('projects')),
    assignedAt: v.number(),
  })
    .index('by_role', ['roleId'])
    .index('by_user', ['userId'])
    .index('by_organization', ['organizationId'])
    .index('by_org_user', ['organizationId', 'userId'])
    .index('by_role_user', ['roleId', 'userId'])
    .index('by_team_user', ['teamId', 'userId'])
    .index('by_project_user', ['projectId', 'userId']),

  // Custom organization roles (equivalent to Drizzle 'orgRole' table)
  orgRoles: defineTable({
    organizationId: v.id('organizations'),
    name: v.string(),
    description: v.optional(v.string()),
    system: v.boolean(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_org_name', ['organizationId', 'name']),

  // Role permissions (equivalent to Drizzle 'orgRolePermission' table)
  orgRolePermissions: defineTable({
    roleId: v.id('orgRoles'),
    permission: permissionValidator,
  })
    .index('by_role', ['roleId'])
    .index('by_role_permission', ['roleId', 'permission']),

  // Role assignments (equivalent to Drizzle 'orgRoleAssignment' table)
  orgRoleAssignments: defineTable({
    roleId: v.id('orgRoles'),
    userId: v.id('users'),
    organizationId: v.id('organizations'), // redundant for fast lookups
    assignedAt: v.number(),
  })
    .index('by_role', ['roleId'])
    .index('by_user', ['userId'])
    .index('by_organization', ['organizationId'])
    .index('by_role_user', ['roleId', 'userId']),

  // Team-scoped roles
  teamRoles: defineTable({
    teamId: v.id('teams'),
    name: v.string(),
    description: v.optional(v.string()),
    system: v.boolean(), // true for built-in roles like "Lead", "Member"
  })
    .index('by_team', ['teamId'])
    .index('by_team_name', ['teamId', 'name']),

  // Team role permissions
  teamRolePermissions: defineTable({
    roleId: v.id('teamRoles'),
    permission: permissionValidator,
  })
    .index('by_role', ['roleId'])
    .index('by_role_permission', ['roleId', 'permission']),

  // Team role assignments
  teamRoleAssignments: defineTable({
    roleId: v.id('teamRoles'),
    userId: v.id('users'),
    teamId: v.id('teams'), // redundant for fast lookups
    assignedAt: v.number(),
  })
    .index('by_role', ['roleId'])
    .index('by_user', ['userId'])
    .index('by_team', ['teamId'])
    .index('by_role_user', ['roleId', 'userId']),

  // Project-scoped roles
  projectRoles: defineTable({
    projectId: v.id('projects'),
    name: v.string(),
    description: v.optional(v.string()),
    system: v.boolean(), // true for built-in roles like "Lead", "Member"
  })
    .index('by_project', ['projectId'])
    .index('by_project_name', ['projectId', 'name']),

  // Project role permissions
  projectRolePermissions: defineTable({
    roleId: v.id('projectRoles'),
    permission: permissionValidator,
  })
    .index('by_role', ['roleId'])
    .index('by_role_permission', ['roleId', 'permission']),

  // Project role assignments
  projectRoleAssignments: defineTable({
    roleId: v.id('projectRoles'),
    userId: v.id('users'),
    projectId: v.id('projects'), // redundant for fast lookups
    assignedAt: v.number(),
  })
    .index('by_role', ['roleId'])
    .index('by_user', ['userId'])
    .index('by_project', ['projectId'])
    .index('by_role_user', ['roleId', 'userId']),

  // Teams (equivalent to Drizzle 'team' table)
  teams: defineTable({
    organizationId: v.id('organizations'),
    key: v.string(), // short, uppercase key like ENG, MKT
    name: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    leadId: v.optional(v.id('users')),
    visibility: v.optional(
      v.union(
        v.literal('private'), // only creator/members can view
        v.literal('organization'), // full org can see it
        v.literal('public'), // publicly accessible (view-only)
      ),
    ),
    createdBy: v.optional(v.id('users')), // Made optional for backwards compatibility with existing data
  })
    .index('by_organization', ['organizationId'])
    .index('by_key', ['key'])
    .index('by_org_key', ['organizationId', 'key'])
    .index('by_lead', ['leadId'])
    .index('by_visibility', ['visibility'])
    .index('by_org_visibility', ['organizationId', 'visibility'])
    .searchIndex('search_name', {
      searchField: 'name',
      filterFields: ['organizationId'],
    }),

  // Team members (equivalent to Drizzle 'teamMember' table)
  teamMembers: defineTable({
    teamId: v.id('teams'),
    userId: v.id('users'),
    role: v.union(v.literal('lead'), v.literal('member')),
    joinedAt: v.number(),
  })
    .index('by_team', ['teamId'])
    .index('by_user', ['userId'])
    .index('by_team_user', ['teamId', 'userId']),

  // Project statuses (equivalent to Drizzle 'projectStatus' table)
  projectStatuses: defineTable({
    organizationId: v.id('organizations'),
    name: v.string(),
    position: v.number(),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    type: v.union(
      v.literal('backlog'),
      v.literal('planned'),
      v.literal('in_progress'),
      v.literal('completed'),
      v.literal('canceled'),
    ),
  })
    .index('by_organization', ['organizationId'])
    .index('by_org_type', ['organizationId', 'type'])
    .index('by_org_position', ['organizationId', 'position']),

  // Projects (equivalent to Drizzle 'project' table)
  projects: defineTable({
    organizationId: v.id('organizations'),
    key: v.string(), // URL-friendly key
    name: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    teamId: v.optional(v.id('teams')),
    leadId: v.optional(v.id('users')),
    createdBy: v.optional(v.id('users')), // Made optional for backwards compatibility with existing data
    startDate: v.optional(v.string()), // ISO date string
    dueDate: v.optional(v.string()), // ISO date string
    statusId: v.optional(v.id('projectStatuses')),
    visibility: v.optional(
      v.union(
        v.literal('private'), // only creator/members can view
        v.literal('organization'), // full org can see it
        v.literal('public'), // publicly accessible (view-only)
      ),
    ),
  })
    .index('by_organization', ['organizationId'])
    .index('by_org_team', ['organizationId', 'teamId'])
    .index('by_team', ['teamId'])
    .index('by_lead', ['leadId'])
    .index('by_created_by', ['createdBy'])
    .index('by_org_key', ['organizationId', 'key'])
    .index('by_status', ['statusId'])
    .index('by_visibility', ['visibility'])
    .index('by_org_visibility', ['organizationId', 'visibility'])
    .searchIndex('search_name', {
      searchField: 'name',
      filterFields: ['organizationId'],
    }),

  // Project members (equivalent to Drizzle 'projectMember' table)
  projectMembers: defineTable({
    projectId: v.id('projects'),
    userId: v.id('users'),
    role: v.optional(v.string()),
    joinedAt: v.number(),
  })
    .index('by_project', ['projectId'])
    .index('by_user', ['userId'])
    .index('by_project_user', ['projectId', 'userId']),

  // Project teams (equivalent to Drizzle 'projectTeam' table)
  projectTeams: defineTable({
    projectId: v.id('projects'),
    teamId: v.id('teams'),
  })
    .index('by_project', ['projectId'])
    .index('by_team', ['teamId'])
    .index('by_project_team', ['projectId', 'teamId']),

  // Issue priorities (equivalent to Drizzle 'issuePriority' table)
  issuePriorities: defineTable({
    organizationId: v.id('organizations'),
    name: v.string(),
    weight: v.number(), // smaller = lower priority, larger = higher priority
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
  })
    .index('by_organization', ['organizationId'])
    .index('by_org_weight', ['organizationId', 'weight'])
    .index('by_weight', ['weight']),

  // Issue states (equivalent to Drizzle 'issueState' table)
  issueStates: defineTable({
    organizationId: v.id('organizations'),
    name: v.string(),
    position: v.number(), // ordering left->right in board
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    type: v.union(
      v.literal('backlog'),
      v.literal('todo'),
      v.literal('in_progress'),
      v.literal('done'),
      v.literal('canceled'),
    ),
  })
    .index('by_organization', ['organizationId'])
    .index('by_org_type', ['organizationId', 'type'])
    .index('by_org_position', ['organizationId', 'position']),

  // Issue labels (equivalent to Drizzle 'issueLabel' table)
  issueLabels: defineTable({
    organizationId: v.id('organizations'),
    name: v.string(),
    color: v.optional(v.string()),
  })
    .index('by_organization', ['organizationId'])
    .index('by_org_name', ['organizationId', 'name']),

  // Issues (equivalent to Drizzle 'issue' table)
  issues: defineTable({
    organizationId: v.id('organizations'),
    key: v.string(), // full issue key like JOH-123
    sequenceNumber: v.number(), // monotonic per team
    title: v.string(),
    description: v.optional(v.string()),
    searchText: v.optional(v.string()),
    priorityId: v.optional(v.id('issuePriorities')),
    workflowStateId: v.optional(v.id('issueStates')),
    teamId: v.optional(v.id('teams')),
    projectId: v.optional(v.id('projects')),
    reporterId: v.optional(v.id('users')),
    startDate: v.optional(v.string()), // ISO date string
    estimatedTimes: v.optional(v.record(v.string(), v.number())), // state ID -> hours
    dueDate: v.optional(v.string()), // ISO date string
    closedAt: v.optional(v.number()),
    visibility: v.optional(
      v.union(
        v.literal('private'), // only creator/assignees can view
        v.literal('organization'), // full org can see it
        v.literal('public'), // publicly accessible (view-only)
      ),
    ),
    kanbanBorderTag: v.optional(kanbanBorderTagValidator),
    kanbanBorderColor: v.optional(
      v.union(
        v.literal('rose'),
        v.literal('orange'),
        v.literal('amber'),
        v.literal('emerald'),
        v.literal('sky'),
        v.literal('violet'),
      ),
    ),
    createdBy: v.optional(v.id('users')), // Made optional for backwards compatibility with existing data
    parentIssueId: v.optional(v.id('issues')),
    updatedAt: v.optional(v.number()),
    lastMeaningfulActivityAt: v.optional(v.number()),
    lastActivityEventType: v.optional(v.string()),
    // Product-facing Work model. Kept optional during the issue -> Work
    // compatibility migration. Legacy child issues become Task aliases after
    // their data is copied into the dedicated tasks table.
    kind: v.optional(workKindValidator),
    workStatus: v.optional(workStatusValidator),
    focusRank: v.optional(v.number()),
    // Maintained by Task mutations so paginated Work lists can render
    // progress without reading every Task for every row.
    taskTotal: v.optional(v.number()),
    taskDone: v.optional(v.number()),
    ownerId: v.optional(v.id('users')),
    effort: v.optional(workEffortValidator),
    completionPolicy: v.optional(workCompletionPolicyValidator),
    agentTaskCreationPolicy: v.optional(agentTaskCreationPolicyValidator),
    startedAt: v.optional(v.number()),
    startedBy: v.optional(v.id('users')),
    // Overall Work start is preserved above. These fields are reset at every
    // accepted handoff so each owner must intentionally begin their own turn.
    ownerStartedAt: v.optional(v.number()),
    ownerStartedBy: v.optional(v.id('users')),
    readyForReviewAt: v.optional(v.number()),
    creationSource: v.optional(workCreationSourceValidator),
    createdByAgentProvider: v.optional(agentProviderValidator),
    createdByAgentProcessId: v.optional(v.id('agentProcesses')),
    createdByLiveActivityId: v.optional(v.id('issueLiveActivities')),
  })
    .index('by_organization', ['organizationId'])
    .index('by_key', ['key'])
    .index('by_org_key', ['organizationId', 'key'])
    .index('by_team', ['teamId'])
    .index('by_project', ['projectId'])
    .index('by_priority', ['priorityId'])
    .index('by_workflow_state', ['workflowStateId'])
    .index('by_reporter', ['reporterId'])
    .index('by_team_sequence', ['teamId', 'sequenceNumber'])
    .index('by_org_project_sequence', [
      'organizationId',
      'projectId',
      'sequenceNumber',
    ])
    .index('by_org_team', ['organizationId', 'teamId'])
    .index('by_org_workflow_state', ['organizationId', 'workflowStateId'])
    .index('by_closed', ['closedAt'])
    .index('by_visibility', ['visibility'])
    .index('by_org_visibility', ['organizationId', 'visibility'])
    .index('by_created_by', ['createdBy'])
    .index('by_parent', ['parentIssueId'])
    .index('by_org_kind', ['organizationId', 'kind'])
    .index('by_org_kind_focus_activity', [
      'organizationId',
      'kind',
      'focusRank',
      'lastMeaningfulActivityAt',
    ])
    .index('by_org_work_status', ['organizationId', 'workStatus'])
    .index('by_org_owner', ['organizationId', 'ownerId'])
    .index('by_org_kind_owner', ['organizationId', 'kind', 'ownerId'])
    .index('by_org_kind_owner_focus_activity', [
      'organizationId',
      'kind',
      'ownerId',
      'focusRank',
      'lastMeaningfulActivityAt',
    ])
    .searchIndex('search_title', {
      searchField: 'title',
      filterFields: ['organizationId'],
    })
    .searchIndex('search_text', {
      searchField: 'searchText',
      filterFields: ['organizationId', 'projectId', 'teamId'],
    }),

  // Issue assignees (equivalent to Drizzle 'issueAssignee' table)
  issueAssignees: defineTable({
    issueId: v.id('issues'),
    assigneeId: v.optional(v.id('users')), // nullable for "unassigned"
    stateId: v.id('issueStates'),
    note: v.optional(v.string()),
  })
    .index('by_issue', ['issueId'])
    .index('by_assignee', ['assigneeId'])
    .index('by_state', ['stateId'])
    .index('by_issue_assignee', ['issueId', 'assigneeId']),

  // Requests are intake and review envelopes. They intentionally live outside
  // the Work workflow so routing/acceptance never implies execution started.
  requests: defineTable({
    organizationId: v.id('organizations'),
    key: v.string(),
    sequenceNumber: v.number(),
    title: v.string(),
    description: v.optional(v.string()),
    expectedOutput: v.string(),
    reviewGuidance: v.optional(v.string()),
    searchText: v.optional(v.string()),
    status: requestStatusValidator,
    // Stable lifecycle priority used by paginated Request lists. Lower values
    // surface human review and change requests before routine intake.
    focusRank: v.optional(v.number()),
    source: requestSourceValidator,
    requesterId: v.optional(v.id('users')),
    requesterName: v.optional(v.string()),
    requesterEmail: v.optional(v.string()),
    routedTeamId: v.optional(v.id('teams')),
    ownerId: v.optional(v.id('users')),
    priorityId: v.optional(v.id('issuePriorities')),
    projectId: v.optional(v.id('projects')),
    dueDate: v.optional(v.string()),
    visibility: v.union(
      v.literal('private'),
      v.literal('organization'),
      v.literal('public'),
    ),
    createdBy: v.optional(v.id('users')),
    // Client-generated idempotency key used by native clients when a committed
    // mutation response is lost during reconnect.
    clientRequestId: v.optional(v.string()),
    readyForReviewAt: v.optional(v.number()),
    latestReviewNote: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.id('users')),
    completedAt: v.optional(v.number()),
    completedBy: v.optional(v.id('users')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_org_key', ['organizationId', 'key'])
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_org_focus_created', ['organizationId', 'focusRank', 'createdAt'])
    .index('by_org_owner', ['organizationId', 'ownerId'])
    .index('by_org_owner_focus_created', [
      'organizationId',
      'ownerId',
      'focusRank',
      'createdAt',
    ])
    .index('by_routed_team', ['routedTeamId'])
    .index('by_requester', ['requesterId'])
    .index('by_org_requester', ['organizationId', 'requesterId'])
    .index('by_org_requester_focus_created', [
      'organizationId',
      'requesterId',
      'focusRank',
      'createdAt',
    ])
    .index('by_created_by', ['createdBy'])
    .index('by_org_creator_client_request', [
      'organizationId',
      'createdBy',
      'clientRequestId',
    ])
    .searchIndex('search_text', {
      searchField: 'searchText',
      filterFields: ['organizationId', 'status'],
    }),

  requestRecipients: defineTable({
    requestId: v.id('requests'),
    userId: v.id('users'),
    role: requestRecipientRoleValidator,
    assignedBy: v.optional(v.id('users')),
    assignedAt: v.number(),
  })
    .index('by_request', ['requestId'])
    .index('by_user', ['userId'])
    .index('by_request_user', ['requestId', 'userId']),

  requestWorkLinks: defineTable({
    requestId: v.id('requests'),
    workId: v.id('issues'),
    relation: requestWorkRelationValidator,
    createdBy: v.optional(v.id('users')),
    createdAt: v.number(),
  })
    .index('by_request', ['requestId'])
    .index('by_work', ['workId'])
    .index('by_request_work', ['requestId', 'workId']),

  tasks: defineTable({
    organizationId: v.id('organizations'),
    workId: v.id('issues'),
    number: v.number(),
    title: v.string(),
    description: v.optional(v.string()),
    status: taskStatusValidator,
    assigneeId: v.optional(v.id('users')),
    dueDate: v.optional(v.string()),
    position: v.number(),
    createdBy: v.optional(v.id('users')),
    creationSource: taskCreationSourceValidator,
    createdByAgentProvider: v.optional(agentProviderValidator),
    createdByAgentProcessId: v.optional(v.id('agentProcesses')),
    createdByLiveActivityId: v.optional(v.id('issueLiveActivities')),
    legacyIssueId: v.optional(v.id('issues')),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_work', ['workId'])
    .index('by_work_position', ['workId', 'position'])
    .index('by_work_number', ['workId', 'number'])
    .index('by_assignee', ['assigneeId'])
    .index('by_assignee_status', ['assigneeId', 'status'])
    .index('by_legacy_issue', ['legacyIssueId']),

  workContributors: defineTable({
    workId: v.id('issues'),
    userId: v.id('users'),
    addedBy: v.optional(v.id('users')),
    addedAt: v.number(),
  })
    .index('by_work', ['workId'])
    .index('by_user', ['userId'])
    .index('by_work_user', ['workId', 'userId']),

  workOwnershipPeriods: defineTable({
    workId: v.id('issues'),
    ownerId: v.id('users'),
    startedBy: v.id('users'),
    startedAt: v.number(),
    executionStartedAt: v.optional(v.number()),
    executionStartedBy: v.optional(v.id('users')),
    endedBy: v.optional(v.id('users')),
    endedAt: v.optional(v.number()),
    handoffId: v.optional(v.id('workHandoffs')),
    summary: v.optional(v.string()),
  })
    .index('by_work', ['workId'])
    .index('by_owner', ['ownerId'])
    .index('by_work_owner', ['workId', 'ownerId']),

  workHandoffs: defineTable({
    workId: v.id('issues'),
    fromOwnerId: v.id('users'),
    toOwnerId: v.id('users'),
    initiatedBy: v.id('users'),
    status: workHandoffStatusValidator,
    note: v.optional(v.string()),
    summary: v.optional(v.string()),
    createdAt: v.number(),
    respondedAt: v.optional(v.number()),
    respondedBy: v.optional(v.id('users')),
  })
    .index('by_work', ['workId'])
    .index('by_to_owner', ['toOwnerId'])
    .index('by_to_owner_status', ['toOwnerId', 'status'])
    .index('by_work_status', ['workId', 'status']),

  workAttentionRequests: defineTable({
    organizationId: v.id('organizations'),
    workId: v.id('issues'),
    taskId: v.optional(v.id('tasks')),
    liveActivityId: v.optional(v.id('issueLiveActivities')),
    raisedByUserId: v.id('users'),
    agentProvider: v.optional(agentProviderValidator),
    title: v.string(),
    details: v.optional(v.string()),
    status: workAttentionStatusValidator,
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.id('users')),
  })
    .index('by_organization', ['organizationId'])
    .index('by_organization_status', ['organizationId', 'status'])
    .index('by_work', ['workId'])
    .index('by_work_status', ['workId', 'status'])
    .index('by_task', ['taskId'])
    .index('by_status', ['status']),

  // Issue activity (equivalent to Drizzle 'issueActivity' table)
  issueActivities: defineTable({
    issueId: v.id('issues'),
    taskId: v.optional(v.id('tasks')),
    actorId: v.id('users'),
    type: v.union(
      v.literal('status_changed'),
      v.literal('priority_changed'),
      v.literal('assignee_changed'),
      v.literal('comment_added'),
      v.literal('title_changed'),
      v.literal('description_changed'),
      v.literal('created'),
      v.literal('sub_issue_created'),
    ),
    payload: v.optional(v.record(v.string(), v.any())), // JSON payload
  })
    .index('by_issue', ['issueId'])
    .index('by_task', ['taskId'])
    .index('by_actor', ['actorId'])
    .index('by_type', ['type'])
    .index('by_issue_type', ['issueId', 'type']),

  // Comments — polymorphic: issueId, requestId, or documentId is set
  comments: defineTable({
    issueId: v.optional(v.id('issues')),
    requestId: v.optional(v.id('requests')),
    taskId: v.optional(v.id('tasks')),
    documentId: v.optional(v.id('documents')),
    authorId: v.id('users'),
    body: v.string(),
    deleted: v.boolean(),
    parentId: v.optional(v.id('comments')),
    // Agent-generated comment: 'thinking' while generating, 'done' when complete, 'error' on failure
    agentStatus: v.optional(
      v.union(v.literal('thinking'), v.literal('done'), v.literal('error')),
    ),
    // Extended agent source metadata for branded completion comments
    authorKind: v.optional(commentAuthorKindValidator),
    agentSource: v.optional(commentAgentSourceValidator),
    agentLabel: v.optional(v.string()),
    liveActivityId: v.optional(v.id('issueLiveActivities')),
    generationStatus: v.optional(commentGenerationStatusValidator),
  })
    .index('by_issue', ['issueId'])
    .index('by_request', ['requestId'])
    .index('by_task', ['taskId'])
    .index('by_document', ['documentId'])
    .index('by_author', ['authorId'])
    .index('by_issue_deleted', ['issueId', 'deleted'])
    .index('by_request_deleted', ['requestId', 'deleted'])
    .index('by_document_deleted', ['documentId', 'deleted'])
    .index('by_parent', ['parentId']),

  // Issue label assignments (equivalent to Drizzle 'issueLabelAssignment' table)
  issueLabelAssignments: defineTable({
    issueId: v.id('issues'),
    labelId: v.id('issueLabels'),
  })
    .index('by_issue', ['issueId'])
    .index('by_label', ['labelId'])
    .index('by_issue_label', ['issueId', 'labelId']),

  activities: defineTable({
    issueId: v.id('issues'),
    actorId: v.id('users'),
    type: v.string(),
    payload: v.optional(v.any()),
  }).index('by_issue', ['issueId']),

  githubIntegrations: defineTable({
    organizationId: v.id('organizations'),
    provider: v.literal('github'),
    autoLinkEnabled: v.optional(v.boolean()),
    keyLinkEnabled: v.optional(v.boolean()),
    aiMatchEnabled: v.optional(v.boolean()),
    unmatchedArtifactPolicy: v.optional(
      v.union(
        v.literal('development_inbox'),
        v.literal('create_request'),
        v.literal('create_work'),
        v.literal('ignore'),
      ),
    ),
    stateAutomationPolicy: v.optional(
      v.union(v.literal('manual'), v.literal('evidence'), v.literal('github')),
    ),
    identityContributionPolicy: v.optional(
      v.union(v.literal('none'), v.literal('contributors')),
    ),
    githubNotificationPolicy: v.optional(
      v.union(v.literal('action_only'), v.literal('all'), v.literal('none')),
    ),
    connectionMode: v.union(
      v.literal('webhook'),
      v.literal('app'),
      v.literal('token'),
      v.literal('hybrid'),
    ),
    encryptedWebhookSecret: v.optional(v.string()),
    webhookSecretFingerprint: v.optional(v.string()),
    webhookSecretLastUpdatedAt: v.optional(v.number()),
    installationId: v.optional(v.number()),
    installationAccountLogin: v.optional(v.string()),
    installationAccountType: v.optional(v.string()),
    appWebhookStatus: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('active'),
        v.literal('failing'),
        v.literal('disabled'),
      ),
    ),
    encryptedToken: v.optional(v.string()),
    tokenFingerprint: v.optional(v.string()),
    tokenLastUpdatedAt: v.optional(v.number()),
    lastWebhookAt: v.optional(v.number()),
    lastWebhookEvent: v.optional(v.string()),
    lastReconciledAt: v.optional(v.number()),
    lastSyncFailureAt: v.optional(v.number()),
    lastSyncFailureMessage: v.optional(v.string()),
    connectedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_org_provider', ['organizationId', 'provider'])
    .index('by_installation', ['installationId']),

  githubRepositories: defineTable({
    organizationId: v.id('organizations'),
    integrationId: v.id('githubIntegrations'),
    githubRepoId: v.number(),
    nodeId: v.optional(v.string()),
    owner: v.string(),
    name: v.string(),
    fullName: v.string(),
    defaultBranch: v.optional(v.string()),
    private: v.boolean(),
    installationAccessible: v.boolean(),
    selected: v.boolean(),
    lastPushedAt: v.optional(v.number()),
    lastSyncedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_integration', ['integrationId'])
    .index('by_org_repo', ['organizationId', 'githubRepoId'])
    .index('by_org_selected', ['organizationId', 'selected'])
    .index('by_full_name', ['fullName']),

  githubPullRequests: defineTable({
    organizationId: v.id('organizations'),
    repositoryId: v.id('githubRepositories'),
    githubPullRequestId: v.number(),
    nodeId: v.optional(v.string()),
    number: v.number(),
    title: v.string(),
    body: v.optional(v.string()),
    url: v.string(),
    state: v.union(
      v.literal('draft'),
      v.literal('open'),
      v.literal('closed'),
      v.literal('merged'),
    ),
    isDraft: v.boolean(),
    headRefName: v.optional(v.string()),
    baseRefName: v.optional(v.string()),
    authorGitHubUserId: v.optional(v.number()),
    authorLogin: v.optional(v.string()),
    authorAvatarUrl: v.optional(v.string()),
    assigneeGitHubUserIds: v.optional(v.array(v.number())),
    assigneeLogins: v.optional(v.array(v.string())),
    mergedAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    lastActivityAt: v.number(),
    lastSyncedAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_repository', ['repositoryId'])
    .index('by_org_external', ['organizationId', 'githubPullRequestId'])
    .index('by_repo_number', ['repositoryId', 'number'])
    .index('by_state', ['state']),

  githubIssues: defineTable({
    organizationId: v.id('organizations'),
    repositoryId: v.id('githubRepositories'),
    githubIssueId: v.number(),
    nodeId: v.optional(v.string()),
    number: v.number(),
    title: v.string(),
    body: v.optional(v.string()),
    url: v.string(),
    state: v.union(v.literal('open'), v.literal('closed')),
    authorGitHubUserId: v.optional(v.number()),
    authorLogin: v.optional(v.string()),
    authorAvatarUrl: v.optional(v.string()),
    assigneeGitHubUserIds: v.optional(v.array(v.number())),
    assigneeLogins: v.optional(v.array(v.string())),
    closedAt: v.optional(v.number()),
    lastActivityAt: v.number(),
    lastSyncedAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_repository', ['repositoryId'])
    .index('by_org_external', ['organizationId', 'githubIssueId'])
    .index('by_repo_number', ['repositoryId', 'number'])
    .index('by_state', ['state']),

  githubCommits: defineTable({
    organizationId: v.id('organizations'),
    repositoryId: v.id('githubRepositories'),
    sha: v.string(),
    shortSha: v.string(),
    messageHeadline: v.string(),
    messageBody: v.optional(v.string()),
    url: v.string(),
    authorName: v.optional(v.string()),
    authorEmail: v.optional(v.string()),
    committedAt: v.optional(v.number()),
    authoredAt: v.optional(v.number()),
    lastSyncedAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_repository', ['repositoryId'])
    .index('by_org_sha', ['organizationId', 'sha'])
    .index('by_committed_at', ['committedAt']),

  githubArtifactLinks: defineTable({
    organizationId: v.id('organizations'),
    issueId: v.id('issues'),
    taskId: v.optional(v.id('tasks')),
    artifactType: v.union(
      v.literal('pull_request'),
      v.literal('issue'),
      v.literal('commit'),
    ),
    pullRequestId: v.optional(v.id('githubPullRequests')),
    githubIssueId: v.optional(v.id('githubIssues')),
    commitId: v.optional(v.id('githubCommits')),
    source: v.union(
      v.literal('auto'),
      v.literal('manual'),
      v.literal('rollup'),
    ),
    active: v.boolean(),
    matchReason: v.optional(v.string()),
    createdBy: v.optional(v.id('users')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_issue', ['issueId'])
    .index('by_issue_active', ['issueId', 'active'])
    .index('by_task', ['taskId'])
    .index('by_pr', ['pullRequestId'])
    .index('by_gh_issue', ['githubIssueId'])
    .index('by_commit', ['commitId']),

  githubArtifactSuppressions: defineTable({
    organizationId: v.id('organizations'),
    issueId: v.id('issues'),
    taskId: v.optional(v.id('tasks')),
    artifactType: v.union(
      v.literal('pull_request'),
      v.literal('issue'),
      v.literal('commit'),
    ),
    externalKey: v.string(),
    reason: v.union(v.literal('manual_unlink'), v.literal('manual_suppress')),
    createdBy: v.optional(v.id('users')),
    createdAt: v.number(),
  })
    .index('by_issue', ['issueId'])
    .index('by_issue_external', ['issueId', 'artifactType', 'externalKey'])
    .index('by_issue_task_external', [
      'issueId',
      'taskId',
      'artifactType',
      'externalKey',
    ])
    .index('by_task', ['taskId'])
    .index('by_organization', ['organizationId']),

  githubSyncCursors: defineTable({
    organizationId: v.id('organizations'),
    repositoryId: v.id('githubRepositories'),
    cursorType: v.union(
      v.literal('pull_requests_recent'),
      v.literal('issues_recent'),
      v.literal('commits_recent'),
    ),
    cursorValue: v.optional(v.string()),
    syncedAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_repository', ['repositoryId'])
    .index('by_repo_type', ['repositoryId', 'cursorType'])
    .index('by_organization', ['organizationId']),

  githubDevelopmentInbox: defineTable({
    organizationId: v.id('organizations'),
    pullRequestId: v.optional(v.id('githubPullRequests')),
    githubIssueId: v.optional(v.id('githubIssues')),
    status: v.union(
      v.literal('untriaged'),
      v.literal('linked'),
      v.literal('dismissed'),
    ),
    suggestedIssueIds: v.optional(v.array(v.id('issues'))),
    createdRequestId: v.optional(v.id('requests')),
    createdWorkId: v.optional(v.id('issues')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_pull_request', ['pullRequestId'])
    .index('by_github_issue', ['githubIssueId']),

  documentFolders: defineTable({
    organizationId: v.id('organizations'),
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    createdBy: v.id('users'),
  }).index('by_organizationId', ['organizationId']),

  documents: defineTable({
    organizationId: v.id('organizations'),
    title: v.string(),
    content: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    folderId: v.optional(v.id('documentFolders')),
    teamId: v.optional(v.id('teams')),
    projectId: v.optional(v.id('projects')),
    createdBy: v.id('users'),
    lastEditedBy: v.optional(v.id('users')),
    lastEditedAt: v.optional(v.number()),
    contentVersion: v.optional(v.string()),
    contentChunkCount: v.optional(v.number()),
    contentSize: v.optional(v.number()),
    visibility: v.optional(
      v.union(
        v.literal('private'),
        v.literal('organization'),
        v.literal('public'),
      ),
    ),
  })
    .index('by_organizationId', ['organizationId'])
    .index('by_folder', ['folderId'])
    .index('by_team', ['teamId'])
    .index('by_project', ['projectId'])
    .index('by_org_team', ['organizationId', 'teamId'])
    .index('by_org_project', ['organizationId', 'projectId'])
    .index('by_org_createdBy', ['organizationId', 'createdBy'])
    .searchIndex('search_title', {
      searchField: 'title',
      filterFields: ['organizationId'],
    }),

  documentContentChunks: defineTable({
    documentId: v.id('documents'),
    version: v.string(),
    chunkIndex: v.number(),
    content: v.string(),
  }).index('by_document_version_chunk', [
    'documentId',
    'version',
    'chunkIndex',
  ]),

  documentContentUploads: defineTable({
    documentId: v.id('documents'),
    uploadId: v.string(),
    expectedChunkCount: v.number(),
    nextChunkIndex: v.number(),
    contentSize: v.number(),
    createdBy: v.id('users'),
    createdAt: v.number(),
  }).index('by_document', ['documentId']),

  // Actions queued by the assistant for the client to perform (navigation, open tabs, etc.)
  assistantActions: defineTable({
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    type: v.string(), // 'navigate' | 'open_tab' | 'scroll_to' | 'focus' | 'copy' | 'toast'
    payload: v.any(), // type-specific data (url, text, etc.)
    status: v.union(
      v.literal('pending'),
      v.literal('done'),
      v.literal('failed'),
    ),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index('by_user_status', ['userId', 'status'])
    .index('by_user_created', ['userId', 'createdAt']),

  assistantThreads: defineTable({
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    threadId: v.string(),
    updatedAt: v.number(),
    threadStatus: v.string(),
    errorMessage: v.optional(v.string()),
    lastContextType: v.optional(v.string()),
    lastContextPath: v.optional(v.string()),
    lastEntityId: v.optional(v.string()),
    lastEntityKey: v.optional(v.string()),
    pendingAction: v.optional(v.any()),
    // Multi-thread fields
    title: v.optional(v.string()),
    visibility: v.optional(
      v.union(
        v.literal('private'),
        v.literal('organization'),
        v.literal('public'),
      ),
    ),
    createdBy: v.optional(v.id('users')),
  })
    .index('by_org_user', ['organizationId', 'userId'])
    .index('by_org_context_entity', [
      'organizationId',
      'lastContextType',
      'lastEntityKey',
    ])
    .index('by_threadId', ['threadId'])
    .index('by_org_createdBy', ['organizationId', 'createdBy'])
    .index('by_org_updated', ['organizationId', 'updatedAt']),

  threadMembers: defineTable({
    threadId: v.id('assistantThreads'),
    userId: v.id('users'),
    role: v.union(
      v.literal('viewer'),
      v.literal('commenter'),
      v.literal('editor'),
    ),
    addedBy: v.id('users'),
    addedAt: v.number(),
  })
    .index('by_thread', ['threadId'])
    .index('by_thread_user', ['threadId', 'userId'])
    .index('by_user', ['userId']),

  assistantUserState: defineTable({
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    activeThreadId: v.optional(v.id('assistantThreads')),
  }).index('by_org_user', ['organizationId', 'userId']),

  documentPresence: defineTable({
    documentId: v.id('documents'),
    userId: v.id('users'),
    lastSeen: v.number(),
  })
    .index('by_document', ['documentId'])
    .index('by_document_user', ['documentId', 'userId']),

  activityEvents: defineTable({
    organizationId: v.id('organizations'),
    teamId: v.optional(v.id('teams')),
    projectId: v.optional(v.id('projects')),
    issueId: v.optional(v.id('issues')),
    requestId: v.optional(v.id('requests')),
    taskId: v.optional(v.id('tasks')),
    documentId: v.optional(v.id('documents')),
    viewId: v.optional(v.id('views')),
    entityType: activityEntityTypeValidator,
    eventType: activityEventTypeValidator,
    actorId: v.id('users'),
    subjectUserId: v.optional(v.id('users')),
    details: activityDetailsValidator,
    snapshot: activitySnapshotValidator,
  })
    .index('by_organization', ['organizationId'])
    .index('by_organization_actor', ['organizationId', 'actorId'])
    .index('by_organization_entity_type', ['organizationId', 'entityType'])
    .index('by_organization_event_type', ['organizationId', 'eventType'])
    .index('by_organization_entity_event_type', [
      'organizationId',
      'entityType',
      'eventType',
    ])
    .index('by_team', ['teamId'])
    .index('by_project', ['projectId'])
    .index('by_issue', ['issueId'])
    .index('by_request', ['requestId'])
    .index('by_task', ['taskId'])
    .index('by_actor', ['actorId'])
    .index('by_document', ['documentId'])
    .index('by_view', ['viewId']),

  notificationEvents: defineTable({
    type: notificationEventTypeValidator,
    category: notificationCategoryValidator,
    organizationId: v.optional(v.id('organizations')),
    actorId: v.optional(v.id('users')),
    issueId: v.optional(v.id('issues')),
    requestId: v.optional(v.id('requests')),
    taskId: v.optional(v.id('tasks')),
    projectId: v.optional(v.id('projects')),
    teamId: v.optional(v.id('teams')),
    invitationId: v.optional(v.id('invitations')),
    payload: notificationPayloadValidator,
    dedupeKey: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_type', ['type'])
    .index('by_category', ['category'])
    .index('by_organization', ['organizationId'])
    .index('by_issue', ['issueId'])
    .index('by_request', ['requestId'])
    .index('by_task', ['taskId'])
    .index('by_actor', ['actorId'])
    .index('by_dedupe_key', ['dedupeKey']),

  notificationRecipients: defineTable({
    eventId: v.id('notificationEvents'),
    userId: v.optional(v.id('users')),
    email: v.optional(v.string()),
    category: notificationCategoryValidator,
    eventType: notificationEventTypeValidator,
    organizationId: v.optional(v.id('organizations')),
    title: v.string(),
    body: v.string(),
    href: v.optional(v.string()),
    actorId: v.optional(v.id('users')),
    actorName: v.optional(v.string()),
    actorImage: v.optional(v.string()),
    isRead: v.boolean(),
    readAt: v.optional(v.number()),
    isArchived: v.boolean(),
    archivedAt: v.optional(v.number()),
    actionState: v.optional(notificationActionStateValidator),
    snoozedUntil: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_event', ['eventId'])
    .index('by_user', ['userId'])
    .index('by_user_read', ['userId', 'isRead'])
    .index('by_user_read_archived', ['userId', 'isRead', 'isArchived'])
    .index('by_user_archived', ['userId', 'isArchived'])
    .index('by_user_organization_read_archived', [
      'userId',
      'organizationId',
      'isRead',
      'isArchived',
    ])
    .index('by_user_organization_archived', [
      'userId',
      'organizationId',
      'isArchived',
    ])
    .index('by_user_action', ['userId', 'actionState'])
    .index('by_user_action_archived', ['userId', 'actionState', 'isArchived'])
    .index('by_user_organization_action_archived', [
      'userId',
      'organizationId',
      'actionState',
      'isArchived',
    ])
    .index('by_email', ['email']),

  notificationPreferences: defineTable({
    userId: v.id('users'),
    category: notificationCategoryValidator,
    inAppEnabled: v.boolean(),
    emailEnabled: v.boolean(),
    pushEnabled: v.boolean(),
    updatedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_user_category', ['userId', 'category']),

  notificationDeliveries: defineTable({
    eventId: v.id('notificationEvents'),
    recipientId: v.id('notificationRecipients'),
    channel: notificationChannelValidator,
    status: notificationDeliveryStatusValidator,
    attemptCount: v.number(),
    providerMessageId: v.optional(v.string()),
    lastError: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index('by_event', ['eventId'])
    .index('by_recipient', ['recipientId'])
    .index('by_recipient_channel', ['recipientId', 'channel']),

  reminderRules: defineTable({
    organizationId: v.id('organizations'),
    targetType: reminderTargetTypeValidator,
    requestId: v.optional(v.id('requests')),
    workId: v.optional(v.id('issues')),
    taskId: v.optional(v.id('tasks')),
    messageId: v.optional(v.id('channelMessages')),
    recipientPolicies: v.array(reminderRecipientPolicyValidator),
    cadence: reminderCadenceValidator,
    intervalDays: v.optional(v.number()),
    localTime: v.string(),
    timezone: v.string(),
    inactivityHours: v.optional(v.number()),
    enabled: v.boolean(),
    nextFireAt: v.number(),
    lastFiredAt: v.optional(v.number()),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_enabled_next_fire', ['enabled', 'nextFireAt'])
    .index('by_request', ['requestId'])
    .index('by_work', ['workId'])
    .index('by_task', ['taskId'])
    .index('by_message', ['messageId']),

  reminderOccurrences: defineTable({
    reminderRuleId: v.id('reminderRules'),
    scheduledFor: v.number(),
    firedAt: v.number(),
    recipientUserIds: v.array(v.id('users')),
    dedupeKey: v.string(),
  })
    .index('by_rule', ['reminderRuleId'])
    .index('by_dedupe_key', ['dedupeKey']),

  // Tracks entities (users, teams, projects, issues) mentioned inside documents.
  // Synced automatically when document content is saved.
  documentMentions: defineTable({
    documentId: v.id('documents'),
    organizationId: v.id('organizations'),
    // The type of entity mentioned
    mentionType: v.union(
      v.literal('user'),
      v.literal('team'),
      v.literal('project'),
      v.literal('issue'),
      v.literal('document'),
    ),
    // The referenced entity ID (polymorphic — one of users/teams/projects/issues)
    entityId: v.string(),
  })
    .index('by_document', ['documentId'])
    .index('by_entity', ['mentionType', 'entityId'])
    .index('by_org_entity', ['organizationId', 'mentionType', 'entityId']),

  // Saved issue views with filters, layout, and visibility
  views: defineTable({
    organizationId: v.id('organizations'),
    name: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    filters: v.object({
      teamId: v.optional(v.id('teams')),
      projectId: v.optional(v.id('projects')),
      priorityIds: v.optional(v.array(v.id('issuePriorities'))),
      workflowStateIds: v.optional(v.array(v.id('issueStates'))),
      workflowStateTypes: v.optional(v.array(v.string())),
      assigneeIds: v.optional(v.array(v.id('users'))),
      labelIds: v.optional(v.array(v.id('issueLabels'))),
    }),
    layout: v.optional(
      v.object({
        viewMode: v.optional(
          v.union(
            v.literal('table'),
            v.literal('kanban'),
            v.literal('timeline'),
          ),
        ),
        groupBy: v.optional(v.string()),
      }),
    ),
    visibility: v.union(
      v.literal('private'),
      v.literal('organization'),
      v.literal('public'),
    ),
    createdBy: v.id('users'),
    updatedAt: v.optional(v.number()),
  })
    .index('by_organization', ['organizationId'])
    .index('by_org_visibility', ['organizationId', 'visibility'])
    .index('by_org_created_by', ['organizationId', 'createdBy']),

  // Issues explicitly excluded from a view (overrides filter matches)
  viewExclusions: defineTable({
    viewId: v.id('views'),
    issueId: v.id('issues'),
    excludedBy: v.id('users'),
  })
    .index('by_view', ['viewId'])
    .index('by_issue', ['issueId'])
    .index('by_view_issue', ['viewId', 'issueId']),

  pushSubscriptions: defineTable({
    userId: v.id('users'),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
    deviceLabel: v.optional(v.string()),
    disabledAt: v.optional(v.number()),
    lastSeenAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_endpoint', ['endpoint'])
    .index('by_user_endpoint', ['userId', 'endpoint']),

  mobilePushTokens: defineTable({
    userId: v.id('users'),
    token: v.string(),
    environment: v.union(v.literal('sandbox'), v.literal('production')),
    platform: v.union(v.literal('ios')),
    bundleId: v.optional(v.string()),
    deviceLabel: v.optional(v.string()),
    disabledAt: v.optional(v.number()),
    lastSeenAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_token', ['token'])
    .index('by_user_token_and_environment', ['userId', 'token', 'environment']),

  // ═══════════════════════════════════════════════════════════════════════════
  // Collaboration
  // ═══════════════════════════════════════════════════════════════════════════

  channels: defineTable({
    organizationId: v.id('organizations'),
    kind: channelKindValidator,
    name: v.string(),
    slug: v.string(),
    topic: v.optional(v.string()),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    createdByUserId: v.id('users'),
    isDefault: v.boolean(),
    archivedAt: v.optional(v.number()),
    lastMessageId: v.optional(v.id('channelMessages')),
    lastMessageAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_organization_id', ['organizationId'])
    .index('by_organization_id_and_kind', ['organizationId', 'kind'])
    .index('by_organization_id_and_slug', ['organizationId', 'slug'])
    .index('by_organization_id_and_is_default', ['organizationId', 'isDefault'])
    .index('by_organization_id_and_last_message_at', [
      'organizationId',
      'lastMessageAt',
    ])
    .searchIndex('search_name', {
      searchField: 'name',
      filterFields: ['organizationId', 'kind'],
    }),

  channelMembers: defineTable({
    organizationId: v.id('organizations'),
    channelId: v.id('channels'),
    userId: v.id('users'),
    role: channelMemberRoleValidator,
    notificationMode: channelNotificationModeValidator,
    lastReadAt: v.optional(v.number()),
    lastReadMessageId: v.optional(v.id('channelMessages')),
    favoriteAt: v.optional(v.number()),
    sortOrder: v.optional(v.number()),
    joinedAt: v.number(),
    hiddenAt: v.optional(v.number()),
  })
    .index('by_channel_id', ['channelId'])
    .index('by_user_id', ['userId'])
    .index('by_channel_id_and_user_id', ['channelId', 'userId'])
    .index('by_organization_id_and_user_id', ['organizationId', 'userId']),

  channelMessages: defineTable({
    organizationId: v.id('organizations'),
    channelId: v.id('channels'),
    actorKind: messageActorKindValidator,
    authorUserId: v.optional(v.id('users')),
    authorAgentId: v.optional(v.id('registeredAgents')),
    body: v.string(),
    format: messageFormatValidator,
    threadRootId: v.optional(v.id('channelMessages')),
    replyToMessageId: v.optional(v.id('channelMessages')),
    clientMessageId: v.optional(v.string()),
    mentionedUserIds: v.array(v.id('users')),
    mentionedAgentIds: v.array(v.id('registeredAgents')),
    replyCount: v.number(),
    lastReplyAt: v.optional(v.number()),
    resolvedAt: v.optional(v.number()),
    resolvedByUserId: v.optional(v.id('users')),
    editedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_channel_id_and_created_at', ['channelId', 'createdAt'])
    .index('by_channel_id_and_thread_root_id_and_created_at', [
      'channelId',
      'threadRootId',
      'createdAt',
    ])
    .index('by_thread_root_id_and_created_at', ['threadRootId', 'createdAt'])
    .index('by_author_user_id_and_created_at', ['authorUserId', 'createdAt'])
    .index('by_author_agent_id_and_created_at', ['authorAgentId', 'createdAt'])
    .index('by_channel_id_and_client_message_id', [
      'channelId',
      'clientMessageId',
    ])
    .searchIndex('search_body', {
      searchField: 'body',
      filterFields: ['organizationId', 'channelId', 'actorKind'],
    }),

  messageAttachments: defineTable({
    organizationId: v.id('organizations'),
    channelId: v.id('channels'),
    messageId: v.id('channelMessages'),
    storageId: v.id('_storage'),
    kind: attachmentKindValidator,
    name: v.string(),
    contentType: v.string(),
    size: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    duration: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_message_id', ['messageId'])
    .index('by_channel_id_and_created_at', ['channelId', 'createdAt'])
    .index('by_storage_id', ['storageId'])
    .searchIndex('search_name', {
      searchField: 'name',
      filterFields: ['organizationId', 'channelId', 'kind'],
    }),

  messageReactions: defineTable({
    organizationId: v.id('organizations'),
    channelId: v.id('channels'),
    messageId: v.id('channelMessages'),
    userId: v.id('users'),
    emoji: v.string(),
    createdAt: v.number(),
  })
    .index('by_message_id', ['messageId'])
    .index('by_message_id_and_emoji', ['messageId', 'emoji'])
    .index('by_message_id_and_user_id_and_emoji', [
      'messageId',
      'userId',
      'emoji',
    ])
    .index('by_user_id', ['userId']),

  messagePins: defineTable({
    organizationId: v.id('organizations'),
    channelId: v.id('channels'),
    messageId: v.id('channelMessages'),
    pinnedByUserId: v.id('users'),
    createdAt: v.number(),
  })
    .index('by_channel_id', ['channelId'])
    .index('by_message_id', ['messageId']),

  savedMessages: defineTable({
    organizationId: v.id('organizations'),
    messageId: v.id('channelMessages'),
    userId: v.id('users'),
    createdAt: v.number(),
  })
    .index('by_user_id', ['userId'])
    .index('by_user_id_and_message_id', ['userId', 'messageId']),

  threadFollowers: defineTable({
    organizationId: v.id('organizations'),
    channelId: v.id('channels'),
    threadRootId: v.id('channelMessages'),
    userId: v.id('users'),
    lastReadAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_thread_root_id', ['threadRootId'])
    .index('by_user_id', ['userId'])
    .index('by_user_id_and_thread_root_id', ['userId', 'threadRootId'])
    .index('by_channel_id_and_user_id', ['channelId', 'userId']),

  messageEntityLinks: defineTable({
    organizationId: v.id('organizations'),
    messageId: v.id('channelMessages'),
    entityType: collaborationEntityTypeValidator,
    entityId: v.string(),
    linkedByUserId: v.id('users'),
    createdAt: v.number(),
  })
    .index('by_message_id', ['messageId'])
    .index('by_entity_type_and_entity_id', ['entityType', 'entityId'])
    .index('by_organization_id', ['organizationId']),

  registeredAgents: defineTable({
    organizationId: v.id('organizations'),
    ownerUserId: v.id('users'),
    name: v.string(),
    handle: v.string(),
    description: v.optional(v.string()),
    avatar: v.optional(v.string()),
    provider: agentProviderValidator,
    deviceId: v.id('agentDevices'),
    workspaceId: v.id('deviceWorkspaces'),
    defaultFolder: v.string(),
    model: v.optional(v.string()),
    permissionMode: agentPermissionModeValidator,
    thinkingLevel: v.optional(agentThinkingLevelValidator),
    interactionPolicy: agentInteractionPolicyValidator,
    lifecycleStatus: registeredAgentStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_organization_id', ['organizationId'])
    .index('by_organization_id_and_handle', ['organizationId', 'handle'])
    .index('by_owner_user_id', ['ownerUserId'])
    .index('by_device_id', ['deviceId'])
    .index('by_workspace_id', ['workspaceId']),

  agentChannelMemberships: defineTable({
    organizationId: v.id('organizations'),
    channelId: v.id('channels'),
    agentId: v.id('registeredAgents'),
    addedByUserId: v.id('users'),
    wakeMode: agentWakeModeValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_channel_id', ['channelId'])
    .index('by_agent_id', ['agentId'])
    .index('by_channel_id_and_agent_id', ['channelId', 'agentId']),

  agentAccessGrants: defineTable({
    organizationId: v.id('organizations'),
    agentId: v.id('registeredAgents'),
    userId: v.id('users'),
    canInteract: v.boolean(),
    canControl: v.boolean(),
    grantedByUserId: v.id('users'),
    createdAt: v.number(),
  })
    .index('by_agent_id', ['agentId'])
    .index('by_agent_id_and_user_id', ['agentId', 'userId'])
    .index('by_user_id', ['userId']),

  collaborationAgentRuns: defineTable({
    organizationId: v.id('organizations'),
    agentId: v.id('registeredAgents'),
    channelId: v.id('channels'),
    triggerMessageId: v.id('channelMessages'),
    threadRootId: v.optional(v.id('channelMessages')),
    requestedByUserId: v.id('users'),
    deviceId: v.id('agentDevices'),
    workspaceId: v.id('deviceWorkspaces'),
    processId: v.optional(v.id('agentProcesses')),
    sessionId: v.optional(v.string()),
    status: collaborationRunStatusValidator,
    currentActivity: v.optional(v.string()),
    latestSummary: v.optional(v.string()),
    finalMessageId: v.optional(v.id('channelMessages')),
    error: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_agent_id', ['agentId'])
    .index('by_agent_id_and_status', ['agentId', 'status'])
    .index('by_channel_id_and_created_at', ['channelId', 'createdAt'])
    .index('by_trigger_message_id_and_agent_id', [
      'triggerMessageId',
      'agentId',
    ])
    .index('by_device_id_and_status', ['deviceId', 'status']),

  collaborationRunEvents: defineTable({
    runId: v.id('collaborationAgentRuns'),
    sourceId: v.optional(v.string()),
    kind: collaborationRunEventKindValidator,
    title: v.string(),
    body: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index('by_run_id_and_created_at', ['runId', 'createdAt'])
    .index('by_run_id_and_source_id', ['runId', 'sourceId']),

  // ═══════════════════════════════════════════════════════════════════════════
  // Agent Device Bridge
  // ═══════════════════════════════════════════════════════════════════════════

  // Registered user-owned local runtimes (machines running `vector start`)
  agentDevices: defineTable({
    userId: v.id('users'),
    deviceKey: v.string(),
    deviceSecret: v.optional(v.string()),
    displayName: v.string(),
    hostname: v.optional(v.string()),
    platform: v.optional(v.string()),
    serviceType: agentDeviceServiceTypeValidator,
    cliVersion: v.optional(v.string()),
    status: agentDeviceStatusValidator,
    capabilities: v.optional(v.array(v.string())),
    lastSeenAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_user_device_key', ['userId', 'deviceKey'])
    .index('by_status', ['status'])
    .index('by_user_status', ['userId', 'status']),

  // Approved working directories for delegated runs on a specific device
  deviceWorkspaces: defineTable({
    deviceId: v.id('agentDevices'),
    userId: v.id('users'),
    label: v.string(),
    path: v.string(),
    repoName: v.optional(v.string()),
    repoRemote: v.optional(v.string()),
    defaultBranch: v.optional(v.string()),
    projectId: v.optional(v.id('projects')),
    teamId: v.optional(v.id('teams')),
    isDefault: v.boolean(),
    launchPolicy: workspaceLaunchPolicyValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_device', ['deviceId'])
    .index('by_user', ['userId'])
    .index('by_device_default', ['deviceId', 'isDefault'])
    .index('by_project', ['projectId'])
    .index('by_team', ['teamId']),

  // Reported local processes and managed provider sessions
  agentProcesses: defineTable({
    deviceId: v.id('agentDevices'),
    userId: v.id('users'),
    provider: agentProviderValidator,
    providerLabel: v.optional(v.string()),
    localProcessId: v.optional(v.string()),
    sessionKey: v.optional(v.string()),
    cwd: v.optional(v.string()),
    repoRoot: v.optional(v.string()),
    branch: v.optional(v.string()),
    title: v.optional(v.string()),
    model: v.optional(v.string()),
    permissionMode: v.optional(agentPermissionModeValidator),
    thinkingLevel: v.optional(agentThinkingLevelValidator),
    fastMode: v.optional(v.boolean()),
    contextLength: v.optional(agentContextLengthValidator),
    usage: v.optional(agentUsageStatsValidator),
    cursorRunId: v.optional(v.string()),
    copilotSessionId: v.optional(v.string()),
    opencodeSessionId: v.optional(v.string()),
    tmuxSessionName: v.optional(v.string()),
    tmuxWindowName: v.optional(v.string()),
    tmuxPaneId: v.optional(v.string()),
    mode: agentProcessModeValidator,
    status: agentProcessStatusValidator,
    supportsInboundMessages: v.boolean(),
    startedAt: v.number(),
    lastHeartbeatAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    .index('by_device', ['deviceId'])
    .index('by_user', ['userId'])
    .index('by_user_status', ['userId', 'status'])
    .index('by_device_status', ['deviceId', 'status'])
    .index('by_session_key', ['sessionKey']),

  // Explicit managed-launch record for issue delegation to a device/agent/workspace
  delegatedRuns: defineTable({
    organizationId: v.id('organizations'),
    issueId: v.id('issues'),
    taskId: v.optional(v.id('tasks')),
    liveActivityId: v.id('issueLiveActivities'),
    deviceId: v.id('agentDevices'),
    workspaceId: v.id('deviceWorkspaces'),
    requestedByUserId: v.id('users'),
    provider: agentProviderValidator,
    launchMode: v.literal('delegated_launch'),
    workspacePath: v.string(),
    tmuxSessionName: v.optional(v.string()),
    tmuxWindowName: v.optional(v.string()),
    tmuxPaneId: v.optional(v.string()),
    launchCommand: v.optional(v.string()),
    launchStatus: delegatedRunLaunchStatusValidator,
    launchedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
  })
    .index('by_organization', ['organizationId'])
    .index('by_issue', ['issueId'])
    .index('by_device', ['deviceId'])
    .index('by_live_activity', ['liveActivityId'])
    .index('by_launch_status', ['launchStatus']),

  workSessions: defineTable({
    organizationId: v.id('organizations'),
    issueId: v.id('issues'),
    taskId: v.optional(v.id('tasks')),
    liveActivityId: v.optional(v.id('issueLiveActivities')),
    deviceId: v.id('agentDevices'),
    workspaceId: v.optional(v.id('deviceWorkspaces')),
    ownerUserId: v.id('users'),
    title: v.optional(v.string()),
    status: liveActivityStatusValidator,
    workspacePath: v.optional(v.string()),
    cwd: v.optional(v.string()),
    repoRoot: v.optional(v.string()),
    branch: v.optional(v.string()),
    tmuxSessionName: v.optional(v.string()),
    tmuxWindowName: v.optional(v.string()),
    tmuxPaneId: v.optional(v.string()),
    terminalSnapshot: v.optional(v.string()),
    terminalUpdatedAt: v.optional(v.number()),
    terminalInput: v.optional(v.string()),
    terminalCols: v.optional(v.number()),
    terminalRows: v.optional(v.number()),
    terminalViewerActive: v.optional(v.boolean()),
    titleLockedByUser: v.optional(v.boolean()),
    terminalUrl: v.optional(v.string()),
    terminalToken: v.optional(v.string()),
    terminalLocalPort: v.optional(v.number()),
    agentProvider: v.optional(agentProviderValidator),
    agentProcessId: v.optional(v.id('agentProcesses')),
    agentSessionKey: v.optional(v.string()),
    model: v.optional(v.string()),
    permissionMode: v.optional(agentPermissionModeValidator),
    thinkingLevel: v.optional(agentThinkingLevelValidator),
    fastMode: v.optional(v.boolean()),
    contextLength: v.optional(agentContextLengthValidator),
    queuedMessages: v.optional(v.array(queuedAgentMessageValidator)),
    pendingApproval: v.optional(
      v.union(pendingAgentApprovalValidator, v.null()),
    ),
    pendingPlanApproval: v.optional(
      v.union(pendingPlanApprovalValidator, v.null()),
    ),
    pendingQuestion: v.optional(v.union(pendingQuestionValidator, v.null())),
    codexPlan: v.optional(v.union(codexPlanValidator, v.null())),
    usage: v.optional(v.union(agentUsageStatsValidator, v.null())),
    startedAt: v.number(),
    lastEventAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    .index('by_issue', ['issueId'])
    .index('by_device', ['deviceId'])
    .index('by_device_and_ended_at_and_last_event_at', [
      'deviceId',
      'endedAt',
      'lastEventAt',
    ])
    .index('by_owner', ['ownerUserId'])
    .index('by_live_activity', ['liveActivityId'])
    .index('by_agent_process', ['agentProcessId']),

  workSessionShares: defineTable({
    workSessionId: v.id('workSessions'),
    userId: v.id('users'),
    grantedByUserId: v.id('users'),
    accessLevel: workSessionAccessLevelValidator,
    createdAt: v.number(),
  })
    .index('by_work_session', ['workSessionId'])
    .index('by_user', ['userId'])
    .index('by_work_session_user', ['workSessionId', 'userId']),

  // WebRTC signaling for interactive terminal sessions
  terminalSignals: defineTable({
    workSessionId: v.id('workSessions'),
    from: v.union(v.literal('browser'), v.literal('bridge')),
    type: v.union(
      v.literal('offer'),
      v.literal('answer'),
      v.literal('candidate'),
    ),
    data: v.string(),
    createdAt: v.number(),
  })
    .index('by_work_session', ['workSessionId'])
    .index('by_work_session_from', ['workSessionId', 'from']),

  // Issue-bound projection of a process lifecycle
  issueLiveActivities: defineTable({
    organizationId: v.id('organizations'),
    issueId: v.id('issues'),
    taskId: v.optional(v.id('tasks')),
    deviceId: v.id('agentDevices'),
    workSessionId: v.optional(v.id('workSessions')),
    processId: v.optional(v.id('agentProcesses')),
    ownerUserId: v.id('users'),
    provider: agentProviderValidator,
    title: v.optional(v.string()),
    status: liveActivityStatusValidator,
    latestSummary: v.optional(v.string()),
    startedAt: v.number(),
    lastEventAt: v.number(),
    endedAt: v.optional(v.number()),
    finalCommentId: v.optional(v.id('comments')),
    originKind: v.optional(actorOriginKindValidator),
    clientKind: v.optional(v.string()),
    clientVersion: v.optional(v.string()),
  })
    .index('by_organization', ['organizationId'])
    .index('by_organization_status', ['organizationId', 'status'])
    .index('by_issue', ['issueId'])
    .index('by_issue_status', ['issueId', 'status'])
    .index('by_task', ['taskId'])
    .index('by_device', ['deviceId'])
    .index('by_owner', ['ownerUserId'])
    .index('by_process', ['processId']),

  // Transcript/status stream for a specific live activity
  issueLiveMessages: defineTable({
    liveActivityId: v.id('issueLiveActivities'),
    sourceId: v.optional(v.string()),
    direction: liveMessageDirectionValidator,
    role: liveMessageRoleValidator,
    body: v.string(),
    structuredPayload: v.optional(liveMessageStructuredPayloadValidator),
    deliveryStatus: liveMessageDeliveryStatusValidator,
    createdAt: v.number(),
  })
    .index('by_live_activity', ['liveActivityId'])
    .index('by_live_activity_created', ['liveActivityId', 'createdAt'])
    .index('by_live_activity_and_source_id', ['liveActivityId', 'sourceId']),

  // Outbound command queue from Vector to the local runtime
  agentCommands: defineTable({
    deviceId: v.id('agentDevices'),
    processId: v.optional(v.id('agentProcesses')),
    liveActivityId: v.optional(v.id('issueLiveActivities')),
    collaborationRunId: v.optional(v.id('collaborationAgentRuns')),
    registeredAgentId: v.optional(v.id('registeredAgents')),
    senderUserId: v.id('users'),
    kind: agentCommandKindValidator,
    payload: v.optional(v.any()),
    status: agentCommandStatusValidator,
    createdAt: v.number(),
    claimedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index('by_device', ['deviceId'])
    .index('by_device_status', ['deviceId', 'status'])
    .index('by_live_activity', ['liveActivityId'])
    .index('by_collaboration_run_id', ['collaborationRunId'])
    .index('by_process', ['processId']),

  // User status (Discord-like presence + custom status)
  userStatuses: defineTable({
    userId: v.id('users'),
    presence: v.union(
      v.literal('online'),
      v.literal('idle'),
      v.literal('dnd'),
      v.literal('invisible'),
    ),
    customText: v.optional(v.string()),
    customEmoji: v.optional(v.string()),
    clearsAt: v.optional(v.number()), // timestamp when custom status auto-clears
    updatedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_presence', ['presence']),
});
