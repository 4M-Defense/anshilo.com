#!/usr/bin/env python3
"""
Shilo Pro theme validator.

Static checks that catch the failure modes that actually break a Shopify theme
before it is deployed, plus the v2 design-contract rules.

Usage:  python3 theme/tools/validate.py [--strict]
Exit code 1 when any ERROR is found (warnings alone exit 0).
"""

from __future__ import annotations

import json
import os
import re
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ERRORS: list[str] = []
WARNINGS: list[str] = []


def err(path: str, msg: str) -> None:
    ERRORS.append(f"{path}: {msg}")


def warn(path: str, msg: str) -> None:
    WARNINGS.append(f"{path}: {msg}")


def rel(path: str) -> str:
    return os.path.relpath(path, os.path.dirname(ROOT))


def walk(subdir: str, exts: tuple[str, ...]) -> list[str]:
    base = os.path.join(ROOT, subdir)
    out: list[str] = []
    for dirpath, _dirs, files in os.walk(base):
        for name in files:
            if name.endswith(exts):
                out.append(os.path.join(dirpath, name))
    return sorted(out)


def read(path: str) -> str:
    with open(path, encoding="utf-8") as fh:
        return fh.read()


# --------------------------------------------------------------------------
# Inventories
# --------------------------------------------------------------------------

SNIPPETS = {
    os.path.splitext(os.path.basename(p))[0] for p in walk("snippets", (".liquid",))
}
SECTION_FILES = walk("sections", (".liquid",))
SECTION_TYPES = {os.path.splitext(os.path.basename(p))[0] for p in SECTION_FILES}
# There was an ASSETS inventory here. Two things were wrong with it: it was built
# with `walk("assets", tuple(""))`, and `tuple("")` is `()` while
# `str.endswith(())` is always False — so half of it was empty — and nothing in
# the file ever read the name. The real check is the os.path.exists lookup further
# down, which validates the actual on-disk path rather than a set of basenames.
# Removed rather than repaired: a populated-looking inventory that matches nothing
# is how a missing asset passes validation and 404s on the storefront.

ICON_NAMES: set[str] = set()
icon_path = os.path.join(ROOT, "snippets", "icon.liquid")
if os.path.exists(icon_path):
    ICON_NAMES = set(re.findall(r"when\s+'([a-z0-9-]+)'", read(icon_path)))

LOCALE_KEYS: set[str] = set()
locale_path = os.path.join(ROOT, "locales", "he.default.json")
if os.path.exists(locale_path):
    try:
        PLURAL_FORMS = {"zero", "one", "two", "few", "many", "other"}

        def flatten(node, prefix=""):
            if isinstance(node, dict):
                # A pluralisation group is itself an addressable key.
                if node and set(node).issubset(PLURAL_FORMS):
                    LOCALE_KEYS.add(prefix.rstrip("."))
                for k, v in node.items():
                    flatten(v, f"{prefix}{k}.")
            else:
                LOCALE_KEYS.add(prefix.rstrip("."))
        flatten(json.loads(read(locale_path)))
    except json.JSONDecodeError as exc:
        err(rel(locale_path), f"invalid JSON — {exc}")


# --------------------------------------------------------------------------
# 1. JSON files parse
# --------------------------------------------------------------------------

for path in walk("templates", (".json",)) + walk("config", (".json",)) + walk(
    "locales", (".json",)
) + walk("sections", (".json",)):
    try:
        json.loads(read(path))
    except json.JSONDecodeError as exc:
        err(rel(path), f"invalid JSON — {exc}")


# --------------------------------------------------------------------------
# 2. Exactly one default locale
# --------------------------------------------------------------------------

defaults = [
    os.path.basename(p) for p in walk("locales", (".json",)) if ".default." in os.path.basename(p)
]
schema_defaults = [d for d in defaults if ".schema." in d]
content_defaults = [d for d in defaults if ".schema." not in d]
if len(content_defaults) != 1:
    err("locales", f"expected exactly one *.default.json, found {content_defaults}")
if len(schema_defaults) > 1:
    err("locales", f"expected at most one *.default.schema.json, found {schema_defaults}")


# --------------------------------------------------------------------------
# 3. Liquid structure + schema validity + contract rules
# --------------------------------------------------------------------------

