# מהקוד לאפליקציה בטלפון — שלב אחר שלב

מדריך העתק־הדבק. כל בלוק קוד נכנס לטרמינל (ב-Mac: Terminal, בווינדוס: PowerShell).
אם שלב נכשל — עוצרים שם ולא ממשיכים. השגיאה תמיד אומרת מה חסר.

---

## שלב 0 — מה צריך להיות מותקן

| מה | מאיפה | הערה |
|---|---|---|
| Node.js (גרסת LTS) | [nodejs.org](https://nodejs.org) | להתקין ולאשר הכול |
| Git | [git-scm.com](https://git-scm.com) | ב-Mac כנראה כבר מותקן |
| חשבון Expo | [expo.dev](https://expo.dev) | חינם. להירשם ולזכור סיסמה |
| חשבון Apple Developer | כבר יש לכם | 99$ לשנה. בלעדיו אין TestFlight |

בדיקה שהכול עלה:

```bash
node --version
git --version
```

שתי השורות צריכות להחזיר מספר גרסה. אם אחת אומרת "command not found" — ההתקנה
לא הצליחה, להתקין שוב.

---

## שלב 1 — להוריד את הקוד המתוקן

התיקונים יושבים בענף `claude/shopify-app-hebrew-compat-i1wcji`
([PR #3](https://github.com/ofir-commits/anshilo.com/pull/3)), **לא** בענף הראשי.
לכן מורידים אותו במפורש:

```bash
git clone -b claude/shopify-app-hebrew-compat-i1wcji https://github.com/ofir-commits/anshilo.com.git
cd anshilo.com/mobile-app
npm install
```

`npm install` לוקח 1–3 דקות. אזהרות (`warn`) זה בסדר, שגיאות (`error`) לא.

---

## שלב 2 — הטוקן של החנות

**הטוקן הזה כבר קיים אצלכם.** לא צריך ליצור כלום — רק להעתיק.

### 2א — למצוא אותו

בניהול החנות בשופיפיי:

1. **ערוצי מכירה** (Sales channels) בתפריט הצד
2. **Headless**
3. הסטורפרונט **Shilo Mobile App**
4. הכרטיסייה **Storefront API**
5. להעתיק את **Public access token**

זו מחרוזת ארוכה של אותיות ומספרים. **לא** ה-Private access token.

### 2ב — להדביק אותו

```bash
cp .env.example .env
```

עכשיו לפתוח את הקובץ `.env` (בכל עורך טקסט — TextEdit, Notepad, VS Code)
ולהדביק את הטוקן **אחרי סימן ה-=**, בלי רווחים ובלי מרכאות:

```
EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN=abc123...
```

לשמור ולסגור.

> `.env` לא נכנס ל-git — הטוקן לא ייחשף בריפוזיטורי.

---

## שלב 3 — לבדוק שהחנות מתחברת

```bash
npx expo start
```

בטלפון: להתקין **Expo Go** (App Store / Google Play), ולסרוק את ה-QR שמופיע
בטרמינל.

### ⚠️ מיד אחרי שנפתח — ללחוץ `r` בטרמינל

זה חובה, לא המלצה. ב-Expo Go הפריסה עולה **LTR** בהרצה הראשונה, ורק טעינה
מחדש מדליקה את ה-RTL. בלי זה אתם בודקים אפליקציה אחרת מזו שתיבנה.

**מה צריך לראות:** מוצרים אמיתיים מהחנות, טאבים מימין לשמאל, טקסט צמוד לימין.

**אם רואים "האפליקציה עדיין לא חוברה לחנות"** — הטוקן לא נקלט. לחזור לשלב 2,
לוודא שאין רווח מיותר, ולהריץ מחדש `npx expo start`.

לעצור: `Ctrl+C`.

---

## שלב 4 — לחבר את הפרויקט ל-Expo

פעם אחת בלבד:

```bash
npm install -g eas-cli
eas login
eas init
```

`eas login` — עם המשתמש והסיסמה מ-expo.dev.
`eas init` — יוצר את הפרויקט בענן וכותב מזהה לתוך `app.json`. **זה השלב שלא
נעשה קודם, ולכן הבנייה הקודמת לא יצאה מהריפו הזה.**

לשמור את השינוי:

```bash
git add app.json && git commit -m "Link the EAS project" && git push
```

---

## שלב 5 — לתת את הטוקן גם לבנייה בענן

הבנייה בענן לא רואה את `.env` שבמחשב שלכם. **להחליף `הטוקן-שלכם` בטוקן האמיתי**
בשתי הפקודות:

```bash
eas env:create --name EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN --value הטוקן-שלכם --environment production --visibility plaintext
eas env:create --name EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN --value הטוקן-שלכם --environment preview --visibility plaintext
```

---

## שלב 6 — ⚠️ בדיקה אחת לפני הבנייה

ב-App Store Connect, באפליקציה הקיימת שלכם, לבדוק את ה-**Bundle ID**.

הוא **חייב** להיות בדיוק:

```
com.anshilo.shop
```

- **זהה?** ממשיכים.
- **שונה?** לפתוח את `mobile-app/app.json` ולהחליף את שני המקומות שכתוב בהם
  `com.anshilo.shop` (אחד תחת `ios`, אחד תחת `android`) ל-Bundle ID שלכם.
  אחרת אפל תדחה את ההעלאה.

---

## שלב 7 — לבנות ולשלוח ל-TestFlight

```bash
eas build --platform ios --profile production
```

הבנייה רצה בענן, 10–25 דקות. אפשר לסגור את הטרמינל — היא נמשכת. הקישום למעקב
מופיע בטרמינל ובאתר expo.dev.

בפעם הראשונה יישאלו שאלות על חתימה:

- **"Generate a new Apple Distribution Certificate?"** → **Yes**
- **"Generate a new Apple Provisioning Profile?"** → **Yes**
- יבקשו להתחבר עם ה-Apple ID שלכם → להזין

תנו ל-EAS לנהל את החתימות. זה מה שהוא טוב בו.

כשהבנייה סיימה:

```bash
eas submit --platform ios --profile production
```

זה מעלה ל-App Store Connect. אחרי 5–15 דקות של עיבוד אצל אפל, הגרסה תופיע
ב-TestFlight כ-**1.0.1**.

> הגרסה הועלתה מ-1.0.0 ל-1.0.1 בכוונה — אפל דוחה העלאה עם מספר גרסה שכבר קיים.

---

## שלב 8 — מה לבדוק בטלפון (זה החלק החשוב)

התיקונים לא נבדקו על מכשיר אמיתי. עברו על הרשימה הזאת:

| # | מה לבדוק | תקין = |
|---|---|---|
| 1 | מסך הבית | מוצרים אמיתיים מהחנות, לא מסך ריק |
| 2 | כיוון הפריסה | טאבים מימין לשמאל, טקסט צמוד לימין |
| 3 | **האייקונים** | עגלה, טלפון, זכוכית מגדלת, משאית — לא הפוכים במראה |
| 4 | **החצים** | חץ "חזרה" וחצים של "כל המוצרים" מצביעים **שמאלה** |
| 5 | מחירים | `₪149.00` |
| 6 | כפתור וואטסאפ | נפתחת שיחת וואטסאפ אמיתית עם החנות |
| 7 | עגלה | פס "הוסיפו ₪X וקבלו משלוח חינם" |
| 8 | מוצר בלי מחיר | כתוב "מחיר בטלפון" + כפתורי התקשרות, **לא** "הוספה לעגלה" |
| 9 | כפתורי מערכת | חלון השיתוף וה-Checkout בעברית, לא Done/Cancel |

**שורות 3 ו-4 הן העיקר** — שם היה הבאג, ואף אחד עוד לא ראה אותו מתוקן על מסך.
אם אייקון נראה הפוך, לצלם ולשלוח.

---

## שלב 9 — אנדרואיד (אפשר אחר כך)

```bash
eas build --platform android --profile production
```

בסוף הבנייה מופיע קישור להורדת קובץ `.aab`. להוריד אותו ולהעלות ידנית
ב-Google Play Console → **Testing → Internal testing → Create new release**.

(`eas submit` לאנדרואיד דורש חשבון שירות של גוגל — העלאה ידנית פשוטה יותר
לפעם הראשונה.)

---

## תקלות נפוצות

| השגיאה | הפתרון |
|---|---|
| `command not found: eas` | להריץ שוב `npm install -g eas-cli`. ב-Mac אולי צריך `sudo` |
| `eas.json is not valid` / שדה לא מוכר | ה-eas-cli ישן. `npm install -g eas-cli@latest` |
| "האפליקציה עדיין לא חוברה לחנות" | הטוקן. שלב 2 (מקומי) או שלב 5 (בענן) |
| מסך ריק, בלי הודעה | הטוקן תקין אבל אין הרשאות — לבדוק שב-Headless מסומנות הרשאות קריאת מוצרים |
| אפל: "build number already used" | להעלות את `version` ב-`app.json` (למשל 1.0.2) ולבנות שוב |
| הפריסה LTR | לא לחצתם `r` (שלב 3), או שאתם בודקים ב-Expo Go במקום בבנייה |
| `Invalid bundle identifier` | שלב 6 — ה-Bundle ID לא תואם ל-App Store Connect |

---

## סיכום קצר

```bash
# פעם אחת
git clone -b claude/shopify-app-hebrew-compat-i1wcji https://github.com/ofir-commits/anshilo.com.git
cd anshilo.com/mobile-app && npm install
cp .env.example .env          # ← להדביק את הטוקן בקובץ
npm install -g eas-cli && eas login && eas init

# כל בנייה מכאן והלאה
eas build --platform ios --profile production
eas submit --platform ios --profile production
```
