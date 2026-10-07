# Google Play Developer Program Policy - hub summary for Tessera

Source: https://play.google/developer-content-policy/ (hub) plus the sub-policy pages it links (see sources.md). Fetched 2026-10-07.
Text below is closely paraphrased from fetched content. Pages were read through a summarising fetch tool, so short quotes may not be verbatim; re-verify exact wording before relying on it in a dispute.
Tessera facts assumed: TWA wrapping a PWA; Google sign-in; cloud sync of tasks/days; groups with leaderboard (names + counts); shoutout reactions; earned-only "tiles" currency; no ads now (rewarded ads maybe later); possible coach subscription; push planned.

Relevance key: HIGH = must act before launch; MED = act when the feature ships or verify; LOW = unlikely to apply.

## Restricted Content
- **Child Endangerment** - bans content that sexualises or endangers minors. LOW: none present; still relevant to what users can type (see UGC).
- **Inappropriate Content** - bans sexual, violent, hateful, bullying content. MED: only via user-entered names/task names.
- **Age-Restricted Content and Functionality** - age-gating of mature content (page 16302250, not read in full). LOW.
- **Financial Services** - regulated finance products. LOW: tiles are not money.
- **Real-Money Gambling, Games, Contests** - LOW: tiles are earned-only, cannot be bought or cashed out. Keep it that way; random paid rewards would draw scrutiny.
- **Illegal Activities** - LOW.
- **User Generated Content** (page 9876937) - HIGH.
  - Definition: content users contribute to an app that is visible to or accessible by at least a subset of the app's users.
  - Apps with UGC need "robust, effective, and ongoing" moderation: users must accept terms of use before creating content, the app must define objectionable content in its policies, and moderation must fit the UGC type.
  - Protections by type: closed communities (schools, companies) need in-app functionality to report content and users; direct messaging needs the ability to block users; public UGC platforms need in-app report users/content AND block users.
  - Common violations: insufficient safeguards against threats/harassment/bullying; failing to address user complaints about objectionable content.
  - Tessera: group names, member display names and leaderboard entries are visible to other group members, so they count as UGC (visible to a subset of users). Reactions are UGC only if free text; preset emoji reactions are low risk but are still user-to-user interaction. Treat groups as at least closed communities: terms acceptance before joining/creating, objectionable-content definition in terms/privacy docs, in-app report for members/groups, and block/leave/remove-member controls, plus an operator process to act on reports. Private task names that never leave the user's account are not UGC unless shared into a group.
- **Health Content and Services** - LOW: avoid medical claims in the listing.
- **Blockchain-based Content** - LOW: never describe tiles as tokens/crypto/NFTs.
- **AI-Generated Content** - LOW now; MED if an AI coach is added (in-app reporting of AI output expected).

## Impersonation
Apps must not mislead by impersonating another person, company or app. LOW. Keep name/icon distinct from other brands; follow Google branding rules for the sign-in button.

## Intellectual Property (page 9888072)
Apps must not infringe copyright, trademark, patent, trade secret or other proprietary rights. Brand names/logos must not cause confusion about the source of a product; Google may ask for evidence of rights; get written documentation or a licence for third-party material, and contact Play in advance with documentation (advance notice, answer 6320428, lists "third-party intellectual property permissions" as an accepted scenario). MED: check "Tessera" for trademark conflicts and rights to fonts, icons, sounds, stock art, mascot, screenshots.

## Privacy, Deception and Device Abuse
- **User Data** (page 10144311) - HIGH.
  - A privacy policy link must be in the designated Play Console field and a link or text must be in the app. It must disclose how data is accessed, collected, used and shared, include developer contact info and the app/company name; URL must be globally accessible (not geofenced) and not a PDF.
  - In-app prominent disclosure and affirmative consent where required: shown during normal use (not buried in a menu), before the data access or permission request; consent must be an affirmative user action, not passive.
  - Handle personal and sensitive data securely, "including transmitting it using modern cryptography (for example, over HTTPS)".
  - The Data safety label: developer is responsible for accuracy and keeping it up to date; must be consistent with the privacy policy where relevant.
- **Account deletion** (page 13327111, also in User Data) - HIGH.
  - Apps that let users create an account must provide (1) an in-app path to delete the account and associated data and (2) a web link resource where users can request deletion of the account and associated data (deletion available "from within your app and outside of your app").
  - Deletion must remove the user data associated with the app account; freezing/deactivating is not enough.
  - Data may be retained for legitimate reasons (security, fraud prevention, regulatory compliance) provided this is clearly stated in the privacy policy.
  - Accounts created and operated offline are not app accounts and are out of scope.
  - Data safety has deletion questions that must be completed; incomplete or problematic answers lead to rejection. (Original deadline was 2023-12-07, extensions to 2024-05-31; now in force.)
  - Tessera: Google sign-in creates an app account, so both paths are mandatory and must cover tasks, days, group memberships, reactions, and server copies (D1), not just local storage.
