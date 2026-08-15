#!/usr/bin/env python3
"""
בדיקות אבטחה לאתר ולאפליקציה של א.נ. שילו.

הסקריפט הזה נועד לרוץ שוב ושוב — לפני כל פרסום של הת'ים ולפני כל בניית
אפליקציה — ולתפוס נסיגות אבטחה לפני שהן מגיעות ללקוחות.

הוא בודק רק מה שאפשר לבדוק מהקוד עצמו, בלי רשת ובלי תלויות חיצוניות:
סודות שדלפו, אחסון טוקנים, זרימת ההתחברות, וכל מקום שבו טקסט שלא בשליטתנו
נכנס ל-HTML. מה שדורש גישה לחנות עצמה (מוצרים במחיר 0 שניתן לקנות, קודי
הנחה בלי הגבלה) מתועד ב-docs/SECURITY.md ונבדק מול ניהול החנות.

הרצה:  python3 tools/security-check.py [--strict]
        --strict  → גם אזהרות מחזירות קוד יציאה 1

קוד יציאה 1 כשיש שגיאה (ERROR). אזהרות לבדן מחזירות 0.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ERRORS: list[str] = []
WARNINGS: list[str] = []
PASSED: list[str] = []


def err(where: str, msg: str) -> None:
    ERRORS.append(f"{where}: {msg}")


def warn(where: str, msg: str) -> None:
    WARNINGS.append(f"{where}: {msg}")


def ok(msg: str) -> None:
    PASSED.append(msg)


def rel(path: str) -> str:
    return os.path.relpath(path, ROOT)


def read(path: str) -> str:
    with open(path, encoding="utf-8", errors="replace") as fh:
        return fh.read()


def walk(subdir: str, exts: tuple[str, ...]) -> list[str]:
    """כל הקבצים בסיומות מסוימות תחת תיקייה, בלי node_modules ובלי .git."""
    base = os.path.join(ROOT, subdir)
    out: list[str] = []
    for dirpath, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if d not in {"node_modules", ".git", ".expo", "dist"}]
        for name in files:
            if name.endswith(exts):
                out.append(os.path.join(dirpath, name))
    return sorted(out)


def tracked_files() -> list[str]:
    """הקבצים ש-git עוקב אחריהם. אלה היחידים שיכולים לדלוף החוצה."""
    try:
        out = subprocess.run(
            ["git", "-C", ROOT, "ls-files"],
            capture_output=True, text=True, check=True, timeout=60,
        ).stdout
    except (subprocess.SubprocessError, OSError):
        return []
    return [os.path.join(ROOT, line) for line in out.splitlines() if line.strip()]


def lines_of(text: str) -> list[tuple[int, str]]:
    return list(enumerate(text.splitlines(), start=1))


# =====================================================================
# א. סודות ואישורי גישה
# =====================================================================

# תבניות הטוקנים האמיתיים של שופיפיי. אלה הסודות שאסור שיגיעו ל-git לעולם:
# shpat = Admin API (קורא הזמנות ולקוחות!), shpss = Shared secret,
# shpca = Customer Account, shpua = Storefront מאומת.
SHOPIFY_SECRET_RE = re.compile(r"\bshp(at|ss|ca|ua)_[0-9a-fA-F]{16,}")

OTHER_SECRET_RES = [
    (re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----"), "מפתח פרטי"),
    (re.compile(r"\bsk_live_[0-9a-zA-Z]{16,}"), "מפתח Stripe חי"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "מפתח AWS"),
    (re.compile(r"\bghp_[0-9a-zA-Z]{30,}"), "טוקן GitHub"),
    (re.compile(r"\bAIza[0-9A-Za-z_\-]{30,}"), "מפתח Google API"),
]

# סיומות בינאריות שאין טעם לסרוק בהן טקסט
BINARY_EXT = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".woff2", ".woff", ".ico", ".pdf", ".zip")


def check_no_secrets_in_tracked_files() -> None:
    """שום סוד אמיתי לא נמצא בקבצים ש-git עוקב אחריהם."""
    files = tracked_files()
    if not files:
        warn("git", "לא ניתן היה לקרוא את רשימת הקבצים מ-git — סריקת הסודות לא רצה")
        return

    hits = 0
    for path in files:
        if path.endswith(BINARY_EXT) or not os.path.isfile(path):
            continue
        # package-lock.json ארוך מאוד ומכיל רק hashes — נסרק בנפרד ובזול
        text = read(path)
        for num, line in lines_of(text):
            if SHOPIFY_SECRET_RE.search(line):
                err(f"{rel(path)}:{num}", "טוקן שופיפיי אמיתי בקוד — יש לבטל אותו בניהול החנות מיד")
                hits += 1
            for pattern, label in OTHER_SECRET_RES:
                if pattern.search(line):
                    err(f"{rel(path)}:{num}", f"{label} בקוד — יש לבטל אותו מיד")
                    hits += 1
    if hits == 0:
        ok(f"אין סודות בקבצים ש-git עוקב אחריהם ({len(files)} קבצים נסרקו)")


def check_git_history_clean() -> None:
    """סוד שנמחק מהקוד עדיין חי בהיסטוריה — שם צריך לחפש אותו."""
    # ההיסטוריה מכילה גם בלובים בינאריים — תמונות, PDF, גופנים. פענוח קפדני
    # של UTF-8 קורס עליהם באמצע הסריקה, וסריקת סודות שקרסה נראית בדיוק כמו
    # סריקה שעברה. errors="replace" מבטיח שהסריקה מגיעה עד סופה.
    try:
        out = subprocess.run(
            ["git", "-C", ROOT, "log", "--all", "-p", "--no-color"],
            capture_output=True, check=True, timeout=300,
        ).stdout.decode("utf-8", errors="replace")
    except (subprocess.SubprocessError, OSError):
        warn("git", "לא ניתן היה לקרוא את היסטוריית git — בדיקת ההיסטוריה לא רצה")
        return

    found = set(SHOPIFY_SECRET_RE.findall(out))
    if found:
        err("git history", "טוקן שופיפיי הופיע בהיסטוריית הקומיטים — יש לבטל אותו בניהול החנות")
    else:
        ok("היסטוריית הקומיטים נקייה מטוקני שופיפיי")


def check_storefront_token_placeholder() -> None:
    """הטוקן באפליקציה מגיע ממשתנה סביבה, ובקוד נשאר רק ה-placeholder."""
    path = os.path.join(ROOT, "mobile-app", "src", "config.ts")
    if not os.path.isfile(path):
        err("mobile-app/src/config.ts", "הקובץ חסר")
        return
    text = read(path)
    match = re.search(r"const\s+TOKEN_INLINE\s*=\s*([A-Za-z_][A-Za-z0-9_]*|'[^']*'|\"[^\"]*\")", text)
    if match is None:
        warn(rel(path), "לא נמצאה ההגדרה TOKEN_INLINE — הבדיקה לא יכלה לאמת את הטוקן")
        return
    value = match.group(1)
    if value == "TOKEN_PLACEHOLDER":
        ok("טוקן ה-Storefront אינו כתוב בקוד (נשאר placeholder, מוזרק ממשתנה סביבה)")
    else:
        err(rel(path), f"TOKEN_INLINE אינו ה-placeholder אלא {value} — טוקן אסור להיכנס ל-git")


def check_env_hygiene() -> None:
    """.env אמיתי לא נכנס ל-git, ו-.env.example לא מכיל ערך."""
    tracked = {rel(p) for p in tracked_files()}

    leaked = [p for p in tracked if os.path.basename(p) == ".env" or p.endswith("/.env")]
    if leaked:
        for p in leaked:
            err(p, "קובץ .env נמצא תחת git — הוא אמור להיות מוחרג ב-.gitignore")
    else:
        ok("אין קובץ .env תחת מעקב git")

    example = os.path.join(ROOT, "mobile-app", ".env.example")
    if os.path.isfile(example):
        for num, line in lines_of(read(example)):
            if line.strip().startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            if value.strip():
                err(f"mobile-app/.env.example:{num}", f"ל-{key.strip()} יש ערך — קובץ הדוגמה חייב להישאר ריק")
        ok(".env.example ריק מערכים")

    # דפוסי ההחרגה שחייבים להופיע, כדי שמפתח או קובץ סביבה לא ייכנסו בטעות
    gitignore = os.path.join(ROOT, ".gitignore")
    if not os.path.isfile(gitignore):
        err(".gitignore", "הקובץ חסר")
        return
    content = read(gitignore)
    required = [".env", "*.key", "*.p12", "*.p8", "*.mobileprovision", "*.jks", "node_modules"]
    missing = [pattern for pattern in required if pattern not in content]
    if missing:
        err(".gitignore", "חסרות החרגות: " + ", ".join(missing))
    else:
        ok(".gitignore מחריג קבצי סביבה, מפתחות ותעודות חתימה")


def check_no_admin_api_in_app() -> None:
    """ה-Admin API קורא הזמנות ולקוחות — אסור לו להופיע באפליקציה."""
    offenders: list[str] = []
    for path in walk("mobile-app/src", (".ts", ".tsx")) + walk("mobile-app/app", (".ts", ".tsx")):
        for num, line in lines_of(read(path)):
            if "/admin/api/" in line or "X-Shopify-Access-Token" in line:
                offenders.append(f"{rel(path)}:{num}")
    if offenders:
        for place in offenders:
            err(place, "שימוש ב-Admin API מתוך האפליקציה — הטוקן שלו סודי ואסור שיישלח ממכשיר של לקוח")
    else:
        ok("האפליקציה משתמשת רק ב-Storefront וב-Customer Account API, לא ב-Admin API")


def check_expo_public_vars_are_not_secret() -> None:
    """כל EXPO_PUBLIC_* נצרב לתוך ה-bundle בטקסט גלוי — שם אין מקום לסוד."""
    suspicious = re.compile(r"EXPO_PUBLIC_[A-Z0-9_]*(SECRET|PRIVATE|ADMIN|PASSWORD|WEBHOOK)[A-Z0-9_]*")
    hits: list[str] = []
    for sub, exts in (("mobile-app/src", (".ts", ".tsx")), ("mobile-app/app", (".ts", ".tsx"))):
        for path in walk(sub, exts):
            for num, line in lines_of(read(path)):
                for match in suspicious.findall(line):
                    hits.append(f"{rel(path)}:{num}")
    for extra in ("mobile-app/.env.example", "mobile-app/eas.json", "mobile-app/app.json"):
        path = os.path.join(ROOT, extra)
        if os.path.isfile(path):
            for num, line in lines_of(read(path)):
                if suspicious.search(line):
                    hits.append(f"{extra}:{num}")
    if hits:
        for place in sorted(set(hits)):
            err(place, "משתנה EXPO_PUBLIC_ ששמו מרמז על סוד — הוא ייצרב לאפליקציה בטקסט גלוי")
    else:
        ok("אין משתנה EXPO_PUBLIC_ ששמו מרמז על סוד")


# =====================================================================
# ב. האפליקציה — טוקנים, התחברות ורשת
# =====================================================================


def check_tokens_in_secure_store() -> None:
    """טוקני הלקוח חייבים לשבת ב-Keychain/Keystore, לא בקובץ גלוי."""
    path = os.path.join(ROOT, "mobile-app", "src", "state", "AuthContext.tsx")
    if not os.path.isfile(path):
        err("mobile-app/src/state/AuthContext.tsx", "הקובץ חסר")
        return
    text = read(path)
    if "expo-secure-store" not in text:
        err(rel(path), "טוקני הלקוח אינם נשמרים ב-expo-secure-store")
        return
    if re.search(r"AsyncStorage\s*\.\s*(setItem|getItem)", text):
        err(rel(path), "טוקן לקוח נכתב ל-AsyncStorage — קובץ גלוי במכשיר שעבר rooting")
        return
    ok("טוקני הלקוח נשמרים ב-SecureStore (Keychain ב-iOS, Keystore באנדרואיד)")


def check_pkce_enabled() -> None:
    """בלי PKCE, קוד התחברות שנחטף בדרך חזרה לאפליקציה שווה לחשבון."""
    path = os.path.join(ROOT, "mobile-app", "src", "state", "AuthContext.tsx")
    if not os.path.isfile(path):
        return
    text = read(path)
    if re.search(r"usePKCE\s*:\s*true", text):
        ok("זרימת ההתחברות משתמשת ב-PKCE")
    else:
        err(rel(path), "AuthRequest בלי usePKCE: true — קוד התחברות שנחטף יאפשר השתלטות על החשבון")


def check_oauth_state_validated() -> None:
    """פרמטר state הוא ההגנה מפני הזרקת קוד התחברות של תוקף."""
    path = os.path.join(ROOT, "mobile-app", "src", "state", "AuthContext.tsx")
    if not os.path.isfile(path):
        return
    text = read(path)
    # expo-auth-session מגריל state לבד; מה שחסר הוא ההשוואה בתשובה.
    validated = re.search(r"result\.params\.state", text) and re.search(r"request\.state", text)
    if validated:
        ok("תשובת ההתחברות מאומתת מול פרמטר ה-state שנשלח")
    else:
        err(rel(path), "התשובה מ-OAuth לא מאומתת מול request.state — קוד התחברות מוזרק לא ייתפס")


def check_no_token_logging() -> None:
    """טוקן שנכתב ללוג נשאר בלוג של המכשיר ושל כלי הפיתוח."""
    log_call = re.compile(r"console\.(log|warn|error|info|debug)\s*\(")
    token_word = re.compile(r"\b(accessToken|refreshToken|codeVerifier|id_token|storefrontAccessToken|tokens\.current)\b")
    hits: list[str] = []
    for sub in ("mobile-app/src", "mobile-app/app"):
        for path in walk(sub, (".ts", ".tsx")):
            for num, line in lines_of(read(path)):
                if log_call.search(line) and token_word.search(line):
                    hits.append(f"{rel(path)}:{num}")
    if hits:
        for place in hits:
            err(place, "טוקן נכתב ללוג")
    else:
        ok("אין כתיבת טוקנים ללוג")


def check_no_cleartext_http() -> None:
    """כל תעבורה חייבת להיות מוצפנת — http רגיל ניתן לקריאה ולשינוי ברשת ציבורית."""
    http_url = re.compile(r"""["'`]http://(?!localhost|127\.0\.0\.1)""")
    hits: list[str] = []
    for sub in ("mobile-app/src", "mobile-app/app"):
        for path in walk(sub, (".ts", ".tsx")):
            for num, line in lines_of(read(path)):
                if http_url.search(line):
                    hits.append(f"{rel(path)}:{num}")
    if hits:
        for place in hits:
            err(place, "כתובת http לא מוצפנת בקוד האפליקציה")
    else:
        ok("כל הכתובות באפליקציה הן https")


