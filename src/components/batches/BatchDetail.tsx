import { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  Sparkles, 
  ImageMinus, 
  ShoppingBag, 
  Grid3X3,
  Loader2,
  AlertCircle,
  Image as ImageIcon,
  ArrowLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { ProductCard } from './ProductCard';
import { useSettings } from '@/hooks/use-database';
import type { Batch, Product, ProductImage } from '@/types';

interface BatchDetailProps {
  batch: Batch;
  products: Product[];
  getProductImages: (productId: string) => Promise<ProductImage[]>;
  onUploadImages: (files: File[]) => void;
  onAutoGroup: (imagesPerProduct: number) => void;
  onGenerateAll: () => void;
  onExcludeLast2All: () => void;
  onCreateInShopify: (productIds: string[]) => void;
  onEditProduct: (productId: string) => void;
  onToggleProductSelection: (productId: string) => void;
  selectedProductIds: Set<string>;
  isGenerating: boolean;
  generationProgress: { current: number; total: number };
  isCreatingShopify: boolean;
  pendingImageCount: number;
  isUploading: boolean;
  uploadProgress: number;
  uploadStartTime: number | null;
  uploadTotal: number;
  uploadCompleted: number;
  onBack?: () => void;
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
  generationProgress,
  isCreatingShopify,
  pendingImageCount,
  isUploading,
  uploadProgress,
  uploadStartTime,
  uploadTotal,
  uploadCompleted,
  onBack,
}: BatchDetailProps) {
  const { settings, isShopifyConfigured } = useSettings();
  const [imagesPerProduct, setImagesPerProduct] = useState(settings?.default_images_per_product || 9);
  const [productImages, setProductImages] = useState<Record<string, ProductImage[]>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shopifyConfigured = isShopifyConfigured();

  // Update imagesPerProduct when settings load
  useEffect(() => {
    if (settings?.default_images_per_product) {
      setImagesPerProduct(settings.default_images_per_product);
    }
  }, [settings?.default_images_per_product]);

  // Fetch images for all products
  useEffect(() => {
    const fetchAllImages = async () => {
      const imagesMap: Record<string, ProductImage[]> = {};
      for (const product of products) {
        imagesMap[product.id] = await getProductImages(product.id);
      }
      setProductImages(imagesMap);
    };
    fetchAllImages();
  }, [products, getProductImages]);

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
    <div className="min-h-full flex flex-col">
      {/* Header */}
      <div className="p-3 md:p-4 border-b border-border bg-card">
        <div className="flex items-center gap-3 mb-3 md:mb-4">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="md:hidden flex-shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg md:text-xl font-semibold text-foreground truncate">{batch.name}</h2>
            {batch.notes && (
              <p className="text-sm text-muted-foreground mt-0.5 truncate">{batch.notes}</p>
            )}
          </div>
        </div>

        {/* Upload progress */}
        {isUploading && (
          <div className="mb-4 p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">
                  Uploading {uploadCompleted} of {uploadTotal} images...
                </span>
              </div>
              {uploadStartTime && uploadCompleted > 0 && (
                <span className="text-sm text-muted-foreground">
                  {(() => {
                    const elapsed = (Date.now() - uploadStartTime) / 1000;
                    const rate = uploadCompleted / elapsed;
                    const remaining = (uploadTotal - uploadCompleted) / rate;
                    if (remaining < 60) {
                      return `~${Math.ceil(remaining)}s remaining`;
                    }
                    return `~${Math.ceil(remaining / 60)}m remaining`;
                  })()}
                </span>
              )}
            </div>
            <Progress value={uploadProgress} className="h-2" />
          </div>
        )}

        {/* AI generation progress */}
        {isGenerating && generationProgress.total > 0 && (
          <div className="mb-4 p-3 bg-primary/10 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm text-foreground">
                Generating AI... {generationProgress.current} of {generationProgress.total} products
              </span>
            </div>
            <Progress value={(generationProgress.current / generationProgress.total) * 100} className="h-2" />
          </div>
        )}

        {/* Pending images indicator */}
        {pendingImageCount > 0 && !isUploading && (
          <div className="mb-4 p-3 bg-primary/10 rounded-lg flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-primary" />
            <span className="text-sm text-foreground">
              {pendingImageCount} image(s) ready. Set images per product and click "Auto-group".
            </span>
          </div>
        )}

        {/* Actions bar */}
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
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
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="text-xs md:text-sm"
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 mr-1 md:mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-1 md:mr-2" />
            )}
            <span className="hidden sm:inline">Upload</span> Images
          </Button>

          <div className="flex items-center gap-1 md:gap-2">
            <Label htmlFor="imagesPerProduct" className="text-xs md:text-sm whitespace-nowrap hidden sm:inline">
              Per product:
            </Label>
            <Input
              id="imagesPerProduct"
              type="number"
              min={1}
              max={20}
              value={imagesPerProduct}
              onChange={(e) => setImagesPerProduct(parseInt(e.target.value) || 1)}
              className="w-14 md:w-16 h-8 md:h-9 text-sm"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onAutoGroup(imagesPerProduct)}
            disabled={pendingImageCount === 0}
            className="text-xs md:text-sm"
          >
            <Grid3X3 className="w-4 h-4 mr-1 md:mr-2" />
            <span className="hidden sm:inline">Auto-</span>group
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={onGenerateAll}
            disabled={isGenerating || products.length === 0}
            className="text-xs md:text-sm"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 mr-1 md:mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-1 md:mr-2" />
            )}
            <span className="hidden sm:inline">Generate</span> AI
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onExcludeLast2All}
            disabled={products.length === 0}
            className="text-xs md:text-sm hidden md:flex"
          >
            <ImageMinus className="w-4 h-4 mr-2" />
            Exclude Last 2 Images
          </Button>
        </div>

        {/* Shopify row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-3 pt-3 border-t border-border">
          {!shopifyConfigured && (
            <Alert variant="default" className="flex-1">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Shopify not connected. Go to Settings to add store URL and API key.
              </AlertDescription>
            </Alert>
          )}
          
          {shopifyConfigured && (
            <>
              <div className="flex items-center justify-between sm:justify-start gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">
                  {selectedProductIds.size} selected
                </span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={selectAllProducts} type="button">
                    Select all
                  </Button>
                  <Button variant="ghost" size="sm" onClick={deselectAllProducts} type="button">
                    Clear
                  </Button>
                </div>
              </div>
              <Button
                onClick={handleCreateInShopify}
                disabled={isCreatingShopify || selectedProductIds.size === 0}
                className="w-full sm:w-auto h-11 sm:h-10 text-base sm:text-sm"
                type="button"
              >
                {isCreatingShopify ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <ShoppingBag className="w-5 h-5 mr-2" />
                )}
                Upload to Shopify ({selectedProductIds.size})
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Products grid */}
      <div className="flex-1 p-4">
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
                images={productImages[product.id] || []}
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
