# Prompt for the browser agent — copy everything below the line

---

You are working inside a real browser for the owner of **anshilo.com**, a Hebrew
building-supplies shop in Israel. Two separate jobs. Job 1 is short. Job 2 is the
long one and the reason you were asked.

Report back in the template at the bottom. Do not skip it — a summary in your own
shape costs a second round trip.

---

## Job 1 — two credentials, about five minutes

### 1a. Create an Expo access token

1. Go to **https://expo.dev** and sign in (the account owning the project
   `anshilo-assistant`; the owner is signed in as one of `dvir4m`, `defense-4m` or
   `a-n-shilo`).
2. **Account settings → Access tokens → Create token.**
3. Name it `github-actions`. Copy the value — Expo shows it once only.

### 1b. Put four secrets into GitHub

Go to
**https://github.com/A-N-Shilo/anshilo.com/settings/secrets/actions**
and for each row press **New repository secret**, then paste the name and the value
exactly:

| Name | Value |
|---|---|
| `SHOPIFY_STORE` | `3007b3-4.myshopify.com` |
| `SHOPIFY_THEME_ID` | `148378648655` |
| `SHOPIFY_CLI_THEME_TOKEN` | `shptka_86b288864d567f891cdd77c755990363` |
| `EXPO_TOKEN` | the token from step 1a |

Names are case-sensitive and must match exactly. Values must have no leading or
trailing space.

**Say so explicitly in your report if a secret of that name already exists** — do
not overwrite it without saying which one and what the old one looked like (GitHub
will not show you the old value; just report that it existed).

**What this switches on, so you know what you are doing:** with these four set, every
change pushed to the repository deploys itself — the shop's theme to the live site,
the app as an over-the-air update, and the assistant server. Nothing deploys until
somebody pushes a change; you are not triggering a deploy by setting these.

---

## Job 2 — find the price of 87 products

### The problem, so you understand why this needs a browser

87 products in the shop are published at **₪0**. The shop buys them from
**Fetaya** (https://www.fetaya.com), a Hebrew electrical-supplies wholesaler, and
the prices are public on Fetaya's own product pages.

We cannot read those pages from the machine running the automation. Every request
from that IP — product pages, the sitemap, even the homepage — returns the same
1,648-byte interstitial page titled **"עבור לדף המבוקש"** with `id="page_no_referer"`
instead of the real page. It was tested with a browser user-agent, with a Referer
from the site itself, from Google, from the page itself, with a cookie jar, with
no-cache, and against `/items/<id>.json` and `/api/` paths. All identical. It is an
IP-level decision, so there is nothing left to try from there.

**A normal browser passes it without noticing.** That is you.

### The list

The 87 products are in the repository at **`docs/zero-price-products.csv`**. Ask the
owner to paste it to you if you cannot read the repo. Columns:

- `sku` — Fetaya's catalogue number. This is the reliable identifier.
- `product_name_in_store` — the Hebrew name as the shop lists it. Close to Fetaya's
  wording but **not identical** — the shop rewrites titles.
- `price_found`, `source_url`, `notes` — empty, for you to fill.

### Before the 87, settle one thing

Do this first and report the answer, because it decides how the rest goes:

1. Open **https://www.fetaya.com** in the browser. Confirm you get the real shop and
   not the interstitial described above.
2. Find their site search. Search for the SKU **`9169`** exactly.
3. Report **whether searching by SKU works at all.** Does it return the product
   "פרוז'קטור לד מקצועי 600W" (a 600W LED floodlight)?

If SKU search works, the other 86 are mechanical. If it does not, fall back to
searching the Hebrew product name, and say so in your report.

### For each product

Find the Fetaya product page and record:

- **`price_found`** — the price in shekels, digits only, e.g. `112.5`. If the page
  shows a price with VAT and a price without, **take the one shown to a normal
  visitor as the shelf price**, and say in `notes` which you took if the page shows
  both.
- **`source_url`** — the full URL of the product page you read it from. This is not
  optional: it is how the price gets checked later.
- **`notes`** — anything that made you unsure.

### The rules that matter more than finishing

1. **Match on the SKU, not on the name.** The names are similar across many
   products and this has already gone wrong: a TV/FM socket was matched to a round
   junction box and priced at ₪2, and an unlit sign was matched to a lit one. If the
   page you found does not show the SKU from the CSV, treat it as not found.
2. **If you are not sure it is the same product, leave `price_found` empty** and say
   why in `notes`. An empty cell costs nothing. A wrong price goes onto a live shop
   and onto Google Shopping.
3. **Do not average, estimate, round, or infer a price from a similar product**, and
   do not carry a price across from a different wattage, colour or size. These
   products differ from each other by exactly one word.
4. **Do not change anything anywhere.** This job is reading only. You are not
   editing the shop, not editing Fetaya, not placing anything in a cart.
5. **Work in batches of about 15 and report as you go**, so nothing is lost if the
   session ends. Partial results are useful; a lost hour is not.

---

## Report back in this shape

```
JOB 1
  Expo token created:        yes / no — <what happened>
  SHOPIFY_STORE:             set / already existed / failed — <detail>
  SHOPIFY_THEME_ID:          set / already existed / failed — <detail>
  SHOPIFY_CLI_THEME_TOKEN:   set / already existed / failed — <detail>
  EXPO_TOKEN:                set / already existed / failed — <detail>

JOB 2 — the preliminary question
  fetaya.com reachable in the browser:  yes / no
  Did you see the "עבור לדף המבוקש" interstitial:  yes / no
  Search by SKU 9169 works:             yes / no
  What it returned:                     <the product name you got, or nothing>
  Which method you used for the rest:   SKU search / name search / both

JOB 2 — results
  <the CSV back, with price_found and source_url filled where you were sure>

JOB 2 — the ones you did not fill
  <sku> — <why not: not found / two candidates / SKU did not appear on the page / …>

JOB 2 — counts
  Products checked:      <n> of 87
  Prices found:          <n>
  Left empty on purpose: <n>

ANYTHING THAT SURPRISED YOU
  <free text — if something about the site or the prices looked wrong, say it here>
```

## If you decide not to do part of this

Say which part and why, plainly, and do the rest. A refusal with a reason is more
useful than an attempt that guesses — and it has been the right call before in this
project.
