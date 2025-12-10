-- Create authorized_emails table for server-side email validation
CREATE TABLE public.authorized_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on authorized_emails (but allow public read for auth check)
ALTER TABLE public.authorized_emails ENABLE ROW LEVEL SECURITY;

-- Allow anyone to check if an email is authorized (needed during sign-in)
CREATE POLICY "Anyone can check authorized emails"
ON public.authorized_emails
FOR SELECT
USING (true);

-- Only service role can modify authorized emails (no user modification)
-- No INSERT/UPDATE/DELETE policies for regular users

-- Insert the authorized emails
INSERT INTO public.authorized_emails (email) VALUES
  ('santanagonsalves7@gmail.com'),
  ('ebonygonsalves01@gmail.com');

-- Create function to check if email is authorized (for use in triggers/checks)
CREATE OR REPLACE FUNCTION public.is_email_authorized(check_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.authorized_emails
    WHERE LOWER(email) = LOWER(check_email)
  )
$$;

-- Fix storage bucket RLS policies for product-images
-- First drop existing overly permissive policies
DROP POLICY IF EXISTS "Allow public read access" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete" ON storage.objects;

-- Create secure storage policies scoped by user
CREATE POLICY "Users can view product images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

CREATE POLICY "Authenticated users can upload to own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update own images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product-images' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete own images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-images' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);