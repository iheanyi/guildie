# guildie addon

Saves your character's talents (and level) for the guildie desktop helper
(`apps/helper`) to upload to guildie.club. Addons can't use the internet: the
game writes `GuildieDB` to `WTF/Account/<account>/SavedVariables/Guildie.lua`
on `/reload` and logout, and the helper watches that file.

- Install: copy the `Guildie` folder into your WoW: Forever `Interface/AddOns`.
- `/guildie` saves now and says how many talents it read; `/reload` writes it
  to disk for the helper.
- Interface version 16001 is WoW: Forever 1.60.1 (as the WowSims exporter uses).

Talents are read with `C_ClassTalents` / `C_Traits`, the way the
[WowSims exporter](https://github.com/wowsims/exporter) (MIT) does for Forever,
and sent as TraitDefinition IDs: the same IDs as Blizzard's web API, which is
how guildie.club places them in their trees.

**Not tested in game yet.** Things to confirm on first run:
- `/guildie` reports a talent count that matches your character.
- `UnitGUID("player")`'s last part, read as hex, equals Blizzard's character id
  (that's how uploads match your claimed characters; first name is the fallback).
