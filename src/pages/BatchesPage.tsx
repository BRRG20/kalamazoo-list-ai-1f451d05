import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { BatchList } from '@/components/batches/BatchList';
import { BatchDetail } from '@/components/batches/BatchDetail';
import { EmptyState } from '@/components/batches/EmptyState';
import { ProductDetailPanel } from '@/components/products/ProductDetailPanel';
import { ShopifySuccessDialog } from '@/components/batches/ShopifySuccessDialog';
import { DeletedProductsPanel } from '@/components/batches/DeletedProductsPanel';
import { DeletedImagesPanel } from '@/components/batches/DeletedImagesPanel';
import { HiddenProductsPanel } from '@/components/batches/HiddenProductsPanel';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ImageGroup, MatchingProgress } from '@/components/batches/ImageGroupManager';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  useBatches, 
  useProducts, 
  useImages, 
  useSettings, 
  useImageUpload,
  useDeletedProducts,
  useDeletedImages,
  useHiddenProducts,
  generateListingBlock,
  validateProductForExport,
  generateAutoTitle,
  getDefaultPrice,
  UPLOAD_LIMITS,
} from '@/hooks/use-database';
import { useDefaultTags } from '@/hooks/use-default-tags';
import { useAIGeneration } from '@/hooks/use-ai-generation';
import { useImageExpansion } from '@/hooks/use-image-expansion';
import { useModelTryOn } from '@/hooks/use-model-tryon';
import { useMajorActionUndo } from '@/hooks/use-major-action-undo';
import type { Product, ProductImage } from '@/types';

// Default model IDs based on department
const DEFAULT_MALE_MODEL_ID = '33333333-3333-3333-3333-333333333333'; // James - white male
const DEFAULT_FEMALE_MODEL_ID = '55555555-5555-5555-5555-555555555555'; // Sophie - white female

export default function BatchesPage() {
  const { batches, createBatch, updateBatch, deleteBatch, getProductCount } = useBatches();
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [showHiddenInline, setShowHiddenInline] = useState(false);
  const { products, createProduct, createProductWithImages, updateProduct, deleteProduct, deleteEmptyProducts, hideProduct, isMutating, acquireLock, releaseLock, refetch: refetchProducts } = useProducts(selectedBatchId, showHiddenInline);
  const { deletedProducts, recoverProduct, permanentlyDelete: permanentlyDeleteProduct, emptyTrash, refetch: refetchDeletedProducts } = useDeletedProducts(selectedBatchId);
  const { deletedImages, recoverImage, permanentlyDelete: permanentlyDeleteImage, emptyImageTrash, recoverAllImages, refetch: refetchDeletedImages } = useDeletedImages(selectedBatchId);
  const { hiddenProducts, unhideProduct, refetch: refetchHiddenProducts } = useHiddenProducts(selectedBatchId);
  const { fetchImagesForProduct, fetchImagesForBatch, addImageToBatch, updateImage, excludeLastNImages, clearCache, deleteImage, updateImageProductIdByUrl } = useImages();
  const { settings } = useSettings();
  const { uploadImages, uploading, progress, uploadStartTime, uploadTotal, uploadCompleted } = useImageUpload();
  const { getMatchingTags } = useDefaultTags();
  
  // AI Generation hook
  const aiGeneration = useAIGeneration({
    fetchImagesForProduct: async (productId: string) => {
      const images = await fetchImagesForProduct(productId);
      return images.map(img => ({ url: img.url }));
    },
    updateProduct,
    getMatchingTags,
  });
  
  // AI Image Expansion hook
  const { expandProductImages, isExpanding: isExpandingImages, progress: expansionProgress, startBatchExpansion, updateBatchProgress, endBatchExpansion } = useImageExpansion();
  
  // Model Try-On hook for generating model images before expansion
  const modelTryOn = useModelTryOn();
  
  // Major action undo hook for database-level undo
  const majorActionUndo = useMajorActionUndo(selectedBatchId);
  
  // Initialize AI generated status when products load
  useEffect(() => {
    if (products.length > 0) {
      aiGeneration.initializeAIGeneratedStatus(products);
    }
  }, [products]);
  
  // Deleted/hidden products/images panel state
  const [showDeletedProducts, setShowDeletedProducts] = useState(false);
  const [showDeletedImages, setShowDeletedImages] = useState(false);
  const [showHiddenProducts, setShowHiddenProducts] = useState(false);
  
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingProductImages, setEditingProductImages] = useState<ProductImage[]>([]);
  const [regeneratingField, setRegeneratingField] = useState<string | null>(null);
  const [isGeneratingDetailPanel, setIsGeneratingDetailPanel] = useState(false);
  const [isCreatingShopify, setIsCreatingShopify] = useState(false);
  const [pendingImageUrls, setPendingImageUrls] = useState<string[]>([]);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});
  const [shopifySuccessData, setShopifySuccessData] = useState<{ successCount: number; errorCount: number } | null>(null);
  
  // Shopify upload warning dialog state
  const [shopifyWarningData, setShopifyWarningData] = useState<{
    show: boolean;
    missingCount: number;
    totalCount: number;
    productIds: string[];
  } | null>(null);
  
  // Use AI generation state from hook
  const isGenerating = aiGeneration.isGenerating;
  const generationProgress = aiGeneration.generationProgress;

  // Image group management state
  const [imageGroups, setImageGroups] = useState<ImageGroup[]>([]);
  const [unassignedImages, setUnassignedImages] = useState<string[]>([]);
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [matchingProgress, setMatchingProgress] = useState<MatchingProgress>({ current: 0, total: 0, currentBatch: 0, totalBatches: 0 });
  const [isConfirmingGrouping, setIsConfirmingGrouping] = useState(false);
  
  // Track initial state for change detection in Confirm Grouping
  const [initialImageAssignments, setInitialImageAssignments] = useState<Map<string, string | null>>(new Map());
  
  // Force refresh key for images - increment to force BatchDetail to re-fetch
  const [imageRefreshKey, setImageRefreshKey] = useState(0);
  const forceRefreshImages = useCallback(() => {
    setImageRefreshKey(prev => prev + 1);
  }, []);
  
  // Global undo state for all actions
  interface UndoState {
    type: 'delete_products' | 'group_change';
    label: string;
    imageGroups?: ImageGroup[];
    unassignedImages?: string[];
    deletedProductIds?: string[];
  }
  const [undoStack, setUndoStack] = useState<UndoState[]>([]);
  
  const saveUndoState = (state: UndoState) => {
    setUndoStack(prev => [...prev.slice(-9), state]);
  };
  
  const handleGlobalUndo = async () => {
    if (undoStack.length === 0) return;
    
    const lastAction = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    
    if (lastAction.type === 'group_change') {
      if (lastAction.imageGroups) setImageGroups(lastAction.imageGroups);
      if (lastAction.unassignedImages) setUnassignedImages(lastAction.unassignedImages);
      toast.success(`Undone: ${lastAction.label}`);
    } else if (lastAction.type === 'delete_products') {
      // Deleted products can now be recovered from the trash
      toast.info('Deleted products can be recovered from the trash bin');
      setShowDeletedProducts(true);
    }
  };

  // Fetch product counts for batches - only when batches change
  useEffect(() => {
    const fetchCounts = async () => {
      const counts: Record<string, number> = {};
      for (const batch of batches) {
        counts[batch.id] = await getProductCount(batch.id);
      }
      setProductCounts(counts);
    };
    if (batches.length > 0) {
      fetchCounts();
    }
  }, [batches]);

  // Load images when editing a product
  useEffect(() => {
    const loadImages = async () => {
      if (editingProductId) {
        const images = await fetchImagesForProduct(editingProductId);
        setEditingProductImages(images);
      }
    };
    loadImages();
  }, [editingProductId, fetchImagesForProduct]);

