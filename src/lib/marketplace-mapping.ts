/**
 * Marketplace Mapping Layer
 * Maps internal product data to marketplace-specific payloads
 */

import type { Product, ProductImage } from '@/types';
import { 
  GARMENT_CATEGORY_MAP,
  type MarketplaceValidation,
  type ShopifyProductPayload,
  type EtsyListingPayload,
  type EbayListingPayload,
} from '@/types/marketplace';

// Validate and map product to Shopify format
export function mapToShopify(
  product: Product, 
  images: ProductImage[]
): { payload: ShopifyProductPayload; validation: MarketplaceValidation } {
  const validation: MarketplaceValidation = {
    isValid: true,
    missingFields: [],
    warnings: [],
  };

  // Required fields for Shopify
  if (!product.title?.trim()) {
    validation.missingFields.push('Title');
  }
  if (!product.price || product.price <= 0) {
    validation.missingFields.push('Price');
  }
  if (images.length === 0) {
    validation.missingFields.push('Images');
  }

  // Warnings
  if (!product.description?.trim() && !product.description_style_a?.trim()) {
    validation.warnings.push('No description set');
  }
  if (!product.brand?.trim()) {
    validation.warnings.push('No brand set');
  }

  validation.isValid = validation.missingFields.length === 0;

  // Build description HTML
  const description = product.description_style_a || product.description || '';
  const descriptionHtml = description
    .split('\n\n')
    .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('');

  // Combine tags
  const allTags = [
    product.shopify_tags,
    product.collections_tags,
  ].filter(Boolean).join(', ');

  // Get product type from garment_type mapping
  const garmentType = product.garment_type?.toLowerCase() || '';
  const categoryMapping = GARMENT_CATEGORY_MAP[garmentType];
  const productType = categoryMapping?.shopify || product.garment_type || 'Vintage Clothing';

  const payload: ShopifyProductPayload = {
    title: product.title || 'Untitled Product',
    body_html: descriptionHtml,
    vendor: product.brand || 'Kalamazoo Vintage',
    product_type: productType,
    tags: allTags,
    variants: [{
      price: String(product.price || 0),
      sku: product.sku || '',
      inventory_quantity: 1,
      inventory_management: 'shopify',
    }],
    images: images
      .sort((a, b) => a.position - b.position)
      .map(img => ({ src: img.url })),
  };

  return { payload, validation };
}

// Validate and map product to Etsy format
export function mapToEtsy(
  product: Product & { 
    who_made?: string; 
    when_made?: string;
    sleeve_length?: string;
  }, 
  images: ProductImage[]
): { payload: EtsyListingPayload; validation: MarketplaceValidation } {
  const validation: MarketplaceValidation = {
    isValid: true,
    missingFields: [],
    warnings: [],
  };

  // Required fields for Etsy
  if (!product.title?.trim()) {
    validation.missingFields.push('Title');
  }
  if (!product.price || product.price <= 0) {
    validation.missingFields.push('Price');
  }
  if (images.length === 0) {
    validation.missingFields.push('Images');
  }
  if (!product.who_made) {
    validation.missingFields.push('Who made');
  }
  if (!product.when_made) {
    validation.missingFields.push('When made');
  }

  // Etsy tags validation - must be 2-3 words each
  const etsyTags = (product.etsy_tags || '')
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0);
  
  if (etsyTags.length === 0) {
    validation.missingFields.push('Etsy tags');
  } else if (etsyTags.length < 5) {
    validation.warnings.push('Consider adding more tags (Etsy allows 13)');
  }

  // Check for single-word tags
  const singleWordTags = etsyTags.filter(t => t.split(' ').length === 1);
  if (singleWordTags.length > 0) {
    validation.warnings.push(`Single-word tags may hurt SEO: ${singleWordTags.join(', ')}`);
  }

  // Warnings
  if (!product.description?.trim() && !product.description_style_a?.trim()) {
    validation.warnings.push('No description set');
  }
  if (!product.material?.trim()) {
    validation.warnings.push('No materials listed');
  }

  validation.isValid = validation.missingFields.length === 0;

  // Get taxonomy ID from garment type mapping
  const garmentType = product.garment_type?.toLowerCase() || '';
  const categoryMapping = GARMENT_CATEGORY_MAP[garmentType];
  // Default to generic clothing taxonomy if not found
  const taxonomyId = 1; // Would be replaced with actual Etsy taxonomy lookup

  // Parse materials
  const materials = (product.material || '')
    .split(/[,;]/)
    .map(m => m.trim())
    .filter(m => m.length > 0);

  const payload: EtsyListingPayload = {
    title: (product.title || 'Untitled Product').slice(0, 140), // Etsy 140 char limit
    description: product.description_style_a || product.description || '',
    price: product.price || 0,
    quantity: 1,
    who_made: (product.who_made as any) || 'someone_else',
    when_made: product.when_made || 'before_1970',
    taxonomy_id: taxonomyId,
    tags: etsyTags.slice(0, 13), // Etsy max 13 tags
    materials: materials.slice(0, 13), // Etsy max 13 materials
    images: images
      .sort((a, b) => a.position - b.position)
      .map(img => img.url),
  };

  return { payload, validation };
}

