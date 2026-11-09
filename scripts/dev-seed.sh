#!/usr/bin/env sh
# Run by scripts/dev.sh once the local backend is up. A new backend gets its
# settings and guild data from cloud dev (scripts/deployments.sh); before
# cloud dev exists, local placeholders and a fake guild instead. Every run
# sets SITE_URL to this checkout's URL, the one origin sign-in may return to.
# Until the settings are in, Convex holds the first push and retries it.
#   usage: dev-seed.sh <cloud port> <app url>
set -eu
cloud="$1"
url="$2"
. "$(dirname "$0")/deployments.sh"

i=0
until curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$cloud/version"; do
	i=$((i + 1))
	[ "$i" -lt 60 ] || { echo "dev-seed: backend on :$cloud never came up" >&2; exit 1; }
	sleep 1
done

umask 077
dir="$(mktemp -d)"
trap '/bin/rm -rf "$dir"' EXIT

if [ -z "$cloud_dev" ]; then
	# No cloud dev yet: signing keys and placeholder Battle.net
	# keys, generated locally (scripts/dev-env.mjs).
	node scripts/dev-env.mjs "$url"
	marker=.convex/local/fake-guild-seeded
	if [ ! -f "$marker" ]; then
		npx convex run dev:seed > /dev/null && touch "$marker" && echo "dev-seed: added a fake guild"
	fi
	exit 0
fi

# `env get` rather than `env list`: the CLI lists names only when it detects an agent.
if [ -z "$(npx convex env get AUTH_JWKS 2>/dev/null)" ]; then
	npx convex env list --include-values --deployment "$cloud_dev" | grep -vE '^(SITE_URL|VITE_CONVEX_URL|VITE_CONVEX_SITE_URL)=' > "$dir/env"
	npx convex env set --from-file "$dir/env" > /dev/null
	echo "dev-seed: copied dev settings from $cloud_dev"
fi

# Guilds and their rosters only: no users, claims or auth tables. Once per
# backend; delete .convex/local to start over.
marker=.convex/local/guild-data-seeded
if [ ! -f "$marker" ]; then
	echo "dev-seed: importing guild data from $cloud_dev"
	npx convex export --deployment "$cloud_dev" --path "$dir/snapshot.zip" > /dev/null
	tables="guilds characters"
	# Every app table comes along so the snapshot's table numbers (which its
	# ids encode) stay consistent, but only these keep their rows.
	mkdir "$dir/data"
	unzip -q "$dir/snapshot.zip" -x '_components/*' -d "$dir/data"
	for documents in "$dir"/data/*/documents.jsonl; do
		table="$(basename "$(dirname "$documents")")"
		case " _tables $tables " in
			*" $table "*) ;;
			*) : > "$documents" ;;
		esac
	done
	(cd "$dir/data" && zip -qr ../data.zip .)
	npx convex import --replace-all -y "$dir/data.zip" > /dev/null
	touch "$marker"
	echo "dev-seed: imported guild data"
fi

if [ "$(npx convex env get SITE_URL 2>/dev/null)" != "$url" ]; then
	npx convex env set SITE_URL "$url" > /dev/null
	echo "dev-seed: SITE_URL=$url"
fi
