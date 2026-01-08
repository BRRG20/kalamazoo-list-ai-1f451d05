import { useState, useCallback, useRef } from 'react';
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
  
  // Track if we're in a batch operation to prevent premature state reset
  const batchOperationRef = useRef(false);

  const expandProductImages = useCallback(async (
    productId: string,
    frontImageUrl: string,
    backImageUrl?: string,
    labelImageUrl?: string,
    detailImageUrl?: string,
    targetCount: number = 8
  ): Promise<ImageExpansionResult | null> => {
    // Only set expanding if not already in a batch operation
    if (!batchOperationRef.current) {
      setIsExpanding(true);
      setProgress({ current: 0, total: targetCount });
    }

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
        return data;
      }
      
      return null;
    } catch (error) {
      console.error('Image expansion error:', error);
      toast.error('Failed to expand product images');
      return null;
    } finally {
      // Only reset if not in a batch operation
      if (!batchOperationRef.current) {
        setIsExpanding(false);
        setProgress({ current: 0, total: 0 });
      }
    }
  }, []);

  // Start a batch operation - prevents individual calls from resetting state
  const startBatchExpansion = useCallback((totalProducts: number) => {
    batchOperationRef.current = true;
    setIsExpanding(true);
    setProgress({ current: 0, total: totalProducts });
  }, []);

  // Update progress during batch
  const updateBatchProgress = useCallback((current: number, total: number) => {
    setProgress({ current, total });
  }, []);

  // End batch operation and reset state
  const endBatchExpansion = useCallback(() => {
    batchOperationRef.current = false;
    setIsExpanding(false);
    setProgress({ current: 0, total: 0 });
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
    startBatchExpansion(products.length);
    const results = new Map<string, ImageExpansionResult>();
    
    try {
      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        onProgress?.(i + 1, products.length);
        updateBatchProgress(i + 1, products.length);
        
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
    } finally {
      endBatchExpansion();
    }
    
    return results;
  }, [expandProductImages, startBatchExpansion, updateBatchProgress, endBatchExpansion]);

  return {
    isExpanding,
    progress,
    expandProductImages,
    expandBatch,
    startBatchExpansion,
    updateBatchProgress,
    endBatchExpansion,
  };
}
