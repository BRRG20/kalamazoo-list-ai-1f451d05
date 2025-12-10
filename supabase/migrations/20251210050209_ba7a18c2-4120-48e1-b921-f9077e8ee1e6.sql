-- Add user_id column to all tables for proper user ownership
ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.images ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Remove the Shopify access token column (will be stored in edge function secrets)
ALTER TABLE public.settings DROP COLUMN IF EXISTS shopify_access_token;

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Allow all access to batches" ON public.batches;
DROP POLICY IF EXISTS "Allow all access to products" ON public.products;
DROP POLICY IF EXISTS "Allow all access to images" ON public.images;
DROP POLICY IF EXISTS "Allow all access to settings" ON public.settings;

-- Create proper RLS policies for batches
CREATE POLICY "Users can view their own batches" 
ON public.batches FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own batches" 
ON public.batches FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own batches" 
ON public.batches FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own batches" 
ON public.batches FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);

-- Create proper RLS policies for products
CREATE POLICY "Users can view their own products" 
ON public.products FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own products" 
ON public.products FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own products" 
ON public.products FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own products" 
ON public.products FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);

-- Create proper RLS policies for images
CREATE POLICY "Users can view their own images" 
ON public.images FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own images" 
ON public.images FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own images" 
ON public.images FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own images" 
ON public.images FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);

-- Create proper RLS policies for settings
CREATE POLICY "Users can view their own settings" 
ON public.settings FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own settings" 
ON public.settings FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings" 
ON public.settings FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own settings" 
ON public.settings FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);