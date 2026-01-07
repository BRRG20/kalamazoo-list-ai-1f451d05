-- Create AI fashion models table
CREATE TABLE public.ai_fashion_models (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create AI model poses table
CREATE TABLE public.ai_model_poses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id UUID NOT NULL REFERENCES public.ai_fashion_models(id) ON DELETE CASCADE,
  pose_name TEXT NOT NULL,
  pose_description TEXT,
  base_image_url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_fashion_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_model_poses ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read models (they're shared assets)
CREATE POLICY "Anyone can view AI models" 
ON public.ai_fashion_models 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can view AI model poses" 
ON public.ai_model_poses 
FOR SELECT 
USING (true);

-- Insert the 4 AI fashion models
INSERT INTO public.ai_fashion_models (id, name, gender, description) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Alex', 'male', 'Professional male model, 30s, neutral styling'),
  ('22222222-2222-2222-2222-222222222222', 'Marcus', 'male', 'Stylish male model, 30s, relaxed demeanor'),
  ('33333333-3333-3333-3333-333333333333', 'Sophie', 'female', 'Elegant female model, 30s, professional'),
  ('44444444-4444-4444-4444-444444444444', 'Emma', 'female', 'Natural female model, 30s, approachable');

-- Create index for faster lookups
CREATE INDEX idx_ai_model_poses_model_id ON public.ai_model_poses(model_id);