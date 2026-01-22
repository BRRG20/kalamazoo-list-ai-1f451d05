import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import type { Product } from '@/types';
import { useAIUndo, ProductAIState } from './use-ai-undo';
import { generateSKU } from '@/lib/sku-generator';

// Batch size options for bulk generation
export const BATCH_SIZE_OPTIONS = [5, 10, 20] as const;
export type BatchSizeOption = typeof BATCH_SIZE_OPTIONS[number];

const DEFAULT_BATCH_SIZE: BatchSizeOption = 20;
const CONCURRENT_REQUESTS = 3; // Reduced to prevent overwhelming the event loop

interface GenerationResult {
  productId: string;
  success: boolean;
  error?: string;
  noImages?: boolean;
  skipped?: boolean;
}

export interface FailedProduct {
  productId: string;
  sku: string;
  error: string;
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
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  
  // Use refs for generating IDs to avoid re-render storms
  const generatingProductIdsRef = useRef<Set<string>>(new Set());
  const [generatingProductIds, setGeneratingProductIds] = useState<Set<string>>(new Set());
  
  // Track which products have been AI generated (ai_generated = true)
  const aiGeneratedProductsRef = useRef<Set<string>>(new Set());
  const [aiGeneratedProducts, setAiGeneratedProducts] = useState<Set<string>>(new Set());
  
