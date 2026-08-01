# דוח בריאות הקטלוג — א.נ. שילו

נבדק מול הנתונים החיים של החנות (anshilo.com) לקראת העלאת העיצוב החדש.
העיצוב החדש מטפל ברוב הדברים האלה בצורה חכמה, אבל תיקון בנתונים עצמם ייתן
תוצאה טובה יותר — גם לגוגל וגם ללקוחות.

## תמונת מצב

| מדד | מספר |
|---|---|
| מוצרים פעילים | 1,918 |
| קטגוריות | 186 |
| מוצרים בטיוטה (לא באתר) | 50 |
| מוצרים בארכיון | 1 |
| מטבע | ILS |

---

## 1. 150 מוצרים פעילים במחיר ₪0 — הבעיה הדחופה

כ-8% מהקטלוג מוגדר במחיר אפס. לדוגמה: *מסגרת BE לבנה 3 מודול ניסקו סוויץ'* —
כל שבע הווריאציות שלה ב-₪0.00.

**למה זה קריטי:** לקוח יכול להוסיף לעגלה ולסיים הזמנה בלי לשלם. בנוסף, גוגל
פוסל מוצרים במחיר 0 מ-Google Shopping, והמוצר נראה שבור.

**מה עשינו בעיצוב:** במקום "₪0.00" מוצג טיפול של "מחיר בטלפון / לפרטים",
וכפתור ההוספה לעגלה מוחלף בפנייה ישירה אלינו. זה מציל את החוויה — אבל לא
מחליף תמחור אמיתי.

**מה כדאי לעשות:** להשלים מחירים למוצרים האלה, או להעביר אותם ל-Draft עד
שיהיה מחיר. אפשר לסנן אותם בניהול החנות בחיפוש `price:0 status:active`.

## 2. 151 מוצרים פעילים שאזלו מהמלאי

כל מוצר כזה הוא ביקור שהולך לאיבוד.

**מה עשינו בעיצוב:** בכל מוצר שאזל מוצג טופס "עדכנו אותי כשחוזר למלאי" שנשלח
לתיבת הפניות של החנות עם שם המוצר, הווריאציה והמקט — בלי צורך באפליקציה — וגם
קישור לבדיקה מיידית בוואטסאפ, כי לרוב הפריט כן נמצא במחסן.

**מה כדאי לעשות:** לעדכן מלאי למי שכן נמצא במחסן. מוצר שלא יחזור — להעביר
לארכיון כדי שלא יתפוס מקום בקטלוג ובחיפוש.

## 3. לפחות 15 קטגוריות מפורסמות בלי מוצרים

בונדקס · גלאים ושעונים · חוליות · חמת · נירלט · ראסט אוליום · ספקס · סיגנט ·
מיתוג · תעשייה · פרזול וברגיה · נורות · תאורת חוץ OUTDOOR · תאורת פנים INDOOR ·
תאורה לאווירה נפיצה · מלטשות ומולטיטול · אביזרים נלווים למכונות לחץ

חלקן מקושרות מהתפריט, כך שלקוח שנכנס מגיע לעמוד ריק. לגוגל אלה עמודי "thin
content" שפוגעים בדירוג.

**מה עשינו בעיצוב:** התפריט החדש והרצועות בדף הבית מדלגים על קטגוריות ריקות,
ועמוד קטגוריה ריק מציג מסך מכוון עם חיפוש וקישורים למחלקות סמוכות במקום כלום.

**מה כדאי לעשות:** לשייך מוצרים לקטגוריות האלה, או להוריד אותן מפרסום
(Unpublish). זה גם מקצר את רשימת 186 הקטגוריות למשהו נוח יותר לתחזוקה.

## 4. שגיאת נתונים בכמות מלאי

*כפפות אצבע מילווקי Milwaukee 48229732* מוגדר עם מלאי של **48,229,732 יחידות** —
מספר הדגם הוזן בשדה הכמות.

**מה כדאי לעשות:** לתקן את הכמות. שווה גם לחפש מקרים דומים: מוצרים עם מלאי
מעל 10,000 הם כמעט תמיד טעות הקלדה.

## 5. מבנה התפריט

התפריט הקיים (`main-menu`) לא מאוזן: ל"כלי עבודה" יש עץ מלא בשלוש רמות, ולשמונה
הפריטים האחרים אין תתי-קטגוריות בכלל — חלקם אפילו מפנים לעמודי תוכן ולא
לקטגוריות. בתפריט `שקעים ומפסקים` חמש כותרות שונות מפנות כולן לאותה קטגוריה.

**מה עשינו:** נבנה תפריט חדש בשם **תפריט ראשי — שילו 2026** (`shilo-2026-main`)
עם 12 מחלקות ראשיות, כולן מסועפות לשלוש רמות ומקושרות לקטגוריות אמיתיות בלבד.
התפריט הקיים **לא נגעו בו** — האתר החי ממשיך לעבוד בדיוק כמו קודם.

