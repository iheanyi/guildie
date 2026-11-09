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
- [shadcn/ui](https://ui.shadcn.com) on [Base UI](https://base-ui.com), Tailwind v4

## Run it

```sh
pnpm install
pnpm dev        # local Convex backend + app on http://localhost:3000
pnpm seed       # a fake guild, so there's something to look at
```

`pnpm dev` runs Convex locally (no account needed) and gives it dev settings,
including a guest sign-in. To use real data, create a Blizzard API client and
set its keys: [docs/blizzard-setup.md](docs/blizzard-setup.md).

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
