-- Add marketplace tracking fields to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS etsy_listing_id text NULL,
ADD COLUMN IF NOT EXISTS etsy_listing_state text NULL,
ADD COLUMN IF NOT EXISTS ebay_listing_id text NULL,
ADD COLUMN IF NOT EXISTS ebay_listing_state text NULL,
ADD COLUMN IF NOT EXISTS sleeve_length text NULL,
ADD COLUMN IF NOT EXISTS style text NULL,
ADD COLUMN IF NOT EXISTS size_type text NULL,
ADD COLUMN IF NOT EXISTS who_made text NULL,
ADD COLUMN IF NOT EXISTS when_made text NULL,
ADD COLUMN IF NOT EXISTS category_path text NULL;

-- Add marketplace connection settings
ALTER TABLE public.settings
ADD COLUMN IF NOT EXISTS etsy_shop_id text NULL,
ADD COLUMN IF NOT EXISTS etsy_connected_at timestamp with time zone NULL,
ADD COLUMN IF NOT EXISTS ebay_connected_at timestamp with time zone NULL;

-- Create marketplace_connections table for OAuth tokens (stored securely)
CREATE TABLE IF NOT EXISTS public.marketplace_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  marketplace text NOT NULL CHECK (marketplace IN ('etsy', 'ebay')),
  shop_id text NULL,
  shop_name text NULL,
  connected_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, marketplace)
);

-- Enable RLS on marketplace_connections
ALTER TABLE public.marketplace_connections ENABLE ROW LEVEL SECURITY;

-- RLS policies for marketplace_connections
CREATE POLICY "Users can view their own marketplace connections"
ON public.marketplace_connections
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own marketplace connections"
ON public.marketplace_connections
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own marketplace connections"
ON public.marketplace_connections
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own marketplace connections"
ON public.marketplace_connections
FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at on marketplace_connections
CREATE TRIGGER update_marketplace_connections_updated_at
BEFORE UPDATE ON public.marketplace_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();