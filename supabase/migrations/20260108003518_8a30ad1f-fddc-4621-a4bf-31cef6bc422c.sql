-- Add deleted_at column to images table for soft delete/trash functionality
ALTER TABLE public.images 
ADD COLUMN deleted_at timestamp with time zone DEFAULT NULL;

-- Create index for efficient querying of non-deleted images
CREATE INDEX idx_images_deleted_at ON public.images(deleted_at);

-- Update RLS policies to exclude deleted images by default
DROP POLICY IF EXISTS "Users can view their own images" ON public.images;

CREATE POLICY "Users can view their own non-deleted images" 
ON public.images 
FOR SELECT 
USING (auth.uid() = user_id AND deleted_at IS NULL);

CREATE POLICY "Users can view their own deleted images" 
ON public.images 
FOR SELECT 
USING (auth.uid() = user_id AND deleted_at IS NOT NULL);