def check_no_cleartext_traffic_flags() -> None:
    """דגלים שמבטלים את אכיפת ה-HTTPS ברמת מערכת ההפעלה."""
    path = os.path.join(ROOT, "mobile-app", "app.json")
    if not os.path.isfile(path):
        err("mobile-app/app.json", "הקובץ חסר")
        return
    text = read(path)
    bad = [flag for flag in ("NSAllowsArbitraryLoads", "usesCleartextTraffic") if flag in text]
    if bad:
        err(rel(path), "דגל שמבטל אכיפת HTTPS: " + ", ".join(bad))
    else:
        ok("app.json אינו מבטל את אכיפת ה-HTTPS")


def check_token_not_in_url() -> None:
    """טוקן בכתובת נשמר בהיסטוריית הדפדפן, בלוגים ובכותרת Referer."""
    hits: list[str] = []
    for sub in ("mobile-app/src", "mobile-app/app"):
        for path in walk(sub, (".ts", ".tsx")):
            for num, line in lines_of(read(path)):
                # מחרוזת שבונה query string עם טוקן בתוכה
                if re.search(r"[?&][a-z_]*token[a-z_]*=\$\{", line, re.I) or \
                   re.search(r"[?&]id_token_hint=", line):
                    hits.append(f"{rel(path)}:{num}")
    if hits:
        for place in hits:
            warn(place, "טוקן נשלח כפרמטר בכתובת — נשמר בלוגים ובהיסטוריה; עדיף בגוף הבקשה")
    else:
        ok("אין טוקן שנשלח כפרמטר בכתובת")


