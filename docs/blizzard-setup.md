# Blizzard API keys

One Blizzard API client does three jobs:

| Job | Grant | Scope | Needs a user? |
|---|---|---|---|
| Roster and character sync | client credentials | none | no |
| Sign in with Battle.net | authorization code | `openid` | yes |
| Claim my characters | authorization code | `wow.profile` | yes |

Scopes aren't approved in the portal. Any client can request `openid` and
`wow.profile`; the player agrees on Battle.net's consent screen. Public data
(guilds, rosters, profiles) needs no scope at all.

## 1. Create the dev client

Make two clients, dev now and prod when we deploy: separate rate limits,
separate secrets, and a production consent screen that says "guildie".

1. Go to <https://develop.battle.net> and log in with your Battle.net account.
   If it asks you to add an authenticator or verify your email, do that first.
2. Open **API Access**, then **Create Client**.
3. Fill it in:
   - **Client name**: `guildie-dev`
   - **Redirect URLs**, both of these (the dev gateway; it forwards to every
     worktree, preview and cloud dev, docs/auth-environments.md):
     - `https://gateway-dev.guildie.club/oauth/battlenet/callback` (sign-in)
     - `https://gateway-dev.guildie.club/oauth/claim/callback` (claiming characters)
   - **Service URL**: `https://github.com/natedunn/guildie`
   - **Intended use**: "Guild roster directory for World of Warcraft: Forever.
     Reads public guild rosters and character profiles; players sign in to
     link their own characters."
4. Save. Copy the **Client ID** and **Client Secret**. The secret is shown
   once; if you lose it, generate a new one.

The prod client (`guildie`) is the same with `gateway.guildie.club` in both
URLs.

## 2. Give them to Convex

Once cloud dev exists, set them there (with the gateway settings in
docs/auth-environments.md) and every new worktree and preview copies them:

```sh
pbpaste | npx convex env set --deployment <cloud dev> AUTH_BATTLENET_CLIENT_ID
pbpaste | npx convex env set --deployment <cloud dev> AUTH_BATTLENET_CLIENT_SECRET
```

Until then, set them on your checkout's local backend (in the checkout, with
`pnpm dev` running):

```sh
export CONVEX_AGENT_MODE=anonymous
pbpaste | npx convex env set AUTH_BATTLENET_CLIENT_ID
pbpaste | npx convex env set AUTH_BATTLENET_CLIENT_SECRET
```

That's enough for the roster sync and `dev:probe`. Sign-in and claiming also
need the dev gateway deployed, since the client only knows its URLs.

They live on Convex deployments only, never in the repo or `.env.local`.

## 3. Check them

```sh
npx convex run dev:probe '{"guild": "Your Guild Name", "region": "us"}'
```

It prints `token: "ok"` when the keys work, the member count, and the fields
Blizzard returns for one of your level 10+ members (profile, equipment,
professions, media). A `404` for the guild means the name is off or Blizzard
hasn't published it yet; an `HTTP 404` on media is normal for a day or so
after a character first appears.

Then try it in the app: sign in with Battle.net, add your guild on the home
page, and claim your characters from your account page.

## Limits

100 requests per second and 36,000 per hour per client. A full sync costs
about 4 requests per level 10+ member, once an hour, so a 500-member guild
uses about 2,000 an hour. Several large guilds on one client would need a
longer refresh interval.
