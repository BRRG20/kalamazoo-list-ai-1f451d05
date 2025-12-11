import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Trash2, RotateCcw, AlertTriangle, ImageIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Product } from '@/types';

interface DeletedProduct extends Product {
  deleted_at: string;
}

interface DeletedProductsPanelProps {
  open: boolean;
  onClose: () => void;
  deletedProducts: DeletedProduct[];
  onRecover: (id: string) => Promise<boolean>;
  onPermanentDelete: (id: string) => Promise<boolean>;
  onEmptyTrash: () => Promise<boolean>;
  onProductsChanged?: () => void;
}

export function DeletedProductsPanel({
  open,
  onClose,
  deletedProducts,
  onRecover,
  onPermanentDelete,
  onEmptyTrash,
  onProductsChanged,
}: DeletedProductsPanelProps) {
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [recovering, setRecovering] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleRecover = async (id: string) => {
    setRecovering(id);
    const success = await onRecover(id);
    setRecovering(null);
    if (success) {
      onProductsChanged?.();
    }
  };

  const handlePermanentDelete = async (id: string) => {
    setDeleting(id);
    await onPermanentDelete(id);
    setDeleting(null);
    setConfirmDeleteId(null);
  };

  const handleEmptyTrash = async () => {
    await onEmptyTrash();
    setConfirmEmptyTrash(false);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              Deleted Products ({deletedProducts.length})
            </SheetTitle>
            <SheetDescription>
              Recover deleted products or permanently remove them. Items are soft-deleted and can be recovered.
            </SheetDescription>
          </SheetHeader>

          {deletedProducts.length > 0 && (
            <div className="flex justify-end mt-4">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmEmptyTrash(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Empty Trash
              </Button>
            </div>
          )}

          <ScrollArea className="h-[calc(100vh-200px)] mt-4">
            {deletedProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Trash2 className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-sm">No deleted products</p>
                <p className="text-xs mt-1">Deleted products will appear here</p>
              </div>
            ) : (
              <div className="space-y-3 pr-4">
                {deletedProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg border border-border"
                  >
                    <div className="w-12 h-12 bg-muted rounded flex items-center justify-center flex-shrink-0">
                      <ImageIcon className="w-6 h-6 text-muted-foreground" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {product.title || product.sku || 'Untitled'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        SKU: {product.sku}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Deleted {formatDistanceToNow(new Date(product.deleted_at), { addSuffix: true })}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRecover(product.id)}
                        disabled={recovering === product.id}
                        className="text-primary hover:text-primary hover:bg-primary/10"
                        title="Recover product"
                      >
                        <RotateCcw className={`w-4 h-4 ${recovering === product.id ? 'animate-spin' : ''}`} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDeleteId(product.id)}
                        disabled={deleting === product.id}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        title="Permanently delete"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Confirm Empty Trash */}
      <AlertDialog open={confirmEmptyTrash} onOpenChange={setConfirmEmptyTrash}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Empty Trash?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {deletedProducts.length} products in the trash.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEmptyTrash}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Empty Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Permanent Delete */}
      <AlertDialog open={!!confirmDeleteId} onOpenChange={() => setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this product. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDeleteId && handlePermanentDelete(confirmDeleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
