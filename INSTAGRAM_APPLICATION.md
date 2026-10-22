# Instagram through Meta's API: setup and app review

Checked 2026-10-22 against Meta's developer documentation (sources at the
end). Until the steps below are done, Instagram works **by hand**: creators
are added to the watchlist as Instagram creators, their paid posts are added
by link, and the song check runs on the uploaded video or sound, exactly as
for TikTok.

## What the API gives, and what it doesn't

- **Business Discovery** returns the public posts of another Instagram
  **business or creator account**, looked up by username: id, caption, type
  (video, image, carousel; reels are videos), date, link, shortcode, user
  name and whether a video uses library music or its own sound. Personal
  accounts and age-restricted accounts return nothing.
- **No "Paid partnership" field.** Meta exposes no flag for Instagram's own
  partnership label on someone else's post. Bekvor therefore keeps video posts
  whose **caption** labels them as ads ("Werbung", "Anzeige", "#ad",
  "sponsored" and the like, `src/modules/connectors/instagram/disclosure.ts`).
  German creators have to write such a label anyway (§ 5a (4) UWG, `LEGAL_DE.md`).
  A paid post without one is missed by a scan; add it by hand.
- **No audio.** Since 30 Jul 2026 Meta leaves `media_url` out for videos with
  copyrighted or licensed music, and for reels whose owner turned downloads
  off: exactly the posts that matter. Bekvor downloads nothing; the song is
  found from the video or sound the customer uploads.
- **Rate limit:** 200 calls per hour per app user (Platform Rate Limits).
  One creator costs one call per 50 posts in the scan window; the connector
  stops after 8 pages (400 posts).

## How access works

1. **Instagram professional account for Bekvor** (business or creator) and a
   **Facebook Page** linked to it. Business Discovery is called *as* this
   account. (Todo list: "Instagram professional account, Facebook page".)
2. **Meta business portfolio** (business.facebook.com) for Bekvor, then
   **Business Verification** (company documents: only possible once the
   business is registered).
3. **Meta developer account** and an app: use case "Other", type
   **Business**; add the product **Instagram → API setup with Facebook login**.
4. Settings the app needs before review: privacy policy URL
   (`https://bekvor.com/privacy`), a data deletion URL or instructions,
   app icon, category.
5. **Permissions:** `instagram_basic`, `instagram_manage_insights`,
   `pages_read_engagement` (and `pages_show_list` to find the account id). If
   the Page role comes from the business portfolio, also `ads_read`.
6. **App Review, Advanced Access.** Bekvor serves several businesses, which
   Meta calls a **Tech Provider**: that needs Advanced Access, which needs
   App Review and Business Verification. Meta: "Instagram requires successful
   completion of the App Review process before your app can access live
   data." Advanced Access can only be requested after at least one successful
   API call (test it with Bekvor's own account first, Standard Access).
7. **Token.** Best: a **system user** in the business portfolio with the app
   assigned, which gives a token that doesn't expire. Otherwise a long-lived
   user token (about 60 days; renew before it runs out, or scans fail with
   "Renew META_ACCESS_TOKEN").
8. **Account id:** `GET https://graph.facebook.com/v26.0/me/accounts?fields=instagram_business_account`
   with that token; the `instagram_business_account.id` (a long number) is
   `META_IG_USER_ID`.
9. **Environment variables** (Vercel or `deploy/.env`, never in the chat or
   the repository): `META_ACCESS_TOKEN`, `META_IG_USER_ID`, and recommended
   `META_APP_SECRET` (every call is then signed with `appsecret_proof`).
   Optional `META_GRAPH_VERSION` (default `v26.0`, released 29 Jul 2026).
   Setting the first two switches the app to real mode for Instagram; TikTok
   creators are then skipped until TikTok's keys are set too.
10. Run one scan on a known creator account and compare with the posts in
    the app. The connector was written from the documentation and tested with
    stubbed answers; expect the first live call to need a small fix. A
    failure shows on the creator with the reason.

## Texts for App Review (English, honest, adjust to the fields)

**What the app does.** Bekvor helps music publishers and licensing agencies
check whether songs they manage are licensed for use in paid creator posts.
A customer adds the creators they work with; Bekvor looks up those creators'
public posts with Business Discovery and lists the videos the creator has
labelled as advertising, so the customer can check the music licence for that
specific post. Bekvor makes no legal judgement and never contacts creators; a
person reviews every result.

**How each permission is used.** `instagram_basic` and Business Discovery:
to read the public posts (caption, date, type, link) of the business and
creator accounts a customer has added, once per scan. `pages_read_engagement`
and `instagram_manage_insights`: required by Business Discovery itself.
Nothing is published, no messages are sent, no data about the app's users is
read.

**Data handling.** Only usernames a customer added are looked up. Each
customer's results are kept apart in its own workspace and shown only to its
team. No media files are downloaded. No data is sold, shared with third
parties, combined into profiles of people or used to train models. A creator
removed from a watchlist isn't looked up again; data is deleted when a
customer or Meta asks, and when the service ends.

**Screencast** (Meta asks for one): sign in, add an Instagram creator, run a
scan, open a found post and its link to Instagram, show the rights check.

## Open questions (lawyer, `LEGAL_DE.md`)

- Meta Platform Terms 3.a.iii (no tools for surveillance) and 3.a.v (no user
  profiles without consent): a watchlist of named creators must be argued as
  checking the licences of specific commercial posts.
- GDPR Art. 14 information to creators (who gives it: the customer as
  controller).
- Meta's terms for a paid B2B product built on Business Discovery.

## Sources

- Business Discovery: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/business-discovery
- Business Discovery reference (permissions): https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery
- IG Media fields: https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media
- Changelog (`media_url` change 30 Jul 2026): https://developers.facebook.com/documentation/instagram-platform/changelog
- App Review (Standard/Advanced Access, Tech Providers): https://developers.facebook.com/documentation/instagram-platform/app-review
- Create an Instagram app (business type, Business Verification, App Review): https://developers.facebook.com/documentation/instagram-platform/create-an-instagram-app
- Rate limiting: https://developers.secure.facebook.com/docs/graph-api/advanced/rate-limiting
- Graph API v26.0 (29 Jul 2026): https://developers.facebook.com/docs/graph-api/changelog/version26.0
- Meta Platform Terms (3 Feb 2026): https://developers.facebook.com/terms
