-- Add is_grouped field to products table for per-product grouping lock
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS is_grouped boolean NOT NULL DEFAULT false;

-- Add index for filtering grouped products
CREATE INDEX IF NOT EXISTS idx_products_is_grouped ON public.products(is_grouped);