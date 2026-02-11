import { useState, useCallback, useRef } from 'react';

export interface ExpandedImage {
  type: string;
  url: string;
}

export interface ImageExpansionResult {
  success: boolean;
  generatedImages: ExpandedImage[];
  totalImages: number;
}

export type ExpandItemStatus = 'queued' | 'processing' | 'done' | 'failed';

export interface ExpandItemState {
  productId: string;
  status: ExpandItemStatus;
  error?: string;
  generatedCount: number;
}

export interface BatchExpandState {
  running: boolean;
  items: ExpandItemState[];
  completed: number;
  total: number;
  cancelled: boolean;
}

const CONCURRENCY = 2;
const INTER_ITEM_DELAY_MS = 500;
const FETCH_TIMEOUT_MS = 120000;

export function useImageExpansion() {
  const [batchState, setBatchState] = useState<BatchExpandState>({
    running: false,
    items: [],
    completed: 0,
    total: 0,
    cancelled: false,
  });

  // Legacy compat
  const isExpanding = batchState.running;
  const progress = { current: batchState.completed, total: batchState.total };

  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  // Helper: update a single item in batchState.items by productId
  const updateItem = useCallback((productId: string, patch: Partial<ExpandItemState>) => {
    setBatchState(prev => ({
      ...prev,
      items: prev.items.map(it => it.productId === productId ? { ...it, ...patch } : it),
    }));
  }, []);

  const incrementCompleted = useCallback(() => {
    setBatchState(prev => ({ ...prev, completed: prev.completed + 1 }));
  }, []);

  // STOP: abort all in-flight, mark queued/processing as failed, reset to idle
  const cancelBatch = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    runningRef.current = false;
    setBatchState(prev => ({
      ...prev,
      running: false,
      cancelled: true,
      completed: prev.total,
      items: prev.items.map(it =>
        it.status === 'queued' || it.status === 'processing'
          ? { ...it, status: 'failed' as const, error: 'Stopped by user' }
          : it
      ),
    }));
  }, []);

  // Reset / dismiss progress panel
  const dismissBatch = useCallback(() => {
    setBatchState({ running: false, items: [], completed: 0, total: 0, cancelled: false });
  }, []);

  // Core: process a single product expansion
  const expandOneProduct = useCallback(async (
    productId: string,
    sourceImageUrl: string,
    mode: 'product_photos' | 'ai_model',
    currentImageCount: number,
    signal: AbortSignal,
  ): Promise<{ success: boolean; generatedImages: ExpandedImage[]; error?: string }> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    // Link parent signal to per-request controller
    const onParentAbort = () => controller.abort();
    signal.addEventListener('abort', onParentAbort, { once: true });

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/expand-product-photos`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            productId,
            sourceImageUrl,
            mode,
            currentImageCount,
            maxImages: 9,
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);
      signal.removeEventListener('abort', onParentAbort);

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({ error: 'Unknown error' }));
        const errMsg = response.status === 429
          ? 'Rate limit exceeded'
          : response.status === 402
            ? 'AI credits exhausted'
            : errBody.error || `HTTP ${response.status}`;
        return { success: false, generatedImages: [], error: errMsg };
      }

      const data = await response.json();
      if (data.success && data.generatedImages?.length > 0) {
        return { success: true, generatedImages: data.generatedImages };
      }
      return { success: false, generatedImages: [], error: 'No images generated' };
    } catch (err: any) {
      clearTimeout(timeoutId);
      signal.removeEventListener('abort', onParentAbort);
      if (err.name === 'AbortError') {
        return { success: false, generatedImages: [], error: 'Cancelled or timed out' };
      }
      return { success: false, generatedImages: [], error: err.message || 'Network error' };
    }
  }, []);

  // Run the queue with concurrency control
  const runQueue = useCallback(async (
    jobs: Array<{
      productId: string;
      sourceImageUrl: string;
      mode: 'product_photos' | 'ai_model';
      currentImageCount: number;
    }>,
    onItemDone: (productId: string, result: { success: boolean; generatedImages: ExpandedImage[]; error?: string }) => Promise<void>,
  ) => {
    const ac = new AbortController();
    abortRef.current = ac;
    runningRef.current = true;

    const items: ExpandItemState[] = jobs.map(j => ({
      productId: j.productId,
      status: 'queued' as ExpandItemStatus,
      generatedCount: 0,
    }));

    setBatchState({
      running: true,
      items,
      completed: 0,
      total: jobs.length,
      cancelled: false,
    });

    let nextIndex = 0;

    const processNext = async (): Promise<void> => {
      while (nextIndex < jobs.length) {
        if (ac.signal.aborted) return;
        const idx = nextIndex++;
        const job = jobs[idx];

        updateItem(job.productId, { status: 'processing' });

        const result = await expandOneProduct(
          job.productId,
          job.sourceImageUrl,
          job.mode,
          job.currentImageCount,
          ac.signal,
        );

        if (ac.signal.aborted) {
          updateItem(job.productId, { status: 'failed', error: 'Cancelled' });
          incrementCompleted();
          return;
        }

        // Auto-retry once on transient errors
        let finalResult = result;
        if (!result.success && result.error !== 'Rate limit exceeded' && result.error !== 'AI credits exhausted' && result.error !== 'Cancelled') {
          // Wait briefly then retry
          await new Promise(r => setTimeout(r, 2000));
          if (!ac.signal.aborted) {
            finalResult = await expandOneProduct(job.productId, job.sourceImageUrl, job.mode, job.currentImageCount, ac.signal);
          }
        }

        if (finalResult.success) {
          updateItem(job.productId, { status: 'done', generatedCount: finalResult.generatedImages.length });
        } else {
          updateItem(job.productId, { status: 'failed', error: finalResult.error });
        }

        // Let callback handle DB inserts etc
        await onItemDone(job.productId, finalResult);
        incrementCompleted();

        // Stop queue on critical errors
        if (finalResult.error === 'Rate limit exceeded' || finalResult.error === 'AI credits exhausted') {
          ac.abort();
          // Mark remaining as failed
          for (let r = nextIndex; r < jobs.length; r++) {
            updateItem(jobs[r].productId, { status: 'failed', error: finalResult.error });
          }
          setBatchState(prev => ({ ...prev, completed: prev.total, cancelled: true }));
          return;
        }

        // Yield to main thread between items
        await new Promise(r => setTimeout(r, INTER_ITEM_DELAY_MS));
      }
    };

    // Launch concurrent workers
    const workers = Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, () => processNext());
    await Promise.all(workers);

    runningRef.current = false;
    setBatchState(prev => ({ ...prev, running: false }));
  }, [expandOneProduct, updateItem, incrementCompleted]);

  // Legacy compat stubs
  const startBatchExpansion = useCallback((_total: number) => {}, []);
  const updateBatchProgress = useCallback((_c: number, _t: number) => {}, []);
  const endBatchExpansion = useCallback(() => {}, []);
  const expandProductImages = useCallback(async () => null, []);

  return {
    isExpanding,
    progress,
    batchState,
    expandProductImages,
    runQueue,
    cancelBatch,
    dismissBatch,
    startBatchExpansion,
    updateBatchProgress,
    endBatchExpansion,
  };
}
