import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export type ShadowType = 'none' | 'light' | 'medium' | 'harsh';

export interface BackgroundRemovalOptions {
  secondPass?: boolean;
  shadow?: ShadowType;
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

  // Track which images have been processed for undo
  const processedImagesRef = useRef<Map<string, { originalUrl: string; newUrl: string }>>(new Map());

  // Convert base64 to blob and upload to storage
  const uploadProcessedImage = async (
    base64Data: string,
    userId: string,
    batchId: string
  ): Promise<string> => {
    // Extract base64 content (remove data:image/png;base64, prefix)
    const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'image/png' });

    const fileName = `bg-removed-${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
    const filePath = `${userId}/${batchId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(filePath, blob, {
        contentType: 'image/png',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: urlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  };

  const removeBackgroundSingle = useCallback(
    async (
      imageUrl: string, 
      batchId: string,
      options: BackgroundRemovalOptions = {}
    ): Promise<string | null> => {
      setIsProcessing(true);
      setProgress({ current: 0, total: 1, status: 'processing' });

      try {
        // Get current user for storage path
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('Not authenticated');
        }

        // Get session for auth token
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          throw new Error('No active session');
        }

        // Call edge function for AI background removal
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/remove-background`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ 
              imageUrl,
              secondPass: options.secondPass ?? false,
              shadow: options.shadow ?? 'none',
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Processing failed: ${response.status}`);
        }

        const data = await response.json();
        
        if (!data.success || !data.processedImageUrl) {
          throw new Error(data.error || 'No processed image returned');
        }

        setProgress({ current: 0, total: 1, status: 'uploading' });

        // Upload the base64 image to storage
        const newUrl = await uploadProcessedImage(data.processedImageUrl, user.id, batchId);

        // Store original URL for undo
        processedImagesRef.current.set(imageUrl, {
          originalUrl: imageUrl,
          newUrl: newUrl,
        });

        setProgress({ current: 1, total: 1, status: 'complete' });
        toast.success('Background removed successfully!');

        return newUrl;
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

  const applyGhostMannequin = useCallback(
    async (
      imageUrl: string, 
      batchId: string
    ): Promise<string | null> => {
      setIsProcessing(true);
      setProgress({ current: 0, total: 1, status: 'processing' });

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('Not authenticated');
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          throw new Error('No active session');
        }

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ghost-mannequin`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ imageUrl }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Processing failed: ${response.status}`);
        }

        const data = await response.json();
        
        if (!data.success || !data.processedImageUrl) {
          throw new Error(data.error || 'No processed image returned');
        }

        setProgress({ current: 0, total: 1, status: 'uploading' });

        const newUrl = await uploadProcessedImage(data.processedImageUrl, user.id, batchId);

        processedImagesRef.current.set(imageUrl, {
          originalUrl: imageUrl,
          newUrl: newUrl,
        });

        setProgress({ current: 1, total: 1, status: 'complete' });
        toast.success('Ghost mannequin applied successfully!');

        return newUrl;
      } catch (error) {
        console.error('Ghost mannequin failed:', error);
        setProgress({ current: 0, total: 0, status: 'error' });
        toast.error(
          error instanceof Error ? error.message : 'Ghost mannequin processing failed'
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
      onImageProcessed?: (originalUrl: string, newUrl: string) => void,
      options: BackgroundRemovalOptions = {}
    ): Promise<Map<string, string>> => {
      if (imageUrls.length === 0) return new Map();

      setIsProcessing(true);
      setProgress({ current: 0, total: imageUrls.length, status: 'processing' });

      const results = new Map<string, string>();
      // Clear previous batch tracking
      processedImagesRef.current.clear();

      try {
        // Get current user for storage path
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('Not authenticated');
        }

        // Get session for auth token
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          throw new Error('No active session');
        }

        for (let i = 0; i < imageUrls.length; i++) {
          const url = imageUrls[i];
          setProgress({
            current: i,
            total: imageUrls.length,
            status: 'processing',
          });

          try {
            // Call edge function for AI background removal
            const response = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/remove-background`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ 
                  imageUrl: url,
                  secondPass: options.secondPass ?? false,
                  shadow: options.shadow ?? 'none',
                }),
              }
            );

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              console.error(`Failed to process ${url}:`, errorData.error || response.status);
              continue;
            }

            const data = await response.json();
            
            if (!data.success || !data.processedImageUrl) {
              console.error(`No processed image for ${url}`);
              continue;
            }

            setProgress({
              current: i,
              total: imageUrls.length,
              status: 'uploading',
            });

            // Upload the base64 image to storage
            const newUrl = await uploadProcessedImage(data.processedImageUrl, user.id, batchId);

            // Store original URL for undo
            processedImagesRef.current.set(url, {
              originalUrl: url,
              newUrl: newUrl,
            });

            results.set(url, newUrl);
            onImageProcessed?.(url, newUrl);
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
    applyGhostMannequin,
    getUndoMap,
    canUndo,
    clearUndoHistory,
  };
}