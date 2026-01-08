import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
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
import type { ProductImage } from '@/types';

interface DeletedImage extends ProductImage {
  deleted_at: string;
}

interface DeletedImagesPanelProps {
  open: boolean;
  onClose: () => void;
  deletedImages: DeletedImage[];
  onRecover: (id: string) => Promise<boolean>;
  onPermanentDelete: (id: string) => Promise<boolean>;
  onEmptyTrash: () => Promise<boolean>;
  onRecoverAll: () => Promise<boolean>;
  onImagesChanged?: () => void;
}

export function DeletedImagesPanel({
  open,
  onClose,
  deletedImages,
  onRecover,
  onPermanentDelete,
  onEmptyTrash,
  onRecoverAll,
  onImagesChanged,
}: DeletedImagesPanelProps) {
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [recovering, setRecovering] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [recoveringAll, setRecoveringAll] = useState(false);

  const handleRecover = async (id: string) => {
    setRecovering(id);
    const success = await onRecover(id);
    setRecovering(null);
    if (success) {
      onImagesChanged?.();
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

  const handleRecoverAll = async () => {
    setRecoveringAll(true);
    const success = await onRecoverAll();
    setRecoveringAll(false);
    if (success) {
      onImagesChanged?.();
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              Deleted Images ({deletedImages.length})
            </SheetTitle>
            <SheetDescription>
              Recover deleted images or permanently remove them. Deleted images can be restored.
            </SheetDescription>
          </SheetHeader>

          {deletedImages.length > 0 && (
            <div className="flex justify-between gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRecoverAll}
                disabled={recoveringAll}
              >
                <RotateCcw className={`w-4 h-4 mr-2 ${recoveringAll ? 'animate-spin' : ''}`} />
                Recover All
              </Button>
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
            {deletedImages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Trash2 className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-sm">No deleted images</p>
                <p className="text-xs mt-1">Deleted images will appear here</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 pr-4">
                {deletedImages.map((image) => (
                  <div
                    key={image.id}
                    className="relative group bg-muted/50 rounded-lg border border-border overflow-hidden"
                  >
                    <div className="aspect-square">
                      <img
                        src={image.url}
                        alt="Deleted image"
                        className="w-full h-full object-cover opacity-60"
                      />
                    </div>
                    
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                      <p className="text-xs text-white/80 truncate">
                        {formatDistanceToNow(new Date(image.deleted_at), { addSuffix: true })}
                      </p>
                    </div>

                    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-8 w-8 bg-white/90 hover:bg-white"
                        onClick={() => handleRecover(image.id)}
                        disabled={recovering === image.id}
                        title="Recover image"
                      >
                        <RotateCcw className={`w-4 h-4 text-primary ${recovering === image.id ? 'animate-spin' : ''}`} />
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-8 w-8 bg-white/90 hover:bg-white"
                        onClick={() => setConfirmDeleteId(image.id)}
                        disabled={deleting === image.id}
                        title="Permanently delete"
                      >
                        <X className="w-4 h-4 text-destructive" />
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
              Empty Image Trash?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {deletedImages.length} images in the trash.
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
              This will permanently delete this image. This action cannot be undone.
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
