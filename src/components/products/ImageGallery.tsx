import { useState } from 'react';
import { ChevronUp, ChevronDown, ImageIcon, Trash2, GripVertical, ZoomIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import type { ProductImage } from '@/types';
import { cn } from '@/lib/utils';

interface ImageGalleryProps {
  images: ProductImage[];
  onUpdateImage: (imageId: string, updates: Partial<ProductImage>) => void;
  onReorderImages: (imageId: string, newPosition: number) => void;
  onDeleteImage?: (imageId: string) => void;
}

export function ImageGallery({
  images,
  onUpdateImage,
  onReorderImages,
  onDeleteImage,
}: ImageGalleryProps) {
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [previewImage, setPreviewImage] = useState<ProductImage | null>(null);

  const moveImage = (imageId: string, direction: 'up' | 'down') => {
    const image = images.find(i => i.id === imageId);
    if (!image) return;

    const newPosition = direction === 'up' 
      ? Math.max(1, image.position - 1)
      : Math.min(images.length, image.position + 1);
    
    if (newPosition !== image.position) {
      onReorderImages(imageId, newPosition);
    }
  };

  const handleDragStart = (e: React.DragEvent, imageId: string) => {
    setDraggedImageId(imageId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', imageId);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    
    if (!draggedImageId) return;
    
    const draggedImage = images.find(img => img.id === draggedImageId);
    if (!draggedImage) return;
    
    const newPosition = targetIndex + 1; // positions are 1-indexed
    if (newPosition !== draggedImage.position) {
      onReorderImages(draggedImageId, newPosition);
    }
    
    setDraggedImageId(null);
  };

  const handleDragEnd = () => {
    setDraggedImageId(null);
    setDragOverIndex(null);
  };

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ImageIcon className="w-12 h-12 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">No images for this product</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <h3 className="font-semibold text-foreground">
          Images ({images.length})
        </h3>
        
        <div className="space-y-2">
          {images.map((image, index) => (
            <div
              key={image.id}
              draggable
              onDragStart={(e) => handleDragStart(e, image.id)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={cn(
                "flex gap-3 p-2 rounded-lg border border-border bg-card cursor-grab active:cursor-grabbing transition-all",
                !image.include_in_shopify && "opacity-60",
                draggedImageId === image.id && "opacity-40 scale-95",
                dragOverIndex === index && draggedImageId !== image.id && "border-primary border-2 bg-primary/5"
              )}
            >
              {/* Drag handle */}
              <div className="flex items-center text-muted-foreground">
                <GripVertical className="w-4 h-4" />
              </div>

              {/* Thumbnail with expand */}
              <div 
                className="w-20 h-20 flex-shrink-0 rounded overflow-hidden bg-muted relative group cursor-pointer"
                onClick={() => setPreviewImage(image)}
              >
                <img
                  src={image.url}
                  alt={`Product image ${index + 1}`}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <ZoomIn className="w-5 h-5 text-white" />
                </div>
              </div>

              {/* Controls */}
              <div className="flex-1 flex flex-col justify-between min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">
                    Image {image.position}
                  </span>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => moveImage(image.id, 'up')}
                      disabled={image.position === 1}
                    >
                      <ChevronUp className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => moveImage(image.id, 'down')}
                      disabled={image.position === images.length}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                    {onDeleteImage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => onDeleteImage(image.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`include-${image.id}`}
                    checked={image.include_in_shopify}
                    onCheckedChange={(checked) => 
                      onUpdateImage(image.id, { include_in_shopify: !!checked })
                    }
                  />
                  <Label 
                    htmlFor={`include-${image.id}`}
                    className="text-xs text-muted-foreground cursor-pointer"
                  >
                    Include in Shopify
                  </Label>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-3xl p-2 bg-background">
          {previewImage && (
            <div className="relative">
              <img
                src={previewImage.url}
                alt="Preview"
                className="w-full h-auto max-h-[80vh] object-contain rounded"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
