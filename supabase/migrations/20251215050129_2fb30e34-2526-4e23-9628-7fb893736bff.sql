-- Create secure table for storing encrypted Etsy API credentials
-- Only accessible via edge functions with service role (not client)

CREATE TABLE public.etsy_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  
  -- Encrypted credentials (base64 encoded with user_id salt)
  app_key_encrypted text NOT NULL,
  shared_secret_encrypted text NOT NULL,
  
  -- OAuth tokens (also encrypted)
  access_token_encrypted text DEFAULT NULL,
  refresh_token_encrypted text DEFAULT NULL,
  
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable Row Level Security - but NO client policies
-- This table is only accessible via service role in edge functions
ALTER TABLE public.etsy_credentials ENABLE ROW LEVEL SECURITY;

-- NO RLS policies = no client access at all
-- Only edge functions with service_role can access this table

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_etsy_credentials_updated_at
BEFORE UPDATE ON public.etsy_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment to clarify security model
COMMENT ON TABLE public.etsy_credentials IS 'Stores encrypted Etsy API credentials. Only accessible via edge functions with service role. No client access.';