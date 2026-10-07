# Data safety form - requirements and Tessera mapping

Source: "Provide information for Google Play's Data safety section" (Play Console Help answer 10787469), fetched 2026-10-07. NOTE: the URL you listed (answer 9842756) is actually "Use Play App Signing"; the correct Data safety page was used instead (see sources.md). Paraphrased from a summarising fetch; verify exact wording in Play Console.
Related: User Data policy (answer 10144311), account deletion (answer 13327111).

## Who must declare
- All developers must declare how they collect and handle user data for apps on closed, open or production tracks (testing tracks other than internal are included).
- Exempt: apps only on internal testing, system services, private apps.
- Even apps that collect no data must complete the form and give a privacy policy link.
- The developer alone is "responsible for making complete and accurate declarations". Google reviews policy compliance but cannot determine how a developer handles data.

## Definitions
- **Collect**: transmitting data off the user's device. Includes data sent by third-party libraries/SDKs, "irrespective of whether data is transmitted to you or a third-party server".
- **Share**: transferring user data to a third party (server-to-server or on-device to another app). Not counted as sharing: transfer to a service provider that processes data on your behalf, and certain user-initiated or legally required transfers (check Play Console help for exact exemptions).
- **Process ephemerally**: accessing and using data while it is only stored in memory and retained no longer than needed to service the specific request in real time. Ephemeral processing does not need to be declared as collection.
- Out of scope for collection: data processed only on-device; data that is end-to-end encrypted so you and intermediaries cannot read it.
- "Data collected" is therefore anything that leaves the device and is stored or logged beyond the real-time request. Tessera stores tasks/days in D1, so it is collected, not ephemeral.

## Data categories and types (and what Tessera declares)
Mark "collected" for items Tessera actually sends to its Cloudflare worker; "not collected" otherwise. Confirm against current code before each release.

- Personal info: Name (COLLECTED: Google account name and/or group display name), Email address (COLLECTED: from Google sign-in), User IDs (COLLECTED: account id / Google sub), Address, Phone number, Race and ethnicity, Political or religious beliefs, Sexual orientation, Other info - not collected.
- Financial info: User payment info, Purchase history, Credit score, Other - not collected today. Purchase history becomes collected if Play Billing subscriptions ship and entitlement is stored.
- Health and fitness: Health info, Fitness info - do NOT declare unless tasks are explicitly health/fitness data. Task names are free text and could be gym or health related; declaring "Other user-generated content" covers it, but reconsider if the app markets itself as fitness tracking.
- Messages: Emails, SMS or MMS, Other in-app messages - not collected (shoutouts: if free text, declare Other in-app messages; preset reactions fit App interactions).
- Photos and videos, Audio files, Files and docs, Calendar, Contacts - not collected.
- Location: Approximate, Precise - not collected.
- App activity: App interactions (COLLECTED if completion events, streaks, reactions, leaderboard counts are sent), In-app search history (no), Installed apps (no), Other user-generated content (COLLECTED: task names, group names), Other actions (declare if any other activity data is stored).
- Web browsing - not collected.
- App info and performance: Crash logs, Diagnostics, Other app performance data - collected only if added (analytics, Sentry etc.); Worker access logs on Cloudflare may count: check.
- Device or other IDs: not collected unless an ad SDK or push token is added. FCM/web-push subscription tokens are device identifiers: declare when push ships. Advertising ID is declared when ads ship.

For each collected type you must state:
- Whether it is collected, shared, or both (Tessera: collected; shared = YES for name/user id/task-adjacent counts displayed to other group members? Data shown to other users is a user-to-user feature, not a third-party transfer, so generally not "sharing"; the group-member visibility must be explained in the privacy policy).
- Whether collection is **required** or **optional** (optional = user can control it and still use the app; group participation and sync could be framed as optional if the app works offline-only without sign-in).
- Purposes (choose all that apply): App functionality, Analytics, Developer communications, Advertising or marketing, Fraud prevention/security/compliance, Personalization, Account management. Tessera: App functionality and Account management; add Developer communications only if you email users.

## Security practices section
- **Encryption in transit**: "Is data collected or shared by your app using encryption in transit...?" Tessera uses HTTPS to the worker; answer yes only if ALL data paths (including any SDK) use TLS.
- **Deletion request**: you may state that users can request deletion, either by a mechanism to request deletion or by automatic deletion/anonymisation within 90 days of collection. If you answer that users can request deletion you must provide the web link (account deletion policy: in-app path plus web resource).
- Optional badges: Families policy badge, Independent security review (OWASP MASVS), UPI payments badge. Not needed for Tessera.

## Consistency rules
- The form must be consistent with the privacy policy "where relevant" (User Data policy) and with the app's actual behavior, including SDKs and wrapper libraries.
- If found misrepresenting: Google requires a fix; apps that do not become compliant face enforcement such as blocked updates or removal.
- Update the form BEFORE shipping any release that adds new collection (push tokens, ads, analytics, subscriptions, new profile fields).
- The privacy policy must also be linked in the app (User Data policy) and describe retention, deletion, and what other group members can see.

## Tessera-specific traps
- Leaderboard shows member names and counts to other group members: disclose in the privacy policy; this is user-visible UGC, handle under the UGC policy.
- Server-side backup/sync copies mean "not collected" cannot be chosen for task names and days.
- Retention of data after deletion (e.g. backups, abuse logs) must be stated in the privacy policy if retained.
- Google sign-in tokens: the Google ID is a user ID; it is collected even if the app never shows it.

## Checklist items
- [ ] Data safety form is completed in Play Console and published for all non-internal tracks.
- [ ] Declared collected types include Name, Email address, User IDs, App interactions (if sent) and Other user-generated content (task names, group names).
- [ ] No type is marked not-collected if the worker stores it.
- [ ] Purposes declared: App functionality and Account management (plus any others actually used).
- [ ] Encryption in transit is answered yes only if every endpoint uses HTTPS.
- [ ] Deletion-request question answered consistently with the in-app deletion path and the public web deletion URL.
- [ ] Privacy policy URL is public, matches the form, and describes group visibility of names and counts.
- [ ] Form re-reviewed and updated before every release that adds SDKs, analytics, push tokens, ads or billing.
- [ ] Third-party SDK/library data (wrapper, push, ads) is included in the declaration.
