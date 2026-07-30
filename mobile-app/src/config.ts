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
/** הערך שמסמן "עוד לא הודבק טוקן" — נבדק ב-isStorefrontConfigured. */
const TOKEN_PLACEHOLDER = 'PASTE_YOUR_STOREFRONT_TOKEN_HERE';

/**
 * אפשרות ב': במקום להדביק את הטוקן בקובץ, אפשר להעביר אותו כמשתנה סביבה.
 * מקומית — בקובץ `.env` בתיקיית mobile-app (ראו `.env.example`).
 * בבנייה בענן — `eas env:create --name EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN`.
 * זה עדיף, כי אז החלפת טוקן לא דורשת שינוי קוד.
 */
const TOKEN_FROM_ENV = process.env.EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN?.trim();

/** אפשרות א': להדביק את הטוקן כאן. משתנה הסביבה, אם קיים, גובר על זה. */
const TOKEN_INLINE = TOKEN_PLACEHOLDER;

export const SHOPIFY_CONFIG = {
  /** דומיין ה-myshopify של החנות (לא הדומיין המותאם anshilo.com!).
   *  אומת מול ה-Admin API: shop.myshopifyDomain. */
  storeDomain: '3007b3-4.myshopify.com',
  /** טוקן Storefront API (ציבורי, בטוח לשימוש באפליקציה) */
  storefrontAccessToken: TOKEN_FROM_ENV || TOKEN_INLINE,
  /** גרסת ה-API — עדכנו פעם בשנה לגרסה נתמכת */
  apiVersion: '2025-07',
} as const;

/**
 * האם יש בכלל טוקן להתחבר איתו.
 *
 * בלי זה כל קריאה לחנות מוחזרת ב-401 והאפליקציה נראית "שבורה" — מסכים
 * ריקים בלי סיבה מוסברת. עדיף לזהות את זה לפני הקריאה הראשונה ולהציג
 * הוראות מדויקות, ולא שגיאת רשת גנרית.
 */
export function isStorefrontConfigured(): boolean {
  const token = SHOPIFY_CONFIG.storefrontAccessToken?.trim();
  return !!token && token !== TOKEN_PLACEHOLDER;
}

/**
 * תבנית הצגת המחיר.
 *
 * התבנית תומכת באותם placeholders של שופיפיי, כך שאפשר להעביר לכאן כל פורמט
 * מטבע של החנות בלי לגעת בקוד:
 *   {{amount}}                                  → 1,234.56
 *   {{amount_no_decimals}}                      → 1,235
 *   {{amount_with_comma_separator}}              → 1.234,56
 *   {{amount_no_decimals_with_comma_separator}}  → 1.235
 *
 * ⚠️ שימו לב — כאן יש הפרש מכוון מהחנות, לפי החלטת הבעלים:
 * בהגדרות החנות פורמט המטבע הוא `{{amount}} ש"ח` (אומת מול ה-Admin API,
 * shop.currencyFormats.moneyFormat), והאפליקציה מציגה ₪ כי זה קריא יותר.
 * המשמעות: האתר וה-Checkout יאמרו "ש"ח" והאפליקציה תאמר "₪".
 * כדי שכל הערוצים יגידו ₪ צריך לשנות את הפורמט בניהול החנות
 * (הגדרות → כללי → פורמט מטבע) ל-`₪{{amount}}` — ואז להחזיר את השורה כאן
 * להיות זהה לו.
 */
export const MONEY_FORMAT = {
  currencyCode: 'ILS',
  template: '₪{{amount}}',
} as const;

/**
 * חלק מהקטלוג מפורסם ללא מחיר. הצגת "0.00 ש"ח" נראית כמו תקלה, ולכן
 * האתר מציג שם בקשת הצעת מחיר — והאפליקציה חייבת לומר בדיוק אותו דבר.
 * מקור הנוסח: theme/locales/he.default.json → products.price.call_for_price
 */
export const CALL_FOR_PRICE_LABEL = 'מחיר בטלפון';

