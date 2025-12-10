-- Create default_tags table for storing user-defined tags with garment type assignments
CREATE TABLE public.default_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tag_name TEXT NOT NULL,
  assigned_garment_types TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.default_tags ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own default tags" 
ON public.default_tags 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own default tags" 
ON public.default_tags 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own default tags" 
ON public.default_tags 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own default tags" 
ON public.default_tags 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_default_tags_updated_at
BEFORE UPDATE ON public.default_tags
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();