/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as authBattlenet from "../authBattlenet.js";
import type * as authGateway from "../authGateway.js";
import type * as blizzard from "../blizzard.js";
import type * as buildSite from "../buildSite.js";
import type * as claims from "../claims.js";
import type * as crons from "../crons.js";
import type * as dev from "../dev.js";
import type * as guilds from "../guilds.js";
import type * as http from "../http.js";
import type * as origins from "../origins.js";
import type * as shared_wow from "../shared/wow.js";
import type * as sync from "../sync.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authBattlenet: typeof authBattlenet;
  authGateway: typeof authGateway;
  blizzard: typeof blizzard;
  buildSite: typeof buildSite;
  claims: typeof claims;
  crons: typeof crons;
  dev: typeof dev;
  guilds: typeof guilds;
  http: typeof http;
  origins: typeof origins;
  "shared/wow": typeof shared_wow;
  sync: typeof sync;
  users: typeof users;
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
  auth: import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">;
  authBattlenet: import("@convex-dev/auth/components/oauth/_generated/component.js").ComponentApi<"authBattlenet">;
  authAnonymous: import("@convex-dev/auth/components/anonymous/_generated/component.js").ComponentApi<"authAnonymous">;
};
