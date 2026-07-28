/** טיפוסי הנתונים של Shopify Storefront API (מצומצמים לצרכי האפליקציה) */

export interface MoneyV2 {
  amount: string;
  currencyCode: string;
}

export interface ShopifyImage {
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
}

export interface ProductVariant {
  id: string;
  title: string;
  availableForSale: boolean;
  quantityAvailable: number | null;
  sku: string | null;
  price: MoneyV2;
  compareAtPrice: MoneyV2 | null;
  selectedOptions: { name: string; value: string }[];
  image: ShopifyImage | null;
}

export interface ProductOption {
  name: string;
  optionValues: { name: string }[];
}

export interface Product {
  id: string;
  handle: string;
  title: string;
  vendor: string;
  description: string;
  descriptionHtml: string;
  availableForSale: boolean;
  createdAt: string;
  tags: string[];
  featuredImage: ShopifyImage | null;
  images: { nodes: ShopifyImage[] };
  options: ProductOption[];
  priceRange: {
    minVariantPrice: MoneyV2;
    maxVariantPrice: MoneyV2;
  };
  compareAtPriceRange: {
    minVariantPrice: MoneyV2;
    maxVariantPrice: MoneyV2;
  };
  variants: { nodes: ProductVariant[] };
}

/** גרסה קלה לכרטיסי מוצר ברשימות */
export type ProductCardData = Pick<
  Product,
  | 'id'
  | 'handle'
  | 'title'
  | 'vendor'
  | 'availableForSale'
  | 'featuredImage'
  | 'priceRange'
  | 'compareAtPriceRange'
> & {
  variants: { nodes: Pick<ProductVariant, 'id' | 'availableForSale'>[] };
};

export interface Collection {
  id: string;
  handle: string;
  title: string;
  description: string;
  image: ShopifyImage | null;
}

export interface CollectionWithProducts extends Collection {
  products: {
    nodes: ProductCardData[];
    pageInfo: PageInfo;
  };
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface CartLine {
  id: string;
  quantity: number;
  cost: {
    totalAmount: MoneyV2;
    compareAtAmountPerQuantity: MoneyV2 | null;
  };
  merchandise: {
    id: string;
    title: string;
    availableForSale: boolean;
    price: MoneyV2;
    compareAtPrice: MoneyV2 | null;
    image: ShopifyImage | null;
    selectedOptions: { name: string; value: string }[];
    product: {
      id: string;
      handle: string;
      title: string;
      vendor: string;
    };
  };
}

export interface Cart {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  note: string | null;
  cost: {
    subtotalAmount: MoneyV2;
    totalAmount: MoneyV2;
  };
  lines: { nodes: CartLine[] };
}

export interface ShopInfo {
  name: string;
  primaryDomain: { url: string };
}

export type ProductSortKey =
  | 'RELEVANCE'
  | 'BEST_SELLING'
  | 'CREATED_AT'
  | 'PRICE'
  | 'TITLE';

export interface UserError {
  field: string[] | null;
  message: string;
}
