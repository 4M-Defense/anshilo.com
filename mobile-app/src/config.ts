/**
 * הגדרות החיבור לחנות השופיפיי + פרטי החנות האמיתיים.
 *
 * כל פרט קשר באפליקציה נשאב מכאן — אין מספרי טלפון או כתובות
 * שכתובים בתוך מסך. משנים כאן, וזה משתנה בכל האפליקציה.
 *
 * איך משיגים טוקן Storefront API:
 * 1. בניהול החנות: Settings → Apps and sales channels → Develop apps → Create an app
 * 2. תנו שם לאפליקציה (למשל "Mobile App") ואשרו
 * 3. Configuration → Storefront API → סמנו את כל הרשאות ה-unauthenticated_*
 * 4. API credentials → Install app → העתיקו את ה-Storefront API access token
 * 5. הדביקו אותו כאן למטה
 */
export const SHOPIFY_CONFIG = {
  /** דומיין ה-myshopify של החנות (לא הדומיין המותאם!) — לדוגמה: anshilo.myshopify.com */
  storeDomain: 'anshilo.myshopify.com',
  /** טוקן Storefront API (ציבורי, בטוח לשימוש באפליקציה) */
  storefrontAccessToken: 'PASTE_YOUR_STOREFRONT_TOKEN_HERE',
  /** גרסת ה-API — עדכנו פעם בשנה לגרסה נתמכת */
  apiVersion: '2025-07',
} as const;

/** פרטי החנות — זהים להגדרות הת'ים באתר */
export const STORE_INFO = {
  name: 'א.נ. שילו בע"מ',
  tagline: 'חומרי בניין ואספקה טכנית',
  /** מספר לתצוגה */
  phone: '02-534-3422',
  /** אותו מספר בלי מקפים — ל-tel: */
  phoneDial: '025343422',
  email: 'info@anshilo.com',
  /** קישור וואטסאפ קצר של החנות */
  whatsapp: 'https://wa.link/sp55tw',
  address: 'קיבוץ קרית ענבים',
  website: 'https://anshilo.com',
  /** שנת ההקמה — מופיעה בשורת ה-eyebrow של ההירו */
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

/** מספרי הקטלוג שמוצגים באפליקציה — תואמים לחנות בפועל */
export const CATALOG_STATS = {
  products: 1918,
  collections: 186,
} as const;

/**
 * מבנה הקטלוג במסך הבית — אותם handles שמזינים את דף הבית באתר,
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
  /** מרכז מקיטה — המחלקה הגדולה שלנו */
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

/** הצעות חיפוש קבועות — זהות ל-popular_searches של הת'ים */
export const POPULAR_SEARCHES = [
  'מקיטה',
  'מברגה נטענת',
  'סולם',
  'מנעול',
  'ברז מטבח',
  'ספריי צבע',
] as const;
