/**
 * הגדרות החיבור לחנות השופיפיי.
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

export const STORE_INFO = {
  name: 'א.נ. שילו בע"מ',
  tagline: 'חומרי בניין ואספקה טכנית',
  phone: '04-8444444',
  whatsapp: '', // מספר בפורמט בינלאומי, למשל 972501234567
  address: 'קרית אתא',
  website: 'https://anshilo.com',
  hours: [
    { days: "א'-ה'", hours: '07:00-17:00' },
    { days: "ו'", hours: '07:00-13:00' },
  ],
} as const;
