# HANDOFF — א.נ. שילו · Shilo Pro v2

**Current state: round 6 shipped. Start at §12 for what just changed, then §2.**

**Written by the previous agent. Read this before touching anything.**
Run `git log --oneline` for the current head — the list in §9 stops at the commit
before this file was added.
Branch: `claude/shopify-store-modern-design-746p2i` · PR: [#1](https://github.com/ofir-commits/anshilo.com/pull/1) (open, not draft)

---

## 1. Read these first, in this order

| File | Why |
|---|---|
| `theme/DESIGN-SYSTEM.md` | The binding design contract. Every CSS rule must obey it. |
| `theme/SPEC.md` | Technical map of the theme: tokens, sections, snippets, JS. |
| `docs/STORE-HEALTH.md` | Catalogue data problems that cap how good the site can look. |
| `docs/INSTALL-THEME.md` / `docs/INSTALL-APP.md` | What the shop owner has been told to do. |
| **This file** | State, hard-won facts, and what is left. |

---

## 2. Hard facts about this environment — do not re-discover these

| Fact | Consequence |
|---|---|
| **`anshilo.com` is blocked by the agent proxy.** `curl` returns `CONNECT tunnel failed, 403`. Also tested and blocked: `3007b3-4.myshopify.com` and `cdn.shopify.com` (both return `000`). `storage.googleapis.com` and `fonts.gstatic.com` are open. | You **cannot** load the storefront, screenshot it, or verify HTML. Don't waste calls trying, and don't disable TLS or unset `HTTPS_PROXY`. Verify through the Admin API and the static checkers instead. `theme/tools/shoot.mjs` exists and works — it just needs a network that can reach the store. |
| **The org hit its monthly spend limit** during the build. | Subagents/Workflows may fail with `You've hit your org's monthly spend limit`. Assume you are working alone unless a call proves otherwise. |
| `fonts.googleapis.com` / `fonts.gstatic.com` **are** reachable. | Font subsets were downloaded from there. |
| `registry.npmjs.org` is reachable. | `npm install` works. |
| The Shopify MCP **blocks** writes to the live theme, `themeDelete`, and theme publishing. | Deploy only to unpublished themes. The owner publishes and deletes manually. |
| **Shopify's Predictive Search API (`/search/suggest`) does not support Hebrew.** It is language-gated and `he` is not on the list, so it returns no product suggestions for this store no matter what `resources[type]` asks for. | This is why the typeahead appeared broken for months. Products now come from the **Storefront Search API** via Section Rendering: `routes.search_url + '?q=…&type=product&options[prefix]=last&options[unavailable_products]=last&section_id=predictive-search'`. `options[prefix]=last` is what gives letter-by-letter partial matching. The old endpoint is still in `section-header.js` behind `predictiveApiSupported()`, which reads `#shopify-features` → `predictiveSearch`, so the faster API is picked up automatically if Shopify ever adds Hebrew. **Do not "simplify" that branch away.** |
| **Storefront search `type` accepts only `product`, `page`, `article`.** | Collection suggestions cannot come back from `/search`, so the Hebrew path has no collection group. Deliberate, not missing. |

### Store identifiers

| Thing | Value |
|---|---|
| Storefront domain | `anshilo.com` |
| **myshopify domain** | `3007b3-4.myshopify.com` (**not** `anshilo.myshopify.com` — verified via `shop.myshopifyDomain`) |
| Shop id | `58110246991` |
| Live theme (**never write to it**) | `שמירה 1` — `gid://shopify/OnlineStoreTheme/141469646927`, role MAIN |
| **Working preview theme** | `שילו 2026 — העיצוב החדש v7 ⭐` — `gid://shopify/OnlineStoreTheme/148377370703` |
| Preview URL | `https://anshilo.com/?preview_theme_id=148377370703` |
| Superseded, owner can delete | `148368425039` (v2), `148371210319` (v3), `148372193359` (v4), `148375371855` (v5) and `148376649807` (v6). Each zip import mints a new theme, so these accumulate — delete them from the admin. |
| Disposable theme, owner told to delete | `למחיקה — ייבוא כושל (בלי צבעים)` — `148368293967` |
| Owner's original copy, mostly untouched | `עותק של שמירה 1` — `148357644367` (12 asset files + one test txt were written to it early on; it is otherwise still an Empire copy) |
| New navigation menu | handle `shilo-2026-main`, `gid://shopify/Menu/236720193615` — 12 departments, 127 items, 3 levels |
| Old menu, **untouched** | `main-menu` |
| Catalogue size | 1,918 active products · 186 collections · ILS · Hebrew RTL |

---

## 3. How to deploy a theme change — the only procedure that works

The repo is the source of truth. `theme/` maps 1:1 onto the theme root
(`theme/assets/base.css` → `assets/base.css`).

### For one or two changed files — `themeFilesUpsert` with `TEXT`

```graphql
mutation Upsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
  themeFilesUpsert(themeId: $themeId, files: $files) {
    upsertedThemeFiles { filename size }
    userErrors { filename code message }
  }
}
```

```json
{ "themeId": "gid://shopify/OnlineStoreTheme/148375371855",
  "files": [{ "filename": "assets/section-header.css",
              "body": { "type": "TEXT", "value": "<the file, JSON-escaped>" } }] }
```

Get the escaped value with:
`python3 -c "import json;print(json.dumps(open('theme/assets/section-header.css',encoding='utf-8').read(),ensure_ascii=False))"`

**Always compare the returned `size` to the local byte count.** An empty
`upsertedThemeFiles` array with an empty `userErrors` array means the write
silently did nothing.

### For a full deploy — zip import

Free in tokens, but it **creates a new theme** (new id, new preview URL):

1. `cd theme && zip -qr /tmp/t.zip . -x "tools/*" "SPEC.md" "DESIGN-SYSTEM.md"`
2. `stagedUploadsCreate` with `resource: FILE`, `mimeType: application/zip`, the real `fileSize`
3. `curl -F` every returned parameter + `-F "file=@/tmp/t.zip"` to the returned `url` (expect HTTP 201)
4. `fileCreate` with `originalSource: <resourceUrl>`, `contentType: FILE`
5. Poll the `GenericFile` node until `fileStatus: READY`, take its `url`
6. `themeCreate(source: <cdn url>, name: "...")`
7. Poll until `processing: false`, **then verify the file list** — see the traps below

A reusable helper for step 3 is at `/tmp/up.sh` in the old session; it is trivial
to rewrite.

### What does NOT work

- `body: { type: "URL" }` for **text** files (`.css`/`.js`/`.liquid`/`.json`) — the
  mutation returns an empty `upsertedThemeFiles` **and an empty `userErrors`**, and
  nothing is written. It does work for binary assets (woff2, images).
- `themeFilesCopy` across themes — it only copies within one theme.
- `BASE64` bodies are valid but ~33% more tokens than `TEXT`; no advantage.

### Two silent zip-import traps — both were hit for real

1. **A setting with `"default": ""`** makes Shopify reject the whole of
   `config/settings_schema.json` and replace it with `[]`. The theme then renders
   with no colours, no fonts, no tokens. Nothing is reported.
2. **A literal `{` inside a `{{ }}` tag** (e.g. `'?q={search_term_string}'`) stops
   the Liquid lexer from finding the closing `}}` and the file is dropped entirely.
   Shopify's own `theme-check` does **not** catch this.

`python3 theme/tools/validate.py` now catches both. **Run it before every deploy.**

---

## 4. Verification — all three are currently green

```bash
python3 theme/tools/validate.py                      # 0 errors, 3 cosmetic warnings
cd mobile-app && npx tsc --noEmit                    # 0 errors
# Shopify's official checker:
cd <scratch> && npm i @shopify/theme-check-node      # 0 errors, 6 warnings
```

The 6 `theme-check` warnings are all `UnclosedHTMLElement` in
`sections/main-list-collections.liquid`, where the A–Z index opens a
`<section>`/`<ul>` in one loop iteration and closes it in the next. The runtime
output is balanced — **false positive, do not "fix" it** unless you refactor to a
two-pass grouping.

The 3 validator warnings are `#eef1f6` in the two layouts (it is the literal value
of the `--color-on-ink` token, so it belongs there) and `#ccc` in a print rule.

`validate.py` also runs a **WCAG 2.1 AA contrast audit** over the palette in
`settings_data.json` — 18 pairs, 4.5:1 for text and 3.0:1 for UI boundaries. It
found two real failures (the in-stock green at 4.41:1 on white, which shows on
every product card, and the input border at 1.50:1 against the 3.0:1 that 1.4.11
requires). Both are fixed and the guard now blocks a regression. If you change a
palette colour, run the validator — it will tell you if you broke AA.

---

## 5. Deployed theme vs repo — no known delta

**The repo and theme `148377370703` (v7) match.** The previous round's one gap —
`sections/main-addresses.liquid` with the country-select data-loss guard — went
out with the v6 zip import and its size was verified (21,335 bytes, exact).

v6 was created by a full zip import of the repo; the 25 files that round 5
changed or added (plus main-addresses and both config files) were verified by
comparing the `size` the Admin API reports to the local byte count — 25/25
exact, `config/settings_schema.json` at 10,548 bytes (the empty-default trap
did not fire), `config/settings_data.json` byte-identical at 2,355.

Two things worth knowing when you next deploy:

- **A zip import preserves `config/settings_data.json` byte-for-byte** (2,356 bytes
  here). `themeFilesUpsert` does not: it strips blank lines and prepends its own
  auto-generated header comment, so the same file comes back as 1,989 bytes. If you
  upsert that file, compare values, not bytes.
- **A zip import creates a NEW theme**, so the preview URL changes. That is the
  trade: it deploys everything for almost no token cost, while `themeFilesUpsert`
  keeps the URL but costs tokens proportional to the size of every file you send.
  For a sweep touching 30+ files the zip is the only sane route; for one or two
  files, upsert.

## 6. THE APP — connecting it to the store

This is the part with a live blocker. Read it fully.

### Current state

| | |
|---|---|
| Builds? | **Yes.** `npx tsc --noEmit` → 0 errors. It did not compile before this branch. |
| Design | On the v2 token set — same red, same ink, same cards as the site. `src/theme.ts` is the mirror of the web tokens. |
| Data | Pulls products, collections, inventory and prices live from the Storefront API. No hardcoded catalogue. |
| Checkout | Hands off to Shopify's own checkout, so every payment method configured in the store works. |
| Store details | Real values in `src/config.ts`: phone `02-534-3422`, `info@anshilo.com`, `https://wa.link/sp55tw`, `קיבוץ קרית ענבים`, opening hours. |
| Domain | `3007b3-4.myshopify.com` — correct and verified. |
| Icon / splash colours | Moved to the v2 palette (`#0F1729` ink, `#D81E29` accent). |
| `eas.json` | Present, with `development` / `preview` / `production` profiles. |
| `app.json` | Build-ready: `com.anshilo.shop` on both platforms, RTL forced, splash configured. |

### 🚩 THE ONE BLOCKER

`mobile-app/src/config.ts` line 19:

```ts
storefrontAccessToken: 'PASTE_YOUR_STOREFRONT_TOKEN_HERE',
```

**Until a real token is pasted there the app shows empty screens.** The token can
only be created in the Shopify admin by the owner — an agent cannot mint it,
because the Storefront API access scopes are granted to a custom app, not through
the Admin API this session holds.

Exact steps are in `docs/INSTALL-APP.md` §1. Summary: Settings → Apps and sales
channels → Develop apps → create app → Configuration → Storefront API → tick
`unauthenticated_read_product_listings`, `_product_inventory`, `_product_tags`,
`_write_checkouts`, `_read_checkouts`, `_read_selling_plans` → Save → API
credentials → Install app → copy the **Storefront API access token**.

That token is public by design (client-side, cannot read orders or customers), so
it is safe to commit — but **ask the owner before committing it**, and never
confuse it with the Admin API token, which is secret.

### Once the token is in

```bash
cd mobile-app && npm install && npx expo start
```

Scan the QR with **Expo Go**. Then verify, in this order:

1. Home screen fills with real collections and products
2. A collection page paginates on scroll
3. A product with variants (e.g. a Blundstone boot) lets you pick a size
4. Add to cart → the cart persists after closing the app
5. Checkout opens Shopify's checkout with the right total

### To reach the App Store and Google Play

```bash
npm install -g eas-cli
eas login
eas build --platform ios --profile production
eas build --platform android --profile production
eas submit --platform ios --profile production
eas submit --platform android --profile production
```

Still needed from the owner, and **not** obtainable by an agent:

- Apple Developer Program — 99 USD/year
- Google Play Developer — 25 USD one-off
- An Expo account for EAS
- A 1024×1024 icon with no transparency (a generated placeholder exists;
  `npm run generate-assets` rebuilds it from the v2 palette)
- Store screenshots
- A public privacy-policy URL — the store's `/policies/privacy-policy` works

### Keeping the app and the site in sync

`src/theme.ts` is a **hand-maintained mirror** of the web tokens in
`theme/layout/theme.liquid`. There is no build step tying them together. If you
change a colour, radius or shadow on the web side, change it in `src/theme.ts` too,
or the two products drift apart — which is exactly what the owner asked to avoid.

`src/theme.ts` also carries documented **aliases** (`radius.md`, `colors.bg`,
`colors.sale`, `shadows.card`, `shadows.raised`) because ~10 screens still use the
older names. Removing the aliases means updating every consumer; leaving them is
fine, but don't add new ones.

---

## 7. What is actually left to do

Ordered by value.

### 1. A human/browser visual pass — highest value, blocked for agents

Nobody has looked at this design in a browser except the owner, once, on a phone.
That single look found a real bug (an oversized header logo, fixed in `d1dc050`).
Get screenshots — home scrolled, a collection page, a product page, the cart, the
menu drawer — and fix what they show. **Batch the fixes**: each CSS file costs a
full-file upsert, so collecting several findings before deploying is much cheaper.

If you have storefront access: `node theme/tools/shoot.mjs 148375371855 /tmp/shots`
does it automatically and audits each page for horizontal overflow, broken images,
Liquid errors, leftover Empire assets and undersized tap targets.

### 2. Get the Storefront token into the app

See §6. Nothing about the app can be validated end-to-end until this is done.

### 3. A horizontal logo — DONE, but confirm it by eye

The theme now uses the shop's own horizontal lockup,
`shopify://shop_images/final-logo-for-the-website.png` (500×100, 5:1, 8.6KB PNG),
at `logo_width: 260`. It was already the logo the **live** Empire theme renders
(`sections/header-group.json` → `static-header.logo`, `logo_width: 230`), so this
is the shop's real artwork, not a substitute. v2 had been pointed at the 512×512
square variant `logo-logo-logo-logo-logo.png`, which is why it swallowed the phone
header.

**`cdn.shopify.com` is blocked from this environment, so no agent has ever seen
these pixels.** The identification rests on the live theme's own configuration plus
the filename and ratio. It is solid, but a human should still glance at the header.

A 500px-wide source is slightly under 2× for the 260px desktop render (1.92×). If
the owner can produce a 1000×200 export it will be marginally crisper; nothing is
wrong as-is.

Sizing is deliberately height-first — see the long comment above
`.site-header__logo-img` in `assets/section-header.css`. Both axes are bounded and
both sizes are `auto`, so the CSS replaced-element constraint table scales the mark
to satisfy the tighter bound and preserves the ratio without Liquid passing one in.
Caps: 46px tall on mobile (58vw guard), 60px desktop, 42px when the header is stuck.
Swapping a square logo back in is safe — the height cap governs and it renders 46px.

A second setting was added because a 5:1 image is the wrong shape for two other
places a logo gets used:

- `logo_square` (מיתוג group) feeds the Organization `logo` in
  `snippets/structured-data.liquid` — Google wants ≥112px on **both** axes, which
  500×100 fails on height — and the `og:image`/`twitter:image` fallback in
  `layout/theme.liquid`. It defaults to the 512×512 file. Before this, ordinary
  pages had **no** `og:image` at all, so links shared to WhatsApp rendered as a bare
  grey card; that is now fixed. If it is ever cleared, both paths fall back to the
  main logo.

### 4. Data fixes in the store — see `docs/STORE-HEALTH.md`

The theme handles all of these gracefully, but fixing the data is better:
150 products priced ₪0 · 151 sold out · ~15 published collections with no products
· one product with an inventory of 48,229,732 (a model number typed into the
quantity field) · duplicate accessibility pages · a page titled "404".

**Do not "fix" the empty collections by unpublishing them.** It looks like an easy
win and it is a regression: four of them (נורות, תאורת חוץ OUTDOOR, תאורת פנים
INDOOR, תאורה לאווירה נפיצה) are linked from `link-list-2`, which the **live**
theme renders. Unpublishing them turns working links on the real site into 404s.
The fix is either to add products or to remove the menu entries — both are the
owner's decision about their catalogue, not a code change.

Accessibility is **done** for the palette: the audit is now part of
`validate.py` and both failures are fixed and deployed.

### 5. Code review — two adversarial passes HAVE now run

Round 4 was investigated, implemented and then reviewed by two independent agents
(correctness/a11y and performance/visual). Both returned `FIX_FIRST`; all six
blocking defects were fixed before deploying. What they found is worth reading as a
list of the mistakes this codebase invites — see §10.

Earlier rounds still have no independent review: the twelve verify agents planned for
the original build all died on the org spend limit.

### 6. Publishing the theme

The owner's call, one click: Online Store → Themes → ⋯ → Publish. Reversible the
same way. **Warn them first:** app embeds do not carry over between themes. The
accessibility app (`sense-rtl`) is pre-wired in `config/settings_data.json` under
`current.blocks`; any other app they rely on (product labels, reviews, newsletter)
must be re-enabled on the new theme after publishing.

---

## 8. Things that will bite you if you don't know them

- **Hebrew fonts are bundled in the theme on purpose.** Shopify's font library only
  ships Latin glyph ranges, so every font in it renders Hebrew as a system
  fallback. `assets/{assistant,heebo}-var-{hebrew,latin,latin-ext}.woff2` are SIL
  OFL variable subsets declared with `unicode-range` in `layout/theme.liquid`.
  **Never** flip the `use_shopify_fonts` setting on — it breaks all Hebrew.
- **Liquid has no `push` filter.** Build lists with `capture` + `split`. This bug
  shipped once already, in `structured-data.liquid`.
- **`{% render 'missing-snippet' %}` prints a visible Liquid error** on every page.
  If you delete a snippet, remove its render calls in the same change.
- **RTL is done with logical properties only** (`margin-inline-start`,
  `inset-inline-end`, …). One physical `left`/`right` and the layout breaks in
  Hebrew. Directional icons use `.icon--dir`.
- **`section.settings.X` must be declared in that section's `{% schema %}`** or it
  is silently `nil`. The validator checks this.
- Menu item URLs must be **percent-encoded** — `menuCreate` rejects raw Hebrew in
  an `HTTP` url. Use `type: COLLECTION` with a `resourceId` instead and let Shopify
  build the URL; it also gives you working active states.
- `templates/search.quick-order.liquid` is an **alternate search view** that returns
  JSON (`{% layout none %}`). It exists because Shopify's predictive-search endpoint
  does not expose variant SKUs. `quick-order.js` depends on it — don't rename it.
- `sections/product-card-render.liquid` is a **headless helper** fetched by
  `recently-viewed.js` via `?section_id=`. It has no preset on purpose. Don't delete it.

---

## 9. Commit history of this branch

Newest first, ending one commit before this file was written.

```
67d443c  Rewrite the docs for v2 and catch the empty-default trap
9955e6b  Make the mobile app compile and point it at the real store
d1dc050  Cap the header logo on both axes
5b44d32  Fix two files Shopify's theme importer silently rejected
163218e  Point the theme at the new structured navigation
83ba4ac  Self-host the Hebrew fonts instead of loading them from Google
09334bd  Add a catalogue health report for the store owner
7fe7cf2  Rebuild header, mega menu and footer on the v2 design
7f7b8ea  Add theme validator, visual review harness, and demand-capture snippet
ed4cf15  Rebuild theme design system as v2 "Clarity" and wire real store data
```

---

## 10. Round 4 — what changed, and what is knowingly left

Round 4 fixed six reported problems. Each was investigated before being touched, then
implemented, then reviewed by two independent adversarial agents. Read §2 first: one of
the findings is a platform fact that changes how search must be built.

### What changed

| Area | Root cause | Where the fix lives |
|---|---|---|
| Typeahead showed no products | `/search/suggest` is language-gated; Hebrew unsupported. Also `MIN_CHARS` was 2 and the sub-minimum branch called `closePanel()`, so the first letter *closed* the panel | `assets/section-header.js`, `sections/predictive-search.liquid` (new `search.performed` branch) |
| Header stuttered in the first ~40px | `.is-stuck` fired at `scrollY > 40`, one px after the ~39px announcement bar cleared, and animated `block-size`/`padding-block`/`max-block-size` while a `ResizeObserver` rewrote the in-flow reserve spacer per frame → document height jitter → Chrome scroll anchoring fought the fling | `assets/section-header.css` (constant-height wrapper, absolute header), `assets/section-header.js` (`publishHeaderHeight`), `assets/global.js` (rAF-coalesced, hysteretic 48/32) |
| Hero was not impressive | — | `sections/image-banner.liquid`, `assets/section-image-banner.css` |
| English on the storefront | The theme's own copy was already 100% Hebrew. The English was Shopify-supplied strings rendered raw | 68 new keys in both locales + 12 Liquid files, all keyed off the stable handle with Shopify's value as fallback |
| Makita image was a dead click | `feature_link` was only ever consumed by the button | `sections/image-with-text.liquid` — the frame is an `<a>` now |
| Department backgrounds | Images were never produced as a set; the previous "uniform well" never rendered because `base.css` abs-positions `.media > img` at `inset: 0`, so padding on `.media` cannot inset it | `sections/category-rail.liquid`, `assets/section-category-rail.css` — "one well, one window" |

### The six blocking defects the reviewers caught

All fixed before deploy. Listed because each is a trap this codebase invites again:

1. `showPopular()` did not invalidate the sequence token, so a stale typeahead response
   could reopen the panel over a cleared input. Any early-return path out of a fetch
   flow must bump `seq` — `closePanel()` already did.
2. `formatMoney` matched only `{{amount}}` and `{{amount_no_decimals}}`, returning the
   raw format string for the three separator variants Shopify also ships. Fixed in
   **both** `global.js` and `quick-order.js` by matching the placeholder with a regex.
3. `aria-hidden` on the payment-icon `<li>` left `role="list"` with zero `listitem`
   children. It belongs on an inner `<span>`.
4. An `infinite` `transform` animation on SVG `<path>` children — Blink builds no
   transform property node for those, so it never reached the compositor and
   re-rastered a masked layer forever, above the fold. Now gated to
   `(hover: hover) and (min-width: 990px)`.
5. The mote column sat behind the headline below 990px at **1.44:1** contrast. Hidden
   under `max-width: 989px`; thinning the count does not help, the survivors are still
   in the text column.
6. The desktop sticky-wrapper fallback assumed a one-line nav row, but the twelve
   departments are documented to wrap. Every section below sat 47px too high until JS
   corrected it. `--header-row-nav` is now the two-line figure (99px).

### Knowingly left — real, with file:line

None of these is blocking; all are recorded so the next agent does not have to
rediscover them.

- **`assets/section-header.js`** — `compositionend` calls `onQueryChange` undebounced
  while the debounced `input` handler is still armed, so every Hebrew IME commit on
  Android costs two requests (the second aborts and re-issues the first). Share the
  debounce or add a short suppression flag.
- **`sections/image-banner.liquid`** — the video start is bound to
  `window.addEventListener('load', …, { once: true })`. In the **theme editor** the
  section re-renders after `load` has already fired, so a merchant who uploads a video
  never sees it play. Needs a `document.readyState === 'complete'` short-circuit. Does
  not affect real visitors.
- **`assets/global.js`** — the Ajax cart error path now always shows one generic Hebrew
  sentence. That was the point (Shopify's English used to win), but it loses the
  specific reason for 422s that are not the quantity cap (sold-out variant,
  unpublished product). Worth mapping the common `status`/`description` cases to
  Hebrew rather than collapsing them.
- **`assets/section-header.css`** — `.site-header.is-stuck .site-header__nav` keeps
  `block-size: 0; overflow: hidden` with focusable links inside. `pointer-events: none`
  fixed the mouse; the links are still in the tab order. Wants `visibility: hidden` or
  `inert`. Pre-existing.
- **`assets/section-header.js`** — `initNav`'s guard lives on markup Shopify replaces
  wholesale on `shopify:section:load`, so each theme-editor header re-render adds
  another `window` scroll listener. Pre-existing shape.
- **`assets/facets.js`** — still does a forced `getBoundingClientRect()` read inside
  rAF per scroll frame and writes `--collection-sticky-offset` on
  `document.documentElement` (whole-document style invalidation). Much cheaper now that
  the header height changes once per state flip, but it should just consume the
  `--sticky-header-height` that `section-header.js` publishes on `:root`, and drop both
  listeners.
- **`theme/tools/validate.py`** — balances `{% comment %}` blocks but is blind to
  `comment`/`endcomment` used in `{% liquid %}` mode, which round 4 introduced in five
  files. Nothing verifies those are closed. Also `inline_asset_content` was added to
  `KNOWN_FILTERS` ahead of first use, for the Makita vector.
- **`assets/section-category-rail.css`** — `object-fit: contain` on `.placeholder-svg`
  is a no-op (an inline `<svg>` is not a replaced element). Harmless.
- **Makita sharpness** — still not resolvable in code. Every external host is blocked
  at the proxy (403 on CONNECT for wikimedia, wikipedia, makita.co.il, cdn.shopify.com),
  so no vector can be fetched here and **none was invented**. The block now leads with a
  real 1500×1500 product master and demotes the 500px wordmark to a ~120px badge, where
  4× finally exceeds what any screen asks for. The real fix is an official vector from
  the importer: drop it in as `assets/makita-wordmark.svg` and inline it with
  `inline_asset_content`. One trap when that happens — `base.css` styles `.media > svg`
  as an absolute `cover` fill, so logo mode needs its own `> svg` rule or the vector
  gets stretched to the frame.
- **Nobody has seen any of this in a browser.** `anshilo.com` and `cdn.shopify.com` are
  both blocked from this environment. Every claim above was verified through the Admin
  API, `validate.py`, `node --check` and static reading — never with eyes. §7.1 still
  stands and is still the highest-value remaining task.

---

## 11. Round 5 — what changed, and what is knowingly left

Six reported problems fixed + both paid apps replaced with in-theme code.
Deployed as theme **v6 `148376649807`** (zip import — the volume was ~24 files /
390KB, far past the §3 threshold where per-file upserts stop making sense).
`validate.py`: 0 errors, 4 warnings (the 3 known ones + a new deliberate one:
`#0000ee` in `accessibility.css` is the universal link-blue of the forced
high-contrast mode — a theme token there would defeat the override).

### What changed

| Area | Root cause / decision | Where |
|---|---|---|
| White block over the footer about-text | `filter: brightness(0) invert(1)` turns every opaque pixel white; the shop logo is a non-transparent 500×100 PNG | `section-footer.css` (white plate, no filter), `footer.liquid` (new `logo_treatment` select, default "plate") |
| Google Business link | `settings.store_google` now renders as a social icon | new `google` icon in `icon.liquid` (69 icons now), `footer.liquid` + `main-contact.liquid` social rows (both `has_social` gates updated), menu-drawer action button in `header.liquid`, `general.social.google` in both locales |
| "המחלקות שלנו" square-in-square | Owner wants one flat amber field | new global token `--color-tile-bg` (setting `color_tile_bg`, default `#FFB224`), flat plate + selective `mix-blend-mode: multiply` via per-block `photo_blend` checkbox — ON for the 3 photo tiles (r2/r6/r8) in `templates/index.json`. Full reasoning in `docs/STORE-HEALTH.md` |
| Header nav thumbs uneven | 14 menu collections have no image (list in STORE-HEALTH); first-product fallback rejected — real duplicate pairs verified via Admin API | `header.liquid`: thumbs are all-or-nothing per sibling group; `.nav-thumb` now sits on `--color-tile-bg`, **no blend** (would discolour brand wordmarks) |
| Product image vanishes on hover | `base.css` faded `__img--primary` unconditionally; secondary img only exists when `media.size > 1` | `base.css` — fade scoped to `.product-card__media--has-secondary`; single-image cards now get the scale(1.04) zoom that was already written |
| Collection filters collapse | `facets.js#initStickyOffset` measured the EXPANDED header (~225px) at scroll-top and its value overrode the correct one; `max-block-size` went ≈0 | `initStickyOffset` deleted (function + both calls + scroll/RO listeners); `section-collection.css` consumes `--sticky-header-height` directly + `max(18rem, …)` floor. Mobile facets drawer verified independent (plain fixed drawer) |
| **Sense RTL app ($7.75/mo)** | Its RTL/font/translation jobs are moot on an RTL-native theme; its accessibility widget needed replacing | new in-theme widget: `snippets/accessibility-widget.liquid`, `assets/accessibility.{css,js}`, `accessibility` icon, settings group "נגישות" (`a11y_enabled` default ON, `a11y_statement_link`), 14 locale keys `accessibility_widget.*`, rendered from `theme.liquid`. Font-size steps 100/110/125%, contrast, grayscale, invert, link highlight, readable font, stop motion, big cursor; persists in `localStorage['shilo.a11y.v1']`. The app's embed in `settings_data.json` is now `"disabled": true` (kept so the owner can re-enable) |
| **TA/BSS Labels app ($5/mo)** | Config lives on the app's servers (embed `bss-pl-config-data` has empty settings; `appInstallations`/`scriptTags` scopes denied) — **could not be read**; owner must copy their label list out of the app before uninstalling | tag-driven labels: any product tag starting `תווית:` renders as an amber badge — `snippets/product-labels.liquid`, wired into `product-card.liquid` (max 2) and `main-product.liquid` (max 4, under the title), setting `enable_tag_labels` default ON. Owner-facing migration + safe-cancellation guide (incl. the "don't uninstall Sense RTL before publishing — the LIVE theme depends on it for RTL" warning): `docs/INSTALL-THEME.md` §7 |

### Knowingly left / needs eyes

- **Nobody has seen any of this rendered.** Same §2 blocks apply. The rail's
  multiply ON/OFF split follows documented file metadata (8 designed tiles vs 3
  photos); if a tile was misclassified the fix is one checkbox in the theme
  editor (רצועת מחלקות → the block → "צילום מוצר על רקע לבן").
- The 14 imageless menu collections (STORE-HEALTH list) keep four menu panels
  text-only until the owner uploads images — by design, not a bug.
- The a11y high-contrast mode uses blanket `!important` overrides; product
  imagery is exempted. Extreme edge cases (inline-styled third-party embeds)
  may resist it.
- The BSS label inventory could not be exported from here. Until the owner
  copies their rules into `תווית:` tags, the new theme shows only the automatic
  badges (sale % / new / sold-out) — the BSS embed itself stays functional on
  the new theme while the app is installed.
- `whatsapp-button` + `essential-announcer` app embeds also duplicate built-in
  theme features; flagged to the owner in INSTALL-THEME §7, their call.

---

## 12. Round 6 — the owner LOOKED at v6. What their eyes found, and what changed

First human review of the new design. Four corrections, shipped as theme
**v7 `148377370703`** (zip import; 16 changed files size-verified 16/16, schema
at 11,827 bytes — no trap). The owner also supplied the two importer-seal
images in chat (agents cannot extract chat attachments — the owner must upload
them once in the theme editor; wired below).

| Owner's finding | Root cause / decision | Fix |
|---|---|---|
| The amber tile field — "not what I meant, I want the background most departments had" | Round 5 read the brief as "uniform coloured field"; the owner wanted the white field most department images already carry | `color_tile_bg` default → `#FFFFFF` (setting kept, tintable); CSS fallbacks now `var(--color-surface)`; nav-thumb regains its hairline border for definition on white-on-white |
| Menu entries without images should show a relevant image per category | Round 5's all-or-nothing group gating hid thumbs the owner wanted | `nav-thumb.liquid` falls back to a product photo from the collection, picked at the row's index offset (mod product count) — deterministic and avoids the verified VILEDA duplicate between ניקוי כללי/ניקוי רצפות in one panel. Group gating removed; `position: forloop.index0` passed at both call sites |
| **Filters panel still hidden** ("מסתתר") | **REAL BUG, RTL-only:** base.css closes drawers with `[dir="rtl"] .drawer--end { transform: translateX(-100%) }` (0,2,0). The desktop sidebar neutralisation `.facets-drawer { transform: none }` was (0,1,0) and LOST — the sidebar rendered shifted one full width left, painted over by the product grid; only slivers showed through grid gaps (matches the owner's screenshot exactly). Worked in LTR reasoning, broke in RTL reality | Neutralisation selectors bumped to `[dir] .collection-layout__sidebar .facets-drawer` (0,3,0), with a SPECIFICITY TRAP comment. The v6 sticky-offset fix (§11) was necessary but not sufficient — this was the second, independent bug on the same panel |
| Makita products must carry the ארגנטולס "יבואן רשמי" seal, Milwaukee the DELCO seal (as the live site shows via the labels app) | Seal images are hosted by the BSS app, not in store Files (searched via Admin API: not found), and chat attachments can't be saved | `snippets/vendor-badge.liquid` + settings group "חותמות יבואן רשמי": 3 × image_picker + comma-separated vendor lists (defaults "מקיטה" / "מילווקי" — the real vendor strings, verified via `productVendors`). Rendered top-inline-end on cards (52px) and the product gallery (84px). **Blocked on owner: upload the two seal images in the editor** — INSTALL-THEME §7 has the exact steps |

Knowingly left: everything §11 lists, minus the two items the owner's review
resolved (tile colour, thumb coverage). The facets fix is verified statically
only — same §2 constraints — but this time the failure mechanism fully explains
the screenshot, both in geometry and in why LTR analysis missed it.

---

## 13. Round 7 — two more owner reports; DEPLOY PENDING (read before touching)

Round 7 changed 6 theme files (commit `8dbd2c9`): cream tile field
(`color_tile_bg` default `EFE9DF`), plate padding 8% → 2.5%, `photo_blend` also
on r7/r12, nav-thumb decoupled to white, and the collection toolbar / desktop
facets sidebar / A–Z jump bar un-stickied (they floated detached below the
auto-hiding header — owner screenshot).

**The Shopify MCP disconnected mid-round and did not re-propagate even after
the owner reconnected the connector**, so round 7 is in git but NOT deployed.
The built zip was sent to the owner in chat as `shilo-v8-theme.zip` (also at
the repo root).

**Next agent — the obvious deploy route is now WRONG. Read fully:** after
round 7 shipped to git, the owner uploaded the two importer-seal images
through the THEME EDITOR of v7 (`148377370703`) — חותמת 1 = מקיטה/ארגנטולס,
חותמת 2 = מילווקי/DELCO. Those uploads live ONLY in v7's live
`config/settings_data.json`. A §3 zip import creates a NEW theme with the
REPO's settings_data and would silently drop them. Therefore:

1. Read v7's live `config/settings_data.json` via the files API. Capture the
   `importer_badge_1/2` (+`_vendors`) values, and check whether
   `color_tile_bg` was materialized as `"#FFFFFF"` by the editor save — if so,
   the new cream schema default will NOT take effect on its own.
2. `themeFilesUpsert` onto v7: the 6 round-7 files
   (config/settings_schema.json, layout/theme.liquid,
   assets/section-category-rail.css, assets/section-collection.css,
   assets/section-header.css, templates/index.json) PLUS a corrected
   settings_data.json built from v7's LIVE copy (badge refs preserved,
   `color_tile_bg` → the cream). Compare settings_data by VALUES, not bytes (§5).
3. Merge the badge refs into the repo's `config/settings_data.json` so future
   zip deploys carry them; delete `shilo-v8-theme.zip` from the repo root;
   commit + push; update this section.

If a v8 theme already exists in the admin (the owner uploaded the zip
manually), the badge settings must be re-applied there — either re-uploaded in
its editor or upserted with the refs captured from v7. Check before assuming.

One process bug worth recording: this section was first written to
`theme/HANDOFF.md` by mistake (the shell cwd was still `theme/` after building
the zip) and shipped that way in `8dbd2c9`; had another zip been built before
the fix, the handoff file would have deployed to the storefront as a theme
file. It was moved here and deleted from `theme/`. Check your cwd before
heredoc appends.

---

## 14. GitHub integration — the deploy path that replaces §3 once connected

A dedicated branch **`shopify-live`** exists: the contents of `theme/` at the
branch ROOT (Shopify's GitHub integration requires root-level theme folders),
minus `tools/`, `SPEC.md`, `DESIGN-SYSTEM.md`. The owner connects it once:
**Online Store → Themes → Add theme → Connect from GitHub →
`ofir-commits/anshilo.com` → branch `shopify-live`.**

After that:

- **Deploying = pushing.** Run `bash theme/tools/sync-shopify-live.sh` from
  the dev branch. It validates, pulls shopify-live (the editor commits back to
  it!), overlays `theme/`, **preserves `config/settings_data.json` from the
  Shopify side** (that file is editor-owned once connected — the owner's badge
  uploads and colour tweaks land there and must never be clobbered), commits
  and pushes. No Admin API, no MCP, no zip — the connector outage class of
  §13 disappears.
- The connected theme keeps one stable id/preview URL forever; the v2–v7
  theme pile stops growing. Once the owner confirms the connected theme, all
  earlier previews can be deleted and §13's pending-upsert plan is OBSOLETE —
  round 7 is already in `shopify-live`.
- Two-way sync means `settings_data.json` history lives in git — the
  badge-loss problem §13 documents can no longer happen.
