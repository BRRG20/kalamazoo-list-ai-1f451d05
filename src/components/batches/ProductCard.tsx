import { useState } from 'react';
import { Edit2, ImageIcon, Trash2, Eye, Sparkles, Undo2, Loader2, EyeOff, User, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/ui/status-badge';
import { ImagePreviewModal } from './ImagePreviewModal';
import { ShopifyStatusSection } from '@/components/products/ShopifyStatusSection';
import type { Product, ProductImage } from '@/types';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  product: Product;
  images: ProductImage[];
  isSelected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDeleteImage?: (imageId: string) => void;
  onReceiveImage?: (imageUrl: string, fromProductId: string) => void;
  onReorderImages?: (imageIds: string[]) => void;
  onUpdateImageUrl?: (imageId: string, newUrl: string) => void;
  isDraggingImage?: boolean;
  // AI generation props
  onGenerateAI?: () => void;
  onUndoAI?: () => void;
  onRegenerateModelStyle?: () => void;
  isGenerating?: boolean;
  isRegeneratingModel?: boolean;
  hasUndoState?: boolean;
  // Shopify status override props
  onMarkAsUploaded?: (shopifyProductId?: string) => void;
  onMarkAsPending?: () => void;
  // Hide functionality
  onHide?: () => void;
  // Unhide functionality (for hidden products shown inline)
  onUnhide?: () => void;
}

