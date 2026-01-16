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
    
    // Prevent duplicate requests using ref (no re-render)
    if (generatingProductIdsRef.current.has(productId)) {
      console.warn(`[AI] Product ${productId} is already generating, ignoring request`);
      return { productId, success: false, skipped: true, error: 'Already generating' };
    }

    // Mark as generating in ref only (no state update)
    generatingProductIdsRef.current.add(productId);
    
    try {
      // Get product images for AI context
      const images = await fetchImagesForProduct(productId);
      
      if (images.length === 0) {
        console.warn(`[AI] Product ${productId} has no images, skipping`);
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
        console.error(`[AI] Error for ${productId}:`, errorData);
        await updateProduct(productId, { status: 'error' });
        return { productId, success: false, error: errorData.error || 'Generation failed' };
      }
      
      const data = await response.json();
      const generated = data.generated;
      
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
      
      console.log('[AI] Updates to save:', Object.keys(updates));
      
      await updateProduct(productId, updates);
      
      // Mark as AI generated in ref only (no state update)
      aiGeneratedProductsRef.current.add(productId);
      
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
    
    console.log('[AI] Starting bulk generation with batch size:', effectiveBatchSize);

    // Determine which products to process
    let productsToProcess: Product[];
    
    if (selectedProductIds && selectedProductIds.size > 0) {
      // When user explicitly selects products, use those (will filter by images later)
      productsToProcess = allProducts.filter(p => selectedProductIds.has(p.id));
    } else {
      // Bulk mode: only process 'new' products not yet generated
      productsToProcess = allProducts.filter(p => 
        !aiGeneratedProductsRef.current.has(p.id) && 
        p.status === 'new' &&
        !generatingProductIdsRef.current.has(p.id)
      );
    }
    
    // Pre-filter products that have no images (before hitting the API)
    // This prevents "No images" errors from cluttering the output
    const productsWithImages = await Promise.all(
      productsToProcess.map(async (product) => {
        const images = await fetchImagesForProduct(product.id);
        return { product, hasImages: images.length > 0 };
      })
    );
    productsToProcess = productsWithImages
      .filter(({ hasImages }) => hasImages)
      .map(({ product }) => product);
    
    const skippedCount = productsWithImages.filter(({ hasImages }) => !hasImages).length;
    if (skippedCount > 0) {
      console.log(`[AI] Skipped ${skippedCount} products with no images`);
    }

    // Limit to configured batch size
    const batch = productsToProcess.slice(0, effectiveBatchSize);
    
    if (batch.length === 0) {
      const alreadyGenerated = allProducts.filter(p => aiGeneratedProductsRef.current.has(p.id) || p.status !== 'new').length;
      if (alreadyGenerated > 0) {
        toast.info(`All ${alreadyGenerated} products already generated. Select specific products to re-generate.`);
      } else {
        toast.error('No valid products to generate.');
      }
      return { successCount: 0, errorCount: 0, processedIds: [] };
    }

    const remainingCount = productsToProcess.length - batch.length;
    
    console.log(`[AI] Processing batch of ${batch.length} products`);
    
    // Save bulk state for undo
    saveBulkState(batch);
    
    setIsGenerating(true);
    setGenerationProgress({ current: 0, total: batch.length });
    
    // Update UI to show all products as generating (single state update)
    const batchIds = new Set(batch.map(p => p.id));
    setGeneratingProductIds(batchIds);
    
    let successCount = 0;
    let errorCount = 0;
    const processedIds: string[] = [];
    const successfulIds: string[] = [];
    const failedProducts: { sku: string; error: string }[] = [];

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
        if (result.status === 'fulfilled') {
          const value = result.value;
          processedIds.push(value.productId);
          
          if (value.skipped) {
            continue;
          } else if (value.noImages) {
            errorCount++;
            failedProducts.push({ sku: chunk[j]?.sku || 'Unknown', error: 'No images' });
          } else if (value.success) {
            successCount++;
            successfulIds.push(value.productId);
          } else {
            errorCount++;
            failedProducts.push({ sku: chunk[j]?.sku || 'Unknown', error: value.error || 'Unknown error' });
          }
        } else {
          errorCount++;
        }
      }
      
      // Update progress (single state update per chunk)
      const currentProgress = Math.min(i + CONCURRENT_REQUESTS, batch.length);
      setGenerationProgress({ current: currentProgress, total: batch.length });
      
      // Allow event loop to breathe between chunks
      if (i + CONCURRENT_REQUESTS < batch.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    // Batch sync refs to state (single update at end)
    setAiGeneratedProducts(new Set(aiGeneratedProductsRef.current));
    setGeneratingProductIds(new Set());
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
  const initializeAIGeneratedStatus = useCallback((products: Product[]) => {
    const generated = new Set<string>();
    products.forEach(p => {
      if (p.status === 'generated' || p.status === 'ready_for_shopify' || p.status === 'created_in_shopify') {
        generated.add(p.id);
      }
    });
    // Update both ref and state
    aiGeneratedProductsRef.current = generated;
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
