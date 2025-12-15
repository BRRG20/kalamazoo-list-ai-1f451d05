-- Create table to track SKU sequences per category
CREATE TABLE public.sku_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_code text NOT NULL UNIQUE,
  last_number integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sku_sequences ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read sequences (needed for SKU generation)
CREATE POLICY "Authenticated users can read sequences"
ON public.sku_sequences
FOR SELECT
TO authenticated
USING (true);

-- Only allow updates via function (service role)
-- No direct update policy for users

-- Create function to generate SKU atomically
CREATE OR REPLACE FUNCTION public.generate_sku(
  p_category_code text,
  p_era_code text,
  p_size text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_number integer;
  v_sku text;
BEGIN
  -- Validate inputs
  IF p_category_code IS NULL OR p_category_code = '' THEN
    RAISE EXCEPTION 'Category code is required for SKU generation';
  END IF;
  
  IF p_size IS NULL OR p_size = '' THEN
    RAISE EXCEPTION 'Size is required for SKU generation';
  END IF;

  -- Insert or update sequence and get next number atomically
  INSERT INTO public.sku_sequences (category_code, last_number)
  VALUES (p_category_code, 1)
  ON CONFLICT (category_code) 
  DO UPDATE SET 
    last_number = sku_sequences.last_number + 1,
    updated_at = now()
  RETURNING last_number INTO v_next_number;

  -- Build SKU
  IF p_era_code IS NOT NULL AND p_era_code != '' THEN
    v_sku := p_category_code || '-' || p_era_code || '-' || p_size || '-' || LPAD(v_next_number::text, 3, '0');
  ELSE
    v_sku := p_category_code || '-' || p_size || '-' || LPAD(v_next_number::text, 3, '0');
  END IF;

  RETURN v_sku;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.generate_sku(text, text, text) TO authenticated;