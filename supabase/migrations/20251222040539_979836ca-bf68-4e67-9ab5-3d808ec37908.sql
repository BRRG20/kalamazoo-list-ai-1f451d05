-- Add Shopify tracking fields to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS upload_error TEXT;

-- Backfill: Mark products with shopify_product_id as uploaded
UPDATE public.products 
SET 
  status = 'created_in_shopify',
  uploaded_at = COALESCE(uploaded_at, updated_at)
WHERE shopify_product_id IS NOT NULL 
  AND status != 'created_in_shopify';

-- Create index for efficient counting
CREATE INDEX IF NOT EXISTS idx_products_shopify_status 
ON public.products (user_id, status, shopify_product_id) 
WHERE deleted_at IS NULL;