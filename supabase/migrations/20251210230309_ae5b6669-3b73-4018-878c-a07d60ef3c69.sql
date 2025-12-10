-- Add gender and keywords columns to default_tags table
ALTER TABLE public.default_tags 
ADD COLUMN IF NOT EXISTS gender text DEFAULT 'both' CHECK (gender IN ('men', 'women', 'both')),
ADD COLUMN IF NOT EXISTS keywords text[] DEFAULT '{}'::text[];