# Roadmap

Where Guildie is headed, roughly in order. The end goal: use what we know
about the guild to tell, in game, which crafted items, weapons and armor
would help which members.

## Now: the directory (proof of concept)

- [x] Battle.net sign-in (Convex Auth v2, generic OAuth)
- [x] Add a guild by name + region; hourly roster sync
- [x] Per member: level, class, race, rank, gear, professions, last seen
- [x] Claim your characters (Battle.net `wow.profile`)
- [x] Per-guild visibility: public or members only (owner's choice)
- [ ] Verify against the live Forever API with real keys
- [x] Worktrees, Worker previews and an OAuth gateway, like Onda and Sportsball
- [ ] One-time setup: domain, Convex project, gateways, Workers Builds (docs/deploy.md)

## Next

- **Guild ownership.** Right now whoever adds a guild owns it. Better: the
  person who claims the guild master's character (rank 0) owns it, and can
  hand settings to officers.
- **Rank names.** The API only gives numbers; let the owner name them.
- **Notes.** Members add a note to their own characters (main/alt, spec,
  what they're farming).
- **Mains and alts.** Group a player's characters using their claims.
- **Profession lookup.** "Who can make X?" across the guild. Needs recipe
  data (not in the profile API's Classic-style professions; probably the
  addon).

## Later: Discord

- **Link Discord (optional)** from the account page, for notifications. A
  second OAuth connection (`identify` scope), stored on the user. Convex Auth
  v2 has no account linking yet, so this would be our own small flow, like
  claiming characters.
- **Notifications**: a guild event or a request ("can someone craft…") pings
  the people who can help, by Discord DM or a guild channel webhook.
- **Guild chat**: a persistent chat in the app, optionally mirrored to a
  Discord channel via a bot.

## Eventually: the addon

A WoW addon that knows the guild:

- **Upload** what the API can't see: who's online, full recipe lists,
  bank and bag contents (with consent), via SavedVariables and a small
  companion uploader, since addons can't make web requests.
- **Download** the guild's data into the addon so, in game, an item tooltip
  says which guildmates it would be an upgrade for, and which crafted
  reagents or gear are worth making for whom.

Open questions for the addon: whether to require a companion app for
uploads, and how to score "upgrade" (item level is crude; stat weights per
class/spec are better).
