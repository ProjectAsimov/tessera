# Sync worker

A Cloudflare Worker with a D1 database (users, tasks, entries) and a KV
namespace (sessions, OAuth state). Sign-in is a redirect round trip:
the app sends the browser to `/auth/start`, the worker sends it to Google,
Google returns to `/auth/callback`, and the worker exchanges the code for an
ID token, verifies it, issues its own 90-day session token, and redirects back
to the app with the token in the URL fragment. Tasks and entries are stored
under the Google account id. See `../docs/ARCHITECTURE.md` for the contract.

## Setup

1. Create a Google OAuth **Web application** client at
   https://console.cloud.google.com/apis/credentials. Under *Authorized
   redirect URIs* add `https://<worker host>/auth/callback` (and
   `http://localhost:8787/auth/callback` for local work). Put the client id in
   `GOOGLE_CLIENT_ID` here; the client secret is a Worker secret:

```
cd worker
npx wrangler login
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler d1 execute tasktracker --remote --file src/db/schema.sql
npx wrangler deploy
```

Upgrading an existing database (adds the Slice A columns and `shoutouts`; safe to re-run, skips what exists):

```
node scripts/migrate.mjs --local
node scripts/migrate.mjs --remote
```

Fresh databases get everything from `schema.sql`.

`npm run dev` runs it locally on http://localhost:8787 with a local KV and D1
(apply the schema with `--local` first). `npm run typecheck` runs tsc.

## API

All bodies and responses are JSON. Session routes take `Authorization: Bearer <session token>`.

| Route | Body | Returns |
|---|---|---|
| `GET /auth/start?return=<app url>` | – | 302 to Google; `return` must be on an allowed origin |
| `GET /auth/callback` | – | 302 back to the app with `#session=<token>`, or `#auth=failed` / `#auth=cancelled` |
| `POST /auth/logout` | – | `{ ok: true }` and deletes the session |
| `GET /me` | – | `{ id, name, email }` |
| `POST /sync` | `{ tasks: Task[], entries: Entry[], wallet?: Wallet }` — local changes since the last sync. `Task.target` 1-20 (default 1); `Entry.n` 0-999 (default `on`), `Entry.kind` 0 normal / 1 freeze / 2 repair (default 0); `wallet` = `{ gems 0-1e6, freezes 0-2, milestones: string[] (<= 2000), updated: ms }` | `{ tasks, entries, wallet, now }` — full state after merging (tasks: newest `updated` wins; entries: newest `t` wins; wallet: newest `updated` wins, default `{gems:0,freezes:0,milestones:[],updated:0}`) |
| `POST /groups` | `{ taskId }` — caller's own, non-deleted, ungrouped task | `{ group, task }` — task now has `groupId`; caller becomes host and first member |
| `GET /groups/preview?code=<inviteCode>` | – (no session needed) | `{ name, hostName, members, memberLimit }` or 404 |
| `POST /groups/join` | `{ code }` | `{ group, task }` — caller's new task, or their existing one if already a member; 409 `group full` at the limit |
| `GET /groups/:id/board?today=YYYY-MM-DD` | – (member only) | `{ group, members: Member[] }` — `Member` adds `shouts` (received in the last 7 days), `shoutedToday` (caller already shouted at them today), `friend` (consecutive days ending today/yesterday both were on; 0 for the caller). Freeze/repair days (`kind` 1/2) keep `streak`/`friend` alive but are excluded from `month` and `total` |
| `POST /groups/:id/shout?today=YYYY-MM-DD` | `{ userId }` (member -> another member; `today` may also be in the body) | `{ ok: true, count }` — `count` = shoutouts the target received in the last 7 days; 409 `already today` for a repeat on the same day; 400 self; 404 target not a member; 403 caller not a member |
| `POST /groups/:id/leave` | – (member, not host) | `{ ok: true }` — membership removed, task's `groupId` cleared |
| `POST /groups/:id/remove` | `{ userId }` (host only) | `{ ok: true }` — same as leave, for that member |