# =====================================================================
# ג. הת'ים — הזרקת קוד לדפדפן של הלקוח
# =====================================================================


def theme_js_files() -> list[str]:
    return walk("theme/assets", (".js",))


def check_no_dangerous_eval() -> None:
    """eval ו-document.write הופכים כל טקסט זר לקוד רץ."""
    patterns = [
        (re.compile(r"\beval\s*\("), "eval"),
        (re.compile(r"\bnew\s+Function\s*\("), "new Function"),
        (re.compile(r"\bdocument\.write(ln)?\s*\("), "document.write"),
    ]
    hits: list[str] = []
    for path in theme_js_files():
        for num, line in lines_of(read(path)):
            for pattern, label in patterns:
                if pattern.search(line):
                    hits.append(f"{rel(path)}:{num} ({label})")
    if hits:
        for place in hits:
            err(place, "הרצת קוד מטקסט — מסלול ישיר להזרקת סקריפט")
    else:
        ok("אין eval / new Function / document.write בת'ים")


# הכלל: כל השמה ל-innerHTML שמרכיבה HTML ממחרוזות (יש בה +) חייבת להשתמש
# בפונקציית בריחה. השמה של HTML שהשרת עצמו רינדר (fresh.innerHTML,
# replacement.innerHTML, card.outerHTML) בטוחה — שופיפיי כבר בורחת שם.
SERVER_RENDERED_RE = re.compile(
    r"=\s*(?:[A-Za-z_$][\w$]*\s*(?:\.[\w$]+)*\.(?:inner|outer)HTML|html|''|\"\"|``)\s*;?\s*$"
)
ESCAPE_HELPER_RE = re.compile(r"\b(escapeHtml|escapeAttr|esc)\s*\(")

