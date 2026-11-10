# Convex Auth v2: what we carry

We run `@convex-dev/auth@2.0.0-beta.0`. Upstream is `get-convex/convex-auth`
(v2 on the `reboot` branch), docs at <https://auth-v2.previews.convex.dev>.
Upstream says not to use v2 in production yet and only fixes the newest
beta, so we upgrade promptly. The onda repo tracks upstream in detail
(`onda/docs/convex-auth.md`); its upgrade checklist applies here too.

| Thing | Where | Why | Remove when |
|---|---|---|---|
| TanStack Start SSR adapter | `src/lib/convex-auth-start/`, `src/routes/auth/*` | Only a Next.js adapter ships | Official adapter (#350, #126) |
| `#convex-auth-react-internal` alias, `optimizeDeps` exclude | `tsconfig.json`, `vite.config.ts` | `AuthProvider` isn't exported | Package exports it |
| **Patch**: optional `CALLBACK_URL` component env, `viaGateway`, gateway Worker | `patches/`, `convex/authGateway.ts`, `workers/gateway` | One callback per tier for every deployment (docs/auth-environments.md) | Configurable callback upstream (#1) |
| Battle.net catalog | `convex/authBattlenet.ts` | No built-in Battle.net method | Keep |
| Claim flow (own OAuth, through the gateway) | `convex/claims.ts`, `convex/http.ts`, `src/routes/claim/callback.tsx` | No account linking or provider tokens in v2 | Upstream linking / provider tokens (#751, #429) |
| Dev guest sign-in | `convex/auth.ts`, `convex/users.ts` | Use the app without keys | Keep (local backends only, `isLocalBackend` in `convex/origins.ts`) |

## Next beta: known breaking changes

Merged upstream after beta.0 (see onda's checklist for links):

- Deployment-issued JWTs: no `AUTH_PRIVATE_KEY` / `AUTH_JWKS`; needs
  `convex@^1.48`. Drop both from `convex/convex.config.ts`,
  `scripts/dev-env.mjs` and `scripts/preview-defaults.sh`, and use `convexAuthProvider()` in `auth.config.ts`.
- Stateful sessions, new JWT audience: everyone signs in again.
- Schema changes in the auth component: clear `auth/sessions` and
  `auth/refreshTokens` before upgrading.
- Possibly: `oauth`/`ambientSignIns` no longer exported from
  `methods/oauth/react` (#750); adapter `provider.tsx` would drop them.

## Check for updates

```sh
npm view @convex-dev/auth dist-tags versions --json
```
