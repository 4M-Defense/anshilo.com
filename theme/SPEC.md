# Shilo Pro v2 — technical map

Shopify Online Store 2.0 theme, Hebrew-first (RTL), built for a 1,918-product /
186-collection building-supply catalogue. No theme framework, no builder app, no
external CSS or JS dependency.

The binding design rules live in [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md); this file
describes the mechanics.

## Layout of the theme

```
theme/
  layout/       theme.liquid, password.liquid
  templates/    23 JSON templates (+ 2 Liquid)
  sections/     39 sections + header-group.json / footer-group.json
  snippets/     14 snippets
  assets/       1 design system + 1 CSS file per section, 8 JS files, 6 font subsets
  config/       settings_schema.json (52 settings, 8 groups), settings_data.json
  locales/      he.default.json, en.json
  tools/        validate.py, shoot.mjs
```

## The token system

Everything visual resolves through CSS custom properties emitted once, in the
`<style>` block of `layout/theme.liquid`, from theme settings:

- **colour** — `--color-accent`, `--color-ink`, `--color-page`, `--color-surface*`,
  `--color-text*`, `--color-border*`, `--color-success|warning|danger|sale|highlight`.
  Derived values (`--color-accent-soft`, `--color-ink-soft`) come from Liquid's
  `color_mix` / `color_lighten` so a merchant changing one colour updates the tints.
  RGB triplets (`--color-accent-rgb`) exist for alpha compositing.
- **shape** — `--radius-sm|base|card|lg|pill`, switched by the `corner_style` setting.
- **depth** — `--shadow-xs|sm|md|lg`, all tinted with `--color-ink-rgb`.
- **type** — `--font-heading-family` (Heebo), `--font-body-family` (Assistant),
  plus scale multipliers.
- **motion** — `--duration-fast|base`, `--ease-out`, `--ease-spring`.
- **layout** — `--page-width`, `--page-gutter`, `--blueprint-line`.

`assets/base.css` (1,597 lines) consumes those tokens and defines the component
library. A section's own CSS file holds **only** that section's layout.

## Typography — why the fonts are bundled

Shopify's font library only ships Basic Latin, Latin-1 and Latin Extended-A glyph
ranges, so every font in it renders Hebrew through a system fallback. Assistant
(UI) and Heebo (display) are therefore bundled as variable WOFF2 subsets — both are
SIL Open Font License, so redistribution is permitted:

```
assets/{assistant,heebo}-var-{hebrew,latin,latin-ext}.woff2
```

They are declared with `@font-face` + `unicode-range` in `layout/theme.liquid`, and
the two Hebrew subsets are preloaded via `preload_tag`. A Hebrew visitor downloads
~19KB and gets the full 300–900 weight range; the Latin subsets load only when a
page actually contains those characters. The `use_shopify_fonts` setting flips to
the font pickers — it exists for a Latin-only storefront and breaks Hebrew.

## Components owned by `base.css`

`.btn` (`--secondary`, `--outline`, `--outline-light`, `--ghost`, `--quiet`, `--sm`,
`--lg`, `--full`, `--loading`) · `.btn-icon` · `.card` · `.panel` · `.badge`
(`--sale`, `--new`, `--soldout`, `--offer`, `--outline`, `--soft`) · `.chip` ·
`.stock-dot` (`--low`, `--out`) · `.price` (`--large`, `--on-sale`, `--call`) ·
`.media` (`--square`, `--portrait`, `--landscape`, `--wide`, `--contain`,
`--sunken`) · `.product-card` · `.collection-tile` · `.brand-tile` · `.field` /
`.input` / `.select` / `.checkbox` · `.qty` · `.drawer` · `.modal` · `.toast` ·
`.skeleton` · `.pagination` · `.breadcrumbs` · `.accordion` · `.table` · `.rte` ·
`.empty-state` · `.cart-bubble` · `.shipping-bar` · `.variant-pill` · `.trust-row` ·
`.contact-dock` · `.back-in-stock` · `.request-price` · `.recently-viewed` ·
`.blueprint-rule` / `.blueprint-underline` / `.blueprint-field` · `.section` /
`.section-header` / `.container` / `.grid` / `.scroll-row`

## Section inventory

**Header group** — `announcement-bar` (rotating messages), `header` (three rows:
ink utility strip → logo + predictive search + actions → nav row with the mega
menu), `predictive-search`.

