# Prompt for the browser Claude agent — grant two API scopes

One short task. Doing this once removes the need to paste theme files or policy
text through the agent ever again: Claude Code deploys directly from the repo.

---

You are in the Shopify admin for store `3007b3-4` (א.נ. שילו בע"מ, anshilo.com).

One task. Go to **Settings → Apps and sales channels → Develop apps**, and open
the custom app that is already installed there. If more than one exists, open the
one whose Admin API access token is in use — it currently has exactly two scopes,
`write_products` and `write_files`, which identifies it.

Open **Configuration → Admin API integration → Edit**, and add these two scopes to
the ones already selected. **Do not remove `write_products` or `write_files`.**

```
write_themes
write_files_legal_policies      ← if this exact name is not in the list, use:
write_legal_policies
```

The second one may appear under a slightly different label depending on the API
version. Search the scope list for `polic` and select the write-level scope for
shop policies. If no such scope exists at all, say so and skip it — the first one
is the important one.

Save. Shopify may show a banner about the app needing to be reinstalled or the
token being reissued.

**Then check whether the existing access token still works.** Go to **API
credentials**. If the Admin API access token is unchanged and still shown as
active, nothing more is needed. If Shopify says the token was revoked or asks you
to install the app again, click **Install app** / **Reinstall** and then report
that a new token exists — the token itself is generated fresh by Claude Code on
every run from the client id and secret, so a reissued token is fine as long as
the app is installed.

## Why

Claude Code has the theme, the policy text and several fixes ready in the repo but
cannot write them: the token carries products and files only. With `write_themes`
it can deploy the theme itself, including a draggable price filter that is finished
and waiting. Without it, every theme change has to be pasted file by file through
you.

## Report back

```
app opened:                  (name of the app)
scopes before:               (list them)
write_themes added:          yes / no
policy write scope added:    yes / no  — exact name of the scope you selected
saved successfully:          yes / no
token state after saving:    unchanged / reissued / app needed reinstall
reinstalled:                 yes / no / not needed
anything unexpected:
```

If the app cannot be edited, or the scope list does not contain `write_themes`,
stop and report exactly what you see rather than changing anything else.

---

## Not for the agent

If the scope is granted, deployment from the repo is
`themeFilesUpsert` against theme `shilov8theme`, per HANDOFF §3 — note that §3
still names theme id 148375371855 while the live theme is 148378648655.

Files waiting to deploy:

```
theme/snippets/facets.liquid           draggable price handles
theme/assets/section-collection.css    handle styling, 44px touch target
theme/assets/facets.js                 drag logic, RTL-aware
theme/sections/footer.liquid           cancellation-notice link in the theme row
theme/locales/he.default.json          label, Hebrew
theme/locales/en.json                  label, English
```
