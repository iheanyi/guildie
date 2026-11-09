# Setting up guildie from scratch

From this repo to: sign-in working in every local worktree, a preview
deployment per branch, and production on guildie.club. Do the parts in order.
Each part ends with a check; don't continue until it passes.

Background on why it's built this way: docs/auth-environments.md.

## Before you start

- `guildie.club` is active on the Cloudflare account **Nate** (it is).
- The repo's latest code is pushed to `natedunn/guildie`.
- You're in the repo on `main`, `pnpm install` is done.
- In your password manager, create one item called **guildie**. Every secret
  below gets saved there as a field, under the exact field name given.

Commands run from the repo root unless a step says otherwise.

---

## Reference: every value, by name

Ten secrets, plus two deployment names you just write down (they're not
variables and aren't set anywhere as such). You get each one in the part
listed, save it in the **guildie** password-manager item under the **Field
name**, and use it in each place listed under **Goes to**.

| Field name | What it is | Made in | Goes to |
|---|---|---|---|
| Convex dev deployment name *(a note, not a variable)* | Like `happy-otter-123` | Part 1 | `cloud_dev=` in `scripts/deployments.sh`; `D=` in Part 4 |
| Convex prod deployment name *(a note, not a variable)* | Like `brave-lynx-456` | Part 1 | `ALLOWED_TARGETS` in `workers/gateway/wrangler.jsonc` as `https://<name>.convex.site`; `P=` in Part 5 |
| `CONVEX_PROD_DEPLOY_KEY` | Convex deploy key for prod | Part 1 | Cloudflare `guildie` Worker → Build → Production → secret `CONVEX_DEPLOY_KEY` |
| `CONVEX_PREVIEW_DEPLOY_KEY` | Convex deploy key for previews (starts with `preview:`) | Part 1 | Cloudflare `guildie` Worker → Build → Previews Base → secret `CONVEX_DEPLOY_KEY` |
| `CONVEX_MANAGEMENT_TOKEN` | Convex team access token | Part 1 | GitHub repo secret `CONVEX_MANAGEMENT_TOKEN` |
| `BATTLENET_DEV_CLIENT_ID` | Client ID of Battle.net client `guildie-dev` | Part 2 | Convex **cloud dev** env `BATTLENET_CLIENT_ID` |
| `BATTLENET_DEV_CLIENT_SECRET` | Client secret of `guildie-dev` | Part 2 | Convex **cloud dev** env `BATTLENET_CLIENT_SECRET` |
| `BATTLENET_PROD_CLIENT_ID` | Client ID of Battle.net client `guildie` | Part 2 | Convex **prod** env `BATTLENET_CLIENT_ID` |
| `BATTLENET_PROD_CLIENT_SECRET` | Client secret of `guildie` | Part 2 | Convex **prod** env `BATTLENET_CLIENT_SECRET` |
| `GATEWAY_DEV_ROUTING_SECRET` | Random string you generate | Part 3 | Worker `guildie-gateway-dev` secret `ROUTING_SECRET` **and** Convex **cloud dev** env `AUTH_GATEWAY_SECRET` (same value in both) |
| `GATEWAY_PROD_ROUTING_SECRET` | Random string you generate | Part 3 | Worker `guildie-gateway` secret `ROUTING_SECRET` **and** Convex **prod** env `AUTH_GATEWAY_SECRET` (same value in both) |
| `CLOUDFLARE_PREVIEW_CLEANUP_TOKEN` | Cloudflare API token | Part 8 | GitHub repo secret `CLOUDFLARE_API_TOKEN` |

Not in the password manager: the auth signing keys (`AUTH_PRIVATE_KEY`,
`AUTH_JWKS`). The commands generate them straight into Convex, and nobody
needs to read them back.

---

## Part 1: Convex project

1. Open <https://dashboard.convex.dev>. Pick team **nate-dunn**. Click
   **Create Project**.
   - **Project name:** `guildie`
2. The project opens on your **development** deployment. Its name is in the
   deployment picker at the top and in the URL (like `happy-otter-123`).
   Write it in the **guildie** item as **Convex dev deployment name**.
3. In the deployment picker, choose **Production**. Write its name in the
   **guildie** item as **Convex prod deployment name**.
4. Still on **Production**: **Settings → URL & Deploy Key → Generate
   Production Deploy Key**.
   - **Name** (if it asks): `workers-builds-prod`
   - Copy the key. Save as `CONVEX_PROD_DEPLOY_KEY`.
5. Open the **project** settings (project name at the top → **Project
   Settings**) → **Preview Deploy Keys → Generate Preview Deploy Key**.
   - **Name** (if it asks): `workers-builds-previews`
   - Copy the key (it starts with `preview:`). Save as
     `CONVEX_PREVIEW_DEPLOY_KEY`.
6. **Team Settings → Access Tokens → Create Token**.
   - **Name:** `guildie-preview-cleanup`
   - Copy the token. Save as `CONVEX_MANAGEMENT_TOKEN`.
7. Get the project's numeric id:

   ```sh
   T=$(pbpaste)   # right after copying CONVEX_MANAGEMENT_TOKEN
   curl -s -H "Authorization: Bearer $T" \
     https://api.convex.dev/v1/teams/55291/list_projects | jq -c '.[] | {id, slug}' | grep guildie
   ```

   (`55291` is the numeric id of team `nate-dunn`.) The `id` on the line it
   prints is the number. The slug may have a suffix like `guildie-1a2b3`;
   that's fine.
8. Edit `scripts/deployments.sh`:

   ```sh
   cloud_dev="<dev deployment name>"
   convex_project="<the id from step 7>"
   ```

9. Edit `workers/gateway/wrangler.jsonc`. Under `"prod"` → `"vars"`, replace
   `https://PROD-DEPLOYMENT.convex.site` with
   `https://<prod deployment name>.convex.site`.

**Check:** this prints an empty list (no error):

```sh
npx convex env list --deployment <dev deployment name>
```

If it asks you to log in, run `npx convex login` and try again.

---

## Part 2: Battle.net clients

You make two clients. They differ only in name and redirect URLs.

1. Go to <https://develop.battle.net> and log in. If it asks you to verify
   your email or add an authenticator, do that first.
2. Top menu **API Access** → **Create Client**. Fill in:

   | Field | Value |
   |---|---|
   | Client Name | `guildie-dev` |
   | Redirect URLs | `https://gateway-dev.guildie.club/oauth/battlenet/callback` |
   | (click **+** / add another) | `https://gateway-dev.guildie.club/oauth/claim/callback` |
   | Service URL | `https://github.com/natedunn/guildie` |
   | Intended Use | `Guild roster directory for World of Warcraft: Forever. Reads public guild rosters and character profiles. Players sign in with Battle.net to link their own characters.` |

   Leave anything else (like "I do not have a service URL") unchecked. Click
   **Save**.
3. You land on the client's page. Copy:
   - **Client ID** → save as `BATTLENET_DEV_CLIENT_ID`
   - **Client Secret** → save as `BATTLENET_DEV_CLIENT_SECRET` (it's shown
     only now; if you lose it, use **Generate new secret**)
4. **API Access → Create Client** again:

   | Field | Value |
   |---|---|
   | Client Name | `guildie` |
   | Redirect URLs | `https://gateway.guildie.club/oauth/battlenet/callback` |
   | (add another) | `https://gateway.guildie.club/oauth/claim/callback` |
   | Service URL | `https://github.com/natedunn/guildie` |
   | Intended Use | same text as above |

   **Save**. Copy:
   - **Client ID** → save as `BATTLENET_PROD_CLIENT_ID`
   - **Client Secret** → save as `BATTLENET_PROD_CLIENT_SECRET`

The URLs must match character for character: `https`, no trailing slash.
There are no scopes or permissions to request here.

**Check:** **API Access** lists `guildie-dev` and `guildie`, each with
exactly the two redirect URLs above.

---

## Part 3: Gateway Workers

Two tiny Workers that receive Battle.net's redirects and forward them to the
right deployment: `guildie-gateway-dev` (on `gateway-dev.guildie.club`) and
`guildie-gateway` (on `gateway.guildie.club`).

1. Generate the two routing secrets. Run this twice; save the first output as
   `GATEWAY_DEV_ROUTING_SECRET` and the second as
   `GATEWAY_PROD_ROUTING_SECRET`:

   ```sh
   openssl rand -base64 32
   ```

2. Go into the gateway folder and check you're logged in to the right
   Cloudflare account:

   ```sh
   cd workers/gateway
   pnpm install
   pnpm wrangler whoami
   ```

   It must list the account **Nate** (`fc87b44f5832b25053fec2efb19fc208`).
   If not, run `pnpm wrangler login`.
3. Run the gateway's tests:

   ```sh
   pnpm test && pnpm check
   ```

4. Dev gateway. Copy `GATEWAY_DEV_ROUTING_SECRET`, then run the first
   command and paste it at the prompt. If wrangler asks whether to create the
   Worker `guildie-gateway-dev`, answer **yes**.

   ```sh
   pnpm wrangler secret put ROUTING_SECRET -c wrangler.jsonc --env dev
   pnpm deploy:dev
   ```

5. Prod gateway. Copy `GATEWAY_PROD_ROUTING_SECRET`, then the same, with
   `prod` (create Worker `guildie-gateway`: **yes**):

   ```sh
   pnpm wrangler secret put ROUTING_SECRET -c wrangler.jsonc --env prod
   pnpm deploy:prod
   cd ../..
   ```

Each deploy creates its own DNS record and certificate on `guildie.club`.

**Check** (allow a minute or two for the certificates): both print
`guildie sign-in gateway.`

```sh
curl https://gateway-dev.guildie.club/
curl https://gateway.guildie.club/
```

---

## Part 4: Cloud dev settings

Cloud dev is where every local worktree and branch preview copies its
settings from. To paste a secret, copy it from the password manager, then run
the line with `pbpaste |`; that keeps it out of your shell history.

First, so you don't retype the name:

```sh
D=<dev deployment name>
```

1. Signing keys (generated and set directly; nothing to save):

   ```sh
   node -e '
   const {generateKeyPairSync, randomUUID} = require("crypto");
   const {publicKey, privateKey} = generateKeyPairSync("rsa", {modulusLength: 2048});
   const jwk = publicKey.export({format: "jwk"});
   require("fs").writeFileSync("auth-private-key", Buffer.from(privateKey.export({type: "pkcs8", format: "pem"})).toString("base64"));
   require("fs").writeFileSync("auth-jwks", JSON.stringify({keys: [{kty: jwk.kty, n: jwk.n, e: jwk.e, kid: randomUUID(), alg: "RS256", use: "sig"}]}));
   '
   npx convex env set --deployment $D AUTH_PRIVATE_KEY < auth-private-key
   npx convex env set --deployment $D AUTH_JWKS < auth-jwks
   rm auth-private-key auth-jwks
   ```

2. The rest, one line at a time. **Copy** means copy that field from the
   password manager right before running the line.

   | Copy | Run |
   |---|---|
   | `BATTLENET_DEV_CLIENT_ID` | `pbpaste \| npx convex env set --deployment $D BATTLENET_CLIENT_ID` |
   | `BATTLENET_DEV_CLIENT_SECRET` | `pbpaste \| npx convex env set --deployment $D BATTLENET_CLIENT_SECRET` |
   | `GATEWAY_DEV_ROUTING_SECRET` | `pbpaste \| npx convex env set --deployment $D AUTH_GATEWAY_SECRET` |
   | nothing | `npx convex env set --deployment $D AUTH_BATTLENET_CALLBACK_URL https://gateway-dev.guildie.club/oauth/battlenet/callback` |
   | nothing | `npx convex env set --deployment $D AUTH_CLAIM_CALLBACK_URL https://gateway-dev.guildie.club/oauth/claim/callback` |
   | nothing | `npx convex env set --deployment $D AUTH_DEV_GUEST true` |
   | nothing | `npx convex env set --deployment $D SITE_URL https://guildie.localhost:1355` |

3. Check cloud dev now has exactly these nine variables:

   ```sh
   npx convex env list --deployment $D
   ```

   `AUTH_PRIVATE_KEY`, `AUTH_JWKS`, `BATTLENET_CLIENT_ID`,
   `BATTLENET_CLIENT_SECRET`, `AUTH_GATEWAY_SECRET`,
   `AUTH_BATTLENET_CALLBACK_URL`, `AUTH_CLAIM_CALLBACK_URL`,
   `AUTH_DEV_GUEST`, `SITE_URL`.

4. Push the code to cloud dev:

   ```sh
   pnpm push:cloud-dev
   ```

5. Test the Battle.net keys against your guild (use its exact in-game name):

   ```sh
   npx convex run --deployment $D dev:probe '{"guild": "Your Guild Name", "region": "us"}'
   ```

   Good: `token: "ok"`, a `members` count, and field lists for one member.
   `404 for slug` means the name is off, or Blizzard hasn't published the
   guild yet.

6. Add your guild to cloud dev. Local worktrees import guilds from here, so
   each new checkout starts with your real roster:

   ```sh
   npx convex run --deployment $D dev:addGuild '{"name": "Your Guild Name", "region": "us"}'
   ```

   The roster syncs within a minute, then each member's profile.

7. Reset your local checkout so it copies from cloud dev (this deletes its
   local data, which is only the fake guild):

   ```sh
   rm -rf .convex/local
   pnpm dev
   ```

**Check:**
- <https://guildie.localhost:1355> shows your guild.
- **Sign in → Continue with Battle.net** takes you to Battle.net and back,
  signed in, with your BattleTag in the header.
- On your account page, **Claim my characters** lists your Forever
  characters.
- A second worktree signs in too, at its own URL:

  ```sh
  git worktree add ../guildie-test -b test
  cd ../guildie-test && pnpm dev     # https://test.guildie.localhost:1355
  ```

  Remove it afterwards: `git worktree remove ../guildie-test && git branch -D test`.

---

## Part 5: Prod settings

The same as Part 4, with the **prod** values and no guest sign-in. Don't push
code to prod by hand; Workers Builds does that in Part 7.

```sh
P=<prod deployment name>
```

1. Signing keys: run Part 4 step 1 again with `$P` in place of `$D`. That
   makes a new pair; never reuse cloud dev's.
2. The rest:

   | Copy | Run |
   |---|---|
   | `BATTLENET_PROD_CLIENT_ID` | `pbpaste \| npx convex env set --deployment $P BATTLENET_CLIENT_ID` |
   | `BATTLENET_PROD_CLIENT_SECRET` | `pbpaste \| npx convex env set --deployment $P BATTLENET_CLIENT_SECRET` |
   | `GATEWAY_PROD_ROUTING_SECRET` | `pbpaste \| npx convex env set --deployment $P AUTH_GATEWAY_SECRET` |
   | nothing | `npx convex env set --deployment $P AUTH_BATTLENET_CALLBACK_URL https://gateway.guildie.club/oauth/battlenet/callback` |
   | nothing | `npx convex env set --deployment $P AUTH_CLAIM_CALLBACK_URL https://gateway.guildie.club/oauth/claim/callback` |
   | nothing | `npx convex env set --deployment $P SITE_URL https://guildie.club` |

**Check:** `npx convex env list --deployment $P` shows exactly eight:
`AUTH_PRIVATE_KEY`, `AUTH_JWKS`, `BATTLENET_CLIENT_ID`,
`BATTLENET_CLIENT_SECRET`, `AUTH_GATEWAY_SECRET`,
`AUTH_BATTLENET_CALLBACK_URL`, `AUTH_CLAIM_CALLBACK_URL`, `SITE_URL`. No
`AUTH_DEV_GUEST`.

---

## Part 6: Preview defaults, then push

Every new branch preview starts with these settings: cloud dev's, minus
`SITE_URL` and `AUTH_DEV_GUEST`, plus a signing key pair of its own.

```sh
sh scripts/preview-defaults.sh
```

**Check:** the list it prints has `AUTH_PRIVATE_KEY`, `AUTH_JWKS`,
`BATTLENET_CLIENT_ID`, `BATTLENET_CLIENT_SECRET`, `AUTH_GATEWAY_SECRET`,
`AUTH_BATTLENET_CALLBACK_URL`, `AUTH_CLAIM_CALLBACK_URL`, and nothing else.

Then commit your two edits from Part 1 and push, since Cloudflare builds from
GitHub:

```sh
git add scripts/deployments.sh workers/gateway/wrangler.jsonc
git commit -m "Set Convex deployments and prod gateway target"
git push
```

---

## Part 7: The app Worker (production and previews)

1. Cloudflare dashboard, account **Nate** → **Workers & Pages** → **Create**
   → **Import a repository**. (Workers, not Pages.)
2. **GitHub** → choose `natedunn/guildie`. If GitHub asks, give the
   Cloudflare app access to that repo.
3. On the setup screen:

   | Field | Value |
   |---|---|
   | Project name | `guildie` (must match `name` in `wrangler.jsonc`) |
   | Production branch | `main` |
   | Build command | *(leave empty)* |
   | Deploy command | `sh scripts/cloudflare-deploy.sh` |
   | Non-production branch deploy command / Preview command | `sh scripts/preview-build.sh && npx wrangler preview --name "$(sh scripts/preview-name.sh)"` |

   Under **Advanced settings → Build variables**, add (type **Secret**):

   | Variable name | Value |
   |---|---|
   | `CONVEX_DEPLOY_KEY` | `CONVEX_PROD_DEPLOY_KEY` |

   Click **Deploy**. The first build deploys Convex prod and the Worker, and
   creates the domains `guildie.club` and `preview.guildie.club`.
4. Open the `guildie` Worker → **Settings → Build**:
   - **Branch control**: turn on builds for non-production branches. If it
     offers **Switch to Worker Previews**, accept. (Worker Previews run with
     their own settings; the older kind ran with production's.)
   - Check the **Preview command** is the one in step 3.
   - **Variables and secrets** has two tabs. Set:

     | Tab | Variable name | Type | Value |
     |---|---|---|---|
     | Production | `CONVEX_DEPLOY_KEY` | Secret | `CONVEX_PROD_DEPLOY_KEY` (already there from step 3) |
     | Previews Base | `CONVEX_DEPLOY_KEY` | Secret | `CONVEX_PREVIEW_DEPLOY_KEY` |

   Same variable name, different value per tab. That's how production builds
   go to prod Convex and branch builds to their own Convex preview. If the
   prod key ever lands on the Previews Base tab, the preview build refuses to
   run.
5. The Worker itself needs no runtime variables (**Settings → Variables and
   secrets** stays empty). Convex URLs are built in.

**Check:**
- <https://guildie.club> loads. Sign in with Battle.net returns you to
  guildie.club, signed in.
- Push a test branch:

  ```sh
  git switch -c preview-test
  git commit --allow-empty -m "Test preview"
  git push -u origin preview-test
  git switch main
  ```

  Its build appears under the Worker's **Deployments**. When it's done,
  <https://preview-test.preview.guildie.club> loads (no guilds yet), and
  sign-in works there too.

---

## Part 8: Automatic preview cleanup

When a PR closes or a branch is deleted, a GitHub Action deletes that
branch's Worker Preview and Convex preview.

1. Cloudflare dashboard → **My Profile → API Tokens → Create Token → Create
   Custom Token**:

   | Field | Value |
   |---|---|
   | Token name | `guildie-preview-cleanup` |
   | Permissions | **Account** · **Workers Scripts** · **Edit** |
   | Account Resources | **Include** · **Nate** |
   | Everything else | leave as is |

   **Continue to summary → Create Token**. Copy it. Save as
   `CLOUDFLARE_PREVIEW_CLEANUP_TOKEN`.
2. Add the three GitHub secrets:

   | Copy | Run |
   |---|---|
   | nothing | `gh secret set CLOUDFLARE_ACCOUNT_ID -R natedunn/guildie -b fc87b44f5832b25053fec2efb19fc208` |
   | `CLOUDFLARE_PREVIEW_CLEANUP_TOKEN` | `pbpaste \| gh secret set CLOUDFLARE_API_TOKEN -R natedunn/guildie` |
   | `CONVEX_MANAGEMENT_TOKEN` | `pbpaste \| gh secret set CONVEX_MANAGEMENT_TOKEN -R natedunn/guildie` |

**Check:** delete the test branch:

```sh
git push origin --delete preview-test
git branch -D preview-test
```

Under GitHub → **Actions → Preview cleanup**, the run says it deleted the
Worker Preview and the Convex preview.

---

## When something fails

| Symptom | Cause and fix |
|---|---|
| Battle.net: "invalid redirect URI" | The client's redirect URLs (Part 2) don't exactly match `AUTH_BATTLENET_CALLBACK_URL` / `AUTH_CLAIM_CALLBACK_URL` (Parts 4, 5) |
| Gateway: "This sign-in link is invalid" | `AUTH_GATEWAY_SECRET` on that deployment isn't that tier's routing secret; or (prod) `ALLOWED_TARGETS` in `workers/gateway/wrangler.jsonc` isn't `https://<prod deployment name>.convex.site` |
| Back on the app but not signed in | The page's origin isn't in that deployment's `SITE_URL` |
| `dev:probe`: keys "are not set" | `BATTLENET_CLIENT_ID` / `BATTLENET_CLIENT_SECRET` missing on that deployment |
| Convex push: "declared as required … not set" | A variable from Part 4 or 5 is missing |
| Preview build: "not a preview deploy key" | The Previews Base tab has the prod key; it needs `CONVEX_PREVIEW_DEPLOY_KEY` |
