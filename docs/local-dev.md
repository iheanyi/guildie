# Local development

`pnpm dev` runs one checkout: its own local Convex backend and the app,
served through [Portless](https://github.com/vercel-labs/portless):

| Checkout | App | Convex backend |
|---|---|---|
| main (`~/Code/guildies`) | `https://guildies.localhost:1355` | `127.0.0.1:3270` / `3271` |
| any other worktree | `https://<folder>.guildies.localhost:1355` | a pair in `20000`–`31999`, stable per worktree |

`<folder>` is the worktree's folder name, lowercased, with a leading
`guildies-` dropped. Each checkout keeps its own data in
`.convex/local/default/`, so worktrees never share a database or fight over
which code is deployed. Run as many as you like at once.

## A new worktree

```sh
git worktree add ../guildies-roster-notes -b roster-notes
cd ../guildies-roster-notes && pnpm dev
```

On the first run `scripts/dev.sh` installs dependencies and creates the local
backend. Then `scripts/dev-seed.sh` gives it its settings:

- **Once cloud dev exists** (`cloud_dev` in `scripts/deployments.sh`): the
  Battle.net dev client, dev gateway, signing keys and guest sign-in, plus the
  `guilds` and `characters` tables. Users and claims are not copied.
- **Until then:** local signing keys, guest sign-in, placeholder Battle.net
  keys (`scripts/dev-env.mjs`) and a fake guild.

Every run sets the backend's `SITE_URL` to the checkout's URL. The first push
waits for the settings and goes through by itself a few seconds later.

Sign-in and claiming work in every checkout once the dev gateway is up:
Battle.net sends everyone to `gateway-dev.guildie.club`, which forwards to
whichever local backend started the flow (docs/auth-environments.md).

The local backend runs the crons too, so a checkout that stays running syncs
its guilds from Blizzard every hour.

## Changing dev settings

Set them on cloud dev, and new worktrees pick them up:

```sh
pbpaste | npx convex env set --deployment <cloud dev> NAME
```

Existing checkouts keep what they were seeded with. Set it there too
(`npx convex env set NAME value` inside the checkout), or delete the
checkout's `.convex/local` to reseed, which also wipes its data.

## Notes

- Portless's proxy runs on port 1355, shared with Onda, Sportsball and Kino.
  If the browser warns about the certificate, run `portless trust` once.
- `scripts/dev.sh` writes the checkout's `CONVEX_DEPLOYMENT`, `VITE_CONVEX_*`
  and `VITE_SITE_URL` into `.env.local` before starting anything; other lines
  are kept.
- A checkout's backend is recognised by its data folder. `pnpm dev` stops one
  left behind by a crashed run, refuses to start if the checkout is already
  running elsewhere, and stops its backend when it exits.
- `npx convex …` inside a checkout targets its local backend (set
  `CONVEX_AGENT_MODE=anonymous` when running it by hand). Use `--deployment`
  or `--prod` for cloud deployments.
- Removing a worktree (`git worktree remove`) removes its data with it.
