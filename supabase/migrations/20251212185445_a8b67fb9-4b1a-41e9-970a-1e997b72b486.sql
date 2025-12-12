-- Add review mode settings columns to settings table
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS auto_start_recording boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_scroll_review boolean DEFAULT false;