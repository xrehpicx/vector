/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as _shared_auth from "../_shared/auth.js";
import type * as _shared_pagination from "../_shared/pagination.js";
import type * as _shared_permissions from "../_shared/permissions.js";
import type * as _shared_validation from "../_shared/validation.js";
import type * as access from "../access.js";
import type * as auth from "../auth.js";
import type * as hello from "../hello.js";
import type * as http from "../http.js";
import type * as issues from "../issues.js";
import type * as migrations from "../migrations.js";
import type * as organizations from "../organizations.js";
import type * as permissions from "../permissions.js";
import type * as projects from "../projects.js";
import type * as roles from "../roles.js";
import type * as teams from "../teams.js";
import type * as users from "../users.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  "_shared/auth": typeof _shared_auth;
  "_shared/pagination": typeof _shared_pagination;
  "_shared/permissions": typeof _shared_permissions;
  "_shared/validation": typeof _shared_validation;
  access: typeof access;
  auth: typeof auth;
  hello: typeof hello;
  http: typeof http;
  issues: typeof issues;
  migrations: typeof migrations;
  organizations: typeof organizations;
  permissions: typeof permissions;
  projects: typeof projects;
  roles: typeof roles;
  teams: typeof teams;
  users: typeof users;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