export function ProductCard({
  product,
  images,
  isSelected,
  onToggleSelect,
  onEdit,
  onDelete,
  onDeleteImage,
  onReceiveImage,
  onReorderImages,
  onUpdateImageUrl,
  isDraggingImage,
  onGenerateAI,
  onUndoAI,
  onRegenerateModelStyle,
  isGenerating,
  isRegeneratingModel,
  hasUndoState,
  onMarkAsUploaded,
  onMarkAsPending,
  onHide,
  onUnhide,
}: ProductCardProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [draggedImageUrl, setDraggedImageUrl] = useState<string | null>(null);
  const [internalDragIndex, setInternalDragIndex] = useState<number | null>(null);
  const [internalDragOverIndex, setInternalDragOverIndex] = useState<number | null>(null);

  // Use thumb_url if available for faster loading, fallback to full url
  const firstImage = images[0];
  const thumbnail = firstImage?.thumb_url || firstImage?.url;
  const imageUrls = images.map(img => img.url);

  const handleImageClick = (e: React.MouseEvent, index: number = 0) => {
    e.stopPropagation();
    setPreviewIndex(index);
    setPreviewOpen(true);
  };

  // Drag source handlers for moving between cards
  const handleDragStart = (e: React.DragEvent, imageUrl: string, index: number) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({
      imageUrl,
      fromProductId: product.id,
      isInternal: false,
    }));
    e.dataTransfer.effectAllowed = 'move';
    setDraggedImageUrl(imageUrl);
    setInternalDragIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedImageUrl(null);
    setInternalDragIndex(null);
    setInternalDragOverIndex(null);
  };

  // Internal reorder handlers
  const handleInternalDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (internalDragIndex !== null && internalDragIndex !== index) {
      setInternalDragOverIndex(index);
    }
  };

  const handleInternalDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (internalDragIndex !== null && internalDragIndex !== dropIndex && onReorderImages) {
      const newOrder = [...images];
      const [draggedItem] = newOrder.splice(internalDragIndex, 1);
      newOrder.splice(dropIndex, 0, draggedItem);
      onReorderImages(newOrder.map(img => img.id));
    }
    
    setInternalDragIndex(null);
    setInternalDragOverIndex(null);
  };

  // Drop target handlers for receiving from other cards
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.imageUrl && data.fromProductId && data.fromProductId !== product.id) {
        onReceiveImage?.(data.imageUrl, data.fromProductId);
      }
    } catch (err) {
      console.error('Invalid drop data');
    }
  };

  return (
    <>
      <div
        className={cn(
          "bg-card border border-border rounded-lg overflow-hidden transition-all hover:shadow-md",
          isSelected && "ring-2 ring-primary",
          isDragOver && "ring-2 ring-primary/60 bg-primary/5",
          isDraggingImage && "opacity-60",
          product.is_hidden && "border-amber-400 bg-amber-50/30 dark:bg-amber-950/20"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Thumbnail */}
        <div className="aspect-square bg-muted relative group">
          {thumbnail ? (
            <>
              <img
                src={thumbnail}
                alt={product.title || 'Product image'}
                className="w-full h-full object-cover cursor-pointer"
                onClick={(e) => handleImageClick(e, 0)}
                draggable
                onDragStart={(e) => handleDragStart(e, thumbnail, 0)}
                onDragEnd={handleDragEnd}
                loading="lazy"
                decoding="async"
              />
              {/* AI Model badge */}
              {images[0]?.source === 'model_tryon' && (
                <div className="absolute bottom-2 left-2 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <User className="w-3 h-3" />
                  AI Model
                </div>
              )}
              {/* Hidden badge */}
              {product.is_hidden && (
                <div className="absolute bottom-2 right-2 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <EyeOff className="w-3 h-3" />
                  Hidden
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="w-12 h-12 text-muted-foreground" />
            </div>
          )}
          
          {/* Selection checkbox */}
          <div className="absolute top-2 left-2 flex items-center gap-1.5">
            <Checkbox
              checked={isSelected}
              onCheckedChange={onToggleSelect}
              className="bg-card border-2"
            />
            {/* Batch number badge */}
            {product.batch_number != null && (
              <span className="bg-foreground/80 text-background text-xs px-1.5 py-0.5 rounded font-medium">
                #{product.batch_number}
              </span>
            )}
          </div>

          {/* Expand button */}
          {thumbnail && (
            <button
              onClick={(e) => handleImageClick(e, 0)}
              className="absolute top-2 right-10 p-1.5 bg-background/90 hover:bg-background rounded opacity-0 group-hover:opacity-100 transition-opacity"
              title="View images"
            >
              <Eye className="w-4 h-4 text-foreground" />
            </button>
          )}

          {/* Delete button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute top-2 right-2 p-1.5 bg-destructive/90 hover:bg-destructive rounded opacity-0 group-hover:opacity-100 transition-opacity"
            title="Delete product"
          >
            <Trash2 className="w-4 h-4 text-destructive-foreground" />
          </button>

          {/* Generating indicator overlay */}
          {(isGenerating || isRegeneratingModel) && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="text-sm font-medium text-foreground">
                  {isRegeneratingModel ? 'Regenerating model...' : 'Generating...'}
                </span>
              </div>
            </div>
          )}

          {/* Image count badge */}
          <div className="absolute bottom-2 right-2 bg-foreground/80 text-background text-xs px-2 py-0.5 rounded">
            {images.length} images
          </div>

          {/* Mini image strip on hover - draggable & reorderable with delete buttons */}
          {images.length > 1 && !isGenerating && (
            <div className="absolute bottom-8 left-0 right-0 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex gap-1 overflow-x-auto py-1 bg-background/80 rounded px-1">
                {images.slice(0, 6).map((img, idx) => (
                  <div
                    key={img.id}
                    className={cn(
                      "flex-shrink-0 w-10 h-10 rounded border cursor-grab active:cursor-grabbing relative transition-all group/img",
                      draggedImageUrl === img.url && "opacity-50 scale-95",
                      internalDragOverIndex === idx && "ring-2 ring-primary scale-110"
                    )}
                    draggable
                    onDragStart={(e) => handleDragStart(e, img.url, idx)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleInternalDragOver(e, idx)}
                    onDrop={(e) => handleInternalDrop(e, idx)}
                    onClick={(e) => handleImageClick(e, idx)}
                    title={`Drag to reorder • Click to preview`}
                  >
                    <img
                      src={img.url}
                      alt={`Image ${idx + 1}`}
                      className="w-full h-full object-cover rounded pointer-events-none"
                      loading="lazy"
                      decoding="async"
                    />
                    {/* Per-image delete button */}
                    {onDeleteImage && (
                      <button
                        className="absolute -top-1 -right-1 p-0.5 rounded-full bg-destructive hover:bg-destructive/90 opacity-0 group-hover/img:opacity-100 transition-opacity z-10"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteImage(img.id);
                        }}
                        title="Delete this image"
                      >
                        <Trash2 className="w-2.5 h-2.5 text-white" />
                      </button>
                    )}
                  </div>
                ))}
                {images.length > 6 && (
                  <div className="flex-shrink-0 w-10 h-10 rounded border bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    +{images.length - 6}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Drop zone indicator */}
          {isDragOver && (
            <div className="absolute inset-0 bg-primary/20 flex items-center justify-center pointer-events-none">
              <div className="bg-background/90 px-3 py-2 rounded-lg text-sm font-medium text-primary">
                Drop image here
              </div>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm text-foreground truncate">
                {product.title || product.sku}
              </p>
              {product.title && (
                <p className="text-xs text-muted-foreground">{product.sku}</p>
              )}
            </div>
            <StatusBadge status={product.status} />
          </div>

          {product.price > 0 && (
            <p className="text-sm font-medium text-foreground mb-2">
              £{product.price.toFixed(2)}
            </p>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            {product.garment_type && <span>{product.garment_type}</span>}
            {product.garment_type && product.department && <span>·</span>}
            {product.department && <span>{product.department}</span>}
          </div>

          {/* Shopify Status Section */}
          {onMarkAsUploaded && onMarkAsPending && (
            <ShopifyStatusSection
              product={product}
              onMarkAsUploaded={onMarkAsUploaded}
              onMarkAsPending={onMarkAsPending}
              compact
            />
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onEdit} className="flex-1">
              <Edit2 className="w-3 h-3 mr-2" />
              Edit
            </Button>
            
            {/* Generate AI button */}
            {onGenerateAI && (
              <Button
                variant="default"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onGenerateAI();
                }}
                disabled={isGenerating || images.length === 0}
                title={images.length === 0 ? 'No images to analyze' : 'Generate AI for this product'}
                className="px-2"
              >
                {isGenerating ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
              </Button>
            )}

            {/* Undo AI button */}
            {hasUndoState && onUndoAI && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onUndoAI();
                }}
                disabled={isGenerating || isRegeneratingModel}
                title="Undo last AI change"
                className="px-2 text-amber-600 hover:text-amber-700 border-amber-300 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950"
              >
                <Undo2 className="w-3 h-3" />
              </Button>
            )}

            {/* Regenerate AI Model Style button - shows when product has AI model images */}
            {onRegenerateModelStyle && images.some(img => img.source === 'model_tryon') && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onRegenerateModelStyle();
                }}
                disabled={isGenerating || isRegeneratingModel}
                title="Regenerate AI model style"
                className="px-2 text-emerald-600 hover:text-emerald-700 border-emerald-300 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950"
              >
                {isRegeneratingModel ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
              </Button>
            )}

            {/* Hide/Uploaded button - only show when product is not hidden */}
            {onHide && !product.is_hidden && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onHide();
                }}
                title="Hide / Mark as Uploaded"
                className="px-2 text-muted-foreground hover:text-foreground"
              >
                <EyeOff className="w-3 h-3" />
              </Button>
            )}

            {/* Unhide button - only show when product is hidden */}
            {onUnhide && product.is_hidden && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnhide();
                }}
                title="Unhide this product"
                className="px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50 border-amber-300"
              >
                <Eye className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Image Preview Modal */}
      <ImagePreviewModal
        images={imageUrls}
        initialIndex={previewIndex}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        productName={product.title || product.sku || undefined}
        onImageUpdated={onUpdateImageUrl ? (index, newUrl) => {
          const image = images[index];
          if (image) {
            onUpdateImageUrl(image.id, newUrl);
          }
        } : undefined}
      />
    </>
  );
}