## 6. שדות מוצר חסרים לסינון

לרוב המוצרים אין `Product type` או תגיות, ולכן הסינון בעמודי קטגוריה מתבסס
בעיקר על מותג, מחיר וזמינות.

**מה כדאי לעשות:** להוסיף תגיות לפרמטרים שלקוחות מחפשים בהם — למשל מתח סוללה
(12V / 18V / 40V), קוטר דיסק, נפח באריזה, סוג הברגה. כל תגית כזו הופכת מיד
לפילטר בעמוד הקטגוריה.

## 7. עמודי תוכן כפולים או שגויים

- שני עמודי "הצהרת נגישות" (`הצהרת-נגישות` ו-`הצהרת-נגישות-1`) — התפריט מקשר לשני.
- עמוד שנקרא "404" עם הכתובת `שקעים-ומפסקים` — כנראה שאריות מניסוי.
- קטגוריה בשם `יעקבי (Copy)` עם 182 מוצרים — נראה כמו כפילות שדורשת החלטה.

**מה כדאי לעשות:** לאחד ולהסיר. כל עמוד כפול מפצל את הדירוג בגוגל בין שתי כתובות.

---

## למה זה משנה גם למול המתחרים

הת'ים החי כרגע (Empire + PageFly) טוען קבצים כבדים מאוד: `theme.css` שוקל 655KB,
`empire.js` 1.4MB, ולצידם קבצי PageFly ו-ecom-preview נוספים — יותר מ-2MB של CSS
ו-JavaScript לפני שהתמונות בכלל התחילו להיטען.

בת'ים החדש ה-CSS מפוצל לפי סקשן: כל עמוד טוען את מערכת העיצוב (כ-45KB) ועוד
שניים-שלושה קבצי סקשן — בסך הכל בסדר גודל של 60–90KB CSS ופחות מ-40KB JavaScript
לעמוד, בלי תלות בבילדר חיצוני. (סך כל קבצי הת'ים הוא כ-190KB CSS ו-80KB JS, אבל
אף עמוד לא טוען את כולם.)

זה מתורגם ישירות למהירות טעינה, לציון Core Web Vitals ולדירוג בגוגל — ובחנות
של 1,918 מוצרים, מהירות וחיפוש הם היתרון התחרותי האמיתי.

## Department images do not share a background (theme cannot fix this)

`המחלקות שלנו` on the homepage (the `category-rail` section) shows twelve
collection images, and they were not produced as a set:

| Collection | Image | Size |
|---|---|---|
| כלי עבודה | `4130a548…webp` | 1080×1080 |
| ציוד חשמלי | `f082ae24…jpg` | 1080×1080 |
| תאורה | `8d6e9263…jpg` | 1080×1080 |
| אינסטלציה | `collection-1.1.png` | 1080×1080 |
| ניקיון ותחזוקת הבית | `collection-2.png` | 1080×1080 |
| צבע | `collection-5.1.png` | 1080×1080 |
| עץ | `collection-7.png` | 1080×1080 |
| ציוד טכני | `Untitled_design_12.png` | 1080×1080 |
| **כלים נטענים** | `kodhot-300x300.webp` | 900×900 |
| **ברזים** | `Cat_495013_8922.jpg` | 800×800 |
| **סולמות** | `e23d5580…_333x500.webp` | **333×500, portrait** |

The three in bold are raw product photographs rather than designed tiles, and the
owner reported that their backgrounds do not match the rest. **No stylesheet can
change the background baked into a JPEG.** Two approaches were tried and must not
be tried again:

- **An icon tile per department** — uniform by construction, since the theme draws
  every mark. The owner rejected it on looks and asked for the photographs back.
  `tile_style` now defaults to `image`; the icon branch survives only as a fallback.
- **A `filter` or a `mix-blend-mode` over the images.** A filter is a per-pixel
  function of twelve different inputs: it compresses their differences but never
  removes them, and any dose strong enough to hide a colour step also fogs every
  product in the row — `contrast(0.95)` moves white only to `#F8F8F8`, and reaching
  the well colour needs about `0.88`, which visibly greys the tools baked into the
  designed tiles. `multiply` converges on pure white only (`1 x C = C`), so it would
  unify the three raw shots and turn the eight designed fields into eight different,
  muddier colours. `screen` has white as a fixed point and so does nothing at all to
  the raw shots. `color`/`hue` unify the hue axis and leave lightness untouched —
  which is precisely the difference the owner is looking at.

