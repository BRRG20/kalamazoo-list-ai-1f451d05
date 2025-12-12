import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, ZoomIn, Check, Undo2, Trash2, Loader2, Search, Filter, AlertTriangle, Plus, CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import type { Product, ProductImage } from '@/types';
import { cn } from '@/lib/utils';

interface MoveHistory {
  imageIds: string[];
  fromProductId: string;
  toProductId: string;
}

type FilterMode = 'all' | 'with-images' | 'empty';

interface BirdsEyeViewProps {
  products: Product[];
  productImages: Record<string, ProductImage[]>;
  onClose: () => void;
  onMoveImages: (imageIds: string[], fromProductId: string, toProductId: string) => void;
  onDeleteImage?: (imageId: string) => Promise<void>;
  onDeleteEmptyProducts?: (productIds: string[]) => Promise<void>;
  onCreateNewProduct?: (imageIds: string[]) => void;
  isLoading?: boolean;
  // Product selection props
  selectedProductIds?: Set<string>;
  onToggleProductSelection?: (productId: string) => void;
  onBulkSelectProducts?: (productIds: string[]) => void;
  onDeselectAllProducts?: () => void;
}

export function BirdsEyeView({
  products,
  productImages,
  onClose,
  onMoveImages,
  onDeleteImage,
  onDeleteEmptyProducts,
  onCreateNewProduct,
  isLoading = false,
  selectedProductIds,
  onToggleProductSelection,
  onBulkSelectProducts,
  onDeselectAllProducts,
}: BirdsEyeViewProps) {
  const [selectedImages, setSelectedImages] = useState<Map<string, { imageId: string; productId: string }>>(new Map());
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [dropTargetProductId, setDropTargetProductId] = useState<string | null>(null);
  const [recentlyMovedImages, setRecentlyMovedImages] = useState<Set<string>>(new Set());
  const [recentlyReceivedProduct, setRecentlyReceivedProduct] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<MoveHistory | null>(null);
  const [draggedImageData, setDraggedImageData] = useState<{ imageId: string; productId: string } | null>(null);
  const [deletingImages, setDeletingImages] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);
  const [isDeletingEmpty, setIsDeletingEmpty] = useState(false);
  const [isCreateNewDropTarget, setIsCreateNewDropTarget] = useState(false);

  // Count empty and populated products
  const productStats = useMemo(() => {
    let withImages = 0;
    let empty = 0;
    let totalImageCount = 0;
    
    products.forEach(p => {
      const count = productImages[p.id]?.length || 0;
      totalImageCount += count;
      if (count > 0) {
        withImages++;
      } else {
        empty++;
      }
    });
    
    return { withImages, empty, totalImageCount };
  }, [products, productImages]);

  // Get empty product IDs for cleanup
  const emptyProductIds = useMemo(() => {
    return products
      .filter(p => (productImages[p.id]?.length || 0) === 0)
      .map(p => p.id);
  }, [products, productImages]);

  // Filter products based on search query AND filter mode
  const filteredProducts = useMemo(() => {
    let result = products;
    
    // Apply filter mode
    if (filterMode === 'with-images') {
      result = result.filter(p => (productImages[p.id]?.length || 0) > 0);
    } else if (filterMode === 'empty') {
      result = result.filter(p => (productImages[p.id]?.length || 0) === 0);
    }
    
    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(product =>
        product.title?.toLowerCase().includes(query) ||
        product.sku?.toLowerCase().includes(query) ||
        product.brand?.toLowerCase().includes(query) ||
        product.garment_type?.toLowerCase().includes(query)
      );
    }
    
    return result;
  }, [products, productImages, searchQuery, filterMode]);

  // Count total images (for filtered products)
  const totalImages = useMemo(() => {
    return filteredProducts.reduce((sum, p) => sum + (productImages[p.id]?.length || 0), 0);
  }, [filteredProducts, productImages]);

  // Handle cleanup of empty products
  const handleCleanupEmptyProducts = useCallback(async () => {
    if (!onDeleteEmptyProducts || emptyProductIds.length === 0) return;
    
    setIsDeletingEmpty(true);
    try {
      await onDeleteEmptyProducts(emptyProductIds);
      toast.success(`Deleted ${emptyProductIds.length} empty product(s)`);
      setShowCleanupDialog(false);
    } catch (error) {
      toast.error('Failed to delete empty products');
    } finally {
      setIsDeletingEmpty(false);
    }
  }, [onDeleteEmptyProducts, emptyProductIds]);

  const toggleImageSelection = (imageId: string, productId: string) => {
    setSelectedImages(prev => {
      const next = new Map(prev);
      if (next.has(imageId)) {
        next.delete(imageId);
      } else {
        next.set(imageId, { imageId, productId });
      }
      return next;
    });
  };

  const handleMoveToProduct = (targetProductId: string, isUndo = false) => {
    // Group selected images by source product
    const imagesByProduct = new Map<string, string[]>();
    const movedImageIds: string[] = [];
    let fromProductId = '';
    
    selectedImages.forEach(({ imageId, productId }) => {
      if (productId !== targetProductId) {
        if (!imagesByProduct.has(productId)) {
          imagesByProduct.set(productId, []);
        }
        imagesByProduct.get(productId)!.push(imageId);
        movedImageIds.push(imageId);
        fromProductId = productId;
      }
    });

    if (movedImageIds.length === 0) return;

    // Move images from each source product
    imagesByProduct.forEach((imageIds, sourceProductId) => {
      onMoveImages(imageIds, sourceProductId, targetProductId);
      fromProductId = sourceProductId;
    });

    // Save move history for undo (only if not already undoing)
    if (!isUndo) {
      setLastMove({
        imageIds: movedImageIds,
        fromProductId,
        toProductId: targetProductId,
      });
    } else {
      setLastMove(null);
    }

    // Show visual feedback
    setRecentlyMovedImages(new Set(movedImageIds));
    setRecentlyReceivedProduct(targetProductId);
    
    // Find target product name for toast
    const targetProduct = products.find(p => p.id === targetProductId);
    const targetName = targetProduct?.title || `Product #${products.findIndex(p => p.id === targetProductId) + 1}`;
    
    toast.success(
      isUndo 
        ? `Undone: ${movedImageIds.length} image${movedImageIds.length > 1 ? 's' : ''} returned`
        : `Moved ${movedImageIds.length} image${movedImageIds.length > 1 ? 's' : ''} to ${targetName}`
    );

    // Clear visual feedback after animation
    setTimeout(() => {
      setRecentlyMovedImages(new Set());
      setRecentlyReceivedProduct(null);
    }, 1500);

    setSelectedImages(new Map());
    setDropTargetProductId(null);
  };

  const handleUndo = () => {
    if (!lastMove) return;
    
    // Move back to original product
    onMoveImages(lastMove.imageIds, lastMove.toProductId, lastMove.fromProductId);
    
    // Show visual feedback
    setRecentlyMovedImages(new Set(lastMove.imageIds));
    setRecentlyReceivedProduct(lastMove.fromProductId);
    
    const fromProduct = products.find(p => p.id === lastMove.fromProductId);
    const fromName = fromProduct?.title || `Product #${products.findIndex(p => p.id === lastMove.fromProductId) + 1}`;
    
    toast.success(`Undone: ${lastMove.imageIds.length} image${lastMove.imageIds.length > 1 ? 's' : ''} returned to ${fromName}`);
    
    // Clear visual feedback after animation
    setTimeout(() => {
      setRecentlyMovedImages(new Set());
      setRecentlyReceivedProduct(null);
    }, 1500);
    
    setSelectedImages(new Map());
    setLastMove(null);
  };

  const handleDeleteSelected = async () => {
    if (!onDeleteImage || selectedImages.size === 0) return;
    
    const imageIds = Array.from(selectedImages.keys());
    setDeletingImages(new Set(imageIds));
    
    try {
      for (const imageId of imageIds) {
        await onDeleteImage(imageId);
      }
      toast.success(`Deleted ${imageIds.length} image${imageIds.length > 1 ? 's' : ''}`);
      setSelectedImages(new Map());
    } catch (error) {
      toast.error('Failed to delete some images');
    } finally {
      setDeletingImages(new Set());
    }
  };

  const handleDeleteSingle = async (e: React.MouseEvent, imageId: string) => {
    e.stopPropagation();
    if (!onDeleteImage) return;
    
    setDeletingImages(prev => new Set(prev).add(imageId));
    
    try {
      await onDeleteImage(imageId);
      toast.success('Image deleted');
      setSelectedImages(prev => {
        const next = new Map(prev);
        next.delete(imageId);
        return next;
      });
    } catch (error) {
      toast.error('Failed to delete image');
    } finally {
      setDeletingImages(prev => {
        const next = new Set(prev);
        next.delete(imageId);
        return next;
      });
    }
  };

  const clearSelection = () => {
    setSelectedImages(new Map());
  };

  // Drag and drop handlers for single image
  const handleDragStart = (e: React.DragEvent, imageId: string, productId: string, imageUrl: string) => {
    setDraggedImageData({ imageId, productId });
    // If the dragged image is not selected, select only it
    if (!selectedImages.has(imageId)) {
      setSelectedImages(new Map([[imageId, { imageId, productId }]]));
    }
    e.dataTransfer.effectAllowed = 'move';
    
    // Create custom drag image
    const dragImage = document.createElement('div');
    dragImage.style.cssText = 'position: absolute; top: -1000px; left: -1000px; width: 80px; height: 80px; border-radius: 8px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.3); border: 2px solid hsl(var(--primary)); transform: rotate(3deg);';
    const img = document.createElement('img');
    img.src = imageUrl;
    img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
    dragImage.appendChild(img);
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 40, 40);
    
    // Clean up after drag starts
    setTimeout(() => {
      document.body.removeChild(dragImage);
    }, 0);
  };

  const handleDragEnd = () => {
    setDraggedImageData(null);
    setDropTargetProductId(null);
  };

  const handleDragOver = (e: React.DragEvent, productId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    // Check if any selected image is from a different product
    const hasImageFromOtherProduct = Array.from(selectedImages.values()).some(
      s => s.productId !== productId
    );
    
    if (hasImageFromOtherProduct || (draggedImageData && draggedImageData.productId !== productId)) {
      setDropTargetProductId(productId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the card entirely
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDropTargetProductId(null);
    }
  };

  const handleDrop = (e: React.DragEvent, productId: string) => {
    e.preventDefault();
    
    if (selectedImages.size > 0) {
      handleMoveToProduct(productId);
    }
    
    setDropTargetProductId(null);
    setDraggedImageData(null);
  };

  return (
    <TooltipProvider delayDuration={300}>
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-4 flex-wrap flex-1">
          <h2 className="text-lg font-semibold">Birds Eye View</h2>
          <span className="text-sm text-muted-foreground">
            {filteredProducts.length} products • {totalImages} images
            {filterMode !== 'all' && ` (${filterMode === 'empty' ? 'showing empty' : 'showing with images'})`}
          </span>
          
          {/* Product selection counter and controls */}
          {selectedProductIds && selectedProductIds.size > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-lg">
              <CheckSquare className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">
                {selectedProductIds.size} selected
              </span>
              {onDeselectAllProducts && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onDeselectAllProducts}>
                  Clear
                </Button>
              )}
            </div>
          )}
          
          {/* Bulk select dropdown */}
          {onBulkSelectProducts && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5">
                  <CheckSquare className="w-4 h-4" />
                  Bulk select...
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Select products</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {[5, 10, 20, 50, 75, 100].map(count => (
                  <DropdownMenuItem
                    key={count}
                    disabled={filteredProducts.length === 0}
                    onClick={() => {
                      const idsToSelect = filteredProducts.slice(0, count).map(p => p.id);
                      onBulkSelectProducts(idsToSelect);
                    }}
                  >
                    Select {count}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={filteredProducts.length === 0}
                  onClick={() => onBulkSelectProducts(filteredProducts.map(p => p.id))}
                >
                  Select all ({filteredProducts.length})
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          
          {/* Stats badges */}
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
              {productStats.withImages} with images
            </span>
            {productStats.empty > 0 && (
              <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                {productStats.empty} empty
              </span>
            )}
          </div>
          
          {/* Search input */}
          <div className="relative flex-shrink-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-8 w-48 md:w-64"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          
          {/* Filter dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <Filter className="w-4 h-4" />
                {filterMode === 'all' ? 'All' : filterMode === 'empty' ? 'Empty only' : 'With images'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Filter Products</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setFilterMode('all')} className={filterMode === 'all' ? 'bg-accent' : ''}>
                All products ({products.length})
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterMode('with-images')} className={filterMode === 'with-images' ? 'bg-accent' : ''}>
                With images ({productStats.withImages})
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterMode('empty')} className={filterMode === 'empty' ? 'bg-accent' : ''}>
                Empty groups ({productStats.empty})
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Cleanup empty products button */}
          {productStats.empty > 0 && onDeleteEmptyProducts && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-amber-600 border-amber-300 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-950"
                  onClick={() => setShowCleanupDialog(true)}
                >
                  <AlertTriangle className="w-4 h-4" />
                  Clean up ({productStats.empty})
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Delete all empty product groups (no images)</p>
              </TooltipContent>
            </Tooltip>
          )}
          
          {isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading images...</span>
            </div>
          )}
          
          {selectedImages.size > 0 && (
            <div className="flex items-center gap-2 ml-4">
              <span className="text-sm font-medium text-primary">
                {selectedImages.size} image(s) selected
              </span>
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                Clear
              </Button>
              {onDeleteImage && (
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={handleDeleteSelected}
                  disabled={deletingImages.size > 0}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </Button>
              )}
              <span className="text-xs text-muted-foreground">
                Drag or click a product to move
              </span>
            </div>
          )}
          
          {lastMove && selectedImages.size === 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleUndo}
              className="ml-4 gap-1.5 text-amber-600 border-amber-300 hover:bg-amber-50 hover:text-amber-700"
            >
              <Undo2 className="w-4 h-4" />
              Undo move ({lastMove.imageIds.length} image{lastMove.imageIds.length > 1 ? 's' : ''})
            </Button>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Grid of products */}
      <ScrollArea className="flex-1 p-4">
        {filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <p>{searchQuery ? 'No products match your search' : 'No products found'}</p>
            {searchQuery && (
              <Button variant="link" size="sm" onClick={() => setSearchQuery('')}>
                Clear search
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4">
            {filteredProducts.map((product, productIndex) => {
              const images = productImages[product.id] || [];
              const hasSelectedImages = Array.from(selectedImages.values()).some(
                s => s.productId === product.id
              );
              const isDropTarget = dropTargetProductId === product.id;
              const canReceive = (selectedImages.size > 0 || draggedImageData) && !hasSelectedImages;
              const justReceived = recentlyReceivedProduct === product.id;
              const isProductSelected = selectedProductIds?.has(product.id) ?? false;

              return (
                <div
                  key={product.id}
                  className={cn(
                    "border-2 rounded-lg p-2 bg-card transition-all duration-200 relative",
                    isDropTarget && "border-primary ring-2 ring-primary/30 bg-primary/10 scale-[1.02] shadow-lg",
                    !isDropTarget && canReceive && "border-dashed border-muted-foreground/50 hover:border-primary/50 cursor-pointer",
                    !isDropTarget && !canReceive && "border-border",
                    hasSelectedImages && "ring-2 ring-primary border-primary",
                    justReceived && "ring-2 ring-green-500 bg-green-500/10 border-green-500",
                    isProductSelected && "ring-2 ring-primary/50 bg-primary/5"
                  )}
                  onDragOver={(e) => handleDragOver(e, product.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, product.id)}
                  onClick={() => {
                    if (selectedImages.size > 0 && !hasSelectedImages) {
                      handleMoveToProduct(product.id);
                    }
                  }}
                >
                  {/* Drop indicator overlay */}
                  {isDropTarget && (
                    <div className="absolute inset-0 z-10 bg-primary/20 flex items-center justify-center pointer-events-none rounded-lg">
                      <div className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md shadow-lg font-medium text-xs flex items-center gap-1.5">
                        <Plus className="w-3 h-3" />
                        Drop here
                      </div>
                    </div>
                  )}
                  {/* Product header with checkbox */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      {onToggleProductSelection && (
                        <Checkbox
                          checked={isProductSelected}
                          onCheckedChange={() => onToggleProductSelection(product.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4"
                        />
                      )}
                      <span className="text-xs font-medium text-muted-foreground truncate">
                        #{productIndex + 1}
                      </span>
                    </div>
                    <span className={cn(
                      "text-xs px-1.5 py-0.5 rounded",
                      images.length === 0
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        : "bg-muted text-muted-foreground"
                    )}>
                      {images.length} img
                    </span>
                  </div>

                  {/* Product title with tooltip */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-xs font-medium truncate mb-2 cursor-help">
                        {product.title || product.sku || 'Untitled'}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      <p>{product.title || product.sku || 'Untitled'}</p>
                      {product.brand && <p className="text-xs text-muted-foreground">Brand: {product.brand}</p>}
                      {product.garment_type && <p className="text-xs text-muted-foreground">Type: {product.garment_type}</p>}
                    </TooltipContent>
                  </Tooltip>

                  {/* Images grid */}
                  <div className="grid grid-cols-3 gap-1">
                    {images.map((image, imgIndex) => {
                      const isSelected = selectedImages.has(image.id);
                      const justMoved = recentlyMovedImages.has(image.id);
                      const isDeleting = deletingImages.has(image.id);
                      
                      return (
                        <div
                          key={image.id}
                          draggable={!isDeleting}
                          onDragStart={(e) => handleDragStart(e, image.id, product.id, image.url)}
                          onDragEnd={handleDragEnd}
                          className={cn(
                            "relative aspect-square rounded overflow-hidden cursor-grab active:cursor-grabbing group transition-all duration-300",
                            isSelected && "ring-2 ring-primary",
                            justMoved && "ring-2 ring-green-500 scale-105 shadow-lg",
                            isDeleting && "opacity-50"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isDeleting) {
                              toggleImageSelection(image.id, product.id);
                            }
                          }}
                        >
                          <img
                            src={image.url}
                            alt={`Image ${imgIndex + 1}`}
                            className={cn(
                              "w-full h-full object-cover transition-all duration-300 pointer-events-none",
                              justMoved && "brightness-110"
                            )}
                          />
                          
                          {/* Selection overlay */}
                          <div className={cn(
                            "absolute inset-0 transition-opacity flex items-center justify-center",
                            isSelected ? "bg-primary/30" : justMoved ? "bg-green-500/30" : "bg-black/0 group-hover:bg-black/30"
                          )}>
                            {isSelected && (
                              <Check className="w-4 h-4 text-white drop-shadow-md" />
                            )}
                            {justMoved && !isSelected && (
                              <Check className="w-4 h-4 text-green-100 drop-shadow-md animate-bounce" />
                            )}
                            {isDeleting && (
                              <Loader2 className="w-4 h-4 text-white animate-spin" />
                            )}
                          </div>

                          {/* Expand button */}
                          <button
                            className="absolute top-0.5 left-0.5 p-0.5 rounded bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewImage(image.url);
                            }}
                          >
                            <ZoomIn className="w-3 h-3 text-white" />
                          </button>

                          {/* Delete button */}
                          {onDeleteImage && (
                            <button
                              className="absolute top-0.5 right-0.5 p-0.5 rounded bg-destructive/80 hover:bg-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => handleDeleteSingle(e, image.id)}
                              disabled={isDeleting}
                            >
                              <Trash2 className="w-3 h-3 text-white" />
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {/* Empty state */}
                    {images.length === 0 && (
                      <div className="col-span-3 aspect-video flex flex-col items-center justify-center bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded">
                        <AlertTriangle className="w-4 h-4 text-amber-500 mb-1" />
                        <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">Empty group</span>
                        <span className="text-xs text-amber-600 dark:text-amber-500">0 images</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Create New Product drop zone */}
            {onCreateNewProduct && (selectedImages.size > 0 || draggedImageData) && (
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-2 bg-card transition-all duration-200 relative min-h-[140px] flex flex-col items-center justify-center cursor-pointer",
                  isCreateNewDropTarget 
                    ? "border-green-500 ring-2 ring-green-500/30 bg-green-500/10 scale-[1.02] shadow-lg" 
                    : "border-muted-foreground/50 hover:border-green-500/50"
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                  setIsCreateNewDropTarget(true);
                }}
                onDragLeave={(e) => {
                  const relatedTarget = e.relatedTarget as HTMLElement;
                  if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
                    setIsCreateNewDropTarget(false);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (selectedImages.size > 0) {
                    const imageIds = Array.from(selectedImages.keys());
                    onCreateNewProduct(imageIds);
                    toast.success(`Created new product with ${imageIds.length} image${imageIds.length > 1 ? 's' : ''}`);
                    setSelectedImages(new Map());
                  }
                  setIsCreateNewDropTarget(false);
                  setDraggedImageData(null);
                }}
                onClick={() => {
                  if (selectedImages.size > 0) {
                    const imageIds = Array.from(selectedImages.keys());
                    onCreateNewProduct(imageIds);
                    toast.success(`Created new product with ${imageIds.length} image${imageIds.length > 1 ? 's' : ''}`);
                    setSelectedImages(new Map());
                  }
                }}
              >
                {isCreateNewDropTarget ? (
                  <>
                    <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center mb-2">
                      <Plus className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-sm font-medium text-green-700 dark:text-green-400">Drop to create</span>
                    <span className="text-xs text-green-600 dark:text-green-500">New product</span>
                  </>
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-full border-2 border-dashed border-muted-foreground/50 flex items-center justify-center mb-2">
                      <Plus className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">Create new product</span>
                    <span className="text-xs text-muted-foreground/70">Drop {selectedImages.size} image{selectedImages.size !== 1 ? 's' : ''} here</span>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-4xl p-2 bg-background">
          <VisuallyHidden>
            <DialogTitle>Image Preview</DialogTitle>
          </VisuallyHidden>
          {previewImage && (
            <img
              src={previewImage}
              alt="Preview"
              className="w-full h-auto max-h-[85vh] object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Cleanup Confirmation Dialog */}
      <Dialog open={showCleanupDialog} onOpenChange={setShowCleanupDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Delete Empty Products
            </DialogTitle>
            <DialogDescription>
              This will permanently delete {emptyProductIds.length} product group(s) that have no images assigned.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCleanupDialog(false)} disabled={isDeletingEmpty}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleCleanupEmptyProducts} disabled={isDeletingEmpty}>
              {isDeletingEmpty ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                `Delete ${emptyProductIds.length} Empty Product(s)`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}
