# HANDOFF — א.נ. שילו · Shilo Pro v2

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

### Store identifiers

| Thing | Value |
|---|---|
| Storefront domain | `anshilo.com` |
| **myshopify domain** | `3007b3-4.myshopify.com` (**not** `anshilo.myshopify.com` — verified via `shop.myshopifyDomain`) |
| Shop id | `58110246991` |
| Live theme (**never write to it**) | `שמירה 1` — `gid://shopify/OnlineStoreTheme/141469646927`, role MAIN |
| **Working preview theme** | `שילו 2026 — העיצוב החדש v4 ⭐` — `gid://shopify/OnlineStoreTheme/148372193359` |
| Preview URL | `https://anshilo.com/?preview_theme_id=148372193359` |
| Superseded, owner can delete | `148368425039` (v2) and `148371210319` (v3). Each zip import mints a new theme, so these accumulate — delete them from the admin. |
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
{ "themeId": "gid://shopify/OnlineStoreTheme/148372193359",
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

## 5. Deployed theme vs repo — currently identical

**There is no delta.** Theme `148372193359` was created by a full zip import of the
repo, and every file was verified by comparing the `size` the Admin API reports to
the local byte count — 127 files, all exact, including the four that the import
traps below would have silently mangled.

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

If you have storefront access: `node theme/tools/shoot.mjs 148372193359 /tmp/shots`
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

### 5. No independent code review has run

All twelve adversarial verification agents died on the spend limit. Every area
rests on its build agent's own work plus the three checkers. A review pass over
`sections/main-*.liquid` and the JS files is worth doing.

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
