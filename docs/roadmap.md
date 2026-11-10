# Roadmap

Where Guildie is headed, roughly in order. Ideas and votes: open an issue
(the "Feature or idea" template).

## Done

- [x] Battle.net sign-in (Convex Auth v2), claim your characters
- [x] Add a guild by name and region; hourly roster sync from Blizzard
- [x] Per member: level, class, race, rank, gear, talents, professions and
      recipes, last seen
- [x] Guild ownership (whoever claims the guild master), public or
      members-only guilds
- [x] Guild crafting: who can make what, and who needs a reagent
- [x] Worktrees, branch previews and an OAuth gateway; production on
      guildie.club
- [x] The addon: saves level, gear with tooltips, professions, recipes and
      talents in game
- [x] The Windows app: the site in a window, installs and updates the addon,
      uploads its data, updates itself (replaced the tray-only helper)
- [x] In-game tooltips: guildmates who need a reagent, gear-upgrade
      suggestions from stat weights

## Now

- **Open to contributors**: contributor docs, sample data, CI on every PR,
  release tooling.
- **Confirm in game and on Windows**: the addon's 0.4.0 and 0.5.0 reads in
  Forever, and the app's Windows-only parts (docs/addon.md, "Not verified
  yet").
- **Better suggestions**: tune stat weights with players' feedback
  (`apps/web/convex/shared/weights.ts`).

## Next

- **Officers**: hand guild settings to officers, not just the owner.
- **Rank names**: the API only gives numbers; let the owner name them.
- **Notes, mains and alts**: members describe their characters (main/alt,
  spec, what they're farming) and group them.
- **More from the addon**: online presence, bank and bags (with consent).

## Later

- **Discord (optional)**: link Discord for notifications ("can someone craft
  ...?" pings the people who can), possibly guild chat mirrored to a channel.
  Convex Auth v2 has no account linking yet, so it would be our own small
  flow, like claiming characters.
- **Other game versions**: realm-based flavors (Classic Era, Anniversary);
  `flavor` is already on guilds and characters.