# Every filter Shopify Liquid actually ships (standard + Shopify extensions).
# A filter outside this set is almost always a Jekyll/Rails habit that fails
# silently at runtime — `push` and `sort_natural` on a string are classics.
KNOWN_FILTERS = {
    # strings
    "append", "prepend", "camelize", "capitalize", "downcase", "upcase", "escape",
    "escape_once", "handle", "handleize", "hmac_sha1", "hmac_sha256", "md5", "sha1",
    "sha256", "base64_encode", "base64_decode", "base64_url_safe_encode",
    "base64_url_safe_decode", "lstrip", "rstrip", "strip", "strip_html",
    "strip_newlines", "newline_to_br", "pluralize", "remove", "remove_first",
    "remove_last", "replace", "replace_first", "replace_last", "slice", "split",
    "truncate", "truncatewords", "url_encode", "url_decode", "url_escape",
    "url_param_escape", "encode_url_component", "decode_url_component",
    "highlight", "highlight_active_tag", "pad_spaces",
    # numbers / math
    "abs", "at_least", "at_most", "ceil", "divided_by", "floor", "minus", "modulo",
    "plus", "round", "times", "money", "money_with_currency",
    "money_without_currency", "money_without_trailing_zeros", "weight_with_unit",
    # arrays
    "compact", "concat", "find", "find_index", "first", "has", "join", "last", "map",
    "reject", "reverse", "size", "sort", "sort_natural", "sum", "uniq", "where",
    # dates / misc
    "date", "default", "json", "t", "inspect", "raw", "default_errors",
    "default_pagination", "format_address", "time_tag", "translate",
    "metafield_tag", "metafield_text", "brightness_difference", "color_brightness",
    "color_contrast", "color_darken", "color_desaturate", "color_difference",
    "color_extract", "color_lighten", "color_mix", "color_modify", "color_saturate",
    "color_to_hex", "color_to_hsl", "color_to_rgb", "hex_to_rgba",
    # urls / assets
    "asset_url", "asset_img_url", "file_url", "file_img_url", "global_asset_url",
    # inline_asset_content inlines a theme asset (used for SVG). Listed ahead of
    # first use: the Makita block documents dropping in an official vector wordmark
    # and inlining it, and without this that commit would trip a false "unknown
    # filter" error here.
    "inline_asset_content",
    "image_url", "img_url", "img_tag", "image_tag", "link_to", "link_to_type",
    "link_to_tag", "link_to_add_tag", "link_to_remove_tag", "link_to_vendor",
    "within", "shopify_asset_url", "customer_login_link", "customer_logout_link",
    "customer_register_link", "payment_type_svg_tag", "payment_button",
    "payment_terms", "placeholder_svg_tag", "script_tag", "stylesheet_tag",
    "external_video_tag", "external_video_url", "media_tag", "model_viewer_tag",
    "video_tag", "article_img_url", "collection_img_url", "product_img_url",
    "font_face", "font_modify", "font_url", "preload_tag", "structured_data",
    "class_list", "item_count_for_variant", "line_items_for", "sort_by",
    "camelcase", "avatar", "url_for_vendor", "url_for_type", "format_code",
    "currency_selector", "paginate", "default_errors",
}

BLOCK_TAGS = [
    ("if", "endif"),
    ("unless", "endunless"),
    ("for", "endfor"),
    ("case", "endcase"),
    ("form", "endform"),
    ("capture", "endcapture"),
    ("comment", "endcomment"),
    ("raw", "endraw"),
    ("schema", "endschema"),
    ("style", "endstyle"),
    ("javascript", "endjavascript"),
    ("stylesheet", "endstylesheet"),
    ("paginate", "endpaginate"),
    ("tablerow", "endtablerow"),
]

COMMENT_RE = re.compile(r"{%-?\s*comment\s*-?%}.*?{%-?\s*endcomment\s*-?%}", re.S)
# `{%- # inline comment -%}` — Liquid's shorthand comment tag.
INLINE_COMMENT_RE = re.compile(r"{%-?\s*#.*?-?%}", re.S)
LIQUID_TAG_RE = re.compile(r"{%-?\s*liquid\b(.*?)-?%}", re.S)


def strip_comments(src: str) -> str:
    """Blank out comment bodies, keeping newlines so line numbers survive."""

    def blank(match: re.Match) -> str:
        return re.sub(r"[^\n]", " ", match.group(0))

    return INLINE_COMMENT_RE.sub(blank, COMMENT_RE.sub(blank, src))


