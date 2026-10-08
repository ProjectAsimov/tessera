# Changelog

Web releases are dated (the PWA updates itself on next open). Android builds
carry a version; the Android shell only wraps the web app, so most releases
need no new bundle.

## 2026-10-07 (b) — Accounts, safety, tiles

- Delete your account from Settings → Account. It removes your tasks, days,
  tiles, groups you host and your memberships on every device at once. A web
  page explains the email route for anyone who has uninstalled.
- Members list for every group member: report a member with a reason, or
  block them (they vanish from your leaderboard and shoutouts stop both ways).
  Hosts still remove members. Unblock from the Blocked section.
- Join and Invite sheets state what members can see and link to the community
  guidelines. Settings links to the privacy policy and guidelines.
- The earned currency is now called **tiles**, with a small lit-square icon.

Internal: `DELETE /me`, block/unblock/report routes, D1 migration 003, CORS
allows DELETE, privacy policy rewritten for the new data, delete.html and
guidelines.html on the site, store listing copy fixed.

## 2026-10-07 (a) — Tessera, and slice A

- The app is now **Tessera**. New address: https://projectasimov.github.io/tessera/
  (reinstall once; your data comes back from your account).
- Flame border on tasks with a streak: 7, 30, 100 and 365 days each get their own.
- Milestone moment when a streak reaches 7 / 30 / 100 / 365 or a new best, with
  a currency reward.
- Tasks can need several events per day ("water ×8"); a day counts once you
  reach 70% of the target, and the squares fill as you go.
- Streak freezes: banked at 14-day marks (max 2) and used automatically when you
  miss a single day. Repair a missed day inside the last week for 100 currency.
  Frozen and repaired days are marked ❄ and don't add to your counts.
- Shoutouts: send one 🔥 per member per day from the leaderboard; see how many
  you received this week.
- Friend streaks: 🤝 N shows how many days in a row you and a group member both
  showed up.

Internal: D1 migration 002 (target, n, kind, wallet columns, shoutouts),
wallet merge on /sync, shout route, board fields; Android package renamed to
`com.projectasimov.tessera`; Play compliance skill added.

## Android 1.0.0 (1) — first internal-testing build

- Trusted Web Activity wrapping the web app. Minimum Android 7.0 (API 24).
- Signed with the upload key; Play App Signing manages the distribution key.

**Play "What's new":** First internal build of Tessera: track daily habits as a
mosaic of tiles, streaks, groups with a leaderboard, and sync across devices.

## 2026-09-27 — Groups and polish

- Share a task into a group by invite link; members keep their own record and
  see a leaderboard (streak, month, total). Hosts can remove members.
- Google sign-in with cross-device sync; works offline and catches up later.
- Press-and-slide to mark a whole stretch of days; ripple and slide animations;
  month labels on the year grid are tappable pills.

## 2026-09-26 — Gym years

- One tracker, one square per day, streaks, backup/restore, light and dark
  themes with eight accent colours.
