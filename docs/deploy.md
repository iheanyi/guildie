# Deploying

Cloudflare Workers Builds deploys every push to `natedunn/guildie`. `main`
runs `scripts/cloudflare-deploy.sh`. Every other branch runs
`scripts/preview-build.sh` and then `wrangler preview`. Same setup as Onda
and Sportsball.

| Branch | Convex | Worker | URL |
|---|---|---|---|
| `main` | prod | `wrangler deploy` | `https://guildie.club` |
| anything else | a preview named after the branch | `wrangler preview --name <branch>` | `https://<branch>.preview.guildie.club` |

The branch name becomes one DNS label: lowercased, anything outside
`[a-z0-9-]` turned into `-`, cut to 40 characters (`feat/Notes` →
`feat-notes`). See `scripts/preview-name.sh`.

## How it works

- **Convex URLs are baked in at build.** `convex deploy --cmd` sets
  `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` for the build. The Worker has
  no runtime secrets; Blizzard calls run in Convex.
- **The gateway needs no registration.** A deployment signs its own address
  into the OAuth `state`, and the dev gateway accepts any `*.convex.site`, so
  new previews sign in through `gateway-dev.guildie.club` with no setup.
- **Convex previews start from defaults** (`scripts/preview-defaults.sh`):
  cloud dev's settings plus a signing key pair just for previews. The build
  script sets the one value that differs per branch, `SITE_URL`.
- **Previews start empty.** Add a guild in the preview and it syncs from
  Blizzard; the crons keep it current.
- **Cleanup is automatic.** When a pull request closes or a branch is
  deleted, `.github/workflows/preview-cleanup.yml` runs
  `scripts/preview-delete.sh`, which deletes the branch's Worker Preview and
  Convex preview.

## One-time setup (not done yet)

Step by step, with commands and checks: [docs/setup.md](setup.md). In short:

1. **Domain**: add `guildie.club` to the Cloudflare account "Nate".
2. **Convex project** `guildie` (team `nate-dunn`) with a cloud dev and a
   prod deployment. Put cloud dev's name and the project id in
   `scripts/deployments.sh`; put prod's URL in the prod gateway's
   `ALLOWED_TARGETS`.
3. **Battle.net clients**: `guildie-dev` and `guildie`, with the redirect
   URLs in docs/auth-environments.md.
4. **Gateways**: routing secrets and deploys (docs/auth-environments.md).
5. **Cloud dev settings**: everything in the "Cloud dev" column of
   docs/auth-environments.md. Then `pnpm push:cloud-dev`.
6. **Prod settings**: the "Prod" column.
7. **Preview defaults**: `sh scripts/preview-defaults.sh`.
8. **Workers Builds** (Workers & Pages → `guildie` → Settings → Builds):
   - Git repository `natedunn/guildie`, production branch `main`
   - Build command: *(empty)*
   - Deploy command: `sh scripts/cloudflare-deploy.sh`
   - Preview command:
     `sh scripts/preview-build.sh && npx wrangler preview --name "$(sh scripts/preview-name.sh)"`
   - Preview builds on, using Worker Previews
   - Build secret `CONVEX_DEPLOY_KEY`: the prod deploy key on Production, a
     preview deploy key on Previews Base
9. **Preview cleanup**: GitHub Actions secrets `CLOUDFLARE_ACCOUNT_ID`
   (`fc87b44f5832b25053fec2efb19fc208`), `CLOUDFLARE_API_TOKEN` (Workers
   Scripts: Edit) and `CONVEX_MANAGEMENT_TOKEN` (a Convex team access token).

## Deploying by hand

`pnpm release` deploys prod and `pnpm release:preview` previews the current
branch. Each needs the matching key in `CONVEX_DEPLOY_KEY`.
