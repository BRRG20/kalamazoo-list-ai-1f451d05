-- Drop the overly permissive storage policies that allow any authenticated user to update/delete any images
-- These policies override the user-scoped policies due to PostgreSQL's OR logic for RLS

DROP POLICY IF EXISTS "Authenticated users can update images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete images" ON storage.objects;