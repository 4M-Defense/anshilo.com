#!/usr/bin/env python3
"""
Device-adaptation checker for the Shilo storefront and the Shilo Shop app.

Asks one question in many forms: does the layout still work at a width nobody
tested it at? Phones from 320px, foldables, iPad portrait and landscape, Split
View, and desktop up to 1920.

Usage:  python3 tools/responsive-check.py [--strict]
Exit code 1 when any FAIL is found (warnings alone exit 0).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
THEME = os.path.join(ROOT, "theme")
APP = os.path.join(ROOT, "mobile-app")

FAILURES: list[tuple[str, str, str]] = []
WARNINGS: list[tuple[str, str, str]] = []
PASSES: list[str] = []


def fail(rule: str, where: str, msg: str) -> None:
    FAILURES.append((rule, where, msg))


def warn(rule: str, where: str, msg: str) -> None:
    WARNINGS.append((rule, where, msg))


def ok(msg: str) -> None:
    PASSES.append(msg)


def rel(path: str) -> str:
    return os.path.relpath(path, ROOT)


def read(path: str) -> str:
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def walk(base: str, exts: tuple[str, ...]) -> list[str]:
    out: list[str] = []
    for dirpath, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if d not in ("node_modules", ".expo", "dist", ".git")]
        for name in files:
            if name.endswith(exts):
                out.append(os.path.join(dirpath, name))
    return sorted(out)


def line_of(text: str, index: int) -> int:
    return text.count("\n", 0, index) + 1


# The widths that actually reach the shop, smallest to largest.
DEVICES = [
    ("iPhone SE", 320), ("iPhone 13 mini", 375), ("iPhone 15", 393),
    ("Galaxy S24", 412), ("iPhone 15 Pro Max", 430), ("Split View חצי", 507),
    ("Fold פתוח", 673), ("iPad mini לאורך", 744), ("iPad 10.9 לאורך", 820),
    ("iPad Pro 11 לאורך", 834), ("iPad mini לרוחב", 1133),
    ("iPad 10.9 לרוחב", 1180), ("iPad Pro 12.9 לרוחב", 1366), ("Desktop", 1920),
]


# ---------------------------------------------------------------------------
# Theme
# ---------------------------------------------------------------------------

def check_viewport() -> None:
    layout = os.path.join(THEME, "layout", "theme.liquid")
    if not os.path.exists(layout):
        fail("viewport", "theme/layout/theme.liquid", "layout missing")
        return
    src = read(layout)
    m = re.search(r'<meta\s+name="viewport"[^>]*content="([^"]*)"', src)
    if not m:
        fail("viewport", rel(layout), "no viewport meta tag; phones will render at desktop width")
        return

    content = m.group(1)
    if "width=device-width" not in content:
        fail("viewport", rel(layout), f"viewport does not set width=device-width: {content}")
    if "user-scalable=no" in content.replace(" ", ""):
        fail("viewport", rel(layout), "viewport blocks pinch zoom (user-scalable=no)")
    max_scale = re.search(r"maximum-scale=([\d.]+)", content)
    if max_scale and float(max_scale.group(1)) < 2:
        fail("viewport", rel(layout), f"viewport caps zoom at {max_scale.group(1)}x; readers need at least 2x")
    if not FAILURES:
        ok("viewport meta is set for device width and still allows pinch zoom")


def check_theme_widths() -> None:
    """A fixed width wider than the smallest phone forces sideways scrolling."""
    SMALLEST = 320
    for path in walk(os.path.join(THEME, "assets"), (".css",)):
        raw = read(path)
        src = re.sub(r"/\*.*?\*/", lambda m: " " * len(m.group(0)), raw, flags=re.S)

        # Track which byte ranges sit inside a min-width media query, where a
        # large fixed width is intentional.
        guarded: list[tuple[int, int]] = []
        for m in re.finditer(r"@media[^{]*min-width:\s*(\d+)px[^{]*\{", src):
            if int(m.group(1)) < SMALLEST:
                continue
            depth, i = 1, m.end()
            while i < len(src) and depth:
                if src[i] == "{":
                    depth += 1
                elif src[i] == "}":
                    depth -= 1
                i += 1
            guarded.append((m.start(), i))

        for m in re.finditer(r"(?<![-\w])(?:width|inline-size)\s*:\s*(\d+)px", src):
            value = int(m.group(1))
            if value <= SMALLEST:
                continue
            if any(a <= m.start() <= b for a, b in guarded):
                continue
            warn("fixed-width", f"{rel(path)}:{line_of(raw, m.start())}",
                 f"fixed width of {value}px outside any min-width query; at 320px this overflows")

    ok(f"stylesheets scanned for fixed widths that would overflow a {SMALLEST}px phone")


def check_theme_breakpoints() -> None:
    """A grid that jumps straight from phone to desktop leaves tablets broken."""
    css_files = walk(os.path.join(THEME, "assets"), (".css",))
    tablet_band = False
    for path in css_files:
        src = read(path)
        for m in re.finditer(r"@media[^{]*min-width:\s*(\d+)px", src):
            if 700 <= int(m.group(1)) <= 1000:
                tablet_band = True
                break
    if tablet_band:
        ok("the theme defines a tablet breakpoint between phone and desktop")
    else:
        fail("breakpoints", "theme/assets/",
             "no breakpoint between 700px and 1000px; iPad portrait would get the phone layout")


def check_theme_overflow_guards() -> None:
    """Wide content needs its own scroll container, not the page's."""
    base = os.path.join(THEME, "assets", "base.css")
    if os.path.exists(base) and "overflow-x: auto" in read(base):
        ok("wide content (tables and rails) scrolls inside its own container")
    else:
        warn("overflow", "theme/assets/base.css",
             "no overflow-x guard found; a wide table would scroll the whole page sideways")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