def strip_liquid_comments(body: str) -> str:
    """Inside a {% liquid %} tag, comments are `comment`/`endcomment` lines and
    `#` lines. Both can contain prose about tag syntax."""
    body = re.sub(r"(?ms)^\s*comment\b.*?^\s*endcomment\s*$", "", body)
    return re.sub(r"(?m)^\s*#.*$", "", body)


# Balanced inside a {% liquid %} body. `raw`, `schema`, `style` and friends cannot
# appear there at all, so the list is only the control-flow tags.
LIQUID_BODY_TAGS = [
    ("if", "endif"),
    ("unless", "endunless"),
    ("case", "endcase"),
    ("for", "endfor"),
    ("capture", "endcapture"),
    ("tablerow", "endtablerow"),
]

# (A BANNED_HEX pattern used to be compiled here and never referenced — the
# colour checks below use ALLOWED_HEX against an inline literal.)
# Colours that deliberately are NOT tokens. Everything here has a reason a CSS
# custom property cannot serve, so --strict can be a CI gate: a genuinely new
# hardcoded colour still fails the build.
ALLOWED_HEX = {
    "#25d366",  # WhatsApp
    "#1877f2",  # Facebook
    "#ff0000",  # YouTube
    "#3d2600",  # readable text on the amber offer badge
    # layout/theme.liquid and layout/password.liquid are where the tokens are
    # DEFINED, so these two are the fallbacks behind --color-on-ink and
    # --color-tile-bg. Referencing the property there would be circular.
    "#eef1f6",  # --color-on-ink fallback
    "#efe9df",  # --color-tile-bg fallback (settings.color_tile_bg default)
    # The high-contrast link colour in the accessibility widget must be the
    # universally recognised link blue, not the brand accent — the whole point of
    # a11y-contrast is to override the theme's palette.
    "#0000ee",
    # Print stylesheet: paper has no theme, and the tokens resolve to screen
    # colours that do not survive a monochrome printer.
    "#ccc",
}

LIQUID_FILES = (
    walk("sections", (".liquid",))
    + walk("snippets", (".liquid",))
    + walk("layout", (".liquid",))
    + walk("templates", (".liquid",))
)

used_snippets: dict[str, set[str]] = defaultdict(set)
used_icons: dict[str, set[str]] = defaultdict(set)
used_assets: dict[str, set[str]] = defaultdict(set)
used_keys: dict[str, set[str]] = defaultdict(set)

