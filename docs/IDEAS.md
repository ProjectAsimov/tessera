# Ideas (brainstorm log)

Running list. Nothing here is committed to; it's a parking lot. Newest at the
bottom of each section. Mark items `[shipped]`, `[planned]`, `[dropped]` as
decisions get made.

## From Theo (2026-10-01)

- **Shoutout mechanism, no in-app chat.** Lightweight reactions to a member's
  milestone/streak (e.g. a 🔥 tap) rather than messaging.
- **1000-person cap on paid membership.** Scarcity + keeps support manageable.
- **Chat only for paid members.** (Tension with "no in-app chat": chat as a paid
  perk, shoutouts for everyone.)
- **Managers can push notifications to their clients.**
- **Gems:** earn points on streaks; watch an ad for more; spend points to fill a
  missed day; streak freeze.
- **Session managers (paid)** can see when a client used a streak freeze.
- **Animation on major milestones.**
- **Flame/colour border on tasks on a streak, scaling with streak length.**
- **Multi-event-per-day tasks** (e.g. "drink water ×8", "two workouts").

## Claude's additions (2026-10-01)

### Monetisation without ad-flooding
- **Freemium split that doesn't punish the core loop.** Marking days, the grid,
  streaks, sync and small groups stay free forever. Paid = coaching tools,
  bigger groups, cosmetics, and convenience, never the act of tracking.
- **Coach tier (the real money).** A trainer/manager pays per seat or a flat
  monthly fee for: client dashboard (who missed, who froze), push reminders to
  clients, weekly digest email, exporting client data, custom task templates
  they can push to all clients. Clients stay free. This is where "manager push
  notifications" and "see streak freezes" belong.
- **Group size as the paid lever.** Free groups up to N (5–10); paid host unlocks
  50; coach tier unlocks several groups.
- **Cosmetics, not power.** Paid accent palettes, animated grid themes, custom
  icons, flame styles. Cheap to build, no fairness issues on leaderboards.
- **Rewarded ads only where the user chooses them** (the "watch an ad for gems"
  path) so the app itself never shows ads. Keep the gem economy small so it never
  feels pay-to-win on a leaderboard: freezes should be visible to the group
  (❄ marker on the day), which also answers "managers see freezes" for free.
- **Lifetime unlock** as the alternative to subscription for solo users; many
  habit apps do both.

### Retention / delight
- **Streak freeze with a cap** (e.g. max 2 banked), earned by streaks, not bought
  with real money. Repairing a missed day is the one thing that should cost gems.
- **Milestone moments:** 7 / 30 / 100 / 365 days, "first full month", "best streak
  ever". Full-screen animation + the shoutout prompt to the group.
- **Flame border scaling** maps nicely to tiers: 7+ ember, 30+ flame, 100+ blue
  flame, 365+ gold.
- **Weekly recap** (Sunday evening): days done per task, streak status, one line
  of comparison to last week. Push + in-app card.
- **Smart reminders:** one nudge per day at a time the user picks, suppressed if
  already marked. Later: "you usually mark by 7pm".
- **Perfect week / perfect month badges** per task.
- **Multi-event tasks** (Theo's) -> show as partial fill in the square (e.g. 3/8
  = 37% filled), counts as "done" at the target.
