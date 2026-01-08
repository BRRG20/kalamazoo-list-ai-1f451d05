import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { EyeOff, Eye, ImageIcon, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import type { Product } from '@/types';

interface HiddenProductsPanelProps {
  open: boolean;
  onClose: () => void;
  hiddenProducts: Product[];
  onUnhide: (id: string) => Promise<boolean>;
  onUnhideAll: () => Promise<void>;
  onProductsChanged?: () => void;
}

export function HiddenProductsPanel({
  open,
  onClose,
  hiddenProducts,
  onUnhide,
  onUnhideAll,
  onProductsChanged,
}: HiddenProductsPanelProps) {
  const [unhiding, setUnhiding] = useState<string | null>(null);
  const [unhidingAll, setUnhidingAll] = useState(false);

  const handleUnhide = async (id: string) => {
    setUnhiding(id);
    const success = await onUnhide(id);
    setUnhiding(null);
    if (success) {
      onProductsChanged?.();
    }
  };

  const handleUnhideAll = async () => {
    setUnhidingAll(true);
    await onUnhideAll();
    setUnhidingAll(false);
    onProductsChanged?.();
  };

  // Count how many are uploaded to Shopify
  const uploadedCount = hiddenProducts.filter(p => p.shopify_product_id).length;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <EyeOff className="w-5 h-5" />
            Hidden Products ({hiddenProducts.length})
          </SheetTitle>
          <SheetDescription>
            These products are hidden from view but still exist in your database.
            {uploadedCount > 0 && (
              <span className="block mt-1 text-emerald-600">
                {uploadedCount} of these are uploaded to Shopify.
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        {hiddenProducts.length > 0 && (
          <div className="flex justify-end mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnhideAll}
              disabled={unhidingAll}
            >
              <Eye className="w-4 h-4 mr-2" />
              {unhidingAll ? 'Unhiding...' : `Unhide All (${hiddenProducts.length})`}
            </Button>
          </div>
        )}

        <ScrollArea className="h-[calc(100vh-200px)] mt-4">
          {hiddenProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <EyeOff className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-sm">No hidden products</p>
              <p className="text-xs mt-1">Hidden products will appear here</p>
            </div>
          ) : (
            <div className="space-y-3 pr-4">
              {hiddenProducts.map((product) => (
                <div
                  key={product.id}
                  className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg border border-border"
                >
                  <div className="w-12 h-12 bg-muted rounded flex items-center justify-center flex-shrink-0">
                    <ImageIcon className="w-6 h-6 text-muted-foreground" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">
                        {product.title || product.sku || 'Untitled'}
                      </p>
                      {product.shopify_product_id && (
                        <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Shopify
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {product.brand && `${product.brand} · `}
                      {product.garment_type || 'Unknown type'}
                    </p>
                    {product.price && (
                      <p className="text-xs text-muted-foreground">
                        £{product.price.toFixed(2)}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUnhide(product.id)}
                      disabled={unhiding === product.id}
                      className="text-primary hover:text-primary hover:bg-primary/10"
                      title="Unhide product"
                    >
                      <Eye className={`w-4 h-4 ${unhiding === product.id ? 'animate-pulse' : ''}`} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
