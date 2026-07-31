# anshilo-assistant — השרת של "המומחה של שילו"

שרת ה-API של עוזר הקניות החכם של [anshilo.com](https://anshilo.com) — א.נ. שילו בע"מ.
זהו פרויקט Expo עם API Routes בלבד (בלי מסכים): נקודת הקצה `/chat` מריצה את
המודל של Anthropic בלולאה אג'נטית מול הקטלוג של Shopify, ומחזירה תשובה בעברית
יחד עם כרטיסי מוצר מוכנים להצגה באפליקציה ובאתר.

## נקודות הקצה

| נתיב | מתודה | תיאור |
| --- | --- | --- |
| `/health` | GET | בדיקת חיים — מחזיר `{"ok":true}` |
| `/chat` | POST | שיחה עם העוזר — מקבל `{ messages, source? }` ומחזיר `{ reply, products }` |

## פריסה (EAS Hosting)

```bash
cd assistant-server
npm install
npx expo export -p web
eas deploy --environment production
```

או בקיצור, אחרי ההתקנה הראשונה:

```bash
npm run deploy
```

## משתני סביבה (חובה לפני הפריסה הראשונה)

יוצרים את המשתנים בסביבת production של EAS:

```bash
eas env:create --environment production --name ANTHROPIC_API_KEY --value sk-ant-...
eas env:create --environment production --name SHOPIFY_STOREFRONT_TOKEN --value <טוקן>
```

| משתנה | חובה | הסבר |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | כן | מפתח API של Anthropic (Console → API Keys). בלעדיו `/chat` יחזיר 503 |
| `SHOPIFY_STOREFRONT_TOKEN` | כן | טוקן Storefront API של החנות — **אותו ערך בדיוק** כמו `EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN` בקובץ `mobile-app/.env` |
| `ASSISTANT_MODEL` | לא | מזהה מודל של Anthropic. ברירת מחדל: `claude-sonnet-5` |

המפתחות נשארים בצד השרת בלבד — הם לעולם לא נחשפים לאפליקציה או לאתר.

## בדיקה עם curl

בדיקת חיים:

```bash
curl https://<הכתובת-שלכם>.expo.app/health
```

שיחה עם העוזר:

```bash
curl -X POST https://<הכתובת-שלכם>.expo.app/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"אני צריך מברגה לשימוש ביתי, מה יש לכם?"}],"source":"app"}'
```

תשובה תקינה נראית כך:

```json
{
  "reply": "טקסט התשובה בעברית...",
  "products": [ { "id": "...", "handle": "...", "title": "...", "...": "..." } ]
}
```

## חיבור לאפליקציה ולאתר

בסיום `eas deploy` מתקבלת כתובת קבועה בצורת `https://....expo.app`.
את הכתובת הזו מזינים בשני מקומות:

1. **האפליקציה** — משתנה הסביבה `EXPO_PUBLIC_ASSISTANT_URL` בקונפיגורציה של
   `mobile-app` (קובץ `.env`).
2. **האתר** — הגדרת ה-theme המקבילה של עוזר הקניות בחנות Shopify.

## הערות

- CORS: רק `https://anshilo.com`, `https://www.anshilo.com` ו-
  `https://3007b3-4.myshopify.com` מורשים מהדפדפן. בקשות בלי Origin
  (האפליקציה, curl) עוברות תמיד.
- העוזר ממליץ אך ורק על מוצרים שנמצאו בקטלוג דרך ה-Storefront API — הוא לא
  ממציא מוצרים, מחירים או מלאי.
