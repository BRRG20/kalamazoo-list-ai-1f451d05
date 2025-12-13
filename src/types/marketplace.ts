// Marketplace connection types
export type MarketplaceType = 'shopify' | 'etsy' | 'ebay';

export interface MarketplaceConnection {
  id: string;
  marketplace: MarketplaceType;
  shop_id: string | null;
  shop_name: string | null;
  connected_at: string;
  expires_at: string | null;
  is_active: boolean;
}

export type MarketplaceStatus = 
  | 'not_connected'
  | 'ready'
  | 'missing_fields'
  | 'publishing'
  | 'published'
  | 'error';

export interface MarketplaceValidation {
  isValid: boolean;
  missingFields: string[];
  warnings: string[];
}

// Etsy-specific types
export interface EtsyListingPayload {
  title: string;
  description: string;
  price: number;
  quantity: number;
  who_made: 'i_did' | 'someone_else' | 'collective';
  when_made: string;
  taxonomy_id: number;
  tags: string[];
  materials: string[];
  shipping_profile_id?: number;
  images: string[];
}

// eBay-specific types  
export interface EbayListingPayload {
  title: string;
  description: string;
  price: number;
  quantity: number;
  condition: string;
  conditionDescription?: string;
  categoryId: string;
  itemSpecifics: Record<string, string>;
  images: string[];
}

// Shopify payload (already exists, but typed here for consistency)
export interface ShopifyProductPayload {
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  tags: string;
  variants: Array<{
    price: string;
    sku: string;
    inventory_quantity: number;
    inventory_management: string;
  }>;
  images: Array<{ src: string }>;
}

// Sleeve length options for marketplace compatibility
export const SLEEVE_LENGTHS = [
  'Sleeveless',
  'Short Sleeve', 
  '3/4 Sleeve',
  'Long Sleeve',
] as const;

export type SleeveLength = typeof SLEEVE_LENGTHS[number];

// Size types for eBay
export const SIZE_TYPES = [
  'Regular',
  'Plus',
  'Petite',
  'Tall',
  'Big & Tall',
] as const;

export type SizeType = typeof SIZE_TYPES[number];

// Who made options for Etsy
export const WHO_MADE_OPTIONS = [
  { value: 'i_did', label: 'I did' },
  { value: 'someone_else', label: 'A member of my shop' },
  { value: 'collective', label: 'Another company or person' },
] as const;

// When made options for Etsy
export const WHEN_MADE_OPTIONS = [
  { value: 'made_to_order', label: 'Made to order' },
  { value: '2020_2025', label: '2020-2025' },
  { value: '2010_2019', label: '2010-2019' },
  { value: '2000_2009', label: '2000s' },
  { value: '1990s', label: '1990s' },
  { value: '1980s', label: '1980s' },
  { value: '1970s', label: '1970s' },
  { value: 'before_1970', label: 'Before 1970' },
] as const;

// Category mappings (simplified - would be loaded from API in production)
export const GARMENT_CATEGORY_MAP: Record<string, {
  shopify: string;
  etsy: string;
  ebay: string;
  ebay_category_id: string;
}> = {
  hoodie: {
    shopify: 'Sweatshirts & Hoodies',
    etsy: 'Clothing > Unisex Adult Clothing > Hoodies & Sweatshirts',
    ebay: 'Hoodies & Sweatshirts',
    ebay_category_id: '155183',
  },
  sweater: {
    shopify: 'Sweaters',
    etsy: 'Clothing > Unisex Adult Clothing > Sweaters',
    ebay: 'Sweaters',
    ebay_category_id: '11484',
  },
  jumper: {
    shopify: 'Sweaters',
    etsy: 'Clothing > Unisex Adult Clothing > Sweaters',
    ebay: 'Sweaters',
    ebay_category_id: '11484',
  },
  't-shirt': {
    shopify: 'T-Shirts',
    etsy: 'Clothing > Unisex Adult Clothing > Tops & Tees > T-Shirts',
    ebay: 'T-Shirts',
    ebay_category_id: '15687',
  },
  shirt: {
    shopify: 'Shirts',
    etsy: 'Clothing > Unisex Adult Clothing > Tops & Tees',
    ebay: 'Casual Shirts',
    ebay_category_id: '57990',
  },
  'flannel shirt': {
    shopify: 'Shirts',
    etsy: 'Clothing > Unisex Adult Clothing > Tops & Tees',
    ebay: 'Casual Shirts',
    ebay_category_id: '57990',
  },
  jacket: {
    shopify: 'Jackets & Coats',
    etsy: 'Clothing > Unisex Adult Clothing > Jackets & Coats',
    ebay: 'Coats, Jackets & Vests',
    ebay_category_id: '57988',
  },
  coat: {
    shopify: 'Jackets & Coats',
    etsy: 'Clothing > Unisex Adult Clothing > Jackets & Coats',
    ebay: 'Coats, Jackets & Vests',
    ebay_category_id: '57988',
  },
  cardigan: {
    shopify: 'Sweaters',
    etsy: 'Clothing > Unisex Adult Clothing > Sweaters',
    ebay: 'Sweaters',
    ebay_category_id: '11484',
  },
  vest: {
    shopify: 'Vests',
    etsy: 'Clothing > Unisex Adult Clothing > Vests',
    ebay: 'Vests',
    ebay_category_id: '15691',
  },
  fleece: {
    shopify: 'Sweatshirts & Hoodies',
    etsy: 'Clothing > Unisex Adult Clothing > Hoodies & Sweatshirts',
    ebay: 'Sweatshirts & Hoodies',
    ebay_category_id: '155183',
  },
  jeans: {
    shopify: 'Jeans',
    etsy: 'Clothing > Unisex Adult Clothing > Pants > Jeans',
    ebay: 'Jeans',
    ebay_category_id: '11483',
  },
  trousers: {
    shopify: 'Pants',
    etsy: 'Clothing > Unisex Adult Clothing > Pants',
    ebay: 'Pants',
    ebay_category_id: '57989',
  },
  dress: {
    shopify: 'Dresses',
    etsy: 'Clothing > Women\'s Clothing > Dresses',
    ebay: 'Dresses',
    ebay_category_id: '63861',
  },
  skirt: {
    shopify: 'Skirts',
    etsy: 'Clothing > Women\'s Clothing > Skirts',
    ebay: 'Skirts',
    ebay_category_id: '63864',
  },
  shorts: {
    shopify: 'Shorts',
    etsy: 'Clothing > Unisex Adult Clothing > Shorts',
    ebay: 'Shorts',
    ebay_category_id: '15689',
  },
  blouse: {
    shopify: 'Blouses',
    etsy: 'Clothing > Women\'s Clothing > Tops & Tees > Blouses',
    ebay: 'Blouses',
    ebay_category_id: '53159',
  },
};
