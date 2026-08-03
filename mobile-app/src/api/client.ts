import { SHOPIFY_CONFIG } from '../config';
import {
  CART_CREATE_MUTATION,
  CART_LINES_ADD_MUTATION,
  CART_LINES_REMOVE_MUTATION,
  CART_LINES_UPDATE_MUTATION,
  CART_NOTE_UPDATE_MUTATION,
  CART_LINES_PAGE_QUERY,
  CART_QUERY,
  COLLECTION_PRODUCTS_QUERY,
  COLLECTIONS_QUERY,
  PRODUCT_BY_HANDLE_QUERY,
  PRODUCT_RECOMMENDATIONS_QUERY,
  PRODUCTS_QUERY,
  SEARCH_QUERY,
  SHOP_QUERY,
  buildCollectionRowsQuery,
  buildCollectionsByHandleQuery,
  collectionAlias,
} from './queries';
import type {
  Cart,
  CartLine,
  Collection,
  CollectionWithProducts,
  PageInfo,
  Product,
  ProductCardData,
  ProductSortKey,
  ShopInfo,
  UserError,
} from './types';

export class StorefrontError extends Error {
  constructor(
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'StorefrontError';
  }
}

const ENDPOINT = `https://${SHOPIFY_CONFIG.storeDomain}/api/${SHOPIFY_CONFIG.apiVersion}/graphql.json`;

/** קריאת GraphQL בסיסית מול ה-Storefront API */
export async function storefrontFetch<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': SHOPIFY_CONFIG.storefrontAccessToken,
        'Accept-Language': 'he',
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (err) {
    throw new StorefrontError('אין חיבור לאינטרנט. בדקו את החיבור ונסו שוב.', err);
  }

  /* מה שהקונה רואה הוא תמיד עברית קבועה; הטקסט של השרת נשמר ב-details בלבד.
     קודם 401/403 החזירו לקונה את ההוראה "עדכנו את src/config.ts" - שם קובץ מתוך
     קוד המקור - וכל שגיאת GraphQL הוצגה כמו שהיא, כלומר טקסט אנגלי כמו
     "Throttled" או "Field 'x' doesn't exist on type 'ProductVariant'" בתוך ממשק
     עברי מימין לשמאל, שגם חושף את מבנה השאילתות וגם משאיר את הקונה בלי מה לעשות. */
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new StorefrontError('החנות אינה זמינה כרגע. נסו שוב בהמשך.', {
        status: response.status,
      });
    }
    if (response.status === 429 || response.status === 430) {
      throw new StorefrontError('החנות עמוסה כרגע. נסו שוב בעוד רגע.', {
        status: response.status,
      });
    }
    throw new StorefrontError('שגיאה בטעינת הנתונים. נסו שוב מאוחר יותר.', {
      status: response.status,
    });
  }

  const json = (await response.json()) as {
    data?: T;
    errors?: { message: string }[];
  };

  if (json.errors?.length) {
    throw new StorefrontError('שגיאה בטעינת הנתונים. נסו שוב מאוחר יותר.', json.errors);
  }
  if (!json.data) {
    throw new StorefrontError('שגיאה בטעינת הנתונים. נסו שוב מאוחר יותר.');
  }
  return json.data;
}

/* userErrors של Shopify הן באנגלית ("The cart does not exist") ולכן הן נשמרות
   ב-details בלבד: המסכים מציגים את message לקונה. CartContext בודק את details
   כדי לזהות עגלה שנעלמה ולהתאושש ממנה. */
function assertNoUserErrors(errors: UserError[] | undefined, fallback: string) {
  if (errors && errors.length > 0) {
    throw new StorefrontError(fallback, errors);
  }
}

/* ---------- Shop ---------- */

export async function getShopInfo(): Promise<ShopInfo> {
  const data = await storefrontFetch<{ shop: ShopInfo }>(SHOP_QUERY);
  return data.shop;
}

/* ---------- Collections ---------- */

export async function getCollections(
  first = 50,
  after?: string
): Promise<{ nodes: Collection[]; pageInfo: PageInfo }> {
  const data = await storefrontFetch<{
    collections: { nodes: Collection[]; pageInfo: PageInfo };
  }>(COLLECTIONS_QUERY, { first, after: after ?? null });
  return data.collections;
}

/** הופך רשימת handles למשתני $h0..$hn של שאילתות ה-batch */
function handleVariables(handles: readonly string[]): Record<string, string> {
  const vars: Record<string, string> = {};
  handles.forEach((handle, i) => {
    vars[`h${i}`] = handle;
  });
  return vars;
}

/**
 * מביא קטגוריות לפי רשימת handles בבקשה אחת, בסדר שהועבר.
 * handles שלא קיימים בחנות מסוננים בשקט — כך שינוי בקטלוג לא שובר את המסך.
 */
