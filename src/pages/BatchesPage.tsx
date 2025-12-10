import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { BatchList } from '@/components/batches/BatchList';
import { BatchDetail } from '@/components/batches/BatchDetail';
import { EmptyState } from '@/components/batches/EmptyState';
import { ProductDetailPanel } from '@/components/products/ProductDetailPanel';
import {
  getBatches,
  getBatch,
  createBatch,
  updateBatch,
  deleteBatch,
  getProductsByBatch,
  getProduct,
  createProduct,
  updateProduct,
  getImagesByProduct,
  addImage,
  updateImage,
  excludeLastNImagesFromShopify,
  getSettings,
} from '@/lib/store';
import type { Batch, Product, ProductImage } from '@/types';

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[]>(getBatches());
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCreatingShopify, setIsCreatingShopify] = useState(false);
  const [pendingImages, setPendingImages] = useState<{ file: File; url: string }[]>([]);

  const refreshBatches = useCallback(() => {
    setBatches(getBatches());
  }, []);

  const refreshProducts = useCallback((batchId: string) => {
    setProducts(getProductsByBatch(batchId));
  }, []);

  const handleSelectBatch = useCallback((id: string) => {
    setSelectedBatchId(id);
    setSelectedProductIds(new Set());
    refreshProducts(id);
  }, [refreshProducts]);

  const handleCreateBatch = useCallback((name: string, notes: string) => {
    const batch = createBatch(name, notes);
    refreshBatches();
    handleSelectBatch(batch.id);
    toast.success('Batch created');
  }, [refreshBatches, handleSelectBatch]);

  const handleUpdateBatch = useCallback((id: string, name: string, notes: string) => {
    updateBatch(id, { name, notes });
    refreshBatches();
    toast.success('Batch updated');
  }, [refreshBatches]);

  const handleDeleteBatch = useCallback((id: string) => {
    deleteBatch(id);
    if (selectedBatchId === id) {
      setSelectedBatchId(null);
      setProducts([]);
    }
    refreshBatches();
    toast.success('Batch deleted');
  }, [selectedBatchId, refreshBatches]);

  const handleUploadImages = useCallback((files: File[]) => {
    const newImages = files.map(file => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setPendingImages(prev => [...prev, ...newImages]);
    toast.success(`${files.length} image(s) uploaded. Click "Auto-group" to create products.`);
  }, []);

  const handleAutoGroup = useCallback((imagesPerProduct: number) => {
    if (!selectedBatchId) return;
    if (pendingImages.length === 0) {
      toast.error('No images to group. Upload images first.');
      return;
    }

    const settings = getSettings();
    const chunks: { file: File; url: string }[][] = [];
    
    for (let i = 0; i < pendingImages.length; i += imagesPerProduct) {
      chunks.push(pendingImages.slice(i, i + imagesPerProduct));
    }

    let productNumber = products.length + 1;
    
    chunks.forEach((chunk) => {
      const sku = `BATCH-${selectedBatchId.slice(0, 6)}-${String(productNumber).padStart(3, '0')}`;
      const product = createProduct(selectedBatchId, sku);
      
      chunk.forEach((img, index) => {
        addImage(product.id, img.url, index + 1);
      });
      
      productNumber++;
    });

    setPendingImages([]);
    refreshProducts(selectedBatchId);
    toast.success(`Created ${chunks.length} product(s) from ${pendingImages.length} images`);
  }, [selectedBatchId, pendingImages, products.length, refreshProducts]);

  const handleGenerateAll = useCallback(async () => {
    if (!selectedBatchId || products.length === 0) return;
    
    setIsGenerating(true);
    // Simulate AI generation - in production this would call the AI service
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    products.forEach(product => {
      const images = getImagesByProduct(product.id);
      // Mock AI generation
      updateProduct(product.id, {
        status: 'generated',
        title: `Vintage ${product.sku} Item`,
        description: 'A beautiful vintage piece in excellent condition. Perfect for adding a unique touch to your wardrobe.',
        garment_type: 'sweater',
        department: 'Women',
        condition: 'Good – light wear',
        shopify_tags: 'vintage, retro, knitwear',
        etsy_tags: 'vintage sweater, retro knitwear, 90s fashion, thrift find, sustainable fashion',
      });
    });
    
    refreshProducts(selectedBatchId);
    setIsGenerating(false);
    toast.success(`AI generated details for ${products.length} product(s)`);
  }, [selectedBatchId, products, refreshProducts]);

  const handleExcludeLast2All = useCallback(() => {
    if (!selectedBatchId) return;
    
    products.forEach(product => {
      excludeLastNImagesFromShopify(product.id, 2);
    });
    
    toast.success('Excluded last 2 images from Shopify for all products');
  }, [selectedBatchId, products]);

  const handleCreateInShopify = useCallback(async (productIds: string[]) => {
    setIsCreatingShopify(true);
    
    // Simulate Shopify creation - in production this would call the Shopify API
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    let successCount = 0;
    let errorCount = 0;
    
    productIds.forEach(id => {
      const product = getProduct(id);
      if (product) {
        // Simulate success/failure
        if (Math.random() > 0.1) {
          updateProduct(id, {
            status: 'created_in_shopify',
            shopify_product_id: `gid://shopify/Product/${Date.now()}`,
            shopify_handle: product.title?.toLowerCase().replace(/\s+/g, '-') || product.sku,
          });
          successCount++;
        } else {
          updateProduct(id, { status: 'error' });
          errorCount++;
        }
      }
    });
    
    if (selectedBatchId) {
      refreshProducts(selectedBatchId);
    }
    setSelectedProductIds(new Set());
    setIsCreatingShopify(false);
    
    if (errorCount > 0) {
      toast.warning(`Created ${successCount} product(s) in Shopify. ${errorCount} failed.`);
    } else {
      toast.success(`Created ${successCount} product(s) in Shopify`);
    }
  }, [selectedBatchId, refreshProducts]);

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

  const handleSaveProduct = useCallback((updates: Partial<Product>) => {
    if (!editingProductId) return;
    updateProduct(editingProductId, updates);
    if (selectedBatchId) {
      refreshProducts(selectedBatchId);
    }
  }, [editingProductId, selectedBatchId, refreshProducts]);

  const handleUpdateImage = useCallback((imageId: string, updates: Partial<ProductImage>) => {
    updateImage(imageId, updates);
  }, []);

  const handleReorderImages = useCallback((imageId: string, newPosition: number) => {
    if (!editingProductId) return;
    
    const images = getImagesByProduct(editingProductId);
    const movingImage = images.find(i => i.id === imageId);
    if (!movingImage) return;
    
    const oldPosition = movingImage.position;
    
    images.forEach(img => {
      if (img.id === imageId) {
        updateImage(img.id, { position: newPosition });
      } else if (oldPosition < newPosition) {
        if (img.position > oldPosition && img.position <= newPosition) {
          updateImage(img.id, { position: img.position - 1 });
        }
      } else {
        if (img.position >= newPosition && img.position < oldPosition) {
          updateImage(img.id, { position: img.position + 1 });
        }
      }
    });
  }, [editingProductId]);

  const handleGenerateProductAI = useCallback(async () => {
    if (!editingProductId) return;
    
    setIsGenerating(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const product = getProduct(editingProductId);
    if (product) {
      updateProduct(editingProductId, {
        status: 'generated',
        title: product.title || `Vintage ${product.garment_type || 'Item'} – ${product.department || 'Unisex'}`,
        description: product.description || 'A beautiful vintage piece in excellent condition.',
        shopify_tags: product.shopify_tags || 'vintage, retro',
        etsy_tags: product.etsy_tags || 'vintage, retro fashion, thrift find',
      });
    }
    
    if (selectedBatchId) {
      refreshProducts(selectedBatchId);
    }
    setIsGenerating(false);
    toast.success('AI generation complete');
  }, [editingProductId, selectedBatchId, refreshProducts]);

  const editingProduct = editingProductId ? getProduct(editingProductId) : null;
  const editingProductImages = editingProductId ? getImagesByProduct(editingProductId) : [];
  
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

  const selectedBatch = selectedBatchId ? getBatch(selectedBatchId) : null;

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
          />
        </div>

        {/* Main content */}
        <div className="flex-1">
          {selectedBatch ? (
            <BatchDetail
              batch={selectedBatch}
              products={products}
              getProductImages={getImagesByProduct}
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
        />
      )}
    </AppLayout>
  );
}
