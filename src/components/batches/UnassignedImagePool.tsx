import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { FixedSizeGrid as Grid } from 'react-window';
import { toast } from 'sonner';
import { AlertTriangle, Plus, Check, X, Eye, Trash2, Grid3X3, Loader2 } from 'lucide-react';
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
  onCreateProductFromUrls?: (urls: string[]) => Promise<string | null>;
}

// Memoized image cell to prevent unnecessary re-renders
const ImageCell = memo(function ImageCell({
  url,
  index,
  isSelected,
  onToggle,
  onPreview,
  onDelete,
}: {
  url: string;
  index: number;
  isSelected: boolean;
  onToggle: (url: string) => void;
  onPreview: (index: number) => void;
  onDelete: (url: string) => void;
}) {
  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-checkbox]')) {
      onToggle(url);
      return;
    }
    onPreview(index);
  }, [url, index, onToggle, onPreview]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(url);
  }, [url, onDelete]);

  const handleCheckboxChange = useCallback(() => {
    onToggle(url);
  }, [url, onToggle]);

  return (
    <div
      className={cn(
        "relative group aspect-square rounded-lg overflow-hidden border-2 cursor-pointer transition-all",
        isSelected 
          ? "border-primary ring-2 ring-primary/30" 
          : "border-border hover:border-primary/50"
      )}
      onClick={handleClick}
    >
      <img
        src={url}
        alt={`Unassigned ${index + 1}`}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      
      {/* Quick view overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
        <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
      </div>

      {/* Delete button */}
      <button
        data-checkbox
        onClick={handleDelete}
        className="absolute top-1 right-1 p-1 bg-destructive/90 hover:bg-destructive rounded opacity-0 group-hover:opacity-100 transition-opacity"
        title="Delete image"
      >
        <Trash2 className="w-3 h-3 text-destructive-foreground" />
      </button>
      
      <div className="absolute top-1 left-1" data-checkbox onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={handleCheckboxChange}
          className="bg-background/80 border-2"
        />
      </div>
    </div>
  );
});

// Constants for grid sizing
const CELL_SIZE = 80; // Base cell size in pixels
const CELL_GAP = 8;   // Gap between cells

