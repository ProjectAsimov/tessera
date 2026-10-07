# Sources

All fetched 2026-10-07 with WebFetch (pages are converted to markdown and summarised by a small model, so quotes are close paraphrases, not guaranteed verbatim). Re-read the live page for exact wording before any dispute or appeal.

## The six requested URLs

| # | URL | Title actually returned | Status |
|---|-----|-------------------------|--------|
| 1 | https://play.google/developer-content-policy/ | Developer Policy Center ("Providing a safe and trusted experience for everyone") | Fetched. Hub only; details come from linked sub-policies below. |
| 2 | https://support.google.com/googleplay/android-developer/answer/6320428 | Provide advance notice to the Google Play App Review team - Play Console Help | Fetched but WRONG TOPIC for store listings. Only used for the advance-notice scenarios (third-party IP permission, etc.). Listing content came from replacement pages. |
| 3 | https://developer.android.com/guide/app-bundle | About Android App Bundles | Fetched, used. |
| 4 | https://play.google/play-app-signing-terms/ | Play App Signing Terms of Service (effective 1 Aug 2021) | Fetched, but summary was thin: no key reset or certificate-use text returned. Not invented. |
| 5 | https://support.google.com/googleplay/android-developer/answer/9842756?hl=en | Use Play App Signing - Play Console Help | Fetched but WRONG TOPIC for Data safety. Used for signing instead. |
| 6 | https://support.google.com/googleplay/android-developer/answer/113770?hl=en | Export compliance - Play Console Help | Fetched but WRONG TOPIC for content rating. Only fact: US export rules and encryption declarations apply; not used elsewhere. |

## Replacement and linked pages relied on (all support.google.com/googleplay/android-developer/answer/<id> unless noted)
- 10787469 - Provide information for Google Play's Data safety section (replaces #5 for data-safety.md)
- 9859655 - Content rating requirements for apps, games, and the ads served on both (replaces #6)
- 9866151 - Add preview assets to showcase your app (graphics specs; replaces #2)
- 9859152 - Create and set up your app (name/description limits)
- 9898842 - Metadata policy
- 9898843 - Content Ratings policy
- 9876937 - User Generated Content
- 10144311 - User Data
- 13327111 - Understanding Google Play's app account deletion requirements
- 9858738 - Payments
- 9900533 - Subscriptions
- 9857753 - Ads
- 9888077 - Deceptive Behavior
- 9893335 - Families policies
- 12579724 - Permissions and APIs that access sensitive information
- 9899034 - Spam
- 9888379 - Device and Network Abuse
- 9888380 - Malware
- 9888072 - Intellectual Property
- 11917020 - Target API level
- 9842756 - Use Play App Signing (key roles, recovery, fingerprint registration)
- 9859348 - Prepare and roll out a release (no technical upload specs found)
- https://developer.android.com/studio/publish/versioning - Version your app (versionCode rules)

## Hub-listed pages NOT fetched (only named, so only the hub's one-line description is relied on)
Child Endangerment 9878809, Inappropriate Content 9878810, Age-Restricted 16302250, Financial Services 9876821, Gambling 9877032, Illegal Activities 9878877, Health 9878878, Blockchain 13607354, AI-Generated Content 13985936, Impersonation 9888374, Misrepresentation 9888689, SDK Requirements 13323374, Families Ads SDK Program 9900633 / 12918983, App Promotion 9899004, Ratings/Reviews/Installs 9898684, News 9935326, Functionality 9898783, MUwS 9970222 and its sub-pages, Policy Coverage 9899816, Enforcement Process 9899234, Violations and Appeals 9899142, Play Console Requirements 10788890.

## Failed fetches
- https://developer.android.com/training/articles/assetlinks - HTTP 404. The Digital Asset Links paragraph in app-bundle-and-signing.md is therefore based on the Play App Signing help page plus general TWA practice, and is labelled as such.

## Open items worth a human check in Play Console
- Exact IARC question wording (not in fetched help text).
- The currently required target API level number.
- Whether the Play signing terms contain additional liability/termination terms beyond the thin summary.
- The hub mentions a "July 2026 update" PolicyBytes and a "Recent updates" page (answer 17134731); not read.
