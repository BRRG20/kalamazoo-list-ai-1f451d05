import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useShopifyStats } from '@/hooks/use-shopify-stats';
import { useBackgroundRemoval, type ShadowType, type BackgroundRemovalOptions } from '@/hooks/use-background-removal';
import { useModelTryOn, type PoseType, type FitStyle, type OutfitStyle } from '@/hooks/use-model-tryon';
import { useImageExpansion } from '@/hooks/use-image-expansion';
import { ModelTryOnDialog } from '@/components/model-tryon/ModelTryOnDialog';
import { BatchCaptureButton, QuickProductShotsButton } from '@/components/camera/QuickProductShotsButton';
import {
  Upload, 
  Sparkles, 
  ImageMinus, 
  ShoppingBag, 
  Grid3X3,
  Loader2,
  AlertCircle,
  Image as ImageIcon,
  ArrowLeft,
  X,
  EyeOff,
  Eye,
  Trash2,
  Settings2,
  Plus,
  RefreshCw,
  Search,
  LayoutGrid,
  MoreVertical,
  Layers,
  Undo2,
  HelpCircle,
  Info,
  ChevronDown,
  Eraser,
  Shirt,
  User,
  Wand2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { BATCH_SIZE_OPTIONS, BatchSizeOption } from '@/hooks/use-ai-generation';
import { ProductCard } from './ProductCard';
import { ImageGroupManager, ImageGroup, MatchingProgress } from './ImageGroupManager';
import { BirdsEyeView } from './BirdsEyeView';
import { useSettings } from '@/hooks/use-database';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ExpandModeDialog, type ExpandMode } from './ExpandModeDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Batch, Product, ProductImage } from '@/types';

interface BatchDetailProps {
  batch: Batch;
  products: Product[];
  getProductImages: (productId: string) => Promise<ProductImage[]>;
  onUploadImages: (files: File[], addToUnassigned?: boolean) => void;
  onAutoGroup: (imagesPerProduct: number) => void;
  onReAutoGroupAll: (imagesPerProduct: number) => void;
  onGenerateAll: () => void;
  onGenerateBulk: (batchSize?: number) => void;
  onGenerateSingleProduct: (productId: string) => void;
  onUndoSingleProduct: (productId: string) => void;
  onUndoBulkGeneration?: () => void;
  isProductGenerating: (productId: string) => boolean;
  hasProductUndoState: (productId: string) => boolean;
  unprocessedCount: number;
  hasBulkUndoState: boolean;
  lastBulkCount: number;
  // Batch size controls
  batchSize: BatchSizeOption;
  onBatchSizeChange: (size: BatchSizeOption) => void;
  onExcludeLast2All: () => void;
  onCreateInShopify: (productIds: string[]) => void;
  onClearFailedStatus?: (productIds: string[]) => void;
  onEditProduct: (productId: string) => void;
  onDeleteProduct: (productId: string) => void;
  onToggleProductSelection: (productId: string) => void;
  onBulkSelectProducts?: (productIds: string[]) => void;
  onSelectAllProducts: () => void;
  onDeselectAllProducts: () => void;
  selectedProductIds: Set<string>;
  isGenerating: boolean;
  generationProgress: { current: number; total: number };
  isCreatingShopify: boolean;
  pendingImageUrls: string[];
  onRemovePendingImage: (index: number) => void;
  onClearAllPendingImages: () => void;
  isUploading: boolean;
  uploadProgress: number;
  uploadStartTime: number | null;
  uploadTotal: number;
  uploadCompleted: number;
  onBack?: () => void;
  // New props for image group management
  imageGroups: ImageGroup[];
  unassignedImages: string[];
  onUpdateImageGroups: (groups: ImageGroup[]) => void;
  onUpdateUnassignedImages: (images: string[]) => void;
  onCreateNewGroup: (images: string[]) => void;
  onDeleteGroup: (productId: string) => void;
  onDeleteImage: (url: string) => void;
  onSaveGroups: () => void;
  showGroupManager: boolean;
  onToggleGroupManager: () => void;
  onAddToUnassigned: (urls: string[]) => void;
  onMoveImageBetweenProducts?: (imageUrl: string, fromProductId: string, toProductId: string) => void;
  onMoveImagesById?: (imageIds: string[], targetProductId: string) => void;
  onReorderProductImages?: (productId: string, imageIds: string[]) => void;
  onLoadAllImagesIntoGroups?: () => void;
  onRegroupSelectedProducts?: (productIds: string[], imagesPerProduct: number) => void;
  onRegroupUnassigned?: (imagesPerProduct: number) => void;
  onSmartMatch?: () => Promise<void>;
  isMatching?: boolean;
  matchingProgress?: MatchingProgress;
  isConfirmingGrouping?: boolean;
  // Global undo (local preview state)
  undoStackLength?: number;
  onGlobalUndo?: () => void;
  lastUndoLabel?: string;
  // Major action undo (database-level)
  hasMajorActionUndo?: boolean;
  majorActionUndoLabel?: string | null;
  majorActionUndoRemaining?: number;
  isMajorActionUndoing?: boolean;
  onMajorActionUndo?: () => void;
  // Deleted products/images
  deletedProductsCount?: number;
  deletedImagesCount?: number;
  onOpenDeletedProducts?: () => void;
  onOpenDeletedImages?: () => void;
  // Hidden products
  hiddenProductsCount?: number;
  onOpenHiddenProducts?: () => void;
  // Inline hidden products filter
  showHiddenInline?: boolean;
  onToggleShowHiddenInline?: () => void;
  // Unhide product
  onUnhideProduct?: (productId: string) => void;
  // Empty products cleanup
  onDeleteEmptyProducts?: (productIds: string[]) => Promise<void>;
  // Create product from image IDs (for Birds Eye View)
  onCreateProductFromImageIds?: (imageIds: string[]) => Promise<string | null>;
  // Shopify status override
  onMarkAsUploaded?: (productId: string, shopifyProductId?: string) => void;
  onMarkAsPending?: (productId: string) => void;
  // Hide product
  onHideProduct?: (productId: string, showToast?: boolean) => void;
  // Delete single image by ID (for ProductCard)
  onDeleteImageById?: (imageId: string, productId: string) => Promise<void>;
  // Camera capture handlers
  onCameraCapture?: (files: File[], notes: Map<string, { note?: string; hasStain?: boolean; type?: string }>) => void;
  onQuickProductCapture?: (files: File[], notes: Map<string, { note?: string; hasStain?: boolean; type?: string }>) => void;
  // AI Image Expansion - now requires mode selection
  onExpandProductImages?: (productIds: string | string[], mode: 'product_photos' | 'ai_model') => void;
  isExpandingImages?: boolean;
  // Check if products have model images for AI Model expansion mode
  getProductHasModelImage?: (productId: string) => boolean;
  // Force refresh images - increment to force refetch
  imageRefreshKey?: number;
  // Toggle group lock (confirm/unlock individual group)
  onToggleGroupLock?: (productId: string) => void;
  // Manual sync - refresh products and images from server
  onRefreshProducts?: () => Promise<void>;
  // Create product directly from image URLs (immediate DB persist)
  onCreateProductFromUrls?: (urls: string[]) => Promise<string | null>;
}

