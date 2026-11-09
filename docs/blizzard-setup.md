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

## 1. Create the client

1. Go to <https://develop.battle.net> and log in with your Battle.net account.
   If it asks you to add an authenticator or verify your email, do that first.
2. Open **API Access**, then **Create Client**.
3. Fill it in:
   - **Client name**: `guildies-dev` (make a separate one for production later).
   - **Redirect URLs**, both of these:
     - `http://127.0.0.1:3211/oauth/battlenet/callback` (sign-in; the local
       Convex backend's HTTP address)
     - `http://localhost:3000/claim/callback` (claiming characters; the app)
   - **Service URL**: `https://github.com/natedunn/guildies`
   - **Intended use**: "Guild roster directory for World of Warcraft: Forever.
     Reads public guild rosters and character profiles; players sign in to
     link their own characters."
4. Save. Copy the **Client ID** and **Client Secret**. The secret is shown
   once; if you lose it, generate a new one.

If the portal rejects the `127.0.0.1` URL, tell us: the fallback is a cloud
Convex dev deployment, whose callback is
`https://<deployment>.convex.site/oauth/battlenet/callback`.

## 2. Give them to Convex

With `pnpm dev` running, in another terminal:

```sh
export CONVEX_AGENT_MODE=anonymous
npx convex env set BATTLENET_CLIENT_ID <client id>
npx convex env set BATTLENET_CLIENT_SECRET <client secret>
```

They live on the Convex deployment only, never in the repo or `.env.local`.

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

## Production

Create a second client (`guildies`) with the production callback URLs:
`https://<prod deployment>.convex.site/oauth/battlenet/callback` and
`https://<app domain>/claim/callback`. Set `SITE_URL` on that deployment to
the app's origin.
