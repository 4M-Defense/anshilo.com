# Snapshot of the published theme — 2026-08-04

`theme/` is a verbatim, byte-exact copy of the **published** Shopify theme
`shilov8theme` (`gid://shopify/OnlineStoreTheme/148378648655`, role `MAIN`) as it
stood on 2026-08-04. 137 files, 1,295,235 bytes.

## Why this exists

The published theme had drifted from every branch in this repository, in both
directions, and part of it existed **nowhere else**. A comparison against
`claude/new-session-b4nc0o` on the day of the snapshot found:

- **55 of 130** comparable files differing.
- **0 of 34** round-8 files present on the live theme — none of that work is deployed.
- **21** files carrying live-side changes no branch contains, several large
  (`assets/section-image-banner.css` +8,899 B, `assets/section-page.css` +5,687 B,
  `assets/section-header.css` +4,852 B, `templates/index.json` +4,383 B).
- **5 files that existed only on the live theme**, the largest being
  `snippets/ai-assistant.liquid` — 33 KB, the "המומחה של שילו" assistant widget —
  plus `snippets/legal-nav.liquid`, `templates/policy.liquid`,
  `templates/page.about.json` and `assets/section-rich-text.css`.

The live `layout/theme.liquid` renders `{% render 'ai-assistant' %}` and
`{% render 'legal-nav' %}`; the repo's copy of that layout mentions neither. So a
deploy from any branch would have removed both features from the storefront, and a
deploy with deletes would have destroyed the only copy of that code. **That risk is
what this directory removes.** `HANDOFF.md` §5 claimed "no known delta"; that was
wrong, and the numbers above replace it.

## Verifying it, now or in five years

Every file is byte-identical to the bytes Shopify itself stores, proven against the
API's own `checksumMd5` for all 137 files:

```bash
cd live-theme-snapshot/theme && md5sum -c ../expected.md5   # expect: 137 OK, exit 0
```

`verify.txt` is the full per-file table: filename, expected md5, computed md5, byte
length, the API's reported `size`, OK/FAIL, and which normalization each file needed.
Two independent confirmations back it up: the byte total equals the sum of Shopify's
137 `size` fields exactly, and the check above was run by the system `md5sum` binary
re-reading the files from disk rather than by the code that wrote them.

`.gitattributes` pins text files to LF and marks the six `woff2` fonts binary. Do not
remove it — without it a checkout on Windows would rewrite line endings and every
checksum above would fail.

## One thing to know before comparing or restoring

The Admin API does **not** hand back what Shopify stores for JSON files. It injects a
`/* auto-generated */` header comment and re-indents. 28 files are affected, and each
was reversed back to stored form here, with the md5 selecting the transform per file
rather than a hardcoded list:

| what the API added | files | reversed by |
|---|---|---|
| 363-byte header ("theme editor") | 23 | stripping the header |
| 366-byte header ("language editor") | 2 — both locales | stripping the header |
| header + pretty-printing + `\/` unescaping | 2 — `config/settings_data.json`, `templates/index.json` | strip, re-minify, re-escape slashes |
| pretty-printing only (no header) | 1 — `config/settings_schema.json` | re-minify |

This matters in two ways. **Comparing:** these files are in the same shape the repo
stores them in, so `diff -r live-theme-snapshot/theme theme` is apples to apples.
**Restoring:** uploading them back through `themeFilesUpsert` is safe — Shopify
re-adds the header itself. Do not hand-edit them; a header added by hand will not
match the checksums.

## What this is not

A snapshot, not a merge. Reconciling the live theme with round 8's fixes is still
open, and one part of it is genuinely delicate: the live `assets/global.js` identifies
cart lines by **line item key** (`dataset.key`) while round 8 identifies them by
**line index** (`dataset.line`). Each version is internally consistent with its own
cart markup; deploying a mixture breaks removing items and changing quantities. That
merge needs a browser to validate, which no session has had — the agent proxy blocks
`anshilo.com`.