- **Permissions** (page 12579724) - MED. Request only permissions/APIs needed for current features promoted in the listing; honor user denials without manipulation and offer alternative functionality; request dangerous permissions at runtime with clear explanation. Page also notes new location/contacts rules effective 2027-01-27 (not relevant). Tessera: a TWA needs essentially INTERNET only; POST_NOTIFICATIONS (Android 13+) only when push ships, requested in context rather than at first launch. Do not leave unused permissions in the manifest.
- **Device and Network Abuse** (page 9888379) - LOW/MED. No unauthorised access/interference with devices, networks, APIs, services, other apps. The app must not "modify, replace, or update itself using any method other than Google Play's update mechanism" nor "download executable code (such as dex, JAR, .so files) from a source other than Google Play". No bypassing power management unless eligible; no installing other apps without consent; no full-screen-intent misuse. Tessera: PWA web code served from its own origin is ordinary web content in a TWA; do not add native code loading. Keep sync polling modest.
- **Deceptive Behavior** (page 9888077) - HIGH. "Google Play strictly prohibits all forms of deception." Covers: false or misleading claims in description, title, icon, screenshots; changes to device settings without knowledge/consent; enabling dishonest behaviour; manipulated media; "hidden, dormant, or undocumented features" and techniques to evade app review. Tessera: do not advertise unshipped features (watch, widgets, coach, badges), do not imply tiles have cash value, no undisclosed behaviour differences.
- **Misrepresentation** (page 9888689, hub summary only) - HIGH. Description, screenshots and functionality must accurately reflect the app.
- **Target API Level** (page 11917020) - HIGH. New apps and updates must target an API level within one year of the latest major Android release or submission is blocked; existing apps not updated must target within two years to stay discoverable to new users on newer Android versions; extensions can be requested in Play Console; Google advises starting at least three months before deadlines. Check the current number in Play Console at each release; wrapper targetSdk is in android/app/build.gradle.

## Use of SDKs (page 13323374, hub summary only)
Developer is responsible for third-party code in SDKs complying with policy. MED: wrapper libraries (androidbrowserhelper) and any future ad/billing/analytics SDK; each one's data collection must appear in Data safety.

## Monetization and Ads
- **Payments** (page 9858738) - HIGH for tiles and any coach tier. Play's billing system is required for app downloads and in-app purchases including virtual currencies, subscriptions, app functionality and cloud services. Exempt: physical goods, physical services, bill payments, peer-to-peer payments, online auctions, tax-exempt donations, gambling-related content. "In-app virtual currencies must only be used within the app or game title for which they were purchased." Randomised rewards (loot boxes) must disclose odds before the purchase. Alternative billing / user choice billing only in eligible regions for enrolled developers. Tessera: tiles are earned-only and never sold; if they ever become purchasable Play Billing is mandatory. A coach subscription unlocking digital features must use Play Billing (Digital Goods API in a TWA), not web checkout, unless an alternative-billing programme applies. Selling coaching that is a human physical-world service may differ; get a policy read before relying on that.
- **Subscriptions** (page 9900533) - MED (future). Clearly and explicitly disclose offer terms, cost, billing frequency and automatic renewal terms; must provide sustained or recurring value (not one-time benefits); free trials/introductory offers must state duration, price and conversion; must provide an easy-to-use online cancellation method (link to Play Subscription Center or direct access in app/account settings); standard refund policy is no refund for the current period with access to period end, and any change must be communicated. Violations: undisclosed auto-renew, misleading price display (e.g. monthly equivalent instead of total), missing cancellation info, benefits that drop sharply after the intro period.
- **Ads** (page 9857753) - MED (future rewarded ads). The disruptive-ads rules do not apply to rewarded ads explicitly opted into by users. Otherwise: ads only inside the app serving them; no unexpected full-screen interstitials, none left over 15 seconds without a close option; ads must not simulate or impersonate UI such as notifications or warnings; no lock-screen monetisation; the advertising ID may be used only for advertising and user analytics and not linked to persistent identifiers without consent; ad location collection must be clear to users and documented in the privacy policy. Ads must not be significantly more mature than app content. When shipped: set the Ads declaration, add advertising ID / ads data to Data safety.
- **Families Self-Certified Ads SDK Program** (9900633) - LOW unless child-directed.