for path in LIQUID_FILES:
    name = rel(path)
    src = read(path)

    # -- balanced block tags
    #
    # Two things had to be carved out of this check before it meant anything.
    #
    # 1. {% comment %} bodies. A comment that WRITES ABOUT tag syntax — this file
    #    is full of comments explaining why a {% capture %} or a {% form %} is
    #    shaped the way it is — was counted as an opening tag, so documenting the
    #    code broke the build. Prose is not code.
    #
    # 2. {% liquid %} bodies. Inside a {% liquid %} tag, control flow is written
    #    WITHOUT the {% %} delimiters, so neither regex matched any of it and this
    #    check was blind to the majority of the theme's branching: snippets/
    #    facets.liquid has 14 if/endif pairs in markup and 17 more inside liquid
    #    tags, and for case/endcase the check was a total no-op in five files.
    #    Merging the two tallies would be worse than the blind spot — an unclosed
    #    markup `if` could cancel against an `endif` inside a liquid tag and turn a
    #    real error invisible — so each liquid body is balanced as its own scope.
    markup = strip_comments(src)
    liquid_bodies = [m.group(1) for m in LIQUID_TAG_RE.finditer(markup)]
    markup_only = LIQUID_TAG_RE.sub("", markup)

    for open_tag, close_tag in BLOCK_TAGS:
        opens = len(re.findall(r"{%-?\s*" + open_tag + r"[\s%-]", markup_only))
        closes = len(re.findall(r"{%-?\s*" + close_tag + r"\s*-?%}", markup_only))
        if opens != closes:
            err(name, f"unbalanced {{% {open_tag} %}} ({opens}) vs {{% {close_tag} %}} ({closes})")

    for index, body in enumerate(liquid_bodies, start=1):
        # Inside a {% liquid %} tag every statement is on its own line, so the
        # keyword is anchored to the start of a (stripped) line.
        bare = strip_liquid_comments(body)
        for open_tag, close_tag in LIQUID_BODY_TAGS:
            opens = len(re.findall(r"(?m)^\s*" + open_tag + r"\b", bare))
            closes = len(re.findall(r"(?m)^\s*" + close_tag + r"\s*$", bare))
            if opens != closes:
                err(
                    name,
                    f"unbalanced `{open_tag}` ({opens}) vs `{close_tag}` ({closes}) "
                    f"inside {{% liquid %}} block #{index}",
                )

    # -- output tag inside a logic tag is always a bug
    if re.search(r"{%[^%]*{{", src):
        err(name, "found '{{' inside a '{% %}' tag")

    # -- a literal brace inside an output tag breaks Shopify's Liquid lexer: it
    #    scans for the first '}}' and gives up. Shopify's own theme-check does
    #    NOT catch this, but the Admin API rejects the file outright.
    for m in re.finditer(r"\{\{(.{0,300}?)\}\}", src, re.S):
        inner = m.group(1)
        if "{" in inner:
            line = src[: m.start()].count("\n") + 1
            err(name, f"line {line}: literal '{{' inside a {{{{ }}}} output tag — Shopify will reject the file")

    # -- schema block must be valid JSON, and setting ids must be unique
    schema_match = re.search(r"{%-?\s*schema\s*-?%}(.*?){%-?\s*endschema\s*-?%}", src, re.S)
    if schema_match:
        raw = schema_match.group(1)
        try:
            schema = json.loads(raw)
        except json.JSONDecodeError as exc:
            err(name, f"invalid {{% schema %}} JSON — {exc}")
            schema = None
        if isinstance(schema, dict):
            ids = [s.get("id") for s in schema.get("settings", []) if s.get("id")]
            dupes = {i for i in ids if ids.count(i) > 1}
            if dupes:
                err(name, f"duplicate setting ids in schema: {sorted(dupes)}")
            declared = set(ids)
            # every section.settings.X referenced must be declared
            for ref in set(re.findall(r"section\.settings\.([a-zA-Z0-9_]+)", src)):
                if ref not in declared:
                    err(name, f"section.settings.{ref} used but not declared in schema")
            # every block setting referenced must be declared on some block type
            block_ids = set()
            for block in schema.get("blocks", []):
                for s in block.get("settings", []) or []:
                    if s.get("id"):
                        block_ids.add(s["id"])
            for ref in set(re.findall(r"block\.settings\.([a-zA-Z0-9_]+)", src)):
                # Was `if ref not in block_ids and block.get if False else ref not
                # in block_ids:` — a conditional expression whose left operand is
                # unreachable, and which referenced the loop variable `block`, so
                # "fixing" the odd `if False` would have raised NameError on the
                # first section that declares no blocks and aborted the deploy
                # under set -e.
                if ref not in block_ids:
                    warn(name, f"block.settings.{ref} used but not declared in any block schema")
    elif path in SECTION_FILES:
        err(name, "section is missing a {% schema %} block")

    # -- filters must exist in Shopify Liquid
    # A single pipe only — `||` is JavaScript, not a Liquid filter.
    for filt in set(re.findall(r"(?<![|!<>=])\|(?!\|)\s*([a-z_][a-z0-9_]*)", src)):
        if filt not in KNOWN_FILTERS:
            err(name, f"unknown Liquid filter '| {filt}'")

    # -- referenced snippets / icons / assets / locale keys
    for snip in re.findall(r"{%-?\s*render\s+'([a-z0-9_-]+)'", src):
        used_snippets[snip].add(name)
    for snip in re.findall(r"{%-?\s*include\s+'([a-z0-9_-]+)'", src):
        used_snippets[snip].add(name)
    for icon in re.findall(r"render\s+'icon'\s*,\s*name:\s*'([a-z0-9-]+)'", src):
        used_icons[icon].add(name)
    for asset in re.findall(r"'([A-Za-z0-9_.-]+\.(?:css|js))'\s*\|\s*asset_url", src):
        used_assets[asset].add(name)
    for key in re.findall(r"'([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)'\s*\|\s*t\b", src):
        used_keys[key].add(name)

    # -- contract: no hazard motif
    if "hazard" in src and "snippets/icon.liquid" not in name:
        err(name, "contains a banned 'hazard' motif reference")

    # -- contract: no hardcoded colours in Liquid markup.
    # gift_card.liquid renders with {% layout none %}, so the theme's :root token
    # block is not available to it — literal colours there are correct.
    if "gift_card.liquid" in name:
        continue

    for match in set(re.findall(r"#[0-9a-fA-F]{3,8}\b", src)):
        low = match.lower()
        if low in {"#fff", "#ffffff", "#000", "#000000"} or low in ALLOWED_HEX:
            continue
        # ignore anchors/ids and Liquid-generated fragments
        warn(name, f"hardcoded colour {match} — should use a CSS custom property")

