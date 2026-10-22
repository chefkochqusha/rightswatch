# Instagram (Meta): what is possible, and the way in

Checked 2026-10-17 and again 2026-10-22 against Meta's own developer pages
(sources at the end). Engineering notes, not legal advice; `LEGAL_DE.md` has
the rules.

## What works today, without Meta

Instagram creators go on the watchlist like TikTok creators, their paid posts
are added by link, and the song is checked from the video or sound the
customer uploads, exactly as for TikTok. The watchlist shows "Posts by link"
for them.

## What Meta's official API gives

- **Other accounts only if they are Business or Creator accounts.** The
  Business Discovery endpoint returns another professional account's public
  fields: bio text (`biography`), website link (`website`), follower and media
  counts, and its media (id, caption, type `IMAGE` / `VIDEO` / `CAROUSEL_ALBUM`,
  surface `FEED` / `REELS` / `STORY` / `AD`, date, permalink, shortcode, and
  whether a video uses library music or its own sound). Personal accounts and
  age-gated business accounts return nothing.
- **No "Paid partnership" field.** Meta exposes no flag for Instagram's own
  partnership label on someone else's post (IG Media reference, checked
  2026-10-22). The connector therefore keeps video posts whose **caption**
  labels them as ads ("Werbung", "Anzeige", "#ad", "sponsored" and the like,
  `src/modules/connectors/instagram/disclosure.ts`). German creators have to
  write such a label anyway (§ 5a (4) UWG, `LEGAL_DE.md`). For a creator the
  customer marked as promoting their own paid offers it keeps every video. A
  paid post without a label is missed; add it by link.
- **No sound.** Meta omits `media_url` for videos with copyrighted or licensed
  music (changelog 30 Jul 2026, also for reels whose owner turned downloads
  off). The video of exactly the posts Bekvor cares about is not delivered,
  and Bekvor downloads nothing.
- **No other accounts' stories.** The docs describe no way to read another
  account's stories.
- **Rate limit:** 200 calls per hour per app user (Platform Rate Limits). One
  creator costs one call per 50 posts in the scan window; the connector stops
  after 8 pages (400 posts).
- **Paid ads.** The Ad Library API covers all ads delivered in the EU, whatever
  their subject, with a developer account and identity confirmation. It shows
  ads, not organic posts.
- **Not for Bekvor.** The Meta Content Library and its API are only for
  non-profit academic or research institutions.

## What Meta forbids (Platform Terms § 3.a, updated 3 Feb 2026)

- Processing platform data "to perform, facilitate, or provide tools for
  surveillance".
- Processing platform data "without valid User consent in order to build or
  augment user profiles for any purpose".
- Selling or licensing platform data.
- As a **Tech Provider** (an app serving other businesses, § 5.b.ii): process
  only for that customer, keep each customer's data apart, keep a customer
  list, end a customer's access when Meta asks; report incidents (§ 6.b).

So Bekvor must not search Instagram for creators, must not label creators by
what their bio links to, and must not scrape profiles, stories or link pages.
What fits: the customer adds the creators they work with, sees the public
posts of those professional accounts that are labelled as ads, and decides
themselves. Whether even that passes Meta's review is for Meta and the lawyer
(`RELEASE_CHECKLIST.md`).

## Where the songs come from

The platforms already recognise music: rights holders upload references to
**Meta Rights Manager** and Instagram matches uploads automatically. What
rights holders miss is the step after a match: was the use commercial, which
licence applies, evidence before the post is gone, a case the team can work.
That is Bekvor's part. Ask customers whether they use Rights Manager and
whether they can export their matches; if they can, an import is the cleanest
way to get Instagram matches into Bekvor. Until then: the customer adds a post
by its Instagram link (or a scan finds it) and uploads its video or sound for
Bekvor's own recognition.

## What is built

- Creators on Instagram as well as TikTok, posts added by Instagram link
  (`src/modules/connectors/manual-post.ts`).
- "Promotes their own paid offers", a mark the customer sets per creator; that
  creator's posts count as commercial in the rights check.
- **The Business Discovery connector** (2026-10-22,
  `src/modules/connectors/instagram/business-discovery-connector.ts`), tested
  with stubbed answers, **off** until `META_ACCESS_TOKEN` and `META_IG_USER_ID`
  are set. Token in a header, never in a URL or an error; with
  `META_APP_SECRET` every call is signed (`appsecret_proof`). Posts are keyed
  by shortcode, so a post added by link and found by a scan is one post.
  Readable errors for an expired token, missing permissions, rate limits and
  accounts Instagram doesn't share (personal, age-restricted).
