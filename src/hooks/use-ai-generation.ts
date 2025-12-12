import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import type { Product } from '@/types';
import { useAIUndo, ProductAIState } from './use-ai-undo';

// Batch size options for bulk generation
export const BATCH_SIZE_OPTIONS = [5, 10, 20] as const;
export type BatchSizeOption = typeof BATCH_SIZE_OPTIONS[number];

const DEFAULT_BATCH_SIZE = 20;
const CONCURRENT_REQUESTS = 5; // Process 5 at a time within a batch

interface GenerationResult {
  productId: string;
  success: boolean;
  error?: string;
  noImages?: boolean;
  skipped?: boolean;
}

interface UseAIGenerationOptions {
  fetchImagesForProduct: (productId: string) => Promise<{ url: string }[]>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<boolean>;
  getMatchingTags: (params: {
    garmentType: string;
    department: string;
    title: string;
    description: string;
    notes: string;
  }) => string[];
}

export function useAIGeneration({
  fetchImagesForProduct,
  updateProduct,
  getMatchingTags,
}: UseAIGenerationOptions) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });
  const [generatingProductIds, setGeneratingProductIds] = useState<Set<string>>(new Set());
  
  // Track which products have been AI generated (ai_generated = true)
  const [aiGeneratedProducts, setAiGeneratedProducts] = useState<Set<string>>(new Set());
  
  // Configurable batch size
  const [batchSize, setBatchSize] = useState<BatchSizeOption>(DEFAULT_BATCH_SIZE);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const {
    saveProductState,
    saveBulkState,
    getProductUndoState,
    hasUndoState,
    popBulkUndoState,
    clearProductUndoState,
    hasBulkUndoState,
    lastBulkCount,
  } = useAIUndo();

  // Check if a product is currently being generated
  const isProductGenerating = useCallback((productId: string) => {
    return generatingProductIds.has(productId);
  }, [generatingProductIds]);

  // Check if a product has been AI generated
  const isProductAIGenerated = useCallback((productId: string) => {
    return aiGeneratedProducts.has(productId);
  }, [aiGeneratedProducts]);

  // Generate AI for a single product
  const generateSingleProduct = useCallback(async (
    product: Product,
    options?: { skipUndo?: boolean }
  ): Promise<GenerationResult> => {
    const productId = product.id;
    
    // Prevent duplicate requests
    if (generatingProductIds.has(productId)) {
      console.warn(`[AI] Product ${productId} is already generating, ignoring request`);
      return { productId, success: false, skipped: true, error: 'Already generating' };
    }

    console.log(`[AI] Starting generation for product: ${productId} (${product.sku})`);
    
    // Mark as generating
    setGeneratingProductIds(prev => new Set([...prev, productId]));
    
    // Save state for undo (unless skipped)
    if (!options?.skipUndo) {
      saveProductState(product);
    }
    
    try {
      // Get product images for AI context
      const images = await fetchImagesForProduct(productId);
      
      if (images.length === 0) {
        console.warn(`[AI] Product ${productId} has no images, skipping`);
        return { productId, success: false, noImages: true };
      }
      
      const imageUrls = images.slice(0, 2).map(img => img.url);
      
      console.log(`[AI] Calling generate-listing for ${productId} with ${imageUrls.length} images`);
      
      // Call the edge function
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-listing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          product: {
            id: product.id,
            sku: product.sku,
            title: product.title,
            description: product.description,
            garment_type: product.garment_type,
            department: product.department,
            brand: product.brand,
            colour_main: product.colour_main,
            colour_secondary: product.colour_secondary,
            pattern: product.pattern,
            size_label: product.size_label,
            size_recommended: product.size_recommended,
            fit: product.fit,
            material: product.material,
            condition: product.condition,
            flaws: product.flaws,
            made_in: product.made_in,
            era: product.era,
            notes: product.notes,
            price: product.price,
            currency: product.currency,
          },
          imageUrls,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error(`[AI] Error for ${productId}:`, errorData);
        await updateProduct(productId, { status: 'error' });
        return { productId, success: false, error: errorData.error || 'Generation failed' };
      }
      
      const data = await response.json();
      const generated = data.generated;
      
      console.log(`[AI] Generated content for ${productId}:`, {
        title: generated.title?.substring(0, 50),
        hasDescA: !!generated.description_style_a,
        hasDescB: !!generated.description_style_b,
      });
      
      // Get default tags based on garment type, gender, and keywords
      const garmentType = product.garment_type || generated.garment_type || '';
      const department = product.department || '';
      const defaultTags = getMatchingTags({
        garmentType,
        department,
        title: generated.title || product.title || '',
        description: generated.description_style_a || '',
        notes: product.notes || ''
      });
      
      // Merge default tags with AI-generated tags
      let finalShopifyTags = generated.shopify_tags || product.shopify_tags || '';
      if (defaultTags.length > 0) {
        const existingTags = finalShopifyTags.split(',').map((t: string) => t.trim()).filter(Boolean);
        const allTags = [...new Set([...existingTags, ...defaultTags])];
        finalShopifyTags = allTags.join(', ');
      }
      
      // Update product with generated content
      await updateProduct(productId, {
        status: 'generated',
        title: generated.title || product.title,
        description_style_a: generated.description_style_a,
        description_style_b: generated.description_style_b,
        shopify_tags: finalShopifyTags,
        etsy_tags: generated.etsy_tags || product.etsy_tags,
        collections_tags: generated.collections_tags || product.collections_tags,
      });
      
      // Mark as AI generated
      setAiGeneratedProducts(prev => new Set([...prev, productId]));
      
      console.log(`[AI] Successfully generated for ${productId}`);
      return { productId, success: true };
      
    } catch (error) {
      console.error(`[AI] Exception for ${productId}:`, error);
      await updateProduct(productId, { status: 'error' });
      return { 
        productId, 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    } finally {
      // Remove from generating set
      setGeneratingProductIds(prev => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  }, [generatingProductIds, saveProductState, fetchImagesForProduct, updateProduct, getMatchingTags]);

  // Generate AI for up to N products at a time (bulk generation with configurable batch size)
  const generateBulk = useCallback(async (
    allProducts: Product[],
    selectedProductIds?: Set<string>,
    customBatchSize?: BatchSizeOption
  ): Promise<{ successCount: number; errorCount: number; processedIds: string[] }> => {
    if (isGenerating) {
      toast.warning('AI generation already in progress');
      return { successCount: 0, errorCount: 0, processedIds: [] };
    }

    const effectiveBatchSize = customBatchSize ?? batchSize;
    
    console.log('[AI] Starting bulk generation with batch size:', effectiveBatchSize);
    console.log('[AI] Total products:', allProducts.length);
    console.log('[AI] Selected IDs:', selectedProductIds ? Array.from(selectedProductIds) : 'none');

    // Determine which products to process
    let productsToProcess: Product[];
    
    if (selectedProductIds && selectedProductIds.size > 0) {
      // User explicitly selected products - process those regardless of ai_generated status
      productsToProcess = allProducts.filter(p => selectedProductIds.has(p.id));
      console.log('[AI] Processing selected products:', productsToProcess.length);
    } else {
      // No selection - find products that haven't been AI generated yet
      productsToProcess = allProducts.filter(p => 
        !aiGeneratedProducts.has(p.id) && 
        p.status === 'new' &&
        !generatingProductIds.has(p.id)
      );
      console.log('[AI] Processing ungenerated products:', productsToProcess.length);
    }

    // Limit to configured batch size
    const batch = productsToProcess.slice(0, effectiveBatchSize);
    
    if (batch.length === 0) {
      const alreadyGenerated = allProducts.filter(p => aiGeneratedProducts.has(p.id) || p.status !== 'new').length;
      if (alreadyGenerated > 0) {
        toast.info(`All ${alreadyGenerated} products already generated. Select specific products to re-generate.`);
      } else {
        toast.error('No valid products to generate.');
      }
      return { successCount: 0, errorCount: 0, processedIds: [] };
    }

    const remainingCount = productsToProcess.length - batch.length;
    
    console.log(`[AI] Processing batch of ${batch.length} products${remainingCount > 0 ? ` (${remainingCount} remaining after this batch)` : ''}`);
    
    // Save bulk state for undo
    saveBulkState(batch);
    
    setIsGenerating(true);
    setGenerationProgress({ current: 0, total: batch.length });
    
    let successCount = 0;
    let errorCount = 0;
    const processedIds: string[] = [];
    const failedProducts: { sku: string; error: string }[] = [];

    // Process in chunks of CONCURRENT_REQUESTS
    for (let i = 0; i < batch.length; i += CONCURRENT_REQUESTS) {
      const chunk = batch.slice(i, i + CONCURRENT_REQUESTS);
      
      const results = await Promise.allSettled(
        chunk.map(product => generateSingleProduct(product, { skipUndo: true }))
      );
      
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const value = result.value;
          processedIds.push(value.productId);
          
          if (value.skipped) {
            continue;
          } else if (value.noImages) {
            errorCount++;
            const product = batch.find(p => p.id === value.productId);
            failedProducts.push({ sku: product?.sku || 'Unknown', error: 'No images' });
          } else if (value.success) {
            successCount++;
          } else {
            errorCount++;
            const product = batch.find(p => p.id === value.productId);
            failedProducts.push({ sku: product?.sku || 'Unknown', error: value.error || 'Unknown error' });
          }
        } else {
          errorCount++;
        }
      }
      
      // Update progress
      setGenerationProgress({ current: Math.min(i + CONCURRENT_REQUESTS, batch.length), total: batch.length });
      
      // Small delay between chunks
      if (i + CONCURRENT_REQUESTS < batch.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    setIsGenerating(false);
    setGenerationProgress({ current: 0, total: 0 });

    // Show results
    if (errorCount > 0) {
      console.log('[AI] Failed products:', failedProducts);
      toast.warning(
        `Generated ${successCount} product(s). ${errorCount} failed.`,
        { duration: 5000 }
      );
    } else {
      toast.success(`AI generated details for ${successCount} product(s)`);
    }

    if (remainingCount > 0) {
      toast.info(`${remainingCount} more products remaining. Click "Generate AI" again to continue.`, { duration: 5000 });
    }

    return { successCount, errorCount, processedIds };
  }, [isGenerating, batchSize, aiGeneratedProducts, generatingProductIds, saveBulkState, generateSingleProduct]);

  // Undo AI generation for a single product
  const undoSingleProduct = useCallback(async (productId: string): Promise<boolean> => {
    const savedState = getProductUndoState(productId);
    
    if (!savedState) {
      toast.error('No previous version to restore.');
      return false;
    }

    console.log(`[AI] Undoing AI for product ${productId}`);
    
    try {
      await updateProduct(productId, {
        title: savedState.title,
        description: savedState.description,
        description_style_a: savedState.description_style_a,
        description_style_b: savedState.description_style_b,
        shopify_tags: savedState.shopify_tags,
        etsy_tags: savedState.etsy_tags,
        collections_tags: savedState.collections_tags,
        status: savedState.status as any,
      });
      
      // Remove from AI generated set
      setAiGeneratedProducts(prev => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
      
      clearProductUndoState(productId);
      toast.success('Restored previous version');
      return true;
    } catch (error) {
      console.error('[AI] Undo error:', error);
      toast.error('Failed to restore previous version');
      return false;
    }
  }, [getProductUndoState, updateProduct, clearProductUndoState]);

  // Undo last bulk AI generation
  const undoBulkGeneration = useCallback(async (): Promise<boolean> => {
    const bulkState = popBulkUndoState();
    
    if (!bulkState) {
      toast.error('No bulk operation to undo.');
      return false;
    }

    console.log(`[AI] Undoing bulk AI for ${bulkState.products.length} products`);
    
    let restored = 0;
    let failed = 0;
    
    for (const savedState of bulkState.products) {
      try {
        await updateProduct(savedState.productId, {
          title: savedState.title,
          description: savedState.description,
          description_style_a: savedState.description_style_a,
          description_style_b: savedState.description_style_b,
          shopify_tags: savedState.shopify_tags,
          etsy_tags: savedState.etsy_tags,
          collections_tags: savedState.collections_tags,
          status: savedState.status as any,
        });
        
        // Remove from AI generated set
        setAiGeneratedProducts(prev => {
          const next = new Set(prev);
          next.delete(savedState.productId);
          return next;
        });
        
        restored++;
      } catch (error) {
        console.error(`[AI] Failed to undo for ${savedState.productId}:`, error);
        failed++;
      }
    }
    
    if (failed > 0) {
      toast.warning(`Restored ${restored} products, ${failed} failed.`);
    } else {
      toast.success(`Restored ${restored} products to pre-AI state`);
    }
    
    return true;
  }, [popBulkUndoState, updateProduct]);

  // Get count of products that can be generated (not yet AI generated)
  const getUnprocessedCount = useCallback((products: Product[]): number => {
    return products.filter(p => 
      !aiGeneratedProducts.has(p.id) && 
      p.status === 'new' &&
      !generatingProductIds.has(p.id)
    ).length;
  }, [aiGeneratedProducts, generatingProductIds]);

  // Initialize AI generated status from products
  const initializeAIGeneratedStatus = useCallback((products: Product[]) => {
    const generated = new Set<string>();
    products.forEach(p => {
      if (p.status === 'generated' || p.status === 'ready_for_shopify' || p.status === 'created_in_shopify') {
        generated.add(p.id);
      }
    });
    setAiGeneratedProducts(generated);
  }, []);

  return {
    // State
    isGenerating,
    generationProgress,
    isProductGenerating,
    isProductAIGenerated,
    hasBulkUndoState,
    lastBulkCount,
    batchSize,
    
    // Actions
    generateSingleProduct,
    generateBulk,
    undoSingleProduct,
    undoBulkGeneration,
    getUnprocessedCount,
    initializeAIGeneratedStatus,
    hasUndoState,
    setBatchSize,
  };
}