Also worth recording: the "identical well" this document previously described
**never rendered**. It put `padding` on `.category-rail__media`, but `base.css`
absolutely positions `.media > img` with `inset: 0`, and an absolutely positioned
child resolves `inset` against its containing block's *padding* box — so the image
covered the padding and the hairline sat directly under the photo's own edge.

**Superseded (round 5).** The "one well, one window" treatment that replaced it
(sunken plate + inset white window + hairline + vignette) shipped and the owner
read it as a square inside a square. What ships now, at the owner's request, is
**one flat coloured field**: a single plate painted with the new `--color-tile-bg`
token (setting "רקע אריחי המחלקות", default amber `#FFB224`), 8% uniform padding,
the image `contain`ed directly on it — no inner window, no frame, no vignette.

The blanket-blend-mode rejection above still holds, but selectively `multiply` is
exactly right: it maps pure white onto the plate colour (`1 × C = C`), so an
opaque product photo shot on white melts into the amber seamlessly, while the
product itself survives. The rail therefore gained a per-block checkbox
("צילום מוצר על רקע לבן - מיזוג לרקע") that applies `mix-blend-mode: multiply`
(+ `isolation: isolate` so the blend stays inside the plate). It is switched ON
for exactly the three raw photo tiles — כלים נטענים, ברזים, סולמות — in
`templates/index.json`, and OFF for the designed tiles, whose baked-in field
colours multiply would tint and darken. Nobody in this environment can render the
images (`cdn.shopify.com` is proxy-blocked), so the ON/OFF split follows the file
metadata above; **a human should eyeball the row once** and flip a checkbox in the
theme editor if a tile was misclassified.

The same amber token is now also the field behind the header mega-menu thumbnails
(`.nav-thumb` in `assets/section-header.css`). There it ships **without** any
blend: the thumb pool includes brand wordmarks (the מותגים panel), and multiply
would discolour them — Makita's teal multiplies to a dark green. Menu items carry
no per-item flags, so selective blending is not possible there.

The real fix is still to replace the three photo sources with designed tiles
matching the `collection-N.png` set. The `סולמות` one is worth replacing
regardless: at 333×500 it is the only portrait image in a square grid, so its
subject reads smaller than the others inside `contain`.

### Menu collections with no image at all (header thumbnails)

The mega-menu shows a thumbnail per entry **only when every sibling in that panel
group has a real collection image** — a row where some entries have art and some
do not reads as broken, and the first-product fallback was checked against the
live catalogue and rejected: ניקוי כללי וחיטוי and ניקוי רצפות share the exact
same first product (דלי הפלא VILEDA), as do רסטוליום and תרסיסי צבע (ספריי 2X),
so the same photo would render twice inside one panel.

These 14 menu collections have **no image**; because of them, four panels
currently render text-only (ניקיון ותחזוקה entirely; the level-2 rows of
אינסטלציה וברזים, צבע ואיטום and קמפינג ופנאי). Upload an image per collection
in the admin and the thumbnails appear on their own — no code change needed:

ניקוי כללי וחיטוי · ניקוי רצפות · אביזרי ניקוי · כביסה · מטבח וכלים · בישום ·
רצפות · רהיטים ושטיחים · מתכות ותכשיטים · תרסיסי צבע · רסטוליום ·
אמבטיה ושירותים · אמריקן איגל · המבצעים שלנו (משפיע רק על שיתופים, לא על התפריט)

Note that no agent has been able to *see* any of these images — `cdn.shopify.com`
is blocked from the build environment, and `WebFetch` against it returns 403. Every
statement above is from file metadata plus the owner's own report.

---

# מדידה מחדש — 1.8.2026

נמדד מול ה-Storefront API החי, על 1,867 המוצרים שהערוץ שהאפליקציה קוראת ממנו
מפרסם. **המספרים מהסבב הקודם מדויקים עד המוצר האחרון** ולא השתנו:

| | נמדד עכשיו | תועד קודם |
|---|---|---|
| מוצרים במחיר ₪0 | **150** | 150 |
| אזלו מהמלאי | **151** | 151 |
| קטגוריות מפורסמות ריקות | **18** | ~15 |
| בלי תמונה ראשית | **29** | לא נמדד קודם |
| מלאי חשוד | **1** | 1 |

## המלאי החשוד — עכשיו יש הוכחה ולא השערה

`כפפות אצבע מילווקי Milwaukee 48229732` — הכמות במלאי היא **48,229,732**,
והמספר הזה הוא **מספר הדגם שמופיע בשם המוצר עצמו**. מישהו הקליד את המקט
בשדה הכמות. תוקן בשורה אחת באדמין.

## 18 הקטגוריות הריקות — ומה שחשוב באמת לגביהן

