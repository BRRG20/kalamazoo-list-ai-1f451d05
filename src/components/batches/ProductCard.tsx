import { useState } from 'react';
import { Edit2, ImageIcon, Trash2, Eye, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/ui/status-badge';
import { ImagePreviewModal } from './ImagePreviewModal';
import type { Product, ProductImage } from '@/types';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  product: Product;
  images: ProductImage[];
  isSelected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReceiveImage?: (imageUrl: string, fromProductId: string) => void;
  isDraggingImage?: boolean;
}

export function ProductCard({
  product,
  images,
  isSelected,
  onToggleSelect,
  onEdit,
  onDelete,
  onReceiveImage,
  isDraggingImage,
}: ProductCardProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [draggedImageUrl, setDraggedImageUrl] = useState<string | null>(null);

  const thumbnail = images[0]?.url;
  const imageUrls = images.map(img => img.url);

  const handleImageClick = (e: React.MouseEvent, index: number = 0) => {
    e.stopPropagation();
    setPreviewIndex(index);
    setPreviewOpen(true);
  };

  // Drag source handlers
  const handleDragStart = (e: React.DragEvent, imageUrl: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({
      imageUrl,
      fromProductId: product.id,
    }));
    e.dataTransfer.effectAllowed = 'move';
    setDraggedImageUrl(imageUrl);
  };

  const handleDragEnd = () => {
    setDraggedImageUrl(null);
  };

  // Drop target handlers
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
          isDraggingImage && "opacity-60"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Thumbnail */}
        <div className="aspect-square bg-muted relative group">
          {thumbnail ? (
            <img
              src={thumbnail}
              alt={product.title || 'Product image'}
              className="w-full h-full object-cover cursor-pointer"
              onClick={(e) => handleImageClick(e, 0)}
              draggable
              onDragStart={(e) => handleDragStart(e, thumbnail)}
              onDragEnd={handleDragEnd}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="w-12 h-12 text-muted-foreground" />
            </div>
          )}
          
          {/* Selection checkbox */}
          <div className="absolute top-2 left-2">
            <Checkbox
              checked={isSelected}
              onCheckedChange={onToggleSelect}
              className="bg-card border-2"
            />
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

          {/* Image count badge */}
          <div className="absolute bottom-2 right-2 bg-foreground/80 text-background text-xs px-2 py-0.5 rounded">
            {images.length} images
          </div>

          {/* Mini image strip on hover - draggable */}
          {images.length > 1 && (
            <div className="absolute bottom-8 left-0 right-0 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex gap-1 overflow-x-auto py-1 bg-background/80 rounded px-1">
                {images.slice(0, 6).map((img, idx) => (
                  <div
                    key={img.id}
                    className={cn(
                      "flex-shrink-0 w-8 h-8 rounded border cursor-grab active:cursor-grabbing relative",
                      draggedImageUrl === img.url && "opacity-50"
                    )}
                    draggable
                    onDragStart={(e) => handleDragStart(e, img.url)}
                    onDragEnd={handleDragEnd}
                    onClick={(e) => handleImageClick(e, idx)}
                    title={`Drag to move • Click to preview`}
                  >
                    <img
                      src={img.url}
                      alt={`Image ${idx + 1}`}
                      className="w-full h-full object-cover rounded pointer-events-none"
                    />
                    <GripVertical className="absolute -left-0.5 top-1/2 -translate-y-1/2 w-3 h-3 text-foreground/60 opacity-0 group-hover:opacity-100" />
                  </div>
                ))}
                {images.length > 6 && (
                  <div className="flex-shrink-0 w-8 h-8 rounded border bg-muted flex items-center justify-center text-xs text-muted-foreground">
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

          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
            {product.garment_type && <span>{product.garment_type}</span>}
            {product.garment_type && product.department && <span>·</span>}
            {product.department && <span>{product.department}</span>}
          </div>

          <Button variant="outline" size="sm" onClick={onEdit} className="w-full">
            <Edit2 className="w-3 h-3 mr-2" />
            Edit
          </Button>
        </div>
      </div>

      {/* Image Preview Modal */}
      <ImagePreviewModal
        images={imageUrls}
        initialIndex={previewIndex}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}
