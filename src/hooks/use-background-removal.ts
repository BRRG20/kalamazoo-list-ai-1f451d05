import { useState, useCallback } from 'react';
import { pipeline, env } from '@huggingface/transformers';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

// Configure transformers.js to always download models
env.allowLocalModels = false;
env.useBrowserCache = true;

const MAX_IMAGE_DIMENSION = 1024;

let segmenterInstance: any = null;
let loadingPromise: Promise<any> | null = null;

async function getSegmenter() {
  if (segmenterInstance) return segmenterInstance;
  
  if (loadingPromise) return loadingPromise;
  
  loadingPromise = (async () => {
    console.log('Loading segmentation model...');
    const segmenter = await pipeline(
      'image-segmentation',
      'Xenova/segformer-b0-finetuned-ade-512-512',
      { device: 'webgpu' }
    );
    segmenterInstance = segmenter;
    console.log('Model loaded successfully');
    return segmenter;
  })();
  
  return loadingPromise;
}

function resizeImageIfNeeded(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement
): boolean {
  let width = image.naturalWidth;
  let height = image.naturalHeight;

  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    if (width > height) {
      height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
      width = MAX_IMAGE_DIMENSION;
    } else {
      width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
      height = MAX_IMAGE_DIMENSION;
    }

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(image, 0, 0, width, height);
    return true;
  }

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(image, 0, 0);
  return false;
}

async function removeBackgroundFromImage(imageElement: HTMLImageElement): Promise<Blob> {
  console.log('Starting background removal process...');
  const segmenter = await getSegmenter();

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error('Could not get canvas context');

  const wasResized = resizeImageIfNeeded(canvas, ctx, imageElement);
  console.log(
    `Image ${wasResized ? 'was' : 'was not'} resized. Final dimensions: ${canvas.width}x${canvas.height}`
  );

  const imageData = canvas.toDataURL('image/jpeg', 0.8);
  console.log('Processing with segmentation model...');

  const result = await segmenter(imageData);
  console.log('Segmentation result:', result);

  if (!result || !Array.isArray(result) || result.length === 0 || !result[0].mask) {
    throw new Error('Invalid segmentation result');
  }

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = canvas.width;
  outputCanvas.height = canvas.height;
  const outputCtx = outputCanvas.getContext('2d');

  if (!outputCtx) throw new Error('Could not get output canvas context');

  outputCtx.drawImage(canvas, 0, 0);

  const outputImageData = outputCtx.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
  const data = outputImageData.data;

  for (let i = 0; i < result[0].mask.data.length; i++) {
    const alpha = Math.round((1 - result[0].mask.data[i]) * 255);
    data[i * 4 + 3] = alpha;
  }

  outputCtx.putImageData(outputImageData, 0, 0);
  console.log('Mask applied successfully');

  return new Promise((resolve, reject) => {
    outputCanvas.toBlob(
      (blob) => {
        if (blob) {
          console.log('Successfully created final blob');
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob'));
        }
      },
      'image/png',
      1.0
    );
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export interface BackgroundRemovalProgress {
  current: number;
  total: number;
  status: 'idle' | 'loading-model' | 'processing' | 'uploading' | 'complete' | 'error';
}

export function useBackgroundRemoval() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<BackgroundRemovalProgress>({
    current: 0,
    total: 0,
    status: 'idle',
  });

  const removeBackgroundSingle = useCallback(
    async (imageUrl: string, batchId: string): Promise<string | null> => {
      setIsProcessing(true);
      setProgress({ current: 0, total: 1, status: 'loading-model' });

      try {
        // Get current user for storage path
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('Not authenticated');
        }

        // Load the image
        const img = await loadImage(imageUrl);

        setProgress({ current: 0, total: 1, status: 'processing' });

        // Remove background
        const processedBlob = await removeBackgroundFromImage(img);

        setProgress({ current: 0, total: 1, status: 'uploading' });

        // Upload to Supabase storage with user folder for RLS compliance
        const fileName = `bg-removed-${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
        const filePath = `${user.id}/${batchId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(filePath, processedBlob, {
            contentType: 'image/png',
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('product-images')
          .getPublicUrl(filePath);

        setProgress({ current: 1, total: 1, status: 'complete' });
        toast.success('Background removed successfully!');

        return urlData.publicUrl;
      } catch (error) {
        console.error('Background removal failed:', error);
        setProgress({ current: 0, total: 0, status: 'error' });
        toast.error(
          error instanceof Error ? error.message : 'Background removal failed'
        );
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  const removeBackgroundBulk = useCallback(
    async (
      imageUrls: string[],
      batchId: string,
      onImageProcessed?: (originalUrl: string, newUrl: string) => void
    ): Promise<Map<string, string>> => {
      if (imageUrls.length === 0) return new Map();

      setIsProcessing(true);
      setProgress({ current: 0, total: imageUrls.length, status: 'loading-model' });

      const results = new Map<string, string>();

      try {
        // Get current user for storage path
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('Not authenticated');
        }

        // Pre-load the model
        await getSegmenter();

        for (let i = 0; i < imageUrls.length; i++) {
          const url = imageUrls[i];
          setProgress({
            current: i,
            total: imageUrls.length,
            status: 'processing',
          });

          try {
            const img = await loadImage(url);
            const processedBlob = await removeBackgroundFromImage(img);

            setProgress({
              current: i,
              total: imageUrls.length,
              status: 'uploading',
            });

            // Use user folder for RLS compliance
            const fileName = `bg-removed-${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
            const filePath = `${user.id}/${batchId}/${fileName}`;

            const { error: uploadError } = await supabase.storage
              .from('product-images')
              .upload(filePath, processedBlob, {
                contentType: 'image/png',
                upsert: false,
              });

            if (uploadError) {
              console.error(`Failed to upload ${url}:`, uploadError);
              continue;
            }

            const { data: urlData } = supabase.storage
              .from('product-images')
              .getPublicUrl(filePath);

            results.set(url, urlData.publicUrl);
            onImageProcessed?.(url, urlData.publicUrl);
          } catch (err) {
            console.error(`Failed to process ${url}:`, err);
          }
        }

        setProgress({
          current: imageUrls.length,
          total: imageUrls.length,
          status: 'complete',
        });

        toast.success(`Background removed from ${results.size} of ${imageUrls.length} images`);
        return results;
      } catch (error) {
        console.error('Bulk background removal failed:', error);
        setProgress({ current: 0, total: 0, status: 'error' });
        toast.error('Background removal failed');
        return results;
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  return {
    isProcessing,
    progress,
    removeBackgroundSingle,
    removeBackgroundBulk,
  };
}
