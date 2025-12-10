-- Add description_style_a and description_style_b columns to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS description_style_a TEXT,
ADD COLUMN IF NOT EXISTS description_style_b TEXT;