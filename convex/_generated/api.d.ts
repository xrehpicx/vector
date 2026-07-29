/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _shared_activity from "../_shared/activity.js";
import type * as _shared_agentBridge from "../_shared/agentBridge.js";
import type * as _shared_auth from "../_shared/auth.js";
import type * as _shared_collaboration from "../_shared/collaboration.js";
import type * as _shared_document_appearance from "../_shared/document_appearance.js";
import type * as _shared_document_content from "../_shared/document_content.js";
import type * as _shared_document_mentions from "../_shared/document_mentions.js";
import type * as _shared_leads from "../_shared/leads.js";
import type * as _shared_pagination from "../_shared/pagination.js";
import type * as _shared_permissions from "../_shared/permissions.js";
import type * as _shared_typeGuards from "../_shared/typeGuards.js";
import type * as _shared_validation from "../_shared/validation.js";
import type * as _shared_work from "../_shared/work.js";
import type * as access from "../access.js";
import type * as activities_lib from "../activities/lib.js";
import type * as activities_queries from "../activities/queries.js";
import type * as agentBridge_bridgeAuth from "../agentBridge/bridgeAuth.js";
import type * as agentBridge_bridgePublic from "../agentBridge/bridgePublic.js";
import type * as agentBridge_httpEndpoints from "../agentBridge/httpEndpoints.js";
import type * as agentBridge_internal from "../agentBridge/internal.js";
import type * as agentBridge_mutations from "../agentBridge/mutations.js";
import type * as agentBridge_queries from "../agentBridge/queries.js";
import type * as agentBridge_workSessions from "../agentBridge/workSessions.js";
import type * as ai_actions from "../ai/actions.js";
import type * as ai_agent from "../ai/agent.js";
import type * as ai_comment_agent from "../ai/comment_agent.js";
import type * as ai_icons from "../ai/icons.js";
import type * as ai_internal from "../ai/internal.js";
import type * as ai_language_model_wrappers from "../ai/language_model_wrappers.js";
import type * as ai_lib from "../ai/lib.js";
import type * as ai_mutations from "../ai/mutations.js";
import type * as ai_provider from "../ai/provider.js";
import type * as ai_queries from "../ai/queries.js";
import type * as ai_tools from "../ai/tools.js";
import type * as auth from "../auth.js";
import type * as authUtils from "../authUtils.js";
import type * as authz from "../authz.js";
import type * as cli from "../cli.js";
import type * as collaboration_agents from "../collaboration/agents.js";
import type * as collaboration_bridge from "../collaboration/bridge.js";
import type * as collaboration_channels from "../collaboration/channels.js";
import type * as collaboration_fixtures from "../collaboration/fixtures.js";
import type * as collaboration_helpers from "../collaboration/helpers.js";
import type * as collaboration_messages from "../collaboration/messages.js";
import type * as collaboration_presence from "../collaboration/presence.js";
import type * as collaboration_runs from "../collaboration/runs.js";
import type * as collaboration_validators from "../collaboration/validators.js";
import type * as crons from "../crons.js";
import type * as documents_content from "../documents/content.js";
import type * as documents_contentCleanup from "../documents/contentCleanup.js";
import type * as documents_folderMutations from "../documents/folderMutations.js";
import type * as documents_folderQueries from "../documents/folderQueries.js";
import type * as documents_mentions from "../documents/mentions.js";
import type * as documents_mutations from "../documents/mutations.js";
import type * as documents_presence from "../documents/presence.js";
import type * as documents_queries from "../documents/queries.js";
import type * as email_otp from "../email/otp.js";
import type * as github_actions from "../github/actions.js";
import type * as github_mutations from "../github/mutations.js";
import type * as github_node from "../github/node.js";
import type * as github_queries from "../github/queries.js";
import type * as github_shared from "../github/shared.js";
import type * as http from "../http.js";
import type * as issues_keys from "../issues/keys.js";
import type * as issues_mutations from "../issues/mutations.js";
import type * as issues_queries from "../issues/queries.js";
import type * as issues_search from "../issues/search.js";
import type * as migrations_index from "../migrations/index.js";
import type * as notifications_actions from "../notifications/actions.js";
import type * as notifications_emailTemplates from "../notifications/emailTemplates.js";
import type * as notifications_lib from "../notifications/lib.js";
import type * as notifications_mutations from "../notifications/mutations.js";
import type * as notifications_queries from "../notifications/queries.js";
import type * as notifications_shared from "../notifications/shared.js";
import type * as og_queries from "../og/queries.js";
import type * as organizations_mutations from "../organizations/mutations.js";
import type * as organizations_queries from "../organizations/queries.js";
import type * as permissions_queries from "../permissions/queries.js";
import type * as permissions_utils from "../permissions/utils.js";
import type * as platformAdmin_actions from "../platformAdmin/actions.js";
import type * as platformAdmin_lib from "../platformAdmin/lib.js";
import type * as platformAdmin_mutations from "../platformAdmin/mutations.js";
import type * as platformAdmin_queries from "../platformAdmin/queries.js";
import type * as presence from "../presence.js";
import type * as projects_mutations from "../projects/mutations.js";
import type * as projects_queries from "../projects/queries.js";
import type * as reminders from "../reminders.js";
import type * as requests_autoRouting from "../requests/autoRouting.js";
import type * as requests_autoRoutingActions from "../requests/autoRoutingActions.js";
import type * as requests_lib from "../requests/lib.js";
import type * as requests_mutations from "../requests/mutations.js";
import type * as requests_queries from "../requests/queries.js";
import type * as roles_index from "../roles/index.js";
import type * as search_queries from "../search/queries.js";
import type * as status from "../status.js";
import type * as tasks_mutations from "../tasks/mutations.js";
import type * as tasks_queries from "../tasks/queries.js";
import type * as teams_mutations from "../teams/mutations.js";
import type * as teams_queries from "../teams/queries.js";
import type * as users from "../users.js";
import type * as views_mutations from "../views/mutations.js";
import type * as views_queries from "../views/queries.js";
import type * as work_handoffs from "../work/handoffs.js";
import type * as work_lib from "../work/lib.js";
import type * as work_mutations from "../work/mutations.js";
import type * as work_queries from "../work/queries.js";
import type * as work_requestReconciliation from "../work/requestReconciliation.js";
import type * as workModelMigrations from "../workModelMigrations.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_shared/activity": typeof _shared_activity;
  "_shared/agentBridge": typeof _shared_agentBridge;
  "_shared/auth": typeof _shared_auth;
  "_shared/collaboration": typeof _shared_collaboration;
  "_shared/document_appearance": typeof _shared_document_appearance;
  "_shared/document_content": typeof _shared_document_content;
  "_shared/document_mentions": typeof _shared_document_mentions;
  "_shared/leads": typeof _shared_leads;
  "_shared/pagination": typeof _shared_pagination;
  "_shared/permissions": typeof _shared_permissions;
  "_shared/typeGuards": typeof _shared_typeGuards;
  "_shared/validation": typeof _shared_validation;
  "_shared/work": typeof _shared_work;
  access: typeof access;
  "activities/lib": typeof activities_lib;
  "activities/queries": typeof activities_queries;
  "agentBridge/bridgeAuth": typeof agentBridge_bridgeAuth;
  "agentBridge/bridgePublic": typeof agentBridge_bridgePublic;
  "agentBridge/httpEndpoints": typeof agentBridge_httpEndpoints;
  "agentBridge/internal": typeof agentBridge_internal;
  "agentBridge/mutations": typeof agentBridge_mutations;
  "agentBridge/queries": typeof agentBridge_queries;
  "agentBridge/workSessions": typeof agentBridge_workSessions;
  "ai/actions": typeof ai_actions;
  "ai/agent": typeof ai_agent;
  "ai/comment_agent": typeof ai_comment_agent;
  "ai/icons": typeof ai_icons;
  "ai/internal": typeof ai_internal;
  "ai/language_model_wrappers": typeof ai_language_model_wrappers;
  "ai/lib": typeof ai_lib;
  "ai/mutations": typeof ai_mutations;
  "ai/provider": typeof ai_provider;
  "ai/queries": typeof ai_queries;
  "ai/tools": typeof ai_tools;
  auth: typeof auth;
  authUtils: typeof authUtils;
  authz: typeof authz;
  cli: typeof cli;
  "collaboration/agents": typeof collaboration_agents;
  "collaboration/bridge": typeof collaboration_bridge;
  "collaboration/channels": typeof collaboration_channels;
  "collaboration/fixtures": typeof collaboration_fixtures;
  "collaboration/helpers": typeof collaboration_helpers;
  "collaboration/messages": typeof collaboration_messages;
  "collaboration/presence": typeof collaboration_presence;
  "collaboration/runs": typeof collaboration_runs;
  "collaboration/validators": typeof collaboration_validators;
  crons: typeof crons;
  "documents/content": typeof documents_content;
  "documents/contentCleanup": typeof documents_contentCleanup;
  "documents/folderMutations": typeof documents_folderMutations;
  "documents/folderQueries": typeof documents_folderQueries;
  "documents/mentions": typeof documents_mentions;
  "documents/mutations": typeof documents_mutations;
  "documents/presence": typeof documents_presence;
  "documents/queries": typeof documents_queries;
  "email/otp": typeof email_otp;
  "github/actions": typeof github_actions;
  "github/mutations": typeof github_mutations;
  "github/node": typeof github_node;
  "github/queries": typeof github_queries;
  "github/shared": typeof github_shared;
  http: typeof http;
  "issues/keys": typeof issues_keys;
  "issues/mutations": typeof issues_mutations;
  "issues/queries": typeof issues_queries;
  "issues/search": typeof issues_search;
  "migrations/index": typeof migrations_index;
  "notifications/actions": typeof notifications_actions;
  "notifications/emailTemplates": typeof notifications_emailTemplates;
  "notifications/lib": typeof notifications_lib;
  "notifications/mutations": typeof notifications_mutations;
  "notifications/queries": typeof notifications_queries;
  "notifications/shared": typeof notifications_shared;
  "og/queries": typeof og_queries;
  "organizations/mutations": typeof organizations_mutations;
  "organizations/queries": typeof organizations_queries;
  "permissions/queries": typeof permissions_queries;
  "permissions/utils": typeof permissions_utils;
  "platformAdmin/actions": typeof platformAdmin_actions;
  "platformAdmin/lib": typeof platformAdmin_lib;
  "platformAdmin/mutations": typeof platformAdmin_mutations;
  "platformAdmin/queries": typeof platformAdmin_queries;
  presence: typeof presence;
  "projects/mutations": typeof projects_mutations;
  "projects/queries": typeof projects_queries;
  reminders: typeof reminders;
  "requests/autoRouting": typeof requests_autoRouting;
  "requests/autoRoutingActions": typeof requests_autoRoutingActions;
  "requests/lib": typeof requests_lib;
  "requests/mutations": typeof requests_mutations;
  "requests/queries": typeof requests_queries;
  "roles/index": typeof roles_index;
  "search/queries": typeof search_queries;
  status: typeof status;
  "tasks/mutations": typeof tasks_mutations;
  "tasks/queries": typeof tasks_queries;
  "teams/mutations": typeof teams_mutations;
  "teams/queries": typeof teams_queries;
  users: typeof users;
  "views/mutations": typeof views_mutations;
  "views/queries": typeof views_queries;
  "work/handoffs": typeof work_handoffs;
  "work/lib": typeof work_lib;
  "work/mutations": typeof work_mutations;
  "work/queries": typeof work_queries;
  "work/requestReconciliation": typeof work_requestReconciliation;
  workModelMigrations: typeof workModelMigrations;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  betterAuth: import("../betterAuth/_generated/component.js").ComponentApi<"betterAuth">;
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
  presence: import("@convex-dev/presence/_generated/component.js").ComponentApi<"presence">;
};
