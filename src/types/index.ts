export type ProductStatus = 
  | "new" 
  | "generated" 
  | "ready_for_shopify" 
  | "created_in_shopify" 
  | "error";

export type Department = "Women" | "Men" | "Unisex" | "Kids" | "";

export type Era = "80s" | "90s" | "Y2K" | "Modern" | "";

export type Condition = 
  | "Excellent" 
  | "Very good" 
  | "Good" 
  | "Fair" 
  | "";

export interface Batch {
  id: string;
  name: string;
  created_at: string;
  notes: string;
}

export interface Product {
  id: string;
  batch_id: string;
  sku: string;
  status: ProductStatus;
  raw_input_text: string;
  title: string;
  description: string;
  description_style_a: string;
  description_style_b: string;
  price: number;
  currency: string;
  era: Era;
  garment_type: string;
  department: Department;
  brand: string;
  colour_main: string;
  colour_secondary: string;
  pattern: string;
  size_label: string;
  size_recommended: string;
  fit: string;
  material: string;
  condition: Condition;
  flaws: string;
  pit_to_pit: string;
  made_in: string;
  notes: string;
  shopify_tags: string;
  etsy_tags: string;
  collections_tags: string;
  shopify_product_id: string | null;
  shopify_handle: string | null;
  listing_block: string;
  // Shopify upload tracking fields
  uploaded_at?: string | null;
  upload_error?: string | null;
  // Marketplace fields
  etsy_listing_id?: string | null;
  etsy_listing_state?: string | null;
  ebay_listing_id?: string | null;
  ebay_listing_state?: string | null;
  sleeve_length?: string;
  style?: string;
  size_type?: string;
  who_made?: string;
  when_made?: string;
  category_path?: string;
  // Hidden state - persisted in database
  is_hidden?: boolean;
  // Grouping lock - prevents auto-group from reshuffling this product
  is_grouped?: boolean;
}

export interface ProductImage {
  id: string;
  product_id: string;
  url: string;
  position: number;
  include_in_shopify: boolean;
  source?: 'upload' | 'model_tryon' | 'background_removal' | 'ghost_mannequin' | 'ai_expansion';
  // Camera capture metadata
  note?: string;
  has_stain?: boolean;
  shot_type?: 'front' | 'back' | 'label' | 'detail';
}

export interface Settings {
  id: string;
  shopify_store_url: string;
  default_images_per_product: number;
  default_currency: string;
}

export interface UploadedImage {
  id: string;
  file: File;
  url: string;
  batch_id: string;
  product_id?: string;
}