const handleSelectBatch = useCallback((id: string) => {
    setSelectedBatchId(id);
    setSelectedProductIds(new Set());
    setPendingImageUrls([]);
    // Reset image groups when switching batches
    setImageGroups([]);
    setUnassignedImages([]);
  }, []);

  // Load all images (both assigned and unassigned) when batch is selected
  // Use products.length as dependency to avoid infinite re-renders from array reference changes
  const productIds = products.map(p => p.id).join(',');
  
  useEffect(() => {
    const loadBatchImages = async () => {
      if (!selectedBatchId) {
        setUnassignedImages([]);
        setImageGroups([]);
        setInitialImageAssignments(new Map());
        return;
      }
      
      // Fetch all images for the batch from database
      // This is the SOURCE OF TRUTH for cross-device sync
      console.log(`[SYNC] Loading images for batch: ${selectedBatchId}`);
      const allBatchImages = await fetchImagesForBatch(selectedBatchId);
      console.log(`[SYNC] Fetched ${allBatchImages.length} total images from DB`);
      
      if (allBatchImages.length === 0) {
        console.log(`[SYNC] No images found in batch, clearing state`);
        setUnassignedImages([]);
        setImageGroups([]);
        setInitialImageAssignments(new Map());
        return;
      }
      
      // Group images by product_id and track initial assignments
      const imagesByProduct: Record<string, string[]> = {};
      const unassigned: string[] = [];
      const initialAssignments = new Map<string, string | null>();
      
      for (const img of allBatchImages) {
        // Track initial assignment: image URL -> product_id (or null if unassigned)
        initialAssignments.set(img.url, img.product_id || null);
        
        if (img.product_id && img.product_id !== '') {
          if (!imagesByProduct[img.product_id]) {
            imagesByProduct[img.product_id] = [];
          }
          imagesByProduct[img.product_id].push(img.url);
        } else {
          unassigned.push(img.url);
        }
      }
      
      // Log cross-device sync info
      console.log(`[SYNC] Unassigned images count: ${unassigned.length}`);
      console.log(`[SYNC] Assigned to products: ${Object.keys(imagesByProduct).length} products`);
      
      // Create groups from existing products that have images
      const groups: ImageGroup[] = products
        .filter(p => imagesByProduct[p.id] && imagesByProduct[p.id].length > 0)
        .map((product, index) => ({
          productId: product.id,
          productNumber: index + 1,
          images: imagesByProduct[product.id] || [],
          selectedImages: new Set<string>(),
          isGrouped: product.is_grouped || false,
        }));
      
      setImageGroups(groups);
      setUnassignedImages(unassigned);
      setInitialImageAssignments(initialAssignments);
      
      // Show group manager if there are unassigned images
      if (unassigned.length > 0) {
        setShowGroupManager(true);
      }
    };
    
    loadBatchImages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatchId, fetchImagesForBatch, productIds]);

  const handleCreateBatch = useCallback(async (name: string, notes: string) => {
    const batch = await createBatch(name, notes);
    if (batch) {
      handleSelectBatch(batch.id);
      toast.success('Batch created');
    }
  }, [createBatch, handleSelectBatch]);

  const handleUpdateBatch = useCallback(async (id: string, name: string, notes: string) => {
    const success = await updateBatch(id, { name, notes });
    if (success) {
      toast.success('Batch updated');
    }
  }, [updateBatch]);

  const handleDeleteBatch = useCallback(async (id: string) => {
    const success = await deleteBatch(id);
    if (success) {
      if (selectedBatchId === id) {
        setSelectedBatchId(null);
      }
      toast.success('Batch deleted');
    }
  }, [selectedBatchId, deleteBatch]);

  const handleUploadImages = useCallback(async (files: File[], addToUnassigned: boolean = false) => {
    if (!selectedBatchId) return;
    
    // Show warning for large batches
    if (files.length > UPLOAD_LIMITS.WARNING_THRESHOLD) {
      toast.warning(`Large batches may slow down processing. For best results, upload in batches of ${UPLOAD_LIMITS.RECOMMENDED_IMAGES_PER_BATCH} images.`);
    }
    
    toast.info(`Uploading ${files.length} image(s)...`);
    
    const urls = await uploadImages(files, selectedBatchId);
    
    if (urls.length > 0) {
      // CRITICAL: Save images to database AND verify each insert succeeds
      // Only add to local state URLs that were successfully persisted to DB
      const persistedUrls: string[] = [];
      let failedCount = 0;
      
      for (let i = 0; i < urls.length; i++) {
        const result = await addImageToBatch(selectedBatchId, urls[i], i);
        if (result) {
          persistedUrls.push(urls[i]);
          console.log(`[UPLOAD] Image persisted to DB: id=${result.id}, url=${urls[i].substring(0, 50)}...`);
        } else {
          failedCount++;
          console.error(`[UPLOAD] FAILED to persist image to DB: ${urls[i]}`);
        }
      }
      
      if (failedCount > 0) {
        toast.error(`${failedCount} image(s) failed to save to database. Please retry.`);
      }
      
      if (persistedUrls.length > 0) {
        if (addToUnassigned) {
          // Add directly to unassigned pool
          setUnassignedImages(prev => [...prev, ...persistedUrls]);
          setShowGroupManager(true);
          toast.success(`${persistedUrls.length} image(s) added to unassigned pool.`);
        } else {
          // Add to pending for auto-grouping
          setPendingImageUrls(prev => [...prev, ...persistedUrls]);
          toast.success(`${persistedUrls.length} image(s) uploaded. Click "Auto-group" to create products.`);
        }
      }
    } else {
      toast.error('Failed to upload images');
    }
  }, [selectedBatchId, uploadImages, addImageToBatch]);

  // Camera capture handler - routes camera images through the same upload pipeline
  const handleCameraCapture = useCallback(async (
    files: File[], 
    notes: Map<string, { note?: string; hasStain?: boolean; type?: string }>
  ) => {
    if (!selectedBatchId || files.length === 0) return;
    
    toast.info(`Processing ${files.length} camera image(s)...`);
    
    // Upload using same pipeline as manual uploads (preserves quality)
    const urls = await uploadImages(files, selectedBatchId);
    
    if (urls.length > 0) {
      // CRITICAL: Save images to database AND verify each insert succeeds
      const persistedUrls: string[] = [];
      let failedCount = 0;
      
      for (let i = 0; i < urls.length; i++) {
        const file = files[i];
        const noteData = notes.get(file.name);
        
        // Add image to batch - MUST succeed before adding to local state
        const result = await addImageToBatch(selectedBatchId, urls[i], i);
        
        if (result) {
          persistedUrls.push(urls[i]);
          console.log(`[CAMERA] Image persisted to DB: id=${result.id}, url=${urls[i].substring(0, 50)}...`);
          
          // If there are notes, log them (notes metadata handled separately)
          if (noteData && (noteData.note || noteData.hasStain)) {
            console.log(`[CAMERA] Image ${file.name} has note:`, noteData);
          }
        } else {
          failedCount++;
          console.error(`[CAMERA] FAILED to persist image to DB: ${urls[i]}`);
        }
      }
      
      if (failedCount > 0) {
        toast.error(`${failedCount} image(s) failed to save to database. Please retry.`);
      }
      
      if (persistedUrls.length > 0) {
        // Add only successfully persisted URLs to pending for auto-grouping
        setPendingImageUrls(prev => [...prev, ...persistedUrls]);
        toast.success(`${persistedUrls.length} camera image(s) uploaded. Click "Auto-group" to create products.`);
      }
    } else {
      toast.error('Failed to upload camera images');
    }
  }, [selectedBatchId, uploadImages, addImageToBatch]);

  // Quick Product Shots handler - for 4-shot mode with AI expansion
  const handleQuickProductCapture = useCallback(async (
    files: File[], 
    notes: Map<string, { note?: string; hasStain?: boolean; type?: string }>
  ) => {
    if (!selectedBatchId || files.length === 0) return;
    
    toast.info(`Processing ${files.length} quick product shot(s)...`);
    
    // Upload using same pipeline
    const urls = await uploadImages(files, selectedBatchId);
    
    if (urls.length > 0) {
      // CRITICAL: Save images to database AND verify each insert succeeds
      const persistedUrls: string[] = [];
      let failedCount = 0;
      
      for (let i = 0; i < urls.length; i++) {
        const result = await addImageToBatch(selectedBatchId, urls[i], i);
        if (result) {
          persistedUrls.push(urls[i]);
          console.log(`[QUICK] Image persisted to DB: id=${result.id}, url=${urls[i].substring(0, 50)}...`);
        } else {
          failedCount++;
          console.error(`[QUICK] FAILED to persist image to DB: ${urls[i]}`);
        }
      }
      
      if (failedCount > 0) {
        toast.error(`${failedCount} image(s) failed to save to database. Please retry.`);
      }
      
      if (persistedUrls.length > 0) {
        // For quick product shots, add to pending and show group manager
        setPendingImageUrls(prev => [...prev, ...persistedUrls]);
        setShowGroupManager(true);
        
        toast.success(
          `${persistedUrls.length} quick shot(s) uploaded. ` +
          `Group them and use "Expand Images" to generate additional listing photos.`
        );
      }
    } else {
      toast.error('Failed to upload quick product shots');
    }
  }, [selectedBatchId, uploadImages, addImageToBatch]);

  // AI Image Expansion handler - generates additional listing images from the AI model image
  // Uses existing model_tryon image, or generates one first if none exists
  // Accepts single productId or array of productIds for bulk expansion
  // Optional modelId parameter allows user to specify which AI model to use
  const handleExpandProductImages = useCallback(async (productIds: string | string[], mode: 'product_photos' | 'ai_model') => {
    const idsToProcess = Array.isArray(productIds) ? productIds : [productIds];
    
    if (idsToProcess.length === 0) {
      toast.error('No products selected');
      return;
    }
    
    // Get current user for RLS
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('You must be logged in');
      return;
    }
    
    const modeLabel = mode === 'product_photos' ? 'product photo' : 'AI model';
    const totalToProcess = idsToProcess.length;
    
    // Start batch operation
    startBatchExpansion(totalToProcess);
    
    // Show initial toast with progress ID for updates
    const toastId = toast.loading(`Expanding ${modeLabel} images: 0/${totalToProcess} products...`);
    
    let totalGenerated = 0;
    let processedCount = 0;
    let failedCount = 0;
    const failedProducts: string[] = [];
    let rateLimitHit = false;
    let creditsExhausted = false;
    
    console.log(`🚀 Starting BULK expand for ${totalToProcess} products in ${mode} mode`);
    
    try {
      // Process ALL products - never stop early except for rate limit/credits
      for (const productId of idsToProcess) {
        // Check if we hit rate limit or credits exhausted
        if (rateLimitHit || creditsExhausted) {
          failedProducts.push(productId);
          failedCount++;
          continue;
        }
        
        const product = products.find(p => p.id === productId);
        if (!product) {
          console.warn(`Product ${productId} not found, skipping`);
          failedProducts.push(productId);
          failedCount++;
          continue;
        }
        
        // Update progress toast
        toast.loading(`Expanding ${modeLabel} images: ${processedCount + 1}/${totalToProcess} products...`, { id: toastId });
        updateBatchProgress(processedCount + 1, totalToProcess);
        
        try {
          const images = await fetchImagesForProduct(productId);
          const currentImageCount = images.length;
          
          // Skip if product already has 9+ images
          if (currentImageCount >= 9) {
            console.log(`Product ${productId} already has ${currentImageCount} images (max 9), skipping`);
            processedCount++;
            continue;
          }
          
          if (currentImageCount === 0) {
            console.warn(`No images for product ${productId}, skipping`);
            failedProducts.push(productId);
            failedCount++;
            continue;
          }
          
          const sortedImages = [...images].sort((a, b) => a.position - b.position);
          let sourceImageUrl: string | null = null;
          
          if (mode === 'product_photos') {
            // Use original product photo (NOT model image)
            const originalImage = sortedImages.find(img => !img.source || img.source === 'upload');
            if (!originalImage) {
              console.warn(`No original product image for ${productId}, skipping`);
              failedProducts.push(productId);
              failedCount++;
              continue;
            }
            sourceImageUrl = originalImage.url;
            console.log(`[${processedCount + 1}/${totalToProcess}] Using original product photo for: ${product.title || productId}`);
          } else {
            // Use existing AI model image - NEVER generate new models
            const modelImage = sortedImages.find(img => img.source === 'model_tryon');
            if (!modelImage) {
              console.warn(`No AI model image for ${productId}, skipping - user must generate model first`);
              failedProducts.push(productId);
              failedCount++;
              continue;
            }
            sourceImageUrl = modelImage.url;
            console.log(`[${processedCount + 1}/${totalToProcess}] Using AI model image for: ${product.title || productId}`);
          }
          
          // Call the expand-product-photos edge function with mode
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
            }
          );
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error(`Expansion failed for ${productId}:`, errorData);
            
            if (response.status === 429) {
              rateLimitHit = true;
              toast.error('Rate limit exceeded. Remaining products will be skipped.');
              failedProducts.push(productId);
              failedCount++;
              continue; // Continue to mark remaining as failed
            } else if (response.status === 402) {
              creditsExhausted = true;
              toast.error('AI credits exhausted. Remaining products will be skipped.');
              failedProducts.push(productId);
              failedCount++;
              continue; // Continue to mark remaining as failed
            }
            
            // Other errors - skip this product but continue with others
            failedProducts.push(productId);
            failedCount++;
            continue;
          }
          
          const result = await response.json();
          
          if (result.success && result.generatedImages?.length > 0) {
            const currentImages = await fetchImagesForProduct(productId);
            const nextPosition = currentImages.length;
            
            // Insert all generated images for this product
            for (let i = 0; i < result.generatedImages.length; i++) {
              const genImg = result.generatedImages[i];
              const { error } = await supabase
                .from('images')
                .insert({
                  url: genImg.url,
                  product_id: productId,
                  batch_id: selectedBatchId,
                  position: nextPosition + i,
                  include_in_shopify: true,
                  user_id: user.id,
                  source: mode === 'product_photos' ? 'product_expansion' : 'model_expansion'
                });
              
              if (!error) {
                totalGenerated++;
              }
            }
            console.log(`✓ Generated ${result.generatedImages.length} images for product ${processedCount + 1}/${totalToProcess}`);
          } else {
            failedProducts.push(productId);
            failedCount++;
          }
          
        } catch (productError) {
          console.error(`Error processing product ${productId}:`, productError);
          failedProducts.push(productId);
          failedCount++;
          // Continue with next product - don't break the batch
        }
        
        processedCount++;
        
        // Add delay between products to avoid rate limits (but still process ALL)
        if (processedCount < totalToProcess) {
          await new Promise(r => setTimeout(r, 800));
        }
      }
      
      // Clear cache and refresh
      clearCache();
      await refetchProducts();
      
      // Force BatchDetail to re-fetch images immediately
      forceRefreshImages();
      
      // Dismiss loading toast
      toast.dismiss(toastId);
      
      // Show final summary
      const successCount = totalToProcess - failedCount;
      
      if (totalGenerated > 0) {
        toast.success(
          `✓ Expanded ${successCount}/${totalToProcess} products (${totalGenerated} images added)` +
          (failedCount > 0 ? ` | ${failedCount} failed` : ''),
          { duration: 5000 }
        );
      } else if (failedCount === totalToProcess) {
        toast.error(`All ${totalToProcess} products failed to expand. Check that products have the required source images.`);
      } else {
        toast.warning(`Partial success: ${successCount}/${totalToProcess} products expanded`);
      }
      
      // Log failures for debugging
      if (failedProducts.length > 0) {
        console.warn(`Failed products (${failedProducts.length}):`, failedProducts);
      }
      
      console.log(`🏁 BULK expand complete: ${successCount}/${totalToProcess} succeeded, ${totalGenerated} images generated`);
      
    } finally {
      // Always end batch operation to reset loading state
      endBatchExpansion();
    }
  }, [products, fetchImagesForProduct, selectedBatchId, clearCache, refetchProducts, startBatchExpansion, updateBatchProgress, endBatchExpansion, forceRefreshImages]);

  const handleAutoGroup = useCallback(async (imagesPerProduct: number) => {
    if (!selectedBatchId) return;
    if (pendingImageUrls.length === 0) {
      toast.error('No images to group. Upload images first.');
      return;
    }

    // Save current state for undo
    saveUndoState({
      type: 'group_change',
      label: 'Before auto-group',
      imageGroups: imageGroups.map(g => ({ ...g, selectedImages: new Set(g.selectedImages) })),
      unassignedImages: [...unassignedImages],
    });

    // Create image groups for preview/management
    const chunks: string[][] = [];
    for (let i = 0; i < pendingImageUrls.length; i += imagesPerProduct) {
      chunks.push(pendingImageUrls.slice(i, i + imagesPerProduct));
    }

    const newGroups: ImageGroup[] = chunks.map((chunk, index) => ({
      productId: `temp-${Date.now()}-${index}`,
      productNumber: products.length + index + 1,
      images: chunk,
      selectedImages: new Set<string>(),
    }));

    // For new pending images, set initial assignment to null (unassigned)
    // This ensures they'll be correctly tracked as "new" temp groups
    setInitialImageAssignments(prev => {
      const updated = new Map(prev);
      for (const url of pendingImageUrls) {
        if (!updated.has(url)) {
          updated.set(url, null); // Mark as initially unassigned
        }
      }
      return updated;
    });

    setImageGroups(newGroups);
    setUnassignedImages([]);
    setPendingImageUrls([]);
    setShowGroupManager(true);
    toast.success(`Created ${chunks.length} group(s). Review and adjust, then confirm.`);
  }, [selectedBatchId, pendingImageUrls, products.length, imageGroups, unassignedImages, saveUndoState]);

  // Re-auto-group all images (from existing groups + unassigned + pending)
  const handleReAutoGroupAll = useCallback((imagesPerProduct: number) => {
    // Separate locked (confirmed) groups from unlocked groups
    const lockedGroups = imageGroups.filter(g => g.isGrouped);
    const unlockedGroups = imageGroups.filter(g => !g.isGrouped);
    
    // Collect images only from unlocked sources
    const allImages: string[] = [
      ...unlockedGroups.flatMap(g => g.images),
      ...unassignedImages,
      ...pendingImageUrls,
    ];

    if (allImages.length === 0) {
      if (lockedGroups.length > 0) {
        toast.info(`All groups are confirmed. Unlock groups first to re-group them.`);
      } else {
        toast.error('No images to group.');
      }
      return;
    }

    // Save current state for undo
    saveUndoState({
      type: 'group_change',
      label: 'Before re-group all',
      imageGroups: imageGroups.map(g => ({ ...g, selectedImages: new Set(g.selectedImages) })),
      unassignedImages: [...unassignedImages],
    });

    // Create new groups from unlocked images only
    const chunks: string[][] = [];
    for (let i = 0; i < allImages.length; i += imagesPerProduct) {
      chunks.push(allImages.slice(i, i + imagesPerProduct));
    }

    const newGroups: ImageGroup[] = chunks.map((chunk, index) => ({
      productId: `temp-${Date.now()}-${index}`,
      productNumber: lockedGroups.length + index + 1,
      images: chunk,
      selectedImages: new Set<string>(),
    }));

    // Keep locked groups at the start, add new groups after
    const finalGroups = [
      ...lockedGroups.map((g, idx) => ({ ...g, productNumber: idx + 1 })),
      ...newGroups,
    ];

    setImageGroups(finalGroups);
    setUnassignedImages([]);
    setPendingImageUrls([]);
    setShowGroupManager(true);
    
    const lockedMsg = lockedGroups.length > 0 ? ` (${lockedGroups.length} confirmed group(s) preserved)` : '';
    toast.success(`Re-grouped into ${chunks.length} product(s)${lockedMsg}. Review and adjust, then confirm.`);
  }, [imageGroups, unassignedImages, pendingImageUrls, saveUndoState]);

  // Load all images from products into group manager view
  const handleLoadAllImagesIntoGroups = useCallback(async () => {
    if (!selectedBatchId) return;
    
    // ONE-TIME CLEANUP: Delete any ghost/empty products before loading
    // This silently cleans up products with 0 images that may have been created by bugs
    const cleanedCount = await deleteEmptyProducts();
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} empty product(s) before loading All Images view`);
    }
    
    // Fetch all images for the batch
    const allBatchImages = await fetchImagesForBatch(selectedBatchId);
    
    if (allBatchImages.length === 0) {
      toast.error('No images found in this batch.');
      return;
    }
    
    // Group images by product_id and track initial assignments
    const imagesByProduct: Record<string, string[]> = {};
    const unassigned: string[] = [];
    const initialAssignments = new Map<string, string | null>();
    
    for (const img of allBatchImages) {
      // Track initial assignment for change detection
      initialAssignments.set(img.url, img.product_id || null);
      
      if (img.product_id && img.product_id !== '') {
        if (!imagesByProduct[img.product_id]) {
          imagesByProduct[img.product_id] = [];
        }
        imagesByProduct[img.product_id].push(img.url);
      } else {
        unassigned.push(img.url);
      }
    }
    
    // Create groups ONLY from existing products that have at least 1 image
    // This prevents empty product boxes from ever appearing
    const groups: ImageGroup[] = products
      .filter(p => imagesByProduct[p.id] && imagesByProduct[p.id].length > 0)
      .map((product, index) => ({
        productId: product.id,
        productNumber: index + 1,
        images: imagesByProduct[product.id] || [],
        selectedImages: new Set<string>(),
        isGrouped: product.is_grouped || false,
      }));
    
    setImageGroups(groups);
    setUnassignedImages(unassigned);
    setInitialImageAssignments(initialAssignments); // CRITICAL: Set initial state for change detection
    setShowGroupManager(true);
    
    const totalImages = allBatchImages.length;
    const assignedCount = totalImages - unassigned.length;
    toast.success(`Loaded ${totalImages} images (${assignedCount} assigned, ${unassigned.length} unassigned)`);
  }, [selectedBatchId, fetchImagesForBatch, products, deleteEmptyProducts]);

  // Regroup selected products - collect their images and re-chunk them
  const handleRegroupSelectedProducts = useCallback(async (productIds: string[], imagesPerProduct: number) => {
    if (productIds.length === 0) {
      toast.error('No products selected to regroup.');
      return;
    }

    // Filter out confirmed/locked products
    const lockedProductIds = productIds.filter(id => {
      const product = products.find(p => p.id === id);
      return product?.is_grouped;
    });
    const unlockedProductIds = productIds.filter(id => {
      const product = products.find(p => p.id === id);
      return !product?.is_grouped;
    });

    if (unlockedProductIds.length === 0) {
      toast.info(`All ${lockedProductIds.length} selected product(s) are confirmed. Unlock them first to regroup.`);
      return;
    }

    // Fetch images only for unlocked selected products
    const allImages: string[] = [];
    const newInitialAssignments = new Map<string, string | null>();
    
    for (const productId of unlockedProductIds) {
      const images = await fetchImagesForProduct(productId);
      for (const img of images) {
        allImages.push(img.url);
        // Mark these images with their current product ID as initial state
        newInitialAssignments.set(img.url, productId);
      }
    }

    if (allImages.length === 0) {
      toast.error('No images found in selected unlocked products.');
      return;
    }

    // Create new groups from collected images
    const chunks: string[][] = [];
    for (let i = 0; i < allImages.length; i += imagesPerProduct) {
      chunks.push(allImages.slice(i, i + imagesPerProduct));
    }

    const newGroups: ImageGroup[] = chunks.map((chunk, index) => ({
      productId: `temp-regroup-${Date.now()}-${index}`,
      productNumber: index + 1,
      images: chunk,
      selectedImages: new Set<string>(),
    }));

    // Delete only the unlocked old products
    for (const productId of unlockedProductIds) {
      await deleteProduct(productId);
    }

    // Clear selection
    setSelectedProductIds(new Set());

    setImageGroups(newGroups);
    setUnassignedImages([]);
    // Update initial assignments so new temp groups are correctly tracked as "new"
    setInitialImageAssignments(prev => {
      const updated = new Map(prev);
      // Clear out old assignments for these images and mark them as needing creation
      for (const url of allImages) {
        updated.delete(url); // These are now in temp groups, will be created fresh
      }
      return updated;
    });
    setShowGroupManager(true);
    
    const skippedMsg = lockedProductIds.length > 0 ? ` (${lockedProductIds.length} confirmed product(s) skipped)` : '';
    toast.success(`Re-grouped ${allImages.length} images into ${chunks.length} product(s)${skippedMsg}. Review and confirm.`);
  }, [fetchImagesForProduct, deleteProduct, products]);

  // Regroup unassigned images in the group manager view
  const handleRegroupUnassigned = useCallback((imagesPerProduct: number) => {
    if (unassignedImages.length === 0) {
      toast.error('No unassigned images to group.');
      return;
    }

    // Save current state for undo
    saveUndoState({
      type: 'group_change',
      label: 'Before auto-group unassigned',
      imageGroups: imageGroups.map(g => ({ ...g, selectedImages: new Set(g.selectedImages) })),
      unassignedImages: [...unassignedImages],
    });

    // Chunk unassigned images into groups
    const chunks: string[][] = [];
    for (let i = 0; i < unassignedImages.length; i += imagesPerProduct) {
      chunks.push(unassignedImages.slice(i, i + imagesPerProduct));
    }

    const newGroups: ImageGroup[] = chunks.map((chunk, index) => ({
      productId: `temp-${Date.now()}-${index}`,
      productNumber: imageGroups.length + index + 1,
      images: chunk,
      selectedImages: new Set<string>(),
    }));

    // Add new groups to existing groups
    setImageGroups(prev => [...prev, ...newGroups]);
    setUnassignedImages([]);
    toast.success(`Grouped ${unassignedImages.length} images into ${chunks.length} new product(s).`);
  }, [unassignedImages, imageGroups, saveUndoState]);

  // AI Smart Match - uses image recognition to group similar images with real-time progress
  const handleSmartMatch = useCallback(async () => {
    if (unassignedImages.length === 0) {
      toast.error('No unassigned images to match.');
      return;
    }

    if (unassignedImages.length > 500) {
      toast.error('AI matching supports up to 500 images. Please use auto-group first to split into smaller sets.');
      return;
    }

    // Save current state for undo
    saveUndoState({
      type: 'group_change',
      label: 'Before AI Smart Match',
      imageGroups: imageGroups.map(g => ({ ...g, selectedImages: new Set(g.selectedImages) })),
      unassignedImages: [...unassignedImages],
    });

    setIsMatching(true);
    
    const BATCH_SIZE = 15;
    const totalImages = unassignedImages.length;
    const totalBatches = Math.ceil(totalImages / BATCH_SIZE);
    
    // Initialize progress
    setMatchingProgress({
      current: 0,
      total: totalImages,
      currentBatch: 0,
      totalBatches
    });
    
    try {
      const allGroupResults: { imageUrl: string; groupNumber: number }[] = [];
      let globalGroupOffset = 0;
      
      // Process images in chunks on the frontend for real-time progress
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const start = batchIndex * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, totalImages);
        const batchImages = unassignedImages.slice(start, end);
        
        // Update progress state
        setMatchingProgress({
          current: start,
          total: totalImages,
          currentBatch: batchIndex + 1,
          totalBatches
        });
        
        try {
          const { data, error } = await supabase.functions.invoke('match-images', {
            body: { 
              imageUrls: batchImages,
              imagesPerGroup: settings?.default_images_per_product || 9,
              groupOffset: globalGroupOffset
            }
          });

          if (error) throw error;
          
          if (data?.groups) {
            // Adjust group numbers with global offset
            const adjustedGroups = data.groups.map((g: { imageUrl: string; groupNumber: number }) => ({
              imageUrl: g.imageUrl,
              groupNumber: g.groupNumber + globalGroupOffset
            }));
            allGroupResults.push(...adjustedGroups);
            
            // Update global offset for next batch
            const maxGroup = Math.max(...data.groups.map((g: { groupNumber: number }) => g.groupNumber), 0);
            globalGroupOffset += maxGroup + 1;
          }
        } catch (batchError) {
          console.error(`Batch ${batchIndex + 1} failed:`, batchError);
          // Continue with remaining batches
        }
        
        // Small delay between batches to prevent rate limiting
        if (batchIndex < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      // Final progress update
      setMatchingProgress({
        current: totalImages,
        total: totalImages,
        currentBatch: totalBatches,
        totalBatches
      });

      // Convert AI response to ImageGroups
      const groupMap = new Map<number, string[]>();
      for (const item of allGroupResults) {
        const group = groupMap.get(item.groupNumber) || [];
        group.push(item.imageUrl);
        groupMap.set(item.groupNumber, group);
      }

      const newGroups: ImageGroup[] = Array.from(groupMap.entries()).map(([groupNum, images], index) => ({
        productId: `temp-match-${Date.now()}-${index}`,
        productNumber: imageGroups.length + index + 1,
        images,
        selectedImages: new Set<string>(),
      }));

      setImageGroups(prev => [...prev, ...newGroups]);
      setUnassignedImages([]);
      
      toast.success(`AI matched ${totalImages} images into ${newGroups.length} product groups (${totalBatches} batches processed).`);
    } catch (error) {
      console.error('Smart match error:', error);
      toast.error(error instanceof Error ? error.message : 'AI matching failed');
    } finally {
      setIsMatching(false);
      setMatchingProgress({ current: 0, total: 0, currentBatch: 0, totalBatches: 0 });
    }
  }, [unassignedImages, imageGroups, settings?.default_images_per_product, saveUndoState]);


  // Use the new AI generation hook for bulk operations
  const handleGenerateAll = useCallback(async () => {
    if (!selectedBatchId || products.length === 0) return;
    await aiGeneration.generateBulk(products, selectedProductIds.size > 0 ? selectedProductIds : undefined);
  }, [selectedBatchId, products, selectedProductIds, aiGeneration]);

  // Generate bulk - with configurable batch size
  const handleGenerateBulk = useCallback(async (customBatchSize?: 5 | 10 | 20) => {
    if (!selectedBatchId || products.length === 0) return;
    await aiGeneration.generateBulk(products, undefined, customBatchSize);
  }, [selectedBatchId, products, aiGeneration]);

  // Generate AI for a single product
  const handleGenerateSingleProduct = useCallback(async (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const result = await aiGeneration.generateSingleProduct(product);
    if (!result.success && !result.skipped) {
      if (result.noImages) {
        toast.error('This product has no images to analyze.');
      } else {
        toast.error(`AI generation failed: ${result.error || 'Unknown error'}`);
      }
    }
  }, [products, aiGeneration]);

  // Undo AI for a single product
  const handleUndoSingleProduct = useCallback(async (productId: string) => {
    await aiGeneration.undoSingleProduct(productId);
  }, [aiGeneration]);

  // Undo bulk AI generation
  const handleUndoBulkGeneration = useCallback(async () => {
    await aiGeneration.undoBulkGeneration();
  }, [aiGeneration]);

  const handleExcludeLast2All = useCallback(async () => {
    if (!selectedBatchId) return;
    
    for (const product of products) {
      await excludeLastNImages(product.id, 2);
    }
    
    clearCache();
    toast.success('Excluded last 2 images from Shopify for all products');
  }, [selectedBatchId, products, excludeLastNImages, clearCache]);

  // Helper to check if a product is missing key fields
  const checkProductMissingFields = useCallback((product: Product): boolean => {
    const keyFields = [
      product.garment_type,
      product.department,
      product.era,
      product.brand,
      product.size_label || product.size_recommended, // Either one is ok
      product.material,
      product.condition,
      product.pit_to_pit,
    ];
    // If any key field is missing/empty, count as incomplete
    return keyFields.some(f => !f || (typeof f === 'string' && f.trim() === ''));
  }, []);

  // Pre-upload check that shows warning dialog if products have missing fields
  const handleShopifyUploadCheck = useCallback((productIds: string[]) => {
    if (!settings?.shopify_store_url) {
      toast.error('Shopify store URL is not configured. Go to Settings to add it.');
      return;
    }
    
    const uniqueProductIds = Array.from(new Set(productIds));
    const allProducts = uniqueProductIds
      .map(id => products.find(p => p.id === id))
      .filter(Boolean) as Product[];
    
    // Filter out already uploaded products
    const productsToCreate = allProducts.filter(p => !p.shopify_product_id && p.status !== 'created_in_shopify');
    
    if (productsToCreate.length === 0) {
      toast.success('All selected products are already uploaded to Shopify');
      return;
    }
    
    // Count products with missing fields
    const missingCount = productsToCreate.filter(checkProductMissingFields).length;
    
    if (missingCount > 0) {
      // Show warning dialog
      setShopifyWarningData({
        show: true,
        missingCount,
        totalCount: productsToCreate.length,
        productIds: uniqueProductIds,
      });
    } else {
      // No missing fields, proceed directly
      handleCreateInShopify(uniqueProductIds);
    }
  }, [settings?.shopify_store_url, products, checkProductMissingFields]);

  const handleCreateInShopify = useCallback(async (productIds: string[]) => {
    if (!settings?.shopify_store_url) {
      toast.error('Shopify store URL is not configured. Go to Settings to add it.');
      return;
    }

    setIsCreatingShopify(true);
    
    try {
      // Prepare products and images for the edge function
      const uniqueProductIds = Array.from(new Set(productIds));
      const allProducts = uniqueProductIds
        .map(id => products.find(p => p.id === id))
        .filter(Boolean) as Product[];
      
      // IDEMPOTENCY CHECK: Filter out products that already have a Shopify ID
      const alreadyUploaded = allProducts.filter(p => !!p.shopify_product_id || p.status === 'created_in_shopify');
      const productsToCreate = allProducts.filter(p => !p.shopify_product_id && p.status !== 'created_in_shopify');
      
      if (alreadyUploaded.length > 0) {
        toast.info(`Skipping ${alreadyUploaded.length} product(s) already uploaded to Shopify`);
      }
      
      if (productsToCreate.length === 0) {
        toast.success('All selected products are already uploaded to Shopify');
        setIsCreatingShopify(false);
        return;
      }
      
      toast.info(`Preparing ${productsToCreate.length} products for Shopify...`);
      
      // Fetch images for all products in parallel
      const imagesMap: Record<string, { url: string; position: number }[]> = {};
      const imagePromises = productsToCreate.map(async (product) => {
        const allImages = await fetchImagesForProduct(product.id);
        const shopifyImages = [...allImages]
          .sort((a, b) => a.position - b.position) // Ensure correct order
          .map(img => ({ url: img.url, position: img.position }));
        return { productId: product.id, images: shopifyImages };
      });
      
      const imageResults = await Promise.all(imagePromises);
      for (const result of imageResults) {
        imagesMap[result.productId] = result.images;
      }
      
      // EXPORT VALIDATION: Check each product and warn about missing fields
      const validationResults = productsToCreate.map(product => {
        const imageCount = imagesMap[product.id]?.length || 0;
        return { product, validation: validateProductForExport(product, imageCount) };
      });
      
      const invalidProducts = validationResults.filter(r => !r.validation.isValid);
      const productsWithWarnings = validationResults.filter(r => r.validation.warnings.length > 0);
      
      // Block export if any products are missing required fields
      if (invalidProducts.length > 0) {
        const missingList = invalidProducts.map(r => 
          `${r.product.sku || r.product.title || 'Product'}: ${r.validation.missingFields.join(', ')}`
        ).join('\n');
        toast.error(`Cannot export ${invalidProducts.length} product(s) - missing required fields:\n${missingList}`);
        setIsCreatingShopify(false);
        return;
      }
      
      // Show warnings but allow export
      if (productsWithWarnings.length > 0) {
        const warningCount = productsWithWarnings.length;
        const warningFields = [...new Set(productsWithWarnings.flatMap(r => r.validation.warnings))];
        toast.warning(`${warningCount} product(s) missing recommended fields: ${warningFields.join(', ')}. Exporting anyway.`);
      }
      
      // Log image counts for debugging
      let totalImages = 0;
      for (const [productId, imgs] of Object.entries(imagesMap)) {
        console.log(`Product ${productId}: ${imgs.length} images`);
        totalImages += imgs.length;
      }
      console.log(`Total images to upload: ${totalImages}`);
      
      toast.info(`Uploading ${productsToCreate.length} products with ${totalImages} images...`);
      
      // Prepare product payloads with auto-fill for missing title/price
      const productPayloads = productsToCreate.map(p => {
        // Auto-generate title if missing
        let title = p.title;
        if (!title || title.trim() === '') {
          title = generateAutoTitle(p);
          console.log(`[Shopify] Auto-generated title for ${p.sku || p.id}: "${title}"`);
        }
        
        // Auto-set price if missing (using rule-based pricing)
        let price = p.price;
        if (!price || price <= 0) {
          price = getDefaultPrice(p.garment_type, {
            brand: p.brand,
            material: p.material,
            condition: p.condition,
            collections_tags: p.collections_tags,
            title: p.title,
            style: p.style,
          });
          console.log(`[Shopify] Auto-set price for ${p.sku || p.id}: £${price}`);
        }
        
        return {
          id: p.id,
          title,
          description: p.description_style_a || p.description || '',
          price,
          currency: p.currency,
          sku: p.sku,
          brand: p.brand,
          garment_type: p.garment_type,
          shopify_tags: p.shopify_tags,
          collections_tags: p.collections_tags,
        };
      });
      
      // Get the current session for auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('You must be logged in to upload to Shopify');
      }
      
      // Call the edge function with user's session token (required by verifyAuth)
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-shopify-product`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          products: productPayloads,
          images: imagesMap,
          shopifyStoreUrl: settings.shopify_store_url,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create products in Shopify');
      }
      
      const data = await response.json();
      
      // Update products with results
      for (const result of data.results) {
        if (result.success) {
          await updateProduct(result.productId, {
            status: 'created_in_shopify',
            shopify_product_id: result.shopifyProductId,
            shopify_handle: result.shopifyHandle,
            uploaded_at: new Date().toISOString(),
            upload_error: null,
          });
          
          // Log any image warnings
          if (result.error) {
            console.warn(`Product ${result.productId}: ${result.error}`);
          }
        } else {
          await updateProduct(result.productId, { 
            status: 'error',
            upload_error: result.error || 'Unknown error',
          });
          console.error(`Product ${result.productId} failed: ${result.error}`);
        }
      }
      
      setSelectedProductIds(new Set());
      
      // Show success dialog with image warning count
      const partialCount = data.partialCount || 0;
      if (partialCount > 0) {
        toast.warning(`${partialCount} products had some images fail to upload. Check Shopify to verify.`);
      }
      setShopifySuccessData({ successCount: data.successCount, errorCount: data.errorCount });
      
    } catch (error) {
      console.error('Shopify creation error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create products in Shopify');
    } finally {
      setIsCreatingShopify(false);
    }
  }, [products, settings, updateProduct, fetchImagesForProduct]);

  const handleToggleProductSelection = useCallback((productId: string) => {
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }, []);

  const handleBulkSelectProducts = useCallback((productIds: string[]) => {
    setSelectedProductIds(new Set(productIds));
  }, []);

  // Sync selection with current products - remove any stale IDs that no longer exist
  // Sync selection with products - clear stale IDs and filter out products with no images
  // This effect only runs when the products list changes (batch switch, delete, etc.)
  useEffect(() => {
    if (products.length === 0) {
      setSelectedProductIds(new Set());
      return;
    }
    
    const validProductIds = new Set(products.map(p => p.id));
    setSelectedProductIds(prev => {
      // If no previous selection, keep it empty (don't auto-select)
      if (prev.size === 0) return prev;
      
      const validSelection = new Set<string>();
      prev.forEach(id => {
        if (validProductIds.has(id)) {
          validSelection.add(id);
        }
      });
      // Only update if something changed (size differs means stale IDs were removed)
      if (validSelection.size !== prev.size) {
        return validSelection;
      }
      return prev;
    });
  }, [products]);

  const handleSaveProduct = useCallback(async (updates: Partial<Product>) => {
    if (!editingProductId) return;
    
    // Generate listing block
    const currentProduct = products.find(p => p.id === editingProductId);
    if (currentProduct) {
      const updatedProduct = { ...currentProduct, ...updates };
      const listingBlock = generateListingBlock(updatedProduct as Product);
      await updateProduct(editingProductId, { ...updates, listing_block: listingBlock });
    }
  }, [editingProductId, products, updateProduct]);

  const handleUpdateImage = useCallback(async (imageId: string, updates: Partial<ProductImage>) => {
    if (!editingProductId) return;
    const success = await updateImage(imageId, editingProductId, updates);
    if (success) {
      // Refresh images
      const images = await fetchImagesForProduct(editingProductId);
      setEditingProductImages(images);
      toast.success('Image updated');
    } else {
      toast.error('Failed to update image');
    }
  }, [editingProductId, updateImage, fetchImagesForProduct]);

  const handleReorderImages = useCallback(async (imageId: string, newPosition: number) => {
    if (!editingProductId) return;
    
    const oldPosition = editingProductImages.find(i => i.id === imageId)?.position || 0;
    if (oldPosition === newPosition) return;
    
    try {
      for (const img of editingProductImages) {
        if (img.id === imageId) {
          await updateImage(img.id, editingProductId, { position: newPosition });
        } else if (oldPosition < newPosition) {
          if (img.position > oldPosition && img.position <= newPosition) {
            await updateImage(img.id, editingProductId, { position: img.position - 1 });
          }
        } else {
          if (img.position >= newPosition && img.position < oldPosition) {
            await updateImage(img.id, editingProductId, { position: img.position + 1 });
          }
        }
      }
      
      // Refresh images
      clearCache(editingProductId);
      const images = await fetchImagesForProduct(editingProductId);
      setEditingProductImages(images);
      toast.success('Image order saved');
    } catch (error) {
      console.error('Error reordering images:', error);
      toast.error('Failed to reorder images');
    }
  }, [editingProductId, editingProductImages, updateImage, clearCache, fetchImagesForProduct]);

  const handleDeleteImageFromProduct = useCallback(async (imageId: string) => {
    if (!editingProductId) return;
    
    const success = await deleteImage(imageId);
    if (success) {
      // Refresh images and recalculate positions
      const images = await fetchImagesForProduct(editingProductId);
      // Update positions to be sequential
      for (let i = 0; i < images.length; i++) {
        if (images[i].position !== i + 1) {
          await updateImage(images[i].id, editingProductId, { position: i + 1 });
        }
      }
      const updatedImages = await fetchImagesForProduct(editingProductId);
      setEditingProductImages(updatedImages);
      toast.success('Image deleted');
    } else {
      toast.error('Failed to delete image');
    }
  }, [editingProductId, deleteImage, fetchImagesForProduct, updateImage]);

  // Handler for deleting individual images from ProductCard (main grid view)
  // Note: The UI refreshes because refetchProducts triggers BatchDetail's image fetch effect
  const handleDeleteImageById = useCallback(async (imageId: string, productId: string) => {
    const success = await deleteImage(imageId);
    if (success) {
      // Clear cache and refetch products - the products array change will trigger BatchDetail image refetch
      clearCache(productId);
      refetchProducts();
      refetchDeletedImages();
      toast.success('Image moved to trash', {
        action: {
          label: 'View Trash',
          onClick: () => setShowDeletedImages(true),
        },
      });
    } else {
      toast.error('Failed to delete image');
    }
  }, [deleteImage, clearCache, refetchProducts, refetchDeletedImages]);

  const handleGenerateProductAI = useCallback(async (regenerateOnly?: 'title' | 'style_a' | 'style_b' | 'all') => {
    if (!editingProductId) return;
    
    // Prevent double-clicks
    if (isGeneratingDetailPanel) {
      console.warn('[AI Detail] Already generating, ignoring request');
      return;
    }
    
    const product = products.find(p => p.id === editingProductId);
    if (!product) return;
    
    // Set loading states
    setIsGeneratingDetailPanel(true);
    if (regenerateOnly && regenerateOnly !== 'all') {
      setRegeneratingField(regenerateOnly);
    }
    
    try {
      // Get product images for AI context
      const images = await fetchImagesForProduct(editingProductId);
      
      if (images.length === 0) {
        toast.error('This product has no images to analyze.');
        return;
      }
      
      // CRITICAL: Use up to 4 images to capture garment, labels, and measurement signs
      const imageUrls = images.slice(0, 4).map(img => img.url);
      
      console.log(`[AI Detail] Generating for product ${editingProductId} (regenerateOnly: ${regenerateOnly})`);
      
      // Get the user's access token for authenticated edge function calls
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Not authenticated. Please sign in again.');
        return;
      }
      
      // Call the edge function with user's access token
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-listing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ 
          product, 
          imageUrls,
          regenerateOnly: regenerateOnly === 'all' ? undefined : regenerateOnly
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Generation failed');
      }
      
      const data = await response.json();
      const generated = data.generated;
      
      // Update product with generated content (ONLY for this specific product)
      const updates: Partial<Product> = { status: 'generated' };
      
      if (!regenerateOnly || regenerateOnly === 'all' || regenerateOnly === 'title') {
        if (generated.title) updates.title = generated.title;
      }
      if (!regenerateOnly || regenerateOnly === 'all' || regenerateOnly === 'style_a') {
        if (generated.description_style_a) updates.description_style_a = generated.description_style_a;
      }
      if (!regenerateOnly || regenerateOnly === 'all' || regenerateOnly === 'style_b') {
        if (generated.description_style_b) updates.description_style_b = generated.description_style_b;
      }
      if (!regenerateOnly || regenerateOnly === 'all') {
        if (generated.shopify_tags) updates.shopify_tags = generated.shopify_tags;
        if (generated.etsy_tags) updates.etsy_tags = generated.etsy_tags;
        if (generated.collections_tags) updates.collections_tags = generated.collections_tags;
        
        // CRITICAL: Also update AI-inferred fields (only if not already set on product)
        if (!product.garment_type && generated.garment_type) {
          updates.garment_type = generated.garment_type;
        }
        if (!product.fit && generated.fit) {
          updates.fit = generated.fit;
        }
        if (!product.era && generated.era) {
          updates.era = generated.era;
        }
        if (!product.condition && generated.condition) {
          updates.condition = generated.condition;
        }
        if (!product.department && generated.department) {
          updates.department = generated.department;
        }
        if (!product.flaws && generated.flaws) {
          updates.flaws = generated.flaws;
        }
        if (!product.made_in && generated.made_in) {
          updates.made_in = generated.made_in;
        }
        if (!product.pattern && generated.pattern) {
          updates.pattern = generated.pattern;
        }
        // CRITICAL: Include OCR/vision extracted fields (brand, material, sizes, measurements, colours)
        if (!product.brand && generated.brand) {
          updates.brand = generated.brand;
        }
        if (!product.material && generated.material) {
          updates.material = generated.material;
        }
        if (!product.size_label && generated.size_label) {
          updates.size_label = generated.size_label;
        }
        if (!product.size_recommended && generated.size_recommended) {
          updates.size_recommended = generated.size_recommended;
        }
        if (!product.pit_to_pit && generated.pit_to_pit) {
          updates.pit_to_pit = generated.pit_to_pit;
        }
        if (!product.colour_main && generated.colour_main) {
          updates.colour_main = generated.colour_main;
        }
        if (!product.colour_secondary && generated.colour_secondary) {
          updates.colour_secondary = generated.colour_secondary;
        }
        if (!product.style && generated.style) {
          updates.style = generated.style;
        }
      }
      
      console.log('[AI Detail] Updates to apply:', Object.keys(updates));
      
      // updateProduct uses the specific product ID - never affects other products
      await updateProduct(editingProductId, updates);
      console.log(`[AI Detail] Successfully updated product ${editingProductId}`);
      toast.success(regenerateOnly && regenerateOnly !== 'all' ? `${regenerateOnly.replace('_', ' ')} regenerated` : 'AI generation complete');
      
    } catch (error) {
      console.error('[AI Detail] Generation error:', error);
      toast.error(error instanceof Error ? error.message : 'Generation failed. Please try again.');
    } finally {
      setIsGeneratingDetailPanel(false);
      setRegeneratingField(null);
    }
  }, [editingProductId, products, updateProduct, fetchImagesForProduct, isGeneratingDetailPanel]);

  const getProductImagesCallback = useCallback(async (productId: string) => {
    return await fetchImagesForProduct(productId);
  }, [fetchImagesForProduct]);

  const handleCreateSingleProductInShopify = useCallback(async () => {
    if (!editingProductId) return;
    await handleCreateInShopify([editingProductId]);
  }, [editingProductId, handleCreateInShopify]);

  // Shopify manual status override handlers
  const handleMarkAsUploaded = useCallback(async (productId: string, shopifyProductId?: string) => {
    await updateProduct(productId, {
      status: 'created_in_shopify',
      shopify_product_id: shopifyProductId || null,
      uploaded_at: new Date().toISOString(),
      upload_error: null,
    });
    toast.success('Marked as uploaded to Shopify');
  }, [updateProduct]);

  const handleMarkAsPending = useCallback(async (productId: string) => {
    await updateProduct(productId, {
      status: 'new',
      uploaded_at: null,
      upload_error: null,
      // Keep shopify_product_id if it exists - don't delete it
    });
    toast.success('Marked as pending');
  }, [updateProduct]);

  // Hide product - permanently removes from visible list until explicitly unhidden
  const handleHideProduct = useCallback(async (productId: string, showToast: boolean = true) => {
    await hideProduct(productId, showToast);
  }, [hideProduct]);

  // Delete empty products (products with 0 images) - used in Birds Eye View cleanup
  // SAFETY: Only deletes product records that have NO images in the database
  const handleDeleteEmptyProducts = useCallback(async (productIds: string[]) => {
    if (productIds.length === 0) return;
    
    let deletedCount = 0;
    let skippedCount = 0;
    
    for (const productId of productIds) {
      // SAFETY CHECK: Verify product has no images before deleting
      const { count, error: countError } = await supabase
        .from('images')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', productId);
      
      if (countError) {
        console.error('Error checking images for product:', productId, countError);
        skippedCount++;
        continue;
      }
      
      // Only delete if product truly has 0 images
      if (count === 0) {
        const success = await deleteProduct(productId);
        if (success) {
          deletedCount++;
        }
      } else {
        console.warn(`Skipped deleting product ${productId} - has ${count} images`);
        skippedCount++;
      }
    }
    
    // Clear selection
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      productIds.forEach(id => next.delete(id));
      return next;
    });
    
    // Refresh products
    await refetchProducts();
    
    if (deletedCount > 0) {
      toast.success(`Deleted ${deletedCount} empty product(s)`);
    }
    if (skippedCount > 0) {
      toast.info(`Skipped ${skippedCount} product(s) that still have images`);
    }
  }, [deleteProduct, refetchProducts]);

  const handleMoveImageBetweenProducts = useCallback(async (imageUrl: string, fromProductId: string, toProductId: string) => {
    // Find the image in the database by URL and update its product_id
    const { data: imageData, error: fetchError } = await supabase
      .from('images')
      .select('id, position')
      .eq('url', imageUrl)
      .single();

    if (fetchError || !imageData) {
      toast.error('Failed to find image');
      return;
    }

    // Get the count of images in the target product to set position
    const targetImages = await fetchImagesForProduct(toProductId);
    const newPosition = targetImages.length;

    const { error } = await supabase
      .from('images')
      .update({ product_id: toProductId, position: newPosition })
      .eq('id', imageData.id);

    if (error) {
      toast.error('Failed to move image');
      return;
    }

    // Clear cache and refetch
    clearCache();
    await refetchProducts();
    
    // AUTO-CLEANUP: Delete the source product if it became empty
    await deleteEmptyProducts();
    
    // Force BatchDetail to refresh images from DB
    forceRefreshImages();
    
    toast.success('Image moved successfully');
  }, [fetchImagesForProduct, clearCache, refetchProducts, deleteEmptyProducts, forceRefreshImages]);

  // Handler for moving multiple images by ID from detail panel
  const handleMoveImagesById = useCallback(async (imageIds: string[], targetProductId: string) => {
    if (!editingProductId || imageIds.length === 0) return;
    
    try {
      // Get the count of images in the target product to set starting position
      const targetImages = await fetchImagesForProduct(targetProductId);
      const startPosition = targetImages.length;

      // Move all images in PARALLEL
      const updatePromises = imageIds.map((imageId, index) =>
        supabase
          .from('images')
          .update({ product_id: targetProductId, position: startPosition + index })
          .eq('id', imageId)
      );
      
      const results = await Promise.all(updatePromises);
      const movedCount = results.filter(r => !r.error).length;

      if (movedCount === 0) {
        toast.error('Failed to move images');
        return;
      }

      // Refresh images for both products
      clearCache();
      const updatedImages = await fetchImagesForProduct(editingProductId);
      setEditingProductImages(updatedImages);
      await refetchProducts();
      
      // AUTO-CLEANUP: Delete the source product if it became empty (background)
      deleteEmptyProducts().catch(err => console.error('Cleanup error:', err));
      
      // Force BatchDetail to refresh images from DB
      forceRefreshImages();
      
      toast.success(`${movedCount} image(s) moved`);
    } catch (error) {
      console.error('Error moving images:', error);
      toast.error('Failed to move images');
    }
  }, [editingProductId, fetchImagesForProduct, clearCache, refetchProducts, deleteEmptyProducts, forceRefreshImages]);

  // Standalone handler for moving images by ID (used in birds eye view)
  const handleMoveImagesByIdStandalone = useCallback(async (imageIds: string[], targetProductId: string) => {
    // GUARD: Validate inputs
    if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
      console.warn('handleMoveImagesByIdStandalone: No images to move');
      return;
    }
    
    if (!targetProductId || typeof targetProductId !== 'string') {
      console.warn('handleMoveImagesByIdStandalone: Invalid target product ID');
      return;
    }
    
    // Filter out any undefined/null image IDs
    const validImageIds = imageIds.filter(id => id && typeof id === 'string');
    if (validImageIds.length === 0) {
      console.warn('handleMoveImagesByIdStandalone: No valid image IDs after filtering');
      return;
    }
    
    // Capture undo snapshot BEFORE making changes
    await majorActionUndo.captureSnapshot(validImageIds, 'move_images', `Move ${validImageIds.length} image(s)`);
    
    try {
      // Get the count of images in the target product to set starting position
      const targetImages = await fetchImagesForProduct(targetProductId);
      const startPosition = Array.isArray(targetImages) ? targetImages.length : 0;

      // Move all images in PARALLEL
      const updatePromises = validImageIds.map((imageId, index) =>
        supabase
          .from('images')
          .update({ product_id: targetProductId, position: startPosition + index })
          .eq('id', imageId)
      );
      
      const results = await Promise.all(updatePromises);
      const movedCount = results.filter(r => !r.error).length;

      if (movedCount === 0) {
        toast.error('Failed to move images');
        return;
      }

      // Clear cache and refetch
      clearCache();
      await refetchProducts();
      
      // AUTO-CLEANUP: Delete any source products that became empty (background)
      deleteEmptyProducts().catch(err => console.error('Cleanup error:', err));
      
      // Force BatchDetail to refresh images from DB
      forceRefreshImages();
      
      toast.success(`${movedCount} image(s) moved`);
    } catch (error) {
      console.error('Error moving images:', error);
      toast.error('Failed to move images');
    }
  }, [fetchImagesForProduct, clearCache, refetchProducts, deleteEmptyProducts, majorActionUndo, forceRefreshImages]);

  // Handler for creating a new product from selected image IDs (used in Birds Eye View)
  // This creates a REAL product in the database and moves images to it
  const handleCreateProductFromImageIds = useCallback(async (imageIds: string[]): Promise<string | null> => {
    // GUARD: Early validation
    if (!selectedBatchId) {
      console.warn('handleCreateProductFromImageIds: No batch selected');
      return null;
    }
    
    if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
      toast.warning('No images selected');
      return null;
    }
    
    // Filter out any undefined/null image IDs
    const validImageIds = imageIds.filter(id => id && typeof id === 'string');
    if (validImageIds.length === 0) {
      toast.warning('No valid images selected');
      return null;
    }

    // Capture undo snapshot BEFORE making changes
    await majorActionUndo.captureSnapshot(validImageIds, 'bulk_create', `Create product from ${validImageIds.length} image(s)`);

    try {
      // Step 1: Fetch current user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('You must be logged in');
        return null;
      }

      // Step 2: Create a new product (SKU will be generated after AI categorization)
      const { data: productData, error: productError } = await supabase
        .from('products')
        .insert({
          batch_id: selectedBatchId,
          sku: null, // SKU generated after AI categorization
          status: 'new',
          currency: 'GBP',
          user_id: user.id,
        })
        .select()
        .single();

      if (productError || !productData) {
        console.error('Error creating product:', productError);
        toast.error('Failed to create product');
        return null;
      }

      const newProductId = productData.id;

      // Step 3: Move all selected images to the new product in PARALLEL
      const updatePromises = validImageIds.map((imageId, index) =>
        supabase
          .from('images')
          .update({ product_id: newProductId, position: index })
          .eq('id', imageId)
      );
      
      const results = await Promise.all(updatePromises);
      const movedCount = results.filter(r => !r.error).length;

      // Step 4: Safety check - delete product if no images were moved
      if (movedCount === 0) {
        console.error('SAFETY: No images moved, deleting empty product');
        await supabase.from('products').delete().eq('id', newProductId);
        toast.error('Failed to move images to new product');
        return null;
      }

      // Step 5: Clear cache and refetch products
      clearCache();
      await refetchProducts();
      
      // Step 6: Clean up empty source products in background (don't await)
      deleteEmptyProducts().catch(err => console.error('Cleanup error:', err));

      // Note: imageGroups and unassignedImages will be updated by the loadBatchImages 
      // effect when productIds changes after refetchProducts completes

      return newProductId;
    } catch (error) {
      console.error('Error creating product from images:', error);
      toast.error('Failed to create product');
      return null;
    }
  }, [selectedBatchId, clearCache, refetchProducts, deleteEmptyProducts, majorActionUndo]);

  // Create product from image URLs (for UnassignedImagePool direct creation)
  const handleCreateProductFromUrls = useCallback(async (urls: string[]): Promise<string | null> => {
    if (!selectedBatchId) {
      console.warn('handleCreateProductFromUrls: No batch selected');
      return null;
    }

    if (!urls || urls.length === 0) {
      toast.warning('No images selected');
      return null;
    }

    // Filter out any empty URLs
    const validUrls = urls.filter(url => url && url.trim() !== '');
    if (validUrls.length === 0) {
      toast.warning('No valid images selected');
      return null;
    }

    try {
      // Step 1: Lookup image IDs from URLs
      const { data: imageRecords, error: lookupError } = await supabase
        .from('images')
        .select('id, url')
        .eq('batch_id', selectedBatchId)
        .in('url', validUrls);

      if (lookupError) {
        console.error('Error looking up images:', lookupError);
        toast.error('Failed to find images');
        return null;
      }

      if (!imageRecords || imageRecords.length === 0) {
        toast.error('No images found in database');
        return null;
      }

      // Get the image IDs in the same order as URLs
      const imageIds = imageRecords.map(r => r.id);

      // Step 2: Use the existing function to create product from IDs
      const productId = await handleCreateProductFromImageIds(imageIds);

      if (productId) {
        // Optimistically update imageGroups to show new product at TOP immediately
        setImageGroups(prev => {
          const newGroup: ImageGroup = {
            productId: productId,
            productNumber: 1, // Will be renumbered by effect
            images: validUrls,
            selectedImages: new Set<string>(),
            isGrouped: false,
          };
          // Add new group at top, renumber existing groups
          return [newGroup, ...prev.map((g, i) => ({ ...g, productNumber: i + 2 }))];
        });
        
        // Remove from unassigned images local state
        setUnassignedImages(prev => prev.filter(url => !validUrls.includes(url)));
      }

      return productId;
    } catch (error) {
      console.error('Error creating product from URLs:', error);
      toast.error('Failed to create product');
      return null;
    }
  }, [selectedBatchId, handleCreateProductFromImageIds]);

  
  const handleReorderProductImages = useCallback(async (productId: string, imageIds: string[]) => {
    // Update positions for all images in the new order
    const updates = imageIds.map((id, index) => 
      supabase
        .from('images')
        .update({ position: index })
        .eq('id', id)
    );

    const results = await Promise.all(updates);
    const hasError = results.some(r => r.error);

    if (hasError) {
      toast.error('Failed to reorder images');
      return;
    }

    // Clear cache and refetch
    clearCache();
    await refetchProducts();
  }, [clearCache, refetchProducts]);

  const isShopifyConfigured = !!settings?.shopify_store_url;

  const editingProduct = editingProductId ? products.find(p => p.id === editingProductId) : null;
  
  const productIndex = editingProductId ? products.findIndex(p => p.id === editingProductId) : -1;
  const hasPrevious = productIndex > 0;
  const hasNext = productIndex < products.length - 1;

  const navigateProduct = useCallback((direction: 'prev' | 'next') => {
    if (direction === 'prev' && hasPrevious) {
      setEditingProductId(products[productIndex - 1].id);
    } else if (direction === 'next' && hasNext) {
      setEditingProductId(products[productIndex + 1].id);
    }
  }, [hasPrevious, hasNext, productIndex, products]);

  const selectedBatch = selectedBatchId ? batches.find(b => b.id === selectedBatchId) : null;

  return (
    <AppLayout>
      <div className="h-full flex flex-col md:flex-row">
        {/* Batch list sidebar - hidden on mobile when a batch is selected */}
        <div className={cn(
          "w-full md:w-72 flex-shrink-0 border-b md:border-b-0",
          selectedBatch ? "hidden md:block" : "block"
        )}>
          <BatchList
            batches={batches}
            selectedBatchId={selectedBatchId}
            onSelectBatch={handleSelectBatch}
            onCreateBatch={handleCreateBatch}
            onDeleteBatch={handleDeleteBatch}
            onUpdateBatch={handleUpdateBatch}
            productCounts={productCounts}
          />
        </div>

        {/* Main content */}
        <div className={cn(
          "flex-1 min-w-0",
          !selectedBatch ? "hidden md:block" : "block"
        )}>
          {selectedBatch ? (
            <BatchDetail
              batch={selectedBatch}
              products={products}
              getProductImages={getProductImagesCallback}
              onUploadImages={handleUploadImages}
              onAutoGroup={handleAutoGroup}
              onReAutoGroupAll={handleReAutoGroupAll}
              onGenerateAll={handleGenerateAll}
              onGenerateBulk={handleGenerateBulk}
              onGenerateSingleProduct={handleGenerateSingleProduct}
              onUndoSingleProduct={handleUndoSingleProduct}
              onUndoBulkGeneration={handleUndoBulkGeneration}
              isProductGenerating={aiGeneration.isProductGenerating}
              hasProductUndoState={aiGeneration.hasUndoState}
              unprocessedCount={aiGeneration.getUnprocessedCount(products)}
              hasBulkUndoState={aiGeneration.hasBulkUndoState}
              lastBulkCount={aiGeneration.lastBulkCount}
              batchSize={aiGeneration.batchSize}
              onBatchSizeChange={aiGeneration.setBatchSize}
              onExcludeLast2All={handleExcludeLast2All}
              onCreateInShopify={handleShopifyUploadCheck}
              onClearFailedStatus={async (productIds) => {
                // Reset failed products to 'new' status so they can be retried
                for (const id of productIds) {
                  await updateProduct(id, { status: 'new' });
                }
                toast.success(`Cleared ${productIds.length} failed product(s) - ready for retry`);
              }}
              onEditProduct={setEditingProductId}
              onDeleteProduct={async (productId) => {
                await deleteProduct(productId);
                setSelectedProductIds(prev => {
                  const next = new Set(prev);
                  next.delete(productId);
                  return next;
                });
              }}
              onToggleProductSelection={handleToggleProductSelection}
              onBulkSelectProducts={handleBulkSelectProducts}
              onSelectAllProducts={() => {
                setSelectedProductIds(new Set(products.map(p => p.id)));
              }}
              onDeselectAllProducts={() => {
                setSelectedProductIds(new Set());
              }}
              selectedProductIds={selectedProductIds}
              isGenerating={isGenerating}
              generationProgress={generationProgress}
              isCreatingShopify={isCreatingShopify}
              pendingImageUrls={pendingImageUrls}
              onRemovePendingImage={(index) => setPendingImageUrls(prev => prev.filter((_, i) => i !== index))}
              onClearAllPendingImages={() => setPendingImageUrls([])}
              isUploading={uploading}
              uploadProgress={progress}
              uploadStartTime={uploadStartTime}
              uploadTotal={uploadTotal}
              uploadCompleted={uploadCompleted}
              onBack={() => setSelectedBatchId(null)}
              onMarkAsUploaded={handleMarkAsUploaded}
              onMarkAsPending={handleMarkAsPending}
              onHideProduct={handleHideProduct}
              onDeleteImageById={handleDeleteImageById}
              imageGroups={imageGroups}
              unassignedImages={unassignedImages}
              onUpdateImageGroups={setImageGroups}
              onUpdateUnassignedImages={setUnassignedImages}
              onCreateNewGroup={(images) => {
                // GUARD: Never create a product group with 0 images
                const validImages = images.filter(url => url && url.trim() !== '');
                if (validImages.length === 0) {
                  toast.warning('You must select at least one image to create a product.');
                  return;
                }
                
                const newGroup: ImageGroup = {
                  productId: `temp-${Date.now()}`,
                  productNumber: imageGroups.length + 1,
                  images: validImages,
                  selectedImages: new Set(),
                };
                setImageGroups(prev => [...prev, newGroup]);
                // Remove these images from unassigned pool
                setUnassignedImages(prev => prev.filter(url => !validImages.includes(url)));
              }}
              onDeleteGroup={(productId) => {
                const group = imageGroups.find(g => g.productId === productId);
                if (group) {
                  setUnassignedImages(prev => [...prev, ...group.images]);
                  setImageGroups(prev => prev.filter(g => g.productId !== productId));
                }
              }}
              onDeleteImage={async (url) => {
                // Find image in database by URL and delete it
                // Use maybeSingle() instead of single() to avoid error when no rows found
                const { data, error } = await supabase
                  .from('images')
                  .select('id')
                  .eq('url', url)
                  .maybeSingle();
                
                if (error) {
                  console.error('Error finding image to delete:', error);
                  // Still remove from local state even if DB lookup fails
                  setUnassignedImages(prev => prev.filter(u => u !== url));
                  return;
                }
                
                if (data) {
                  const deleted = await deleteImage(data.id);
                  if (deleted) {
                    // Remove from local unassigned images state
                    setUnassignedImages(prev => prev.filter(u => u !== url));
                  }
                } else {
                  // Image not in DB yet - just remove from local state
                  setUnassignedImages(prev => prev.filter(u => u !== url));
                }
              }}
              onSaveGroups={async () => {
                if (!selectedBatchId || isConfirmingGrouping) return;
                
                setIsConfirmingGrouping(true);
                
                // Capture undo snapshot BEFORE making changes
                await majorActionUndo.captureAllBatchImages('confirm_grouping', 'Confirm Grouping');
                
                
                try {
                  // Build current state: image URL -> product ID (or null for unassigned)
                  const currentAssignments = new Map<string, string | null>();
                  
                  // Track images currently in groups
                  for (const group of imageGroups) {
                    for (const url of group.images) {
                      if (!url || url.trim() === '') continue;
                      currentAssignments.set(url, group.productId);
                    }
                  }
                  
                  // Track unassigned images
                  for (const url of unassignedImages) {
                    if (!url || url.trim() === '') continue;
                    currentAssignments.set(url, null);
                  }
                  
                  // Detect changes: compare current vs initial
                  const changedImages: { url: string; newProductId: string | null }[] = [];
                  const newTempGroups: { productId: string; images: string[] }[] = [];
                  
                  for (const [url, currentProductId] of currentAssignments) {
                    const initialProductId = initialImageAssignments.get(url) ?? null;
                    
                    // Skip if no change
                    if (currentProductId === initialProductId) continue;
                    
                    // Skip if image no longer exists (was deleted during session)
                    if (!url || url.trim() === '') continue;
                    
                    // Check if this is a temp group (new product needs to be created)
                    const isNewTempGroup = currentProductId && currentProductId.startsWith('temp-');
                    
                    if (isNewTempGroup) {
                      // Collect images for new temp groups
                      const existingTemp = newTempGroups.find(g => g.productId === currentProductId);
                      if (existingTemp) {
                        existingTemp.images.push(url);
                      } else {
                        newTempGroups.push({ productId: currentProductId!, images: [url] });
                      }
                    } else {
                      // Image moved to existing product or unassigned
                      changedImages.push({ url, newProductId: currentProductId });
                    }
                  }
                  
                  // Count total changes
                  const totalChanges = changedImages.length + newTempGroups.length;
                  
                  if (totalChanges === 0) {
                    toast.info('No changes to save.');
                    setShowGroupManager(false);
                    setIsConfirmingGrouping(false);
                    return;
                  }
                  
                  toast.info(`Saving ${totalChanges} change(s)...`);
                  
                  // 1. Create new products for temp groups (in parallel)
                  const createdProducts: string[] = [];
                  const tempToRealProductMap = new Map<string, string>();
                  
                  if (newTempGroups.length > 0) {
                    const createPromises = newTempGroups.map(async (tempGroup) => {
                      const validImages = tempGroup.images.filter(url => url && url.trim() !== '');
                      if (validImages.length === 0) return null;
                      
                      try {
                        const product = await createProductWithImages(validImages);
                        if (product) {
                          tempToRealProductMap.set(tempGroup.productId, product.id);
                          return product.id;
                        }
                      } catch (error) {
                        console.error('Error creating product:', error);
                      }
                      return null;
                    });
                    
                    const results = await Promise.all(createPromises);
                    results.forEach(id => { if (id) createdProducts.push(id); });
                  }
                  
                  // 2. Update image assignments for moves to existing products (in parallel)
                  if (changedImages.length > 0) {
                    const updatePromises = changedImages.map(async ({ url, newProductId }, index) => {
                      try {
                        await updateImageProductIdByUrl(url, newProductId, index);
                      } catch (error) {
                        console.error('Error updating image:', error);
                      }
                    });
                    
                    await Promise.all(updatePromises);
                  }
                  
                  // 3. Clean up empty products (non-blocking)
                  deleteEmptyProducts().catch(err => console.error('Cleanup error:', err));
                  
                  // Clear group management state
                  setImageGroups([]);
                  setUnassignedImages([]);
                  setPendingImageUrls([]);
                  setShowGroupManager(false);
                  setInitialImageAssignments(new Map());
                  
                  // Clear image cache and refresh
                  clearCache();
                  await refetchProducts();
                  
                  const savedCount = createdProducts.length + (changedImages.length > 0 ? 1 : 0);
                  toast.success(`Saved ${createdProducts.length} new product(s), updated ${changedImages.length} image(s).`);
                  
                } catch (error) {
                  console.error('Error in Confirm Grouping:', error);
                  toast.error('Failed to save grouping. Please try again.');
                } finally {
                  setIsConfirmingGrouping(false);
                }
              }}
              showGroupManager={showGroupManager}
              onToggleGroupManager={() => setShowGroupManager(prev => !prev)}
              onAddToUnassigned={(urls) => {
                setUnassignedImages(prev => [...prev, ...urls]);
                setShowGroupManager(true);
              }}
              onMoveImageBetweenProducts={handleMoveImageBetweenProducts}
              onMoveImagesById={handleMoveImagesByIdStandalone}
              onReorderProductImages={handleReorderProductImages}
              onLoadAllImagesIntoGroups={handleLoadAllImagesIntoGroups}
              onRegroupSelectedProducts={handleRegroupSelectedProducts}
              onRegroupUnassigned={handleRegroupUnassigned}
              onSmartMatch={handleSmartMatch}
              isMatching={isMatching}
              matchingProgress={matchingProgress}
              isConfirmingGrouping={isConfirmingGrouping}
              undoStackLength={undoStack.length}
              onGlobalUndo={handleGlobalUndo}
              lastUndoLabel={undoStack.length > 0 ? undoStack[undoStack.length - 1].label : undefined}
              // Major action undo (database-level)
              hasMajorActionUndo={majorActionUndo.hasUndoAvailable}
              majorActionUndoLabel={majorActionUndo.undoLabel}
              majorActionUndoRemaining={majorActionUndo.undoRemainingSeconds}
              isMajorActionUndoing={majorActionUndo.isUndoing}
              onMajorActionUndo={async () => {
                const success = await majorActionUndo.executeUndo();
                if (success) {
                  clearCache();
                  await refetchProducts();
                }
              }}
              deletedProductsCount={deletedProducts.length}
              deletedImagesCount={deletedImages.length}
              hiddenProductsCount={hiddenProducts.length}
              onOpenDeletedProducts={() => setShowDeletedProducts(true)}
              onOpenDeletedImages={() => setShowDeletedImages(true)}
              onOpenHiddenProducts={() => setShowHiddenProducts(true)}
              showHiddenInline={showHiddenInline}
              onToggleShowHiddenInline={() => setShowHiddenInline(prev => !prev)}
              onUnhideProduct={async (productId) => {
                await unhideProduct(productId);
                refetchProducts();
                refetchHiddenProducts();
              }}
              onDeleteEmptyProducts={handleDeleteEmptyProducts}
              onCreateProductFromImageIds={handleCreateProductFromImageIds}
              onCameraCapture={handleCameraCapture}
              onQuickProductCapture={handleQuickProductCapture}
              onExpandProductImages={handleExpandProductImages}
              isExpandingImages={isExpandingImages}
              imageRefreshKey={imageRefreshKey}
              onToggleGroupLock={async (productId: string) => {
                const group = imageGroups.find(g => g.productId === productId);
                if (!group) return;
                const newLockState = !group.isGrouped;
                // Update database
                await updateProduct(productId, { is_grouped: newLockState });
                // Update local state
                setImageGroups(prev => prev.map(g => 
                  g.productId === productId ? { ...g, isGrouped: newLockState } : g
                ));
                toast.success(newLockState ? 'Group confirmed (locked)' : 'Group unlocked');
              }}
              onRefreshProducts={refetchProducts}
              onCreateProductFromUrls={handleCreateProductFromUrls}
            />
          ) : (
            <EmptyState />
          )}
        </div>
      </div>

      {/* Product detail panel - wrapped in error boundary to prevent crashes */}
      {editingProduct && (
        <ErrorBoundary 
          fallbackMessage="Unable to load the product editor. Please close and try again."
          showHomeButton={false}
        >
          <ProductDetailPanel
            product={editingProduct}
            images={editingProductImages}
            batchId={selectedBatchId || ''}
            onClose={() => setEditingProductId(null)}
            onSave={handleSaveProduct}
            onUpdateImage={handleUpdateImage}
            onReorderImages={handleReorderImages}
            onDeleteImage={handleDeleteImageFromProduct}
            onMoveImages={handleMoveImagesById}
            otherProducts={products}
            onGenerateAI={handleGenerateProductAI}
            onCreateInShopify={handleCreateSingleProductInShopify}
            onPrevious={() => navigateProduct('prev')}
            onNext={() => navigateProduct('next')}
            hasPrevious={hasPrevious}
            hasNext={hasNext}
            isGenerating={isGenerating || isGeneratingDetailPanel}
            regeneratingField={regeneratingField}
            isCreatingShopify={isCreatingShopify}
            isShopifyConfigured={!!isShopifyConfigured}
            onMarkAsUploaded={(shopifyProductId) => handleMarkAsUploaded(editingProductId, shopifyProductId)}
            onMarkAsPending={() => handleMarkAsPending(editingProductId)}
          />
        </ErrorBoundary>
      )}

      {/* Shopify Success Dialog */}
      <ShopifySuccessDialog
        open={shopifySuccessData !== null}
        onClose={() => setShopifySuccessData(null)}
        successCount={shopifySuccessData?.successCount || 0}
        errorCount={shopifySuccessData?.errorCount || 0}
        storeUrl={settings?.shopify_store_url || undefined}
      />

      {/* Deleted Products Panel */}
      <DeletedProductsPanel
        open={showDeletedProducts}
        onClose={() => setShowDeletedProducts(false)}
        deletedProducts={deletedProducts}
        onRecover={recoverProduct}
        onPermanentDelete={permanentlyDeleteProduct}
        onEmptyTrash={emptyTrash}
        onProductsChanged={() => {
          refetchProducts();
          refetchDeletedProducts();
        }}
      />

      {/* Deleted Images Panel */}
      <DeletedImagesPanel
        open={showDeletedImages}
        onClose={() => setShowDeletedImages(false)}
        deletedImages={deletedImages}
        onRecover={recoverImage}
        onPermanentDelete={permanentlyDeleteImage}
        onEmptyTrash={emptyImageTrash}
        onRecoverAll={recoverAllImages}
        onImagesChanged={() => {
          refetchProducts();
          refetchDeletedImages();
          clearCache();
        }}
      />

      {/* Hidden Products Panel */}
      <HiddenProductsPanel
        open={showHiddenProducts}
        onClose={() => setShowHiddenProducts(false)}
        hiddenProducts={hiddenProducts}
        onUnhide={unhideProduct}
        onUnhideAll={async () => {
          for (const p of hiddenProducts) {
            await unhideProduct(p.id);
          }
        }}
        onProductsChanged={() => {
          refetchProducts();
          refetchHiddenProducts();
        }}
      />

      {/* Shopify Upload Warning Dialog */}
      <AlertDialog 
        open={shopifyWarningData?.show ?? false} 
        onOpenChange={(open) => !open && setShopifyWarningData(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Some items are missing details</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Missing details: <strong>{shopifyWarningData?.missingCount ?? 0} / {shopifyWarningData?.totalCount ?? 0}</strong> items
              </p>
              <p className="text-muted-foreground text-sm">
                (e.g. size, era, material, brand, pit-to-pit)
              </p>
              <p>Upload anyway?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShopifyWarningData(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (shopifyWarningData?.productIds) {
                  handleCreateInShopify(shopifyWarningData.productIds);
                }
                setShopifyWarningData(null);
              }}
            >
              Upload Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