export function BatchDetail({
  batch,
  products,
  getProductImages,
  onUploadImages,
  onAutoGroup,
  onReAutoGroupAll,
  onGenerateAll,
  onGenerateBulk,
  onGenerateSingleProduct,
  onUndoSingleProduct,
  onUndoBulkGeneration,
  batchSize,
  onBatchSizeChange,
  isProductGenerating,
  hasProductUndoState,
  unprocessedCount,
  hasBulkUndoState,
  lastBulkCount,
  onExcludeLast2All,
  onCreateInShopify,
  onClearFailedStatus,
  onEditProduct,
  onDeleteProduct,
  onToggleProductSelection,
  onBulkSelectProducts,
  onSelectAllProducts,
  onDeselectAllProducts,
  selectedProductIds,
  isGenerating,
  generationProgress,
  isCreatingShopify,
  pendingImageUrls,
  onRemovePendingImage,
  onClearAllPendingImages,
  isUploading,
  uploadProgress,
  uploadStartTime,
  uploadTotal,
  uploadCompleted,
  onBack,
  imageGroups,
  unassignedImages,
  onUpdateImageGroups,
  onUpdateUnassignedImages,
  onCreateNewGroup,
  onDeleteGroup,
  onDeleteImage,
  onSaveGroups,
  showGroupManager,
  onToggleGroupManager,
  onAddToUnassigned,
  onMoveImageBetweenProducts,
  onMoveImagesById,
  onReorderProductImages,
  onLoadAllImagesIntoGroups,
  onRegroupSelectedProducts,
  onRegroupUnassigned,
  onSmartMatch,
  isMatching,
  matchingProgress,
  isConfirmingGrouping,
  undoStackLength = 0,
  onGlobalUndo,
  lastUndoLabel,
  hasMajorActionUndo = false,
  majorActionUndoLabel,
  majorActionUndoRemaining = 0,
  isMajorActionUndoing = false,
  onMajorActionUndo,
  deletedProductsCount = 0,
  onOpenDeletedProducts,
  deletedImagesCount,
  onOpenDeletedImages,
  hiddenProductsCount = 0,
  onOpenHiddenProducts,
  showHiddenInline,
  onToggleShowHiddenInline,
  onUnhideProduct,
  onDeleteEmptyProducts,
  onCreateProductFromImageIds,
  onMarkAsUploaded,
  onMarkAsPending,
  onHideProduct,
  onDeleteImageById,
  onCameraCapture,
  onQuickProductCapture,
  onExpandProductImages,
  isExpandingImages,
  getProductHasModelImage,
  imageRefreshKey,
  onToggleGroupLock,
  onRefreshProducts,
  onCreateProductFromUrls,
}: BatchDetailProps) {
  // Early return if batch is missing (defensive guard)
  if (!batch || !batch.id) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-muted-foreground">No batch selected or batch not found.</p>
          {onBack && (
            <Button variant="outline" onClick={onBack} className="mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to batches
            </Button>
          )}
        </div>
      </div>
    );
  }
  
  const { settings, isShopifyConfigured } = useSettings();
  const { isProcessing: isRemovingBg, progress: bgRemovalProgress, removeBackgroundBulk, applyGhostMannequinBulk, getUndoMap, canUndo: canUndoBgRemoval } = useBackgroundRemoval();
  const { isProcessing: isModelProcessing, progress: modelProgress, processBulk: processModelBulk, getModels } = useModelTryOn();
  const [bgUndoData, setBgUndoData] = useState<Map<string, { imageId: string; originalUrl: string; newUrl: string }[]>>(new Map());
  const [ghostUndoData, setGhostUndoData] = useState<Map<string, { imageId: string; originalUrl: string; newUrl: string }[]>>(new Map());
  const [modelUndoData, setModelUndoData] = useState<Map<string, { imageId: string; originalUrl: string; newUrl: string }[]>>(new Map());
  const [isGhostProcessing, setIsGhostProcessing] = useState(false);
  const [ghostProgress, setGhostProgress] = useState({ current: 0, total: 0 });
  const [bgRemovalOptions, setBgRemovalOptions] = useState<BackgroundRemovalOptions>({ secondPass: false, shadow: 'none' });
  const [imagesPerProduct, setImagesPerProduct] = useState(settings?.default_images_per_product || 9);
  const [productImages, setProductImages] = useState<Record<string, ProductImage[]>>({});
  const [imagesLoading, setImagesLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showBirdsEyeView, setShowBirdsEyeView] = useState(false);
  const [bulkSelectKey, setBulkSelectKey] = useState(0);
  
  // Pagination: Load more - show 20 products initially for performance
  const PRODUCTS_PER_PAGE = 20;
  const [displayCount, setDisplayCount] = useState(PRODUCTS_PER_PAGE);
  const [showInfoDialog, setShowInfoDialog] = useState(false);
  const [showModelTryOnDialog, setShowModelTryOnDialog] = useState(false);
  const [showExpandModeDialog, setShowExpandModeDialog] = useState(false);
  const [regeneratingModelProductId, setRegeneratingModelProductId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shopifyConfigured = isShopifyConfigured();
  
  // Get available models for the dropdown
  const availableModels = getModels();
  
  // Track last fetched batch to prevent unnecessary refetches
  const lastFetchedRef = useRef<string>('');

  // Undo history state
  interface HistoryState {
    imageGroups: ImageGroup[];
    unassignedImages: string[];
    label: string;
  }
  const [history, setHistory] = useState<HistoryState[]>([]);

  // Save current state to history before making changes
  const saveToHistory = useCallback((label: string) => {
    setHistory(prev => [...prev.slice(-9), {
      imageGroups: imageGroups.map(g => ({ ...g, selectedImages: new Set(g.selectedImages) })),
      unassignedImages: [...unassignedImages],
      label
    }]);
  }, [imageGroups, unassignedImages]);

  // Undo last action
  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const lastState = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    onUpdateImageGroups(lastState.imageGroups);
    onUpdateUnassignedImages(lastState.unassignedImages);
  }, [history, onUpdateImageGroups, onUpdateUnassignedImages]);

  // Shopify filter state
  const [shopifyFilter, setShopifyFilter] = useState<'all' | 'uploaded' | 'not_uploaded' | 'failed'>('all');

  // Fetch Shopify stats from database (single source of truth)
  const { stats: shopifyStats } = useShopifyStats(batch.id);
  
  // For filtering, we still need to use local product data
  // but counters come from the database

  // Filter products based on search query and Shopify filter
  // NOTE: is_hidden filter is applied at database level in useProducts hook
  const filteredProducts = products.filter(product => {
    // Apply Shopify filter
    // A product is "uploaded" if it has shopify_product_id OR status is 'created_in_shopify'
    const isUploaded = !!product.shopify_product_id || product.status === 'created_in_shopify';
    const isFailed = product.status === 'error';
    
    if (shopifyFilter === 'uploaded' && !isUploaded) {
      return false;
    }
    if (shopifyFilter === 'not_uploaded' && (isUploaded || isFailed)) {
      return false;
    }
    if (shopifyFilter === 'failed' && !isFailed) {
      return false;
    }

    // Then apply search query
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      product.title?.toLowerCase().includes(query) ||
      product.sku?.toLowerCase().includes(query) ||
      product.brand?.toLowerCase().includes(query) ||
      product.garment_type?.toLowerCase().includes(query) ||
      product.department?.toLowerCase().includes(query) ||
      product.colour_main?.toLowerCase().includes(query)
    );
  });

  // Reset pagination when filter/search changes to show first page
  useEffect(() => {
    setDisplayCount(PRODUCTS_PER_PAGE);
  }, [searchQuery, shopifyFilter]);

  // Paginated products for display (only render what's visible)
  const displayedProducts = filteredProducts.slice(0, displayCount);
  const hasMoreProducts = filteredProducts.length > displayCount;
  const remainingCount = filteredProducts.length - displayCount;

  // Load more products handler
  const handleLoadMore = useCallback(() => {
    setDisplayCount(prev => prev + PRODUCTS_PER_PAGE);
  }, []);
  const handleHideSelected = useCallback(async () => {
    if (selectedProductIds.size === 0 || !onHideProduct) return;
    
    // CRITICAL: Capture IDs upfront to avoid race conditions during iteration
    // The products array changes as each product is hidden, which can cause
    // the selection sync effect to modify selectedProductIds mid-loop
    const idsToHide = Array.from(selectedProductIds);
    const count = idsToHide.length;
    
    // Clear selection FIRST to prevent UI flicker and race conditions
    onDeselectAllProducts();
    
    // Hide each selected product (persisted to database) - suppress individual toasts
    const hidePromises = idsToHide.map(id => onHideProduct(id, false));
    await Promise.all(hidePromises);
    
    // Show one aggregate toast
    toast.success(`${count} product${count > 1 ? 's' : ''} hidden`);
  }, [selectedProductIds, onDeselectAllProducts, onHideProduct]);

  // Update imagesPerProduct when settings load
  useEffect(() => {
    if (settings?.default_images_per_product) {
      setImagesPerProduct(settings.default_images_per_product);
    }
  }, [settings?.default_images_per_product]);

  // Fetch ALL images for the batch in a SINGLE query, then group by product_id
  // This eliminates N+1 queries and dramatically improves performance
  useEffect(() => {
    // Use product IDs in cache key to detect reshuffles (not just length)
    const fetchKey = `${batch.id}:${products.map(p => p.id).join(',')}`;
    
    // Skip if we already fetched for this batch with same product count
    if (lastFetchedRef.current === fetchKey) {
      return;
    }
    
    // Handle empty products case
    if (products.length === 0) {
      setProductImages({});
      setImagesLoading(false);
      lastFetchedRef.current = fetchKey;
      return;
    }
    
    // Mark the key immediately to prevent duplicate fetches
    lastFetchedRef.current = fetchKey;
    
    const fetchAllImages = async () => {
      setImagesLoading(true);
      
      try {
        // SINGLE query to fetch ALL images for the batch (exclude soft-deleted)
        const { data, error } = await supabase
          .from('images')
          .select('*')
          .eq('batch_id', batch.id)
          .is('deleted_at', null)
          .order('position', { ascending: true });
        
        if (error) {
          console.error('Error fetching batch images:', error);
          lastFetchedRef.current = '';
          return;
        }
        
        // Group images by product_id client-side
        const imagesMap: Record<string, ProductImage[]> = {};
        
        // Initialize empty arrays for all products
        for (const product of products) {
          imagesMap[product.id] = [];
        }
        
        // Distribute images to their respective products
        for (const row of data || []) {
          if (row.product_id && imagesMap[row.product_id]) {
            imagesMap[row.product_id].push({
              id: row.id,
              product_id: row.product_id,
              url: row.url,
              thumb_url: row.thumb_url,
              position: row.position,
              include_in_shopify: row.include_in_shopify,
              source: row.source as ProductImage['source'],
            });
          }
        }
        
        setProductImages(imagesMap);
      } catch (error) {
        console.error('Error fetching images:', error);
        lastFetchedRef.current = '';
      } finally {
        setImagesLoading(false);
      }
    };
    
    fetchAllImages();
  }, [batch.id, products]);

  // Reset lastFetchedRef when batch changes to ensure fresh data
  useEffect(() => {
    lastFetchedRef.current = '';
  }, [batch.id]);

  // Listen for external force refresh trigger via imageRefreshKey
  useEffect(() => {
    if (imageRefreshKey && imageRefreshKey > 0) {
      // Force refresh when key changes
      lastFetchedRef.current = '';
      // Trigger a refetch by updating state
      setImagesLoading(true);
      const fetchAllImages = async () => {
        try {
          const { data, error } = await supabase
            .from('images')
            .select('*')
            .eq('batch_id', batch.id)
            .is('deleted_at', null)
            .order('position', { ascending: true });
          
          if (error) {
            console.error('Error refreshing batch images:', error);
            return;
          }
          
          const imagesMap: Record<string, ProductImage[]> = {};
          for (const product of products) {
            imagesMap[product.id] = [];
          }
          
          for (const row of data || []) {
            if (row.product_id && imagesMap[row.product_id]) {
              imagesMap[row.product_id].push({
                id: row.id,
                product_id: row.product_id,
                url: row.url,
                thumb_url: row.thumb_url,
                position: row.position,
                include_in_shopify: row.include_in_shopify,
                source: row.source as ProductImage['source'],
              });
            }
          }
          
          setProductImages(imagesMap);
          lastFetchedRef.current = `${batch.id}:${products.length}`;
        } finally {
          setImagesLoading(false);
        }
      };
      fetchAllImages();
    }
  }, [imageRefreshKey, batch.id, products]);

  // Manual refresh function to force reload images - uses same efficient single query
  const handleRefreshImages = async () => {
    if (products.length === 0) return;
    
    setImagesLoading(true);
    lastFetchedRef.current = ''; // Clear cache to force refetch
    
    try {
      console.log('Refreshing images for batch', batch.id);
      
      // SINGLE query to fetch ALL images for the batch (exclude soft-deleted)
      const { data, error } = await supabase
        .from('images')
        .select('*')
        .eq('batch_id', batch.id)
        .is('deleted_at', null)
        .order('position', { ascending: true });
      
      if (error) {
        console.error('Error refreshing batch images:', error);
        return;
      }
      
      // Group images by product_id client-side
      const imagesMap: Record<string, ProductImage[]> = {};
      
      // Initialize empty arrays for all products
      for (const product of products) {
        imagesMap[product.id] = [];
      }
      
      // Distribute images to their respective products
      let totalImages = 0;
      for (const row of data || []) {
        if (row.product_id && imagesMap[row.product_id]) {
          imagesMap[row.product_id].push({
            id: row.id,
            product_id: row.product_id,
            url: row.url,
            thumb_url: row.thumb_url,
            position: row.position,
            include_in_shopify: row.include_in_shopify,
            source: row.source as ProductImage['source'],
          });
          totalImages++;
        }
      }
      
      console.log('Loaded', totalImages, 'images across', Object.keys(imagesMap).length, 'products');
      setProductImages(imagesMap);
      lastFetchedRef.current = `${batch.id}:${products.map(p => p.id).join(',')}`;
    } catch (error) {
      console.error('Error refreshing images:', error);
    } finally {
      setImagesLoading(false);
    }
  };

  // Manual sync: refresh products + images from server
  const handleManualSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      console.log('[SYNC] Manual sync started');
      
      // Refresh products first (if available)
      if (onRefreshProducts) {
        await onRefreshProducts();
      }
      
      // Then refresh images
      await handleRefreshImages();
      
      toast.success('Synced');
      console.log('[SYNC] Manual sync complete');
    } catch (error) {
      console.error('[SYNC] Manual sync failed:', error);
      toast.error('Sync failed');
    } finally {
      setIsSyncing(false);
    }
  }, [onRefreshProducts]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, addToUnassigned: boolean = false) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onUploadImages(Array.from(files), addToUnassigned);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUploadToUnassigned = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        onUploadImages(Array.from(files), true);
      }
    };
    input.click();
  };

  const handleCreateInShopify = () => {
    const ids = Array.from(selectedProductIds);
    if (ids.length > 0) {
      onCreateInShopify(ids);
    }
  };

  // Bulk background removal for selected products
  const handleBulkBackgroundRemoval = useCallback(async () => {
    if (selectedProductIds.size === 0) return;
    
    // Gather all image URLs and their IDs from selected products
    const imageData: { id: string; url: string; productId: string }[] = [];
    for (const productId of selectedProductIds) {
      const imgs = productImages[productId] || [];
      imgs.forEach(img => {
        imageData.push({ id: img.id, url: img.url, productId });
      });
    }
    
    if (imageData.length === 0) return;
    
    // Store undo data before processing
    const undoEntries: { imageId: string; originalUrl: string; newUrl: string }[] = [];
    
    await removeBackgroundBulk(imageData.map(d => d.url), batch.id, async (originalUrl, newUrl) => {
      // Find the image data for this URL
      const imgInfo = imageData.find(d => d.url === originalUrl);
      if (!imgInfo) return;
      
      // Store for undo
      undoEntries.push({ imageId: imgInfo.id, originalUrl, newUrl });
      
      // Update the image URL in the database
      const { error } = await supabase
        .from('images')
        .update({ url: newUrl })
        .eq('id', imgInfo.id);
      
      if (!error) {
        // Update local state
        setProductImages(prev => {
          const updated = { ...prev };
          for (const productId of Object.keys(updated)) {
            updated[productId] = updated[productId].map(img =>
              img.id === imgInfo.id ? { ...img, url: newUrl } : img
            );
          }
          return updated;
        });
      }
    }, bgRemovalOptions);
    
    // Store undo data for this batch operation
    if (undoEntries.length > 0) {
      setBgUndoData(prev => {
        const next = new Map(prev);
        next.set(batch.id, undoEntries);
        return next;
      });
    }
    
    // Refresh images after completion
    handleRefreshImages();
  }, [selectedProductIds, productImages, batch.id, removeBackgroundBulk]);

  // Undo background removal
  const handleUndoBackgroundRemoval = useCallback(async () => {
    const undoEntries = bgUndoData.get(batch.id);
    if (!undoEntries || undoEntries.length === 0) return;
    
    // Restore original URLs
    for (const entry of undoEntries) {
      await supabase
        .from('images')
        .update({ url: entry.originalUrl })
        .eq('id', entry.imageId);
    }
    
    // Clear undo data
    setBgUndoData(prev => {
      const next = new Map(prev);
      next.delete(batch.id);
      return next;
    });
    
    // Refresh images
    handleRefreshImages();
    toast.success(`Restored ${undoEntries.length} images to original`);
  }, [batch.id, bgUndoData]);

  const hasBgUndoData = bgUndoData.has(batch.id) && (bgUndoData.get(batch.id)?.length || 0) > 0;
  const hasGhostUndoData = ghostUndoData.has(batch.id) && (ghostUndoData.get(batch.id)?.length || 0) > 0;

  // Bulk ghost mannequin for selected products
  const handleBulkGhostMannequin = useCallback(async () => {
    if (selectedProductIds.size === 0) return;
    
    // Gather all image URLs and their IDs from selected products
    const imageData: { id: string; url: string; productId: string }[] = [];
    for (const productId of selectedProductIds) {
      const imgs = productImages[productId] || [];
      imgs.forEach(img => {
        imageData.push({ id: img.id, url: img.url, productId });
      });
    }
    
    if (imageData.length === 0) return;
    
    setIsGhostProcessing(true);
    setGhostProgress({ current: 0, total: imageData.length });
    
    const undoEntries: { imageId: string; originalUrl: string; newUrl: string }[] = [];
    
    await applyGhostMannequinBulk(imageData.map(d => d.url), batch.id, async (originalUrl, newUrl) => {
      const imgInfo = imageData.find(d => d.url === originalUrl);
      if (!imgInfo) return;
      
      undoEntries.push({ imageId: imgInfo.id, originalUrl, newUrl });
      setGhostProgress(prev => ({ ...prev, current: prev.current + 1 }));
      
      const { error } = await supabase
        .from('images')
        .update({ url: newUrl })
        .eq('id', imgInfo.id);
      
      if (!error) {
        setProductImages(prev => {
          const updated = { ...prev };
          for (const productId of Object.keys(updated)) {
            updated[productId] = updated[productId].map(img =>
              img.id === imgInfo.id ? { ...img, url: newUrl } : img
            );
          }
          return updated;
        });
      }
    });
    
    if (undoEntries.length > 0) {
      setGhostUndoData(prev => {
        const next = new Map(prev);
        next.set(batch.id, undoEntries);
        return next;
      });
    }
    
    setIsGhostProcessing(false);
    handleRefreshImages();
  }, [selectedProductIds, productImages, batch.id, applyGhostMannequinBulk]);

  // Undo ghost mannequin
  const handleUndoGhostMannequin = useCallback(async () => {
    const undoEntries = ghostUndoData.get(batch.id);
    if (!undoEntries || undoEntries.length === 0) return;
    
    for (const entry of undoEntries) {
      await supabase
        .from('images')
        .update({ url: entry.originalUrl })
        .eq('id', entry.imageId);
    }
    
    setGhostUndoData(prev => {
      const next = new Map(prev);
      next.delete(batch.id);
      return next;
    });
    
    handleRefreshImages();
    toast.success(`Restored ${undoEntries.length} images to original`);
  }, [batch.id, ghostUndoData]);

  const hasModelUndoData = modelUndoData.has(batch.id) && (modelUndoData.get(batch.id)?.length || 0) > 0;

  // Bulk model try-on for selected products - ADDS ONE model image per product (using first image as reference)
  const handleBulkModelTryOn = useCallback(async (
    modelId: string, 
    poseId: PoseType, 
    fitStyle: FitStyle,
    styleOutfit: boolean,
    outfitStyle: OutfitStyle
  ) => {
    if (selectedProductIds.size === 0) return;
    
    // Get current user for RLS
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('You must be logged in to use this feature');
      return;
    }
    
    // Only use FIRST image from each product for model try-on (one model image per product)
    const imageData: { id: string; url: string; productId: string }[] = [];
    for (const productId of selectedProductIds) {
      const imgs = productImages[productId] || [];
      if (imgs.length > 0) {
        // Sort by position and take the first image only
        const sortedImgs = [...imgs].sort((a, b) => (a.position || 0) - (b.position || 0));
        const firstImg = sortedImgs[0];
        imageData.push({ id: firstImg.id, url: firstImg.url, productId });
      }
    }
    if (imageData.length === 0) return;
    
    setShowModelTryOnDialog(false);
    const addedImageIds: string[] = [];
    
    await processModelBulk(imageData, batch.id, modelId, poseId, fitStyle, styleOutfit, outfitStyle, async (originalUrl, newUrl) => {
      const imgInfo = imageData.find(d => d.url === originalUrl);
      if (!imgInfo) return;
      
      // Shift existing images to make room at position 0
      const currentImages = productImages[imgInfo.productId] || [];
      if (currentImages.length > 0) {
        // Increment all existing image positions by 1
        for (const existingImg of currentImages) {
          await supabase
            .from('images')
            .update({ position: (existingImg.position || 0) + 1 })
            .eq('id', existingImg.id);
        }
      }
      
      // INSERT new model image at position 0 (front of card)
      const { data: newImage, error } = await supabase
        .from('images')
        .insert({
          url: newUrl,
          product_id: imgInfo.productId,
          batch_id: batch.id,
          position: 0,
          include_in_shopify: true,
          user_id: user.id,
          source: 'model_tryon'
        })
        .select()
        .single();
      
      if (!error && newImage) {
        addedImageIds.push(newImage.id);
        // Update local state - add new image at front and shift others
        setProductImages(prev => {
          const updated = { ...prev };
          const typedImage = { ...newImage, source: newImage.source as ProductImage['source'] };
          if (updated[imgInfo.productId]) {
            const shifted = updated[imgInfo.productId].map(img => ({
              ...img,
              position: (img.position || 0) + 1
            }));
            updated[imgInfo.productId] = [typedImage, ...shifted];
          } else {
            updated[imgInfo.productId] = [typedImage];
          }
          return updated;
        });
      } else if (error) {
        console.error('Failed to insert model image:', error);
      }
    });
    
    if (addedImageIds.length > 0) {
      // Store added image IDs for undo (we'll delete them on undo)
      setModelUndoData(prev => { 
        const next = new Map(prev); 
        next.set(batch.id, addedImageIds.map(id => ({ imageId: id, originalUrl: '', newUrl: '' }))); 
        return next; 
      });
      toast.success(`Added ${addedImageIds.length} model image(s) to ${selectedProductIds.size} product(s)`);
    }
    
    handleRefreshImages();
  }, [selectedProductIds, productImages, batch.id, processModelBulk]);

  // Undo model try-on - DELETE the added images
  const handleUndoModelTryOn = useCallback(async () => {
    const undoEntries = modelUndoData.get(batch.id);
    if (!undoEntries?.length) return;
    
    const imageIdsToDelete = undoEntries.map(e => e.imageId);
    
    // Delete the added model images from database
    const { error } = await supabase
      .from('images')
      .delete()
      .in('id', imageIdsToDelete);
    
    if (!error) {
      // Remove from local state
      setProductImages(prev => {
        const updated = { ...prev };
        for (const productId of Object.keys(updated)) {
          updated[productId] = updated[productId].filter(img => !imageIdsToDelete.includes(img.id));
        }
        return updated;
      });
    }
    
    setModelUndoData(prev => { const next = new Map(prev); next.delete(batch.id); return next; });
    handleRefreshImages();
    toast.success(`Removed ${undoEntries.length} model images`);
  }, [batch.id, modelUndoData]);

  // Regenerate AI model style for a single product
  const handleRegenerateModelStyle = useCallback(async (productId: string) => {
    const imgs = productImages[productId] || [];
    
    // Find the model try-on image to regenerate
    const modelImage = imgs.find(img => img.source === 'model_tryon');
    if (!modelImage) {
      toast.error('No AI model image found to regenerate');
      return;
    }
    
    // Find an original product image to use as source
    const sourceImage = imgs.find(img => img.source !== 'model_tryon' && img.source !== 'ai_expansion');
    if (!sourceImage) {
      toast.error('No original product image found for regeneration');
      return;
    }
    
    // Get product department for auto model selection
    const product = products.find(p => p.id === productId);
    const department = product?.department || 'Men';
    
    // Auto-select model based on department
    const defaultModel = department === 'Women' 
      ? availableModels.find(m => m.gender === 'female') 
      : availableModels.find(m => m.gender === 'male');
    const modelId = defaultModel?.id || availableModels[0]?.id;
    
    if (!modelId) {
      toast.error('No AI model available for regeneration');
      return;
    }
    
    setRegeneratingModelProductId(productId);
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/model-tryon`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            garmentImageUrl: sourceImage.url,
            modelId,
            poseId: 'front_neutral',
            fitStyle: 'regular',
            styleOutfit: true,
            outfitStyle: 'stylish_casual',
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        if (response.status === 429) {
          toast.error('Rate limit exceeded. Please wait and try again.');
        } else if (response.status === 402) {
          toast.error('AI credits exhausted. Please add credits.');
        } else {
          toast.error(errorData.error || 'Model regeneration failed');
        }
        return;
      }

      const data = await response.json();
      const newUrl = data.processedImageUrl;
      
      if (newUrl) {
        // Update the existing model image URL in database
        const { error } = await supabase
          .from('images')
          .update({ url: newUrl })
          .eq('id', modelImage.id);
        
        if (!error) {
          // Update local state
          setProductImages(prev => ({
            ...prev,
            [productId]: prev[productId].map(img => 
              img.id === modelImage.id ? { ...img, url: newUrl } : img
            )
          }));
          toast.success('AI model style regenerated');
        } else {
          toast.error('Failed to save regenerated image');
        }
      }
    } catch (error) {
      console.error('Model regeneration error:', error);
      toast.error('Failed to regenerate model style');
    } finally {
      setRegeneratingModelProductId(null);
    }
  }, [productImages, products, availableModels]);

  return (
    <div className="min-h-full flex flex-col">
      {/* Model Try-On Dialog */}
      <ModelTryOnDialog
        open={showModelTryOnDialog}
        onOpenChange={setShowModelTryOnDialog}
        onConfirm={handleBulkModelTryOn}
        isProcessing={isModelProcessing}
        imageCount={Array.from(selectedProductIds).reduce((acc, pid) => acc + (productImages[pid]?.length || 0), 0)}
      />
      {/* Header */}
      <div className="p-3 md:p-4 border-b border-border bg-card">
        <div className="flex items-center gap-3 mb-3 md:mb-4">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="md:hidden flex-shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg md:text-xl font-semibold text-foreground truncate">{batch.name}</h2>
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowInfoDialog(true)}
                    >
                      <Info className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>Learn about the workflow</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {batch.notes && (
              <p className="text-sm text-muted-foreground mt-0.5 truncate">{batch.notes}</p>
            )}
          </div>
        </div>

        {/* Upload progress */}
        {isUploading && (
          <div className="mb-4 p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">
                  Uploading {uploadCompleted} of {uploadTotal} images...
                </span>
              </div>
              {uploadStartTime && uploadCompleted > 0 && (
                <span className="text-sm text-muted-foreground">
                  {(() => {
                    const elapsed = (Date.now() - uploadStartTime) / 1000;
                    const rate = uploadCompleted / elapsed;
                    const remaining = (uploadTotal - uploadCompleted) / rate;
                    if (remaining < 60) {
                      return `~${Math.ceil(remaining)}s remaining`;
                    }
                    return `~${Math.ceil(remaining / 60)}m remaining`;
                  })()}
                </span>
              )}
            </div>
            <Progress value={uploadProgress} className="h-2" />
          </div>
        )}

        {/* AI generation progress */}
        {isGenerating && generationProgress.total > 0 && (
          <div className="mb-4 p-3 bg-primary/10 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm text-foreground">
                Generating AI... {generationProgress.current} of {generationProgress.total} products
              </span>
            </div>
            <Progress value={(generationProgress.current / generationProgress.total) * 100} className="h-2" />
          </div>
        )}

        {/* Pending images preview */}
        {pendingImageUrls.length > 0 && !isUploading && (
          <div className="mb-4 p-3 bg-primary/10 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-primary" />
                <span className="text-sm text-foreground font-medium">
                  {pendingImageUrls.length} image(s) ready to group
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearAllPendingImages}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 px-2"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Clear all
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {pendingImageUrls.map((url, index) => (
                <div key={index} className="relative group">
                  <img
                    src={url}
                    alt={`Pending ${index + 1}`}
                    className="w-14 h-14 object-cover rounded border border-border"
                  />
                  <button
                    onClick={() => onRemovePendingImage(index)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Set images per product above and click "Auto-group" to create products.
            </p>
          </div>
        )}

        {/* Actions bar */}
        <TooltipProvider delayDuration={300}>
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFileChange(e, false)}
            />
            
            {/* Upload buttons group */}
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="text-xs md:text-sm"
                  >
                    {isUploading ? (
                      <Loader2 className="w-4 h-4 mr-1 md:mr-2 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4 mr-1 md:mr-2" />
                    )}
                    <span className="hidden sm:inline">Upload</span> Images
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Upload product images to this batch (max 500 images)</p>
                </TooltipContent>
              </Tooltip>
              
              {/* Show "Add to Pool" when there are existing groups */}
              {(imageGroups.length > 0 || products.length > 0) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleUploadToUnassigned}
                      disabled={isUploading}
                      className="text-xs md:text-sm text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Add images directly to unassigned pool</p>
                  </TooltipContent>
                </Tooltip>
              )}
              
              {/* Camera Capture Buttons */}
              {onCameraCapture && (
                <BatchCaptureButton
                  onComplete={onCameraCapture}
                  disabled={isUploading}
                />
              )}
              {onQuickProductCapture && (
                <QuickProductShotsButton
                  onComplete={onQuickProductCapture}
                  disabled={isUploading}
                />
              )}
            </div>

            <div className="flex items-center gap-1 md:gap-2">
              <Label htmlFor="imagesPerProduct" className="text-xs md:text-sm whitespace-nowrap hidden sm:inline">
                Per product:
              </Label>
              <Input
                id="imagesPerProduct"
                type="number"
                min={1}
                max={20}
                value={imagesPerProduct}
                onChange={(e) => setImagesPerProduct(parseInt(e.target.value) || 1)}
                className="w-14 md:w-16 h-8 md:h-9 text-sm"
              />
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    saveToHistory('Before auto-group');
                    onAutoGroup(imagesPerProduct);
                  }}
                  disabled={pendingImageUrls.length === 0}
                  className="text-xs md:text-sm"
                >
                  <Grid3X3 className="w-4 h-4 mr-1 md:mr-2" />
                  <span className="hidden sm:inline">Auto-</span>group
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Automatically group pending images into products</p>
              </TooltipContent>
            </Tooltip>

            {/* Re-group All - available when there are existing groups */}
            {(imageGroups.length > 0 || unassignedImages.length > 0) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      saveToHistory('Before re-group all');
                      onReAutoGroupAll(imagesPerProduct);
                    }}
                    className="text-xs md:text-sm text-amber-600 hover:text-amber-700 border-amber-300 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950"
                  >
                    <RefreshCw className="w-4 h-4 mr-1 md:mr-2" />
                    <span className="hidden sm:inline">Re-</span>group All
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Re-distribute all images into new product groups</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Toggle Group Manager */}
            {(imageGroups.length > 0 || unassignedImages.length > 0) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showGroupManager ? "default" : "outline"}
                    size="sm"
                    onClick={onToggleGroupManager}
                    className="text-xs md:text-sm"
                  >
                    <Settings2 className="w-4 h-4 mr-1 md:mr-2" />
                    <span className="hidden sm:inline">Manage</span> Groups
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Manually adjust image groupings before confirming</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Undo button - visible when there's any undo history (local or global) */}
            {(history.length > 0 || undoStackLength > 0) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Prefer local history, fall back to global
                      if (history.length > 0) {
                        handleUndo();
                      } else if (onGlobalUndo) {
                        onGlobalUndo();
                      }
                    }}
                    className="text-xs md:text-sm text-amber-600 hover:text-amber-700 border-amber-300 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950"
                  >
                    <Undo2 className="w-4 h-4 mr-1 md:mr-2" />
                    Undo
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Undo: {history[history.length - 1]?.label || lastUndoLabel || 'last action'}</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Major Action Undo button - always visible, disabled when no undo available */}
            {onMajorActionUndo && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onMajorActionUndo}
                    disabled={!hasMajorActionUndo || isMajorActionUndoing}
                    className={cn(
                      "text-xs md:text-sm",
                      hasMajorActionUndo
                        ? "text-orange-600 hover:text-orange-700 border-orange-300 hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950"
                        : "text-muted-foreground border-border"
                    )}
                  >
                    {isMajorActionUndoing ? (
                      <Loader2 className="w-4 h-4 mr-1 md:mr-2 animate-spin" />
                    ) : (
                      <Undo2 className="w-4 h-4 mr-1 md:mr-2" />
                    )}
                    Undo Action
                    {hasMajorActionUndo && majorActionUndoRemaining > 0 && majorActionUndoRemaining <= 60 && (
                      <span className="ml-1 text-[10px] opacity-70">({Math.floor(majorActionUndoRemaining / 60)}:{(majorActionUndoRemaining % 60).toString().padStart(2, '0')})</span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {hasMajorActionUndo ? (
                    <p>Undo: {majorActionUndoLabel || 'last major action'} (expires in {Math.ceil(majorActionUndoRemaining / 60)} min)</p>
                  ) : (
                    <p>No recent action to undo. Available after Confirm Grouping or moving images.</p>
                  )}
                </TooltipContent>
              </Tooltip>
            )}

            {/* View All Images button - always visible when products exist */}
            {products.length > 0 && onLoadAllImagesIntoGroups && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onLoadAllImagesIntoGroups}
                    className="text-xs md:text-sm"
                  >
                    <ImageIcon className="w-4 h-4 mr-1 md:mr-2" />
                    <span className="hidden sm:inline">View All</span> Images
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>View and manage all images in this batch</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Manual Sync button - refresh products + images from server */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className="text-xs md:text-sm"
                >
                  {isSyncing ? (
                    <Loader2 className="w-4 h-4 mr-1 md:mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-1 md:mr-2" />
                  )}
                  <span className="hidden sm:inline">Manual </span>Sync
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Refresh products and images from server</p>
              </TooltipContent>
            </Tooltip>

            {/* Generate AI with batch size dropdown */}
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => onGenerateBulk(batchSize)}
                    disabled={isGenerating || products.length === 0 || unprocessedCount === 0}
                    className="text-xs md:text-sm rounded-r-none"
                  >
                    {isGenerating ? (
                      <Loader2 className="w-4 h-4 mr-1 md:mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-1 md:mr-2" />
                    )}
                    <span className="hidden sm:inline">Generate</span> AI ({Math.min(batchSize, unprocessedCount)})
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{unprocessedCount > 0 ? `Generate AI for next ${Math.min(batchSize, unprocessedCount)} unprocessed products` : 'All products have been generated'}</p>
                </TooltipContent>
              </Tooltip>
              
              {/* Batch size selector dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    disabled={isGenerating || products.length === 0 || unprocessedCount === 0}
                    className="text-xs md:text-sm rounded-l-none border-l border-primary-foreground/20 px-2"
                  >
                    <MoreVertical className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Batch Size</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {BATCH_SIZE_OPTIONS.map(size => (
                    <DropdownMenuItem
                      key={size}
                      onClick={() => onBatchSizeChange(size)}
                      className={batchSize === size ? 'bg-accent' : ''}
                    >
                      {size} products {batchSize === size && '✓'}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Undo bulk AI generation */}
            {hasBulkUndoState && onUndoBulkGeneration && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onUndoBulkGeneration}
                    disabled={isGenerating}
                    className="text-xs md:text-sm text-amber-600 hover:text-amber-700 border-amber-300 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950"
                  >
                    <Undo2 className="w-4 h-4 mr-1 md:mr-2" />
                    Undo Bulk ({lastBulkCount})
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Restore {lastBulkCount} products to their state before AI generation</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Legacy Generate All button for selected products */}
            {selectedProductIds.size > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onGenerateAll}
                    disabled={isGenerating}
                    className="text-xs md:text-sm"
                  >
                    {isGenerating ? (
                      <Loader2 className="w-4 h-4 mr-1 md:mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-1 md:mr-2" />
                    )}
                    AI Selected ({selectedProductIds.size})
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Generate AI for selected products only</p>
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onExcludeLast2All}
                  disabled={products.length === 0}
                  className="text-xs md:text-sm hidden md:flex"
                >
                  <ImageMinus className="w-4 h-4 mr-2" />
                  Exclude Last 2 Images
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Mark last 2 images of each product to be excluded from Shopify upload</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    // Force refresh images before opening Birds Eye View
                    await handleRefreshImages();
                    setShowBirdsEyeView(true);
                  }}
                  disabled={products.length === 0 || imagesLoading}
                  className="text-xs md:text-sm"
                >
                  <LayoutGrid className="w-4 h-4 mr-1 md:mr-2" />
                  <span className="hidden sm:inline">Birds Eye</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>View all products and images in a grid for easy organization</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefreshImages}
                  disabled={imagesLoading || products.length === 0}
                  className="text-xs md:text-sm"
                >
                  <RefreshCw className={cn("w-4 h-4", imagesLoading && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Refresh all images from database</p>
              </TooltipContent>
            </Tooltip>

            {/* Hidden products button */}
            {onOpenHiddenProducts && hiddenProductsCount > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onOpenHiddenProducts}
                    className="text-xs md:text-sm relative text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                  >
                    <EyeOff className="w-4 h-4" />
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-amber-500 text-white text-xs rounded-full flex items-center justify-center">
                      {hiddenProductsCount}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>View hidden products ({hiddenProductsCount})</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Trash button - show deleted products */}
            {onOpenDeletedProducts && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onOpenDeletedProducts}
                    className="text-xs md:text-sm relative"
                  >
                    <Trash2 className="w-4 h-4" />
                    {deletedProductsCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                        {deletedProductsCount}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>View deleted products</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>

        {/* Shopify row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-3 pt-3 border-t border-border">
          {!shopifyConfigured && (
            <Alert variant="default" className="flex-1">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Shopify not connected. Go to Settings to add store URL and API key.
              </AlertDescription>
            </Alert>
          )}
          
          {shopifyConfigured && (
            <>
              {/* Shopify upload counter */}
              <div className="flex items-center gap-4 mr-auto">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-success">
                    Uploaded: {shopifyStats.uploaded} / {shopifyStats.total}
                  </span>
                  {shopifyStats.failed > 0 && (
                    <>
                      <span className="text-sm text-destructive">
                        • {shopifyStats.failed} failed
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          // Select all failed products for retry
                          const failedIds = products.filter(p => p.status === 'error').map(p => p.id);
                          if (onBulkSelectProducts) {
                            onBulkSelectProducts(failedIds);
                          }
                        }}
                        className="h-6 px-2 text-xs text-amber-600 hover:text-amber-700"
                      >
                        Select for retry
                      </Button>
                      {onClearFailedStatus && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const failedIds = products.filter(p => p.status === 'error').map(p => p.id);
                            onClearFailedStatus(failedIds);
                          }}
                          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                        >
                          Clear failed
                        </Button>
                      )}
                    </>
                  )}
                  <span className="text-sm text-muted-foreground">
                    • {shopifyStats.notUploaded} pending
                  </span>
                  {/* Hide uploaded toggle */}
                  <button
                    onClick={() => setShopifyFilter(prev => prev === 'not_uploaded' ? 'all' : 'not_uploaded')}
                    className={cn(
                      "ml-2 px-2 py-0.5 text-xs rounded-full border transition-colors",
                      shopifyFilter === 'not_uploaded'
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
                    )}
                  >
                    {shopifyFilter === 'not_uploaded' ? '✓ Showing pending only' : 'Hide uploaded'}
                  </button>
                  {/* Show hidden products toggle */}
                  {onToggleShowHiddenInline && hiddenProductsCount > 0 && (
                    <button
                      onClick={onToggleShowHiddenInline}
                      className={cn(
                        "ml-1 px-2 py-0.5 text-xs rounded-full border transition-colors",
                        showHiddenInline
                          ? "bg-amber-500 text-white border-amber-500"
                          : "bg-transparent text-muted-foreground border-border hover:border-amber-500/50"
                      )}
                    >
                      {showHiddenInline ? (
                        <>
                          <Eye className="w-3 h-3 inline mr-1" />
                          {hiddenProductsCount} hidden shown
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3 h-3 inline mr-1" />
                          Show {hiddenProductsCount} hidden
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
              
              <div className="flex flex-col gap-2 w-full">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    {selectedProductIds.size} selected
                  </span>
                  {/* Bulk select dropdown */}
                  <select
                    key={bulkSelectKey}
                    className="h-8 px-2 text-sm rounded-md border border-input bg-background text-foreground cursor-pointer"
                    defaultValue=""
                    onChange={(e) => {
                      const count = parseInt(e.target.value);
                      if (count > 0 && onBulkSelectProducts) {
                        const productIdsToSelect = filteredProducts.slice(0, count).map(p => p.id);
                        onBulkSelectProducts(productIdsToSelect);
                        // Reset dropdown by incrementing key
                        setBulkSelectKey(k => k + 1);
                      }
                    }}
                  >
                    <option value="" disabled>Bulk select...</option>
                    <option value="5">Select 5</option>
                    <option value="10">Select 10</option>
                    <option value="20">Select 20</option>
                    <option value="50">Select 50</option>
                    <option value="75">Select 75</option>
                    <option value="100">Select 100</option>
                    <option value="125">Select 125</option>
                    <option value="150">Select 150</option>
                  </select>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => {
                      if (onBulkSelectProducts) {
                        // Use bulk select with all filtered products to ensure consistency
                        onBulkSelectProducts(filteredProducts.map(p => p.id));
                      } else {
                        onSelectAllProducts();
                      }
                    }} 
                    type="button"
                  >
                    Select all
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={onDeselectAllProducts} 
                    type="button"
                  >
                    Clear
                  </Button>
                </div>
                
                {/* Action buttons row - wraps on smaller screens */}
                {selectedProductIds.size > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Hide Selected button */}
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleHideSelected}
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <EyeOff className="w-4 h-4 mr-1" />
                      Hide ({selectedProductIds.size})
                    </Button>
                    
                    {/* Remove Background dropdown with options */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          disabled={isRemovingBg}
                          type="button"
                          className="text-primary hover:text-primary hover:bg-primary/10"
                        >
                          {isRemovingBg ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              {bgRemovalProgress.current}/{bgRemovalProgress.total}
                            </>
                          ) : (
                            <>
                              <Eraser className="w-4 h-4 mr-1" />
                              Remove BG ({selectedProductIds.size})
                              <ChevronDown className="w-3 h-3 ml-1" />
                            </>
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuItem onClick={handleBulkBackgroundRemoval} disabled={isRemovingBg}>
                          <Eraser className="w-4 h-4 mr-2" />
                          Run Background Removal
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Options</DropdownMenuLabel>
                        <DropdownMenuCheckboxItem
                          checked={bgRemovalOptions.secondPass}
                          onCheckedChange={(checked) => setBgRemovalOptions(prev => ({ ...prev, secondPass: checked }))}
                        >
                          Second-pass cleanup
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Shadow</DropdownMenuLabel>
                        <DropdownMenuRadioGroup 
                          value={bgRemovalOptions.shadow || 'none'} 
                          onValueChange={(value) => setBgRemovalOptions(prev => ({ ...prev, shadow: value as ShadowType }))}
                        >
                          <DropdownMenuRadioItem value="none">No shadow</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="light">Light shadow</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="medium">Medium shadow</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="harsh">Harsh shadow</DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    
                    {/* Undo Background Removal button */}
                    {hasBgUndoData && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleUndoBackgroundRemoval}
                        type="button"
                        className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                      >
                        <Undo2 className="w-4 h-4 mr-1" />
                        Undo BG ({bgUndoData.get(batch.id)?.length || 0})
                      </Button>
                    )}
                    
                    {/* Ghost Mannequin button */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={handleBulkGhostMannequin}
                          disabled={isGhostProcessing || isRemovingBg}
                          type="button"
                          className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                        >
                          {isGhostProcessing ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              {ghostProgress.current}/{ghostProgress.total}
                            </>
                          ) : (
                            <>
                              <Shirt className="w-4 h-4 mr-1" />
                              Ghost ({selectedProductIds.size})
                            </>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Remove hangers &amp; infill necklines</TooltipContent>
                    </Tooltip>
                    
                    {/* Undo Ghost Mannequin button */}
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleUndoGhostMannequin}
                      disabled={!hasGhostUndoData}
                      type="button"
                      className={cn(
                        hasGhostUndoData 
                          ? "text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                          : "text-muted-foreground"
                      )}
                    >
                      <Undo2 className="w-4 h-4 mr-1" />
                      Undo Ghost
                    </Button>
                    
                    {/* Model Try-On button */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setShowModelTryOnDialog(true)}
                          disabled={isModelProcessing || isRemovingBg || isGhostProcessing}
                          type="button"
                          className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                        >
                          {isModelProcessing ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              {modelProgress.current}/{modelProgress.total}
                            </>
                          ) : (
                            <>
                              <User className="w-4 h-4 mr-1" />
                              Model ({selectedProductIds.size})
                            </>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Place garments on AI fashion model</TooltipContent>
                    </Tooltip>
                    
                    {/* Undo Model Try-On button */}
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleUndoModelTryOn}
                      disabled={!hasModelUndoData}
                      type="button"
                      className={cn(
                        hasModelUndoData 
                          ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          : "text-muted-foreground"
                      )}
                    >
                      <Undo2 className="w-4 h-4 mr-1" />
                      Undo Model
                    </Button>
                    
                    {/* Expand Images button - opens mode selection dialog */}
                    {onExpandProductImages && (
                      <>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          disabled={isExpandingImages || selectedProductIds.size === 0}
                          onClick={() => setShowExpandModeDialog(true)}
                          type="button"
                          className="text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50"
                        >
                          {isExpandingImages ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              Expanding...
                            </>
                          ) : (
                            <>
                              <Wand2 className="w-4 h-4 mr-1" />
                              Expand Images
                            </>
                          )}
                        </Button>
                        <ExpandModeDialog
                          open={showExpandModeDialog}
                          onOpenChange={setShowExpandModeDialog}
                          onSelectMode={(mode: ExpandMode) => {
                            const productIds = Array.from(selectedProductIds);
                            if (productIds.length > 0) {
                              onExpandProductImages(productIds, mode);
                            }
                          }}
                          hasExistingModelImages={
                            Array.from(selectedProductIds).some(pid => {
                              const imgs = productImages[pid] || [];
                              return imgs.some(img => img.source === 'model_tryon');
                            })
                          }
                          productCount={selectedProductIds.size}
                        />
                      </>
                    )}
                    
                    {/* Three-dots menu with actions for selected products */}
                    {onRegroupSelectedProducts && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={handleBulkBackgroundRemoval}
                            disabled={isRemovingBg}
                          >
                            {isRemovingBg ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Eraser className="w-4 h-4 mr-2" />
                            )}
                            {isRemovingBg 
                              ? `Removing BG (${bgRemovalProgress.current}/${bgRemovalProgress.total})...`
                              : `Remove Background (${selectedProductIds.size} products)`
                            }
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <Layers className="w-4 h-4 mr-2" />
                              Regroup Selected ({selectedProductIds.size})
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              <DropdownMenuLabel>Images per product</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {[2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15].map((num) => (
                                <DropdownMenuItem
                                  key={num}
                                  onClick={() => onRegroupSelectedProducts(Array.from(selectedProductIds), num)}
                                >
                                  {num} images per product
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                )}
              </div>
              <Button
                onClick={handleCreateInShopify}
                disabled={isCreatingShopify || selectedProductIds.size === 0}
                className="w-full sm:w-auto h-11 sm:h-10 text-base sm:text-sm"
                type="button"
              >
                {isCreatingShopify ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <ShoppingBag className="w-5 h-5 mr-2" />
                )}
                Upload to Shopify ({selectedProductIds.size})
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 p-4 overflow-auto">
        {/* Image Group Manager Mode */}
        {showGroupManager && (imageGroups.length > 0 || unassignedImages.length > 0) ? (
          <ErrorBoundary fallbackMessage="Image Group Manager encountered an error. Please close and try again.">
            <ImageGroupManager
              groups={imageGroups}
              unassignedImages={unassignedImages}
              onUpdateGroups={onUpdateImageGroups}
              onUpdateUnassigned={onUpdateUnassignedImages}
              onCreateNewGroup={onCreateNewGroup}
              onDeleteGroup={onDeleteGroup}
              onDeleteImage={onDeleteImage}
              onSaveGroups={onSaveGroups}
              imagesPerProduct={imagesPerProduct}
              onRegroupUnassigned={onRegroupUnassigned}
              onSmartMatch={onSmartMatch}
              isMatching={isMatching}
              matchingProgress={matchingProgress}
              onOpenProduct={onEditProduct}
              isConfirmingGrouping={isConfirmingGrouping}
              onToggleGroupLock={onToggleGroupLock}
              onCreateProductFromUrls={onCreateProductFromUrls}
            />
          </ErrorBoundary>
        ) : products.length === 0 ? (
          <div className="text-center py-16">
            <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium text-foreground mb-2">No products yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Upload images to this batch, then auto-group them into products.
            </p>
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" />
              Upload Images
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Search bar and filter */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative max-w-sm flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              
              {/* Shopify status filter */}
              <select
                value={shopifyFilter}
                onChange={(e) => setShopifyFilter(e.target.value as typeof shopifyFilter)}
                className="h-9 px-3 text-sm rounded-md border border-input bg-background text-foreground cursor-pointer"
              >
                <option value="all">All products</option>
                <option value="uploaded">Uploaded to Shopify ({shopifyStats.uploaded})</option>
                <option value="not_uploaded">Not uploaded ({shopifyStats.notUploaded})</option>
                <option value="failed">Failed ({shopifyStats.failed})</option>
              </select>
            </div>
            
            {/* Product count - always show when paginated */}
            <p className="text-sm text-muted-foreground">
              Showing {displayedProducts.length} of {filteredProducts.length} products
              {filteredProducts.length !== products.length && ` (${products.length} total)`}
              {shopifyFilter !== 'all' && ` • filtered by: ${shopifyFilter.replace('_', ' ')}`}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {/* Show skeleton placeholders while loading for instant UI feedback */}
              {imagesLoading && displayedProducts.length === 0 && (
                <>
                  {Array.from({ length: Math.min(8, PRODUCTS_PER_PAGE) }).map((_, i) => (
                    <div key={`skeleton-${i}`} className="bg-card border border-border rounded-lg overflow-hidden animate-pulse">
                      <div className="aspect-square bg-muted" />
                      <div className="p-3 space-y-2">
                        <div className="h-4 bg-muted rounded w-3/4" />
                        <div className="h-3 bg-muted rounded w-1/2" />
                        <div className="h-8 bg-muted rounded w-full" />
                      </div>
                    </div>
                  ))}
                </>
              )}
              {displayedProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  images={productImages[product.id] || []}
                  isSelected={selectedProductIds.has(product.id)}
                  onToggleSelect={() => onToggleProductSelection(product.id)}
                  onEdit={() => onEditProduct(product.id)}
                  onDelete={() => onDeleteProduct(product.id)}
                  onDeleteImage={onDeleteImageById ? async (imageId) => {
                    await onDeleteImageById(imageId, product.id);
                    // Immediately update local state to remove the deleted image
                    setProductImages(prev => ({
                      ...prev,
                      [product.id]: (prev[product.id] || []).filter(img => img.id !== imageId)
                    }));
                  } : undefined}
                  onReceiveImage={(imageUrl, fromProductId) => 
                    onMoveImageBetweenProducts?.(imageUrl, fromProductId, product.id)
                  }
                  onReorderImages={(imageIds) => onReorderProductImages?.(product.id, imageIds)}
                  onUpdateImageUrl={async (imageId, newUrl) => {
                    await supabase.from('images').update({ url: newUrl }).eq('id', imageId);
                    setProductImages(prev => ({
                      ...prev,
                      [product.id]: (prev[product.id] || []).map(img => 
                        img.id === imageId ? { ...img, url: newUrl } : img
                      )
                    }));
                  }}
                  onGenerateAI={() => onGenerateSingleProduct(product.id)}
                  onUndoAI={() => onUndoSingleProduct(product.id)}
                  onRegenerateModelStyle={() => handleRegenerateModelStyle(product.id)}
                  isGenerating={isProductGenerating(product.id)}
                  isRegeneratingModel={regeneratingModelProductId === product.id}
                  hasUndoState={hasProductUndoState(product.id)}
                  onMarkAsUploaded={(shopifyProductId) => onMarkAsUploaded?.(product.id, shopifyProductId)}
                  onMarkAsPending={() => onMarkAsPending?.(product.id)}
                  onHide={() => onHideProduct?.(product.id)}
                  onUnhide={showHiddenInline && product.is_hidden ? () => onUnhideProduct?.(product.id) : undefined}
                />
              ))}
              {!imagesLoading && products.length > 0 && Object.keys(productImages).length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-4 text-muted-foreground">
                  <p className="mb-2">Images not loading?</p>
                  <Button variant="outline" size="sm" onClick={handleRefreshImages}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh Images
                  </Button>
                </div>
              )}
              {filteredProducts.length === 0 && searchQuery && (
                <div className="col-span-full text-center py-8 text-muted-foreground">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No products match "{searchQuery}"</p>
                </div>
              )}
            </div>
            
            {/* Load More button - pagination for performance */}
            {hasMoreProducts && !imagesLoading && (
              <div className="flex flex-col items-center justify-center py-6 gap-2">
                <p className="text-sm text-muted-foreground">
                  Showing {displayedProducts.length} of {filteredProducts.length} products
                </p>
                <Button 
                  variant="outline" 
                  size="lg"
                  onClick={handleLoadMore}
                  className="min-w-[200px]"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Load more ({remainingCount} remaining)
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Birds Eye View */}
      {showBirdsEyeView && (
        <ErrorBoundary fallbackMessage="Birds Eye View encountered an error. Please close and try again.">
          <BirdsEyeView
          products={filteredProducts}
          productImages={productImages}
          isLoading={imagesLoading}
          selectedProductIds={selectedProductIds}
          onToggleProductSelection={onToggleProductSelection}
          onBulkSelectProducts={onBulkSelectProducts}
          onDeselectAllProducts={onDeselectAllProducts}
          onClose={() => {
            setShowBirdsEyeView(false);
            handleRefreshImages();
          }}
          onMoveImages={(imageIds, fromProductId, toProductId) => {
            if (onMoveImagesById) {
              onMoveImagesById(imageIds, toProductId);
            } else if (onMoveImageBetweenProducts) {
              // Fallback to URL-based move
              const fromImages = productImages[fromProductId] || [];
              imageIds.forEach(imageId => {
                const image = fromImages.find(img => img.id === imageId);
                if (image) {
                  onMoveImageBetweenProducts(image.url, fromProductId, toProductId);
                }
              });
            }
          }}
          onDeleteImage={async (imageId) => {
            // Find the image to delete
            for (const [productId, images] of Object.entries(productImages)) {
              const image = images.find(img => img.id === imageId);
              if (image) {
                // Delete from database
                const { error } = await supabase
                  .from('images')
                  .delete()
                  .eq('id', imageId);
                
                if (error) {
                  console.error('Error deleting image:', error);
                  toast.error('Failed to delete image');
                  return;
                }
                
                // Update local state
                setProductImages(prev => ({
                  ...prev,
                  [productId]: prev[productId].filter(img => img.id !== imageId)
                }));
                toast.success('Image deleted');
                break;
              }
            }
          }}
          onDeleteEmptyProducts={onDeleteEmptyProducts ? async (productIds) => {
            // Use the actual delete handler for real products
            await onDeleteEmptyProducts(productIds);
            // Refresh images after cleanup
            await handleRefreshImages();
          } : async (productIds) => {
            // Fallback for temp groups only
            for (const productId of productIds) {
              await onDeleteGroup(productId);
            }
            await handleRefreshImages();
          }}
          onCreateNewProduct={async (imageIds) => {
            // Guard: Validate imageIds
            if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
              console.warn('onCreateNewProduct: No images provided');
              return;
            }
            
            try {
              if (onCreateProductFromImageIds) {
                // Use database-backed product creation
                const newProductId = await onCreateProductFromImageIds(imageIds);
                if (newProductId) {
                  // Refresh images to reflect the change
                  await handleRefreshImages();
                }
              } else {
                // Fallback: Convert image IDs to URLs and use group manager
                const imageUrls: string[] = [];
                for (const [productId, images] of Object.entries(productImages)) {
                  if (!images || !Array.isArray(images)) continue;
                  for (const image of images) {
                    if (image && image.id && imageIds.includes(image.id)) {
                      imageUrls.push(image.url);
                    }
                  }
                }
                if (imageUrls.length > 0) {
                  onCreateNewGroup(imageUrls);
                  // Refresh images to reflect the change
                  await handleRefreshImages();
                }
              }
            } catch (error) {
              console.error('Error in onCreateNewProduct:', error);
              // Error is already handled by the handler, just log here
            }
          }}
          onMergeProducts={async (productIds) => {
            // Guard: Validate productIds
            if (!productIds || !Array.isArray(productIds) || productIds.length < 2) {
              console.warn('onMergeProducts: Not enough products to merge');
              return;
            }
            
            try {
              // Collect all image IDs from selected products
              const allImageIds: string[] = [];
              for (const productId of productIds) {
                const images = productImages[productId];
                if (images && Array.isArray(images)) {
                  images.forEach(img => {
                    if (img && img.id) {
                      allImageIds.push(img.id);
                    }
                  });
                }
              }
              
              if (allImageIds.length > 0 && onCreateProductFromImageIds) {
                // Use database-backed product creation
                const newProductId = await onCreateProductFromImageIds(allImageIds);
                if (newProductId) {
                  await handleRefreshImages();
                }
              } else if (allImageIds.length > 0) {
                // Fallback: Convert to URLs and use group manager
                const allImageUrls: string[] = [];
                for (const productId of productIds) {
                  const images = productImages[productId];
                  if (images && Array.isArray(images)) {
                    images.forEach(img => {
                      if (img && img.url) {
                        allImageUrls.push(img.url);
                      }
                    });
                  }
                }
                if (allImageUrls.length > 0) {
                  onCreateNewGroup(allImageUrls);
                  await handleRefreshImages();
                }
              }
            } catch (error) {
              console.error('Error in onMergeProducts:', error);
            }
          }}
          />
        </ErrorBoundary>
      )}

      {/* Workflow Info Dialog */}
      <Dialog open={showInfoDialog} onOpenChange={setShowInfoDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-primary" />
              Batch Workflow Guide
            </DialogTitle>
            <DialogDescription>
              Follow these steps to process your product images:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">1</div>
              <div>
                <p className="font-medium">Upload Images</p>
                <p className="text-sm text-muted-foreground">Click "Upload Images" to add photos. Up to 500 images per batch.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">2</div>
              <div>
                <p className="font-medium">Group Images</p>
                <p className="text-sm text-muted-foreground">Set "Per product" count and click "Auto-group" or use "AI Smart Match" for intelligent grouping.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">3</div>
              <div>
                <p className="font-medium">Confirm Grouping</p>
                <p className="text-sm text-muted-foreground">Review groups in "Manage Groups", adjust as needed, then click "Confirm Grouping".</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">4</div>
              <div>
                <p className="font-medium">Generate AI</p>
                <p className="text-sm text-muted-foreground">Click "Generate AI" to auto-fill titles, descriptions, and tags for products.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">5</div>
              <div>
                <p className="font-medium">Upload to Shopify</p>
                <p className="text-sm text-muted-foreground">Select products and click "Upload to Shopify" to create listings.</p>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              <strong>Tip:</strong> Use "Birds Eye" view for a quick overview of all products and their images. Use "Exclude Last 2 Images" to hide reference photos from Shopify.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
