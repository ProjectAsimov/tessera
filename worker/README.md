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

Upgrading an existing database (runs migrations 002, 003 and 004: Slice A columns and `shoutouts`, Slice A.1 `blocks` and `reports`, Slice C `push_subs`; safe to re-run, skips what exists):

```
node scripts/migrate.mjs --local
node scripts/migrate.mjs --remote
```

Fresh databases get everything from `schema.sql`.

`npm run dev` runs it locally on http://localhost:8787 with a local KV and D1
(apply the schema with `--local` first). `npm run typecheck` runs tsc.


## Web Push (Slice C)

Opt-in daily reminders and a weekly recap. A cron trigger (`*/15 * * * *`, see `wrangler.toml`) runs
`scheduled()` -> `services/notify.ts`: for each subscription it works out the local time from the
subscription's `tz` (via `Intl.DateTimeFormat`), then
- **daily reminder**: local hour == `reminder_hour` and `last_reminder_day` != local date -> if the user has
  non-archived, non-deleted tasks with no `on` entry for that local date, push "N tasks left today" (or
  "<name> left today" for one). The day is stamped when the push is accepted, or when there was nothing to send;
- **weekly recap**: Sunday at local 18:00 with `weekly = 1` and `last_weekly_day` != local date -> "This week: 11 days
  across 3 tasks (last week 9). Longest streak: Gym, 23 days." (Mon-Sun, normal days only; frozen/repaired days
  keep the streak but are not counted as done).

Messages are encrypted per RFC 8291 (aes128gcm) and authenticated with VAPID (RFC 8292) in `src/lib/webpush.ts`
(WebCrypto only, no dependency). A 404/410 from the push service deletes the subscription; any other failure
adds 1 to `failures` and the subscription is deleted at 5. A success resets `failures`.

