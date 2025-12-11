-- Add deleted_at column to products table for soft delete
ALTER TABLE public.products 
ADD COLUMN deleted_at timestamp with time zone DEFAULT NULL;

-- Create index for faster queries on non-deleted products
CREATE INDEX idx_products_deleted_at ON public.products(deleted_at);

-- Update the SELECT policy to exclude deleted products by default
DROP POLICY IF EXISTS "Users can view their own products" ON public.products;

CREATE POLICY "Users can view their own products" 
ON public.products 
FOR SELECT 
USING (auth.uid() = user_id AND deleted_at IS NULL);

-- Add a separate policy to view deleted products (for recovery UI)
CREATE POLICY "Users can view their own deleted products" 
ON public.products 
FOR SELECT 
USING (auth.uid() = user_id AND deleted_at IS NOT NULL);