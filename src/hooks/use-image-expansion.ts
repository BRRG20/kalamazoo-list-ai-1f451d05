import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ExpandedImage {
  type: string;
  url: string;
}

export interface ImageExpansionResult {
  success: boolean;
  generatedImages: ExpandedImage[];
  totalImages: number;
}

export function useImageExpansion() {
  const [isExpanding, setIsExpanding] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const expandProductImages = useCallback(async (
    productId: string,
    frontImageUrl: string,
    backImageUrl?: string,
    labelImageUrl?: string,
    detailImageUrl?: string,
    targetCount: number = 8
  ): Promise<ImageExpansionResult | null> => {
    setIsExpanding(true);
    setProgress({ current: 0, total: targetCount });

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/expand-product-images`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            productId,
            frontImageUrl,
            backImageUrl,
            labelImageUrl,
            detailImageUrl,
            targetCount,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        
        if (response.status === 429) {
          toast.error('Rate limit exceeded. Please wait and try again.');
        } else if (response.status === 402) {
          toast.error('AI credits exhausted. Please add credits.');
        } else {
          toast.error(errorData.error || 'Image expansion failed');
        }
        return null;
      }

      const data = await response.json();
      
      if (data.success) {
        setProgress({ current: data.totalImages, total: targetCount });
        return data;
      }
      
      return null;
    } catch (error) {
      console.error('Image expansion error:', error);
      toast.error('Failed to expand product images');
      return null;
    } finally {
      setIsExpanding(false);
      setProgress({ current: 0, total: 0 });
    }
  }, []);

  // Batch expand for multiple products
  const expandBatch = useCallback(async (
    products: Array<{
      productId: string;
      frontImageUrl: string;
      backImageUrl?: string;
      labelImageUrl?: string;
      detailImageUrl?: string;
    }>,
    targetCount: number = 8,
    onProgress?: (current: number, total: number) => void
  ): Promise<Map<string, ImageExpansionResult>> => {
    setIsExpanding(true);
    const results = new Map<string, ImageExpansionResult>();
    
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      onProgress?.(i + 1, products.length);
      setProgress({ current: i + 1, total: products.length });
      
      const result = await expandProductImages(
        product.productId,
        product.frontImageUrl,
        product.backImageUrl,
        product.labelImageUrl,
        product.detailImageUrl,
        targetCount
      );
      
      if (result) {
        results.set(product.productId, result);
      }
      
      // Delay between products to avoid rate limits
      if (i < products.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    
    setIsExpanding(false);
    setProgress({ current: 0, total: 0 });
    
    return results;
  }, [expandProductImages]);

  return {
    isExpanding,
    progress,
    expandProductImages,
    expandBatch,
  };
}