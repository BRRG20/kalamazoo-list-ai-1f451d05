import { CheckCircle, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ShopifySuccessDialogProps {
  open: boolean;
  onClose: () => void;
  successCount: number;
  errorCount: number;
  storeUrl?: string;
}

export function ShopifySuccessDialog({
  open,
  onClose,
  successCount,
  errorCount,
  storeUrl,
}: ShopifySuccessDialogProps) {
  // Extract store name from URL for the products link
  const getShopifyProductsUrl = () => {
    if (!storeUrl) return null;
    
    // Handle different URL formats
    let storeName = storeUrl;
    const myshopifyMatch = storeUrl.match(/([^./]+)\.myshopify\.com/);
    if (myshopifyMatch) {
      storeName = myshopifyMatch[1];
    }
    
    return `https://admin.shopify.com/store/${storeName}/products`;
  };

  const productsUrl = getShopifyProductsUrl();

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-primary" />
            </div>
            <DialogTitle className="text-xl">
              {errorCount > 0 ? 'Upload Complete' : 'Success!'}
            </DialogTitle>
          </div>
          <DialogDescription className="text-base pt-2">
            {errorCount > 0 ? (
              <>
                Created <span className="font-semibold text-foreground">{successCount}</span> product(s) in Shopify.{' '}
                <span className="text-destructive font-medium">{errorCount} failed.</span>
              </>
            ) : (
              <>
                Created <span className="font-semibold text-foreground">{successCount}</span> product(s) in Shopify successfully!
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 mt-4">
          {productsUrl && (
            <Button
              variant="outline"
              onClick={() => window.open(productsUrl, '_blank')}
              className="w-full"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              View in Shopify
            </Button>
          )}
          <Button onClick={onClose} className="w-full">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