# פתח מילוט מפורש למקום שבו הבריחה קרתה כמה שורות למעלה. הכוונה היא שהוויתור
# יהיה כתוב בקוד וייקרא בביקורת — ולא שהבדיקה תוותר בשקט. הנימוק חובה.
REVIEWED_MARKER_RE = re.compile(r"security-checked:\s*\S+")


def check_innerhtml_is_escaped() -> None:
    """כל HTML שנבנה בקוד מנתונים חייב לעבור דרך פונקציית בריחה."""
    assign = re.compile(r"\.innerHTML\s*=\s*(?!=)")
    hits: list[str] = []
    for path in theme_js_files():
        text = read(path)
        source_lines = text.splitlines()
        for index, line in enumerate(source_lines):
            if not assign.search(line):
                continue
            # ההשמה יכולה להימשך על פני כמה שורות — אוספים עד לנקודה-פסיק
            chunk = line
            cursor = index
            while ";" not in chunk and cursor + 1 < len(source_lines) and cursor - index < 25:
                cursor += 1
                chunk += "\n" + source_lines[cursor]
            if SERVER_RENDERED_RE.search(line.rstrip()):
                continue  # HTML שהשרת רינדר, או ניקוי לריק
            if "+" not in chunk and "${" not in chunk:
                continue  # השמה של ערך יחיד בלי הרכבה
            if ESCAPE_HELPER_RE.search(chunk):
                continue  # מורכב, אבל עם בריחה
            # סימון מפורש בשלוש השורות שמעל, כשהבריחה נעשתה קודם לכן
            preceding = "\n".join(source_lines[max(0, index - 3):index])
            if REVIEWED_MARKER_RE.search(preceding):
                continue
            hits.append(f"{rel(path)}:{index + 1}")
    if hits:
        for place in hits:
            err(place, "HTML מורכב מנתונים ונכנס ל-innerHTML בלי בריחה — שם מוצר עם תגית סקריפט ירוץ אצל הלקוח")
    else:
        ok("כל ה-HTML שנבנה בת'ים עובר בריחה לפני שהוא נכנס לדף")


