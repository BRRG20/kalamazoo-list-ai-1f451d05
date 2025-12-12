import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { toast } from 'sonner';
import { AlertTriangle, Plus, Check, X, Eye, Trash2, Grid3X3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { ImageGroup } from './ImageGroupManager';
import { ImagePreviewModal } from './ImagePreviewModal';

interface UnassignedImagePoolProps {
  images: string[];
  onCreateGroup: (selectedUrls: string[]) => void;
  onAddToGroup: (url: string, groupId: string) => void;
  onDeleteImage: (url: string) => void;
  groups: ImageGroup[];
  onAutoGroupUnassigned?: (imagesPerProduct: number) => void;
}

export function UnassignedImagePool({
  images,
  onCreateGroup,
  onAddToGroup,
  onDeleteImage,
  groups,
  onAutoGroupUnassigned,
}: UnassignedImagePoolProps) {
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [targetGroupId, setTargetGroupId] = useState<string>('');
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const { setNodeRef, isOver } = useDroppable({
    id: 'unassigned-pool',
  });

  const toggleImageSelection = (url: string) => {
    setSelectedImages(prev => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedImages(new Set(images));
  };

  const deselectAll = () => {
    setSelectedImages(new Set());
  };

  const handleCreateGroup = () => {
    // If no images are selected but there's only one image, use that
    const imagesToUse = selectedImages.size > 0 
      ? [...selectedImages] 
      : images.length === 1 
        ? [images[0]] 
        : [];
    
    // GUARD: Never create a product group with 0 images
    if (imagesToUse.length === 0) {
      toast.warning('You must select at least one image to create a product.');
      return;
    }
    
    console.log('Creating group with images:', imagesToUse);
    onCreateGroup(imagesToUse);
    setSelectedImages(new Set());
  };

  const handleAddToExistingGroup = () => {
    if (selectedImages.size === 0 || !targetGroupId) return;
    [...selectedImages].forEach(url => {
      onAddToGroup(url, targetGroupId);
    });
    setSelectedImages(new Set());
    setTargetGroupId('');
  };

  const handleImageClick = (url: string, index: number, e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // If clicking on checkbox area, toggle selection
    if (target.closest('[data-checkbox]')) {
      toggleImageSelection(url);
      return;
    }
    // Otherwise open preview
    setPreviewIndex(index);
  };

  return (
    <>
      <div
        ref={setNodeRef}
        className={cn(
          "border-2 border-dashed rounded-lg p-4 transition-colors",
          isOver 
            ? "border-primary bg-primary/5" 
            : "border-amber-400 bg-amber-50/50 dark:bg-amber-950/20"
        )}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <span className="font-medium text-foreground">
              Unassigned Images ({images.length})
            </span>
            {selectedImages.size > 0 && (
              <span className="text-sm text-primary font-medium">
                {selectedImages.size} selected
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              className="h-8 px-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              defaultValue=""
              key={images.length}
              onChange={(e) => {
                const count = parseInt(e.target.value);
                if (count > 0) {
                  const imagesToSelect = images.slice(0, count);
                  setSelectedImages(new Set(imagesToSelect));
                }
                e.target.value = '';
              }}
            >
              <option value="" disabled>Quick select...</option>
              <option value="5">Select 5</option>
              <option value="10">Select 10</option>
              <option value="15">Select 15</option>
              <option value="20">Select 20</option>
              <option value="50">Select 50</option>
              <option value="100">Select 100</option>
            </select>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                max={images.length}
                placeholder="#"
                className="h-8 w-14 px-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const count = parseInt((e.target as HTMLInputElement).value);
                    if (count > 0 && count <= images.length) {
                      const imagesToSelect = images.slice(0, count);
                      setSelectedImages(new Set(imagesToSelect));
                      (e.target as HTMLInputElement).value = '';
                    }
                  }
                }}
              />
              <span className="text-xs text-muted-foreground">+ Enter</span>
            </div>
            <Button variant="ghost" size="sm" onClick={selectAll}>
              <Check className="w-4 h-4 mr-1" />
              All
            </Button>
            <Button variant="ghost" size="sm" onClick={deselectAll} disabled={selectedImages.size === 0}>
              <X className="w-4 h-4 mr-1" />
              None
            </Button>
            
            {/* Auto-group dropdown */}
            {onAutoGroupUnassigned && images.length >= 2 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="ml-2">
                    <Grid3X3 className="w-4 h-4 mr-1" />
                    Auto-group
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover">
                  <DropdownMenuLabel>Images per product</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15].map((num) => (
                    <DropdownMenuItem
                      key={num}
                      onClick={() => onAutoGroupUnassigned(num)}
                    >
                      {num} images per product
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max={images.length}
                        placeholder="Custom #"
                        className="h-7 w-20 px-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') {
                            const count = parseInt((e.target as HTMLInputElement).value);
                            if (count > 0) {
                              onAutoGroupUnassigned(count);
                            }
                          }
                        }}
                      />
                      <span className="text-xs text-muted-foreground">Enter</span>
                    </div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Images grid */}
        <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2 mb-4">
          {images.map((url, index) => (
            <div
              key={index}
              className={cn(
                "relative group aspect-square rounded-lg overflow-hidden border-2 cursor-pointer transition-all",
                selectedImages.has(url) 
                  ? "border-primary ring-2 ring-primary/30" 
                  : "border-border hover:border-primary/50"
              )}
              onClick={(e) => handleImageClick(url, index, e)}
            >
              <img
                src={url}
                alt={`Unassigned ${index + 1}`}
                className="w-full h-full object-cover"
              />
              
              {/* Quick view overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
              </div>

              {/* Delete button */}
              <button
                data-checkbox
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteImage(url);
                }}
                className="absolute top-1 right-1 p-1 bg-destructive/90 hover:bg-destructive rounded opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete image"
              >
                <Trash2 className="w-3 h-3 text-destructive-foreground" />
              </button>
              
              <div className="absolute top-1 left-1" data-checkbox onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selectedImages.has(url)}
                  onCheckedChange={() => toggleImageSelection(url)}
                  className="bg-background/80 border-2"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Actions - Always show create button if there are images */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border">
          {/* Create New Product button - always visible if there are images */}
          <Button 
            size="sm" 
            onClick={handleCreateGroup}
            disabled={images.length === 0}
          >
            <Plus className="w-4 h-4 mr-1" />
            {selectedImages.size > 0 
              ? `Create New Product (${selectedImages.size} images)` 
              : images.length === 1 
                ? 'Create New Product (1 image)'
                : 'Create New Product (select images first)'
            }
          </Button>

          {selectedImages.size > 0 && (
            <Button 
              size="sm" 
              variant="destructive"
              onClick={() => {
                [...selectedImages].forEach(url => onDeleteImage(url));
                setSelectedImages(new Set());
              }}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete Selected
            </Button>
          )}

          {groups.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">or add to:</span>
              <Select value={targetGroupId} onValueChange={setTargetGroupId}>
                <SelectTrigger className="w-40 h-8 bg-background">
                  <SelectValue placeholder="Select group" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {groups.map((group) => (
                    <SelectItem key={group.productId} value={group.productId}>
                      Product {String(group.productNumber).padStart(3, '0')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleAddToExistingGroup}
                disabled={!targetGroupId || selectedImages.size === 0}
              >
                Add
              </Button>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          Click images to preview. Use checkboxes to select, then create products or add to existing groups.
        </p>
      </div>

      {/* Image preview modal */}
      <ImagePreviewModal
        images={images}
        initialIndex={previewIndex ?? 0}
        open={previewIndex !== null}
        onClose={() => setPreviewIndex(null)}
      />
    </>
  );
}
