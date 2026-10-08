# TaskTracker architecture

Track any yes/no daily task, one square per day. Private by default; a task can
be shared into a group whose members each keep their own copy and see a
leaderboard (phase 2).

## Repository layout

```
app/                      Vite + TypeScript + Preact PWA (GitHub Pages)
  src/
    components/           Button, Card, Sheet, Segmented, Swatches, StatTile,
                          Heatmap, MonthCalendar, ListRow, Toast, Icon
    screens/              Home, Task, Settings, Welcome
    model/                types.ts, store.ts (state + local persistence),
                          sync.ts (server merge), api.ts (fetch wrapper)
    lib/                  dates.ts, stats.ts, theme.ts, ids.ts
    styles/               tokens.css, base.css
    main.tsx, app.tsx
  public/                 icons, manifest
worker/                   Cloudflare Worker (TypeScript)
  src/
    index.ts              entry: CORS, routing, error envelope
    routes/               auth.ts, me.ts, sync.ts (groups.ts in phase 2)
    services/             google.ts, sessions.ts, tasks.ts, entries.ts, migrate.ts
    db/                   schema.sql, migrations/, queries.ts
    middleware/           auth.ts (session -> user), cors.ts
    lib/                  crypto.ts, json.ts, validate.ts
    types.ts
  wrangler.toml
docs/                     this file
.github/workflows/        pages.yml (build app/, deploy to Pages)
```

## Object model

| Object | Fields | Notes |
|---|---|---|
| User | id (Google `sub`), name, email, created | |
| Task | id (client UUID), ownerId, name, color, icon, archived, groupId?, created, updated, deleted | `updated` drives merge (newest wins) |
| Entry | taskId, day (`YYYY-MM-DD`), on (0/1), t (ms) | `t` drives merge (newest wins); `on:0` is a tombstone so removals sync |
| Group | id, name, hostId, inviteCode, memberLimit (50), created | phase 2 |
| Membership | groupId, userId, taskId, joined | member's own task instance in the group |

Colors are accent ids from the app palette (`purple`, `blue`, `teal`, `green`,
`yellow`, `orange`, `red`, `pink`). Icons are short ids from the app's icon set.

## Storage

- **D1** (`DB` binding): `users`, `tasks`, `entries`, and in phase 2 `groups`,
  `memberships`. Schema in `worker/src/db/schema.sql`.
- **KV** (`DAYS` binding): sessions (`s:<sha256(token)>`, 90-day TTL) and
  OAuth state (`st:<state>`, 10-minute TTL). Also holds the legacy single-tracker
  records (`g:<sub>`) that `migrate.ts` turns into a "Gym" task on first sync.
- **Browser**: `localStorage` key `tt.state.v1` with `{tasks, entries, pending}`;
  `tt.session`, `tt.theme`, `tt.accent`, `tt.welcomed`, `tt.syncon`.

## API (worker)

All JSON. Session routes take `Authorization: Bearer <session token>`.
Errors are `{ error: string }` with a 4xx/5xx status.

| Route | Body | Returns |
|---|---|---|
| `GET /auth/start?return=<app url>` | – | 302 to Google; `return` must be on an allowed origin |
| `GET /auth/callback` | – | 302 to the app with `#session=<token>`, or `#auth=failed&r=<reason>` / `#auth=cancelled` |
| `POST /auth/logout` | – | `{ ok: true }` |
| `GET /me` | – | `{ id, name, email }` |
| `POST /sync` | `{ tasks: Task[], entries: Entry[] }` — everything changed locally since the last successful sync (may be empty) | `{ tasks: Task[], entries: Entry[], now }` — the user's full current state after merging |

Merge rules on `/sync`: a task is replaced when the incoming `updated` is newer;
an entry when the incoming `t` is newer. Unknown task ids in `entries` are
ignored. Tasks must belong to the caller. Limits: 200 tasks, 20 000 entries per
user; oversize requests get 413.

## Sync model (client)

