-- Add source column to images table to track image origin
ALTER TABLE public.images 
ADD COLUMN source TEXT DEFAULT 'upload';

-- Add comment for documentation
COMMENT ON COLUMN public.images.source IS 'Tracks image origin: upload, model_tryon, background_removal, ghost_mannequin';