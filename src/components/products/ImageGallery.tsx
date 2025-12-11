import { useState } from 'react';
import { ChevronUp, ChevronDown, ImageIcon, Trash2, GripVertical, ZoomIn, Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import type { ProductImage, Product } from '@/types';
import { cn } from '@/lib/utils';

interface ImageGalleryProps {
  images: ProductImage[];
  onUpdateImage: (imageId: string, updates: Partial<ProductImage>) => void;
  onReorderImages: (imageId: string, newPosition: number) => void;
  onDeleteImage?: (imageId: string) => void;
  onMoveImages?: (imageIds: string[], targetProductId: string) => void;
  otherProducts?: Product[];
  currentProductId?: string;
}

export function ImageGallery({
  images,
  onUpdateImage,
  onReorderImages,
  onDeleteImage,
  onMoveImages,
  otherProducts = [],
  currentProductId,
}: ImageGalleryProps) {
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [previewImage, setPreviewImage] = useState<ProductImage | null>(null);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
  const [moveTargetProductId, setMoveTargetProductId] = useState<string>('');
  const [moveDropdownOpen, setMoveDropdownOpen] = useState(false);

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

  const toggleImageSelection = (imageId: string) => {
    setSelectedImageIds(prev => {
      const next = new Set(prev);
      if (next.has(imageId)) {
        next.delete(imageId);
      } else {
        next.add(imageId);
      }
      return next;
    });
  };

  const handleMoveSelected = () => {
    if (selectedImageIds.size === 0 || !moveTargetProductId || !onMoveImages) return;
    onMoveImages(Array.from(selectedImageIds), moveTargetProductId);
    setSelectedImageIds(new Set());
    setMoveTargetProductId('');
    setMoveDropdownOpen(false);
  };

  const selectAll = () => {
    setSelectedImageIds(new Set(images.map(img => img.id)));
  };

  const clearSelection = () => {
    setSelectedImageIds(new Set());
  };

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ImageIcon className="w-12 h-12 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">No images for this product</p>
      </div>
    );
  }

  const availableProducts = otherProducts.filter(p => p.id !== currentProductId);

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">
            Images ({images.length})
          </h3>
          {images.length > 1 && (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={selectedImageIds.size === images.length ? clearSelection : selectAll}
                className="text-xs h-7"
              >
                {selectedImageIds.size === images.length ? 'Clear' : 'Select All'}
              </Button>
            </div>
          )}
        </div>

        {/* Move selected images UI */}
        {selectedImageIds.size > 0 && availableProducts.length > 0 && onMoveImages && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {selectedImageIds.size} selected
            </span>
            <Popover open={moveDropdownOpen} onOpenChange={setMoveDropdownOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={moveDropdownOpen}
                  className="h-8 text-xs flex-1 justify-between"
                >
                  {moveTargetProductId
                    ? (availableProducts.find(p => p.id === moveTargetProductId)?.title || 
                       `Product ${availableProducts.findIndex(p => p.id === moveTargetProductId) + 1}`)
                    : "Move to product..."}
                  <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search products..." className="h-9" />
                  <CommandList>
                    <CommandEmpty>No product found.</CommandEmpty>
                    <CommandGroup>
                      {availableProducts.map((product, index) => (
                        <CommandItem
                          key={product.id}
                          value={product.title || `Product ${index + 1}`}
                          onSelect={() => {
                            setMoveTargetProductId(product.id);
                            setMoveDropdownOpen(false);
                          }}
                          className="text-xs"
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              moveTargetProductId === product.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="truncate">
                            {product.title || `Product ${index + 1}`}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={handleMoveSelected}
              disabled={!moveTargetProductId}
            >
              Move
            </Button>
          </div>
        )}
        
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
                dragOverIndex === index && draggedImageId !== image.id && "border-primary border-2 bg-primary/5",
                selectedImageIds.has(image.id) && "ring-2 ring-primary bg-primary/5"
              )}
            >
              {/* Selection checkbox */}
              {availableProducts.length > 0 && onMoveImages && (
                <div className="flex items-center">
                  <Checkbox
                    checked={selectedImageIds.has(image.id)}
                    onCheckedChange={() => toggleImageSelection(image.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}

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
