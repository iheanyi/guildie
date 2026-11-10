# Security

## Reporting a problem

Please report security problems privately, not in an issue or pull request:

GitHub: **Security → Report a vulnerability** on
[natedunn/guildie](https://github.com/natedunn/guildie/security/advisories/new).
If that doesn't work for you, ask the maintainer (@natedunn) for a private
way to talk, without details in public.

Say what you found, how to reproduce it, and what it lets someone do. We'll
answer within a few days, fix it, and credit you if you want. Please don't
test against other players' accounts or data; use your own local copy
(`pnpm dev`, docs/local-dev.md) or your own characters.

## What's sensitive

- **Upload tokens** (`gld_…`). The desktop app (and the retired helper) use
  them to upload addon data and download guild data for a player. Only their
  hash is stored (`apps/web/convex/helper.ts`); a leak lets someone upload
  game data as that player or read their guilds' data.
- **Desktop sign-in and pairing codes** (`/helper/connect`, `/desktop/session`,
  `auth:signInWithDesktopCode`): one-time codes that become a session or a
  token.
- **The desktop bridge** (`window.guildieDesktop`, `apps/desktop/src/preload.ts`,
  `main.ts`, `origins.ts`). It connects web pages to the player's computer
  (WoW folder, addon files). It must only appear on Guildie's own origins,
  only accept calls from the main frame of the configured site, validate
  every argument, and never hand a token back to the page.
- **The addon data path.** `GuildieData.lua` is run by the game as code; it
  must stay data literals only (`packages/sync/src/luaData.ts`). Uploaded
  payloads are untrusted and checked in `apps/web/convex/addonPayload.ts`.
- **Battle.net sign-in and claiming** (Convex Auth v2 beta with our patch,
  `apps/web/convex/auth*.ts`, `claims.ts`, `apps/gateway`): redirect origins,
  the gateway's signed `state`, and who may claim which character.
- **Members-only guilds**: their rosters must not reach people outside the
  guild, on the site or through guild data downloads.

## Out of scope

- Data Blizzard publishes anyway (public guild rosters and character profiles).
- Guest sign-in on a local backend (it only turns on there: `isLocalBackend`
  in `apps/web/convex/origins.ts`). If you can turn it on in the cloud, that
  _is_ in scope.
- The Windows builds being unsigned (SmartScreen's warning is known).
