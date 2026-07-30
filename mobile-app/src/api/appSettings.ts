import {
  FREE_SHIPPING_THRESHOLD,
  HOME_FEED,
  POPULAR_SEARCHES,
  STORE_INFO,
  buildWhatsappUrl,
  directionsUrlFor,
} from '@/config';
import { storefrontFetch } from './client';

/**
 * הגדרות שנקראות מהחנות בזמן ריצה, כדי שהבעלים יוכל לשנות אותן מהאדמין
 * של שופיפיי בלי בנייה חדשה ובלי `eas update`.
 *
 * המקור הוא metaobject בשם `app_settings` עם ה-handle `main`, שהוגדר עם
 * `access: { storefront: PUBLIC_READ }` — בלי זה ה-Storefront API לא מחזיר
 * אותו והאפליקציה תראה את ברירות המחדל בלבד.
 *
 * **הערכים ב-`src/config.ts` נשארים כברירת מחדל, ולא הופכים למיותרים.** כל
 * שדה נופל אליהם בנפרד: אם החנות לא נגישה, אם ה-metaobject נמחק, אם שדה נשאר
 * ריק או אם ערך מגיע פגום — האפליקציה עולה בדיוק כמו קודם. זה חשוב במיוחד
 * במסך הבית: `HOME_FEED.departments` ריק היה מציג מסך פתיחה חסר.
 */
export interface AppSettings {
  phone: string;
  phoneDial: string;
  whatsappUrl: string;
  email: string;
  address: string;
  directionsUrl: string;
  hours: { days: string; hours: string }[];
  freeShippingThreshold: number;
  popularSearches: string[];
  homeDepartments: string[];
  homeBrands: string[];
}

/** ברירות המחדל — בדיוק מה שהאפליקציה הציגה לפני שההגדרות עברו לחנות */
export const DEFAULT_SETTINGS: AppSettings = {
  phone: STORE_INFO.phone,
  phoneDial: STORE_INFO.phoneDial,
  whatsappUrl: buildWhatsappUrl(STORE_INFO.whatsapp),
  email: STORE_INFO.email,
  address: STORE_INFO.address,
  directionsUrl: directionsUrlFor(STORE_INFO.google, STORE_INFO.address),
  hours: STORE_INFO.hours.map((h) => ({ days: h.days, hours: h.hours })),
  freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
  popularSearches: [...POPULAR_SEARCHES],
  homeDepartments: [...HOME_FEED.departments],
  homeBrands: [...HOME_FEED.brands],
};

const APP_SETTINGS_QUERY = /* GraphQL */ `
  query AppSettings {
    metaobject(handle: { type: "app_settings", handle: "main" }) {
      fields {
        key
        value
        references(first: 30) {
          nodes {
            ... on Collection {
              handle
            }
          }
        }
      }
    }
  }
`;

interface SettingsResponse {
  metaobject: {
    fields: {
      key: string;
      value: string | null;
      references: { nodes: ({ handle?: string } | null)[] } | null;
    }[];
  } | null;
}

/** מחרוזת לא ריקה, אחרת ברירת המחדל */
function text(raw: string | null | undefined, fallback: string): string {
  const trimmed = raw?.trim() ?? '';
  return trimmed === '' ? fallback : trimmed;
}

/**
 * שדה רשימה של שופיפיי מגיע כמחרוזת JSON. ערך פגום או רשימה ריקה נופלים
 * לברירת המחדל — עדיף להציג את מה שהיה מאשר מסך ריק.
 */
function list(raw: string | null | undefined, fallback: string[]): string[] {
  if (raw == null || raw.trim() === '') return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    const items = parsed
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.trim())
      .filter((x) => x !== '');
    return items.length > 0 ? items : fallback;
  } catch {
    return fallback;
  }
}

/** `number_decimal` חוזר כ-"399.0" ולא כ-"399", ולכן parseFloat ולא parseInt */
function decimal(raw: string | null | undefined, fallback: number): number {
  const n = parseFloat(raw ?? '');
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** handles של קולקציות מתוך שדה reference; רשימה ריקה נופלת לברירת המחדל */
function handles(
  refs: { nodes: ({ handle?: string } | null)[] } | null | undefined,
  fallback: string[]
): string[] {
  const found = (refs?.nodes ?? [])
    .map((n) => n?.handle)
    .filter((h): h is string => typeof h === 'string' && h !== '');
  return found.length > 0 ? found : fallback;
}

/** "א'-ה'|07:00-17:00" → { days: "א'-ה'", hours: "07:00-17:00" } */
function parseHours(
  raw: string | null | undefined,
  fallback: AppSettings['hours']
): AppSettings['hours'] {
  const rows = list(raw, []);
  const parsed = rows
    .map((row) => {
      const at = row.indexOf('|');
      if (at < 0) return null;
      const days = row.slice(0, at).trim();
      const hours = row.slice(at + 1).trim();
      return days !== '' && hours !== '' ? { days, hours } : null;
    })
    .filter((r): r is { days: string; hours: string } => r != null);
  return parsed.length > 0 ? parsed : fallback;
}

/**
 * קורא את ההגדרות מהחנות וממזג אותן מעל ברירות המחדל.
 *
 * לא זורק: כל כשל — רשת, טוקן חסר, metaobject שלא קיים — מחזיר את ברירות
 * המחדל. הקורא לא צריך לטפל בשגיאה, והאפליקציה לא נופלת בגלל הגדרה בחנות.
 */
export async function fetchAppSettings(): Promise<AppSettings> {
  let data: SettingsResponse;
  try {
    data = await storefrontFetch<SettingsResponse>(APP_SETTINGS_QUERY);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (data.metaobject == null) return DEFAULT_SETTINGS;

  const byKey = new Map(data.metaobject.fields.map((f) => [f.key, f]));
  const f = (key: string) => byKey.get(key);

  const whatsappRaw = text(f('whatsapp')?.value, STORE_INFO.whatsapp);
  const address = text(f('address')?.value, DEFAULT_SETTINGS.address);
  const google = text(f('google_maps')?.value, STORE_INFO.google);

  return {
    phone: text(f('phone')?.value, DEFAULT_SETTINGS.phone),
    phoneDial: text(f('phone_dial')?.value, DEFAULT_SETTINGS.phoneDial),
    /* עובר דרך אותה פונקציה כמו בקונפיג — קישור מלא או מספר, שניהם תקפים */
    whatsappUrl: buildWhatsappUrl(whatsappRaw),
    email: text(f('email')?.value, DEFAULT_SETTINGS.email),
    address,
    directionsUrl: directionsUrlFor(google, address),
    hours: parseHours(f('hours')?.value, DEFAULT_SETTINGS.hours),
    freeShippingThreshold: decimal(
      f('free_shipping_threshold')?.value,
      DEFAULT_SETTINGS.freeShippingThreshold
    ),
    popularSearches: list(f('popular_searches')?.value, DEFAULT_SETTINGS.popularSearches),
    homeDepartments: handles(f('home_departments')?.references, DEFAULT_SETTINGS.homeDepartments),
    homeBrands: handles(f('home_brands')?.references, DEFAULT_SETTINGS.homeBrands),
  };
}
