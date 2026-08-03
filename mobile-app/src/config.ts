/**
 * הגדרות החיבור לחנות השופיפיי + פרטי החנות האמיתיים.
 *
 * כל פרט קשר באפליקציה נשאב מכאן - אין מספרי טלפון או כתובות
 * שכתובים בתוך מסך. משנים כאן, וזה משתנה בכל האפליקציה.
 *
 * איך משיגים טוקן Storefront API:
 * מסלול "Develop apps" הישן נסגר - שופיפיי לא מאפשרת יותר ליצור custom apps
 * בממשק הניהול (legacy custom apps בוטלו ב-1 בינואר 2026), ואפליקציה שנוצרת
 * ב-Dev Dashboard לא מציגה את הטוקן באף מסך.
 *
 * המסלול הנכון: ערוץ Headless.
 * 1. Settings → Apps and sales channels → להתקין Headless מה-App Store
 * 2. ליצור custom storefront
 * 3. להעתיק את ה-PUBLIC access token (לא את ה-private - הוא סודי ואסור בבנדל)
 * 4. לפרסם את המוצרים והקטגוריות לערוץ Headless, אחרת ה-API יחזיר אפס מוצרים
 *
 * הפירוט המלא ב-docs/INSTALL-APP.md.
 */
export const SHOPIFY_CONFIG = {
  /** דומיין ה-myshopify של החנות (לא הדומיין המותאם anshilo.com!).
   *  אומת מול ה-Admin API: shop.myshopifyDomain. */
  storeDomain: '3007b3-4.myshopify.com',
  /** טוקן Storefront API - ה-PUBLIC access token של ה-custom storefront
   *  "Shilo Mobile App" בערוץ Headless.
   *  ציבורי בהגדרתו: הוא נשלח מהמכשיר בכל בקשה ולכן קיים בכל בנדל של האפליקציה.
   *  אין בו סיכון - הוא לא קורא הזמנות ולא נתוני לקוחות. ה-PRIVATE token של
   *  אותו ערוץ הוא סודי ולעולם לא נכנס לכאן. */
  storefrontAccessToken: '4f17988ebd232d52e81f9f910443ce63',
  /** גרסת ה-API - עדכנו פעם בשנה לגרסה נתמכת */
  apiVersion: '2025-07',
} as const;

/** פרטי החנות - זהים להגדרות הת'ים באתר */
export const STORE_INFO = {
  name: 'א.נ. שילו בע"מ',
  tagline: 'חומרי בניין ואספקה טכנית',
  /** מספר לתצוגה */
  phone: '02-534-3422',
  /** אותו מספר בלי מקפים - ל-tel: */
  phoneDial: '025343422',
  email: 'info@anshilo.com',
  /** קישור וואטסאפ קצר של החנות */
  whatsapp: 'https://wa.link/sp55tw',
  address: 'קיבוץ קרית ענבים',
  website: 'https://anshilo.com',
  /** שנת ההקמה - מופיעה בשורת ה-eyebrow של ההירו */
  since: 1990,
  hours: [
    { days: "א'-ה'", hours: '07:00-17:00' },
    { days: "ו'", hours: '07:00-13:00' },
  ],
  social: {
    facebook:
      'https://www.facebook.com/people/%D7%90%D7%A0-%D7%A9%D7%99%D7%9C%D7%95/100065385913315/',
    instagram: 'https://www.instagram.com/a.nshilo',
  },
} as const;

/**
 * קישור וואטסאפ מוכן לפתיחה.
 *
 * STORE_INFO.whatsapp הוא קישור קצר מלא (`https://wa.link/…`), אבל שני מסכים
 * התייחסו אליו כאילו הוא מספר טלפון והרכיבו `https://wa.me/${...}` - כלומר
 * `https://wa.me/https://wa.link/sp55tw`. זה URL תקין תחבירית, ולכן
 * Linking.openURL הצליח ולא הפעיל שום catch: שני מסלולי הוואטסאפ של האפליקציה
 * הובילו לדף "מספר לא תקין" בשקט מוחלט. הפונקציה הזו מקבלת את שתי הצורות, כך
 * שאם הערך יוחלף בעתיד במספר בינלאומי הוא ימשיך לעבוד.
 */
export function whatsappUrl(): string {
  const raw = STORE_INFO.whatsapp.trim();
  if (raw === '') return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://wa.me/${raw.replace(/[^\d]/g, '')}`;
}

/** מספרי הקטלוג שמוצגים באפליקציה - תואמים לחנות בפועל */
export const CATALOG_STATS = {
  products: 1918,
  collections: 186,
} as const;

/**
 * מבנה הקטלוג במסך הבית - אותם handles שמזינים את דף הבית באתר,
 * כדי שהאפליקציה והאתר יציגו בדיוק את אותן מחלקות ואת אותם מבצעים.
 */
export const HOME_FEED = {
  /** פס המחלקות הראשי */
  departments: [
    'כלי-עבודה',
    'כלים-נטענים',
    'שקעים-ומפסקים',
    'תאורה',
    'אינסטלציה',
    'ברזים',
    'צבע',
    'סולמות',
    'ניקיון-ותחזוקת-הבית',
    'ציוד-טכני',
    'קמפינג',
    'עץ',
  ],
  /** קטגוריית המבצעים */
  offers: 'המבצעים-שלנו',
  /** הנמכרים ביותר (קטגוריה אוטומטית של שופיפיי) */
  bestSellers: 'best-selling-products',
  /** חדשים בקטלוג (קטגוריה אוטומטית של שופיפיי) */
  newArrivals: 'newest-products',
  /** מרכז מקיטה - המחלקה הגדולה שלנו */
  featuredBrand: 'makita',
  /** פס המותגים */
  brands: [
    'makita',
    'מילווקי',
    'קרשר',
    'ניסקו',
    'סימנס',
    'grohe',
    'yale',
    'בונה',
    'טמבור',
    'בלאנדסטון',
    'אקווילה',
    'האנטר',
  ],
} as const;

/** הצעות חיפוש קבועות - זהות ל-popular_searches של הת'ים */
export const POPULAR_SEARCHES = [
  'מקיטה',
  'מברגה נטענת',
  'סולם',
  'מנעול',
  'ברז מטבח',
  'ספריי צבע',
] as const;
