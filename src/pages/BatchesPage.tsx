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
import { ImageGroup, MatchingProgress } from '@/components/batches/ImageGroupManager';
import { 
  useBatches, 
  useProducts, 
  useImages, 
  useSettings, 
  useImageUpload,
  useDeletedProducts,
  generateListingBlock,
  UPLOAD_LIMITS,
} from '@/hooks/use-database';
import { useDefaultTags } from '@/hooks/use-default-tags';
import { useAIGeneration } from '@/hooks/use-ai-generation';
import type { Product, ProductImage } from '@/types';

export default function BatchesPage() {
  const { batches, createBatch, updateBatch, deleteBatch, getProductCount } = useBatches();
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const { products, createProduct, createProductWithImages, updateProduct, deleteProduct, deleteEmptyProducts, refetch: refetchProducts } = useProducts(selectedBatchId);
  const { deletedProducts, recoverProduct, permanentlyDelete: permanentlyDeleteProduct, emptyTrash, refetch: refetchDeletedProducts } = useDeletedProducts(selectedBatchId);
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
  
  // Initialize AI generated status when products load
  useEffect(() => {
    if (products.length > 0) {
      aiGeneration.initializeAIGeneratedStatus(products);
    }
  }, [products]);
  
  // Deleted products panel state
  const [showDeletedProducts, setShowDeletedProducts] = useState(false);
  
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingProductImages, setEditingProductImages] = useState<ProductImage[]>([]);
  const [regeneratingField, setRegeneratingField] = useState<string | null>(null);
  const [isCreatingShopify, setIsCreatingShopify] = useState(false);
  const [pendingImageUrls, setPendingImageUrls] = useState<string[]>([]);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});
  const [shopifySuccessData, setShopifySuccessData] = useState<{ successCount: number; errorCount: number } | null>(null);
  
  // Use AI generation state from hook
  const isGenerating = aiGeneration.isGenerating;
  const generationProgress = aiGeneration.generationProgress;

  // Image group management state
  const [imageGroups, setImageGroups] = useState<ImageGroup[]>([]);
  const [unassignedImages, setUnassignedImages] = useState<string[]>([]);
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [matchingProgress, setMatchingProgress] = useState<MatchingProgress>({ current: 0, total: 0, currentBatch: 0, totalBatches: 0 });
  
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
        return;
      }
      
      // Fetch all images for the batch
      const allBatchImages = await fetchImagesForBatch(selectedBatchId);
      
      if (allBatchImages.length === 0) {
        setUnassignedImages([]);
        setImageGroups([]);
        return;
      }
      
      // Group images by product_id
      const imagesByProduct: Record<string, string[]> = {};
      const unassigned: string[] = [];
      
      for (const img of allBatchImages) {
        if (img.product_id && img.product_id !== '') {
          if (!imagesByProduct[img.product_id]) {
            imagesByProduct[img.product_id] = [];
          }
          imagesByProduct[img.product_id].push(img.url);
        } else {
          unassigned.push(img.url);
        }
      }
      
      // Create groups from existing products that have images
      const groups: ImageGroup[] = products
        .filter(p => imagesByProduct[p.id] && imagesByProduct[p.id].length > 0)
        .map((product, index) => ({
          productId: product.id,
          productNumber: index + 1,
          images: imagesByProduct[product.id] || [],
          selectedImages: new Set<string>(),
        }));
      
      setImageGroups(groups);
      setUnassignedImages(unassigned);
      
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
      // Save images to database immediately (not assigned to any product yet)
      for (let i = 0; i < urls.length; i++) {
        await addImageToBatch(selectedBatchId, urls[i], i);
      }
      
      if (addToUnassigned) {
        // Add directly to unassigned pool
        setUnassignedImages(prev => [...prev, ...urls]);
        setShowGroupManager(true);
        toast.success(`${urls.length} image(s) added to unassigned pool.`);
      } else {
        // Add to pending for auto-grouping
        setPendingImageUrls(prev => [...prev, ...urls]);
        toast.success(`${urls.length} image(s) uploaded. Click "Auto-group" to create products.`);
      }
    } else {
      toast.error('Failed to upload images');
    }
  }, [selectedBatchId, uploadImages, addImageToBatch]);

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

    setImageGroups(newGroups);
    setUnassignedImages([]);
    setPendingImageUrls([]);
    setShowGroupManager(true);
    toast.success(`Created ${chunks.length} group(s). Review and adjust, then confirm.`);
  }, [selectedBatchId, pendingImageUrls, products.length, imageGroups, unassignedImages, saveUndoState]);

  // Re-auto-group all images (from existing groups + unassigned + pending)
  const handleReAutoGroupAll = useCallback((imagesPerProduct: number) => {
    // Collect all images from all sources
    const allImages: string[] = [
      ...imageGroups.flatMap(g => g.images),
      ...unassignedImages,
      ...pendingImageUrls,
    ];

    if (allImages.length === 0) {
      toast.error('No images to group.');
      return;
    }

    // Save current state for undo
    saveUndoState({
      type: 'group_change',
      label: 'Before re-group all',
      imageGroups: imageGroups.map(g => ({ ...g, selectedImages: new Set(g.selectedImages) })),
      unassignedImages: [...unassignedImages],
    });

    // Create new groups from all collected images
    const chunks: string[][] = [];
    for (let i = 0; i < allImages.length; i += imagesPerProduct) {
      chunks.push(allImages.slice(i, i + imagesPerProduct));
    }

    const newGroups: ImageGroup[] = chunks.map((chunk, index) => ({
      productId: `temp-${Date.now()}-${index}`,
      productNumber: index + 1,
      images: chunk,
      selectedImages: new Set<string>(),
    }));

    setImageGroups(newGroups);
    setUnassignedImages([]);
    setPendingImageUrls([]);
    setShowGroupManager(true);
    toast.success(`Re-grouped into ${chunks.length} product(s). Review and adjust, then confirm.`);
  }, [imageGroups, unassignedImages, pendingImageUrls, saveUndoState]);

  // Load all images from products into group manager view
  const handleLoadAllImagesIntoGroups = useCallback(async () => {
    if (!selectedBatchId) return;
    
    // Fetch all images for the batch
    const allBatchImages = await fetchImagesForBatch(selectedBatchId);
    
    if (allBatchImages.length === 0) {
      toast.error('No images found in this batch.');
      return;
    }
    
    // Group images by product_id
    const imagesByProduct: Record<string, string[]> = {};
    const unassigned: string[] = [];
    
    for (const img of allBatchImages) {
      if (img.product_id && img.product_id !== '') {
        if (!imagesByProduct[img.product_id]) {
          imagesByProduct[img.product_id] = [];
        }
        imagesByProduct[img.product_id].push(img.url);
      } else {
        unassigned.push(img.url);
      }
    }
    
    // Create groups from existing products that have images
    const groups: ImageGroup[] = products
      .filter(p => imagesByProduct[p.id] && imagesByProduct[p.id].length > 0)
      .map((product, index) => ({
        productId: product.id,
        productNumber: index + 1,
        images: imagesByProduct[product.id] || [],
        selectedImages: new Set<string>(),
      }));
    
    setImageGroups(groups);
    setUnassignedImages(unassigned);
    setShowGroupManager(true);
    
    const totalImages = allBatchImages.length;
    const assignedCount = totalImages - unassigned.length;
    toast.success(`Loaded ${totalImages} images (${assignedCount} assigned, ${unassigned.length} unassigned)`);
  }, [selectedBatchId, fetchImagesForBatch, products]);

  // Regroup selected products - collect their images and re-chunk them
  const handleRegroupSelectedProducts = useCallback(async (productIds: string[], imagesPerProduct: number) => {
    if (productIds.length === 0) {
      toast.error('No products selected to regroup.');
      return;
    }

    // Fetch images for all selected products
    const allImages: string[] = [];
    for (const productId of productIds) {
      const images = await fetchImagesForProduct(productId);
      allImages.push(...images.map(img => img.url));
    }

    if (allImages.length === 0) {
      toast.error('No images found in selected products.');
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

    // Delete the old products
    for (const productId of productIds) {
      await deleteProduct(productId);
    }

    // Clear selection
    setSelectedProductIds(new Set());

    setImageGroups(newGroups);
    setUnassignedImages([]);
    setShowGroupManager(true);
    toast.success(`Re-grouped ${allImages.length} images into ${chunks.length} product(s). Review and confirm.`);
  }, [fetchImagesForProduct, deleteProduct]);

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

  const handleCreateInShopify = useCallback(async (productIds: string[]) => {
    if (!settings?.shopify_store_url) {
      toast.error('Shopify store URL is not configured. Go to Settings to add it.');
      return;
    }

    setIsCreatingShopify(true);
    
    try {
      // Prepare products and images for the edge function
      const productsToCreate = productIds
        .map(id => products.find(p => p.id === id))
        .filter(Boolean) as Product[];
      
      // Fetch images for all products (only those marked for Shopify)
      const imagesMap: Record<string, { url: string; position: number }[]> = {};
      for (const product of productsToCreate) {
        const allImages = await fetchImagesForProduct(product.id);
        imagesMap[product.id] = allImages
          .filter(img => img.include_in_shopify)
          .map(img => ({ url: img.url, position: img.position }));
      }
      
      // Prepare product payloads with description
      const productPayloads = productsToCreate.map(p => ({
        id: p.id,
        title: p.title,
        description: p.description_style_a || p.description || '',
        price: p.price,
        currency: p.currency,
        sku: p.sku,
        brand: p.brand,
        garment_type: p.garment_type,
        shopify_tags: p.shopify_tags,
        collections_tags: p.collections_tags,
      }));
      
      // Call the edge function
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-shopify-product`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
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
          });
        } else {
          await updateProduct(result.productId, { status: 'error' });
        }
      }
      
      setSelectedProductIds(new Set());
      
      // Show success dialog
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
  useEffect(() => {
    if (products.length === 0) {
      setSelectedProductIds(new Set());
      return;
    }
    
    const validProductIds = new Set(products.map(p => p.id));
    setSelectedProductIds(prev => {
      const validSelection = new Set<string>();
      prev.forEach(id => {
        if (validProductIds.has(id)) {
          validSelection.add(id);
        }
      });
      // Only update if something changed
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

  const handleGenerateProductAI = useCallback(async (regenerateOnly?: 'title' | 'style_a' | 'style_b' | 'all') => {
    if (!editingProductId) return;
    
    const product = products.find(p => p.id === editingProductId);
    if (!product) return;
    
    if (regenerateOnly && regenerateOnly !== 'all') {
      setRegeneratingField(regenerateOnly);
    }
    
    try {
      // Get product images for AI context
      const images = await fetchImagesForProduct(editingProductId);
      const imageUrls = images.slice(0, 2).map(img => img.url);
      
      // Call the edge function
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-listing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ 
          product, 
          imageUrls,
          regenerateOnly: regenerateOnly === 'all' ? undefined : regenerateOnly
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Generation failed');
      }
      
      const data = await response.json();
      const generated = data.generated;
      
      // Update product with generated content
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
      }
      
      await updateProduct(editingProductId, updates);
      toast.success(regenerateOnly && regenerateOnly !== 'all' ? `${regenerateOnly.replace('_', ' ')} regenerated` : 'AI generation complete');
      
    } catch (error) {
      console.error('Generation error:', error);
      toast.error(error instanceof Error ? error.message : 'Generation failed');
    } finally {
      setRegeneratingField(null);
    }
  }, [editingProductId, products, updateProduct, fetchImagesForProduct]);

  const getProductImagesCallback = useCallback(async (productId: string) => {
    return await fetchImagesForProduct(productId);
  }, [fetchImagesForProduct]);

  const handleCreateSingleProductInShopify = useCallback(async () => {
    if (!editingProductId) return;
    await handleCreateInShopify([editingProductId]);
  }, [editingProductId, handleCreateInShopify]);

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
    
    toast.success('Image moved successfully');
  }, [fetchImagesForProduct, clearCache, refetchProducts, deleteEmptyProducts]);

  // Handler for moving multiple images by ID from detail panel
  const handleMoveImagesById = useCallback(async (imageIds: string[], targetProductId: string) => {
    if (!editingProductId || imageIds.length === 0) return;
    
    try {
      // Get the count of images in the target product to set starting position
      const targetImages = await fetchImagesForProduct(targetProductId);
      let nextPosition = targetImages.length;

      for (const imageId of imageIds) {
        const { error } = await supabase
          .from('images')
          .update({ product_id: targetProductId, position: nextPosition })
          .eq('id', imageId);

        if (error) {
          console.error('Error moving image:', error);
          continue;
        }
        nextPosition++;
      }

      // Refresh images for both products
      clearCache();
      const updatedImages = await fetchImagesForProduct(editingProductId);
      setEditingProductImages(updatedImages);
      await refetchProducts();
      
      // AUTO-CLEANUP: Delete the source product if it became empty
      await deleteEmptyProducts();
      
      toast.success(`${imageIds.length} image(s) moved successfully`);
    } catch (error) {
      console.error('Error moving images:', error);
      toast.error('Failed to move images');
    }
  }, [editingProductId, fetchImagesForProduct, clearCache, refetchProducts, deleteEmptyProducts]);

  // Standalone handler for moving images by ID (used in birds eye view)
  const handleMoveImagesByIdStandalone = useCallback(async (imageIds: string[], targetProductId: string) => {
    if (imageIds.length === 0) return;
    
    try {
      // Get the count of images in the target product to set starting position
      const targetImages = await fetchImagesForProduct(targetProductId);
      let nextPosition = targetImages.length;

      for (const imageId of imageIds) {
        const { error } = await supabase
          .from('images')
          .update({ product_id: targetProductId, position: nextPosition })
          .eq('id', imageId);

        if (error) {
          console.error('Error moving image:', error);
          continue;
        }
        nextPosition++;
      }

      // Clear cache and refetch
      clearCache();
      await refetchProducts();
      
      // AUTO-CLEANUP: Delete any source products that became empty
      await deleteEmptyProducts();
      
      toast.success(`${imageIds.length} image(s) moved`);
    } catch (error) {
      console.error('Error moving images:', error);
      toast.error('Failed to move images');
    }
  }, [fetchImagesForProduct, clearCache, refetchProducts, deleteEmptyProducts]);

  // Handler for creating a new product from selected image IDs (used in Birds Eye View)
  // This creates a REAL product in the database and moves images to it
  const handleCreateProductFromImageIds = useCallback(async (imageIds: string[]): Promise<string | null> => {
    if (!selectedBatchId || imageIds.length === 0) {
      toast.warning('No images selected');
      return null;
    }

    try {
      // Step 1: Fetch current user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('You must be logged in');
        return null;
      }

      // Step 2: Create a new product
      const timestamp = Date.now();
      const sku = `SKU-${timestamp}-${Math.random().toString(36).substr(2, 6)}`;

      const { data: productData, error: productError } = await supabase
        .from('products')
        .insert({
          batch_id: selectedBatchId,
          sku,
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

      // Step 3: Move all selected images to the new product
      let movedCount = 0;
      for (let i = 0; i < imageIds.length; i++) {
        const { error } = await supabase
          .from('images')
          .update({ product_id: newProductId, position: i })
          .eq('id', imageIds[i]);

        if (!error) {
          movedCount++;
        } else {
          console.error('Error moving image:', error);
        }
      }

      // Step 4: Safety check - delete product if no images were moved
      if (movedCount === 0) {
        await supabase.from('products').delete().eq('id', newProductId);
        toast.error('Failed to move images to new product');
        return null;
      }

      // Step 5: Clean up empty source products
      clearCache();
      await refetchProducts();
      await deleteEmptyProducts();

      console.log(`Created product ${newProductId} with ${movedCount} images from Birds Eye View`);
      return newProductId;
    } catch (error) {
      console.error('Error creating product from images:', error);
      toast.error('Failed to create product');
      return null;
    }
  }, [selectedBatchId, clearCache, refetchProducts, deleteEmptyProducts]);
  
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
              onCreateInShopify={handleCreateInShopify}
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
                const { data } = await supabase
                  .from('images')
                  .select('id')
                  .eq('url', url)
                  .single();
                if (data) {
                  await deleteImage(data.id);
                }
              }}
              onSaveGroups={async () => {
                if (!selectedBatchId) return;
                
                // GUARD: Filter out empty groups - never create products with 0 images
                const validGroups = imageGroups.filter(group => {
                  const validImages = group.images.filter(url => url && url.trim() !== '');
                  return validImages.length > 0;
                });
                
                // Count skipped empty groups
                const skippedCount = imageGroups.length - validGroups.length;
                
                if (validGroups.length === 0) {
                  toast.error('No valid image groups to save. Each product needs at least 1 image.');
                  return;
                }
                
                if (skippedCount > 0) {
                  toast.warning(`Skipping ${skippedCount} empty group(s) - products must have at least 1 image.`);
                }
                
                // Save groups to database - create products and assign images
                toast.info('Saving groups...');
                
                let savedCount = 0;
                const createdProductIds = new Set<string>(); // Track to prevent duplicates
                
                for (const group of validGroups) {
                  // Triple-check valid images (critical guard)
                  const validImages = group.images.filter(url => url && url.trim() !== '');
                  if (validImages.length === 0) {
                    console.warn('Skipping group with no valid images:', group.productId);
                    continue;
                  }
                  
                  try {
                    // USE THE ENFORCED SINGLE FUNCTION: createProductWithImages
                    // This ensures product + images are created atomically
                    const product = await createProductWithImages(validImages);
                    
                    if (product && !createdProductIds.has(product.id)) {
                      createdProductIds.add(product.id);
                      savedCount++;
                    }
                  } catch (error) {
                    console.error('Error creating product with images:', error);
                    // Continue to next group even if one fails
                  }
                }
                
                // Handle unassigned images - keep them in database but not linked to products
                // They're already saved, just not assigned
                
                // Clear group management state
                setImageGroups([]);
                setUnassignedImages([]);
                setPendingImageUrls([]);
                setShowGroupManager(false);
                
                // Clear image cache to force refresh
                clearCache();
                
                // Refresh products
                await refetchProducts();
                
                toast.success(`Saved ${savedCount} product(s) successfully`);
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
              undoStackLength={undoStack.length}
              onGlobalUndo={handleGlobalUndo}
              lastUndoLabel={undoStack.length > 0 ? undoStack[undoStack.length - 1].label : undefined}
              deletedProductsCount={deletedProducts.length}
              onOpenDeletedProducts={() => setShowDeletedProducts(true)}
              onDeleteEmptyProducts={handleDeleteEmptyProducts}
              onCreateProductFromImageIds={handleCreateProductFromImageIds}
            />
          ) : (
            <EmptyState />
          )}
        </div>
      </div>

      {/* Product detail panel */}
      {editingProduct && (
        <ProductDetailPanel
          product={editingProduct}
          images={editingProductImages}
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
          isGenerating={isGenerating}
          regeneratingField={regeneratingField}
          isCreatingShopify={isCreatingShopify}
          isShopifyConfigured={!!isShopifyConfigured}
        />
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
    </AppLayout>
  );
}
