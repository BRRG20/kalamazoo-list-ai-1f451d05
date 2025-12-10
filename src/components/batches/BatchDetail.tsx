import { useState, useRef } from 'react';
import { 
  Upload, 
  Sparkles, 
  ImageMinus, 
  ShoppingBag, 
  Grid3X3,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ProductCard } from './ProductCard';
import type { Batch, Product, ProductImage } from '@/types';
import { isShopifyConfigured, getSettings } from '@/lib/store';

interface BatchDetailProps {
  batch: Batch;
  products: Product[];
  getProductImages: (productId: string) => ProductImage[];
  onUploadImages: (files: File[]) => void;
  onAutoGroup: (imagesPerProduct: number) => void;
  onGenerateAll: () => void;
  onExcludeLast2All: () => void;
  onCreateInShopify: (productIds: string[]) => void;
  onEditProduct: (productId: string) => void;
  onToggleProductSelection: (productId: string) => void;
  selectedProductIds: Set<string>;
  isGenerating: boolean;
  isCreatingShopify: boolean;
}

export function BatchDetail({
  batch,
  products,
  getProductImages,
  onUploadImages,
  onAutoGroup,
  onGenerateAll,
  onExcludeLast2All,
  onCreateInShopify,
  onEditProduct,
  onToggleProductSelection,
  selectedProductIds,
  isGenerating,
  isCreatingShopify,
}: BatchDetailProps) {
  const settings = getSettings();
  const [imagesPerProduct, setImagesPerProduct] = useState(settings.default_images_per_product);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shopifyConfigured = isShopifyConfigured();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onUploadImages(Array.from(files));
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCreateInShopify = () => {
    const ids = Array.from(selectedProductIds);
    if (ids.length > 0) {
      onCreateInShopify(ids);
    }
  };

  const selectAllProducts = () => {
    products.forEach(p => {
      if (!selectedProductIds.has(p.id)) {
        onToggleProductSelection(p.id);
      }
    });
  };

  const deselectAllProducts = () => {
    selectedProductIds.forEach(id => {
      onToggleProductSelection(id);
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border bg-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">{batch.name}</h2>
            {batch.notes && (
              <p className="text-sm text-muted-foreground mt-1">{batch.notes}</p>
            )}
          </div>
        </div>

        {/* Actions bar */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Images
          </Button>

          <div className="flex items-center gap-2">
            <Label htmlFor="imagesPerProduct" className="text-sm whitespace-nowrap">
              Images per product:
            </Label>
            <Input
              id="imagesPerProduct"
              type="number"
              min={1}
              max={20}
              value={imagesPerProduct}
              onChange={(e) => setImagesPerProduct(parseInt(e.target.value) || 1)}
              className="w-16"
            />
          </div>

          <Button
            variant="outline"
            onClick={() => onAutoGroup(imagesPerProduct)}
          >
            <Grid3X3 className="w-4 h-4 mr-2" />
            Auto-group
          </Button>

          <Button
            variant="default"
            onClick={onGenerateAll}
            disabled={isGenerating || products.length === 0}
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Generate AI for All
          </Button>

          <Button
            variant="outline"
            onClick={onExcludeLast2All}
            disabled={products.length === 0}
          >
            <ImageMinus className="w-4 h-4 mr-2" />
            Exclude Last 2 Images
          </Button>
        </div>

        {/* Shopify row */}
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
          {!shopifyConfigured && (
            <Alert variant="default" className="flex-1">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Shopify is not connected. Go to Settings to add your store URL and API key.
              </AlertDescription>
            </Alert>
          )}
          
          {shopifyConfigured && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {selectedProductIds.size} selected
                </span>
                <Button variant="ghost" size="sm" onClick={selectAllProducts}>
                  Select all
                </Button>
                <Button variant="ghost" size="sm" onClick={deselectAllProducts}>
                  Clear
                </Button>
              </div>
              <Button
                onClick={handleCreateInShopify}
                disabled={isCreatingShopify || selectedProductIds.size === 0}
              >
                {isCreatingShopify ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ShoppingBag className="w-4 h-4 mr-2" />
                )}
                Create in Shopify ({selectedProductIds.size})
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Products grid */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        {products.length === 0 ? (
          <div className="text-center py-16">
            <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium text-foreground mb-2">No products yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Upload images to this batch, then auto-group them into products.
            </p>
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" />
              Upload Images
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                images={getProductImages(product.id)}
                isSelected={selectedProductIds.has(product.id)}
                onToggleSelect={() => onToggleProductSelection(product.id)}
                onEdit={() => onEditProduct(product.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
