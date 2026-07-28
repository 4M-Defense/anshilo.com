import { SHOPIFY_CONFIG } from '../config';
import {
  CART_CREATE_MUTATION,
  CART_LINES_ADD_MUTATION,
  CART_LINES_REMOVE_MUTATION,
  CART_LINES_UPDATE_MUTATION,
  CART_NOTE_UPDATE_MUTATION,
  CART_QUERY,
  COLLECTION_PRODUCTS_QUERY,
  COLLECTIONS_QUERY,
  PRODUCT_BY_HANDLE_QUERY,
  PRODUCT_RECOMMENDATIONS_QUERY,
  PRODUCTS_QUERY,
  SEARCH_QUERY,
  SHOP_QUERY,
} from './queries';
import type {
  Cart,
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

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new StorefrontError(
        'טוקן ה-Storefront API שגוי או חסר. עדכנו את src/config.ts.'
      );
    }
    throw new StorefrontError(`שגיאת שרת (${response.status}). נסו שוב מאוחר יותר.`);
  }

  const json = (await response.json()) as {
    data?: T;
    errors?: { message: string }[];
  };

  if (json.errors?.length) {
    throw new StorefrontError(json.errors[0].message, json.errors);
  }
  if (!json.data) {
    throw new StorefrontError('תשובה ריקה מהשרת');
  }
  return json.data;
}

function assertNoUserErrors(errors: UserError[] | undefined, fallback: string) {
  if (errors && errors.length > 0) {
    throw new StorefrontError(errors[0].message || fallback, errors);
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

export async function getCart(cartId: string): Promise<Cart | null> {
  const data = await storefrontFetch<{ cart: Cart | null }>(CART_QUERY, { cartId });
  return data.cart;
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
  const formatted = amount.toLocaleString('he-IL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const symbol = money.currencyCode === 'ILS' ? '₪' : money.currencyCode + ' ';
  return `${symbol}${formatted}`;
}
