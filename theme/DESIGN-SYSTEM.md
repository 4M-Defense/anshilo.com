# Shilo Pro — Design System Contract (v2 "Clarity")

Single source of truth for the visual layer. Every section CSS file **must** consume
these tokens and component classes. Never hardcode a hex value, radius, shadow or
font stack in a section file.

## Direction

**v1 was "industrial drama": orange accent, charcoal blocks, hazard stripes.**
It read as noisy and made the catalogue hard to scan. v2 is **"clarity"**:

- Bright, calm canvas. Content floats on white cards over a cool light-grey page.
- One confident brand colour (Shilo red) reserved for **actions and prices** only.
- Deep navy ink for structure (header bar, footer, headings) — never large red areas.
- Product imagery on white, `object-fit: contain` — these are catalogue parts, not
  lifestyle photos.
- Density where it matters: 1,918 SKUs / 186 collections means scanning speed wins
  over decoration.
- Motif: a **fine blueprint grid** (2 hairlines) replaces hazard stripes. Subtle,
  architectural, on-brand for a building-supply merchant.

### Banned in v2
`hazard-divider`, `hazard-underline`, repeating diagonal stripe gradients,
`text-transform: uppercase` on Hebrew, orange (`#F97316`/`#EA580C`), full-bleed
charcoal sections, drop shadows darker than `--shadow-lg`.

## Colour tokens

Defined in `layout/theme.liquid` from theme settings. Use the CSS var, never the hex.

| Token | Value | Use |
|---|---|---|
| `--color-accent` | `#D81E29` | Primary CTA, price, sale, active state |
| `--color-accent-hover` | `#B3151F` | CTA hover |
| `--color-accent-soft` | `#FEF2F3` | Tinted CTA background, sale chip bg |
| `--color-ink` | `#0F1729` | Header/footer bar, headings, secondary button |
| `--color-ink-soft` | `#1B2740` | Hover of ink surfaces |
| `--color-bg` / `--color-surface` | `#FFFFFF` | Cards, panels |
| `--color-page` | `#F4F6F9` | Page canvas behind cards |
| `--color-surface-alt` | `#F7F9FC` | Alternating section background |
| `--color-surface-sunken` | `#EDF1F6` | Image wells, skeletons |
| `--color-text` | `#16202F` | Body copy |
| `--color-text-muted` | `#5B6779` | Meta, vendor, helper text |
| `--color-border` | `#E3E8EF` | Hairlines, card borders |
| `--color-border-strong` | `#848E9F` | Inputs, dividers needing weight |
| `--color-success` | `#0B7A46` | In stock |
| `--color-warning` | `#B45309` | Low stock |
| `--color-danger` | `#C81E1E` | Errors, out of stock |
| `--color-highlight` | `#FFB224` | Offers / "מבצע" badge (amber) |
| `--color-tile-bg` | `#FFFFFF` | Uniform field behind department tile images (category rail, nav thumbs) — own setting; white per the owner (matches the field most department images carry) |
| `--color-on-accent` | `#FFFFFF` | Text on accent |
| `--color-on-ink` | `#EEF1F6` | Text on ink |

RGB triplets available for alpha: `--color-accent-rgb`, `--color-ink-rgb`,
`--color-text-rgb`.

## Type

Self-hosted variable WOFF2, served from Shopify's CDN as theme assets:

- `--font-heading-family` → **Heebo** (300–900) — headings, prices, buttons
- `--font-body-family` → **Assistant** (300–800) — everything else

Shopify's own font library only ships Basic Latin / Latin-1 / Latin Extended-A
glyph ranges, so **every font in it falls back to a system font for Hebrew**.
Both families here are SIL Open Font License, so they are bundled directly:
`assets/{assistant,heebo}-var-{hebrew,latin,latin-ext}.woff2`, declared with
`unicode-range` in the `<style>` block of `layout/theme.liquid`, with the two
Hebrew subsets preloaded. A Hebrew visitor downloads ~19KB and gets the full
weight range; the Latin subsets load only if a page contains those characters.

The `use_shopify_fonts` setting switches to the theme's font pickers. It exists
for a Latin-only storefront and **will break Hebrew rendering** — do not enable
it for this store.

Scale (already in `base.css`, do not redeclare): `h1`…`h6`, `.h1`…`.h6`.
Extra utilities: `.text-eyebrow`, `.text-meta`, `.text-lead`.

**Hebrew never gets `text-transform: uppercase`** and never letter-spacing > `.02em`
at body sizes. Latin eyebrows may use `.06em`.

## Shape & depth

| Token | Value |
|---|---|
| `--radius-sm` | `8px` |
| `--radius-base` | `10px` |
| `--radius-card` | `16px` |
| `--radius-lg` | `22px` |
| `--radius-pill` | `999px` |
| `--shadow-xs` | hairline lift |
| `--shadow-sm` | resting card |
| `--shadow-md` | raised card / dropdown |
| `--shadow-lg` | drawer / modal / mega-menu |

`--radius-*` respond to the `corner_style` setting; always use the token.

## Spacing & layout

- `--page-width` (setting, default `1400px`), `--page-gutter`
- Section rhythm: `.section` (`clamp(2.75rem, 4vw, 4.5rem)` block padding),
  `.section--tight`, `.section--flush`
- Backgrounds: `.section--alt` (surface-alt), `.section--page` (page canvas),
  `.section--ink` (navy, sparingly — footer & one homepage band max)
- Containers: `.container`, `.container--narrow`, `.container--text`
- Grids: `.grid` + `.grid--2` … `.grid--6`, `.scroll-row` for mobile rails

## Component classes owned by `base.css`

Section CSS **consumes** these and must not restyle their internals:

`.btn` (`--primary` implicit, `--secondary`, `--outline`, `--ghost`, `--quiet`,
`--sm`, `--lg`, `--full`, `--loading`), `.btn-icon`, `.badge` (`--sale`, `--new`,
`--soldout`, `--offer`, `--outline`), `.chip`, `.stock-dot` (`--low`, `--out`),
`.price` (`--large`, `--on-sale`), `.media` (`--square`, `--portrait`,
`--landscape`, `--wide`, `--contain`), `.card`, `.panel`, `.product-card`,
`.collection-tile`, `.field`, `.input`, `.select`, `.checkbox`, `.drawer`,
`.accordion`, `.pagination`, `.breadcrumbs`, `.toast`, `.skeleton`,
`.blueprint-rule`, `.section-header`.

## Interaction rules

- Duration: `--duration-fast` 140ms, `--duration-base` 240ms, `--ease-out`
- Hover on cards: `translateY(-2px)` + `--shadow-md` + accent border. Nothing more.
- Focus: always `:focus-visible` with a 2px accent ring and 2px offset.
- Respect `prefers-reduced-motion` (handled globally in `base.css`).
- Every tap target ≥ 44px.

## RTL

Hebrew is the default locale; `dir="rtl"` is set on `<html>`. Use **logical
properties only** — `margin-inline-start`, `inset-inline-end`, `padding-block`,
`border-inline-start`. Directional icons get `.icon--dir` (mirrored under RTL).
Prices and phone numbers that must read LTR get `dir="ltr"`.
