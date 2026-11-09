# Auth environments

Sign-in is Battle.net, through Convex Auth v2 (`@convex-dev/auth@2.0.0-beta.0`,
pinned and patched). The setup is Onda's and Sportsball's: one Battle.net
client per tier, and a gateway Worker per tier that forwards Battle.net's
callback to whichever Convex deployment started the flow. That's what lets
every worktree, every branch preview and cloud dev share one client.

## Tiers

| Tier | Serves | Gateway | Battle.net client |
|---|---|---|---|
| Dev | local worktrees, cloud dev, branch previews | `https://gateway-dev.guildie.club` | `guildie-dev` |
| Prod | guildie.club, prod Convex | `https://gateway.guildie.club` | `guildie` |

Each client registers two redirect URLs, and they never change:

| Tier | Sign-in | Claim my characters |
|---|---|---|
| Dev | `https://gateway-dev.guildie.club/oauth/battlenet/callback` | `https://gateway-dev.guildie.club/oauth/claim/callback` |
| Prod | `https://gateway.guildie.club/oauth/battlenet/callback` | `https://gateway.guildie.club/oauth/claim/callback` |

Sign-in asks for `openid`; claiming asks for `wow.profile`. We never store
Battle.net's tokens.

## How a sign-in flows

1. `auth:startSignInWithBattlenet` (`viaGateway` in `convex/authGateway.ts`)
   runs the package's start, then prefixes `state` in Battle.net's URL with
   `<b64url(CONVEX_SITE_URL)>.<b64url(HMAC(secret, "battlenet\n" + site))>.`.
   The browser keeps the plain state. `redirect_uri` is the gateway (patch).
2. Battle.net redirects to `<gateway>/oauth/battlenet/callback`.
3. The gateway (`workers/gateway`) checks the HMAC with `ROUTING_SECRET` and
   the target against `ALLOWED_TARGETS`, then 302s to
   `<target>/oauth/battlenet/callback` with the plain state. It holds no
   Battle.net credentials. Callbacks are rate limited per IP.
4. The deployment's stock callback exchanges the code (sending the gateway
   URL as `redirect_uri`) and returns the browser to the app origin that
   started the sign-in. That origin must be in the deployment's `SITE_URL`
   (exact match; comma-separate several).

## How claiming flows

The same routing, with provider `claim` (`convex/claims.ts`):

1. `claims:start` records the request (user, region, app origin) and sends
   the browser to Battle.net with the prefixed state and
   `AUTH_CLAIM_CALLBACK_URL` as `redirect_uri`.
2. The gateway forwards to `<CONVEX_SITE_URL>/oauth/claim/callback`
   (`convex/http.ts`), which bounces the browser to `<app>/claim/callback`.
3. The app checks the state against sessionStorage and calls `claims:complete`
   as the signed-in user, which exchanges the code and reads the account's
   characters. Only the person who started, in the same browser, can finish.

## What we carry on top of the package

| Thing | Where | Remove when |
|---|---|---|
| **Patch:** optional `CALLBACK_URL` component env | `patches/@convex-dev__auth.patch` | Upstream supports a configurable callback (convex-auth#1) |
| `viaGateway` wrapper (calls the package's mutation through the undocumented `_handler`) | `convex/authGateway.ts` | Same |
| Gateway Worker | `workers/gateway` | Same |

The patch is Onda's. When upgrading the package, check it still applies
(`pnpm install` fails if it doesn't) and read Onda's `docs/convex-auth.md`.

## Deployment settings

Each tier has one routing secret, shared by its gateway and every deployment
in the tier. Generate it once per tier (`openssl rand -base64 32`) and keep it
in the password manager. Pipe secrets in so they stay out of shell history.

| Variable | Cloud dev | Prod |
|---|---|---|
| `AUTH_PRIVATE_KEY`, `AUTH_JWKS` | dev key pair | its own key pair |
| `BATTLENET_CLIENT_ID`, `BATTLENET_CLIENT_SECRET` | `guildie-dev` | `guildie` |
| `AUTH_GATEWAY_SECRET` | dev routing secret | prod routing secret |
| `AUTH_BATTLENET_CALLBACK_URL` | `https://gateway-dev.guildie.club/oauth/battlenet/callback` | `https://gateway.guildie.club/oauth/battlenet/callback` |
| `AUTH_CLAIM_CALLBACK_URL` | `https://gateway-dev.guildie.club/oauth/claim/callback` | `https://gateway.guildie.club/oauth/claim/callback` |
| `AUTH_DEV_GUEST` | `true` | unset |
| `SITE_URL` | set per checkout / preview | `https://guildie.club` |

Leave `AUTH_GATEWAY_SECRET` and both `AUTH_*_CALLBACK_URL` unset to use the
deployment's own callbacks instead (then register
`<CONVEX_SITE_URL>/oauth/battlenet/callback` and
`<CONVEX_SITE_URL>/oauth/claim/callback` with Battle.net).

Local worktrees copy everything except `SITE_URL` from cloud dev
(docs/local-dev.md). Branch previews start from the preview defaults: cloud
dev's settings plus a signing key pair just for previews
(`scripts/preview-defaults.sh`).

### Signing keys

`AUTH_PRIVATE_KEY` is a base64-encoded PKCS#8 PEM and `AUTH_JWKS` the matching
public JWKS. `scripts/dev-env.mjs` shows how to generate a pair; for a cloud
deployment, generate one the same way and pipe each value into
`npx convex env set --deployment <name> NAME`. A new pair signs everyone out.

### Gateways

From `workers/gateway`:

```sh
pnpm install
pnpm test && pnpm check
pnpm wrangler secret put ROUTING_SECRET -c wrangler.jsonc --env dev
pnpm deploy:dev
pnpm wrangler secret put ROUTING_SECRET -c wrangler.jsonc --env prod
pnpm deploy:prod
```

Each deploy creates its custom domain on the `guildie.club` zone. The dev
gateway accepts any `*.convex.site` and loopback (`http://127.0.0.1:*`,
`http://localhost:*`), since the browser follows the redirect. The prod
gateway only forwards to the prod deployment: set `ALLOWED_TARGETS` in
`workers/gateway/wrangler.jsonc` once it exists. `https://<gateway>/` answers
"guildie sign-in gateway." when it's up.