The store is the source of truth on the device. Every local change marks the
task or entry as pending. `sync()` posts the pending set, replaces local state
with the server's response (keeping anything that changed while the request was
in flight), and clears pending. Triggers: 1.5 s after a change, on load, when
the tab becomes visible (if last sync > 30 s ago), on `online`. Sync is on by
default and can be switched off in Settings; signing out keeps local data.

## Theming

CSS custom properties on `:root` (`--bg`, `--panel`, `--text`, `--muted`,
`--cell`, `--lit`, `--lit-soft`, `--btn`, `--btn-text`, `--danger`). Mode is
auto / light / dark; the accent is one of the eight palette ids, each with a
dark-mode and a light-mode shade. Per-task color uses the same palette.

## Phase 2: groups and leaderboard

A task can be **shared**. Sharing creates a group named after the task and an
invite link. Anyone who opens the link and signs in **joins** the group and gets
their own task (same name, color, icon) linked to it; each member marks their
own days. Every member sees a **leaderboard** for the group. The host can remove
members; a member can leave. `memberLimit` is 50 and is enforced on join.

Server owns `Task.groupId`: `/sync` ignores any incoming `groupId` and keeps the
stored value. When a grouped task arrives through `/sync` with `deleted: 1`, the
server also deletes that user's membership (deleting the task leaves the group).
Archived tasks stay in the group.

### Routes (session required unless noted)

| Route | Body / query | Returns |
|---|---|---|
| `POST /groups` | `{ taskId }` — caller's own, non-deleted, ungrouped task | `{ group, task }` — task now has `groupId`; the caller becomes host and first member |
| `GET /groups/preview?code=<inviteCode>` | no session needed | `{ name, hostName, members, memberLimit }` or 404 |
| `POST /groups/join` | `{ code }` | `{ group, task }` — the caller's new task (or their existing one if already a member); 409 `group full` at the limit |
| `GET /groups/:id/board?today=YYYY-MM-DD` | member only | `{ group, members: Member[] }` |
| `POST /groups/:id/leave` | member (not host) | `{ ok }` — membership removed; the task stays with `groupId` cleared |
| `POST /groups/:id/remove` | `{ userId }`, host only | `{ ok }` — same as leave for that member |

Shapes:

```ts
Group  = { id, name, hostId, inviteCode, memberLimit, members: number, created }
Member = { userId, name, isHost, isMe, streak, month, total, lastDay: string | null }
```

`today` comes from the client (its local date) so streaks and month counts match
what the member sees. Board stats per member, over that member's task entries
with `on = 1`: `streak` = consecutive days ending on `today` or the day before;
`month` = days in `today`'s month; `total` = all days. Members whose task is
deleted are excluded. Sort by streak desc, then month desc, then total desc,
then name. Invite codes are 10 chars from `[a-z0-9]`, generated server-side.

### App

- Invite link: `https://projectasimov.github.io/tasktracker/#join=<code>`.
  On load, `#join=` is stored in `localStorage['tt.pendingJoin']` and removed
  from the URL. If signed out, the Welcome dialog says the sign-in is to join;
  once a session exists the Join sheet shows the preview (name, host, N of 50)
  with Join / Not now. Joining syncs and opens the new task.
- Task screen: "Share" in the … menu when ungrouped → creates the group → Share
  sheet with the link, Copy, and the native share button when `navigator.share`
  exists. When grouped, a **Group** card below the stats shows the leaderboard
  (me highlighted; host marked), "N of 50 members", Invite (re-opens the Share
  sheet), Leave (member) or Manage members (host: list with Remove; confirm
  each). The board refreshes when the screen opens and after each sync.
- Home rows show a small group badge on grouped tasks.

## Slice A: flames, milestones, multi-event tasks, gems, freezes, shoutouts, friend streaks

All free; gems are earned only (no Play billing involved).

### Model changes

- `Task.target` (int, default 1): events per day. A task with `target > 1` is
  "multi-event". A day **counts** (is `on`) when `n >= ceil(0.7 * target)`.
- `Entry.n` (int, default 1 when `on`, 0 when off): events logged that day.
  `Entry.on` stays the stored, synced truth for "counts toward streak"; the client
  sets it from `n` and `target`. `Entry.kind`: 0 normal, 1 **freeze** (a missed
  day covered by a banked freeze), 2 **repair** (a missed day filled with gems).
  Kinds 1 and 2 keep a streak alive but do **not** count toward month/year/total.
