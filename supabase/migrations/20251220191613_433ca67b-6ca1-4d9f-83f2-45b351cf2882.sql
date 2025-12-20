-- Create QC status enum
CREATE TYPE public.qc_status AS ENUM (
  'draft', 
  'generating', 
  'ready', 
  'needs_review', 
  'blocked', 
  'approved', 
  'published', 
  'failed'
);

-- Create autopilot run status enum
CREATE TYPE public.autopilot_run_status AS ENUM (
  'running',
  'awaiting_qc',
  'publishing',
  'completed',
  'failed'
);

-- Create autopilot_runs table
CREATE TABLE public.autopilot_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  status public.autopilot_run_status NOT NULL DEFAULT 'running',
  batch_size INTEGER NOT NULL DEFAULT 30,
  total_cards INTEGER NOT NULL DEFAULT 0,
  processed_cards INTEGER NOT NULL DEFAULT 0,
  current_batch INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add RLS to autopilot_runs
ALTER TABLE public.autopilot_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own autopilot runs" 
ON public.autopilot_runs 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own autopilot runs" 
ON public.autopilot_runs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own autopilot runs" 
ON public.autopilot_runs 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own autopilot runs" 
ON public.autopilot_runs 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add autopilot fields to products table
ALTER TABLE public.products
ADD COLUMN qc_status public.qc_status DEFAULT 'draft',
ADD COLUMN confidence INTEGER DEFAULT NULL CHECK (confidence >= 0 AND confidence <= 100),
ADD COLUMN flags JSONB DEFAULT '{}',
ADD COLUMN run_id UUID REFERENCES public.autopilot_runs(id) ON DELETE SET NULL,
ADD COLUMN batch_number INTEGER DEFAULT NULL,
ADD COLUMN generated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create index for efficient querying
CREATE INDEX idx_products_qc_status ON public.products(qc_status);
CREATE INDEX idx_products_run_id ON public.products(run_id);
CREATE INDEX idx_autopilot_runs_batch_id ON public.autopilot_runs(batch_id);
CREATE INDEX idx_autopilot_runs_status ON public.autopilot_runs(status);

-- Add trigger to update updated_at on autopilot_runs
CREATE TRIGGER update_autopilot_runs_updated_at
BEFORE UPDATE ON public.autopilot_runs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();