export async function getCollectionsByHandle(
  handles: readonly string[]
): Promise<Collection[]> {
  if (handles.length === 0) return [];
  const data = await storefrontFetch<Record<string, Collection | null>>(
    buildCollectionsByHandleQuery(handles.length),
    handleVariables(handles)
  );
  return handles
    .map((_, i) => data[collectionAlias(i)])
    .filter((c): c is Collection => c != null);
}

/**
 * מביא כמה קטגוריות יחד עם המוצרים הראשונים בכל אחת — שורות מסך הבית.
 * קטגוריות ריקות או שאינן קיימות מסוננות.
 */
export async function getCollectionRows(
  handles: readonly string[],
  first = 10
): Promise<CollectionWithProducts[]> {
  if (handles.length === 0) return [];
  const data = await storefrontFetch<Record<string, CollectionWithProducts | null>>(
    buildCollectionRowsQuery(handles.length),
    { first, ...handleVariables(handles) }
  );
  return handles
    .map((_, i) => data[collectionAlias(i)])
    .filter((c): c is CollectionWithProducts => c != null && c.products.nodes.length > 0);
}

const COLLECTION_SORT_MAP: Record<string, { sortKey: string; reverse: boolean }> = {
  default: { sortKey: 'COLLECTION_DEFAULT', reverse: false },
  best_selling: { sortKey: 'BEST_SELLING', reverse: false },
  price_asc: { sortKey: 'PRICE', reverse: false },
  price_desc: { sortKey: 'PRICE', reverse: true },
  newest: { sortKey: 'CREATED', reverse: true },
  title: { sortKey: 'TITLE', reverse: false },
};

export type CollectionSort = keyof typeof COLLECTION_SORT_MAP;

export async function getCollectionProducts(
  handle: string,
  options: { first?: number; after?: string; sort?: CollectionSort } = {}
): Promise<CollectionWithProducts | null> {
  const { first = 24, after, sort = 'default' } = options;
  const { sortKey, reverse } = COLLECTION_SORT_MAP[sort] ?? COLLECTION_SORT_MAP.default;
  const data = await storefrontFetch<{ collection: CollectionWithProducts | null }>(
    COLLECTION_PRODUCTS_QUERY,
    { handle, first, after: after ?? null, sortKey, reverse }
  );
  return data.collection;
}

/* ---------- Products ---------- */

export async function getProducts(
  options: {
    first?: number;
    after?: string;
    sortKey?: ProductSortKey;
    reverse?: boolean;
    query?: string;
  } = {}
): Promise<{ nodes: ProductCardData[]; pageInfo: PageInfo }> {
  const { first = 24, after, sortKey = 'BEST_SELLING', reverse = false, query } = options;
  const data = await storefrontFetch<{
    products: { nodes: ProductCardData[]; pageInfo: PageInfo };
  }>(PRODUCTS_QUERY, { first, after: after ?? null, sortKey, reverse, query: query ?? null });
  return data.products;
}

export async function getProductByHandle(handle: string): Promise<Product | null> {
  const data = await storefrontFetch<{ product: Product | null }>(
    PRODUCT_BY_HANDLE_QUERY,
    { handle }
  );
  return data.product;
}

export async function getProductRecommendations(
  productId: string
): Promise<ProductCardData[]> {
  const data = await storefrontFetch<{ productRecommendations: ProductCardData[] | null }>(
    PRODUCT_RECOMMENDATIONS_QUERY,
    { productId }
  );
  return data.productRecommendations ?? [];
}

/* ---------- Search ---------- */

export async function searchProducts(
  query: string,
  options: { first?: number; after?: string } = {}
): Promise<{ nodes: ProductCardData[]; pageInfo: PageInfo; totalCount: number }> {
  const { first = 24, after } = options;
  const data = await storefrontFetch<{
    search: { nodes: ProductCardData[]; pageInfo: PageInfo; totalCount: number };
  }>(SEARCH_QUERY, { query, first, after: after ?? null });
  return data.search;
}

/* ---------- Cart ---------- */

export async function cartCreate(
  lines: { merchandiseId: string; quantity: number }[] = []
): Promise<Cart> {
  const data = await storefrontFetch<{
    cartCreate: { cart: Cart | null; userErrors: UserError[] };
  }>(CART_CREATE_MUTATION, { input: { lines } });
  assertNoUserErrors(data.cartCreate.userErrors, 'שגיאה ביצירת עגלה');
  if (!data.cartCreate.cart) throw new StorefrontError('שגיאה ביצירת עגלה');
  return data.cartCreate.cart;
}

