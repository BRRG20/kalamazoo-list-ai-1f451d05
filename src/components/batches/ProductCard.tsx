import { Edit2, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/ui/status-badge';
import type { Product, ProductImage } from '@/types';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  product: Product;
  images: ProductImage[];
  isSelected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
}

export function ProductCard({
  product,
  images,
  isSelected,
  onToggleSelect,
  onEdit,
}: ProductCardProps) {
  const thumbnail = images[0]?.url;

  return (
    <div
      className={cn(
        "bg-card border border-border rounded-lg overflow-hidden transition-all hover:shadow-md",
        isSelected && "ring-2 ring-primary"
      )}
    >
      {/* Thumbnail */}
      <div className="aspect-square bg-muted relative">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={product.title || 'Product image'}
            className="w-full h-full object-cover"
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

        {/* Image count badge */}
        <div className="absolute bottom-2 right-2 bg-foreground/80 text-background text-xs px-2 py-0.5 rounded">
          {images.length} images
        </div>
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
  );
}
