import { useState, useEffect } from 'react';
import { X, ZoomIn, Check, Undo2, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { toast } from 'sonner';
import type { Product, ProductImage } from '@/types';
import { cn } from '@/lib/utils';

interface MoveHistory {
  imageIds: string[];
  fromProductId: string;
  toProductId: string;
}

interface BirdsEyeViewProps {
  products: Product[];
  productImages: Record<string, ProductImage[]>;
  onClose: () => void;
  onMoveImages: (imageIds: string[], fromProductId: string, toProductId: string) => void;
  onDeleteImage?: (imageId: string) => Promise<void>;
  isLoading?: boolean;
}

export function BirdsEyeView({
  products,
  productImages,
  onClose,
  onMoveImages,
  onDeleteImage,
  isLoading = false,
}: BirdsEyeViewProps) {
  const [selectedImages, setSelectedImages] = useState<Map<string, { imageId: string; productId: string }>>(new Map());
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [dropTargetProductId, setDropTargetProductId] = useState<string | null>(null);
  const [recentlyMovedImages, setRecentlyMovedImages] = useState<Set<string>>(new Set());
  const [recentlyReceivedProduct, setRecentlyReceivedProduct] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<MoveHistory | null>(null);
  const [draggedImageData, setDraggedImageData] = useState<{ imageId: string; productId: string } | null>(null);
  const [deletingImages, setDeletingImages] = useState<Set<string>>(new Set());

  // Count total images
  const totalImages = Object.values(productImages).reduce((sum, images) => sum + images.length, 0);

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
  const handleDragStart = (e: React.DragEvent, imageId: string, productId: string) => {
    setDraggedImageData({ imageId, productId });
    // If the dragged image is not selected, select only it
    if (!selectedImages.has(imageId)) {
      setSelectedImages(new Map([[imageId, { imageId, productId }]]));
    }
    e.dataTransfer.effectAllowed = 'move';
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
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-4 flex-wrap">
          <h2 className="text-lg font-semibold">Birds Eye View</h2>
          <span className="text-sm text-muted-foreground">
            {products.length} products • {totalImages} images
          </span>
          
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
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <p>No products found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4">
            {products.map((product, productIndex) => {
              const images = productImages[product.id] || [];
              const hasSelectedImages = Array.from(selectedImages.values()).some(
                s => s.productId === product.id
              );
              const isDropTarget = dropTargetProductId === product.id;
              const canReceive = (selectedImages.size > 0 || draggedImageData) && !hasSelectedImages;
              const justReceived = recentlyReceivedProduct === product.id;

              return (
                <div
                  key={product.id}
                  className={cn(
                    "border rounded-lg p-2 bg-card transition-all",
                    isDropTarget && "ring-2 ring-primary bg-primary/10 scale-[1.02]",
                    canReceive && "hover:ring-2 hover:ring-primary/50 cursor-pointer",
                    hasSelectedImages && "ring-2 ring-primary",
                    justReceived && "ring-2 ring-green-500 bg-green-500/10 animate-pulse"
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
                  {/* Product header */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground truncate">
                      #{productIndex + 1}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {images.length} img
                    </span>
                  </div>

                  {/* Product title */}
                  <p className="text-xs font-medium truncate mb-2" title={product.title || product.sku || 'Untitled'}>
                    {product.title || product.sku || 'Untitled'}
                  </p>

                  {/* Images grid */}
                  <div className="grid grid-cols-3 gap-1">
                    {images.map((image, imgIndex) => {
                      const isSelected = selectedImages.has(image.id);
                      const justMoved = recentlyMovedImages.has(image.id);
                      const isDeleting = deletingImages.has(image.id);
                      
                      return (
                        <div
                          key={image.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, image.id, product.id)}
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
                      <div className="col-span-3 aspect-video flex items-center justify-center bg-muted rounded">
                        <span className="text-xs text-muted-foreground">No images</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
    </div>
  );
}
