-- Add is_hidden boolean field to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

-- Create index for efficient filtering of hidden products
CREATE INDEX IF NOT EXISTS idx_products_is_hidden ON public.products(is_hidden) WHERE is_hidden = false;