- `Wallet` per user: `{ gems, freezes, milestones: string[], updated }`.
  `milestones` holds awarded keys `"<taskId>:<n>"` so awards happen once.
  Client-authoritative, merged by `updated` (newest wins) through `/sync`.
- D1: `tasks.target INTEGER NOT NULL DEFAULT 1`; `entries.n INTEGER NOT NULL
  DEFAULT 1`, `entries.kind INTEGER NOT NULL DEFAULT 0`; `users.gems`,
  `users.freezes`, `users.milestones TEXT (JSON)`, `users.wallet_updated`.
  New table `shoutouts(group_id, from_id, to_id, day, PRIMARY KEY(group_id, from_id, to_id, day))`.
  Apply as `ALTER TABLE ... ADD COLUMN` statements in `db/migrations/002_slice_a.sql`
  (idempotent: guard with a check of `pragma_table_info`), plus `CREATE TABLE IF NOT EXISTS`.

### Rules (client computes; server stores and relays)

- **Streak tiers** for the flame border: 7+ ember, 30+ flame, 100+ blue, 365+ gold.
- **Milestones**: when marking today lifts a task's streak to exactly 7, 30, 100
  or 365, or sets a new best streak of 7 or more: play the milestone animation,
  award gems once per key (`7:10`, `30:50`, `100:200`, `365:500`; new-best: 5),
  and at 14-day multiples of streak bank one freeze (cap 2).
- **Freeze (auto)**: on load/sync, for each task with an active streak that ended
  exactly one day before yesterday (i.e. yesterday is missing and the day before
  is on), if `wallet.freezes > 0`: write yesterday as `{on:1, n:0, kind:1}` and
  decrement freezes. Only yesterday is ever auto-frozen, and only once.
- **Repair (manual)**: on the month calendar, a missed day within the last 7 days
  can be repaired for 100 gems → `{on:1, n:0, kind:2}`. Confirm sheet shows the cost.
- **Shoutouts**: a member can send one shoutout per day to each other member of a
  group. `POST /groups/:id/shout { userId }` → `{ ok, count }`; 409 if already sent
  today. The board returns per member `shouts` (received in the last 7 days) and
  `shoutedToday` (whether the caller already sent one today).
- **Friend streak**: for the caller and each other member, the number of
  consecutive days (ending today or yesterday) on which **both** members' tasks
  in that group were `on`. Returned on the board as `friend` per member.
  Computed server-side from entries.

### Routes

| Route | Body | Returns |
|---|---|---|
| `POST /sync` | adds `wallet?: Wallet` to the request | adds `wallet: Wallet` to the response; tasks carry `target`, entries carry `n`, `kind` |
| `POST /groups/:id/shout` | `{ userId }` | `{ ok: true, count }` or 409 `already today` |
| `GET /groups/:id/board` | unchanged | `Member` gains `shouts: number`, `shoutedToday: boolean`, `friend: number`; `today` is still the client's date |

### App

- Add/Edit task: "Times per day" stepper (1–20). Multi-event rows show `n/target`
  and the home check button increments `n` (long-press or the task screen's
  "−" to decrement); the square fills proportionally (`n/target`), full and lit
  once it counts.
- Flame border on list rows and the task screen's today button by tier
  (CSS classes `flame-1..4`, animated subtly, respects reduced motion).
- Milestone overlay: full-screen, ≤ 1.2 s, task color, "7 days", gem award line.
- Gems + freezes shown in Settings ("Wallet") and as a small pill on the task
  screen; freeze bank shown as ❄×n. Repaired/frozen days show a ❄ in the month
  calendar and a lighter square on the year grid.
- Leaderboard rows: 🔥 button (disabled after use today) with the received count;
  "🤝 N" friend streak next to the name when N > 0.
- Mock API implements all of it (including shout/friend/board fields).

## Slice A.1: Play compliance (account deletion, report/block, terms, naming)

Driven by docs/compliance/2026-10-07-internal-testing.md.

