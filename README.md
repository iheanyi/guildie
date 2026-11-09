# guildies

A home base for World of Warcraft guilds: who's in the guild, their level,
class, race, rank, gear and professions. Built for **WoW: Forever** first,
open source so any guild can run it or build on it.

Status: proof of concept. See [docs/roadmap.md](docs/roadmap.md) for where
it's headed (Discord, guild chat, an in-game addon).

## Stack

- [TanStack Start](https://tanstack.com/start) (React, SSR)
- [Convex](https://convex.dev) for the database, sync jobs and auth
- [Convex Auth v2](https://auth-v2.previews.convex.dev) (beta) with Battle.net sign-in
- Cloudflare Workers, with Worker Previews per branch
- [shadcn/ui](https://ui.shadcn.com) on [Base UI](https://base-ui.com), Tailwind v4

## Run it

```sh
pnpm install
pnpm dev        # https://guildies.localhost:1355 (worktrees get their own URL)
```

Each checkout (main or a git worktree) gets its own local Convex backend,
data and URL through Portless, so several can run at once:
[docs/local-dev.md](docs/local-dev.md). A fresh checkout starts with a fake
guild and a guest sign-in. For real data, create a Blizzard API client:
[docs/blizzard-setup.md](docs/blizzard-setup.md).

Sign-in works the same in every worktree, branch preview and production
through a small OAuth gateway Worker: [docs/auth-environments.md](docs/auth-environments.md).
Deploys and branch previews run on Cloudflare Workers: [docs/deploy.md](docs/deploy.md).
Setting it all up from scratch: [docs/setup.md](docs/setup.md).

## How data flows

- **Rosters**: `convex/sync.ts` pulls each guild's roster from Blizzard's API
  every hour (and on "Sync now"), then each member's profile, equipment,
  professions and avatar, staggered under Blizzard's rate limits.
- **Sign-in**: Battle.net OpenID Connect. We learn the BattleTag, nothing else.
- **Claiming characters**: a separate, explicit Battle.net authorization with
  the `wow.profile` scope. We read the account's character list once, store
  the names, and drop the token. That's how a person is tied to guild members.

## What Blizzard's API can't tell us

- **Who's online right now.** Not exposed. We show "last seen" (last logout).
  Real presence needs the addon (roadmap).
- **Characters below level 10**, or that haven't logged out since reaching
  it: they're on the roster (name, level, class, race, rank) but have no
  profile, gear or professions yet.
- **Rank names**: only rank numbers. 0 is the guild master.
- WoW: Forever's API isn't documented by Blizzard yet. Paths here come from
  community testing ([Pinta365/blizzard_api](https://github.com/Pinta365/blizzard_api)).

## Other game versions

`flavor` on guilds and characters is there so realm-based versions (Classic
Era, Anniversary) can be added. `convex/shared/wow.ts` has the per-flavor API
details; a realm-based flavor needs realm slugs in the guild and character
paths.

## License

MIT
