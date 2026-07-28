# 📱 הפעלת אפליקציית המובייל של א.נ. שילו

האפליקציה (בתיקיית `mobile-app/`) מתחברת ישירות לחנות השופיפיי: מוצרים, מחירים, מלאי ועגלה — הכל מסונכרן אוטומטית. התשלום נעשה דרך ה-checkout המאובטח של שופיפיי, כך שכל אמצעי התשלום שכבר מוגדרים בחנות עובדים גם באפליקציה.

> ⏱️ הרצה ראשונה: ~10 דקות · פרסום לחנויות האפליקציות: תהליך נפרד (בהמשך המדריך)

## שלב 1: יצירת "מפתח גישה" לחנות (Storefront API Token)

זה מה שמאפשר לאפליקציה לקרוא את המוצרים מהחנות. המפתח **ציבורי ובטוח** — הוא מאפשר רק לצפות בקטלוג ולנהל עגלה, לא לגשת להזמנות או להגדרות.

1. בניהול החנות: **Settings → Apps and sales channels**
2. לוחצים **Develop apps** (אם זו הפעם הראשונה — **Allow custom app development**)
3. **Create an app** → שם: `Mobile App` → **Create app**
4. בלשונית **Configuration**, ליד *Storefront API* לוחצים **Configure**
5. מסמנים את כל ההרשאות שמתחילות ב-`unauthenticated_read...` וגם `unauthenticated_write_checkouts` / `unauthenticated_read_checkouts` (ניהול עגלה) → **Save**
6. בלשונית **API credentials** → **Install app**
7. מעתיקים את ה-**Storefront API access token** (מתחיל בדרך כלל ב-`shpat` או מחרוזת hex)

## שלב 2: הגדרת האפליקציה

פותחים את הקובץ `mobile-app/src/config.ts` ומעדכנים:

```ts
export const SHOPIFY_CONFIG = {
  storeDomain: 'anshilo.myshopify.com',   // ← הדומיין האמיתי של החנות ב-myshopify
  storefrontAccessToken: 'xxxxx',          // ← הטוקן שהעתקנו
  apiVersion: '2025-07',
};
```

> 💡 את דומיין ה-myshopify מוצאים ב-**Settings → Domains** (השורה שמסתיימת ב-`.myshopify.com`).

באותו קובץ יש גם `STORE_INFO` — טלפון, וואטסאפ, כתובת ושעות — כדאי לעדכן.

## שלב 3: הרצה על הטלפון

צריך במחשב: [Node.js LTS](https://nodejs.org). בטלפון: אפליקציית **Expo Go** (חינם ב-App Store / Google Play).

```bash
cd mobile-app
npm install
npx expo start
```

יופיע קוד QR בטרמינל — סורקים אותו עם המצלמה (iPhone) או מתוך Expo Go (Android), והאפליקציה נטענת על הטלפון. כל שינוי בקוד מתעדכן מיידית.

## שלב 4: פרסום לחנויות האפליקציות (כשמוכנים)

הדרך המומלצת היא [EAS Build](https://docs.expo.dev/build/introduction/) של Expo — בנייה בענן בלי צורך במק:

```bash
npm install -g eas-cli
eas login          # חשבון Expo חינמי
eas build:configure
eas build --platform android   # קובץ AAB ל-Google Play
eas build --platform ios       # דורש חשבון Apple Developer (99$ לשנה)
```

מה צריך:

| חנות | חשבון | עלות |
|------|-------|------|
| Google Play | [Google Play Console](https://play.google.com/console) | 25$ חד-פעמי |
| App Store | [Apple Developer](https://developer.apple.com) | 99$ לשנה |

לאחר הבנייה מעלים את הקבצים דרך `eas submit` או ידנית בקונסולות. מדריך מלא: https://docs.expo.dev/submit/introduction/

> 🎯 **טיפ לדרך קלה יותר בהתחלה:** אפשר להפיץ את האפליקציה לעובדים/לקוחות קבועים בלי חנויות בכלל — `eas build --profile preview --platform android` יוצר APK שמתקינים ישירות.

## פתרון תקלות

| בעיה | פתרון |
|------|--------|
| "טוקן ה-Storefront API שגוי" | בודקים שהטוקן הועתק במלואו ל-`src/config.ts` ושההרשאות סומנו (שלב 1.5) |
| מסכים ריקים / אין מוצרים | בודקים ש-`storeDomain` הוא דומיין ה-myshopify (לא anshilo.com) |
| האפליקציה לא בעברית מימין-לשמאל | סוגרים לגמרי את Expo Go ופותחים מחדש (`npx expo start -c`) |
| שגיאת רשת | בודקים שהטלפון והמחשב באותה רשת WiFi |
| מחירים בלי ₪ | מוודאים שמטבע החנות ב-Settings → General הוא ILS |

## עדכון שנתי קטן שכדאי לזכור

שופיפיי משחררת גרסת API חדשה כל רבעון, וכל גרסה נתמכת שנה. פעם בשנה כדאי לעדכן את `apiVersion` ב-`src/config.ts` לגרסה עדכנית (למשל `2026-07`) ולוודא שהכל עובד.
