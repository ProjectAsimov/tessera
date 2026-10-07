# Store listing and content rating

Sources (fetched 2026-10-07): the listed URLs 6320428 and 113770 turned out to be unrelated pages ("Provide advance notice to the Google Play App Review team" and "Export compliance"). The correct pages were used instead: "Add preview assets to showcase your app" (answer 9866151), "Create and set up your app" (9859152), Metadata policy (9898842), "Content rating requirements for apps, games, and the ads served on both" (9859655) and Content Ratings policy (9898843). Paraphrased from a summarising fetch.

## Text fields
- App name: 30 characters maximum, one localised name per language (answer 9859152; Metadata policy says title must be 30 characters or less). Character limits apply equally to full-width and half-width characters.
- Short description: 80 characters, required.
- Full description: 4000 characters.
- Contact email address is mandatory; a support website is recommended.
- Metadata policy:
  - No emojis, emoticons or repeated special characters in title, icon or developer name; no misleading symbols (e.g. fake notification dots).
  - Description must be clear, well written, and accurately reflect functionality; avoid excessive length and improper formatting.
  - Forbidden: keyword stuffing/repetitive terms; ALL CAPS unless part of the brand name; unattributed or anonymous user testimonials; sexually suggestive imagery, profanity, graphic violence; performance claims like "App of the year", "#1", "Popular"; pricing/promo language such as "10% off" or "free for limited time"; references to Google programs such as "Editor's choice".
  - Keep content suitable for a general audience.
- Short description guidance (preview assets page): summarise core function in simple language; no rankings, testimonials, pricing language or calls to action; no emoji or repeated punctuation; avoid time-sensitive copy.

## Graphics
- App icon (required): 32-bit PNG with alpha, 512 x 512 px, max 1024 KB; must follow the Play icon design specification; no badges, ranking text, pricing or misleading content.
- Feature graphic (required): JPEG or 24-bit PNG (no alpha), 1024 x 500 px. Keep key elements centred (edges may be cropped); avoid duplicating the icon; no rankings, testimonials, awards or promo text; no time-sensitive content; no third-party trademarks without permission, device imagery or store badges. Alt text under 140 characters. repo file: store/feature-graphic.html.
- Screenshots (required): at least two across device types to publish. JPEG or 24-bit PNG (no alpha), each side between 320 px and 3840 px, longest side no more than twice the shortest. Phone and tablet: up to 8 per device type; recommended at least four at 1080 px for apps. Large screens: recommended minimum 4, 1080-7680 px, 16:9 or 9:16. Show the real in-app experience; tagline overlays only if necessary (at most 20% of the image); no rankings, awards, testimonials, pricing or calls to action ("install now"); clean status bars; localise text; no blurry or stretched images; alt text under 140 characters.
- Promo video (optional): one YouTube URL, monetisation off, public or unlisted, not age-restricted, embeddable.
- Licence: by publishing you license Google to use your icon, screenshots and videos for promotion (Developer Distribution Agreement section 6).
- Prohibited across assets: rankings, awards, user testimonials, pricing/promotions, calls to action, Play or competing store badges, device imagery, third-party trademarked characters/logos without permission, misleading metadata.

## Misleading claims and "Editors' choice"
- Deceptive Behavior policy prohibits false or misleading claims in description, title, icon and screenshots (see content-policy.md). Do not claim unshipped features (watch, widgets, coach, badges), cash value for tiles, health outcomes, or Google endorsement.
- The Metadata policy explicitly lists references to Google programs such as "Editor's choice" as not allowed in metadata; do not use "Editors' Choice", "Best of", "Featured" or award badges in text or graphics.
- Unattributed testimonials and "#1/Popular" claims are disallowed; do not compare to named competitors in a misleading way.
- Do not offer rewards (tiles) in exchange for ratings or reviews (User Ratings, Reviews and Installs policy).

## Content rating (IARC)
- Every app must have an IARC content rating. Apps without a rating are removed (Content Ratings policy). Rating authorities in the system include ESRB, PEGI, USK, ClassInd, the Australian Classification Board and GRAC (each uses its own methodology).
- Process: Play Console > App content > Content rating; enter an email for IARC correspondence; pick a category; answer all sections accurately; review the calculated ratings on the summary page; submit.
- Accuracy: "Your questionnaire responses determine the ratings assigned." Misrepresentation may result in removal or suspension, and updates and submissions can be rejected.
- Ads must not be significantly more mature than the app's primary content.
- Re-rate: submit a new questionnaire for any update that changes content or features in a way that affects the answers. Existing apps without a rating must complete it.
- Appeal: you can object to a rating from an IARC authority via the link in the rating certificate email.

### How to answer for Tessera (verify each question in Play Console; the fetched help page did not list the question text)
- Category: expect a utility / productivity type category, not a game; do not choose "social" or messaging unless features justify.
- Violence, sexuality, language, controlled substances, gambling: No. Tiles are earned-only with no purchase and no cash-out, so no simulated or real gambling.
- User interaction: the questionnaire asks whether users can interact or exchange content. Answer Yes: users see other group members' names and counts and can send shoutout reactions. If asked about UGC sharing between users, answer Yes where the display name/group name is visible to others; state that there is no free-form chat/messaging if that is true (answer No for direct messaging / private chat). Preset reactions are interaction, not messaging.
- Shares user location: No (no location collected).
- Digital purchases: No today; change to Yes when Play Billing subscriptions ship.
- Personal info shared with other users: Yes (display name visible to group members), if asked.
- Unmoderated UGC: answer honestly; if any free-text visible to others exists, say so and rely on reporting and blocking features.
- Consequence expectation: typical IARC outcome for this profile is a low age rating with "Users Interact" noted; understating interaction risks mismatch with Data safety and UGC policy and can trigger removal.

## Checklist items
- [ ] App name is 30 characters or fewer, no emoji, no all-caps (unless brand), no promo words.
- [ ] Short description is 80 characters or fewer, no pricing/rank/call-to-action language.
- [ ] Full description is 4000 characters or fewer, accurately lists only shipped features, no anonymous testimonials, no keyword stuffing.
- [ ] No use of "Editor's choice", "#1", "best", "Popular", "App of the year" anywhere in text or graphics.
- [ ] Icon is 512x512 32-bit PNG under 1024 KB; feature graphic is exactly 1024x500 without alpha; at least two screenshots (phone) with real UI, no device frames or CTA text.
- [ ] Contact email set; support website recommended.
- [ ] IARC questionnaire completed with Users Interact = Yes, direct messaging = No (if true), location sharing = No, digital purchases = No (until subscriptions), no gambling.
- [ ] Rating certificate email address is monitored.
- [ ] Questionnaire redone when ads, purchases, messaging, or other social features are added.
- [ ] Listing graphics and mascot use only assets Tessera has rights to; no third-party trademarks.