**Homepage** — `image-banner` (hero with an in-hero search field and a designed
ink/blueprint fallback when there is no photo), `category-rail`, `services-bar`,
`featured-collection` (with a `highlight` mode for offers), `collection-list`,
`image-with-text`, `brand-logos` (pulls each logo from a brand collection's image),
`rich-text`, `newsletter`.

**Catalogue** — `main-collection-banner`, `main-collection-product-grid` (sticky
filter sidebar on desktop, filter drawer on mobile, active-filter chips, sort),
`main-list-collections` (A–Z grouped index over 186 collections), `main-search`.

**Product** — `main-product` (sticky gallery + sticky buy column), `related-products`,
`recently-viewed`, `product-card-render` (headless helper fetched by
`recently-viewed.js` so the card markup is never duplicated).

**Cart** — `cart-drawer`, `main-cart`.

**Customer** — `main-account`, `main-login`, `main-register`, `main-reset-password`,
`main-activate-account`, `main-addresses`, `main-order`.

**Content** — `main-page`, `main-blog`, `main-article`, `main-contact`, `faq`
(emits FAQPage JSON-LD), `main-404`, `main-password`, `apps` (host for app blocks).

**Pro tools** — `quick-order`.

**Footer group** — `footer`.

## Snippets

`product-card` · `price` · `product-media-gallery` · `product-variant-picker` ·
`buy-buttons` · `quantity-input` · `facets` · `pagination` · `article-card` ·
`icon` (57 inline SVGs, single `case` block) · `contact-dock` · `back-in-stock` ·
`request-price` · `structured-data`

## JavaScript

All vanilla, all `defer`, no framework.

| File | Responsibility |
|---|---|
| `global.js` | drawers, overlay, toasts, cart add/update, reveal-on-scroll |
| `section-header.js` | sticky compression, `--header-reserve`, mega menu, predictive search |
| `section-main-product.js` | variant change, gallery, zoom, sticky add-to-cart |
| `facets.js` | filter form, active chips, history state |
| `quick-order.js` | SKU resolution, bulk paste, multi-line `/cart/add.js` |
| `recently-viewed.js` | localStorage history, hydrates cards via the helper section |
| `section-customers.js`, `section-article.js` | account forms, article behaviour |

## Two non-obvious mechanisms

**SKU lookup.** Shopify's predictive-search endpoint does not expose variant SKUs,
so `templates/search.quick-order.liquid` is an alternate search view rendered with
`{% layout none %}` that returns JSON. `quick-order.js` calls
`/search?type=product&view=quick-order&q=<sku>`, takes the exact SKU or barcode
match, and falls back to fuzzy product suggestions when there is none.

**Recently viewed.** `layout/theme.liquid` emits a hidden `data-product-handle`
marker on product pages. `recently-viewed.js` records handles in localStorage and
hydrates the rail by fetching `/products/<handle>?section_id=product-card-render`
and lifting the `.product-card` node out of the response, so the card markup has
exactly one source.

## Unpriced and sold-out products

150 active products are published at ₪0 and 151 are sold out. `price.liquid`
detects a zero price and renders a "מחיר בטלפון" call link instead of a buyable
₪0.00; `main-product.liquid` swaps the buy button for `request-price.liquid`.
Sold-out variants get `back-in-stock.liquid`, which captures demand through the
built-in `{% form 'contact' %}` with the product, variant and SKU attached — no app
required.

## RTL

Hebrew is the default locale and `layout/theme.liquid` sets `dir="rtl"` from
`request.locale.iso_code`. The CSS uses logical properties throughout
(`margin-inline-start`, `inset-inline-end`, `padding-block`, `border-inline-start`),
so the same stylesheet serves both directions. Directional icons carry `.icon--dir`,
which mirrors under RTL. Prices, phone numbers and SKUs that must read
left-to-right are marked `dir="ltr"` individually.

## Checks

```bash
python3 theme/tools/validate.py     # 0 errors expected
node theme/tools/shoot.mjs          # screenshots + per-page audit (needs storefront access)
```

`validate.py` covers: JSON parse (templates, config, locales, section schemas);
exactly one default locale; balanced Liquid block tags; `{{` inside `{% %}`;
**literal `{` inside a `{{ }}` tag** — which Shopify rejects outright and
`theme-check` does not catch; unknown Liquid filters; duplicate setting ids;
`section.settings.X` declared in schema; snippet / icon / asset / translation-key
existence; templates referencing real sections; `settings.X` declared in
`settings_schema.json`; and the design-contract rules (no hazard motif, no retired
orange, no hardcoded colours).

Shopify's own checker is worth running too:

```bash
npm install @shopify/theme-check-node
```

## Two importer traps

Both were hit during deployment and both fail **silently** — Shopify keeps the rest
of the theme and drops the file:

1. A setting with `"default": ""` makes Shopify reject the whole of
   `config/settings_schema.json` and replace it with `[]`, which strips every
   colour, font and token from the theme.
2. A literal `{` inside a `{{ }}` tag stops the Liquid lexer from finding the
   closing `}}`, and the file is discarded.

`validate.py` now catches the second; the first surfaces as an explicit
`FILE_VALIDATION_ERROR` from `themeFilesUpsert` but not from a zip import.