export function UnassignedImagePool({
  images,
  onCreateGroup,
  onAddToGroup,
  onDeleteImage,
  groups,
  onAutoGroupUnassigned,
  onCreateProductFromUrls,
}: UnassignedImagePoolProps) {
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [targetGroupId, setTargetGroupId] = useState<string>('');
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [containerWidth, setContainerWidth] = useState(800);

  const { setNodeRef, isOver } = useDroppable({
    id: 'unassigned-pool',
  });

  // Measure container width for grid columns
  useEffect(() => {
    const container = document.getElementById('unassigned-grid-container');
    if (!container) return;
    
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Calculate grid dimensions
  const columnCount = useMemo(() => {
    return Math.max(4, Math.floor((containerWidth + CELL_GAP) / (CELL_SIZE + CELL_GAP)));
  }, [containerWidth]);

  const rowCount = useMemo(() => {
    return Math.ceil(images.length / columnCount);
  }, [images.length, columnCount]);

  // Calculate grid height - show max 4 rows before scrolling
  const gridHeight = useMemo(() => {
    const maxVisibleRows = 4;
    const actualRows = Math.min(rowCount, maxVisibleRows);
    return actualRows * (CELL_SIZE + CELL_GAP);
  }, [rowCount]);

  // Clean up stale selections when images array changes
  useEffect(() => {
    setSelectedImages(prev => {
      const imageSet = new Set(images);
      const cleaned = new Set([...prev].filter(url => imageSet.has(url)));
      if (cleaned.size !== prev.size) {
        return cleaned;
      }
      return prev;
    });
  }, [images]);

  const toggleImageSelection = useCallback((url: string) => {
    setSelectedImages(prev => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedImages(new Set(images));
  }, [images]);

  const deselectAll = useCallback(() => {
    setSelectedImages(new Set());
  }, []);

  const handlePreview = useCallback((index: number) => {
    setPreviewIndex(index);
  }, []);

  const handleCreateGroup = async () => {
    const validSelected = [...selectedImages].filter(url => images.includes(url));
    
    const imagesToUse = validSelected.length > 0 
      ? validSelected 
      : images.length === 1 
        ? [images[0]] 
        : [];
    
    if (imagesToUse.length === 0) {
      toast.warning('You must select at least one image to create a product.');
      return;
    }
    
    console.log('Creating group with images:', imagesToUse);
    
    if (onCreateProductFromUrls) {
      setIsCreating(true);
      try {
        const productId = await onCreateProductFromUrls(imagesToUse);
        if (productId) {
          toast.success(`Product created with ${imagesToUse.length} image(s)`);
          setSelectedImages(new Set());
        }
      } catch (error) {
        console.error('Error creating product:', error);
        toast.error('Failed to create product');
      } finally {
        setIsCreating(false);
      }
    } else {
      onCreateGroup(imagesToUse);
      setSelectedImages(new Set());
    }
  };

  const handleAddToExistingGroup = () => {
    if (selectedImages.size === 0 || !targetGroupId) return;
    [...selectedImages].forEach(url => {
      onAddToGroup(url, targetGroupId);
    });
    setSelectedImages(new Set());
    setTargetGroupId('');
  };

  // Virtualized grid cell renderer
  const Cell = useCallback(({ columnIndex, rowIndex, style }: { 
    columnIndex: number; 
    rowIndex: number; 
    style: React.CSSProperties 
  }) => {
    const index = rowIndex * columnCount + columnIndex;
    if (index >= images.length) return null;
    
    const url = images[index];
    const isSelected = selectedImages.has(url);
    
    return (
      <div style={{ ...style, padding: CELL_GAP / 2 }}>
        <ImageCell
          url={url}
          index={index}
          isSelected={isSelected}
          onToggle={toggleImageSelection}
          onPreview={handlePreview}
          onDelete={onDeleteImage}
        />
      </div>
    );
  }, [images, selectedImages, columnCount, toggleImageSelection, handlePreview, onDeleteImage]);

  // Use simple grid for small lists, virtualized for large
  const useVirtualization = images.length > 50;

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

        {/* Images grid - virtualized for large lists */}
        <div id="unassigned-grid-container" className="mb-4">
          {useVirtualization ? (
            <Grid
              columnCount={columnCount}
              columnWidth={CELL_SIZE + CELL_GAP}
              height={gridHeight}
              rowCount={rowCount}
              rowHeight={CELL_SIZE + CELL_GAP}
              width={containerWidth}
              className="scrollbar-thin"
            >
              {Cell}
            </Grid>
          ) : (
            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
              {images.map((url, index) => (
                <ImageCell
                  key={url}
                  url={url}
                  index={index}
                  isSelected={selectedImages.has(url)}
                  onToggle={toggleImageSelection}
                  onPreview={handlePreview}
                  onDelete={onDeleteImage}
                />
              ))}
            </div>
          )}
        </div>

        {/* Actions - Always show create button if there are images */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border">
          {/* Create as One Product button - combines all selected images into ONE product */}
          <Button 
            size="sm" 
            onClick={handleCreateGroup}
            disabled={selectedImages.size === 0 || isCreating}
          >
            {isCreating ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Plus className="w-4 h-4 mr-1" />
            )}
            {isCreating 
              ? 'Creating...'
              : `Create as One Product (${selectedImages.size} image${selectedImages.size !== 1 ? 's' : ''})`
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

          {groups.filter(g => g.productId && g.productId !== '').length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">or add to:</span>
              <Select value={targetGroupId} onValueChange={setTargetGroupId}>
                <SelectTrigger className="w-40 h-8 bg-background">
                  <SelectValue placeholder="Select group" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {groups
                    .filter(group => group.productId && group.productId !== '')
                    .map((group) => (
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
