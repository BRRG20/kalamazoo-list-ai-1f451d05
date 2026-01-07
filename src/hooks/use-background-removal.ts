import { useState, useCallback, useRef } from 'react';
import { removeBackground } from '@imgly/background-removal';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export interface BackgroundRemovalProgress {
  current: number;
  total: number;
  status: 'idle' | 'loading-model' | 'processing' | 'uploading' | 'complete' | 'error';
}

// Store original URLs for undo functionality
const originalUrlsMap = new Map<string, string>();

export function useBackgroundRemoval() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<BackgroundRemovalProgress>({
    current: 0,
    total: 0,
    status: 'idle',
  });

  // Track which images have been processed for undo
  const processedImagesRef = useRef<Map<string, { originalUrl: string; newUrl: string }>>(new Map());

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

        setProgress({ current: 0, total: 1, status: 'processing' });

        // Use @imgly/background-removal for professional quality
        const processedBlob = await removeBackground(imageUrl, {
          progress: (key, current, total) => {
            console.log(`Background removal: ${key} - ${current}/${total}`);
          },
        });

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

        // Store original URL for undo
        originalUrlsMap.set(urlData.publicUrl, imageUrl);
        processedImagesRef.current.set(imageUrl, {
          originalUrl: imageUrl,
          newUrl: urlData.publicUrl,
        });

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
      // Clear previous batch tracking
      processedImagesRef.current.clear();

      try {
        // Get current user for storage path
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('Not authenticated');
        }

        for (let i = 0; i < imageUrls.length; i++) {
          const url = imageUrls[i];
          setProgress({
            current: i,
            total: imageUrls.length,
            status: 'processing',
          });

          try {
            // Use @imgly/background-removal for professional quality
            const processedBlob = await removeBackground(url, {
              progress: (key, current, total) => {
                console.log(`Image ${i + 1}: ${key} - ${current}/${total}`);
              },
            });

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

            // Store original URL for undo
            originalUrlsMap.set(urlData.publicUrl, url);
            processedImagesRef.current.set(url, {
              originalUrl: url,
              newUrl: urlData.publicUrl,
            });

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

  // Undo background removal - returns map of new URLs to original URLs
  const getUndoMap = useCallback((): Map<string, string> => {
    const undoMap = new Map<string, string>();
    processedImagesRef.current.forEach(({ originalUrl, newUrl }) => {
      undoMap.set(newUrl, originalUrl);
    });
    return undoMap;
  }, []);

  const canUndo = useCallback((): boolean => {
    return processedImagesRef.current.size > 0;
  }, []);

  const clearUndoHistory = useCallback(() => {
    processedImagesRef.current.clear();
  }, []);

  return {
    isProcessing,
    progress,
    removeBackgroundSingle,
    removeBackgroundBulk,
    getUndoMap,
    canUndo,
    clearUndoHistory,
  };
}
