# guildie

WoW guild directory. See README.md and docs/.

- pnpm. Tabs, double quotes, semicolons.
- `pnpm dev` per checkout (Portless URL, own Convex backend): docs/local-dev.md.
  Deploys and previews: docs/deploy.md. OAuth gateway and env per tier:
  docs/auth-environments.md.
- Convex: plain `query`/`mutation`/`action` with `v` validators. Blizzard API
  calls only in actions (`convex/blizzard.ts`, `convex/sync.ts`).
- Auth: `@convex-dev/auth@2.0.0-beta.0`. Users via `getAuthUserId` /
  `requireUserId` (convex/users.ts). Adapter notes: docs/convex-auth.md.
- Shared game data (classes, races, API paths per flavor): `convex/shared/wow.ts`,
  imported by both sides. Forever is realmless: characters are `{name}-{surname}`.
- Pages: route `loader` + `ensureQueryData(convexQuery(...))`, components read
  with `useSuspenseQuery`. Writes: `useMutation` from `convex/react`.
- Design: quiet and dense. Tables and rules, not cards. No eyebrow labels,
  gradients, emoji or badges-for-decoration. Color comes from WoW class and
  item-quality colors (`ClassText`); the UI itself is paper and ink.
  Alegreya for headings, Alegreya Sans for text, tabular numbers (`.num`).
