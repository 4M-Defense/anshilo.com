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
ASSETS = {os.path.basename(p) for p in walk("assets", tuple(""))} | {
    os.path.basename(p) for p in walk("assets", (".css", ".js", ".liquid", ".txt", ".json"))
}

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

BANNED_HEX = re.compile(r"#(?!fff\b|ffffff\b|000\b|000000\b)[0-9a-fA-F]{3,8}\b")
ALLOWED_HEX = {
    "#25d366",  # WhatsApp
    "#1877f2",  # Facebook
    "#ff0000",  # YouTube
    "#3d2600",  # readable text on the amber offer badge
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
    for open_tag, close_tag in BLOCK_TAGS:
        opens = len(re.findall(r"{%-?\s*" + open_tag + r"[\s%-]", src))
        closes = len(re.findall(r"{%-?\s*" + close_tag + r"\s*-?%}", src))
        if opens != closes:
            err(name, f"unbalanced {{% {open_tag} %}} ({opens}) vs {{% {close_tag} %}} ({closes})")

    # -- output tag inside a logic tag is always a bug
    if re.search(r"{%[^%]*{{", src):
        err(name, "found '{{' inside a '{% %}' tag")

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
                if ref not in block_ids and block.get if False else ref not in block_ids:
                    warn(name, f"block.settings.{ref} used but not declared in any block schema")
    elif path in SECTION_FILES:
        err(name, "section is missing a {% schema %} block")

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