def check_app_dimensions() -> None:
    """Dimensions.get() is read once and never updates on rotation or resize."""
    hits = 0
    for path in walk(os.path.join(APP, "app"), (".tsx",)) + walk(os.path.join(APP, "src"), (".tsx", ".ts")):
        src = read(path)
        for m in re.finditer(r"Dimensions\.get\(", src):
            hits += 1
            fail("rn-dimensions", f"{rel(path)}:{line_of(src, m.start())}",
                 "Dimensions.get() is captured once, so the layout will not follow a rotation, "
                 "a Split View resize or a foldable opening; use useWindowDimensions()")
    if not hits:
        ok("the app reads its size through useWindowDimensions, so it follows rotation and resizing")


def check_app_grid() -> None:
    """A hard-coded column count turns iPad landscape into two enormous tiles."""
    for path in walk(os.path.join(APP, "app"), (".tsx",)):
        src = read(path)
        for m in re.finditer(r"numColumns\s*=\s*\{\s*(\d+)\s*\}", src):
            fail("rn-columns", f"{rel(path)}:{line_of(src, m.start())}",
                 f"numColumns is fixed at {m.group(1)}; on a tablet each card stretches to fill half "
                 f"the screen. Derive it from the window width (see productGrid in src/theme.ts)")

        # A changing column count must change the list's key, or React Native
        # refuses to re-render and throws instead.
        for m in re.finditer(r"numColumns\s*=\s*\{\s*(\w+)\s*\}", src):
            name = m.group(1)
            if name.isdigit():
                continue
            window = src[max(0, m.start() - 300):m.start() + 300]
            if not re.search(r"key\s*=\s*\{\s*" + re.escape(name) + r"\s*\}", window):
                fail("rn-columns-key", f"{rel(path)}:{line_of(src, m.start())}",
                     f"numColumns={{{name}}} changes at runtime but the list has no key={{{name}}}; "
                     f"React Native throws when numColumns changes without a new key")


