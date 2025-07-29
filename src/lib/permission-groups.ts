import { PERMISSIONS } from "@/convex/_shared/permissions";

export const ALL_PERMISSIONS_WITH_GROUP = [
  {
    group: "Organization",
    permissions: [
      { id: PERMISSIONS.ORG_VIEW, label: "View Organization" },
      { id: PERMISSIONS.ORG_MANAGE_SETTINGS, label: "Manage Settings" },
      { id: PERMISSIONS.ORG_MANAGE_BILLING, label: "Manage Billing" },
      { id: PERMISSIONS.ORG_MANAGE_MEMBERS, label: "Manage Members" },
      { id: PERMISSIONS.ORG_MANAGE_ROLES, label: "Manage Roles" },
    ],
  },
  {
    group: "Projects",
    permissions: [
      { id: PERMISSIONS.PROJECT_CREATE, label: "Create Project" },
      { id: PERMISSIONS.PROJECT_VIEW, label: "View Project" },
      { id: PERMISSIONS.PROJECT_EDIT, label: "Edit Project" },
      { id: PERMISSIONS.PROJECT_DELETE, label: "Delete Project" },
      { id: PERMISSIONS.PROJECT_MEMBER_ADD, label: "Add Member" },
      { id: PERMISSIONS.PROJECT_MEMBER_REMOVE, label: "Remove Member" },
    ],
  },
  {
    group: "Teams",
    permissions: [
      { id: PERMISSIONS.TEAM_CREATE, label: "Create Team" },
      { id: PERMISSIONS.TEAM_VIEW, label: "View Team" },
      { id: PERMISSIONS.TEAM_EDIT, label: "Edit Team" },
      { id: PERMISSIONS.TEAM_DELETE, label: "Delete Team" },
      { id: PERMISSIONS.TEAM_MEMBER_ADD, label: "Add Member" },
      { id: PERMISSIONS.TEAM_MEMBER_REMOVE, label: "Remove Member" },
    ],
  },
  {
    group: "Issues",
    permissions: [
      { id: PERMISSIONS.ISSUE_CREATE, label: "Create Issue" },
      { id: PERMISSIONS.ISSUE_VIEW, label: "View Issue" },
      { id: PERMISSIONS.ISSUE_EDIT, label: "Edit Issue" },
      { id: PERMISSIONS.ISSUE_DELETE, label: "Delete Issue" },
      { id: PERMISSIONS.ISSUE_ASSIGN, label: "Assign Issue" },
    ],
  },
];