- Not built: the Ad Library connector, a Rights Manager import.

## Steps

1. Once the name is final: an **Instagram professional account** and a
   **Facebook Page** for Bekvor, linked to each other, and a **Meta developer
   account**. Business Discovery is called *as* this account.
2. After the business is registered: a **Meta business portfolio** with
   **Business Verification**.
3. A developer app: use case "Other", type **Business**; add the product
   **Instagram → API setup with Facebook login**. Fill in privacy policy URL
   (`https://bekvor.com/privacy`), data deletion instructions, icon, category.
4. Permissions: `instagram_basic`, `instagram_manage_insights`,
   `pages_read_engagement` (and `pages_show_list` to find the account id; plus
   `ads_read` or `ads_management` if the Page role comes through the business
   portfolio).
5. One successful test call with Bekvor's own account (Standard Access), then
   **App Review for Advanced Access**: Bekvor serves several businesses (a
   Tech Provider), and Meta says "Instagram requires successful completion of
   the App Review process before your app can access live data". Screencast
   and texts below.
6. Token: a **system user** in the business portfolio with the app assigned
   (doesn't expire); otherwise a long-lived user token (about 60 days, renew
   before it runs out or scans fail with "Renew META_ACCESS_TOKEN").
7. Account id: `GET https://graph.facebook.com/v26.0/me/accounts?fields=instagram_business_account`
   with that token; `instagram_business_account.id` is `META_IG_USER_ID`.
8. Set `META_ACCESS_TOKEN`, `META_IG_USER_ID`, `META_APP_SECRET` in Vercel or
   `deploy/.env` (never in the chat or the repository). Optional
   `META_GRAPH_VERSION`, default `v26.0` (released 29 Jul 2026). Instagram
   creators are then scanned; if TikTok's keys aren't set yet, TikTok creators
   switch to posts by link instead of demo data.
9. One live scan on a known creator account; compare with the app. The
   connector was written from the documentation, so expect the first live call
   to need a small fix. Then move Instagram to `BETA` in
   `src/modules/connectors/channels.ts` and update the landing page.

## Texts for App Review (English, honest, adjust to the fields)

**What the app does.** Bekvor helps music publishers and licensing agencies
check whether songs they manage are licensed for use in paid creator posts.
A customer adds the creators they work with; Bekvor looks up those creators'
public posts with Business Discovery and lists the videos the creator has
labelled as advertising, so the customer can check the music licence for that
specific post. Bekvor makes no legal judgement and never contacts creators; a
person reviews every result.

**How each permission is used.** `instagram_basic` and Business Discovery: to
read the public posts (caption, date, type, link) of the business and creator
accounts a customer has added, once per scan. `pages_read_engagement` and
`instagram_manage_insights`: required by Business Discovery itself. Nothing is
published, no messages are sent, no data about the app's users is read.

**Data handling.** Only usernames a customer added are looked up. Each
customer's results are kept apart in its own workspace and shown only to its
team. No media files are downloaded. No data is sold, shared with third
parties, combined into profiles of people or used to train models. A creator
removed from a watchlist isn't looked up again; data is deleted when a
customer or Meta asks, and when the service ends.

**Screencast:** sign in, add an Instagram creator, run a scan, open a found
post and its link to Instagram, show the rights check.

## Sources

- Business Discovery: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/business-discovery
- Business Discovery reference (permissions): https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery
- IG User public fields: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/
- IG Media (fields, `media_url` omitted): https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media
- Instagram Platform changelog (`media_url` change 30 Jul 2026): https://developers.facebook.com/documentation/instagram-platform/changelog
- App Review (Standard vs Advanced Access, Tech Providers): https://developers.facebook.com/documentation/instagram-platform/app-review
- Create an Instagram app (business type, Business Verification, App Review before live data): https://developers.facebook.com/documentation/instagram-platform/create-an-instagram-app
- Graph API rate limiting: https://developers.secure.facebook.com/docs/graph-api/advanced/rate-limiting
- Graph API v26.0 (29 Jul 2026): https://developers.facebook.com/docs/graph-api/changelog/version26.0
- Meta Platform Terms (3 Feb 2026): https://developers.facebook.com/terms
- Meta Content Library eligibility: https://developers.facebook.com/docs/content-library-and-api/support/faqs
- Ad Library API for EU ads (PPC Land, 11.10.2026): https://ppc.land/ads-library/
- Meta Rights Manager and Reels licensing (Foxi Music, updated 02.10.2026): https://www.foximusic.com/blog/instagram-reels-music-copyright-legal-guide/
