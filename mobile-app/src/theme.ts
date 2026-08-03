import { I18nManager, Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * מערכת העיצוב של האפליקציה — מראה (mirror) של אסימוני ה-CSS של ת'ים
 * "Shilo Pro" v2 "Clarity" באתר (theme/DESIGN-SYSTEM.md).
 *
 * הכלל: אף מסך ואף רכיב לא כותב hex, רדיוס, צל או משקל פונט בעצמו —
 * הכול מגיע מכאן. כך האתר והאפליקציה נראים כמוצר אחד.
 *
 * ההיגיון של v2:
 *  • קנבס בהיר ורגוע (page) שעליו צפים כרטיסים לבנים (surface).
 *  • צבע מותג אחד — אדום שילו — שמור לפעולות ולמחירים בלבד.
 *  • דיו כחול־כהה (ink) לכל המבנה: כותרות, סרגלים, כפתור משני.
 *  • תמונות קטלוג על לבן, ב-contain — אלה חלקי חילוף, לא צילומי אווירה.
 */

/* ==================== צבעים ==================== */

export const colors = {
  /** אדום שילו — CTA, מחיר, מבצע, מצב פעיל. לא לשטחים גדולים. */
  accent: '#D81E29',
  /** אדום כהה — מצב לחוץ של כפתור ראשי */
  accentHover: '#B3151F',
  /** גוון אדום עדין — רקע צ'יפ מבצע, בועת אייקון */
  accentSoft: '#FEF2F3',
  /** מחיר מבצע — זהה ל-accent, כמו במערכת העיצוב של האתר */
  sale: '#D81E29',

  /** דיו — כותרות, סרגלים, כפתור משני */
  ink: '#0F1729',
  /** דיו רך — מצב לחוץ של משטחי דיו */
  inkSoft: '#1B2740',

  /** לבן — כרטיסים ופאנלים */
  surface: '#FFFFFF',
  /** כינוי ל-surface — כמה מסכים כותבים colors.bg */
  bg: '#FFFFFF',
  /** קנבס העמוד שמאחורי הכרטיסים */
  page: '#F4F6F9',
  /** רקע מדור מתחלף */
  surfaceAlt: '#F7F9FC',
  /** בארות תמונה, שלדי טעינה, שדות קלט */
  surfaceSunken: '#EDF1F6',

  /** גוף הטקסט */
  text: '#16202F',
  /** מטא, יצרן, טקסט עזר */
  textMuted: '#5B6779',

  /** קווי שערה וגבולות כרטיס */
  border: '#E3E8EF',
  /** גבול עם משקל — שדות קלט, מפרידים */
  borderStrong: '#848E9F',

  /** במלאי */
  success: '#0B7A46',
  successSoft: '#E8F6EE',
  /** מלאי מתדלדל */
  warning: '#B45309',
  warningSoft: '#FDF4E7',
  /** שגיאות, אזל מהמלאי */
  danger: '#C81E1E',
  dangerSoft: '#FCECEC',
  /** ענבר — תגית "מבצע" */
  highlight: '#FFB224',
  highlightSoft: '#FFF6E4',
  /** טקסט על ענבר (ניגודיות AA) */
  onHighlight: '#3D2600',

  /** טקסט על אדום */
  onAccent: '#FFFFFF',
  /** טקסט על דיו */
  onInk: '#EEF1F6',
} as const;

/* ==================== צורה ==================== */

export const radius = {
  /** שדות, תגיות, אלמנטים קטנים */
  sm: 8,
  /** כפתורים, קלט, בועות */
  base: 10,
  /** כרטיסים */
  card: 16,
  /** משטחים גדולים — הירו, גלריה */
  lg: 22,
  /** פיל */
  pill: 999,

  /** כינוי ל-base — כמה מסכים כותבים radius.md */
  md: 10,
} as const;

/* ==================== ריווח ==================== */

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/* ==================== מגע וקווים ==================== */

export const layout = {
  /** יעד מגע מינימלי — לא לרדת מזה אף פעם */
  touchMin: 44,
  /** יעד מגע קומפקטי (עם hitSlop משלים) */
  touchCompact: 40,
  /** עובי קו שערה */
  hairline: 1,
  /** רוחב פס המבטא שמעל כותרות מדור */
  ruleWidth: 26,
  /** עובי פס המבטא */
  ruleHeight: 3,
} as const;

/* ==================== תנועה ==================== */

export const motion = {
  fast: 140,
  base: 240,
} as const;

/* ==================== טיפוגרפיה ==================== */

/**
 * פונט המערכת בכל פלטפורמה (San Francisco ב-iOS, Roboto באנדרואיד).
 * שתיהן מכסות עברית במלואה, ולכן אין כאן שום תלות בטעינת פונטים.
 */
export const fontFamily: TextStyle['fontFamily'] = Platform.select({
  ios: 'System',
  default: undefined,
});

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  black: '800',
} as const satisfies Record<string, TextStyle['fontWeight']>;

