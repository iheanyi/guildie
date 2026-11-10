# Guildie

WoW guild directory. See README.md and docs/.

Monorepo (pnpm workspaces):
- `apps/web`: the app (TanStack Start + Convex). Its scripts cd to apps/web
  themselves; Workers Builds runs with root directory `apps/web`.
- `apps/gateway`: the OAuth callback gateway Worker.
- `apps/addon`: the in-game addon (Lua). `apps/helper`: the desktop uploader.

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
- Design: looks like the game's own UI, dark only, and stays a dense data
  tool. Tokens and classes live in `apps/web/src/styles/app.css`; restyle
  shadcn primitives there or through their classes, not by forking behavior.
  - Surfaces: stone page (`--background` + `--grain`), each page inside one
    `.frame` (bronze bevel, riveted corners; narrow pages with a `max-w-*`
    root get a centered, fitted window). `.inset` wells for lists and tables
    inside it; `.section-head` for a heading with a figure on the right.
    `.parchment` (flips tokens to ink) only for mostly-reading pages (/data).
  - Text: `--foreground` warm off-white, `--muted-foreground` for secondary,
    `--gold` (#ffd100, the game's label gold) for column heads, links and
    button text, `--heading` for h1-h3. Color with meaning comes from class
    and item-quality colors (`ClassText`, `.q-*`, `.item-row`), never the UI.
  - Controls: `Button` default = red panel button (`.btn-red`), outline/
    secondary = dark bronze (`.btn-dark`). `Switch` is drawn as the game's
    checkbox. Tooltips and menus use `.wow-tooltip` (navy-black, silver edge).
    Toggle filters use `.chip` with `data-active`.
  - Type: Marcellus (headings, buttons; a free stand-in for the game's
    Friz Quadrata, one weight only, never bold) and Source Sans 3 (text,
    tables); tabular numbers with `.num`.
  - No eyebrow labels, emoji, decorative badges or fluff cards. Gradients
    only where the game uses them for material (button bevels, parchment).
  - Desktop app: `<html data-desktop="true">` makes `.site-header` a 40px
    drag region clear of the window buttons; `--titlebar` is its color.
