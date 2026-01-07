import { useState, useRef } from 'react';
import { ChevronUp, ChevronDown, ImageIcon, Trash2, GripVertical, ZoomIn, Check, ChevronsUpDown, AlertTriangle, Eraser, Loader2, Undo2, Shirt, User, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useBackgroundRemoval, type BackgroundRemovalOptions } from '@/hooks/use-background-removal';
import { useModelTryOn, type PoseType, type FitStyle } from '@/hooks/use-model-tryon';
import { ModelTryOnDialog } from '@/components/model-tryon/ModelTryOnDialog';
import { supabase } from '@/integrations/supabase/client';
import type { ProductImage, Product } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ImageGalleryProps {
  images: ProductImage[];
  batchId: string;
  productId?: string;
  onUpdateImage: (imageId: string, updates: Partial<ProductImage>) => void;
  onReorderImages: (imageId: string, newPosition: number) => void;
  onDeleteImage?: (imageId: string) => void;
  onMoveImages?: (imageIds: string[], targetProductId: string) => void;
  otherProducts?: Product[];
  currentProductId?: string;
  bgRemovalOptions?: BackgroundRemovalOptions;
  onImageAdded?: () => void;
}

export function ImageGallery({
  images,
  batchId,
  productId,
  onUpdateImage,
  onReorderImages,
  onDeleteImage,
  onMoveImages,
  otherProducts = [],
  currentProductId,
  bgRemovalOptions = {},
  onImageAdded,
}: ImageGalleryProps) {
  const { isProcessing: isRemovingBg, removeBackgroundSingle, applyGhostMannequin } = useBackgroundRemoval();
  const { isProcessing: isModelProcessing, processSingle: processModelSingle } = useModelTryOn();
  const [processingImageId, setProcessingImageId] = useState<string | null>(null);
  const [processingType, setProcessingType] = useState<'bg' | 'ghost' | 'model' | null>(null);
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [previewImage, setPreviewImage] = useState<ProductImage | null>(null);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
  const [moveTargetProductId, setMoveTargetProductId] = useState<string>('');
  const [moveDropdownOpen, setMoveDropdownOpen] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [showModelDialog, setShowModelDialog] = useState(false);
  const [modelDialogImageId, setModelDialogImageId] = useState<string | null>(null);
  const [regeneratingImageId, setRegeneratingImageId] = useState<string | null>(null);
  
  // Track original URLs for individual undo
  const originalUrlsRef = useRef<Map<string, string>>(new Map());

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

  const handleDragStart = (e: React.DragEvent, imageId: string) => {
    setDraggedImageId(imageId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', imageId);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    
    if (!draggedImageId) return;
    
    const draggedImage = images.find(img => img.id === draggedImageId);
    if (!draggedImage) return;
    
    const newPosition = targetIndex + 1; // positions are 1-indexed
    if (newPosition !== draggedImage.position) {
      onReorderImages(draggedImageId, newPosition);
    }
    
    setDraggedImageId(null);
  };

  const handleDragEnd = () => {
    setDraggedImageId(null);
    setDragOverIndex(null);
  };

  const toggleImageSelection = (imageId: string) => {
    setSelectedImageIds(prev => {
      const next = new Set(prev);
      if (next.has(imageId)) {
        next.delete(imageId);
      } else {
        next.add(imageId);
      }
      return next;
    });
  };

  const handleMoveSelected = () => {
    if (selectedImageIds.size === 0 || !moveTargetProductId || !onMoveImages) return;
    onMoveImages(Array.from(selectedImageIds), moveTargetProductId);
    setSelectedImageIds(new Set());
    setMoveTargetProductId('');
    setMoveDropdownOpen(false);
  };

  const selectAll = () => {
    setSelectedImageIds(new Set(images.map(img => img.id)));
  };

  const clearSelection = () => {
    setSelectedImageIds(new Set());
  };

  const handleRemoveBackground = async (image: ProductImage) => {
    setProcessingImageId(image.id);
    setProcessingType('bg');
    
    // Store original URL before processing for undo
    originalUrlsRef.current.set(image.id, image.url);
    
    const newUrl = await removeBackgroundSingle(image.url, batchId, bgRemovalOptions);
    if (newUrl) {
      await supabase
        .from('images')
        .update({ url: newUrl })
        .eq('id', image.id);
      onUpdateImage(image.id, { url: newUrl } as any);
    } else {
      // If failed, remove from undo map
      originalUrlsRef.current.delete(image.id);
    }
    setProcessingImageId(null);
    setProcessingType(null);
  };

  const handleGhostMannequin = async (image: ProductImage) => {
    setProcessingImageId(image.id);
    setProcessingType('ghost');
    
    // Store original URL before processing for undo
    originalUrlsRef.current.set(image.id, image.url);
    
    const newUrl = await applyGhostMannequin(image.url, batchId);
    if (newUrl) {
      await supabase
        .from('images')
        .update({ url: newUrl })
        .eq('id', image.id);
      onUpdateImage(image.id, { url: newUrl } as any);
    } else {
      originalUrlsRef.current.delete(image.id);
    }
    setProcessingImageId(null);
    setProcessingType(null);
  };

  const handleModelTryOn = (imageId: string) => {
    setModelDialogImageId(imageId);
    setShowModelDialog(true);
  };

  const handleModelTryOnConfirm = async (modelId: string, poseId: PoseType, fitStyle: FitStyle) => {
    if (!modelDialogImageId) return;
    
    const image = images.find(i => i.id === modelDialogImageId);
    if (!image) return;
    
    // Get current user for RLS
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('You must be logged in to use this feature');
      return;
    }
    
    // Use the product ID from the image or from props
    const targetProductId = productId || currentProductId || image.product_id;
    if (!targetProductId) {
      toast.error('Cannot determine product for this image');
      return;
    }
    
    setShowModelDialog(false);
    setProcessingImageId(modelDialogImageId);
    setProcessingType('model');
    
    const newUrl = await processModelSingle(image.url, image.id, batchId, modelId, poseId, fitStyle);
    if (newUrl) {
      // Shift existing images to make room at position 0
      for (const existingImg of images) {
        await supabase
          .from('images')
          .update({ position: (existingImg.position || 0) + 1 })
          .eq('id', existingImg.id);
      }
      
      // INSERT new model image at position 0 (front of gallery) instead of replacing
      const { data: newImage, error } = await supabase
        .from('images')
        .insert({
          url: newUrl,
          product_id: targetProductId,
          batch_id: batchId,
          position: 0,
          include_in_shopify: true,
          user_id: user.id,
          source: 'model_tryon'
        })
        .select()
        .single();
      
      if (!error && newImage) {
        // Store for undo - we'll delete the new image on undo
        originalUrlsRef.current.set(newImage.id, '__new_image__');
        toast.success('Model image added');
        // Notify parent to refresh images
        if (onImageAdded) {
          onImageAdded();
        }
      } else if (error) {
        console.error('Failed to insert model image:', error);
        toast.error('Failed to add model image');
      }
    } else {
      toast.error('Model try-on failed');
    }
    setProcessingImageId(null);
    setProcessingType(null);
    setModelDialogImageId(null);
  };

  // Regenerate AI model image with new style
  const handleRegenerateModel = async (image: ProductImage) => {
    if ((image as any).source !== 'model_tryon') return;
    
    // Find the original product image (non-AI) to use as source
    const originalImages = images.filter(img => (img as any).source !== 'model_tryon');
    if (originalImages.length === 0) {
      toast.error('No original product image found to regenerate from');
      return;
    }
    
    // Get current user for RLS
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('You must be logged in');
      return;
    }
    
    setRegeneratingImageId(image.id);
    
    // Use default settings for regeneration (new style variation)
    const modelIds = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444'];
    const poses = ['front_neutral', 'three_quarter', 'relaxed', 'arms_bent', 'movement'];
    
    // Randomly pick pose for variety, keep same model category (male/female based on current)
    const randomPose = poses[Math.floor(Math.random() * poses.length)] as PoseType;
    // Keep model consistent - pick first male or female model
    const defaultModelId = modelIds[0]; // Alex - default
    
    const newUrl = await processModelSingle(
      originalImages[0].url, 
      originalImages[0].id, 
      batchId, 
      defaultModelId, 
      randomPose, 
      'regular' as FitStyle
    );
    
    if (newUrl) {
      // Update the existing AI image with new URL
      const { error } = await supabase
        .from('images')
        .update({ url: newUrl })
        .eq('id', image.id);
      
      if (!error) {
        onUpdateImage(image.id, { url: newUrl } as any);
        toast.success('Model image regenerated with new style');
      } else {
        toast.error('Failed to update image');
      }
    } else {
      toast.error('Regeneration failed');
    }
    
    setRegeneratingImageId(null);
  };

  const handleUndoBackground = async (image: ProductImage) => {
    const originalUrl = originalUrlsRef.current.get(image.id);
    if (!originalUrl) return;
    
    // Check if this was a newly added model image (should be deleted instead of restored)
    if (originalUrl === '__new_image__') {
      // Delete the newly added model image
      const { error } = await supabase
        .from('images')
        .delete()
        .eq('id', image.id);
      
      if (!error) {
        originalUrlsRef.current.delete(image.id);
        toast.success('Model image removed');
        if (onImageAdded) {
          onImageAdded(); // Refresh to show updated list
        }
      } else {
        toast.error('Failed to remove model image');
      }
      return;
    }
    
    // Restore original URL for bg removal / ghost mannequin
    const { error } = await supabase
      .from('images')
      .update({ url: originalUrl })
      .eq('id', image.id);
    
    if (!error) {
      onUpdateImage(image.id, { url: originalUrl } as any);
      originalUrlsRef.current.delete(image.id);
      toast.success('Image restored to original');
    } else {
      toast.error('Failed to restore image');
    }
  };

  const canUndo = (imageId: string) => originalUrlsRef.current.has(imageId);

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ImageIcon className="w-12 h-12 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">No images for this product</p>
      </div>
    );
  }

  const availableProducts = otherProducts.filter(p => p.id !== currentProductId);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">
            Images ({images.length})
          </h3>
          {images.length > 1 && (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={selectedImageIds.size === images.length ? clearSelection : selectAll}
                className="text-xs h-7"
              >
                {selectedImageIds.size === images.length ? 'Clear' : 'Select All'}
              </Button>
            </div>
          )}
        </div>

        {/* Move selected images UI */}
        {selectedImageIds.size > 0 && availableProducts.length > 0 && onMoveImages && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border">
            <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
              {selectedImageIds.size} selected
            </span>
            <Popover open={moveDropdownOpen} onOpenChange={setMoveDropdownOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={moveDropdownOpen}
                  className="h-8 text-xs min-w-0 flex-1 justify-between overflow-hidden"
                >
                  <span className="truncate">
                    {moveTargetProductId
                      ? (availableProducts.find(p => p.id === moveTargetProductId)?.title || 
                         `Product ${availableProducts.findIndex(p => p.id === moveTargetProductId) + 1}`)
                      : "Move to product..."}
                  </span>
                  <ChevronsUpDown className="ml-2 h-3 w-3 flex-shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search products..." className="h-9" />
                  <CommandList>
                    <CommandEmpty>No product found.</CommandEmpty>
                    <CommandGroup>
                      {availableProducts.map((product, index) => (
                        <CommandItem
                          key={product.id}
                          value={product.title || `Product ${index + 1}`}
                          onSelect={() => {
                            setMoveTargetProductId(product.id);
                            setMoveDropdownOpen(false);
                          }}
                          className="text-xs"
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4 flex-shrink-0",
                              moveTargetProductId === product.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="truncate">
                            {product.title || `Product ${index + 1}`}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Button
              size="sm"
              className="h-8 text-xs flex-shrink-0"
              onClick={handleMoveSelected}
              disabled={!moveTargetProductId}
            >
              Move
            </Button>
          </div>
        )}
        
        <div className="space-y-2">
          {images.map((image, index) => (
            <div
              key={image.id}
              draggable
              onDragStart={(e) => handleDragStart(e, image.id)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={cn(
                "flex gap-3 p-2 rounded-lg border border-border bg-card cursor-grab active:cursor-grabbing transition-all",
                draggedImageId === image.id && "opacity-40 scale-95",
                dragOverIndex === index && draggedImageId !== image.id && "border-primary border-2 bg-primary/5",
                selectedImageIds.has(image.id) && "ring-2 ring-primary bg-primary/5"
              )}
            >
              {/* Selection checkbox */}
              {availableProducts.length > 0 && onMoveImages && (
                <div className="flex items-center">
                  <Checkbox
                    checked={selectedImageIds.has(image.id)}
                    onCheckedChange={() => toggleImageSelection(image.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}

              {/* Drag handle */}
              <div className="flex items-center text-muted-foreground">
                <GripVertical className="w-4 h-4" />
              </div>

              {/* Thumbnail with expand */}
              <div 
                className="w-20 h-20 flex-shrink-0 rounded overflow-hidden bg-muted relative group cursor-pointer"
                onClick={() => !failedImages.has(image.id) && setPreviewImage(image)}
              >
                {failedImages.has(image.id) ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-destructive/10 text-destructive">
                    <AlertTriangle className="w-5 h-5 mb-1" />
                    <span className="text-[10px] font-medium">Error</span>
                  </div>
                ) : (
                  <>
                    <img
                      src={image.url}
                      alt={`Product image ${index + 1}`}
                      className="w-full h-full object-cover"
                      draggable={false}
                      onError={() => setFailedImages(prev => new Set(prev).add(image.id))}
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <ZoomIn className="w-5 h-5 text-white" />
                    </div>
                    {/* Source badge */}
                    {(image as any).source === 'model_tryon' && (
                      <div className="absolute top-1 left-1 bg-emerald-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                        <User className="w-2.5 h-2.5" />
                        AI
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Controls */}
              <div className="flex-1 flex flex-col justify-between min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">
                    Image {image.position}
                  </span>
                  <div className="flex gap-1 flex-shrink-0">
                    {/* Regenerate button for AI model images */}
                    {(image as any).source === 'model_tryon' && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            onClick={() => handleRegenerateModel(image)}
                            disabled={isModelProcessing || regeneratingImageId === image.id}
                          >
                            {regeneratingImageId === image.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Regenerate with new style</TooltipContent>
                      </Tooltip>
                    )}
                    {/* Undo button - always visible, disabled when nothing to undo */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-7 w-7",
                            canUndo(image.id) 
                              ? "text-orange-600 hover:text-orange-700 hover:bg-orange-50" 
                              : "text-muted-foreground/40"
                          )}
                          onClick={() => handleUndoBackground(image)}
                          disabled={!canUndo(image.id)}
                        >
                          <Undo2 className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {canUndo(image.id) ? 'Undo changes' : 'No changes to undo'}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleRemoveBackground(image)}
                          disabled={isRemovingBg}
                        >
                          {processingImageId === image.id && processingType === 'bg' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Eraser className="w-4 h-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Remove background</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleGhostMannequin(image)}
                          disabled={isRemovingBg || isModelProcessing}
                        >
                          {processingImageId === image.id && processingType === 'ghost' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Shirt className="w-4 h-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Ghost mannequin (remove hanger)</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          onClick={() => handleModelTryOn(image.id)}
                          disabled={isRemovingBg || isModelProcessing}
                        >
                          {processingImageId === image.id && processingType === 'model' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <User className="w-4 h-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Place on AI model</TooltipContent>
                    </Tooltip>
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
                    {onDeleteImage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => onDeleteImage(image.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
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

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-3xl p-2 bg-background">
          {previewImage && (
            <div className="relative">
              <img
                src={previewImage.url}
                alt="Preview"
                className="w-full h-auto max-h-[80vh] object-contain rounded"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Model Try-On Dialog */}
      <ModelTryOnDialog
        open={showModelDialog}
        onOpenChange={setShowModelDialog}
        onConfirm={handleModelTryOnConfirm}
        isProcessing={isModelProcessing}
        imageCount={1}
      />
    </TooltipProvider>
  );
}