/**
 * סקאלת הגדלים — היררכיה זהה לאתר.
 * (נשמרים גם השמות h1/h2/h3/body/small/tiny לשימוש ישיר ב-fontSize.)
 */
export const typography = {
  /** כותרת הירו */
  display: 30,
  h1: 26,
  h2: 21,
  h3: 17,
  body: 15,
  small: 13,
  tiny: 11,
} as const;

/** גובה שורה נוח לעברית — אותיות גבוהות, בלי ניקוד */
const lh = (size: number, ratio = 1.45) => Math.round(size * ratio);

/**
 * ארבע דרגות הטקסט של המערכת: display / heading / body / meta.
 * לשימוש עם spread בתוך StyleSheet.create.
 */
export const type = {
  display: {
    fontFamily,
    fontSize: typography.display,
    lineHeight: lh(typography.display, 1.28),
    fontWeight: fontWeight.black,
    color: colors.ink,
  },
  h1: {
    fontFamily,
    fontSize: typography.h1,
    lineHeight: lh(typography.h1, 1.3),
    fontWeight: fontWeight.black,
    color: colors.ink,
  },
  heading: {
    fontFamily,
    fontSize: typography.h2,
    lineHeight: lh(typography.h2, 1.32),
    fontWeight: fontWeight.black,
    color: colors.ink,
  },
  subheading: {
    fontFamily,
    fontSize: typography.h3,
    lineHeight: lh(typography.h3, 1.38),
    fontWeight: fontWeight.bold,
    color: colors.ink,
  },
  body: {
    fontFamily,
    fontSize: typography.body,
    lineHeight: lh(typography.body, 1.6),
    fontWeight: fontWeight.regular,
    color: colors.text,
  },
  bodyStrong: {
    fontFamily,
    fontSize: typography.body,
    lineHeight: lh(typography.body, 1.5),
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  small: {
    fontFamily,
    fontSize: typography.small,
    lineHeight: lh(typography.small, 1.55),
    fontWeight: fontWeight.regular,
    color: colors.text,
  },
  meta: {
    fontFamily,
    fontSize: typography.small,
    lineHeight: lh(typography.small, 1.5),
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
  metaSmall: {
    fontFamily,
    fontSize: typography.tiny,
    lineHeight: lh(typography.tiny, 1.5),
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
  /** "eyebrow" — שורת על קטנה מעל כותרת. בעברית: בלי uppercase ובלי ריווח אותיות. */
  eyebrow: {
    fontFamily,
    fontSize: typography.tiny,
    lineHeight: lh(typography.tiny, 1.4),
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
  },
} as const satisfies Record<string, TextStyle>;

/**
 * הערך שצריך לבקש כדי שטקסט ייצמד **לימין** בפועל.
 *
 * זה לא באג באפליקציה אלא התנהגות מתועדת של React Native: כש-
 * `doLeftAndRightSwapInRTL` דלוק — וזו ברירת המחדל, ובאייפון `RCTI18nUtil`
 * מדליק אותה מחדש בכל עלייה — הרנדרר **מחליף** `textAlign` שמאל↔ימין תחת RTL.
 * שני הפלטפורמות עושות את זה:
 *
 * - אנדרואיד, `TextAttributeProps.getTextAlignment`:
 *   `"right" -> if (isRTL) Gravity.LEFT else Gravity.RIGHT`
 * - אנדרואיד/Fabric, `TextLayoutManager.getTextAlignment`:
 *   `"right"` → `ALIGN_OPPOSITE`, וההופכי של פסקה בעברית הוא שמאל
 * - iOS: `NSTextAlignmentRight` מוחלף ל-`NSTextAlignmentLeft`
 *
 * כלומר סטייל שכתוב בו `textAlign: 'right'` מגיע למסך כ**שמאל**. זה מה שנמדד
 * על המכשיר: בלוח המחלקות כל הכותרות — `אבטחה`, `NOA`, `CLICK SWITCH`,
 * `אביזרי ניקוי` — יצאו צמודות לשמאל, באופן אחיד ובלי קשר לשפה. ומה שכן יצא
 * מיושר לימין באפליקציה (כותרות המסכים, `SectionHeader`) יושר שם על ידי
 * flexbox — `alignItems: 'flex-start'` עוטף את הטקסט וממקם אותו בהתחלה, שהיא
 * ימין ב-RTL — ולא על ידי `textAlign` בכלל.
 *
 * לכן מבקשים את הערך ש**שורד** את ההחלפה. זה מתקן את עצמו: אם ההחלפה כבויה,
 * או שהאפליקציה רצה LTR, הביטוי מחזיר `'right'` ישירות.
 *
 * באנדרואיד `'left'` מתנהג כיישור **טבעי** (לפי התו החזק הראשון) ולא כשמאל
 * קשיח, ולכן מחרוזת שמתחילה בלטינית או בספרה עוד צריכה את `rtlText` למטה.
 * שני החצאים משלימים זה את זה: `alignEnd` מטפל בעברית, `rtlText` בשאר.
 */
const SWAPS_LEFT_RIGHT = I18nManager.isRTL && I18nManager.doLeftAndRightSwapInRTL;
export const alignEnd: TextStyle['textAlign'] = SWAPS_LEFT_RIGHT ? 'left' : 'right';

/**
 * יישור לשדות קלט — `TextInput` בלבד, לא `Text`.
 *
 * ההחלפה של left/right תחת RTL, שבגללה קיים `alignEnd`, חלה על `Text` אבל
 * **לא** על הטקסט המוקלד ב-`TextInput`:
 *
 * - iOS/Fabric: הטקסט החי של השדה עובר דרך `defaultTextAttributes`, ושם
 *   ההחלפה מותנית ב-layoutDirection שלא מאוכלס במסלול הזה — הערך נשאר פיזי.
 * - אנדרואיד: `ReactTextInputManager` ממפה `"right" -> Gravity.RIGHT` ישירות,
 *   בלי בדיקת RTL — פיזי גם כן.
 *
 * נמדד על מכשיר בשדה ההערות בעגלה: עם `alignEnd` ('left' תחת ההחלפה)
 * ה-placeholder נפל ימינה (הוא UILabel ביישור טבעי) אבל הטקסט שהוקלד נצמד
 * לשמאל. לכן לשדות קלט מבקשים 'right' פיזי, ולטקסט רגיל ממשיכים עם `alignEnd`.
 */
export const inputAlign: TextStyle['textAlign'] = 'right';

/** עברית מיושרת לימין — הצירוף הזה חוזר בכל מסך */
export const rtl = {
  text: { textAlign: alignEnd, writingDirection: 'rtl' },
  center: { textAlign: 'center', writingDirection: 'rtl' },
} as const satisfies Record<string, TextStyle>;

/**
 * מוסיף U+200F, RIGHT-TO-LEFT MARK, בתחילת מחרוזת שמגיעה מהחנות.
 *
 * זה החצי השני של `alignEnd` למעלה, ולא תחליף לו. `alignEnd` מטפל ביישור;
 * הפונקציה הזאת מטפלת ב**כיוון הבסיס של הפסקה**, ושני דברים תלויים בו:
 *
 * 1. באנדרואיד `'left'` (הערך ש-`alignEnd` מבקש תחת RTL) מתורגם ל-
 *    `ALIGN_NORMAL`, וזה יישור **טבעי** — לפי התו החזק הראשון. מחרוזת שמתחילה
 *    בעברית תיפול לימין מעצמה, אבל `CLICK SWITCH` או `3 תוצאות` ייפלו שמאלה.
 *    הסימן קובע שהתו החזק הראשון הוא RTL, ולכן שתיהן נופלות לימין.
 * 2. בשתי הפלטפורמות, סדר הרכיבים בתוך מחרוזת מעורבת נקבע לפי כיוון הבסיס.
 *    `סיקה - sika` בפסקה שכיוון הבסיס שלה LTR מסודר אחרת מאותה מחרוזת בפסקה
 *    RTL — המקף והמילה הלטינית מחליפים מקום.
 *
 * הסימן בלתי נראה, עולה תו אחד, ואינו הופך את סדר הקריאה בתוך הרצף הלטיני:
 * `CLICK SWITCH` נקרא כרגיל, כי אלגוריתם ה-bidi מטפל ברצף בנפרד.
 *
 * להשתמש על **טקסט שמגיע מהחנות או מהודעת שגיאה** — שמות מוצרים, מחלקות,
 * מותגים, יצרן, תיאורים, מספרי הזמנות ותאריכים. מחרוזות עבריות שכתובות בקוד
 * לא צריכות את זה: התו הראשון שלהן עברי ממילא.
 *
 * **לא** להשתמש על מחירים. `formatMoney` מחזיר `₪1,234.00`, וכיוון בסיס RTL
 * יזיז את סימן השקל לצד הלא נכון.
 */
export function rtlText(value: string | null | undefined): string {
  if (value == null) return '';
  const trimmed = value.trim();
  if (trimmed === '') return '';
  return `\u200F${trimmed}`;
}

/** מספרים בעמודות (מחירים, שעות) — ספרות ברוחב אחיד */
export const numeric = {
  fontVariant: ['tabular-nums'],
} as const satisfies TextStyle;

/* ==================== עומק ==================== */

const SHADOW_COLOR = colors.ink;
const isAndroid = Platform.OS === 'android';

/**
 * סקאלת הצללים xs/sm/md/lg — מקבילה ל-`--shadow-*` באתר.
 * באנדרואיד משתמשים ב-elevation (הצל מנוהל על ידי המערכת),
 * ב-iOS/web בשדות shadow*.
 */
function shadow(height: number, blur: number, opacity: number, elevation: number): ViewStyle {
  if (isAndroid) return { elevation, shadowColor: SHADOW_COLOR };
  return {
    shadowColor: SHADOW_COLOR,
    shadowOffset: { width: 0, height },
    shadowOpacity: opacity,
    shadowRadius: blur,
  };
}

export const shadows = {
  /** הרמה בעובי קו שערה */
  xs: shadow(1, 2, 0.05, 1),
  /** כרטיס במנוחה */
  sm: shadow(2, 5, 0.07, 2),
  /** כרטיס מורם / תפריט נפתח */
  md: shadow(6, 14, 0.1, 6),
  /** מגירה / סרגל צף */
  lg: shadow(14, 28, 0.16, 12),

  /** כינויים סמנטיים — כמה מסכים כותבים shadows.card / shadows.raised */
  card: shadow(2, 5, 0.07, 2),
  raised: shadow(6, 14, 0.1, 6),
} as const;

/* ---------------------------------------------------------------------------
 * רשת מוצרים
 * ------------------------------------------------------------------------- */

/**
 * מספר העמודות ברשת, לפי רוחב החלון.
 *
 * הרשתות בכל המסכים היו נעולות על שתי עמודות, וזה בסדר בטלפון לאורך אבל
 * נשבר בכל מצב אחר: מ-Android 16 המערכת מתעלמת מנעילת הכיוון במכשירים עם
 * מסך גדול — מתקפלים וטאבלטים — ולכן האפליקציה *תוצג* לרוחב גם אם ביקשנו
 * לאורך. שני כרטיסים על מסך של 1,000 נקודות הם כרטיס ברוחב חצי מסך, עם
 * תמונה מוגדלת מעבר לרזולוציה שלה.
 *
 * הסף נבחר לפי רוחב כרטיס נוח ולא לפי שמות מכשירים: כרטיס מוצר קריא הוא
 * בסביבות 160 עד 240 נקודות, ומכאן נגזרות העמודות.
 */
export function gridColumns(width: number): number {
  if (width >= 1200) return 5;
  if (width >= 900) return 4;
  if (width >= 600) return 3;
  return 2;
}

/**
 * רוחב אריח בודד ברשת, אחרי הפחתת הריפוד בצדדים והמרווחים שבין העמודות.
 *
 * המרווחים הם `columns - 1` ולא `columns` — טעות של מרווח אחד מייצרת גלישה
 * של האריח האחרון מחוץ למסך, וזה נראה בדיוק כמו תקלת פריסה.
 */
export function gridItemWidth(
  width: number,
  columns: number,
  sidePadding: number = spacing.lg,
  gutter: number = spacing.md
): number {
  return (width - sidePadding * 2 - gutter * (columns - 1)) / columns;
}
