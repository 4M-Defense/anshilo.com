import { CUSTOMER_ACCOUNT, SHOPIFY_CONFIG } from '../config';

/**
 * שכבת ה-Customer Account API של שופיפיי — התחברות לקוח וקריאת הנתונים שלו.
 *
 * ההתחברות עצמה נעשית במסך המתארח של שופיפיי, ולא באפליקציה. משם נובעים שני
 * דברים חשובים: כפתור "התחברות עם גוגל" מופיע שם מעצמו כי הוא מופעל בהגדרות
 * החנות, והאפליקציה **לעולם אינה רואה סיסמה** — היא מקבלת רק קוד חד-פעמי
 * שמומר לטוקן. אין כאן SDK של גוגל ואין מה להגדיר מול גוגל.
 *
 * הכתובות מתגלות ולא מקובעות. שופיפיי מבקשת זאת במפורש: "Using discovery
 * endpoints automatically provides authentication and API URLs rather than
 * hardcoding URLs... removing the need for hardcoded domain dependencies."
 * זה גם פותר בעיה אמיתית כאן — כתובת ה-GraphQL של חשבון הלקוח לא הופיעה
 * באדמין ולא ניתן היה לאמת אותה, בעוד שהגילוי מחזיר אותה מהחנות עצמה.
 * אם הגילוי נכשל (רשת, או שינוי בשופיפיי) נופלים לכתובות שאומתו באדמין.
 */

const DISCOVERY_BASE = `https://${SHOPIFY_CONFIG.storeDomain}`;

export interface Discovery {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  logoutEndpoint: string;
  graphqlEndpoint: string;
}

/** גיבוי: שלוש הכתובות הועתקו מ-Application endpoints באדמין. */
const FALLBACK: Discovery = {
  authorizationEndpoint: CUSTOMER_ACCOUNT.authorizationEndpoint,
  tokenEndpoint: CUSTOMER_ACCOUNT.tokenEndpoint,
  logoutEndpoint: CUSTOMER_ACCOUNT.logoutEndpoint,
  // הכתובת הזאת לא אומתה — היא הצורה המתועדת, והגילוי אמור להחליף אותה.
  graphqlEndpoint: `https://shopify.com/${CUSTOMER_ACCOUNT.shopId}/account/customer/api/2025-07/graphql`,
};

let cached: Discovery | null = null;

async function fetchJson(url: string, timeoutMs = 10000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * מגלה את כתובות ההתחברות וה-API. נקרא פעם אחת ונשמר בזיכרון.
 * לעולם לא זורק — כשל בגילוי מחזיר את כתובות הגיבוי.
 */
export async function getDiscovery(): Promise<Discovery> {
  if (cached != null) return cached;
  const result: Discovery = { ...FALLBACK };

  const [openid, caapi] = await Promise.allSettled([
    fetchJson(`${DISCOVERY_BASE}/.well-known/openid-configuration`),
    fetchJson(`${DISCOVERY_BASE}/.well-known/customer-account-api`),
  ]);

  if (openid.status === 'fulfilled' && openid.value != null) {
    const d = openid.value as Record<string, unknown>;
    result.authorizationEndpoint = str(d.authorization_endpoint) ?? result.authorizationEndpoint;
    result.tokenEndpoint = str(d.token_endpoint) ?? result.tokenEndpoint;
    result.logoutEndpoint = str(d.end_session_endpoint) ?? result.logoutEndpoint;
  }

  if (caapi.status === 'fulfilled' && caapi.value != null) {
    const d = caapi.value as Record<string, unknown>;
    // שופיפיי לא מבטיחה שם שדה יחיד כאן — מנסים את הצורות המתועדות בסדר.
    result.graphqlEndpoint =
      str(d.graphql_api) ??
      str(d.graphql_endpoint) ??
      str((d.endpoints as Record<string, unknown> | undefined)?.graphql_api) ??
      result.graphqlEndpoint;
  }

  cached = result;
  return result;
}

/* ---------- שגיאות ---------- */

export class CustomerAuthError extends Error {
  constructor(
    message: string,
    /** true = הטוקן פג או נשלל; הקורא צריך להתנתק ולבקש התחברות מחדש */
    public readonly needsLogin = false
  ) {
    super(message);
    this.name = 'CustomerAuthError';
  }
}

/* ---------- טוקנים ---------- */

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  /** חותמת זמן (ms) שבה הטוקן פג */
  expiresAt: number;
}

