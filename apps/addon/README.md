# Guildie addon

For WoW: Forever. On its own, it shows on a reagent's tooltip which guildmates
might want it ("Guildie might want this: …"). With the Guildie app
(`apps/desktop`) on the same computer, it also sends your talents (and level)
to guildie.club and keeps the tooltips fresher.

Addons can't use the internet: data reaches the addon only as files that
exist when the game loads (login or `/reload`), and leaves it only through
the file the game writes on logout and reload
(`WTF/Account/<account>/SavedVariables/Guildie.lua`).

- **Install:** from CurseForge, Wago or WowUp (they keep it updated), or copy
  the `Guildie` folder into your WoW: Forever `Interface/AddOns`.
- **Tooltips** use your current guild's newest data from any of:
  - the release itself (`GuildieBundle.lua`: every public guild, released
    daily, so an addon manager keeps it at most a day or so old);
  - the Guildie app (`GuildieData.lua`, every 15 minutes, members-only guilds
    included);
  - a guildmate's addon (guild sync: addons share the newest copy over the
    guild's addon channel, quietly, and keep it in SavedVariables).
- **Minimap button** (drag it around the minimap) or `/guildie`: the window:
  your guild's data and where it came from ("from the Guildie app, 2 min
  ago", "shared by Brisket, 1 hour ago", "bundled with the addon, Nov 10"),
  what's saved for this character, whether it changed since your last upload,
  and **Upload now**, which reloads the UI so the app uploads it right away.
  `/guildie sync` adds a guild sync status line.
- **Upload while I'm AFK** (off by default, experimental): reloads the UI for
  you while you're flagged AFK and out of combat, if something changed, at most
  every 20 minutes. If the game doesn't allow addons to reload on their own, it
  turns itself off and tells you.
- Interface version 16001 is WoW: Forever 1.60.1.

Files, in load order: `GuildieBundle.lua` and `GuildieData.lua` (data, empty
in the source tree), `Guildie.lua` (talents), `Data.lua` (guild detection,
picking a source), `Wire.lua` (the guild sync text format), `GuildSync.lua`,
`UI.lua`, `Tooltip.lua`.

- **Tests:** `luajit tests/run.lua` (LuaJIT or Lua 5.1, plain Lua with a
  stubbed WoW API; pass a built `GuildieBundle.lua` to also run real data
  through guild sync).
- **Release:** `node scripts/build.ts --url https://guildie.club` builds
  `dist/Guildie-<version>.zip`; the daily workflow uploads it. See
  [docs/addon.md](../../docs/addon.md) (formats, sync protocol, release setup).

Talents are read with `C_ClassTalents` / `C_Traits`, the way the
[WowSims exporter](https://github.com/wowsims/exporter) (MIT) reads them in
Forever, and sent as TraitDefinition IDs: the same IDs as Blizzard's web API,
which is how guildie.club places them in their trees. Confirmed in game: talent
reading, and that the in-game GUID's number is Blizzard's character id.