VAPID keys: `node scripts/vapid.mjs` prints the public key (already in `wrangler.toml` as `VAPID_PUBLIC_KEY`) and
writes the private key only to `C:\Users\User\.secrets\tasktracker\vapid-private.txt` (it refuses to overwrite).
Deploying needs the secret (paste the file's contents) and the migration:

```
node scripts/migrate.mjs --remote
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler deploy
```

| Route | Body | Returns |
|---|---|---|
| `GET /push/key` | – (no session) | `{ publicKey }` |
| `POST /push/subscribe` | `{ subscription: { endpoint, keys: { p256dh, auth } }, tz, reminderHour: 0-23 \| null, weekly: bool }` — endpoint must be https, `p256dh` a 65-byte uncompressed P-256 point, `auth` 16 bytes (base64url), `tz` an IANA zone | `{ ok: true }` — upserts by endpoint (the caller takes it over) and resets `failures` |
| `POST /push/prefs` | `{ endpoint, reminderHour?: 0-23 \| null, weekly?: bool, tz? }` — omitted fields stay as they are | `{ ok: true }`; 404 when the caller has no such subscription |
| `POST /push/unsubscribe` | `{ endpoint }` | `{ ok: true }` — idempotent, only touches the caller's own subscription |
| `POST /push/test` | `{ endpoint }` | `{ ok: true }` after sending "Notifications are on" to that endpoint; 429 on a second call within a minute (per user); 404 unknown endpoint; 502 if the push service refused it |

`DELETE /me` also deletes the caller's subscriptions.

### Testing Web Push locally

```
node scripts/migrate.mjs --local
npx tsx tests/webpush.test.mjs        # RFC 8291 Appendix A known answer, VAPID JWT, request shape
# worker with the private key from the secrets file, without echoing it:
VK="$(cat /c/Users/User/.secrets/tasktracker/vapid-private.txt)"
npx wrangler dev --port 8787 --test-scheduled --var DEV_PUSH_HTTP:1 --var DEV_NOW_OVERRIDE:1 --var "VAPID_PRIVATE_KEY:$VK"
node tests/push.integration.mjs       # stub push service on :8799, plants pt-* rows in the local DB, cleans up
```

`DEV_PUSH_HTTP=1` lets `/push/subscribe` accept `http://` endpoints (the stub); `DEV_NOW_OVERRIDE=1` enables
`GET /__notify?now=<ISO>` to run the notification pass at a chosen instant (wrangler's `/__scheduled?time=` does not
change the clock inside the worker). Neither is set in `wrangler.toml`. Trigger the real cron path with
`curl "http://127.0.0.1:8787/__scheduled?cron=*/15+*+*+*+*"`.

## API

All bodies and responses are JSON. Session routes take `Authorization: Bearer <session token>`.

| Route | Body | Returns |
|---|---|---|
| `GET /auth/start?return=<app url>` | – | 302 to Google; `return` must be on an allowed origin |
| `GET /auth/callback` | – | 302 back to the app with `#session=<token>`, or `#auth=failed` / `#auth=cancelled` |
| `POST /auth/logout` | – | `{ ok: true }` and deletes the session |
| `GET /me` | – | `{ id, name, email }` |
| `DELETE /me` | – | `{ ok: true }` — deletes the caller's shoutouts, blocks, reports, memberships, entries and tasks; dissolves groups they host (other members' tasks get `groupId: null`); deletes the user row and session; writes KV `del:<sub>` (90 days) so the caller's sessions on other devices return 401 |
| `GET /me/blocks` | – | `{ userIds: string[] }` — users the caller has blocked |
| `POST /sync` | `{ tasks: Task[], entries: Entry[], wallet?: Wallet }` — local changes since the last sync. `Task.target` 1-20 (default 1); `Entry.n` 0-999 (default `on`), `Entry.kind` 0 normal / 1 freeze / 2 repair (default 0); `wallet` = `{ gems 0-1e6, freezes 0-2, milestones: string[] (<= 2000), updated: ms }` | `{ tasks, entries, wallet, now }` — full state after merging (tasks: newest `updated` wins; entries: newest `t` wins; wallet: newest `updated` wins, default `{gems:0,freezes:0,milestones:[],updated:0}`) |
| `POST /groups` | `{ taskId }` — caller's own, non-deleted, ungrouped task | `{ group, task }` — task now has `groupId`; caller becomes host and first member |
| `GET /groups/preview?code=<inviteCode>` | – (no session needed) | `{ name, hostName, members, memberLimit }` or 404 |
| `POST /groups/join` | `{ code }` | `{ group, task }` — caller's new task, or their existing one if already a member; 409 `group full` at the limit |
| `GET /groups/:id/board?today=YYYY-MM-DD` | – (member only) | `{ group, members: Member[] }` — `Member` adds `shouts` (received in the last 7 days), `shoutedToday` (caller already shouted at them today), `friend` (consecutive days ending today/yesterday both were on; 0 for the caller). Freeze/repair days (`kind` 1/2) keep `streak`/`friend` alive but are excluded from `month` and `total` |
| `POST /groups/:id/shout?today=YYYY-MM-DD` | `{ userId }` (member -> another member; `today` may also be in the body) | `{ ok: true, count }` — `count` = shoutouts the target received in the last 7 days; 409 `already today` for a repeat on the same day; 400 self; 404 target not a member; 403 caller not a member |
| `POST /groups/:id/leave` | – (member, not host) | `{ ok: true }` — membership removed, task's `groupId` cleared |
| `POST /groups/:id/remove` | `{ userId }` (host only) | `{ ok: true }` — same as leave, for that member |
| `POST /groups/:id/block` | `{ userId }` (member; another member) | `{ ok: true }` — the target disappears from the caller's board; shoutouts either way between the two are 403; 400 self; 404 target not a member |
| `POST /groups/:id/unblock` | `{ userId }` (member) | `{ ok: true }` — idempotent |
| `POST /groups/:id/report` | `{ userId, reason }` (member; `reason` 1-500 chars) | `{ ok: true }` — stored in `reports`; 400 self / bad reason; 404 target not a member; 403 caller not a member |

Blocks are global per user (not per group). List reports with `node scripts/reports.mjs --local|--remote`.
