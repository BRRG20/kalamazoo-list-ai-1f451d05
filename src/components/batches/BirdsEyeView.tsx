import { useState, useEffect } from 'react';
import { X, GripVertical, ZoomIn, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Product, ProductImage } from '@/types';
import { cn } from '@/lib/utils';

interface BirdsEyeViewProps {
  products: Product[];
  productImages: Record<string, ProductImage[]>;
  onClose: () => void;
  onMoveImages: (imageIds: string[], fromProductId: string, toProductId: string) => void;
}

export function BirdsEyeView({
  products,
  productImages,
  onClose,
  onMoveImages,
}: BirdsEyeViewProps) {
  const [selectedImages, setSelectedImages] = useState<Map<string, { imageId: string; productId: string }>>(new Map());
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [dropTargetProductId, setDropTargetProductId] = useState<string | null>(null);

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

  const handleMoveToProduct = (targetProductId: string) => {
    // Group selected images by source product
    const imagesByProduct = new Map<string, string[]>();
    selectedImages.forEach(({ imageId, productId }) => {
      if (productId !== targetProductId) {
        if (!imagesByProduct.has(productId)) {
          imagesByProduct.set(productId, []);
        }
        imagesByProduct.get(productId)!.push(imageId);
      }
    });

    // Move images from each source product
    imagesByProduct.forEach((imageIds, fromProductId) => {
      onMoveImages(imageIds, fromProductId, targetProductId);
    });

    setSelectedImages(new Map());
    setDropTargetProductId(null);
  };

  const clearSelection = () => {
    setSelectedImages(new Map());
  };

  const handleDragOver = (e: React.DragEvent, productId: string) => {
    e.preventDefault();
    if (selectedImages.size > 0) {
      setDropTargetProductId(productId);
    }
  };

  const handleDragLeave = () => {
    setDropTargetProductId(null);
  };

  const handleDrop = (e: React.DragEvent, productId: string) => {
    e.preventDefault();
    if (selectedImages.size > 0) {
      handleMoveToProduct(productId);
    }
    setDropTargetProductId(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Birds Eye View</h2>
          <span className="text-sm text-muted-foreground">
            {products.length} products
          </span>
          {selectedImages.size > 0 && (
            <div className="flex items-center gap-2 ml-4">
              <span className="text-sm font-medium text-primary">
                {selectedImages.size} image(s) selected
              </span>
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                Clear
              </Button>
              <span className="text-xs text-muted-foreground">
                Click a product card to move images there
              </span>
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Grid of products */}
      <ScrollArea className="flex-1 p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4">
          {products.map((product, productIndex) => {
            const images = productImages[product.id] || [];
            const hasSelectedImages = Array.from(selectedImages.values()).some(
              s => s.productId === product.id
            );
            const isDropTarget = dropTargetProductId === product.id;
            const canReceive = selectedImages.size > 0 && !hasSelectedImages;

            return (
              <div
                key={product.id}
                className={cn(
                  "border rounded-lg p-2 bg-card transition-all cursor-pointer",
                  isDropTarget && "ring-2 ring-primary bg-primary/10",
                  canReceive && "hover:ring-2 hover:ring-primary/50",
                  hasSelectedImages && "ring-2 ring-primary"
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
                <p className="text-xs font-medium truncate mb-2" title={product.title || 'Untitled'}>
                  {product.title || 'Untitled'}
                </p>

                {/* Images grid */}
                <div className="grid grid-cols-3 gap-1">
                  {images.map((image, imgIndex) => {
                    const isSelected = selectedImages.has(image.id);
                    return (
                      <div
                        key={image.id}
                        className={cn(
                          "relative aspect-square rounded overflow-hidden cursor-pointer group",
                          isSelected && "ring-2 ring-primary"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleImageSelection(image.id, product.id);
                        }}
                      >
                        <img
                          src={image.url}
                          alt={`Image ${imgIndex + 1}`}
                          className="w-full h-full object-cover"
                        />
                        
                        {/* Selection overlay */}
                        <div className={cn(
                          "absolute inset-0 transition-opacity flex items-center justify-center",
                          isSelected ? "bg-primary/30" : "bg-black/0 group-hover:bg-black/30"
                        )}>
                          {isSelected && (
                            <Check className="w-4 h-4 text-white drop-shadow-md" />
                          )}
                        </div>

                        {/* Expand button */}
                        <button
                          className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage(image.url);
                          }}
                        >
                          <ZoomIn className="w-3 h-3 text-white" />
                        </button>
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
      </ScrollArea>

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-4xl p-2 bg-background">
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
