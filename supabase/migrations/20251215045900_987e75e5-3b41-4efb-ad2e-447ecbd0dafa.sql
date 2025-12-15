-- Create integration_settings table for storing non-secret integration configuration
-- Secrets (API keys, tokens) are stored as Supabase secrets, not in this table

CREATE TABLE public.integration_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_type text NOT NULL, -- 'etsy', 'ebay', etc.
  
  -- Non-secret configuration
  environment text DEFAULT 'production', -- 'production' or 'sandbox'
  rate_limit_mode text DEFAULT 'default', -- 'default', 'conservative', 'custom'
  max_requests_per_second integer DEFAULT NULL,
  max_requests_per_day integer DEFAULT NULL,
  
  -- OAuth status (tokens stored as secrets, not here)
  oauth_status text DEFAULT 'not_connected', -- 'not_connected', 'connected', 'expired'
  connected_at timestamp with time zone DEFAULT NULL,
  connected_shop_name text DEFAULT NULL,
  connected_shop_id text DEFAULT NULL,
  token_expires_at timestamp with time zone DEFAULT NULL,
  
  -- Metadata
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Ensure one config per integration per user
  UNIQUE (user_id, integration_type)
);

-- Enable Row Level Security
ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies - only the owner can access their integration settings
CREATE POLICY "Users can view their own integration settings"
ON public.integration_settings
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own integration settings"
ON public.integration_settings
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own integration settings"
ON public.integration_settings
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own integration settings"
ON public.integration_settings
FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_integration_settings_updated_at
BEFORE UPDATE ON public.integration_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();