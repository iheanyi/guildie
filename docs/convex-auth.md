# Convex Auth v2: what we carry

We run `@convex-dev/auth@2.0.0-beta.0`. Upstream is `get-convex/convex-auth`
(v2 on the `reboot` branch), docs at <https://auth-v2.previews.convex.dev>.
Upstream says not to use v2 in production yet and only fixes the newest
beta, so we upgrade promptly. The onda repo tracks upstream in detail
(`onda/docs/convex-auth.md`); its upgrade checklist applies here too.

| Thing | Where | Why | Remove when |
|---|---|---|---|
| TanStack Start SSR adapter | `apps/web/src/lib/convex-auth-start/`, `apps/web/src/routes/auth/*` | Only a Next.js adapter ships | Official adapter (#350, #126) |
| `#convex-auth-react-internal` alias, `optimizeDeps` exclude | `tsconfig.json`, `vite.config.ts` | `AuthProvider` isn't exported | Package exports it |
| **Patch**: optional `CALLBACK_URL` component env, `viaGateway`, gateway Worker | `patches/`, `apps/web/convex/authGateway.ts`, `apps/gateway` | One callback per tier for every deployment (docs/auth-environments.md) | Configurable callback upstream (#1) |
| Battle.net catalog | `apps/web/convex/authBattlenet.ts` | No built-in Battle.net method | Keep |
| Claim flow (own OAuth, through the gateway) | `apps/web/convex/claims.ts`, `apps/web/convex/http.ts`, `apps/web/src/routes/claim/callback.tsx` | No account linking or provider tokens in v2 | Upstream linking / provider tokens (#751, #429) |
| Dev guest sign-in | `apps/web/convex/auth.ts`, `apps/web/convex/users.ts` | Use the app without keys | Keep (local backends only, `isLocalBackend` in `apps/web/convex/origins.ts`) |

## Next beta: known breaking changes

Merged upstream after beta.0 (see onda's checklist for links):

- Deployment-issued JWTs: no `AUTH_PRIVATE_KEY` / `AUTH_JWKS`; needs
  `convex@^1.48`. Drop both from `apps/web/convex/convex.config.ts`,
  `apps/web/scripts/dev-env.mjs` and `apps/web/scripts/preview-defaults.sh`, and use `convexAuthProvider()` in `auth.config.ts`.
- Stateful sessions, new JWT audience: everyone signs in again.
- Schema changes in the auth component: clear `auth/sessions` and
  `auth/refreshTokens` before upgrading.
- Possibly: `oauth`/`ambientSignIns` no longer exported from
  `methods/oauth/react` (#750); adapter `provider.tsx` would drop them.

## Check for updates

```sh
npm view @convex-dev/auth dist-tags versions --json
```
