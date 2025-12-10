-- Create storage bucket for product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true);

-- Allow public read access to product images
CREATE POLICY "Public read access for product images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- Allow public insert access to product images
CREATE POLICY "Public insert access for product images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'product-images');

-- Allow public update access to product images
CREATE POLICY "Public update access for product images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'product-images');

-- Allow public delete access for product images
CREATE POLICY "Public delete access for product images"
ON storage.objects FOR DELETE
USING (bucket_id = 'product-images');