import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { BatchList } from '@/components/batches/BatchList';
import { BatchDetail } from '@/components/batches/BatchDetail';
import { EmptyState } from '@/components/batches/EmptyState';
import { ProductDetailPanel } from '@/components/products/ProductDetailPanel';
import { 
  useBatches, 
  useProducts, 
  useImages, 
  useSettings, 
  useImageUpload,
  generateListingBlock,
  UPLOAD_LIMITS,
} from '@/hooks/use-database';
import type { Product, ProductImage } from '@/types';

export default function BatchesPage() {
  const { batches, createBatch, updateBatch, deleteBatch, getProductCount } = useBatches();
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const { products, createProduct, updateProduct, refetch: refetchProducts } = useProducts(selectedBatchId);
  const { fetchImagesForProduct, addImage, updateImage, excludeLastNImages, clearCache } = useImages();
  const { settings } = useSettings();
  const { uploadImages, uploading, progress } = useImageUpload();
  
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingProductImages, setEditingProductImages] = useState<ProductImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [regeneratingField, setRegeneratingField] = useState<string | null>(null);
  const [isCreatingShopify, setIsCreatingShopify] = useState(false);
  const [pendingImageUrls, setPendingImageUrls] = useState<string[]>([]);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});

  // Fetch product counts for batches
  useEffect(() => {
    const fetchCounts = async () => {
      const counts: Record<string, number> = {};
      for (const batch of batches) {
        counts[batch.id] = await getProductCount(batch.id);
      }
      setProductCounts(counts);
    };
    fetchCounts();
  }, [batches, getProductCount, products]);

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
  }, []);

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

  const handleUploadImages = useCallback(async (files: File[]) => {
    if (!selectedBatchId) return;
    
    // Show warning for large batches
    if (files.length > UPLOAD_LIMITS.WARNING_THRESHOLD) {
      toast.warning(`Large batches may slow down processing. For best results, upload in batches of ${UPLOAD_LIMITS.RECOMMENDED_IMAGES_PER_BATCH} images.`);
    }
    
    toast.info(`Uploading ${files.length} image(s)...`);
    
    const urls = await uploadImages(files, selectedBatchId);
    
    if (urls.length > 0) {
      setPendingImageUrls(prev => [...prev, ...urls]);
      toast.success(`${urls.length} image(s) uploaded. Click "Auto-group" to create products.`);
    } else {
      toast.error('Failed to upload images');
    }
  }, [selectedBatchId, uploadImages]);

  const handleAutoGroup = useCallback(async (imagesPerProduct: number) => {
    if (!selectedBatchId) return;
    if (pendingImageUrls.length === 0) {
      toast.error('No images to group. Upload images first.');
      return;
    }

    const chunks: string[][] = [];
    for (let i = 0; i < pendingImageUrls.length; i += imagesPerProduct) {
      chunks.push(pendingImageUrls.slice(i, i + imagesPerProduct));
    }

    let productNumber = products.length + 1;
    
    for (const chunk of chunks) {
      const sku = `BATCH-${selectedBatchId.slice(0, 6)}-${String(productNumber).padStart(3, '0')}`;
      const product = await createProduct(sku);
      
      if (product) {
        for (let i = 0; i < chunk.length; i++) {
          await addImage(product.id, selectedBatchId, chunk[i], i + 1);
        }
      }
      productNumber++;
    }

    setPendingImageUrls([]);
    clearCache();
    toast.success(`Created ${chunks.length} product(s) from ${pendingImageUrls.length} images`);
  }, [selectedBatchId, pendingImageUrls, products.length, createProduct, addImage, clearCache]);

  const handleGenerateAll = useCallback(async () => {
    if (!selectedBatchId || products.length === 0) return;
    
    // Show warning for large product counts
    if (products.length > UPLOAD_LIMITS.RECOMMENDED_PRODUCTS_FOR_AI) {
      toast.warning(`For stability, consider generating AI in groups of ${UPLOAD_LIMITS.RECOMMENDED_PRODUCTS_FOR_AI} products or fewer.`);
    }
    
    setIsGenerating(true);
    
    // Simulate AI generation - in production this would call the AI service
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    for (const product of products) {
      await updateProduct(product.id, {
        status: 'generated',
        title: `Vintage ${product.sku} Item`,
        description: 'A beautiful vintage piece in excellent condition. Perfect for adding a unique touch to your wardrobe.',
        garment_type: 'sweater',
        department: 'Women',
        condition: 'Good – light wear',
        shopify_tags: 'vintage, retro, knitwear',
        etsy_tags: 'vintage sweater, retro knitwear, 90s fashion, thrift find, sustainable fashion',
      });
    }
    
    setIsGenerating(false);
    toast.success(`AI generated details for ${products.length} product(s)`);
  }, [selectedBatchId, products, updateProduct]);

  const handleExcludeLast2All = useCallback(async () => {
    if (!selectedBatchId) return;
    
    for (const product of products) {
      await excludeLastNImages(product.id, 2);
    }
    
    clearCache();
    toast.success('Excluded last 2 images from Shopify for all products');
  }, [selectedBatchId, products, excludeLastNImages, clearCache]);

  const handleCreateInShopify = useCallback(async (productIds: string[]) => {
    setIsCreatingShopify(true);
    
    // Simulate Shopify creation - in production this would call the Shopify API
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const id of productIds) {
      const product = products.find(p => p.id === id);
      if (product) {
        // Simulate success/failure
        if (Math.random() > 0.1) {
          await updateProduct(id, {
            status: 'created_in_shopify',
            shopify_product_id: `gid://shopify/Product/${Date.now()}`,
            shopify_handle: product.title?.toLowerCase().replace(/\s+/g, '-') || product.sku,
          });
          successCount++;
        } else {
          await updateProduct(id, { status: 'error' });
          errorCount++;
        }
      }
    }
    
    setSelectedProductIds(new Set());
    setIsCreatingShopify(false);
    
    if (errorCount > 0) {
      toast.warning(`Created ${successCount} product(s) in Shopify. ${errorCount} failed.`);
    } else {
      toast.success(`Created ${successCount} product(s) in Shopify`);
    }
  }, [products, updateProduct]);

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
    await updateImage(imageId, editingProductId, updates);
    // Refresh images
    const images = await fetchImagesForProduct(editingProductId);
    setEditingProductImages(images);
  }, [editingProductId, updateImage, fetchImagesForProduct]);

  const handleReorderImages = useCallback(async (imageId: string, newPosition: number) => {
    if (!editingProductId) return;
    
    const oldPosition = editingProductImages.find(i => i.id === imageId)?.position || 0;
    
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
  }, [editingProductId, editingProductImages, updateImage, clearCache, fetchImagesForProduct]);

  const handleGenerateProductAI = useCallback(async (regenerateOnly?: 'title' | 'style_a' | 'style_b' | 'all') => {
    if (!editingProductId) return;
    
    const product = products.find(p => p.id === editingProductId);
    if (!product) return;
    
    setIsGenerating(true);
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
      setIsGenerating(false);
      setRegeneratingField(null);
    }
  }, [editingProductId, products, updateProduct, fetchImagesForProduct]);

  const getProductImagesCallback = useCallback(async (productId: string) => {
    return await fetchImagesForProduct(productId);
  }, [fetchImagesForProduct]);

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
      <div className="h-full flex">
        {/* Batch list sidebar */}
        <div className="w-72 flex-shrink-0">
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
        <div className="flex-1">
          {selectedBatch ? (
            <BatchDetail
              batch={selectedBatch}
              products={products}
              getProductImages={getProductImagesCallback}
              onUploadImages={handleUploadImages}
              onAutoGroup={handleAutoGroup}
              onGenerateAll={handleGenerateAll}
              onExcludeLast2All={handleExcludeLast2All}
              onCreateInShopify={handleCreateInShopify}
              onEditProduct={setEditingProductId}
              onToggleProductSelection={handleToggleProductSelection}
              selectedProductIds={selectedProductIds}
              isGenerating={isGenerating}
              isCreatingShopify={isCreatingShopify}
              pendingImageCount={pendingImageUrls.length}
              isUploading={uploading}
              uploadProgress={progress}
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
          onGenerateAI={handleGenerateProductAI}
          onPrevious={() => navigateProduct('prev')}
          onNext={() => navigateProduct('next')}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          isGenerating={isGenerating}
          regeneratingField={regeneratingField}
        />
      )}
    </AppLayout>
  );
}
