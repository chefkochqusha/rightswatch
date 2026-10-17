# Instagram (Meta): what is possible, and the way in

Checked 2026-10-17 against Meta's own developer pages (sources at the end).
Engineering notes, not legal advice; `LEGAL_DE.md` has the rules.

## What Meta's official API gives

- **Other accounts only if they are Business or Creator accounts.** The
  Business Discovery endpoint returns another professional account's public
  fields: bio text (`biography`), website link (`website`), follower and media
  counts, and its media (caption, type `FEED` / `REELS` / `STORY` / `AD`,
  likes, comments, permalink). Personal accounts and age-gated business
  accounts return nothing.
- **No sound.** Meta omits `media_url` "if the media contains copyrighted
  material", and names the audio on Reels as an example. The video of exactly
  the posts Bekvor cares about is not delivered.
- **No other accounts' stories.** The docs describe no way to read another
  account's stories.
- **Login and permissions.** Business Discovery runs only through "Instagram
  API with Facebook Login": Bekvor needs its own Instagram professional account
  linked to a Facebook Page, a Meta developer app, and the permissions
  `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement`
  (plus `ads_read` or `ads_management` when the Page role comes through
  Business Manager). Expect Meta's app review and business verification, which
  need the registered business (check the current requirements when applying).
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

So Bekvor must not search Instagram for creators, must not label creators by
what their bio links to, and must not scrape profiles, stories or link pages.
What fits: the customer adds the creators they work with, sees the public
fields of those professional accounts, and decides themselves. Whether even
that passes Meta's review is for Meta and the lawyer (`RELEASE_CHECKLIST.md`).

## Where the songs come from

The platforms already recognise music: rights holders upload references to
**Meta Rights Manager** and Instagram matches uploads automatically. What
rights holders miss is the step after a match: was the use commercial, which
licence applies, evidence before the post is gone, a case the team can work.
That is Bekvor's part. Ask customers whether they use Rights Manager and
whether they can export their matches; if they can, an import is the cleanest
way to get Instagram matches into Bekvor. Until then: the customer adds a post
by its Instagram link and uploads its video or sound for Bekvor's own
recognition.

## What is built

- Creators on Instagram as well as TikTok, posts added by Instagram link
  (`src/modules/connectors/manual-post.ts`).
- "Promotes their own paid offers", a mark the customer sets per creator; that
  creator's posts count as commercial in the rights check.
- Not built: the Business Discovery connector (needs the Meta app and
  credentials), the Ad Library connector, a Rights Manager import.

## Steps

1. Once the name is final: an Instagram professional account and a Facebook
   Page for Bekvor, and a Meta developer account.
2. After the business is registered: business verification, then app review
   for the permissions above, with a screencast of the creator list and the
   privacy policy URL.
3. Then the connector, built against the documented fields, switched off
   until the credentials are set.

## Sources

- Business Discovery: https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery
- IG User public fields: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/
- IG Media (`media_url` omitted for copyrighted material): https://developers.facebook.com/docs/instagram-platform/reference/instagram-media
- Meta Platform Terms: https://developers.facebook.com/terms
- Meta Content Library eligibility: https://developers.facebook.com/docs/content-library-and-api/support/faqs
- Ad Library API for EU ads (PPC Land, 11.10.2026): https://ppc.land/ads-library/
- Meta Rights Manager and Reels licensing (Foxi Music, updated 02.10.2026): https://www.foximusic.com/blog/instagram-reels-music-copyright-legal-guide/