// Validate and map product to eBay format
export function mapToEbay(
  product: Product & {
    sleeve_length?: string;
    size_type?: string;
    style?: string;
  }, 
  images: ProductImage[]
): { payload: EbayListingPayload; validation: MarketplaceValidation } {
  const validation: MarketplaceValidation = {
    isValid: true,
    missingFields: [],
    warnings: [],
  };

  // Required fields for eBay
  if (!product.title?.trim()) {
    validation.missingFields.push('Title');
  }
  if (!product.price || product.price <= 0) {
    validation.missingFields.push('Price');
  }
  if (images.length === 0) {
    validation.missingFields.push('Images');
  }
  if (!product.condition) {
    validation.missingFields.push('Condition');
  }
  if (!product.size_label) {
    validation.missingFields.push('Size');
  }

  // eBay category-specific required fields
  if (!product.brand?.trim()) {
    validation.warnings.push('Brand strongly recommended for eBay');
  }
  if (!product.colour_main?.trim()) {
    validation.warnings.push('Color recommended for eBay visibility');
  }

  validation.isValid = validation.missingFields.length === 0;

  // Get eBay category from garment type
  const garmentType = product.garment_type?.toLowerCase() || '';
  const categoryMapping = GARMENT_CATEGORY_MAP[garmentType];
  const categoryId = categoryMapping?.ebay_category_id || '155183'; // Default to hoodies

  // Map condition to eBay format
  const conditionMap: Record<string, string> = {
    'Excellent': '3000', // Used - Excellent
    'Very good': '4000', // Used - Very Good  
    'Good': '5000', // Used - Good
    'Fair': '6000', // Used - Fair
  };
  const ebayCondition = conditionMap[product.condition || 'Good'] || '4000';

  // Build item specifics
  const itemSpecifics: Record<string, string> = {};
  
  if (product.brand) itemSpecifics['Brand'] = product.brand;
  if (product.size_label) itemSpecifics['Size'] = product.size_label;
  if (product.size_type) itemSpecifics['Size Type'] = product.size_type;
  if (product.department) itemSpecifics['Department'] = product.department;
  if (product.material) itemSpecifics['Material'] = product.material;
  if (product.colour_main) itemSpecifics['Color'] = product.colour_main;
  if (product.pattern) itemSpecifics['Pattern'] = product.pattern;
  if (product.sleeve_length) itemSpecifics['Sleeve Length'] = product.sleeve_length;
  if (product.style) itemSpecifics['Style'] = product.style;
  if (product.fit) itemSpecifics['Fit'] = product.fit;
  if (product.made_in) itemSpecifics['Country/Region of Manufacture'] = product.made_in;

  const payload: EbayListingPayload = {
    title: (product.title || 'Untitled Product').slice(0, 80), // eBay 80 char limit
    description: product.description_style_a || product.description || '',
    price: product.price || 0,
    quantity: 1,
    condition: ebayCondition,
    conditionDescription: product.flaws || undefined,
    categoryId: categoryId,
    itemSpecifics: itemSpecifics,
    images: images
      .sort((a, b) => a.position - b.position)
      .map(img => img.url),
  };

  return { payload, validation };
}

// Get marketplace status for a product
export function getMarketplaceStatus(
  product: Product & {
    etsy_listing_id?: string | null;
    etsy_listing_state?: string | null;
    ebay_listing_id?: string | null;
    ebay_listing_state?: string | null;
  },
  marketplace: 'shopify' | 'etsy' | 'ebay'
): { status: string; listingId?: string } {
  switch (marketplace) {
    case 'shopify':
      if (product.shopify_product_id) {
        return { status: 'published', listingId: product.shopify_product_id };
      }
      return { status: 'not_published' };
    
    case 'etsy':
      if (product.etsy_listing_id) {
        return { 
          status: product.etsy_listing_state || 'published', 
          listingId: product.etsy_listing_id 
        };
      }
      return { status: 'not_published' };
    
    case 'ebay':
      if (product.ebay_listing_id) {
        return { 
          status: product.ebay_listing_state || 'published', 
          listingId: product.ebay_listing_id 
        };
      }
      return { status: 'not_published' };
    
    default:
      return { status: 'not_published' };
  }
}
