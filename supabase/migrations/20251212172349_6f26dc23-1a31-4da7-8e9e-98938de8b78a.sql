-- Add pit_to_pit column to products table for chest measurement
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pit_to_pit text;