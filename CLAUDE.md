# Guildie

WoW guild directory. See README.md and docs/.

Monorepo (pnpm workspaces):
- `apps/web`: the app (TanStack Start + Convex). Its scripts cd to apps/web
  themselves; Workers Builds runs with root directory `apps/web`.
- `apps/gateway`: the OAuth callback gateway Worker.
- `apps/addon`: the in-game addon (Lua). `apps/desktop`: the Windows app
  (Electron: the site in a window plus the uploader; apps/desktop/README.md).
  `apps/helper`: the older tray-only uploader (Bun).
- `packages/sync`: what desktop and helper share (SavedVariables reader,
  uploader, GuildieData.lua writer).

- pnpm. Tabs, double quotes, semicolons.
- `pnpm dev` per checkout (Portless URL, own Convex backend): docs/local-dev.md.
  Deploys and previews: docs/deploy.md. OAuth gateway and env per tier:
  docs/auth-environments.md.
- Convex: plain `query`/`mutation`/`action` with `v` validators. Blizzard API
  calls only in actions (`apps/web/convex/blizzard.ts`, `apps/web/convex/sync.ts`).
- Auth: `@convex-dev/auth@2.0.0-beta.0`. Users via `getAuthUserId` /
  `requireUserId` (apps/web/convex/users.ts). Adapter notes: docs/convex-auth.md.
- Shared game data (classes, races, API paths per flavor): `apps/web/convex/shared/wow.ts`,
  imported by both sides. Forever is realmless: characters are `{name}-{surname}`.
- Pages: route `loader` + `ensureQueryData(convexQuery(...))`, components read
  with `useSuspenseQuery`. Writes: `useMutation` from `apps/web/convex/react`.
- Design: minimal, dark only, an app rather than a website (the same React
  app runs on the web and in the Windows app). Tokens live in
  `apps/web/src/styles/app.css`; restyle shadcn primitives there.
  - App shell: a left sidebar for navigation and one content pane that
    scrolls by itself; the page never scrolls as a whole. Phones get a top
    bar instead of the sidebar. In the desktop app (`html[data-desktop]`)
    the sidebar and title bar sit on the window's own translucent material.
  - Color: neutral greys only (surfaces, hairline borders at ~8% white).
    Color with meaning comes from class colors (`ClassText`), item quality
    (`.q-*`) and in-game tooltip colors. No gradients, glows, emoji,
    textures or decorative badges.
  - Type: one sans family, 13-14px UI text, `.num` for tabular numbers.
    Headings are weight, not size or color.
  - Shapes: 6px radius, 1px borders, no shadows except popovers/tooltips.
  - Game art is the decoration: item and talent icons (Blizzard render URLs)
    and character renders. Item tooltips mimic the game's (`ItemTooltip`).
