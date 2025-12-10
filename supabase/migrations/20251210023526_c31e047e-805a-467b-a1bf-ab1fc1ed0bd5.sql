-- Create enum types for product fields
CREATE TYPE public.product_status AS ENUM ('new', 'generated', 'ready_for_shopify', 'created_in_shopify', 'error');
CREATE TYPE public.department AS ENUM ('Women', 'Men', 'Unisex', 'Kids');
CREATE TYPE public.era AS ENUM ('80s', '90s', 'Y2K', 'Modern');
CREATE TYPE public.condition_type AS ENUM ('Excellent', 'Very good', 'Good', 'Fair');

-- Create batches table
CREATE TABLE public.batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create products table
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  sku TEXT,
  status product_status NOT NULL DEFAULT 'new',
  raw_input_text TEXT,
  title TEXT,
  description TEXT,
  price NUMERIC(10,2),
  currency TEXT NOT NULL DEFAULT 'GBP',
  era era,
  garment_type TEXT,
  department department,
  brand TEXT,
  colour_main TEXT,
  colour_secondary TEXT,
  pattern TEXT,
  size_label TEXT,
  size_recommended TEXT,
  fit TEXT,
  material TEXT,
  condition condition_type,
  flaws TEXT,
  made_in TEXT,
  notes TEXT,
  shopify_tags TEXT,
  etsy_tags TEXT,
  collections_tags TEXT,
  shopify_product_id TEXT,
  shopify_handle TEXT,
  listing_block TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create images table
CREATE TABLE public.images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.batches(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  include_in_shopify BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create settings table (single row)
CREATE TABLE public.settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shopify_store_url TEXT,
  shopify_access_token TEXT,
  default_images_per_product INTEGER NOT NULL DEFAULT 9,
  default_currency TEXT NOT NULL DEFAULT 'GBP',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security on all tables
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (single-user app, no auth required for MVP)
-- Batches policies
CREATE POLICY "Allow all access to batches" ON public.batches FOR ALL USING (true) WITH CHECK (true);

-- Products policies
CREATE POLICY "Allow all access to products" ON public.products FOR ALL USING (true) WITH CHECK (true);

-- Images policies
CREATE POLICY "Allow all access to images" ON public.images FOR ALL USING (true) WITH CHECK (true);

-- Settings policies
CREATE POLICY "Allow all access to settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_products_batch_id ON public.products(batch_id);
CREATE INDEX idx_products_status ON public.products(status);
CREATE INDEX idx_images_product_id ON public.images(product_id);
CREATE INDEX idx_images_batch_id ON public.images(batch_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_batches_updated_at
  BEFORE UPDATE ON public.batches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings row
INSERT INTO public.settings (default_images_per_product, default_currency) 
VALUES (9, 'GBP');