function toTokenSet(raw: Record<string, unknown>, previousRefresh: string | null): TokenSet {
  const accessToken = str(raw.access_token);
  if (accessToken == null) throw new CustomerAuthError('התשובה מהשרת לא כללה טוקן');
  const expiresIn = typeof raw.expires_in === 'number' ? raw.expires_in : 3600;
  return {
    accessToken,
    // שופיפיי לא בהכרח מחזירה refresh_token בכל רענון — שומרים את הקודם
    refreshToken: str(raw.refresh_token) ?? previousRefresh,
    // מרווח של דקה, כדי לא להשתמש בטוקן שפג בדיוק בזמן הבקשה
    expiresAt: Date.now() + Math.max(0, expiresIn - 60) * 1000,
  };
}

async function postForm(url: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: Object.entries(body)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&'),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* תשובה שאינה JSON — נטופל למטה לפי הסטטוס */
  }
  if (!res.ok) {
    const detail = str(json.error_description) ?? str(json.error) ?? `HTTP ${res.status}`;
    throw new CustomerAuthError(`ההתחברות נכשלה: ${detail}`, res.status === 400 || res.status === 401);
  }
  return json;
}

/** ממיר את הקוד החד-פעמי מהדפדפן לטוקן. `codeVerifier` הוא ה-PKCE. */
export async function exchangeCodeForToken(
  code: string,
  codeVerifier: string
): Promise<TokenSet> {
  const { tokenEndpoint } = await getDiscovery();
  const json = await postForm(tokenEndpoint, {
    grant_type: 'authorization_code',
    client_id: CUSTOMER_ACCOUNT.clientId,
    redirect_uri: CUSTOMER_ACCOUNT.redirectUri,
    code,
    code_verifier: codeVerifier,
  });
  return toTokenSet(json, null);
}

/** מרענן טוקן שפג. זורק עם needsLogin=true כשהרענון נדחה. */
export async function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  const { tokenEndpoint } = await getDiscovery();
  const json = await postForm(tokenEndpoint, {
    grant_type: 'refresh_token',
    client_id: CUSTOMER_ACCOUNT.clientId,
    refresh_token: refreshToken,
  });
  return toTokenSet(json, refreshToken);
}

/* ---------- קריאות ל-API ---------- */

export async function customerFetch<T>(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const { graphqlEndpoint } = await getDiscovery();
  let res: Response;
  try {
    res = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new CustomerAuthError('אין חיבור לאינטרנט. בדקו את החיבור ונסו שוב.');
  }

  if (res.status === 401 || res.status === 403) {
    throw new CustomerAuthError('החיבור לחשבון פג. התחברו שוב.', true);
  }
  if (!res.ok) throw new CustomerAuthError(`שגיאת שרת (${res.status}). נסו שוב מאוחר יותר.`);

  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new CustomerAuthError(json.errors[0].message);
  if (json.data == null) throw new CustomerAuthError('תשובה ריקה מהשרת');
  return json.data;
}

/* ---------- שאילתות ---------- */

export const CUSTOMER_PROFILE_QUERY = /* GraphQL */ `
  query CustomerProfile {
    customer {
      id
      firstName
      lastName
      displayName
      emailAddress {
        emailAddress
      }
      phoneNumber {
        phoneNumber
      }
      defaultAddress {
        formatted
      }
    }
  }
`;

export const CUSTOMER_ORDERS_QUERY = /* GraphQL */ `
  query CustomerOrders($first: Int!) {
    customer {
      orders(first: $first, sortKey: PROCESSED_AT, reverse: true) {
        nodes {
          id
          name
          processedAt
          financialStatus
          totalPrice {
            amount
            currencyCode
          }
          lineItems(first: 3) {
            nodes {
              title
              quantity
            }
          }
        }
      }
    }
  }
`;

export interface CustomerProfile {
  customer: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
    emailAddress: { emailAddress: string | null } | null;
    phoneNumber: { phoneNumber: string | null } | null;
    defaultAddress: { formatted: string[] | null } | null;
  } | null;
}

export interface CustomerOrder {
  id: string;
  name: string;
  processedAt: string;
  financialStatus: string | null;
  totalPrice: { amount: string; currencyCode: string };
  lineItems: { nodes: { title: string; quantity: number }[] };
}

export interface CustomerOrders {
  customer: { orders: { nodes: CustomerOrder[] } } | null;
}
