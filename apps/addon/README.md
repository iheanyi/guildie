# Guildie addon

Saves your character's talents (and level) for the Guildie desktop helper
(`apps/helper`) to upload to guildie.club.

Addons can't use the internet. The game writes the addon's data
(`WTF/Account/<account>/SavedVariables/Guildie.lua`) when you log out or
reload the UI, and the helper, running on the same computer, uploads it then.

- **Install:** install the Guildie desktop app (apps/desktop, from GitHub
  Releases); it installs this folder into WoW: Forever's `Interface/AddOns`
  and updates it when a newer app ships a higher `## Version`. Bump that
  version in `Guildie.toc` whenever the addon changes, or players keep the old
  copy. (Copying the folder by hand works for development.)
- **Minimap button** (drag it around the minimap) or `/guildie`: opens the
  window: what's saved, whether it changed since your last upload, and
  **Upload now**, which reloads the UI so it goes right away.
- **Upload while I'm AFK** (off by default, experimental): reloads the UI for
  you while you're flagged AFK and out of combat, if something changed, at most
  every 20 minutes. If the game doesn't allow addons to reload on their own, it
  turns itself off and tells you.
- **Tooltips:** hover a reagent to see guildmates whose known recipes use it
  ("Guildie might want this: …"). The helper downloads your guild's data into
  `GuildieData.lua`; it loads at login and `/reload`.
- Interface version 16001 is WoW: Forever 1.60.1.

Talents are read with `C_ClassTalents` / `C_Traits`, the way the
[WowSims exporter](https://github.com/wowsims/exporter) (MIT) reads them in
Forever, and sent as TraitDefinition IDs: the same IDs as Blizzard's web API,
which is how guildie.club places them in their trees. Confirmed in game: talent
reading, and that the in-game GUID's number is Blizzard's character id.
