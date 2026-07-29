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

What ships instead is **one well, one window**: a uniform sunken plate
(`--color-surface-sunken`) that is ours and always visible, with the image inset by
12.5% into a smaller white square window carrying the same hairline and the same
faint corner vignette on all twelve. `object-fit: contain` is kept, so nothing is
cropped. Their pixels drop from roughly 74% of the tile's visual field to about 40%,
and what is left is a small framed chip rather than "the background". This does not
make the pixels match — it stops the mismatch from reading as the background.
`assets/section-category-rail.css` carries the full reasoning.

The real fix is to replace those three collection images with designed tiles
matching the `collection-N.png` set. Until then the row will never be perfectly
uniform. The `סולמות` one is worth replacing regardless: at 333×500 it is the only
portrait image in a square grid. Even with the window treatment, `contain` leaves
`סולמות` at 66.6% of its window's inline size, so that tile's subject still reads
slightly smaller than the others.

Note that no agent has been able to *see* any of these images — `cdn.shopify.com`
is blocked from the build environment, and `WebFetch` against it returns 403. Every
statement above is from file metadata plus the owner's own report.
