import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
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
  ChevronDown
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
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
  // Global undo
  undoStackLength?: number;
  onGlobalUndo?: () => void;
  lastUndoLabel?: string;
  // Deleted products
  deletedProductsCount?: number;
  onOpenDeletedProducts?: () => void;
  // Empty products cleanup
  onDeleteEmptyProducts?: (productIds: string[]) => Promise<void>;
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
  undoStackLength = 0,
  onGlobalUndo,
  lastUndoLabel,
  deletedProductsCount = 0,
  onOpenDeletedProducts,
  onDeleteEmptyProducts,
}: BatchDetailProps) {
  const { settings, isShopifyConfigured } = useSettings();
  const [imagesPerProduct, setImagesPerProduct] = useState(settings?.default_images_per_product || 9);
  const [productImages, setProductImages] = useState<Record<string, ProductImage[]>>({});
  const [imagesLoading, setImagesLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showBirdsEyeView, setShowBirdsEyeView] = useState(false);
  const [bulkSelectKey, setBulkSelectKey] = useState(0);
  const [showInfoDialog, setShowInfoDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shopifyConfigured = isShopifyConfigured();
  
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

  // Filter products based on search query
  const filteredProducts = products.filter(product => {
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

  // Update imagesPerProduct when settings load
  useEffect(() => {
    if (settings?.default_images_per_product) {
      setImagesPerProduct(settings.default_images_per_product);
    }
  }, [settings?.default_images_per_product]);

  // Fetch images for all products when batch or product list changes
  // Use a stable key based on batch.id and product IDs to prevent over-fetching
  useEffect(() => {
    // Create a stable key from batch ID and sorted product IDs
    const productIds = products.map(p => p.id).sort().join(',');
    const fetchKey = `${batch.id}:${productIds}:${products.length}`;
    
    // Skip if we already fetched for this exact combination
    if (lastFetchedRef.current === fetchKey) {
      return;
    }
    
    // Handle empty products case
    if (products.length === 0) {
      setProductImages({});
      lastFetchedRef.current = fetchKey;
      return;
    }
    
    let cancelled = false;
    
    const fetchAllImages = async () => {
      setImagesLoading(true);
      
      try {
        const results = await Promise.all(
          products.map(async (product) => {
            const images = await getProductImages(product.id);
            return { productId: product.id, images };
          })
        );
        
        if (!cancelled) {
          const imagesMap: Record<string, ProductImage[]> = {};
          for (const { productId, images } of results) {
            imagesMap[productId] = images;
          }
          setProductImages(imagesMap);
          lastFetchedRef.current = fetchKey;
        }
      } catch (error) {
        console.error('Error fetching images:', error);
      } finally {
        if (!cancelled) {
          setImagesLoading(false);
        }
      }
    };
    
    fetchAllImages();
    
    return () => {
      cancelled = true;
    };
  }, [batch.id, products, getProductImages]);

  // Reset lastFetchedRef when batch changes to ensure fresh data
  useEffect(() => {
    lastFetchedRef.current = '';
  }, [batch.id]);

  // Manual refresh function to force reload images
  const handleRefreshImages = async () => {
    if (products.length === 0) return;
    
    setImagesLoading(true);
    lastFetchedRef.current = ''; // Clear cache to force refetch
    
    try {
      console.log('Refreshing images for', products.length, 'products');
      const results = await Promise.all(
        products.map(async (product) => {
          const images = await getProductImages(product.id);
          return { productId: product.id, images };
        })
      );
      
      const imagesMap: Record<string, ProductImage[]> = {};
      let totalImages = 0;
      for (const { productId, images } of results) {
        imagesMap[productId] = images;
        totalImages += images.length;
      }
      console.log('Loaded', totalImages, 'images across', Object.keys(imagesMap).length, 'products');
      setProductImages(imagesMap);
      
      const productIds = products.map(p => p.id).sort().join(',');
      lastFetchedRef.current = `${batch.id}:${productIds}:${products.length}`;
    } catch (error) {
      console.error('Error refreshing images:', error);
    } finally {
      setImagesLoading(false);
    }
  };

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


  return (
    <div className="min-h-full flex flex-col">
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
              <div className="flex items-center justify-between sm:justify-start gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">
                  {selectedProductIds.size} selected
                </span>
                <div className="flex gap-1 items-center">
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
                  
                  {/* Three-dots menu with actions for selected products */}
                  {selectedProductIds.size > 0 && onRegroupSelectedProducts && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
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
          />
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
            {/* Search bar */}
            <div className="relative max-w-sm">
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
            
            {/* Product count */}
            {searchQuery && (
              <p className="text-sm text-muted-foreground">
                Showing {filteredProducts.length} of {products.length} products
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {imagesLoading && (
                <div className="col-span-full flex items-center justify-center py-4 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Loading images...
                </div>
              )}
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  images={productImages[product.id] || []}
                  isSelected={selectedProductIds.has(product.id)}
                  onToggleSelect={() => onToggleProductSelection(product.id)}
                  onEdit={() => onEditProduct(product.id)}
                  onDelete={() => onDeleteProduct(product.id)}
                  onReceiveImage={(imageUrl, fromProductId) => 
                    onMoveImageBetweenProducts?.(imageUrl, fromProductId, product.id)
                  }
                  onReorderImages={(imageIds) => onReorderProductImages?.(product.id, imageIds)}
                  onGenerateAI={() => onGenerateSingleProduct(product.id)}
                  onUndoAI={() => onUndoSingleProduct(product.id)}
                  isGenerating={isProductGenerating(product.id)}
                  hasUndoState={hasProductUndoState(product.id)}
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
          </div>
        )}
      </div>

      {/* Birds Eye View */}
      {showBirdsEyeView && (
        <BirdsEyeView
          products={products}
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
                onDeleteImage(image.url);
                // Update local state
                setProductImages(prev => ({
                  ...prev,
                  [productId]: prev[productId].filter(img => img.id !== imageId)
                }));
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
          onCreateNewProduct={(imageIds) => {
            // Convert image IDs to URLs
            const imageUrls: string[] = [];
            for (const [productId, images] of Object.entries(productImages)) {
              for (const image of images) {
                if (imageIds.includes(image.id)) {
                  imageUrls.push(image.url);
                }
              }
            }
            if (imageUrls.length > 0) {
              onCreateNewGroup(imageUrls);
              // Refresh images to reflect the change
              handleRefreshImages();
            }
          }}
        />
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
