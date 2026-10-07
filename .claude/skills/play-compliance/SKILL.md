---
name: play-compliance
description: Google Play policy and release-compliance audit for Tessera (the Android TWA + PWA in this repo). Use this before any Play Console upload or release (internal, closed, open or production), before submitting the Data safety form or content rating, and whenever a feature touches a policy area — sign-in and accounts, data collection or sync, user-generated content (names, groups, shoutouts, chat), notifications, ads, virtual currency, purchases or subscriptions, permissions, target SDK, app signing or asset links, store listing copy. Also use it when the user asks "are we compliant", "will Play reject this", "what do we need before release", or mentions Play policy, Data safety, IARC, content rating, Play App Signing, or the Developer Program Policies.
---

# Play compliance audit

Tessera is small, but Play rejections are slow and expensive to recover from
(days per review round, and suspensions are hard to appeal), so this skill
makes compliance a repeatable check rather than something remembered at upload
time. The references in `references/` are distilled from Google's policy pages;
`references/sources.md` says what each was built from and how fresh it is.

## When you're invoked

Decide which of the two modes applies, then run it.

**Feature gate**: a change is being planned or built that touches a policy
area. Audit only the areas it touches, and say what the change must include to
stay compliant (e.g. "adding chat means UGC rules apply: report + block + terms
acceptance before it ships").

**Release gate**: something is about to be uploaded or promoted on Play. Run the
full checklist below against the current code, store assets and console state,
and produce the report. Do not declare a release ready while any item is Fail.

## How to audit

1. Read the relevant reference file(s) in full before judging anything:
   - `references/content-policy.md` — the Developer Program Policies, each
     section marked with its relevance to Tessera. Start here for any feature gate.
   - `references/data-safety.md` — what the Data safety form must declare and how
     it must match the privacy policy and the real behaviour.
   - `references/app-bundle-and-signing.md` — AAB rules, versionCode, Play App
     Signing, upload vs app signing key, Digital Asset Links.
   - `references/listing-and-ratings.md` — store listing specs and the IARC
     content-rating questionnaire, with Tessera's expected answers.
2. Check the claim against the actual artefact, not against memory. The places
   that hold the truth:
   - What data leaves the device: `worker/src/routes/*.ts`, `worker/src/db/schema.sql`
     (every column is "collected"), `app/src/model/api.ts` and `sync.ts`.
   - What the user is told: the privacy policy in the `ProjectAsimov.github.io`
     repo (`privacy.html`), and the store copy in `store/LISTING.md`.
   - Accounts: sign-in and sign-out in `app/src/screens/Settings.tsx`, deletion
     paths (in-app and the web link) — both are required once sign-in exists.
   - User-generated content: anything another user can see — display names,
     group names, leaderboard rows, shoutouts. Each needs report + block/leave
     controls and a way for us to act on reports.
   - Money and currency: anything sold must go through Play Billing; earned-only
     currency does not. Check `docs/ARCHITECTURE.md` and the app for whether
     "tiles", freezes or repairs can be bought.
   - Android shell: `android/twa-manifest.json`, `android/app/src/main/AndroidManifest.xml`
     (permissions, target SDK), `android/assetlinks.json` and the live
     `https://projectasimov.github.io/.well-known/assetlinks.json` (must carry the
     **Play app signing key** fingerprint once Play App Signing is enrolled, not
     only the upload key).
   - Listing assets: `store/` (feature graphic 1024×500, screenshots 16:9/9:16
     within Play's size limits, 512×512 icon), title ≤ 30 chars, no policy-violating
     claims, privacy policy URL set in the console.
3. For each checklist item record **Pass**, **Fail** or **Needs action** with the
   evidence (file and line, URL, or console field) and the policy section it
   comes from. "Needs action" is for items that are compliant now but will stop
   being so with a planned change (e.g. rewarded ads).
4. Finish with the two or three things that most need doing, in order.

## Release checklist

Each item cites the reference file that explains it. Read the "Checklist
items" section at the end of each reference for the finer-grained checks.

- **Data safety matches reality** — every data type the worker stores
  (Google account id, name, email, task names, days, group membership, shoutouts)
  is declared as collected; sharing is "no" unless we send data to a third party
  beyond hosting; encryption in transit is true (HTTPS); the deletion-request
  claim is backed by a working path. `data-safety.md`
- **Privacy policy** — public URL, reachable, names Tessera, lists the same
  data types and retention/deletion as the form, and is linked in the console.
  `data-safety.md`, `content-policy.md` (User Data)
- **Account deletion** — in-app option (Settings) that deletes the account and
  server data, plus a web page/link for users who have uninstalled, and the link
  entered in the Data safety section. `content-policy.md` (User Data → Account deletion)
- **User-generated content** — report and block (or remove/leave) for every
  surface where another user's content appears; terms the user accepts; we can
  action reports (an email inbox is acceptable at this size, with a process).
  `content-policy.md` (UGC)
- **Payments and currency** — nothing purchasable outside Play Billing; earned
  currency clearly not sellable; any future subscription uses Play Billing and
  states price, renewal and cancellation clearly. `content-policy.md` (Payments, Subscriptions)
- **Ads** — none today; if rewarded ads are added: user-initiated only, no
  deceptive placement, ad SDK declared in Data safety, "contains ads" set in the
  console. `content-policy.md` (Ads)
- **Notifications** — only with the user's opt-in, cancellable, no spam;
  manager-to-client pushes must be expected by the client. `content-policy.md`
- **Permissions and target SDK** — the manifest requests nothing beyond what the
  TWA needs; target SDK meets Play's current minimum for new apps/updates.
  `content-policy.md` (Permissions, Target API), `app-bundle-and-signing.md`
- **App bundle and signing** — AAB, strictly increasing versionCode, signed with
  the upload key, Play App Signing accepted, asset links carry the app signing
  key fingerprint so the TWA opens without a browser bar. `app-bundle-and-signing.md`
- **Store listing** — title, short and full description within limits and free
  of prohibited claims; screenshots and feature graphic to spec; category,
  contact email, privacy URL set. `listing-and-ratings.md`
- **Content rating** — questionnaire answered truthfully: user interaction yes
  (names and reactions visible to group members), no messaging, no location or
  personal-info sharing, no mature content; re-rate when features change.
  `listing-and-ratings.md`
- **Families / audience** — target audience declared as 13+ or adults; no
  child-directed claims. `content-policy.md` (Families)

## Report format

```
# Play compliance — <feature or release> — <date>
Mode: feature gate | release gate
## Results
| Item | Status | Evidence | Policy |
## Must do before release
1. …
## Watch items (Needs action)
- …
```

Keep it short; the table is the deliverable. If a reference is stale (sources.md
says when it was fetched; policies change several times a year), say so and
re-fetch the policy page before relying on it for a hard decision.

## Keeping the skill current

When a policy page is re-fetched or Google announces a change (target SDK
deadlines move every August; Data safety categories change), update the
matching reference and the date in `references/sources.md`. When a checklist
item is resolved in the app, note where it lives so the next audit can verify
it quickly rather than rediscover it.
