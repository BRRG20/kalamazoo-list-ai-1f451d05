import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Snapshot of affected image assignments before a major action
interface ImageSnapshot {
  image_id: string;
  previous_product_id: string | null;
  previous_position: number;
}

interface MajorActionUndo {
  id: string;
  action_type: 'auto_group' | 'regroup' | 'move_images' | 'bulk_create' | 'confirm_grouping';
  label: string;
  batch_id: string;
  snapshots: ImageSnapshot[];
  created_at: number;
}

const UNDO_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export function useMajorActionUndo(batchId: string | null) {
  const [lastAction, setLastAction] = useState<MajorActionUndo | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const expiryTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Clear expired undo on mount and when batch changes
  useEffect(() => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
    
    // Clear undo when batch changes
    setLastAction(null);
  }, [batchId]);

  // Check if undo is available and not expired
  const hasUndoAvailable = useCallback(() => {
    if (!lastAction) return false;
    const elapsed = Date.now() - lastAction.created_at;
    return elapsed < UNDO_EXPIRY_MS;
  }, [lastAction]);

  // Get remaining time for undo in seconds
  const getUndoRemainingSeconds = useCallback(() => {
    if (!lastAction) return 0;
    const elapsed = Date.now() - lastAction.created_at;
    const remaining = Math.max(0, UNDO_EXPIRY_MS - elapsed);
    return Math.ceil(remaining / 1000);
  }, [lastAction]);

  // Capture snapshot of images before a major action
  const captureSnapshot = useCallback(async (
    imageIds: string[],
    actionType: MajorActionUndo['action_type'],
    label: string
  ): Promise<string | null> => {
    if (!batchId || imageIds.length === 0) return null;

    try {
      // Fetch current state of all affected images
      const { data: images, error } = await supabase
        .from('images')
        .select('id, product_id, position')
        .in('id', imageIds);

      if (error) {
        console.error('Failed to capture undo snapshot:', error);
        return null;
      }

      const snapshots: ImageSnapshot[] = (images || []).map(img => ({
        image_id: img.id,
        previous_product_id: img.product_id,
        previous_position: img.position,
      }));

      const actionId = `undo-${Date.now()}`;
      const action: MajorActionUndo = {
        id: actionId,
        action_type: actionType,
        label,
        batch_id: batchId,
        snapshots,
        created_at: Date.now(),
      };

      // Clear any existing expiry timer
      if (expiryTimerRef.current) {
        clearTimeout(expiryTimerRef.current);
      }

      // Set new action (replaces previous - single-level undo)
      setLastAction(action);

      // Set expiry timer
      expiryTimerRef.current = setTimeout(() => {
        setLastAction(prev => prev?.id === actionId ? null : prev);
        expiryTimerRef.current = null;
      }, UNDO_EXPIRY_MS);

      console.log(`[undo] Captured ${snapshots.length} image snapshots for "${label}"`);
      return actionId;
    } catch (err) {
      console.error('Error capturing undo snapshot:', err);
      return null;
    }
  }, [batchId]);

  // Capture snapshot for all images in a batch (for auto-group operations)
  const captureAllBatchImages = useCallback(async (
    actionType: MajorActionUndo['action_type'],
    label: string
  ): Promise<string | null> => {
    if (!batchId) return null;

    try {
      // Fetch all images in the batch
      const { data: images, error } = await supabase
        .from('images')
        .select('id, product_id, position')
        .eq('batch_id', batchId)
        .is('deleted_at', null);

      if (error) {
        console.error('Failed to capture batch snapshot:', error);
        return null;
      }

      const imageIds = (images || []).map(img => img.id);
      if (imageIds.length === 0) return null;

      return captureSnapshot(imageIds, actionType, label);
    } catch (err) {
      console.error('Error capturing batch snapshot:', err);
      return null;
    }
  }, [batchId, captureSnapshot]);

  // Execute undo - restore all images to their previous assignments
  const executeUndo = useCallback(async (): Promise<boolean> => {
    if (!lastAction || isUndoing) return false;

    const elapsed = Date.now() - lastAction.created_at;
    if (elapsed >= UNDO_EXPIRY_MS) {
      toast.error('Undo expired');
      setLastAction(null);
      return false;
    }

    setIsUndoing(true);
    const actionLabel = lastAction.label;
    const snapshotCount = lastAction.snapshots.length;

    try {
      console.log(`[undo] Restoring ${snapshotCount} images from "${actionLabel}"`);

      // Restore all images in parallel (atomic-ish via Promise.all)
      const updatePromises = lastAction.snapshots.map(snapshot =>
        supabase
          .from('images')
          .update({
            product_id: snapshot.previous_product_id,
            position: snapshot.previous_position,
          })
          .eq('id', snapshot.image_id)
      );

      const results = await Promise.all(updatePromises);
      const failedCount = results.filter(r => r.error).length;

      if (failedCount > 0) {
        console.error(`[undo] ${failedCount}/${snapshotCount} images failed to restore`);
        toast.error(`Partial undo: ${failedCount} images failed to restore`);
        return false;
      }

      // Clear the undo action
      if (expiryTimerRef.current) {
        clearTimeout(expiryTimerRef.current);
        expiryTimerRef.current = null;
      }
      setLastAction(null);

      toast.success(`Undone: ${actionLabel}`, {
        description: `Restored ${snapshotCount} image assignments`,
      });

      return true;
    } catch (err) {
      console.error('[undo] Error executing undo:', err);
      toast.error('Failed to undo action');
      return false;
    } finally {
      setIsUndoing(false);
    }
  }, [lastAction, isUndoing]);

  // Clear undo manually (when another major action occurs)
  const clearUndo = useCallback(() => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
    setLastAction(null);
  }, []);

  return {
    // State
    lastAction,
    isUndoing,
    hasUndoAvailable: hasUndoAvailable(),
    undoLabel: lastAction?.label || null,
    undoRemainingSeconds: getUndoRemainingSeconds(),
    
    // Actions
    captureSnapshot,
    captureAllBatchImages,
    executeUndo,
    clearUndo,
  };
}