def check_no_unescaped_attribute_json() -> None:
    """JSON שנדחף לתוך תכונת HTML חייב בריחה מלאה, לא רק של גרש."""
    hits: list[str] = []
    for path in theme_js_files():
        text = read(path)
        for num, line in lines_of(text):
            if "JSON.stringify" in line and re.search(r"data-[\w-]+=", line):
                if not ESCAPE_HELPER_RE.search(line):
                    hits.append(f"{rel(path)}:{num}")
    if hits:
        for place in hits:
            err(place, "JSON נכנס לתכונת HTML בלי בריחה מלאה")
    else:
        ok("אין JSON שנדחף לתכונת HTML בלי בריחה")


def check_no_external_scripts() -> None:
    """סקריפט מדומיין זר הוא דלת אחורית לאתר — אם הוא נפרץ, האתר נפרץ."""
    tag = re.compile(r"<script[^>]*\ssrc\s*=\s*[\"']([^\"']+)[\"']", re.I)
    hits: list[str] = []
    for path in walk("theme", (".liquid", ".json")):
        for num, line in lines_of(read(path)):
            for url in tag.findall(line):
                if url.startswith(("{{", "{%")) or "asset_url" in url or "shopify_asset_url" in url:
                    continue
                if url.startswith(("http://", "https://", "//")):
                    hits.append(f"{rel(path)}:{num} → {url}")
    if hits:
        for place in hits:
            err(place, "סקריפט מדומיין חיצוני בת'ים")
    else:
        ok("הת'ים טוען סקריפטים רק מהחנות עצמה")


