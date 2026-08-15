#!/usr/bin/env python3
"""
Accessibility checker for the Shilo storefront and the Shilo Shop app.

Checks the rules from ת"י 5568, which adopts WCAG 2.0 level AA — the standard
Israeli regulation points businesses at. Static analysis only: it reads the
Liquid, CSS and TSX sources and reports what can be decided from the source.

What it cannot decide, and what still needs a human with a screen reader:
reading order, whether alt text is *meaningful*, focus order through a live
page, and anything that only exists once JavaScript has run.

Usage:  python3 tools/a11y-check.py [--strict]
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


def walk(base: str, exts: tuple[str, ...], skip: tuple[str, ...] = ()) -> list[str]:
    out: list[str] = []
    for dirpath, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if d not in ("node_modules", ".expo", "dist", ".git")]
        for name in files:
            if name.endswith(exts) and not any(s in name for s in skip):
                out.append(os.path.join(dirpath, name))
    return sorted(out)


def line_of(text: str, index: int) -> int:
    return text.count("\n", 0, index) + 1


# ---------------------------------------------------------------------------
# Contrast — WCAG 2.0 AA: 4.5:1 for body text, 3:1 for large text and for the
# visual boundary of interactive controls.
# ---------------------------------------------------------------------------

def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def luminance(hex_color: str) -> float:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return 0.2126 * srgb_to_linear(r) + 0.7152 * srgb_to_linear(g) + 0.0722 * srgb_to_linear(b)


def contrast(fg: str, bg: str) -> float:
    a, b = luminance(fg), luminance(bg)
    lighter, darker = max(a, b), min(a, b)
    return (lighter + 0.05) / (darker + 0.05)


def check_contrast() -> None:
    """Every colour pair the theme actually paints, measured."""
    settings_path = os.path.join(THEME, "config", "settings_data.json")
    if not os.path.exists(settings_path):
        warn("contrast", rel(settings_path), "settings_data.json missing; skipped contrast")
        return

    # Shopify allows `/* … */` in theme JSON and its admin writes an
    # auto-generated header in that form, so strict parsing rejects a file the
    # platform itself produced. Strip the comments as Shopify does.
    raw = read(settings_path)
    try:
        settings = json.loads(raw)
    except json.JSONDecodeError:
        try:
            settings = json.loads(re.sub(r"/\*.*?\*/", "", raw, flags=re.S))
        except json.JSONDecodeError as exc:
            fail("contrast", rel(settings_path), f"settings_data.json will not parse — {exc}")
            return
    current = settings.get("current", {})
    if not isinstance(current, dict):
        warn("contrast", rel(settings_path), "unexpected settings shape; skipped contrast")
        return

    def c(key: str, default: str) -> str:
        val = current.get(key, default)
        return val if isinstance(val, str) and val.startswith("#") else default

    bg = c("color_background", "#FFFFFF")
    page = c("color_page", "#F4F6F9")
    surface_alt = c("color_surface_alt", "#F7F9FC")
    surface_sunken = c("color_surface_sunken", "#EDF1F6")
    ink = c("color_ink", "#0F1729")
    text = c("color_text", "#16202F")
    muted = c("color_text_muted", "#5B6779")
    accent = c("color_accent", "#D81E29")
    highlight = c("color_highlight", "#FFB224")
    success = c("color_success", "#0B7A46")
    warning_col = c("color_warning", "#B45309")
    danger = c("color_danger", "#C81E1E")
    border_strong = c("color_border_strong", "#848E9F")

    # (label, foreground, background, minimum ratio, is_text)
    pairs = [
        ("body text on page background", text, bg, 4.5, True),
        ("body text on tinted page", text, page, 4.5, True),
        ("body text on alt surface", text, surface_alt, 4.5, True),
        ("body text on sunken surface", text, surface_sunken, 4.5, True),
        ("muted text on page background", muted, bg, 4.5, True),
        ("muted text on tinted page", muted, page, 4.5, True),
        ("muted text on alt surface", muted, surface_alt, 4.5, True),
        ("muted text on sunken surface", muted, surface_sunken, 4.5, True),
        ("accent text on page background", accent, bg, 4.5, True),
        ("white text on accent button", bg, accent, 4.5, True),
        ("white text on ink surface", bg, ink, 4.5, True),
        ("success text on page background", success, bg, 4.5, True),
        ("warning text on page background", warning_col, bg, 4.5, True),
        ("danger text on page background", danger, bg, 4.5, True),
        ("highlight value on ink surface", highlight, ink, 4.5, True),
        ("strong border against page", border_strong, bg, 3.0, False),
    ]

    for label, fg, back, minimum, is_text in pairs:
        ratio = contrast(fg, back)
        kind = "text" if is_text else "non-text boundary"
        detail = f"{fg} on {back} = {ratio:.2f}:1 (AA needs {minimum}:1 for {kind})"
        if ratio < minimum:
            fail("contrast", "config/settings_data.json", f"{label}: {detail}")
        elif ratio < minimum + 0.5:
            warn("contrast", "config/settings_data.json", f"{label} only just passes: {detail}")
        else:
            ok(f"contrast {label}: {ratio:.2f}:1")


# ---------------------------------------------------------------------------
# Theme markup
# ---------------------------------------------------------------------------

TAG_RE = re.compile(r"<(img|iframe|video|audio|input|select|textarea|button|a)\b([^>]*)>", re.S | re.I)


def attrs_of(blob: str) -> str:
    return blob


def has_attr(blob: str, name: str) -> bool:
    return re.search(rf"\b{name}\s*=", blob, re.I) is not None


def strip_liquid_comments(src: str) -> str:
    """Drop both comment forms, so prose that quotes markup is never audited.

    Liquid has two: the tag pair {% comment %}…{% endcomment %}, and the same
    pair written bare inside a {% liquid %} block. Documentation in this theme
    uses the second form to describe markup, which reads as real tags to a
    regex that has not stripped it first.
    """
    src = re.sub(r"\{%-?\s*comment\s*-?%\}.*?\{%-?\s*endcomment\s*-?%\}", "", src, flags=re.S)

    def scrub_liquid_block(match: re.Match[str]) -> str:
        inner = re.sub(r"^\s*comment\b.*?^\s*endcomment\b", "", match.group(1),
                       flags=re.S | re.M)
        return "{% liquid" + inner + "%}"

    return re.sub(r"\{%-?\s*liquid\b(.*?)-?%\}", scrub_liquid_block, src, flags=re.S)


def check_theme_markup() -> None:
    files = walk(os.path.join(THEME, "sections"), (".liquid",)) + \
        walk(os.path.join(THEME, "snippets"), (".liquid",)) + \
        walk(os.path.join(THEME, "layout"), (".liquid",)) + \
        walk(os.path.join(THEME, "templates"), (".liquid",))

    img_total = img_missing = 0
    input_total = input_missing = 0

    for path in files:
        src = read(path)
        body = strip_liquid_comments(src)

        for m in TAG_RE.finditer(body):
            tag = m.group(1).lower()
            blob = m.group(2)
            ln = line_of(body, m.start())
            where = f"{rel(path)}:{ln}"

            if tag == "img":
                img_total += 1
                if not has_attr(blob, "alt"):
                    img_missing += 1
                    fail("img-alt", where, "<img> has no alt attribute (WCAG 1.1.1)")

            elif tag == "iframe":
                if not has_attr(blob, "title"):
                    fail("frame-title", where, "<iframe> has no title attribute (WCAG 4.1.2)")

            elif tag in ("video", "audio"):
                warn("media-captions", where,
                     f"<{tag}> present — AA requires captions for prerecorded audio (WCAG 1.2.2); verify manually")

            elif tag in ("input", "select", "textarea"):
                itype = (re.search(r"\btype\s*=\s*[\"']([^\"']+)", blob, re.I) or [None, ""])[1].lower()
                if itype in ("hidden", "submit", "button", "image"):
                    continue
                input_total += 1
                labelled = has_attr(blob, "aria-label") or has_attr(blob, "aria-labelledby") or has_attr(blob, "id")
                if not labelled:
                    input_missing += 1
                    fail("form-label", where,
                         f"<{tag}> has no id, aria-label or aria-labelledby, so no label can point at it (WCAG 3.3.2)")
                elif has_attr(blob, "placeholder") and not (
                        has_attr(blob, "aria-label") or has_attr(blob, "aria-labelledby") or has_attr(blob, "id")):
                    warn("form-label", where, "field labelled by placeholder only (WCAG 3.3.2)")

            elif tag == "a":
                if re.search(r"\bhref\s*=\s*[\"']#[\"']", blob):
                    warn("link-purpose", where, 'anchor with href="#" behaves as a button; use <button> (WCAG 4.1.2)')

        # Positive tabindex breaks the natural focus order.
        for m in re.finditer(r"tabindex\s*=\s*[\"']([1-9]\d*)[\"']", body):
            fail("tabindex", f"{rel(path)}:{line_of(body, m.start())}",
                 f"positive tabindex={m.group(1)} disturbs focus order (WCAG 2.4.3)")

        # aria-hidden must never wrap something focusable.
        for m in re.finditer(r"aria-hidden\s*=\s*[\"']true[\"'][^>]*\b(?:href|tabindex)\s*=", body):
            fail("aria-hidden-focusable", f"{rel(path)}:{line_of(body, m.start())}",
                 "aria-hidden='true' on a focusable element hides it from screen readers "
                 "while keeping it in the tab order (WCAG 4.1.2)")

    if img_total and not img_missing:
        ok(f"every one of the {img_total} <img> tags in the theme carries an alt attribute")
    if input_total and not input_missing:
        ok(f"all {input_total} form fields expose a label hook")


def check_theme_headings() -> None:
    """Each rendered page needs exactly one h1, and levels must not be skipped."""
    for path in walk(os.path.join(THEME, "sections"), (".liquid",)):
        src = read(path)
        levels = [int(m.group(1)) for m in re.finditer(r"<h([1-6])\b", src, re.I)]
        if not levels:
            continue
        previous = levels[0]
        for lvl in levels[1:]:
            if lvl > previous + 1:
                warn("heading-order", rel(path),
                     f"heading jumps from h{previous} to h{lvl}; do not skip levels (WCAG 1.3.1)")
                break
            previous = lvl

    main = os.path.join(THEME, "sections", "main-product.liquid")
    if os.path.exists(main) and not re.search(r"<h1\b", read(main), re.I):
        warn("page-h1", rel(main), "product page has no h1 (WCAG 1.3.1)")


def check_focus_visible() -> None:
    """Removing the focus ring without putting one back strands keyboard users.

    Dropping the outline on a field is legitimate when the surrounding wrapper
    lights up instead — the widespread `.box:focus-within` pattern. So before
    reporting, look for a :focus-within rule on the same BEM block.
    """
    for path in walk(os.path.join(THEME, "assets"), (".css",)):
        raw = read(path)
        src = re.sub(r"/\*.*?\*/", lambda m: " " * len(m.group(0)), raw, flags=re.S)

        focus_within_blocks = {
            sel.split("__")[0].split(":")[0].strip()
            for sel in re.findall(r"([^{}]*):focus-within", src)
        }

        for m in re.finditer(r"([^{}]*)\{([^}]*)\}", src):
            selector, block = m.group(1).strip(), m.group(2)
            if ":focus" not in selector:
                continue
            if not re.search(r"outline\s*:\s*(none|0)\b", block, re.I):
                continue

            # Replacement in the same rule?
            if re.search(r"(box-shadow|border-color|background)\s*:", block, re.I):
                continue
            # Replacement on a following :focus rule for the same selector?
            if re.search(r":focus[^{]*\{[^}]*(outline\s*:(?!\s*(none|0)\b)|box-shadow\s*:)",
                         src[m.end():m.end() + 900], re.I):
                continue
            # Replacement on the wrapper, via :focus-within?
            base = selector.split("__")[0].split(":")[0].split(",")[0].strip()
            if base and base in focus_within_blocks:
                continue

            fail("focus-visible", f"{rel(path)}:{line_of(raw, m.start())}",
                 f"'{selector[:60]}' removes the focus outline with nothing visible in its place, "
                 f"and no :focus-within on the wrapper (WCAG 2.4.7)")
    ok("focus rings checked across every stylesheet, allowing for :focus-within wrappers")


def check_accessibility_statement() -> None:
    """Israeli regulation expects a reachable, filled-in accessibility statement."""
    footer = os.path.join(THEME, "sections", "footer.liquid")
    has_link_setting = os.path.exists(footer) and "accessibility" in read(footer).lower()

    pages = walk(os.path.join(THEME, "templates"), (".json", ".liquid"))
    statement_page = any(
        re.search(r"accessibilit|נגישות", read(p)) for p in pages
    )

    if not has_link_setting:
        fail("statement", "theme/sections/footer.liquid",
             "no accessibility-statement link in the footer (תקנות נגישות השירות)")
    elif not statement_page:
        warn("statement", "theme/templates/",
             "the footer offers an accessibility-statement link but no matching page template ships with the theme; "
             "confirm the page exists and is filled in inside Shopify admin")
    else:
        ok("accessibility-statement link is wired into the footer")


def check_widget_caveat() -> None:
    """An adjustment widget is a convenience, never a substitute for compliance."""
    widget = os.path.join(THEME, "assets", "accessibility.css")
    if os.path.exists(widget):
        warn("widget-not-compliance", rel(widget),
             "the theme ships an accessibility adjustment widget. Widgets and overlays do not by themselves "
             "satisfy ת\"י 5568 and have themselves been the subject of claims — the underlying pages must comply")


# ---------------------------------------------------------------------------
# Mobile app — React Native
# ---------------------------------------------------------------------------

TOUCHABLES = ("Pressable", "TouchableOpacity", "TouchableHighlight", "TouchableWithoutFeedback")


def jsx_open_tag(src: str, start: int) -> tuple[str, int] | None:
    """Return the attribute text of the JSX tag opening at `start`, and its end.

    Walks braces so that props holding objects or arrow functions, which are
    full of '>' characters, do not end the tag early.
    """
    depth, i = 0, start
    while i < len(src):
        ch = src[i]
        if ch in "{(":
            depth += 1
        elif ch in "})":
            depth -= 1
        elif ch == ">" and depth == 0:
            return src[start:i], i
        i += 1
    return None


def element_body(src: str, tag: str, open_end: int) -> str:
    """Everything between an opening tag and its matching close."""
    if src[open_end - 1] == "/":          # self-closing
        return ""
    close = src.find(f"</{tag}>", open_end)
    return src[open_end:close] if close > 0 else src[open_end:open_end + 1200]


def check_app() -> None:
    if not os.path.isdir(APP):
        warn("app", "mobile-app/", "app directory missing; skipped")
        return

    files = walk(os.path.join(APP, "app"), (".tsx",)) + walk(os.path.join(APP, "src"), (".tsx", ".ts"))
    touch_total = touch_missing = 0

    for path in files:
        src = read(path)

        for name in TOUCHABLES:
            for m in re.finditer(rf"<{name}[\s/>]", src):
                opened = jsx_open_tag(src, m.end() - 1)
                if opened is None:
                    continue
                blob, end = opened
                where = f"{rel(path)}:{line_of(src, m.start())}"
                touch_total += 1

                named = ("accessibilityLabel" in blob or "aria-label" in blob
                         or "accessibilityLabelledBy" in blob)
                # React Native derives an accessible name from descendant <Text>,
                # so only an icon-only control is genuinely unlabelled.
                inner = element_body(src, name, end + 1)
                has_text_child = "<Text" in inner or "{label" in inner or "{title" in inner

                if not named and not has_text_child:
                    touch_missing += 1
                    fail("rn-touchable-label", where,
                         f"<{name}> has no accessibilityLabel and no text child, so VoiceOver and TalkBack "
                         f"announce it as an unlabelled button (WCAG 4.1.2)")
                if "accessibilityRole" not in blob and "role=" not in blob:
                    warn("rn-touchable-role", where,
                         f"<{name}> has no accessibilityRole; assistive tech cannot tell it is a button")

        for m in re.finditer(r"<(Image|ExpoImage)[\s/>]", src):
            opened = jsx_open_tag(src, m.end() - 1)
            if opened is None:
                continue
            blob = opened[0]
            if "accessibilityLabel" not in blob and "accessible" not in blob and "alt=" not in blob:
                warn("rn-image-label", f"{rel(path)}:{line_of(src, m.start())}",
                     "<Image> carries neither accessibilityLabel nor accessible={false}; decorative images "
                     "should be explicitly hidden and meaningful ones labelled (WCAG 1.1.1)")

        # `<TextInput` also appears as a generic type argument (useRef<TextInput>),
        # which is not an element; require a prop or a self-close to follow.
        for m in re.finditer(r"<TextInput(?=[\s/][^>]*?[\s/])", src):
            opened = jsx_open_tag(src, m.end())
            if opened is None:
                continue
            if "accessibilityLabel" not in opened[0]:
                fail("rn-input-label", f"{rel(path)}:{line_of(src, m.start())}",
                     "<TextInput> has no accessibilityLabel; a placeholder is not a label (WCAG 3.3.2)")

        # Text that refuses to scale locks out users who enlarge system type.
        # A capped multiplier is fine; a flat refusal is not.
        for m in re.finditer(r"allowFontScaling\s*=\s*\{\s*false\s*\}", src):
            opened = jsx_open_tag(src, m.start())
            nearby = src[max(0, m.start() - 400):m.start() + 200]
            if "accessible={false}" in nearby or 'importantForAccessibility="no"' in nearby:
                continue    # a decorative glyph, not text content
            fail("rn-font-scaling", f"{rel(path)}:{line_of(src, m.start())}",
                 "allowFontScaling={false} ignores the reader's chosen text size; use "
                 "maxFontSizeMultiplier instead, and 2 where the text carries real information "
                 "(WCAG 1.4.4 asks for 200%)")

        for m in re.finditer(r"maxFontSizeMultiplier\s*=\s*\{\s*([\d.]+)\s*\}", src):
            if float(m.group(1)) < 1.25:
                warn("rn-font-scaling", f"{rel(path)}:{line_of(src, m.start())}",
                     f"maxFontSizeMultiplier={m.group(1)} barely scales at all (WCAG 1.4.4)")

    if touch_total and not touch_missing:
        ok(f"all {touch_total} touchables in the app carry an accessibility label")

    # Small tap targets are the most common mobile failure. Read the named style
    # objects rather than every number in the file, so that border widths, gaps
    # and icon glyph sizes are not mistaken for touch areas.
    target_name = re.compile(r"(btn|button|touch|press|tap|chip|stepper|close|toggle|fab)", re.I)
    for path in files:
        src = read(path)
        for m in re.finditer(r"^\s{2,}(\w+)\s*:\s*\{(.*?)^\s{2,}\},", src, re.S | re.M):
            style_name, block = m.group(1), m.group(2)
            if not target_name.search(style_name):
                continue
            sizes = [int(v) for v in re.findall(r"(?:minHeight|height|minWidth|width)\s*:\s*(\d+)", block)]
            small = [s for s in sizes if 0 < s < 44]
            if not small:
                continue

            # hitSlop is a prop on the touchable, not a style key, so look at
            # where the style is used before calling the target too small.
            slopped = True
            for use in re.finditer(rf"styles\.{re.escape(style_name)}\b", src):
                head = src[max(0, use.start() - 500):use.start()]
                if "hitSlop" not in head.rsplit("<Pressable", 1)[-1] \
                        and "hitSlop" not in head.rsplit("<TouchableOpacity", 1)[-1]:
                    slopped = False
                    break
            if slopped:
                continue

            if small:
                warn("rn-tap-target", f"{rel(path)}:{line_of(src, m.start())}",
                     f"'{style_name}' sizes a touch target at {min(small)}px; iOS and Android both ask for 44px "
                     f"(WCAG 2.5.5). A hitSlop of the difference also satisfies it")


def main() -> int:
    parser = argparse.ArgumentParser(description="Accessibility checker (ת\"י 5568 / WCAG 2.0 AA)")
    parser.add_argument("--strict", action="store_true", help="treat warnings as failures")
    args = parser.parse_args()

    check_contrast()
    check_theme_markup()
    check_theme_headings()
    check_focus_visible()
    check_accessibility_statement()
    check_widget_caveat()
    check_app()

    print("=" * 74)
    print("בדיקת נגישות — ת\"י 5568 / WCAG 2.0 AA")
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

    print("\nבדיקה סטטית בלבד. סדר קריאה, איכות הטקסט החלופי, מעבר בין שדות בטופס חי")
    print("ובדיקה עם קורא מסך — עדיין דורשים בדיקה אנושית.")

    if FAILURES or (args.strict and WARNINGS):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