def check_app_tablet_config() -> None:
    path = os.path.join(APP, "app.json")
    if not os.path.exists(path):
        fail("app-config", "mobile-app/app.json", "app.json missing")
        return
    expo = json.load(open(path, encoding="utf-8")).get("expo", {})
    orientation = expo.get("orientation")
    supports_tablet = expo.get("ios", {}).get("supportsTablet", False)
    requires_full = expo.get("ios", {}).get("requireFullScreen", False)

    if supports_tablet and orientation == "portrait" and not requires_full:
        fail("ipad-orientation", "mobile-app/app.json",
             "the app declares iPad support but locks itself to portrait. An iPad app that can be "
             "placed in Split View is expected to handle every orientation; set orientation to "
             "'default', or declare ios.requireFullScreen to opt out of multitasking")
    elif supports_tablet and orientation == "default":
        ok("iPad support is declared and the app rotates with the device")
    elif supports_tablet and requires_full:
        ok("iPad support is declared and multitasking is explicitly opted out of")

    if not supports_tablet:
        warn("ipad-orientation", "mobile-app/app.json",
             "ios.supportsTablet is off, so iPad users get a scaled-up phone app")


def check_product_grid_math() -> None:
    """Run the app's own column formula over every device width we care about."""
    theme_path = os.path.join(APP, "src", "theme.ts")
    if not os.path.exists(theme_path):
        warn("grid-math", "mobile-app/src/theme.ts", "theme.ts missing; skipped grid maths")
        return
    src = read(theme_path)

    target = re.search(r"TARGET_CARD\s*=\s*(\d+)", src)
    if not target:
        warn("grid-math", rel(theme_path), "productGrid not found; skipped grid maths")
        return

    target_card = int(target.group(1))
    lg = int(re.search(r"lg:\s*(\d+)", src).group(1))
    md = int(re.search(r"md:\s*(\d+)", src).group(1))

    MIN_CARD, MAX_CARD = 120, 320
    worst = []
    for name, width in DEVICES:
        usable = width - lg * 2
        fits = (usable + md) // (target_card + md)
        columns = max(2, min(6, fits))
        card = (usable - md * (columns - 1)) / columns
        if not (MIN_CARD <= card <= MAX_CARD):
            worst.append(f"{name} ({width}px) → {columns} עמודות, כרטיס {card:.0f}px")

    if worst:
        fail("grid-math", "mobile-app/src/theme.ts",
             "the column formula produces cards outside the readable "
             f"{MIN_CARD}–{MAX_CARD}px range: " + "; ".join(worst))
    else:
        ok(f"the column formula keeps every card between {MIN_CARD} and {MAX_CARD}px "
           f"across all {len(DEVICES)} device widths")


def main() -> int:
    parser = argparse.ArgumentParser(description="Device-adaptation checker")
    parser.add_argument("--strict", action="store_true", help="treat warnings as failures")
    args = parser.parse_args()

    check_viewport()
    check_theme_widths()
    check_theme_breakpoints()
    check_theme_overflow_guards()
    check_app_dimensions()
    check_app_grid()
    check_app_tablet_config()
    check_product_grid_math()

    print("=" * 74)
    print("בדיקת התאמה למכשירים — טלפון, טאבלט, מסך מפוצל, שולחני")
    print("=" * 74)

    if FAILURES:
        print(f"\nכשלים ({len(FAILURES)}):\n")
        for rule, where, msg in FAILURES:
            print(f"  [{rule}] {where}\n      {msg}")

    if WARNINGS:
        print(f"\nאזהרות ({len(WARNINGS)}):\n")
        for rule, where, msg in WARNINGS:
            print(f"  [{rule}] {where}\n      {msg}")

    print(f"\nעבר: {len(PASSES)}   כשל: {len(FAILURES)}   אזהרות: {len(WARNINGS)}\n")
    for line in PASSES:
        print(f"  ✓ {line}")

    print("\nבדיקה סטטית. רינדור אמיתי על מכשיר, גלישה לרוחב בעמוד חי")
    print("וסיבוב מסך — עדיין דורשים בדיקה על מכשיר או סימולטור.")

    return 1 if FAILURES or (args.strict and WARNINGS) else 0


if __name__ == "__main__":
    sys.exit(main())
