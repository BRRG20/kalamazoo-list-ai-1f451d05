import { ChevronUp, ChevronDown, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { ProductImage } from '@/types';
import { cn } from '@/lib/utils';

interface ImageGalleryProps {
  images: ProductImage[];
  onUpdateImage: (imageId: string, updates: Partial<ProductImage>) => void;
  onReorderImages: (imageId: string, newPosition: number) => void;
}

export function ImageGallery({
  images,
  onUpdateImage,
  onReorderImages,
}: ImageGalleryProps) {
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

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ImageIcon className="w-12 h-12 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">No images for this product</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-foreground">
        Images ({images.length})
      </h3>
      
      <div className="space-y-2">
        {images.map((image, index) => (
          <div
            key={image.id}
            className={cn(
              "flex gap-3 p-2 rounded-lg border border-border bg-card",
              !image.include_in_shopify && "opacity-60"
            )}
          >
            {/* Thumbnail */}
            <div className="w-20 h-20 flex-shrink-0 rounded overflow-hidden bg-muted">
              <img
                src={image.url}
                alt={`Product image ${index + 1}`}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Controls */}
            <div className="flex-1 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  Image {image.position}
                </span>
                <div className="flex gap-1">
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
  );
}
