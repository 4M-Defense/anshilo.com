# Shilo Pro — Theme Build Spec (contract for all builders)

Premium Shopify Online Store 2.0 theme for **א.נ. שילו בע"מ** (anshilo.com) — an Israeli building-materials & technical-supply store in Kiryat Ata (30+ years). Sells power tools (Makita, DeWalt, Milwaukee), paint (Tambour, Nirlat), lumber, electrical & lighting. Site language: **Hebrew, RTL-first** (theme must also work LTR — `dir` is set on `<html>` by `layout/theme.liquid`).

Design personality: modern-industrial, confident, clean. Think "professional contractor's trusted supplier with a premium digital storefront". Generous whitespace, strong typography, subtle motion, hazard-stripe accent motif (already provided as CSS utilities).

## Foundation (ALREADY BUILT — do NOT edit these files)

- `layout/theme.liquid` — html/head/body. Renders `{% sections 'header-group' %}`, main, `{% sections 'footer-group' %}`, static `{% section 'cart-drawer' %}` (when `settings.cart_type == 'drawer'`), and a `[data-toast-region]`. Exposes `window.routes`, `window.cartStrings`, `window.themeSettings`.
- `assets/base.css` — the entire design system (tokens + components). READ IT before writing markup; reuse its classes.
- `assets/global.js` — cart API + UI primitives. READ IT.
- `config/settings_schema.json` — theme settings (ids like `settings.color_accent`, `settings.cart_type`, `settings.free_shipping_threshold`, `settings.store_phone`, `settings.social_facebook`, `settings.popular_searches`, `settings.predictive_search_enabled`, `settings.logo`, `settings.logo_width`, `settings.card_*`…).
- `locales/he.default.json` + `locales/en.json` — ALL storefront strings. **Do not edit these files** (parallel-edit conflicts). Use existing keys via `{{ 'key.path' | t }}`. If a string you need is genuinely missing, hardcode the Hebrew text and add an HTML comment `<!-- TODO-i18n: suggested.key.path -->` next to it.
- Snippets (use, don't rewrite): 
  - `{% render 'icon', name: 'cart', size: 20, class: '' %}` — names: cart, cart-add, search, user, menu, close, chevron-down/up/left/right, arrow-left/right, plus, minus, trash, phone, mail, map-pin, clock, truck, shield-check, wrench, hammer, paint-roller, layers, ruler, check, check-circle, alert, info, star, star-filled, heart, share, filter, grid, list, package, credit-card, headset, tag, percent, store, refresh, external, home, whatsapp, facebook, instagram, tiktok, youtube, twitter.
  - `{% render 'price', product: product %}` / `{% render 'price', variant: v, large: true %}`
  - `{% render 'product-card', product: p, lazy: true, class: 'reveal' %}` (optional `show_vendor`, `show_quick_add`, `placeholder_index`)
  - `{% render 'quantity-input', id: '..', name: 'quantity', value: 1, min: 1, max: x, small: true, product_title: '..', line: n %}`
  - `{% render 'pagination', paginate: paginate %}` (inside `{% paginate %}`)
- `sections/header-group.json` (announcement-bar + header) and `sections/footer-group.json` (footer) — already reference section types you will build.

## JS contracts (global.js)

- `window.ShiloCart.add(item, openDrawer)` / `.change(line, qty)` / `.updateNote(note)` / `.getState()`. After any change it re-renders every element carrying `data-cart-section="<section-id>"` via the Section Rendering API (the element's inner HTML is replaced by the same-id element from the re-rendered section), updates `[data-cart-bubble]` badges, and dispatches `document` event `cart:updated` with `{detail:{cart}}`.
- Cart sections MUST: wrap their re-renderable markup in an element with `data-cart-section="{{ section.id }}"`.
- Drawers: give the drawer root `id`, classes `drawer drawer--end` (or `--start`), `aria-hidden="true"`. Open with a button carrying `data-drawer-open="TheId"`; close buttons inside carry `data-drawer-close`. The overlay, focus-trap, ESC and body scroll-lock are automatic. The cart drawer MUST have `id="CartDrawer"` (global.js opens it after add-to-cart).
- Custom elements available: `<product-form>` (wraps a standard product `<form method="post" action="{{ routes.cart_add_url }}">` and AJAX-ifies it), `<quantity-input>`, `<cart-remove-button data-line="n">`, `<cart-line-qty data-line="n">` (wrap a quantity-input; listens to change).
- `window.ShiloToast(message, 'success'|'error')`, `window.debounce(fn, ms)`, `window.trapFocus(el)`, `window.formatMoney(cents)`.
- Sticky header: root element with `data-sticky-header` gets `.is-stuck` (scrolled) and `.is-hidden-up` (scrolling down past 320px) classes. Style transitions in the section's own CSS.
- Dropdowns: `<details data-disclosure>` auto-closes on outside click / ESC.
- Scroll animations: add class `reveal` to cards/blocks; JS staggers `.reveal--visible`.

## CSS conventions

- Reuse base.css classes: `.container`, `.section`, `.section--alt/--ink/--tight`, `.section-header` (+ `__eyebrow`, `__link`), `.grid .grid--2/3/4/5`, `.scroll-row`, `.btn` variants (`--secondary/--outline/--outline-light/--ghost/--sm/--lg/--full/--loading`), `.btn-icon`, `.badge` variants, `.chip`, `.field/.field__input/.field__label/.field__select/.field__textarea`, `.form__row--2`, `.errors`, `.form__success`, `.qty`, `.drawer*`, `.modal*`, `.media media--square/--portrait/--landscape/--wide/--contain`, `.price*`, `.product-card*`, `.pagination*`, `.breadcrumbs*`, `.accordion*`, `.table`, `.rte`, `.empty-state`, `.hazard-divider`, `.hazard-underline`, `.cart-bubble`, `.shipping-bar*`, `.stock-dot`, `.variant-pills/.variant-pill`, `.trust-row`, `.skeleton`, `.spinner`, `.visually-hidden`.
- Section-specific styles go in a **new** file `assets/section-<name>.css`, linked at the top of the section with `{{ 'section-<name>.css' | asset_url | stylesheet_tag }}`. Section JS likewise: `assets/section-<name>.js` + `<script src="{{ 'section-<name>.js' | asset_url }}" defer="defer"></script>`. Never edit base.css/global.js.
- **RTL: use CSS logical properties only** (`margin-inline-start`, `padding-block`, `inset-inline-end`, `text-align: start`…). Never left/right physical properties unless truly directionless. Directional chevrons/arrows: add class `icon--dir` to mirror automatically in RTL.
- Use CSS vars from tokens: `var(--color-accent)`, `var(--color-ink)`, `var(--color-surface-alt)`, `var(--color-border)`, `var(--color-text-muted)`, `var(--radius-base/-card/-pill)`, `var(--shadow-card/-card-hover)`, `var(--duration-fast/base)`, `var(--ease-out)`, `var(--page-width)`. No hardcoded hex except rgba overlays.
- Breakpoints: mobile-first; `@media (min-width: 750px)` and `(min-width: 990px)`, `(min-width: 1200px)`.

## Liquid conventions

- Every section ends with a `{% schema %}` containing `"name"` (Hebrew label), settings (Hebrew `label`s), and `"presets": [{ "name": "<Hebrew name>" }]` for sections addable in the editor (main-* and header/footer/announcement/cart-drawer/predictive-search need NO presets).
- Images: `image_url` filter with explicit `width:` + `srcset` for large media, `loading="lazy"` below the fold, `width`/`height` attrs always. Placeholders when blank: `{{ 'lifestyle-1' | placeholder_svg_tag: 'placeholder-svg' }}` (or product-N, collection-N, image).
- Money: `| money`. Translations: `| t` (check key exists in `locales/he.default.json` first!).
- JSON templates (`templates/*.json`): `{"sections": {"main": {"type": "main-product", "settings": {}}}, "order": ["main"]}` — section `type` must equal the sections/ filename without `.liquid`.
- Forms: use Shopify `{% form %}` tags with our field classes; render `form.errors` inside `.errors` block.
- Accessibility: aria-labels from locale keys, focus states are inherited from base.css, buttons ≥44px tap targets.

## Quality bar (every builder)

- Looks premium on 360px mobile AND 1440px desktop. Test markup mentally at both.
- Empty/edge states handled (no image, no products, sold out, long Hebrew titles).
- No console errors; JS defensive (`?.`, element existence checks).
- Hebrew microcopy: warm, professional, no spelling errors.
