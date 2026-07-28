# Shilo Shop — Mobile App Build Spec (contract for all builders)

Expo (SDK 57) + React Native + TypeScript + expo-router shopping app for **א.נ. שילו בע"מ** — Hebrew, RTL-forced, connects to Shopify **Storefront API**. Design mirrors the "Shilo Pro" web theme: industrial-premium, orange `#F97316` accent, ink `#12161C`, Heebo-like clean typography (system font), hazard-stripe brand motif.

## Foundation (ALREADY BUILT — do NOT edit)

- `src/config.ts` — `SHOPIFY_CONFIG` (domain/token/apiVersion) + `STORE_INFO` (name, phone, whatsapp, address, hours, website).
- `src/theme.ts` — `colors`, `radius`, `spacing`, `typography`, `shadows`, `hazard`. USE THESE TOKENS ONLY — no hardcoded hex/sizes.
- `src/api/types.ts` — all TS types (`Product`, `ProductCardData`, `Collection`, `Cart`, `CartLine`, `MoneyV2`…).
- `src/api/queries.ts` — GraphQL documents.
- `src/api/client.ts` — typed functions: `getShopInfo`, `getCollections`, `getCollectionProducts(handle, {first, after, sort})` (sort keys: default/best_selling/price_asc/price_desc/newest/title), `getProducts({first, after, sortKey, reverse, query})`, `getProductByHandle`, `getProductRecommendations`, `searchProducts(q, {first, after})`, cart ops (used via context — don't call directly), `formatMoney(MoneyV2) → "₪1,234"`. Errors throw `StorefrontError` with Hebrew `.message` — display it.
- `src/state/CartContext.tsx` — `useCart()`: `{ cart, initializing, busy, itemCount, addItem(merchandiseId, qty), updateLine(lineId, qty), removeLine(lineId), setNote, refresh, resetCart }`. Checkout = open `cart.checkoutUrl` with `expo-web-browser` `openBrowserAsync`; on return call `refresh()` (if cart became an order it resets automatically).
- `src/state/FavoritesContext.tsx` — `useFavorites()`: `{ favorites: string[] (handles), isFavorite(handle), toggleFavorite(handle) }`.
- `package.json` / `tsconfig.json` (path alias `@/*` → `./src/*`) / `app.json` (expo-router + expo-localization forcesRTL plugins configured).

## Conventions

- **Imports**: use `@/theme`, `@/api/client` etc. Screens live in `app/` (expo-router file-based).
- **RTL**: app is force-RTL. Rely on RN's automatic RTL flipping: use `flexDirection: 'row'` (it flips), `textAlign: 'right'` for Hebrew paragraphs where needed, `writingDirection: 'rtl'`. `I18nManager` already forced in root layout. Chevrons "forward" should point LEFT in RTL — use I18nManager.isRTL checks or transform.
- **Text**: ALL user-facing copy in Hebrew. Warm, professional.
- **Images**: `expo-image` `Image` component with `contentFit`, `transition={200}`, `placeholder` blurhash optional. Product images on white bg with `contentFit: 'contain'`.
- **Lists**: `FlatList` with `numColumns=2` for product grids, `onEndReached` pagination using `pageInfo.endCursor`, pull-to-refresh, skeleton loaders while loading (build a `Skeleton` component w/ opacity pulse via `Animated`).
- **Errors**: every data screen has loading / error (message + retry button) / empty states. Never a blank screen.
- **Haptics**: `expo-haptics` light impact on add-to-cart and favorite toggle.
- **No new dependencies** — only what's in package.json.
- **Type safety**: `npx tsc --noEmit` (run it from mobile-app/ — node_modules is installed) must pass with ZERO errors in your files before you finish. Fix all errors you introduce.
- Components you create that are shared go in `src/components/`; screen-local pieces may live beside usage. Check what other builders own — don't create files outside your assignment.

## Design language (match the web theme)

- Cards: white, 1px `colors.border`, `radius.lg`, `shadows.card`; padded `spacing.md`.
- Primary button: accent bg, white bold text, radius.md, height 48; pressed → accentHover. Secondary: ink bg. Ghost: border.
- Sale badge: `colors.sale` bg white text, pill. Sold-out: ink. "חדש": success.
- Price: bold ink; compare-at: strikethrough textMuted; sale price in `colors.sale`.
- Section headers: bold h2 + accent 22×3 rounded bar (the web's eyebrow motif) + optional "לכל המוצרים" link.
- HazardStripe component (from `A1`): thin repeating diagonal stripes accent/ink — used sparingly as dividers.
- Screen bg: `colors.bg`; alternate sections `colors.surfaceAlt`.
- Tab bar: white, ink icons, accent active, labels in Hebrew.
