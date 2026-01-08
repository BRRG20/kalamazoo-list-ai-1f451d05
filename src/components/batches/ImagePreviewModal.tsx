import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, Pencil, Download, FolderDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { ImageEditCanvas } from '@/components/image-edit/ImageEditCanvas';
import { downloadImage, downloadAllAsZip } from '@/lib/image-download';
import { toast } from 'sonner';

interface ImagePreviewModalProps {
  images: string[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
  onImageUpdated?: (index: number, newUrl: string) => void;
  productName?: string;
}

export function ImagePreviewModal({
  images,
  initialIndex,
  open,
  onClose,
  onImageUpdated,
  productName,
}: ImagePreviewModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isEditing, setIsEditing] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, open]);

  // Reset editing mode when modal closes
  useEffect(() => {
    if (!open) {
      setIsEditing(false);
    }
  }, [open]);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length]);

  // Keyboard navigation - disabled when editing
  useEffect(() => {
    if (!open || isEditing) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        goToPrevious();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isEditing, goToPrevious, goToNext, onClose]);

  const handleEditSave = (newUrl: string) => {
    if (onImageUpdated) {
      onImageUpdated(currentIndex, newUrl);
    }
    setIsEditing(false);
  };

  const handleDownload = async () => {
    try {
      await downloadImage(currentImage, `image-${currentIndex + 1}`);
      toast.success('Image downloaded');
    } catch {
      toast.error('Failed to download image');
    }
  };

  const handleDownloadAll = async () => {
    if (images.length === 0) return;
    
    setIsDownloadingAll(true);
    try {
      const zipName = productName 
        ? productName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
        : 'product-images';
      await downloadAllAsZip(images, zipName);
      toast.success(`Downloaded ${images.length} images as zip`);
    } catch (error) {
      toast.error('Failed to download images');
    } finally {
      setIsDownloadingAll(false);
    }
  };

  if (!images.length) return null;

  const currentImage = images[currentIndex];

  return (
    <Dialog open={open} onOpenChange={isEditing ? undefined : onClose}>
      <DialogContent className={`p-0 bg-background/95 backdrop-blur-sm border-border ${isEditing ? 'max-w-[95vw] w-[95vw] h-[90vh] max-h-[90vh]' : 'max-w-[95vw] max-h-[95vh] w-auto h-auto'}`}>
        <VisuallyHidden>
          <DialogTitle>{isEditing ? 'Edit Image' : 'Image Preview'}</DialogTitle>
        </VisuallyHidden>
        
        {isEditing ? (
          <ImageEditCanvas
            imageUrl={currentImage}
            onSave={handleEditSave}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          <>
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-3 bg-gradient-to-b from-background/80 to-transparent z-10">
              <span className="text-sm font-medium text-foreground bg-background/60 px-2 py-1 rounded">
                {currentIndex + 1} of {images.length}
              </span>
              <div className="flex items-center gap-2">
                {onImageUpdated && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsEditing(true)}
                    className="h-8 w-8 bg-background/60 hover:bg-background/80"
                    title="Edit / Erase"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDownload}
                  className="h-8 w-8 bg-background/60 hover:bg-background/80"
                  title="Download this image"
                >
                  <Download className="h-4 w-4" />
                </Button>
                {images.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleDownloadAll}
                    disabled={isDownloadingAll}
                    className="h-8 w-8 bg-background/60 hover:bg-background/80"
                    title="Download all as zip"
                  >
                    {isDownloadingAll ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FolderDown className="h-4 w-4" />
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => window.open(currentImage, '_blank')}
                  className="h-8 w-8 bg-background/60 hover:bg-background/80"
                  title="Open full size"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-8 w-8 bg-background/60 hover:bg-background/80"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Main image */}
            <div className="flex items-center justify-center min-h-[50vh] max-h-[80vh] p-12">
              <img
                src={currentImage}
                alt={`Image ${currentIndex + 1}`}
                className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-lg"
              />
            </div>

            {/* Navigation buttons */}
            {images.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={goToPrevious}
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-12 w-12 bg-background/60 hover:bg-background/80 rounded-full"
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={goToNext}
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-12 w-12 bg-background/60 hover:bg-background/80 rounded-full"
                >
                  <ChevronRight className="h-6 w-6" />
                </Button>
              </>
            )}

            {/* Thumbnail strip */}
            {images.length > 1 && (
              <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-background/80 to-transparent">
                <div className="flex justify-center gap-2 overflow-x-auto py-2 max-w-full">
                  {images.map((url, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentIndex(index)}
                      className={`flex-shrink-0 w-12 h-12 rounded overflow-hidden border-2 transition-all ${
                        index === currentIndex
                          ? 'border-primary ring-2 ring-primary/30 scale-110'
                          : 'border-border hover:border-primary/50 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={url}
                        alt={`Thumbnail ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
