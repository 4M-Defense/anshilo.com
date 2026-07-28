/** שאילתות GraphQL ל-Shopify Storefront API */

const IMAGE_FRAGMENT = `#graphql
  fragment ImageFields on Image {
    url
    altText
    width
    height
  }
`;

const MONEY_FRAGMENT = `#graphql
  fragment MoneyFields on MoneyV2 {
    amount
    currencyCode
  }
`;

export const PRODUCT_CARD_FRAGMENT = `#graphql
  fragment ProductCardFields on Product {
    id
    handle
    title
    vendor
    availableForSale
    featuredImage {
      ...ImageFields
    }
    priceRange {
      minVariantPrice { ...MoneyFields }
      maxVariantPrice { ...MoneyFields }
    }
    compareAtPriceRange {
      minVariantPrice { ...MoneyFields }
      maxVariantPrice { ...MoneyFields }
    }
    variants(first: 1) {
      nodes {
        id
        availableForSale
      }
    }
  }
  ${IMAGE_FRAGMENT}
  ${MONEY_FRAGMENT}
`;

export const CART_FRAGMENT = `#graphql
  fragment CartFields on Cart {
    id
    checkoutUrl
    totalQuantity
    note
    cost {
      subtotalAmount { ...MoneyFields }
      totalAmount { ...MoneyFields }
    }
    lines(first: 100) {
      nodes {
        id
        quantity
        cost {
          totalAmount { ...MoneyFields }
          compareAtAmountPerQuantity { ...MoneyFields }
        }
        merchandise {
          ... on ProductVariant {
            id
            title
            availableForSale
            price { ...MoneyFields }
            compareAtPrice { ...MoneyFields }
            image { ...ImageFields }
            selectedOptions { name value }
            product {
              id
              handle
              title
              vendor
            }
          }
        }
      }
    }
  }
  ${IMAGE_FRAGMENT}
  ${MONEY_FRAGMENT}
`;

export const SHOP_QUERY = `#graphql
  query ShopInfo {
    shop {
      name
      primaryDomain { url }
    }
  }
`;

export const COLLECTIONS_QUERY = `#graphql
  query Collections($first: Int!, $after: String) {
    collections(first: $first, after: $after, sortKey: TITLE) {
      nodes {
        id
        handle
        title
        description
        image { ...ImageFields }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
  ${IMAGE_FRAGMENT}
`;

export const COLLECTION_PRODUCTS_QUERY = `#graphql
  query CollectionProducts(
    $handle: String!
    $first: Int!
    $after: String
    $sortKey: ProductCollectionSortKeys!
    $reverse: Boolean!
  ) {
    collection(handle: $handle) {
      id
      handle
      title
      description
      image { ...ImageFields }
      products(first: $first, after: $after, sortKey: $sortKey, reverse: $reverse) {
        nodes { ...ProductCardFields }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
  ${PRODUCT_CARD_FRAGMENT}
`;

export const PRODUCTS_QUERY = `#graphql
  query Products(
    $first: Int!
    $after: String
    $sortKey: ProductSortKeys!
    $reverse: Boolean!
    $query: String
  ) {
    products(first: $first, after: $after, sortKey: $sortKey, reverse: $reverse, query: $query) {
      nodes { ...ProductCardFields }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
  ${PRODUCT_CARD_FRAGMENT}
`;

export const PRODUCT_BY_HANDLE_QUERY = `#graphql
  query ProductByHandle($handle: String!) {
    product(handle: $handle) {
      id
      handle
      title
      vendor
      description
      descriptionHtml
      availableForSale
      createdAt
      tags
      featuredImage { ...ImageFields }
      images(first: 12) {
        nodes { ...ImageFields }
      }
      options {
        name
        optionValues { name }
      }
      priceRange {
        minVariantPrice { ...MoneyFields }
        maxVariantPrice { ...MoneyFields }
      }
      compareAtPriceRange {
        minVariantPrice { ...MoneyFields }
        maxVariantPrice { ...MoneyFields }
      }
      variants(first: 100) {
        nodes {
          id
          title
          availableForSale
          quantityAvailable
          sku
          price { ...MoneyFields }
          compareAtPrice { ...MoneyFields }
          selectedOptions { name value }
          image { ...ImageFields }
        }
      }
    }
  }
  ${IMAGE_FRAGMENT}
  ${MONEY_FRAGMENT}
`;

export const SEARCH_QUERY = `#graphql
  query SearchProducts($query: String!, $first: Int!, $after: String) {
    search(query: $query, first: $first, after: $after, types: [PRODUCT]) {
      nodes {
        ... on Product { ...ProductCardFields }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
  ${PRODUCT_CARD_FRAGMENT}
`;

export const PRODUCT_RECOMMENDATIONS_QUERY = `#graphql
  query ProductRecommendations($productId: ID!) {
    productRecommendations(productId: $productId, intent: RELATED) {
      ...ProductCardFields
    }
  }
  ${PRODUCT_CARD_FRAGMENT}
`;

/* ---------- Cart mutations ---------- */

export const CART_CREATE_MUTATION = `#graphql
  mutation CartCreate($input: CartInput!) {
    cartCreate(input: $input) {
      cart { ...CartFields }
      userErrors { field message }
    }
  }
  ${CART_FRAGMENT}
`;

export const CART_QUERY = `#graphql
  query GetCart($cartId: ID!) {
    cart(id: $cartId) {
      ...CartFields
    }
  }
  ${CART_FRAGMENT}
`;

export const CART_LINES_ADD_MUTATION = `#graphql
  mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart { ...CartFields }
      userErrors { field message }
    }
  }
  ${CART_FRAGMENT}
`;

export const CART_LINES_UPDATE_MUTATION = `#graphql
  mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart { ...CartFields }
      userErrors { field message }
    }
  }
  ${CART_FRAGMENT}
`;

export const CART_LINES_REMOVE_MUTATION = `#graphql
  mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      cart { ...CartFields }
      userErrors { field message }
    }
  }
  ${CART_FRAGMENT}
`;

export const CART_NOTE_UPDATE_MUTATION = `#graphql
  mutation CartNoteUpdate($cartId: ID!, $note: String!) {
    cartNoteUpdate(cartId: $cartId, note: $note) {
      cart { ...CartFields }
      userErrors { field message }
    }
  }
  ${CART_FRAGMENT}
`;