## Store Listing and Promotion
- **App Promotion** (9899004) - bans artificial promotion. MED: no incentivised installs/reviews.
- **Metadata** (page 9898842) - HIGH. Title 30 characters or fewer; no emojis, emoticons or repeated special characters in title, icon, developer name; no keyword stuffing; no ALL CAPS unless brand name; no unattributed or anonymous testimonials; no performance claims such as "App of the year", "#1", "Popular"; no price/promo language such as "10% off", "free for limited time"; no references to Google programs such as "Editor's choice"; no misleading symbols. See listing-and-ratings.md.
- **User Ratings, Reviews, and Installs** (9898684) - MED: do not give tiles or other rewards for ratings/reviews.
- **Content Ratings** (page 9898843) - HIGH. All apps need an IARC rating; complete the questionnaire accurately and keep it updated; misrepresentation may result in removal or suspension; resubmit when content/features change; apps without a rating are removed; ads must not be significantly more mature than the app. See listing-and-ratings.md.
- **News and Magazines** - LOW.

## Spam, Functionality, and User Experience
- **Spam** (page 9899034) - MED. No unsolicited messages; no sending SMS, email or other messages on behalf of the user without letting them confirm content and recipients; no repetitive or low-quality apps; no website-wrapper or affiliate-traffic apps made without the site owner's permission. Tessera wraps its own PWA with real functionality (offline, sync, groups), which is the permitted pattern; keep it more than a bare webview. Notifications: keep opt-in, relevant, non-repetitive; shoutout notifications must be mutable and only sent as a result of a user action.
- **Functionality, Content, and User Experience** (9898783, hub summary only) - MED: no crashes; minimum functionality; TWA must handle offline gracefully.

## Malware (page 9888380)
Malware is "any code that could put a user, a user's data, or a device at risk" (spyware, trojans, backdoors, billing fraud, ransomware). Requirements also apply to third-party code/SDKs. Spyware includes collecting or sharing user/device data unrelated to policy-compliant functionality. LOW.

## Mobile Unwanted Software
Ad fraud, unauthorised use/imitation of system functionality, social engineering, hostile downloaders. LOW; Ad Fraud becomes MED once rewarded ads exist.

## Families (page 9893335)
Target audience is declared in Play Console's Target audience and content section before publishing, for every app. Google notes imagery or terminology that could be considered targeting children may affect its assessment regardless of declaration. Child-directed or mixed-audience apps must use only Families-certified ad SDKs with non-personalised ads, avoid persistent identifiers (AAID/IMEI) from children, have accurate privacy policies, comply with COPPA and GDPR, and put non-approved APIs/SDKs behind a neutral age screen. Tessera: general-audience habit tracker with user interaction. Declare age groups honestly (choose adult/teen groups, not under 13, unless designed for children), avoid child-appealing styling in the mascot/listing, and note that a child age selection pulls in Families rules for groups, sign-in, sync and ads. The hub text does not establish a separate "general audience" opt-out; the declaration is required for all apps.

## Other Programs
Android Auto/Automotive, Emoji, Instant Apps, TV, Wear OS. LOW now; the watch/widgets idea would add Wear OS rules (MED future).

## Enforcement
Policy Coverage (9899816), Enforcement Process (9899234), Managing Policy Violations and Appeals (9899142), Play Console Requirements (10788890). Not read in detail. MED: keep the developer account verified and the contact email monitored; appeals go through Play Console.

## Checklist items
- [ ] Privacy policy URL is set in Play Console and linked/shown inside the app; public, not a PDF, names the developer/app, gives contact info.
- [ ] App provides an in-app account deletion path that deletes tasks, days, group memberships and reactions on the server.
- [ ] A public web page lets users request account and data deletion, and its URL is entered in Play Console (Data safety / App content).
- [ ] Data safety form matches the privacy policy and actual network behavior (see data-safety.md).
- [ ] Group names, display names and leaderboard are handled as UGC: terms acceptance, objectionable-content definition, in-app report for members/groups, block or remove/leave, and a process to act on reports.
- [ ] Reactions are preset-only, or any free text is moderated and reportable.
- [ ] Tiles cannot be bought with money or cashed out; no randomised paid rewards; no tiles for reviews/installs. If ever sold, Play Billing is used.
- [ ] Any coach subscription uses Play Billing and discloses price, renewal, trial terms and cancellation.
- [ ] Rewarded ads (future) are opt-in, labelled, never mimic system UI; Ads declaration and AAID data updated.
- [ ] Target audience and content declaration is honest and consistent with listing imagery.
- [ ] targetSdkVersion meets the current Play requirement at each release.
- [ ] Manifest requests no unneeded permissions; POST_NOTIFICATIONS requested in context when push ships; users can opt out of notifications.
- [ ] No executable code downloaded outside Play; no self-update mechanism.
- [ ] Listing text, screenshots, icon claim only shipped features; no rankings, promo pricing, or "Editor's choice" language.
- [ ] Name/logo/mascot/fonts/audio have clear rights.
- [ ] IARC questionnaire answered accurately and redone after adding ads, purchases or chat.