מיתוג · גלאים ושעונים · תעשייה · נורות · תאורת חוץ OUTDOOR · תאורת פנים
INDOOR · תאורה לאווירה נפיצה · מלטשות ומולטיטול · מסור שרשרת מוטורי · פרזול
וברגיה · ראסט אוליום · סיגנט · בונדקס · חוליות · נירלט · חמת · ספקס ·
אביזרים נלווים למכונות לחץ

**בת'ים החדש אף אחת מהן אינה נגישה מהניווט.** נבדק משני כיוונים בלתי
תלויים: הת'ים משתמש ב-`shilo-2026-main` בהדר וב-`link-list-3` בפוטר, ו-
`link-list-3` מכיל עמודים ומדיניות בלבד בלי שום קטגוריה; ובנוסף, טעינת
העמוד החי על v8 והוצאת כל ה-`href` מהדף לא מצאה אף אחת מ-18 ההנדלים.

**הת'ים החי כן מקשר ארבע מהן** — נורות, תאורת חוץ, תאורת פנים ותאורה
לאווירה נפיצה — מתוך `link-list-2`, כפי שמתועד. בדיקת העמוד החי לא מצאה
אותן, אבל זו כנראה בדיקה חסרה ולא הפרכה: `link-list-2` עשוי להיות מרונדר
רק בפוטר, בעמוד אחר, או להיבנות ב-JS. אין דרך לשלול את זה מכאן, ולכן
**האזהרה הקיימת בעינה עומדת: אל תבטלו פרסום שלהן כל עוד הת'ים הישן חי.**

**המסקנה המעשית וזו החדשה כאן:** ברגע שהת'ים החדש יפורסם, ארבע קטגוריות
התאורה מפסיקות להיות מקושרות מעצמן, כי הת'ים החדש אינו משתמש ב-`link-list-2`
בכלל. כלומר **הפרסום פותר את הבעיה הזאת בעצמו** — אין צורך לגעת בקטלוג לפני,
ואחריו ביטול הפרסום שלהן נהיה בטוח.

## מה כן שווה לתקן, לפי סדר

1. **המלאי של 48,229,732** — שדה אחד, מטעה לקוח שרואה "במלאי" בכמות
   אבסורדית.
2. **29 מוצרים בלי תמונה ראשית** — בקטלוג שכולו ויזואלי זה החור הבולט
   ביותר. בת'ים ובאפליקציה הם מקבלים מסגרת ריקה.
3. **150 מוצרים במחיר ₪0** — הת'ים מציג להם "מחיר בטלפון" ולא ₪0, ולכן זה
   לא נראה שבור, אבל זה מונע מהם להופיע בסינון לפי מחיר ובמיון.
4. **151 שאזלו** — עניין תפעולי, לא באג.

## נבדק: מה מהרשימה הזאת בכלל ניתן לתיקון מצד הקוד — התשובה היא כלום

נמדד ב-1.8.2026 אחרי הבקשה "תתקן את כל מה שאתה יכול". כל פריט נבדק אם הוא
עיוות נתונים שאפשר לתקן חד-משמעית או מידע עסקי שרק הבעלים מחזיק:

| פריט | נבדק | מסקנה |
|---|---|---|
| 29 בלי תמונה | **0 מהם** מחזיקים תמונה אחרת שאפשר לקדם לראשית | כולם באמת בלי שום תמונה. צריך צילום |
| 150 במחיר ₪0 | **0 מהם** מחזיקים וריאנט במחיר אמיתי | כל הוריאנטים ב-0. צריך מחיר |
| מלאי 48,229,732 | הכמות האמיתית נמחקה על ידי המקט | לנחש ערך גרוע מלהשאיר |
| 18 קטגוריות ריקות | לא מקושרות מהת'ים החדש | נפתר מעצמו בפרסום |
| 151 שאזלו | — | תפעול |

**ושתי בדיקות שהורידו את הדחיפות של שניים מהם:**

- **המלאי האבסורדי אינו נראה ללקוח.** `product-card.liquid:77` מרנדר מספר
  רק כש-`low_stock_qty <= settings.low_stock_threshold` (5). 48,229,732 לא
  עובר את התנאי, ולכן הלקוח רואה "במלאי" בלבד. זו בעיית היגיינת נתונים
  ולא באג גלוי.
- **מוצר בלי תמונה כבר מתדרדר בחן בשני הצדדים.** הת'ים מרנדר
  `placeholder_svg_tag` (`product-card.liquid:125`), והאפליקציה מרנדרת
  אייקון `image-outline` — גם בכרטיס (`ProductCard.tsx:85`) וגם בגלריה
  בעמוד המוצר. אין מסגרת שבורה בשום מקום.

כלומר הרשימה הזאת אינה חוב טכני אלא **עבודת קטלוג**: צילומים, מחירים
וספירת מלאי. אין מה לתקן בקוד, וכל תיקון "אוטומטי" כאן היה המצאת נתונים.