def check_no_javascript_urls() -> None:
    """href=\"javascript:\" מריץ קוד בלחיצה, ולעיתים נשלט מנתונים."""
    hits: list[str] = []
    for path in walk("theme", (".liquid", ".js")):
        for num, line in lines_of(read(path)):
            if re.search(r"""(href|src)\s*=\s*["']?\s*javascript:""", line, re.I):
                hits.append(f"{rel(path)}:{num}")
    if hits:
        for place in hits:
            err(place, "כתובת javascript: בקוד הת'ים")
    else:
        ok("אין כתובות javascript: בת'ים")


# שדות שהמבקר או הלקוח שולט בתוכנם. כשהם מודפסים לדף הם חייבים בריחה,
# אחרת אפשר לשתול בהם תגית שתרוץ אצל המבקר הבא.
UNTRUSTED_LIQUID_FIELDS = re.compile(
    r"\{\{-?\s*(form\.(?:name|email|body|author|phone|message)"
    r"|cart\.note"
    r"|customer\.(?:name|first_name|last_name|email|phone)"
    r"|comment\.(?:author|email)"
    r"|search\.terms|predictive_search\.terms)\s*"
)
SAFE_FILTERS = ("escape", "escape_once", "url_param_escape", "url_encode", "json", "strip_html", "handleize")


def check_untrusted_liquid_is_escaped() -> None:
    """כל שדה שהמשתמש שולט בו עובר בריחה לפני שהוא מודפס לדף."""
    hits: list[str] = []
    for path in walk("theme", (".liquid",)):
        for num, line in lines_of(read(path)):
            for match in UNTRUSTED_LIQUID_FIELDS.finditer(line):
                # הפילטרים מופיעים אחרי שם השדה ולפני סוגר הפלט
                tail = line[match.end():]
                closing = tail.find("}}")
                filters = tail[:closing] if closing != -1 else tail
                if not any(f"| {name}" in filters or f"|{name}" in filters for name in SAFE_FILTERS):
                    hits.append(f"{rel(path)}:{num} → {match.group(1)}")
    if hits:
        for place in hits:
            err(place, "שדה בשליטת המשתמש מודפס לדף בלי בריחה")
    else:
        ok("כל השדות בשליטת המשתמש עוברים בריחה לפני הדפסה")


def check_unpriced_items_are_not_addable() -> None:
    """מוצר בלי מחיר לא נכנס לעגלה — שופיפיי תכבד את ה-₪0 שהוגדר לו."""
    # שלוש דרכי ההוספה לעגלה, וההגנה שכל אחת חייבת לשאת
    guards = [
        (
            "theme/snippets/product-card.liquid",
            re.compile(r"card_variant\.price\s*>\s*0"),
            "כפתור ההוספה המהירה בכרטיס לא מותנה במחיר",
        ),
        (
            "theme/assets/section-main-product.js",
            re.compile(r"variant\.available\s*&&\s*variant\.price\s*>\s*0"),
            "החלפת ווריאנט בדף המוצר מחזירה כפתור קנייה בלי לבדוק מחיר",
        ),
        (
            "theme/assets/quick-order.js",
            re.compile(r"hit\.available\s*&&\s*Number\(hit\.price\)\s*>\s*0"),
            "ההזמנה המהירה מוסיפה לפי מקט בלי לבדוק מחיר",
        ),
    ]
    for relative, pattern, message in guards:
        path = os.path.join(ROOT, relative)
        if not os.path.isfile(path):
            warn(relative, "הקובץ חסר — הבדיקה לא רצה")
            continue
        if pattern.search(read(path)):
            ok(f"{relative}: מוצר בלי מחיר אינו ניתן להוספה לעגלה")
        else:
            err(relative, message)


def check_catalog_text_is_escaped_in_liquid() -> None:
    """שם היצרן והכותרת מגיעים מהקטלוג ונכנסים לתוצאות חיפוש דרך innerHTML."""
    fields = re.compile(r"\{\{-?\s*((?:product|item)\.(?:vendor|title))\s*")
    hits: list[str] = []
    for path in walk("theme/snippets", (".liquid",)) + walk("theme/sections", (".liquid",)):
        for num, line in lines_of(read(path)):
            for match in fields.finditer(line):
                tail = line[match.end():]
                closing = tail.find("}}")
                filters = tail[:closing] if closing != -1 else tail
                if not any(f"| {name}" in filters or f"|{name}" in filters for name in SAFE_FILTERS):
                    hits.append(f"{rel(path)}:{num} → {match.group(1)}")
    if hits:
        for place in hits:
            err(place, "טקסט מהקטלוג מודפס בלי בריחה — הוא נטען לתוצאות החיפוש דרך innerHTML")
    else:
        ok("שם היצרן וכותרת המוצר עוברים בריחה בכל מקום")


