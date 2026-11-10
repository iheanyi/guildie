# Changelog

What changed in each release of the Guildie app for Windows, at a glance. Most
of Guildie is the website, which the app shows, so a release also lists what
changed on the site since the last one. The release workflow uses the section
for its version as the GitHub release notes, and the app shows them under
Settings → App.

## 0.3.4

### New
- What's new: after an update, the app tells you and shows what changed (Settings → App).
- Settings has tabs: Account, Guilds, Addon and App.
- The sync button on a guild shows when it last synced with Blizzard and when it syncs next.

### Improvements
- The roster sorts by level, and search also finds race and class ("night elf druid").
- Characters Blizzard hasn't published yet (under level 10, or not logged out since) get a placeholder and an explanation instead of an empty page.
- Members only moved to Settings → Guilds, for the guild's owner.
- The sidebar groups your guilds under one Guilds heading, so several guilds read clearly.

### Fixes
- The sidebar shows your level from the game when it's newer than Blizzard's.

## 0.3.3

### New
- Everything the game knows about your character now reaches Guildie when you /reload or log out: level, gear (with the exact tooltips, enchants included), profession skills, and the recipes in each profession window you open. Addon 0.4.0; restart WoW once to load it.

## 0.3.2

### Improvements
- A clearer sidebar: your guilds and characters, with portraits and levels, and Settings.
- Slightly warmer colors throughout.

## 0.3.1

### New
- An Addon page: see whether the addon is installed and which version, install, update or uninstall it, and choose your WoW folder.
- The roster's "Last synced" shows whether a character's data came from the game or from Blizzard.

## 0.3.0

### New
- Guildie installs the addon for you and keeps it up to date.
- The app updates itself in the background.
- A proper installer; no admin rights needed.
