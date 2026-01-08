import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type EraseMode = 'erase' | 'smooth';

interface UsePrecisionEraseReturn {
  isProcessing: boolean;
  processErase: (
    imageUrl: string,
    maskDataUrl: string,
    intensity: number,
    mode: EraseMode
  ) => Promise<string | null>;
}

export function usePrecisionErase(): UsePrecisionEraseReturn {
  const [isProcessing, setIsProcessing] = useState(false);

  const processErase = async (
    imageUrl: string,
    maskDataUrl: string,
    intensity: number,
    mode: EraseMode
  ): Promise<string | null> => {
    setIsProcessing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('precision-erase', {
        body: { imageUrl, maskDataUrl, intensity, mode }
      });

      if (error) {
        console.error('Precision erase error:', error);
        toast.error('Failed to process image');
        return null;
      }

      if (!data?.success || !data?.processedImageUrl) {
        toast.error(data?.error || 'Failed to process image');
        return null;
      }

      return data.processedImageUrl;
    } catch (err) {
      console.error('Precision erase exception:', err);
      toast.error('Failed to process image');
      return null;
    } finally {
      setIsProcessing(false);
    }
  };

  return { isProcessing, processErase };
}