  // Configurable batch size
  const [batchSize, setBatchSize] = useState<BatchSizeOption>(DEFAULT_BATCH_SIZE);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Track failed products for retry functionality
  const [failedProductsList, setFailedProductsList] = useState<FailedProduct[]>([]);
  const failedProductsRef = useRef<Map<string, FailedProduct>>(new Map());
  
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
    return generatingProductIdsRef.current.has(productId);
  }, []);

  // Check if a product has been AI generated
  const isProductAIGenerated = useCallback((productId: string) => {
    return aiGeneratedProductsRef.current.has(productId);
  }, []);

  // Internal function to process a single product without state updates
  const processProduct = useCallback(async (
    product: Product
  ): Promise<GenerationResult> => {
    const productId = product.id;
    const sku = product.sku || 'no-sku';
    
    // Prevent duplicate requests using ref (no re-render)
    if (generatingProductIdsRef.current.has(productId)) {
      return { productId, success: false, skipped: true, error: 'Already generating' };
    }

    // Mark as generating in ref only (no state update)
    generatingProductIdsRef.current.add(productId);
    
    try {
      // Get product images for AI context
      const images = await fetchImagesForProduct(productId);
      
      if (images.length === 0) {
        return { productId, success: false, noImages: true };
      }
      
      // Only use valid HTTP/HTTPS URLs (filter out data URLs and blobs)
      // CRITICAL: Use up to 9 images for OCR (labels, pit-to-pit signs) - edge function supports single-call mode for 9
      const imageUrls = images
        .slice(0, 9)
        .map(img => img.url)
        .filter(url => url && /^https?:\/\/.+/i.test(url));
      
      if (imageUrls.length === 0) {
        console.warn(`[AI] Product ${productId} has no valid HTTP URLs, skipping`);
        return { productId, success: false, noImages: true, error: 'No valid image URLs' };
      }
      
      // Get the user's access token for authenticated edge function calls
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        console.error(`[AI] No user session for product ${productId}`);
        return { productId, success: false, error: 'Not authenticated' };
      }
      
      // Call the edge function with user's access token and apikey
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-listing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
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
        console.error(`[AI] Generation failed for ${sku}:`, errorData);
        await updateProduct(productId, { status: 'error' });
        return { productId, success: false, error: errorData.error || 'Generation failed' };
      }
      
      const data = await response.json();
      const generated = data.generated;
      
      // Check if AI returned valid data
      if (!generated) {
        console.error(`[AI] No generated data for ${sku}`);
        return { productId, success: false, error: 'AI returned no data' };
      }
      
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
      
      // Update product with generated content - include ALL inferred fields
      // CRITICAL: Regenerate mode overwrites fields with AI values (if AI provided non-null value)
      const updates: Partial<Product> = {
        status: 'generated',
        title: generated.title || product.title,
        description: generated.description_style_a || product.description,
        description_style_a: generated.description_style_a,
        description_style_b: generated.description_style_b,
        shopify_tags: finalShopifyTags,
        etsy_tags: generated.etsy_tags || product.etsy_tags,
        collections_tags: generated.collections_tags || product.collections_tags,
      };
      
      // Helper: update field if AI provided a non-null value
      // Always overwrite for regenerate (force mode) since user is explicitly re-running AI
      const updateField = <K extends keyof Product>(
        key: K, 
        aiValue: Product[K] | null | undefined,
        validator?: (val: unknown) => Product[K] | null
      ) => {
        if (aiValue !== null && aiValue !== undefined && aiValue !== '') {
          if (validator) {
            const validated = validator(aiValue);
            if (validated !== null) {
              updates[key] = validated;
            }
          } else {
            updates[key] = aiValue;
          }
        }
      };
      
      // Garment type - always update if AI provided
      if (generated.garment_type && generated.garment_type !== 'null') {
        updates.garment_type = generated.garment_type;
      }
      
      // Fit - always update if AI provided
      if (generated.fit && generated.fit !== 'null') {
        updates.fit = generated.fit;
      }
      
      // Era - validate before updating
      updateField('era', generated.era, (val) => {
        const validEras = ['80s', '90s', 'Y2K', 'Modern'];
        return validEras.includes(String(val)) ? (String(val) as any) : null;
      });
      
      // Condition - sanitize and validate
      if (generated.condition) {
        const conditionStr = String(generated.condition);
        let sanitizedCondition: string | null = null;
        let conditionDetails: string | null = null;
        
        const conditionMatch = conditionStr.match(/^(Excellent|Very good|Good|Fair)/i);
        if (conditionMatch) {
          const baseCondition = conditionMatch[1].toLowerCase();
          if (baseCondition === 'excellent') sanitizedCondition = 'Excellent';
          else if (baseCondition === 'very good') sanitizedCondition = 'Very good';
          else if (baseCondition === 'good') sanitizedCondition = 'Good';
          else if (baseCondition === 'fair') sanitizedCondition = 'Fair';
          
          const detailsMatch = conditionStr.match(/\(([^)]+)\)/);
          if (detailsMatch) {
            conditionDetails = detailsMatch[1].trim();
          }
        } else {
          const lowerCondition = conditionStr.toLowerCase();
          if (lowerCondition.includes('excellent')) sanitizedCondition = 'Excellent';
          else if (lowerCondition.includes('very good')) sanitizedCondition = 'Very good';
          else if (lowerCondition.includes('good')) sanitizedCondition = 'Good';
          else if (lowerCondition.includes('fair') || lowerCondition.includes('poor')) sanitizedCondition = 'Fair';
        }
        
        if (sanitizedCondition) {
          updates.condition = sanitizedCondition as any;
          if (conditionDetails) {
            updates.flaws = conditionDetails;
          }
        }
      }
      
      // Department - validate and normalize
      updateField('department', generated.department, (val) => {
        const validDepartments = ['Women', 'Men', 'Unisex', 'Kids'];
        const dept = String(val);
        const normalizedDept = dept.charAt(0).toUpperCase() + dept.slice(1).toLowerCase();
        if (validDepartments.includes(normalizedDept)) return normalizedDept as any;
        if (dept.toLowerCase().includes('men') && !dept.toLowerCase().includes('women')) return 'Men' as any;
        if (dept.toLowerCase().includes('women')) return 'Women' as any;
        if (dept.toLowerCase().includes('unisex')) return 'Unisex' as any;
        return null;
      });
      
      // Other inferred fields - always update if AI provided
      updateField('flaws', generated.flaws);
      updateField('made_in', generated.made_in);
      updateField('pattern', generated.pattern);
      updateField('style', generated.style);
      
      // OCR fields - CRITICAL: always update if AI extracted from labels/signs
      updateField('brand', generated.brand);
      updateField('material', generated.material);
      updateField('size_label', generated.size_label);
      updateField('size_recommended', generated.size_recommended);
      updateField('pit_to_pit', generated.pit_to_pit);
      updateField('colour_main', generated.colour_main);
      updateField('colour_secondary', generated.colour_secondary);
      
      // GENERATE SKU after AI categorization using the proper format
      // Format: [CATEGORY]-[STYLE]-[SIZE]-[NUMBER]
      const finalGarmentType = updates.garment_type || product.garment_type;
      const finalEra = updates.era || product.era;
      // Use AI-inferred sizes if product doesn't have them
      const finalSizeLabel = updates.size_label || product.size_label;
      const finalSizeRecommended = updates.size_recommended || product.size_recommended;
      
      if (finalGarmentType) {
        const skuResult = await generateSKU(
          finalGarmentType,
          finalSizeRecommended,
          finalEra,
          finalSizeLabel
        );
        
        if (skuResult.sku) {
          updates.sku = skuResult.sku;
          console.log(`[AI] Generated SKU: ${skuResult.sku}`);
        } else if (skuResult.error) {
          console.warn(`[AI] SKU generation failed: ${skuResult.error}`);
          // Add flag to notes for manual review
          const existingNotes = product.notes || '';
          const skuNote = `[SKU NEEDS REVIEW] ${skuResult.error}`;
          if (!existingNotes.includes('[SKU NEEDS REVIEW]')) {
            updates.notes = existingNotes ? `${existingNotes}\n${skuNote}` : skuNote;
          }
        }
      }
      
      // AUTO-SET PRICE using rule-based pricing (if not already set)
      // This uses all the AI-parsed fields to determine accurate pricing
      const existingPrice = product.price;
      if (!existingPrice || existingPrice <= 0) {
        const { getDefaultPrice } = await import('@/hooks/use-database');
        const suggestedPrice = getDefaultPrice(
          updates.garment_type || product.garment_type,
          {
            brand: updates.brand || product.brand,
            material: updates.material || product.material,
            condition: updates.condition || product.condition,
            collections_tags: updates.collections_tags || product.collections_tags,
            title: updates.title || product.title,
            style: updates.style || product.style,
          }
        );
        updates.price = suggestedPrice;
        console.log(`[AI] Auto-set price: £${suggestedPrice}`);
      }
      
      
      const saveResult = await updateProduct(productId, updates);
      
      // Mark as AI generated in ref only (no state update)
      aiGeneratedProductsRef.current.add(productId);
      
      return { productId, success: true };
      
    } catch (error) {
      console.error(`[AI] Exception processing ${sku}:`, error);
      await updateProduct(productId, { status: 'error' });
      return { 
        productId, 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    } finally {
      // Remove from generating ref (no state update)
      generatingProductIdsRef.current.delete(productId);
    }
  }, [fetchImagesForProduct, updateProduct, getMatchingTags]);

  // Generate AI for a single product (with state updates for UI)
  const generateSingleProduct = useCallback(async (
    product: Product,
    options?: { skipUndo?: boolean }
  ): Promise<GenerationResult> => {
    // Save state for undo (unless skipped)
    if (!options?.skipUndo) {
      saveProductState(product);
    }
    
    // Update UI state to show generating
    setGeneratingProductIds(prev => new Set([...prev, product.id]));
    
    try {
      const result = await processProduct(product);
      
      if (result.success) {
        // Sync ref to state for UI
        setAiGeneratedProducts(prev => new Set([...prev, product.id]));
      }
      
      return result;
    } finally {
      // Update UI state to remove generating
      setGeneratingProductIds(prev => {
        const next = new Set(prev);
        next.delete(product.id);
        return next;
      });
    }
  }, [saveProductState, processProduct]);

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
    
    // === LOG: Bulk generation start ===
    console.log('[AI-FIX] === BULK GENERATION START ===');
    console.log('[AI-FIX] Selected count:', selectedProductIds ? selectedProductIds.size : 0);
    console.log('[AI-FIX] All products count:', allProducts.length);

    // Determine which products to process
    let productsToProcess: Product[];
    
    if (selectedProductIds && selectedProductIds.size > 0) {
      // When user explicitly selects products, use those (will filter by images later)
      productsToProcess = allProducts.filter(p => selectedProductIds.has(p.id));
      console.log('[AI-FIX] Selection matched:', productsToProcess.length, 'products');
    } else {
      // Bulk mode: only process 'new' products not yet generated
      productsToProcess = allProducts.filter(p => 
        !aiGeneratedProductsRef.current.has(p.id) && 
        p.status === 'new' &&
        !generatingProductIdsRef.current.has(p.id)
      );
      console.log('[AI-FIX] Bulk mode: filtered to', productsToProcess.length, 'eligible products');
    }
    
    // Pre-filter products that have no images (before hitting the API)
    const productsWithImages = await Promise.all(
      productsToProcess.map(async (product) => {
        const images = await fetchImagesForProduct(product.id);
        return { product, hasImages: images.length > 0, imageCount: images.length };
      })
    );
    productsToProcess = productsWithImages
      .filter(({ hasImages }) => hasImages)
      .map(({ product }) => product);
    
    const skippedNoImages = productsWithImages.filter(({ hasImages }) => !hasImages).length;
    if (skippedNoImages > 0) {
      console.log('[AI-FIX] Skipped (no images):', skippedNoImages);
    }


    // Determine if we're in "selected mode" (explicit selection) or "bulk mode" (auto-filter new items)
    const isSelectedMode = selectedProductIds && selectedProductIds.size > 0;
    
    // For selected mode: process ALL selected products (loop through batches)
    // For bulk mode: use batch size limit and require another click for remaining
    const totalToProcess = productsToProcess.length;
    
    console.log('[AI-FIX] Step 4 - Processing mode:');
    console.log('  - Mode:', isSelectedMode ? 'SELECTED (will process ALL)' : 'BULK (batch limited)');
    console.log('  - Total to process:', totalToProcess);
    console.log('  - Batch size:', effectiveBatchSize);
    
    if (totalToProcess === 0) {
      const alreadyGenerated = allProducts.filter(p => aiGeneratedProductsRef.current.has(p.id) || p.status !== 'new').length;
      if (alreadyGenerated > 0) {
        toast.info(`All ${alreadyGenerated} products already generated. Select specific products to re-generate.`);
      } else {
        toast.error('No valid products to generate.');
      }
      return { successCount: 0, errorCount: 0, processedIds: [] };
    }

    // Save bulk state for undo (all products we're about to process)
    saveBulkState(productsToProcess);
    
    setIsGenerating(true);
    setGenerationProgress({ current: 0, total: totalToProcess });
    
    // Update UI to show all products as generating
    const allProcessingIds = new Set(productsToProcess.map(p => p.id));
    setGeneratingProductIds(allProcessingIds);
    
    let successCount = 0;
    let errorCount = 0;
    const processedIds: string[] = [];
    const successfulIds: string[] = [];
    const newFailedProducts: FailedProduct[] = [];

    // Clear previous failed products for this run
    failedProductsRef.current.clear();

    // Calculate number of batches needed
    const numBatches = Math.ceil(totalToProcess / effectiveBatchSize);
    console.log('[AI-FIX] Processing', totalToProcess, 'products in', numBatches, 'batches');
    
    // Process ALL products in batches (auto-loop for selected mode, or single batch for bulk mode)
    const batchesToRun = isSelectedMode ? numBatches : 1;
    
    for (let batchIndex = 0; batchIndex < batchesToRun; batchIndex++) {
      const batchStart = batchIndex * effectiveBatchSize;
      const batchEnd = Math.min(batchStart + effectiveBatchSize, totalToProcess);
      const batch = productsToProcess.slice(batchStart, batchEnd);
      
      console.log(`[AI-FIX] Processing chunk ${batchIndex + 1}/${batchesToRun}: items ${batchStart + 1}-${batchEnd}`);
      
      // Update batch progress
      setBatchProgress({ current: batchIndex + 1, total: batchesToRun });

      // Process in chunks of CONCURRENT_REQUESTS with breathing room
      for (let i = 0; i < batch.length; i += CONCURRENT_REQUESTS) {
        const chunk = batch.slice(i, i + CONCURRENT_REQUESTS);
        
        // Process chunk in parallel
        const results = await Promise.allSettled(
          chunk.map(product => processProduct(product))
        );
        
        // Collect results without triggering state updates
        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          const product = chunk[j];
          
          if (result.status === 'fulfilled') {
            const value = result.value;
            processedIds.push(value.productId);
            
            if (value.skipped) {
              continue;
            } else if (value.noImages) {
              errorCount++;
              const failed: FailedProduct = { 
                productId: value.productId, 
                sku: product?.sku || 'Unknown', 
                error: 'No images' 
              };
              newFailedProducts.push(failed);
              failedProductsRef.current.set(value.productId, failed);
            } else if (value.success) {
              successCount++;
              successfulIds.push(value.productId);
              // Remove from failed list if it was previously failed and now succeeded
              failedProductsRef.current.delete(value.productId);
            } else {
              errorCount++;
              const failed: FailedProduct = { 
                productId: value.productId, 
                sku: product?.sku || 'Unknown', 
                error: value.error || 'Unknown error' 
              };
              newFailedProducts.push(failed);
              failedProductsRef.current.set(value.productId, failed);
            }
          } else {
            errorCount++;
            const failed: FailedProduct = { 
              productId: product?.id || 'Unknown', 
              sku: product?.sku || 'Unknown', 
              error: result.reason?.message || 'Promise rejected' 
            };
            newFailedProducts.push(failed);
            if (product?.id) {
              failedProductsRef.current.set(product.id, failed);
            }
          }
        }
        
        // Update progress (single state update per chunk)
        const currentProgress = batchStart + Math.min(i + CONCURRENT_REQUESTS, batch.length);
        setGenerationProgress({ current: currentProgress, total: totalToProcess });
        
        // Allow event loop to breathe between chunks
        if (i + CONCURRENT_REQUESTS < batch.length) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      
      // Brief pause between batches to prevent overwhelming
      if (batchIndex + 1 < batchesToRun) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Batch sync refs to state (single update at end)
    setAiGeneratedProducts(new Set(aiGeneratedProductsRef.current));
    setGeneratingProductIds(new Set());
    setIsGenerating(false);
    setGenerationProgress({ current: 0, total: 0 });
    setBatchProgress({ current: 0, total: 0 });
    
    // Update failed products list for retry functionality
    setFailedProductsList(Array.from(failedProductsRef.current.values()));

    // === LOG: Final Summary ===
    console.log('[AI-FIX] === BULK GENERATION COMPLETE ===');
    console.log('[AI-FIX] Final Summary:');
    console.log('  - Success count:', successCount);
    console.log('  - Error count:', errorCount);
    console.log('  - Total attempted:', successCount + errorCount);
    console.log('  - Processed IDs:', processedIds.length);
    console.log('  - Successful IDs:', successfulIds.length);
    if (newFailedProducts.length > 0) {
      console.log('  - Failed products:', newFailedProducts.map(f => `${f.sku}: ${f.error}`));
    }
    
    // Show results with clear messaging
    const totalAttempted = successCount + errorCount;
    if (errorCount > 0) {
      console.log('[AI] Failed products:', newFailedProducts);
      toast.error(
        `Generated ${successCount}/${totalAttempted}. Missing: ${errorCount}. Use "Retry Failed" to retry.`,
        { duration: 8000 }
      );
    } else {
      toast.success(`Complete: ${successCount}/${totalAttempted} generated successfully`);
    }

    // For bulk mode, show remaining count if any
    if (!isSelectedMode) {
      const remainingCount = totalToProcess - effectiveBatchSize;
      if (remainingCount > 0) {
        toast.info(`Processing first ${effectiveBatchSize} items. Remaining ${remainingCount} will need another run.`, { duration: 5000 });
      }
    }

    return { successCount, errorCount, processedIds };
  }, [isGenerating, batchSize, saveBulkState, processProduct]);

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
      
      // Remove from AI generated set and ref
      aiGeneratedProductsRef.current.delete(productId);
      setAiGeneratedProducts(new Set(aiGeneratedProductsRef.current));
      
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
        
        // Remove from AI generated set and ref
        aiGeneratedProductsRef.current.delete(savedState.productId);
        
        restored++;
      } catch (error) {
        console.error(`[AI] Failed to undo for ${savedState.productId}:`, error);
        failed++;
      }
    }
    
    // Sync ref to state once at end
    setAiGeneratedProducts(new Set(aiGeneratedProductsRef.current));
    
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
      !aiGeneratedProductsRef.current.has(p.id) && 
      p.status === 'new' &&
      !generatingProductIdsRef.current.has(p.id)
    ).length;
  }, []);

  // Initialize AI generated status from products
  // CRITICAL: Clear all old data first to avoid stale IDs from previous batches
  const initializeAIGeneratedStatus = useCallback((products: Product[]) => {
    // Clear generating refs to prevent stale locks from previous batch
    generatingProductIdsRef.current.clear();
    setGeneratingProductIds(new Set());
    
    // Clear failed products from previous batch
    failedProductsRef.current.clear();
    setFailedProductsList([]);
    
    // Build fresh set from current batch's products only
    const generated = new Set<string>();
    products.forEach(p => {
      if (p.status === 'generated' || p.status === 'ready_for_shopify' || p.status === 'created_in_shopify') {
        generated.add(p.id);
      }
    });
    // Update both ref and state with fresh data
    aiGeneratedProductsRef.current = generated;
    setAiGeneratedProducts(generated);
  }, []);

  // Retry only failed products
  const retryFailed = useCallback(async (
    allProducts: Product[]
  ): Promise<{ successCount: number; errorCount: number; processedIds: string[] }> => {
    if (isGenerating) {
      toast.warning('AI generation already in progress');
      return { successCount: 0, errorCount: 0, processedIds: [] };
    }

    const failedIds = Array.from(failedProductsRef.current.keys());
    
    if (failedIds.length === 0) {
      toast.info('No failed products to retry');
      return { successCount: 0, errorCount: 0, processedIds: [] };
    }

    console.log(`[AI] Retrying ${failedIds.length} failed products`);
    
    // Filter to get the actual product objects
    const productsToRetry = allProducts.filter(p => failedIds.includes(p.id));
    
    if (productsToRetry.length === 0) {
      toast.error('Could not find failed products in current batch');
      return { successCount: 0, errorCount: 0, processedIds: [] };
    }

    setIsGenerating(true);
    setGenerationProgress({ current: 0, total: productsToRetry.length });
    
    const batchIds = new Set(productsToRetry.map(p => p.id));
    setGeneratingProductIds(batchIds);
    
    let successCount = 0;
    let errorCount = 0;
    const processedIds: string[] = [];
    const newFailedProducts: FailedProduct[] = [];

    // Process in chunks
    for (let i = 0; i < productsToRetry.length; i += CONCURRENT_REQUESTS) {
      const chunk = productsToRetry.slice(i, i + CONCURRENT_REQUESTS);
      
      const results = await Promise.allSettled(
        chunk.map(product => processProduct(product))
      );
      
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const product = chunk[j];
        
        if (result.status === 'fulfilled') {
          const value = result.value;
          processedIds.push(value.productId);
          
          if (value.success) {
            successCount++;
            // Remove from failed list on success
            failedProductsRef.current.delete(value.productId);
          } else if (!value.skipped) {
            errorCount++;
            const failed: FailedProduct = { 
              productId: value.productId, 
              sku: product?.sku || 'Unknown', 
              error: value.error || value.noImages ? 'No images' : 'Unknown error' 
            };
            newFailedProducts.push(failed);
            failedProductsRef.current.set(value.productId, failed);
          }
        } else {
          errorCount++;
          const failed: FailedProduct = { 
            productId: product?.id || 'Unknown', 
            sku: product?.sku || 'Unknown', 
            error: result.reason?.message || 'Promise rejected' 
          };
          newFailedProducts.push(failed);
          if (product?.id) {
            failedProductsRef.current.set(product.id, failed);
          }
        }
      }
      
      const currentProgress = Math.min(i + CONCURRENT_REQUESTS, productsToRetry.length);
      setGenerationProgress({ current: currentProgress, total: productsToRetry.length });
      
      if (i + CONCURRENT_REQUESTS < productsToRetry.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    setAiGeneratedProducts(new Set(aiGeneratedProductsRef.current));
    setGeneratingProductIds(new Set());
    setIsGenerating(false);
    setGenerationProgress({ current: 0, total: 0 });
    setFailedProductsList(Array.from(failedProductsRef.current.values()));

    const totalAttempted = successCount + errorCount;
    if (errorCount > 0) {
      toast.error(
        `Retry: ${successCount}/${totalAttempted} succeeded. Still failing: ${errorCount}.`,
        { duration: 8000 }
      );
    } else {
      toast.success(`Retry complete: All ${successCount} products generated successfully`);
    }

    return { successCount, errorCount, processedIds };
  }, [isGenerating, processProduct]);

  // Clear failed products list
  const clearFailedProducts = useCallback(() => {
    failedProductsRef.current.clear();
    setFailedProductsList([]);
  }, []);

  return {
    // State
    isGenerating,
    generationProgress,
    batchProgress,
    isProductGenerating,
    isProductAIGenerated,
    hasBulkUndoState,
    lastBulkCount,
    batchSize,
    failedProducts: failedProductsList,
    hasFailedProducts: failedProductsList.length > 0,
    
    // Actions
    generateSingleProduct,
    generateBulk,
    undoSingleProduct,
    undoBulkGeneration,
    getUnprocessedCount,
    initializeAIGeneratedStatus,
    hasUndoState,
    setBatchSize,
    retryFailed,
    clearFailedProducts,
  };
}