/**
 * מביא את כל שורות העגלה, לא רק את המאה הראשונות. ה-cost וה-totalQuantity
 * מחושבים בשרת על כל העגלה, ולכן עגלה חתוכה הציגה סה"כ שלא מסתכם עם השורות
 * שעל המסך - ואת השורות שמעל המאה לא היה אפשר לשנות או להסיר בכלל.
 */
async function withAllCartLines(cart: Cart): Promise<Cart> {
  let pageInfo = cart.lines.pageInfo;
  const nodes = [...cart.lines.nodes];
  /* תקרה של 20 דפים (2,000 שורות) כדי שתשובה חריגה לא תיצור לופ אינסופי. */
  for (let page = 0; page < 20 && pageInfo?.hasNextPage && pageInfo.endCursor; page += 1) {
    const next = await storefrontFetch<{
      cart: { lines: { nodes: CartLine[]; pageInfo: PageInfo } } | null;
    }>(CART_LINES_PAGE_QUERY, { cartId: cart.id, after: pageInfo.endCursor });
    if (!next.cart) break;
    nodes.push(...next.cart.lines.nodes);
    pageInfo = next.cart.lines.pageInfo;
  }
  return { ...cart, lines: { nodes, pageInfo } };
}

export async function getCart(cartId: string): Promise<Cart | null> {
  const data = await storefrontFetch<{ cart: Cart | null }>(CART_QUERY, { cartId });
  if (!data.cart) return null;
  return withAllCartLines(data.cart);
}

export async function cartLinesAdd(
  cartId: string,
  lines: { merchandiseId: string; quantity: number }[]
): Promise<Cart> {
  const data = await storefrontFetch<{
    cartLinesAdd: { cart: Cart | null; userErrors: UserError[] };
  }>(CART_LINES_ADD_MUTATION, { cartId, lines });
  assertNoUserErrors(data.cartLinesAdd.userErrors, 'שגיאה בהוספה לעגלה');
  if (!data.cartLinesAdd.cart) throw new StorefrontError('שגיאה בהוספה לעגלה');
  return data.cartLinesAdd.cart;
}

export async function cartLinesUpdate(
  cartId: string,
  lines: { id: string; quantity: number }[]
): Promise<Cart> {
  const data = await storefrontFetch<{
    cartLinesUpdate: { cart: Cart | null; userErrors: UserError[] };
  }>(CART_LINES_UPDATE_MUTATION, { cartId, lines });
  assertNoUserErrors(data.cartLinesUpdate.userErrors, 'שגיאה בעדכון העגלה');
  if (!data.cartLinesUpdate.cart) throw new StorefrontError('שגיאה בעדכון העגלה');
  return data.cartLinesUpdate.cart;
}

export async function cartLinesRemove(cartId: string, lineIds: string[]): Promise<Cart> {
  const data = await storefrontFetch<{
    cartLinesRemove: { cart: Cart | null; userErrors: UserError[] };
  }>(CART_LINES_REMOVE_MUTATION, { cartId, lineIds });
  assertNoUserErrors(data.cartLinesRemove.userErrors, 'שגיאה בהסרה מהעגלה');
  if (!data.cartLinesRemove.cart) throw new StorefrontError('שגיאה בהסרה מהעגלה');
  return data.cartLinesRemove.cart;
}

export async function cartNoteUpdate(cartId: string, note: string): Promise<Cart> {
  const data = await storefrontFetch<{
    cartNoteUpdate: { cart: Cart | null; userErrors: UserError[] };
  }>(CART_NOTE_UPDATE_MUTATION, { cartId, note });
  assertNoUserErrors(data.cartNoteUpdate.userErrors, 'שגיאה בעדכון ההערה');
  if (!data.cartNoteUpdate.cart) throw new StorefrontError('שגיאה בעדכון ההערה');
  return data.cartNoteUpdate.cart;
}

/* ---------- Money formatting ---------- */

export function formatMoney(money: { amount: string; currencyCode: string }): string {
  const amount = parseFloat(money.amount);
  /* אגורות שלמות בלבד נשארות בלי שברי אגורה - "₪1,234" ולא "₪1,234.00" - אבל
     כשיש שברים חייבים להציג שתי ספרות. minimumFractionDigits: 0 השמיט את האפס
     הסופי, ולכן 19.90 הופיע כ-"₪19.9" ו-1234.50 כ-"₪1,234.5": מחיר שלא תואם את
     anshilo.com ולא את עמוד התשלום של Shopify, בחנות שבה מרבית המחירים נגמרים
     ב-.90. */
  const whole = Number.isInteger(amount);
  const formatted = amount.toLocaleString('he-IL', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
  const symbol = money.currencyCode === 'ILS' ? '₪' : money.currencyCode + ' ';
  return `${symbol}${formatted}`;
}
