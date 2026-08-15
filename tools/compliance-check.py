#!/usr/bin/env python3
"""
Store-readiness checker: the obligations that come from law and from the app
stores, rather than from good taste.

Covers what can be decided from the source — that the policies are reachable
from inside the app and from the site, and that an account can be deleted from
where it was created. Whether the policy text itself is adequate is a question
for a lawyer, not for a regex.

Usage:  python3 tools/compliance-check.py [--strict]
Exit code 1 when any FAIL is found (warnings alone exit 0).
"""

from __future__ import annotations

import argparse
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


def read(path: str) -> str:
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def app_sources() -> str:
    """Every app source concatenated — these checks ask "does it exist anywhere"."""
    blob = []
    for base in (os.path.join(APP, "app"), os.path.join(APP, "src")):
        for dirpath, dirs, files in os.walk(base):
            dirs[:] = [d for d in dirs if d not in ("node_modules", ".expo", "dist")]
            for name in files:
                if name.endswith((".tsx", ".ts")):
                    blob.append(read(os.path.join(dirpath, name)))
    return "\n".join(blob)


def check_app_privacy_link() -> None:
    """Both stores refuse an app that handles user data with no privacy policy."""
    src = app_sources()
    if re.search(r"POLICY_URLS|privacy-policy|privacyPolicy", src):
        ok("the app links to the privacy policy from inside the app")
    else:
        fail("app-privacy", "mobile-app/",
             "no privacy-policy link anywhere in the app. App Store review and Google Play both "
             "require one in any app that handles user data, and this app signs customers in")


def check_app_account_deletion() -> None:
    """Apple guideline 5.1.1(v): account creation obliges account deletion."""
    src = app_sources()
    creates_account = "signIn" in src or "CustomerAccount" in src or "customerFetch" in src
    if not creates_account:
        ok("the app does not create accounts, so no deletion path is required")
        return

    if re.search(r"requestAccountDeletion|deleteAccount|מחיקת החשבון", src):
        ok("the app offers an account-deletion path from inside the app")
    else:
        fail("app-account-deletion", "mobile-app/app/account.tsx",
             "the app signs customers in but offers no way to delete the account. Apple guideline "
             "5.1.1(v) makes this a rejection: an app that supports account creation must let the "
             "account be deleted from within the app")


def check_theme_policy_links() -> None:
    footer = os.path.join(THEME, "sections", "footer.liquid")
    if not os.path.exists(footer):
        fail("site-policies", "theme/sections/footer.liquid", "footer section missing")
        return
    if "shop.policies" in read(footer):
        ok("the storefront footer lists the shop policies")
    else:
        fail("site-policies", "theme/sections/footer.liquid",
             "the footer does not render shop.policies, so the privacy, refund and terms pages "
             "are not reachable from every page")


def check_accessibility_statement() -> None:
    """Israeli service-accessibility regulation expects a published statement."""
    footer = os.path.join(THEME, "sections", "footer.liquid")
    has_slot = os.path.exists(footer) and "accessibility" in read(footer).lower()
    if has_slot:
        warn("accessibility-statement", "theme/sections/footer.liquid",
             "the footer has a slot for an accessibility-statement link, but whether the page "
             "exists and is filled in can only be confirmed in Shopify admin. Shopify's own policy "
             "list has no accessibility type, so this has to be a normal page")
    else:
        fail("accessibility-statement", "theme/sections/footer.liquid",
             "no accessibility-statement link in the footer")


def check_price_display() -> None:
    """Consumer law wants the price a customer pays, tax included, up front."""
    terms_mentioned = False
    for name in ("main-product.liquid", "main-cart.liquid"):
        path = os.path.join(THEME, "sections", name)
        if os.path.exists(path) and re.search(r"מע\"מ|כולל מע|tax_line|taxes_included", read(path)):
            terms_mentioned = True
    if terms_mentioned:
        ok("the product or cart template says something about tax in the displayed price")
    else:
        warn("price-display", "theme/sections/",
             "neither the product nor the cart template mentions VAT. Israeli consumer law wants "
             "the final price shown to a consumer to be tax-inclusive and stated as such; confirm "
             "the store's tax settings and that the wording appears somewhere the buyer sees")


def main() -> int:
    parser = argparse.ArgumentParser(description="Store-readiness and obligations checker")
    parser.add_argument("--strict", action="store_true", help="treat warnings as failures")
    args = parser.parse_args()

    check_app_privacy_link()
    check_app_account_deletion()
    check_theme_policy_links()
    check_accessibility_statement()
    check_price_display()

    print("=" * 74)
    print("בדיקת חובות — חנויות האפליקציות ורגולציה")
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

    print("\nהבדיקה קובעת שהמסמכים נגישים — לא שתוכנם מספק.")
    print("התאמת הנוסח לחוק היא שאלה לעורך דין.")

    return 1 if FAILURES or (args.strict and WARNINGS) else 0


if __name__ == "__main__":
    sys.exit(main())