# -- unresolved references
for snip, users in sorted(used_snippets.items()):
    if snip not in SNIPPETS:
        err(", ".join(sorted(users)), f"renders missing snippet '{snip}'")

for icon, users in sorted(used_icons.items()):
    if ICON_NAMES and icon not in ICON_NAMES:
        err(", ".join(sorted(users)), f"uses missing icon '{icon}'")

for asset, users in sorted(used_assets.items()):
    if not os.path.exists(os.path.join(ROOT, "assets", asset)):
        err(", ".join(sorted(users)), f"references missing asset '{asset}'")

for key, users in sorted(used_keys.items()):
    if LOCALE_KEYS and key not in LOCALE_KEYS:
        err(", ".join(sorted(users)), f"uses missing translation key '{key}'")


# --------------------------------------------------------------------------
# 4. CSS contract
# --------------------------------------------------------------------------

for path in walk("assets", (".css",)):
    name = rel(path)
    src = read(path)

    if "hazard" in src and "base.css" not in name:
        err(name, "contains a banned 'hazard' motif reference")

    if re.search(r"#F97316|#EA580C", src, re.I):
        err(name, "contains the retired v1 orange accent")

    for match in set(re.findall(r"#[0-9a-fA-F]{3,8}\b", src)):
        low = match.lower()
        if low in {"#fff", "#ffffff", "#000", "#000000"} or low in ALLOWED_HEX:
            continue
        warn(name, f"hardcoded colour {match} — should use a CSS custom property")

    opens = src.count("{")
    closes = src.count("}")
    if opens != closes:
        err(name, f"unbalanced braces ({opens} open, {closes} close)")


# --------------------------------------------------------------------------
# 5. Templates reference real sections
# --------------------------------------------------------------------------

for path in walk("templates", (".json",)) + walk("sections", (".json",)):
    name = rel(path)
    try:
        data = json.loads(read(path))
    except json.JSONDecodeError:
        continue
    sections = data.get("sections", {}) or {}
    for key, node in sections.items():
        stype = (node or {}).get("type")
        if stype and stype not in SECTION_TYPES:
            err(name, f"section '{key}' references missing section type '{stype}'")
    order = data.get("order") or []
    for key in order:
        if key not in sections:
            err(name, f"order lists '{key}' which is not defined in sections")
    for key in sections:
        if order and key not in order:
            warn(name, f"section '{key}' is defined but missing from order")


# --------------------------------------------------------------------------
# 6. settings_data ids exist in settings_schema
# --------------------------------------------------------------------------

schema_file = os.path.join(ROOT, "config", "settings_schema.json")
data_file = os.path.join(ROOT, "config", "settings_data.json")
if os.path.exists(schema_file) and os.path.exists(data_file):
    try:
        schema = json.loads(read(schema_file))
        data = json.loads(read(data_file))
        declared = set()
        for group in schema:
            for setting in group.get("settings", []) or []:
                if setting.get("id"):
                    declared.add(setting["id"])
        current = (data.get("current") or {})
        # A setting declared with an empty-string default makes Shopify reject the
        # WHOLE schema file and silently replace it with "[]", which strips every
        # colour, font and token from the theme. Omit `default` instead.
        for group in schema:
            for setting in group.get("settings", []) or []:
                if setting.get("default") == "":
                    err(
                        "config/settings_schema.json",
                        f"setting '{setting.get('id')}' has an empty \"default\" — "
                        "Shopify rejects the entire schema; omit the key instead",
                    )

        for key in current:
            if key == "blocks":
                continue
            if key not in declared:
                warn("config/settings_data.json", f"'{key}' is not declared in settings_schema.json")
        # every setting referenced in Liquid must be declared
        referenced = set()
        # Global theme settings only — exclude section.settings.X / block.settings.X.
        global_setting = re.compile(r"(?<![.\w])settings\.([a-zA-Z0-9_]+)")
        for path in LIQUID_FILES + walk("assets", (".liquid",)):
            referenced |= set(global_setting.findall(read(path)))
        for ref in sorted(referenced):
            if ref not in declared:
                err("config/settings_schema.json", f"settings.{ref} is used in Liquid but not declared")
    except json.JSONDecodeError:
        pass


