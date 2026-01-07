import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type FitStyle = 'regular' | 'oversized' | 'tucked';
export type PoseType = 'front_neutral' | 'three_quarter' | 'relaxed' | 'arms_bent' | 'close_up_detail';
export type OutfitStyle = 'stylish_casual' | 'streetwear' | 'vintage' | 'hipster' | 'cool' | 'vibrant' | 'chic' | 'eastern_fusion';

export interface AIFashionModel {
  id: string;
  name: string;
  gender: 'male' | 'female';
  description: string | null;
}

export interface ModelTryOnResult {
  originalUrl: string;
  processedUrl: string;
  imageId: string;
}

const MODELS: AIFashionModel[] = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Alex', gender: 'male', description: 'Professional male model, 30-35 years old' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Marcus', gender: 'male', description: 'Stylish male model, 30-35 years old' },
  { id: '33333333-3333-3333-3333-333333333333', name: 'Sophie', gender: 'female', description: 'Elegant female model, 30-35 years old' },
  { id: '44444444-4444-4444-4444-444444444444', name: 'Emma', gender: 'female', description: 'Natural female model, 30-35 years old' },
];

const POSES: { id: PoseType; name: string; description: string }[] = [
  { id: 'front_neutral', name: 'Front Neutral', description: 'Standing straight facing camera, full body' },
  { id: 'three_quarter', name: '3/4 Angle', description: 'Body turned slightly, elegant profile' },
  { id: 'relaxed', name: 'Relaxed', description: 'Casual relaxed stance with natural S-curve' },
  { id: 'arms_bent', name: 'Arms Bent', description: 'Hand on hip, showing waistline and fit' },
  { id: 'close_up_detail', name: 'Close-Up Detail', description: 'Waist-to-thigh crop showing fit and texture' },
];

export function useModelTryOn() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const undoDataRef = useRef<Map<string, ModelTryOnResult>>(new Map());

  const getModels = useCallback((): AIFashionModel[] => {
    return MODELS;
  }, []);

  const getPoses = useCallback(() => {
    return POSES;
  }, []);

  const processImage = useCallback(async (
    imageUrl: string,
    modelId: string,
    poseId: PoseType = 'front_neutral',
    fitStyle: FitStyle = 'regular',
    styleOutfit: boolean = false,
    outfitStyle: OutfitStyle = 'stylish_casual'
  ): Promise<string | null> => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/model-tryon`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            garmentImageUrl: imageUrl,
            modelId,
            poseId,
            fitStyle,
            styleOutfit,
            outfitStyle,
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
          toast.error(errorData.error || 'Model try-on failed');
        }
        return null;
      }

      const data = await response.json();
      return data.processedImageUrl || null;
    } catch (error) {
      console.error('Model try-on error:', error);
      toast.error('Failed to process model try-on');
      return null;
    }
  }, []);

  const processSingle = useCallback(async (
    imageUrl: string,
    imageId: string,
    batchId: string,
    modelId: string,
    poseId: PoseType = 'front_neutral',
    fitStyle: FitStyle = 'regular',
    styleOutfit: boolean = false,
    outfitStyle: OutfitStyle = 'stylish_casual'
  ): Promise<string | null> => {
    setIsProcessing(true);
    
    try {
      const processedUrl = await processImage(imageUrl, modelId, poseId, fitStyle, styleOutfit, outfitStyle);
      
      if (processedUrl) {
        // Store undo data
        undoDataRef.current.set(imageId, {
          originalUrl: imageUrl,
          processedUrl,
          imageId,
        });
        
        toast.success('Model try-on complete');
        return processedUrl;
      }
      
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [processImage]);

  const processBulk = useCallback(async (
    images: { id: string; url: string }[],
    batchId: string,
    modelId: string,
    poseId: PoseType = 'front_neutral',
    fitStyle: FitStyle = 'regular',
    styleOutfit: boolean = false,
    outfitStyle: OutfitStyle = 'stylish_casual',
    onImageProcessed?: (originalUrl: string, newUrl: string) => Promise<void>
  ): Promise<ModelTryOnResult[]> => {
    if (images.length === 0) return [];
    
    setIsProcessing(true);
    setProgress({ current: 0, total: images.length });
    
    const results: ModelTryOnResult[] = [];
    
    try {
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        setProgress({ current: i + 1, total: images.length });
        
        const processedUrl = await processImage(img.url, modelId, poseId, fitStyle, styleOutfit, outfitStyle);
        
        if (processedUrl) {
          const result: ModelTryOnResult = {
            originalUrl: img.url,
            processedUrl,
            imageId: img.id,
          };
          results.push(result);
          undoDataRef.current.set(img.id, result);
          
          if (onImageProcessed) {
            await onImageProcessed(img.url, processedUrl);
          }
        }
        
        // Small delay to avoid rate limits
        if (i < images.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      if (results.length > 0) {
        toast.success(`Placed ${results.length} item(s) on model`);
      }
      
      return results;
    } finally {
      setIsProcessing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [processImage]);

  const canUndo = useCallback((imageId: string): boolean => {
    return undoDataRef.current.has(imageId);
  }, []);

  const getUndoData = useCallback((imageId: string): ModelTryOnResult | undefined => {
    return undoDataRef.current.get(imageId);
  }, []);

  const clearUndoData = useCallback((imageId: string): void => {
    undoDataRef.current.delete(imageId);
  }, []);

  const getAllUndoData = useCallback((): ModelTryOnResult[] => {
    return Array.from(undoDataRef.current.values());
  }, []);

  const clearAllUndoData = useCallback((): void => {
    undoDataRef.current.clear();
  }, []);

  return {
    isProcessing,
    progress,
    getModels,
    getPoses,
    processSingle,
    processBulk,
    canUndo,
    getUndoData,
    clearUndoData,
    getAllUndoData,
    clearAllUndoData,
  };
}