- **Widgets** (Android home-screen widget showing today's checks) once there's a
  native wrapper; huge for daily return.
- **Yearly wrap-up** ("your 2026 in squares") shareable image.

### Social, without chat
- **Shoutouts as reactions** on leaderboard rows (tap 🔥/👏 once per day per
  member). Shown as a small count next to the name.
- **Friend streaks** (Duolingo-style): a shared streak that counts days both of
  you marked. Strong reason to come back for each other.
- **Challenges:** host sets "30 days of X starting Monday"; everyone sees a
  progress bar for the group as a whole.
- **Shareable milestone cards** (image export) for Instagram/WhatsApp; free
  marketing.

### Guardrails
- Leaderboards should rank on *consistency* (streak/month) rather than totals so
  long-time users don't lock the top forever.
- Anything bought with money must be invisible on the leaderboard or clearly
  marked (freeze = ❄).
- Keep "gems" out of the first paid tier pitch; coaches are the clean revenue.

## Open questions
- Who is the first paying customer: solo users (cosmetics/lifetime) or coaches
  (seats)? Coaches are fewer but pay 10×.
- Does the 1000 cap apply to paid solo, to coaches, or to total accounts?
- Ads: rewarded-only, and only after a user opts into the gem system?

## Market notes (research, 2026-10-01)

What the comparable apps actually do. Prices are list prices found at the
time; treat the retention stats as indicative, they come from teardowns and
blogs rather than papers.

- **Duolingo.** Streak is the core mechanic; 7+ day streak users retain ~2.4×.
  Streak freeze costs 200 gems and auto-applies on a miss; 100-day streak
  ("Streak Society") grants 3 bonus freezes. Gems come from lessons, quests,
  every-10-day streak bonus, top-3 league finishes. Friend Streaks: users with
  one are ~22% more likely to do their daily lesson. Super ≈ $16.99/mo or
  $119.99/yr removes ads, adds streak repair. (Ad-for-gems not confirmed.)
- **Solo habit apps.** Streaks (iOS) $5.99 once, no social. Habitify free for 3
  habits, ~$50–60/yr or $59.99 lifetime. Way of Life free for 3 habits, $4.99/mo.
  Strides free for 3, ~$39.99/yr or lifetime. Habitica free core, $4.99/mo for
  gems/cosmetics only, has parties/guilds. Finch free, Plus $69.99/yr for
  cosmetics. HabitShare fully free, friend visibility only. Loop free/open
  source. **Nobody leads with ads.** The standard free/paid line is "3 habits
  free, unlimited paid" plus export/stats/cosmetics.
- **Coach platforms (the B2B money).** Trainerize from ~$22/mo scaling by client
  count. TrueCoach $29.98/mo (5 clients) → $164.98/mo (50). Everfit free to 5
  clients, then ~$2–5 per client. Nudge Coach free to 3, $30/mo (15), $60/mo
  (50), $100+/mo scale. All price per client tier; all cap the free tier by
  client count. No consumer habit app bundles a coach dashboard.
- **Accountability with money at stake.** StickK (free, pay on failure to
  charity/anti-charity), Beeminder (~$8/mo + escalating derailment charges).
  Niche but sticky. Stridekick: free 10-person challenge, Pro $12.99–$49.99 once
  for bigger challenges and group leaderboards.
- **Google Play rules that matter.** Gems that are only *earned* need no Play
  billing; gems *sold* for money must go through Play billing (15% up to $1M/yr,
  30% above; subscriptions ~15% effective from mid-2026). Any random-reward
  chest must disclose odds. Streak repair as a consumable IAP is allowed.

### What this changes in the list above
- Confirms the coach tier as the clean revenue line; per-client tiers (free to
  3–5 clients, then $30/$60/$100 bands) are the industry shape to copy.
- Confirms friend streaks as the single highest-value social feature to add.
- The "3 free, unlimited paid" habit cap is standard, but it taxes the core loop.
  Prefer group size, cosmetics and coaching as the paid levers (see Guardrails).
- Earned-only gems keep us out of Play billing entirely until we choose to sell
  anything, so the gem system can ship free of payment plumbing.

## From Theo (2026-10-07)

- **Rename the app.** "TaskTracker" is generic (and hard to find in a store search).
  Decide before the first Play upload; the package id is permanent after that.
- **Watch compatibility** (Wear OS tile/complication: today's checks, tap to mark).
  Needs a native layer; not possible from the TWA alone.
- **Badges/achievements:** perfect week, perfect month (per task). Cheap; pairs
  with milestones.
- **Year view, multi-event tasks: fill by gradient** (partial day = partial fill).
  Slice A already fills squares proportionally; make it a gradient rather than a
  hard edge.
- **Widgets** (home-screen: today's checks). Native layer again; same work as watch.
- **Year in review** with a share icon (shareable image of the year grid + stats).
- **Mascot: snow leopard?** (Fits streaks/freezes: cold-climate, solitary, rare.)
- **Gems need a real name** and should look like a small variant of the lit
  year-grid square rather than a generic gem icon.

### Claude's notes on these
- Native layer (widgets + watch) is one project: a thin Android app that embeds
  the TWA and adds a widget + Wear tile reading the same data via the worker.
  Worth doing after the store listing exists, not before.
- Currency name candidates that are literally "a small square": **tiles**,
  **pips**, **chips**, **bits**, **tessera/tesserae**. "Tiles" is the plainest.
- Mascot can carry the freeze mechanic ("the leopard saved your streak").

## Status (2026-10-07)

- `[shipped]` Flame border, milestone animation, multi-event tasks (70% rule, gradient
  fill), earned-only tiles, streak freeze + repair, shoutouts, friend streaks.
- `[in progress]` Compliance slice A.1: account deletion, report/block, terms, tiles naming.
- `[planned next]` Badges (perfect week / perfect month), year in review with share image.
- `[later]` Push notifications (reminders, weekly recap, manager → client), coach tier,
  native layer for widgets + watch, mascot (snow leopard), rewarded ads (only if tiles
  ever become scarce enough to want them).