/**
 * חשבונות לקוחות — התחברות עם גוגל דרך Customer Account API של שופיפיי.
 *
 * גוגל לא מוגדר כאן בכלל: האפליקציה פותחת את מסך ההתחברות המתארח של שופיפיי,
 * וכפתור גוגל מופיע שם מעצמו כי הוא מופעל בהגדרות החנות
 * (Customer accounts → Authentication → Google = On, אומת באדמין).
 *
 * ⚠️ `redirectUri` אינו שרירותי. שופיפיי מחייבת לקליינט מובייל סכמה בפורמט
 * `shop.{shop_id}.*` (ראו getting-started של Customer Account API), ולכן
 * `anshilo://` *אינו* קביל כאן — הסכמה הזאת רשומה ב-app.json לצד `anshilo`.
 *
 * כל הערכים כאן אומתו באדמין: ה-Client type הוא "Public (mobile app)",
 * ה-Callback URI רשום בדיוק כמו למטה (שופיפיי אף מילאה אותו בעצמה באותו
 * ערך אחרי המעבר לסוג מובייל), וה-Client ID לא הונפק מחדש במעבר.
 * שלוש כתובות ה-endpoint הועתקו מ-Application endpoints שבאותו עמוד.
 */
export const CUSTOMER_ACCOUNT = {
  /** מזהה החנות — מופיע גם בכתובת ההתחברות shopify.com/58110246991/account */
  shopId: '58110246991',
  clientId: '784a0c66-6ed4-4aba-92a5-8705cbc0ff05',
  /** חייב להיות זהה לרשום באדמין, אחרת שופיפיי דוחה את הבקשה */
  redirectUri: 'shop.58110246991.app://callback',
  /** מה שהאפליקציה מבקשת: זהות, אימייל, וגישה מלאה לחשבון הלקוח */
  scopes: 'openid email customer-account-api:full',
  authorizationEndpoint: 'https://shopify.com/authentication/58110246991/oauth/authorize',
  tokenEndpoint: 'https://shopify.com/authentication/58110246991/oauth/token',
  logoutEndpoint: 'https://shopify.com/authentication/58110246991/logout',
} as const;

/**
 * הלוגו של החנות, מה-CDN של שופיפיי — אותו קובץ שההדר באתר משתמש בו
 * (הגדרת `logo` בת'ים: final-logo-for-the-website.png, 500×100).
 *
 * נטען מהחנות ולא נארז באפליקציה, כדי שהחלפת לוגו באתר תתגלגל לאפליקציה
 * מעצמה. `square` הוא הסמל בלבד, לשימוש במקומות צרים.
 */
