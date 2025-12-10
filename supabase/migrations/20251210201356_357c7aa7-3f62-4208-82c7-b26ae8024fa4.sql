-- Remove overly permissive PUBLIC storage policies
-- Keep only the user-scoped policies that restrict access by auth.uid()

DROP POLICY IF EXISTS "Public read access for product images" ON storage.objects;
DROP POLICY IF EXISTS "Public insert access for product images" ON storage.objects;
DROP POLICY IF EXISTS "Public update access for product images" ON storage.objects;
DROP POLICY IF EXISTS "Public delete access for product images" ON storage.objects;