# --------------------------------------------------------------------------
# 7. Colour contrast (WCAG 2.1 AA) on the palette in settings_data.json
#
# The palette is a legal matter for an Israeli storefront, not only a design
# one, and two pairs did fail once: the in-stock green sat at 4.41:1 on white
# (it appears on every product card) and the input border at 1.50:1 against
# 3.00 required by 1.4.11 for UI component boundaries.
# --------------------------------------------------------------------------


def _luminance(hex_colour: str) -> float:
    h = hex_colour.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    channels = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    linear = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def _contrast(a: str, b: str) -> float:
    la, lb = _luminance(a), _luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


# (label, foreground setting, background setting, minimum ratio)
# 4.5 = AA body text; 3.0 = AA large text and non-text UI boundaries.
CONTRAST_PAIRS = [
    ("body text on card", "color_text", "color_background", 4.5),
    ("body text on catalogue canvas", "color_text", "color_page", 4.5),
    ("body text on alt section", "color_text", "color_surface_alt", 4.5),
    ("muted text on card", "color_text_muted", "color_background", 4.5),
    ("muted text on catalogue canvas", "color_text_muted", "color_page", 4.5),
    ("muted text on alt section", "color_text_muted", "color_surface_alt", 4.5),
    ("price / accent on card", "color_accent", "color_background", 4.5),
    ("in-stock on card", "color_success", "color_background", 4.5),
    ("in-stock on catalogue canvas", "color_success", "color_page", 4.5),
    ("low stock on card", "color_warning", "color_background", 4.5),
    ("error / sold out on card", "color_danger", "color_background", 4.5),
    ("sale price on card", "color_sale", "color_background", 4.5),
    ("heading ink on card (large)", "color_ink", "color_background", 3.0),
    ("input border vs card", "color_border_strong", "color_background", 3.0),
    ("input border vs canvas", "color_border_strong", "color_page", 3.0),
]

if os.path.exists(data_file):
    try:
        palette = (json.loads(read(data_file)).get("current") or {})
    except json.JSONDecodeError:
        palette = {}

    for label, fg_key, bg_key, need in CONTRAST_PAIRS:
        fg, bg = palette.get(fg_key), palette.get(bg_key)
        if not (isinstance(fg, str) and isinstance(bg, str)):
            continue
        if not (fg.startswith("#") and bg.startswith("#")):
            continue
        got = _contrast(fg, bg)
        if got + 0.005 < need:
            err(
                "config/settings_data.json",
                f"contrast {got:.2f}:1 for {label} ({fg_key} {fg} on {bg_key} {bg}) "
                f"— WCAG AA needs {need:.1f}:1",
            )

    # White text sits on the accent and ink buttons; both must clear AA.
    for label, bg_key in (("white on accent button", "color_accent"),
                          ("white on accent hover", "color_accent_hover"),
                          ("white on ink surface", "color_ink")):
        bg = palette.get(bg_key)
        if isinstance(bg, str) and bg.startswith("#"):
            got = _contrast("#FFFFFF", bg)
            if got + 0.005 < 4.5:
                err("config/settings_data.json",
                    f"contrast {got:.2f}:1 for {label} ({bg_key} {bg}) — WCAG AA needs 4.5:1")


# --------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------

strict = "--strict" in sys.argv

print(f"theme validator — {len(LIQUID_FILES)} liquid files, {len(SECTION_TYPES)} sections, "
      f"{len(SNIPPETS)} snippets, {len(ICON_NAMES)} icons, {len(LOCALE_KEYS)} locale keys")
print()

if ERRORS:
    print(f"ERRORS ({len(ERRORS)})")
    for line in ERRORS:
        print(f"  ✗ {line}")
    print()

if WARNINGS:
    print(f"WARNINGS ({len(WARNINGS)})")
    for line in WARNINGS:
        print(f"  ! {line}")
    print()

if not ERRORS and not WARNINGS:
    print("clean — no errors, no warnings")
elif not ERRORS:
    print(f"no errors ({len(WARNINGS)} warnings)")

sys.exit(1 if ERRORS or (strict and WARNINGS) else 0)
