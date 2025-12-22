import { useState } from 'react';
import { Check, AlertCircle, Clock, Upload, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { Product } from '@/types';

interface ShopifyStatusSectionProps {
  product: Product;
  onMarkAsUploaded: (shopifyProductId?: string) => void;
  onMarkAsPending: () => void;
  compact?: boolean;
}

type ShopifyStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';

function getShopifyStatus(product: Product): ShopifyStatus {
  if (product.status === 'error') return 'failed';
  if (product.shopify_product_id || product.status === 'created_in_shopify') return 'uploaded';
  // Could add 'uploading' state if we track it
  return 'pending';
}

export function ShopifyStatusSection({
  product,
  onMarkAsUploaded,
  onMarkAsPending,
  compact = false,
}: ShopifyStatusSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [shopifyIdInput, setShopifyIdInput] = useState('');

  const status = getShopifyStatus(product);

  const handleMarkAsUploaded = () => {
    onMarkAsUploaded(shopifyIdInput.trim() || undefined);
    setShopifyIdInput('');
    setDialogOpen(false);
  };

  const handleMarkAsPending = () => {
    onMarkAsPending();
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return null;
    }
  };

  if (compact) {
    // Compact version for ProductCard
    return (
      <div className="text-xs space-y-1 mt-2 pt-2 border-t border-border">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Status:</span>
          <StatusBadge status={status} />
        </div>
        
        {status === 'uploaded' && (
          <>
            {product.uploaded_at && (
              <div className="text-muted-foreground truncate">
                Uploaded: {formatDate(product.uploaded_at)}
              </div>
            )}
            {product.shopify_product_id && (
              <div className="text-muted-foreground truncate">
                ID: {product.shopify_product_id}
              </div>
            )}
          </>
        )}
        
        {status === 'failed' && product.upload_error && (
          <div className="text-destructive truncate" title={product.upload_error}>
            Error: {product.upload_error}
          </div>
        )}
        
        {/* Compact action buttons */}
        <div className="flex gap-1 mt-1">
          {status !== 'uploaded' && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-6 text-xs px-2">
                  <Check className="w-3 h-3 mr-1" />
                  Mark Uploaded
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Mark as Uploaded to Shopify</DialogTitle>
                  <DialogDescription>
                    Manually mark this product as uploaded. Optionally enter the Shopify Product ID if known.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Label htmlFor="shopify-id">Shopify Product ID (optional)</Label>
                  <Input
                    id="shopify-id"
                    value={shopifyIdInput}
                    onChange={(e) => setShopifyIdInput(e.target.value)}
                    placeholder="e.g., 1234567890"
                    className="mt-1"
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleMarkAsUploaded}>
                    <Check className="w-4 h-4 mr-2" />
                    Confirm
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          
          {status === 'uploaded' && (
            <Button 
              variant="outline" 
              size="sm" 
              className="h-6 text-xs px-2"
              onClick={handleMarkAsPending}
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Mark Pending
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Full version for ProductDetailPanel
  return (
    <div className="p-4 border border-border rounded-lg bg-muted/30 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">Shopify Upload Status</h4>
        <StatusBadge status={status} />
      </div>
      
      {status === 'uploaded' && (
        <div className="space-y-1 text-sm">
          {product.uploaded_at && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Uploaded at:</span>
              <span>{formatDate(product.uploaded_at)}</span>
            </div>
          )}
          {product.shopify_product_id && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Shopify ID:</span>
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                {product.shopify_product_id}
              </code>
            </div>
          )}
        </div>
      )}
      
      {status === 'failed' && product.upload_error && (
        <div className="text-sm">
          <div className="flex items-start gap-2 text-destructive">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{product.upload_error}</span>
          </div>
        </div>
      )}
      
      <div className="flex gap-2 pt-2">
        {status !== 'uploaded' && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="default" size="sm">
                <Check className="w-4 h-4 mr-2" />
                Mark as Uploaded
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Mark as Uploaded to Shopify</DialogTitle>
                <DialogDescription>
                  Manually mark this product as uploaded. Optionally enter the Shopify Product ID if known.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Label htmlFor="shopify-id-full">Shopify Product ID (optional)</Label>
                <Input
                  id="shopify-id-full"
                  value={shopifyIdInput}
                  onChange={(e) => setShopifyIdInput(e.target.value)}
                  placeholder="e.g., 1234567890"
                  className="mt-1"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleMarkAsUploaded}>
                  <Check className="w-4 h-4 mr-2" />
                  Confirm
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        
        {status === 'uploaded' && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleMarkAsPending}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Mark as Pending
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ShopifyStatus }) {
  const config = {
    pending: {
      icon: Clock,
      label: 'Pending',
      className: 'bg-muted text-muted-foreground',
    },
    uploading: {
      icon: Upload,
      label: 'Uploading',
      className: 'bg-blue-500/10 text-blue-600',
    },
    uploaded: {
      icon: Check,
      label: 'Uploaded',
      className: 'bg-success/10 text-success',
    },
    failed: {
      icon: AlertCircle,
      label: 'Failed',
      className: 'bg-destructive/10 text-destructive',
    },
  };

  const { icon: Icon, label, className } = config[status];

  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
      className
    )}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}