export const STORE_LOGO = {
  /** אופקי — סמל + שם, מתאים להדר */
  horizontal:
    'https://cdn.shopify.com/s/files/1/0581/1024/6991/files/final-logo-for-the-website.png?v=1706483466',
  /** מרובע — הסמל בלבד */
  square:
    'https://cdn.shopify.com/s/files/1/0581/1024/6991/files/favicon-for-website-2.png?v=1706484070',
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
  /** כרטיס העסק בגוגל — זהה להגדרת `store_google` בת'ים */
  google: 'https://share.google/RZnNkj7nDmReGLfy1',
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

/**
 * קישור התקשרות — תמיד מהמספר בלי מקפים.
 * (`STORE_INFO.phone` הוא לתצוגה בלבד; `tel:` צריך את `phoneDial`.)
 */
export const TEL_URL = `tel:${STORE_INFO.phoneDial}`;

/**
 * קישור וואטסאפ.
 *
 * `STORE_INFO.whatsapp` יכול להיות קישור מלא (wa.link/…) או מספר בפורמט
 * בינלאומי — בדיוק כמו הגדרת `store_whatsapp` בת'ים, ולכן צריך להבחין.
 * בלי ההבחנה נבנה קישור מסוג `https://wa.me/https://wa.link/…` שלא נפתח.
 * מחזיר מחרוזת ריקה אם אין וואטסאפ מוגדר — הקורא מסתיר את הכפתור.
 */
function buildWhatsappUrl(value: string): string {
  const raw = value.trim();
  if (raw === '') return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const digits = raw.replace(/\D/g, '');
  return digits === '' ? '' : `https://wa.me/${digits}`;
}

export const WHATSAPP_URL = buildWhatsappUrl(STORE_INFO.whatsapp);

/**
 * ניווט אלינו — הכתובת באפליקציה לחיצה ופותחת את המיקום.
 *
 * מעדיף את כרטיס העסק בגוגל (אותו קישור שהאתר מפנה אליו מהפוטר), ואם הוא
 * ריק נופל לחיפוש הכתובת במפות. תמיד מחזיר קישור פתיח, כך שהכתובת לעולם
 * אינה כפתור מת.
 */
export const DIRECTIONS_URL =
  STORE_INFO.google.trim() !== ''
    ? STORE_INFO.google
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${STORE_INFO.name} ${STORE_INFO.address}`
      )}`;

/**
 * הסכום שממנו המשלוח חינם — חייב להיות זהה להגדרת `free_shipping_threshold`
 * בת'ים (הגדרות ערכת העיצוב → עגלה וחיפוש), אחרת העגלה באפליקציה מבטיחה
 * משלוח חינם בסכום אחר מזה שבאתר. 0 מסתיר את פס ההתקדמות.
 */
export const FREE_SHIPPING_THRESHOLD = 399;

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

/**
 * שמות תצוגה למותגים.
 *
 * כותרת הקולקציה בשופיפיי לא תמיד מתאימה לתצוגה: `makita` נקראת שם
 * "כלי עבודה מקיטה במחירים הזולים בישראל makita" — כותרת SEO שלא נכנסת
 * לאריח. האתר פותר את זה באותה דרך, עם שדה `name` לכל בלוק מותג
 * (theme/templates/index.json → section `brands`), והשמות כאן מועתקים משם.
 *
 * מותג שאינו כאן מוצג בכותרת הקולקציה כפי שהיא.
 *
 * `grohe` תוקן גם בשופיפיי עצמה מ-"גרו" ל-"גרואה", ולכן השורה כאן היא כבר
 * רק תוספת ה-GROHE הלטיני, בעקבות מה שהאתר עושה לכל מותג.
 */
export const BRAND_NAMES: Record<string, string> = {
  makita: 'מקיטה MAKITA',
  מילווקי: 'מילווקי MILWAUKEE',
  yale: 'ייל YALE',
  קרשר: 'קרשר KARCHER',
  סימנס: 'סימנס SIEMENS',
  ניסקו: 'ניסקו NISKO',
  grohe: 'גרואה GROHE',
  האנטר: 'האנטר HUNTER',
};

/**
 * יבואנים רשמיים — המדבקות שהבעלים ביקש להציג.
 *
 * ארגנטולס היא היבואנית הרשמית של מקיטה, ודלקו של מילווקי. באתר יש על כך
 * רק אמירה בטקסט ("הכל מיבואן רשמי, עם אחריות מלאה") ולא תג מצויר — באפליקציה
 * מוצג התג עצמו.
 *
 * התמונות יושבות ב-Shopify → Content → Files. הן נטענות משם ולא נארזות
 * באפליקציה, כך שהחלפת מדבקה בחנות מתגלגלת לאפליקציה בלי גרסה חדשה.
 */
export const IMPORTERS = [
  {
    collection: 'makita',
    importer: 'ארגנטולס',
    note: 'יבואן רשמי, אחריות מלאה',
    badgeUrl:
      'https://cdn.shopify.com/s/files/1/0581/1024/6991/files/makita-argentolas-stamp.png?v=1785318917',
  },
  {
    collection: 'מילווקי',
    importer: 'דלקו',
    note: 'יבואן רשמי, אחריות מלאה',
    badgeUrl:
      'https://cdn.shopify.com/s/files/1/0581/1024/6991/files/delco-milwaukee-stamp.png?v=1785319031',
  },
] as const;

/** הצעות חיפוש קבועות — זהות ל-popular_searches של הת'ים */
export const POPULAR_SEARCHES = [
  'מקיטה',
  'מברגה נטענת',
  'סולם',
  'מנעול',
  'ברז מטבח',
  'ספריי צבע',
] as const;