def check_quick_order_json_is_encoded() -> None:
    """התבנית שמחזירה JSON נבנית ביד — כל מחרוזת שם חייבת לעבור | json."""
    path = os.path.join(ROOT, "theme", "templates", "search.quick-order.liquid")
    if not os.path.isfile(path):
        warn("theme/templates/search.quick-order.liquid", "התבנית לא נמצאה — הבדיקה לא רצה")
        return
    # שדות מספריים בלבד — אין להם משמעות טקסטואלית ולכן אינם צריכים | json
    numeric_ok = re.compile(r"\{\{\s*(variant\.(id|price|compare_at_price)|item\.id)\s*\}\}")
    hits: list[str] = []
    for num, line in lines_of(read(path)):
        for match in re.finditer(r"\{\{(.+?)\}\}", line):
            expression = match.group(0)
            if numeric_ok.fullmatch(expression.strip()):
                continue
            if "| json" in expression or "|json" in expression:
                continue
            hits.append(f"{rel(path)}:{num} → {expression.strip()}")
    if hits:
        for place in hits:
            err(place, "ערך בתבנית ה-JSON בלי | json — טקסט עם גרש או תגית ישבור את המבנה")
    else:
        ok("כל הערכים בתבנית ה-JSON של ההזמנה המהירה מקודדים ב-| json")


# =====================================================================
# הרצה
# =====================================================================

CHECKS = [
    # סודות
    ("סודות בקוד", check_no_secrets_in_tracked_files),
    ("סודות בהיסטוריה", check_git_history_clean),
    ("טוקן Storefront", check_storefront_token_placeholder),
    ("היגיינת קבצי סביבה", check_env_hygiene),
    ("Admin API באפליקציה", check_no_admin_api_in_app),
    ("משתני EXPO_PUBLIC", check_expo_public_vars_are_not_secret),
    # אפליקציה
    ("אחסון טוקנים", check_tokens_in_secure_store),
    ("PKCE", check_pkce_enabled),
    ("אימות state ב-OAuth", check_oauth_state_validated),
    ("טוקנים בלוג", check_no_token_logging),
    ("תעבורה מוצפנת", check_no_cleartext_http),
    ("דגלי HTTPS", check_no_cleartext_traffic_flags),
    ("טוקן בכתובת", check_token_not_in_url),
    # ת'ים
    ("הרצת קוד מטקסט", check_no_dangerous_eval),
    ("בריחה ב-innerHTML", check_innerhtml_is_escaped),
    ("JSON בתכונות HTML", check_no_unescaped_attribute_json),
    ("סקריפטים חיצוניים", check_no_external_scripts),
    ("כתובות javascript:", check_no_javascript_urls),
    ("בריחה בשדות משתמש", check_untrusted_liquid_is_escaped),
    ("בריחה בטקסט מהקטלוג", check_catalog_text_is_escaped_in_liquid),
    ("קידוד תבנית ה-JSON", check_quick_order_json_is_encoded),
    # מסחר
    ("מוצר בלי מחיר בעגלה", check_unpriced_items_are_not_addable),
]


def main() -> int:
    parser = argparse.ArgumentParser(description="בדיקות אבטחה לאתר ולאפליקציה")
    parser.add_argument("--strict", action="store_true", help="גם אזהרות מחזירות קוד יציאה 1")
    args = parser.parse_args()

    for _name, check in CHECKS:
        check()

    print("בדיקות אבטחה — א.נ. שילו")
    print("=" * 60)

    for line in PASSED:
        print(f"  תקין   {line}")

    if WARNINGS:
        print()
        for line in WARNINGS:
            print(f"  אזהרה  {line}")

    if ERRORS:
        print()
        for line in ERRORS:
            print(f"  שגיאה  {line}")

    print("=" * 60)
    print(f"{len(PASSED)} עברו, {len(WARNINGS)} אזהרות, {len(ERRORS)} שגיאות")

    if ERRORS:
        return 1
    if WARNINGS and args.strict:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