### Naming
The earned currency is called **tiles** everywhere the user can see it (UI
copy, store listing, privacy policy); the icon is a small lit square in the
task colour, not a gem emoji. Code identifiers (`gems`, `wallet.gems`) stay.

### Account deletion
- `DELETE /me` (session required): deletes, in one D1 batch, the caller's
  shoutouts (sent and received), blocks, reports, memberships, entries, tasks,
  and for groups the caller hosts: the group, all its memberships, and clears
  `group_id` on the other members' tasks. Then deletes the `users` row, the
  current session, and writes KV `del:<sub>` (90-day TTL). `requireSession`
  returns 401 for any session whose `sub` has a `del:` marker, so other devices'
  sessions die too. Returns `{ ok: true }`.
- App: Settings → Account → **Delete account** → confirm sheet (what is deleted,
  irreversible) → call → clear local state and session → toast. Also a
  **Privacy policy** link and a **Community guidelines** link in Settings.
- Web: `https://projectasimov.github.io/delete.html` explains the in-app path
  and the email route for users who uninstalled.

### Report and block
- D1 tables: `blocks(user_id, blocked_id, created, PRIMARY KEY(user_id, blocked_id))`,
  `reports(id, group_id, reporter_id, reported_id, reason, created)`.
- `POST /groups/:id/block { userId }` / `POST /groups/:id/unblock { userId }`
  (member only; cannot block self). `GET /me/blocks` → `{ userIds: [] }`.
- `POST /groups/:id/report { userId, reason }` (reason ≤ 500 chars; member
  only) → `{ ok: true }`. Reports are stored for us to action;
  `worker/scripts/reports.mjs` lists them (`--remote`).
- Board: members the caller has blocked are omitted from the caller's board;
  a blocked member's shoutouts to the caller are rejected with 403 and never
  counted; the caller's shoutouts to someone who blocked them are rejected 403.
- App: the members sheet is available to every member (host keeps Remove);
  each other member's row has **Report** (reason sheet with a short text field)
  and **Block / Unblock**. Blocked members disappear from the caller's board.
- Join sheet and Share sheet carry one line: "Members see each other's names,
  streaks and shoutouts. By joining you agree to the community guidelines."
  linking to `https://projectasimov.github.io/guidelines.html`.

## Slice B: badges and year in review (app only)

### Badges (per task, computed from entries; no server change)
- **Perfect week**: a Sunday–Saturday week in which all 7 days are `on` with
  `kind: 0` (frozen or repaired days don't make a perfect week). Key
  `<taskId>:pw:<YYYY-MM-DD of that Sunday>`.
- **Perfect month**: every day of a calendar month `on` with `kind: 0`. Key
  `<taskId>:pm:<YYYY-MM>`. A perfect month also implies its weeks; both award.
- Awards (once per key, via `wallet.milestones` like other milestones): perfect
  week +10 tiles, perfect month +50 tiles. Checked whenever a day is marked and
  on load; award only for weeks/months that ended on or before today (a week
  ending today counts once today is marked).
- Celebration: reuse the milestone overlay with "Perfect week" / "Perfect
  month" and the tile line; one overlay per event, queued if several.
- Display: a **Badges** row on the task screen under the stat tiles: two
  pills, "✦ N perfect weeks" and "◆ N perfect months" (hidden at 0 each; the
  row hidden if both are 0). Tapping a pill lists the dates in a small sheet.
  On the year grid, a perfect month's label pill gets a subtle filled style.

### Year in review (shareable image)
- Task … menu → **Year in review** (also offered automatically in the task
  menu from 15 December). Renders a 1080×1920 PNG on a canvas, client-side:
  task icon + name in the task colour, the year, the year grid (same layout as
  the Heatmap, 2 rows of weeks, lit/partial/frozen squares), and four stats:
  days done, best streak, perfect weeks, perfect months, plus "Tessera" and
  the site URL small at the bottom. Dark background, task colour accents.
- Share with `navigator.share({ files: [png] })` when `navigator.canShare`
  allows files; otherwise download `tessera-<task>-<year>.png`. Preview the
  image in a sheet first with Share / Save and a year picker when the task has
  more than one year.
