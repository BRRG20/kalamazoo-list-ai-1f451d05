import { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Upload, X, Check, ChevronLeft, AlertCircle, Image as ImageIcon, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface CapturedImage {
  id: string;
  file: File;
  previewUrl: string;
  note?: string;
  hasStain?: boolean;
  type?: 'front' | 'back' | 'side' | 'detail' | 'label';
  productIndex: number; // Which product this image belongs to
}

interface MobileCaptureInterfaceProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (images: File[], notes: Map<string, { note?: string; hasStain?: boolean; type?: string; productIndex?: number }>) => Promise<void> | void;
  mode: 'batch' | 'quick-product' | 'quick-product-batch';
}

export function MobileCaptureInterface({
  isOpen,
  onClose,
  onComplete,
  mode,
}: MobileCaptureInterfaceProps) {
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [markAsStain, setMarkAsStain] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Quick product batch mode tracking - 4 shots per product
  const quickBatchTypes: ('front' | 'back' | 'side' | 'detail')[] = ['front', 'back', 'side', 'detail'];
  // Legacy single product mode - includes label
  const quickProductTypes: ('front' | 'back' | 'label' | 'detail')[] = ['front', 'back', 'label', 'detail'];
  
  const [currentProductIndex, setCurrentProductIndex] = useState(0);
  const [currentShotIndex, setCurrentShotIndex] = useState(0);

  // Get the right type array based on mode
  const shotTypes = mode === 'quick-product-batch' ? quickBatchTypes : quickProductTypes;

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setCapturedImages([]);
      setShowNoteDialog(false);
      setSelectedImageId(null);
      setNoteText('');
      setMarkAsStain(false);
      setCurrentProductIndex(0);
      setCurrentShotIndex(0);
      setIsSaving(false);
    }
  }, [isOpen]);

  const handleCapture = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const newImages: CapturedImage[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const previewUrl = URL.createObjectURL(file);
      const id = `capture-${Date.now()}-${i}`;
      
      // Assign type based on current shot index for quick modes
      let type: 'front' | 'back' | 'side' | 'detail' | 'label' | undefined;
      let productIdx = currentProductIndex;
      
      if (mode === 'quick-product-batch') {
        const shotIdx = currentShotIndex + i;
        if (shotIdx < 4) {
          type = quickBatchTypes[shotIdx];
        } else {
          // Overflow to next product
          const overflow = Math.floor(shotIdx / 4);
          productIdx = currentProductIndex + overflow;
          type = quickBatchTypes[shotIdx % 4];
        }
      } else if (mode === 'quick-product') {
        if (currentShotIndex + i < 4) {
          type = quickProductTypes[currentShotIndex + i];
        }
      }
      
      newImages.push({
        id,
        file,
        previewUrl,
        type,
        productIndex: productIdx,
      });
    }

    setCapturedImages(prev => [...prev, ...newImages]);
    
    if (mode === 'quick-product-batch') {
      const totalShots = currentShotIndex + files.length;
      const newProductIndex = Math.floor(totalShots / 4);
      const newShotIndex = totalShots % 4;
      setCurrentProductIndex(prev => prev + Math.floor((currentShotIndex + files.length) / 4));
      setCurrentShotIndex(totalShots % 4);
    } else if (mode === 'quick-product') {
      setCurrentShotIndex(prev => Math.min(prev + files.length, 4));
    }

    // Reset input to allow re-selecting same file
    event.target.value = '';
  }, [mode, currentShotIndex, currentProductIndex]);

  const handleRemoveImage = useCallback((id: string) => {
    setCapturedImages(prev => {
      const updated = prev.filter(img => img.id !== id);
      // Revoke object URL to prevent memory leaks
      const removed = prev.find(img => img.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return updated;
    });
    
    // Adjust indices for quick modes
    if (mode === 'quick-product-batch' || mode === 'quick-product') {
      // Recalculate based on remaining images
      setCapturedImages(prev => {
        const totalImages = prev.filter(img => img.id !== id).length;
        if (mode === 'quick-product-batch') {
          setCurrentProductIndex(Math.floor(totalImages / 4));
          setCurrentShotIndex(totalImages % 4);
        } else {
          setCurrentShotIndex(Math.min(totalImages, 4));
        }
        return prev.filter(img => img.id !== id);
      });
    }
  }, [mode]);

  const handleOpenNote = useCallback((imageId: string) => {
    const image = capturedImages.find(img => img.id === imageId);
    if (image) {
      setSelectedImageId(imageId);
      setNoteText(image.note || '');
      setMarkAsStain(image.hasStain || false);
      setShowNoteDialog(true);
    }
  }, [capturedImages]);

  const handleSaveNote = useCallback(() => {
    if (selectedImageId) {
      setCapturedImages(prev => prev.map(img => 
        img.id === selectedImageId 
          ? { ...img, note: noteText, hasStain: markAsStain }
          : img
      ));
    }
    setShowNoteDialog(false);
    setSelectedImageId(null);
    setNoteText('');
    setMarkAsStain(false);
  }, [selectedImageId, noteText, markAsStain]);

  // Advance to next product in batch mode
  const handleNextProduct = useCallback(() => {
    // Complete current product's 4 shots (fill remaining with undefined)
    const remainingShots = 4 - currentShotIndex;
    if (remainingShots > 0 && currentShotIndex > 0) {
      // User has taken some shots but not all 4 - that's okay, advance anyway
      setCurrentProductIndex(prev => prev + 1);
      setCurrentShotIndex(0);
    } else if (currentShotIndex === 4 || currentShotIndex === 0) {
      // Either completed all 4 or hasn't started - just advance
      setCurrentProductIndex(prev => prev + 1);
      setCurrentShotIndex(0);
    }
  }, [currentShotIndex]);

  const handleComplete = useCallback(async () => {
    if (isSaving) return; // Prevent double-tap
    setIsSaving(true);
    
    const files = capturedImages.map(img => img.file);
    const notes = new Map<string, { note?: string; hasStain?: boolean; type?: string; productIndex?: number }>();
    
    capturedImages.forEach((img) => {
      // Use file name as key for matching after upload
      notes.set(img.file.name, {
        note: img.note,
        hasStain: img.hasStain,
        type: img.type,
        productIndex: img.productIndex,
      });
    });

    try {
      // CRITICAL: Await persistence before closing to prevent data loss
      await onComplete(files, notes);
      
      // Cleanup object URLs only after successful persistence
      capturedImages.forEach(img => URL.revokeObjectURL(img.previewUrl));
      
      onClose();
    } catch (error) {
      console.error('Camera capture persistence failed:', error);
      toast.error('Upload failed. Please try again.');
      setIsSaving(false);
    }
  }, [capturedImages, onComplete, onClose, isSaving]);

  if (!isOpen) return null;

  const selectedImage = capturedImages.find(img => img.id === selectedImageId);
  
  // Calculate product counts for batch mode
  const productCount = mode === 'quick-product-batch' 
    ? Math.max(1, Math.ceil(capturedImages.length / 4))
    : 1;
  
  // Get images for current product preview in batch mode
  const currentProductImages = mode === 'quick-product-batch'
    ? capturedImages.filter(img => img.productIndex === currentProductIndex)
    : capturedImages;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Hidden file input - accepts camera capture on mobile */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple={mode === 'batch'}
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-card">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-5 h-5 mr-1" />
          Cancel
        </Button>
        <div className="text-center">
          <h2 className="font-semibold">
            {mode === 'batch' 
              ? 'Batch Capture' 
              : mode === 'quick-product-batch'
              ? 'Quick Product Batch (4-shot)'
              : 'Quick Product Shots'}
          </h2>
          <p className="text-xs text-muted-foreground">
            {mode === 'quick-product-batch' 
              ? `${capturedImages.length} shots • ${productCount} product${productCount !== 1 ? 's' : ''}`
              : `${capturedImages.length} image${capturedImages.length !== 1 ? 's' : ''} captured`
            }
          </p>
        </div>
        <Button 
          variant="default" 
          size="sm" 
          onClick={handleComplete}
          disabled={capturedImages.length === 0 || isSaving}
        >
          <Check className="w-4 h-4 mr-1" />
          {isSaving ? 'Saving...' : 'Done'}
        </Button>
      </div>

      {/* Quick Product Batch Mode Guide */}
      {mode === 'quick-product-batch' && (
        <div className="p-3 bg-cyan-500/10 border-b border-cyan-500/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-600" />
              <span className="text-sm font-medium text-cyan-800 dark:text-cyan-200">
                Product #{currentProductIndex + 1} — {4 - currentShotIndex} shot{4 - currentShotIndex !== 1 ? 's' : ''} remaining
              </span>
            </div>
            {currentShotIndex > 0 && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleNextProduct}
                className="text-xs h-7 px-2"
              >
                <ArrowRight className="w-3 h-3 mr-1" />
                Next Product
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {quickBatchTypes.map((type, idx) => (
              <Badge
                key={type}
                variant={idx < currentShotIndex ? 'default' : 'outline'}
                className={cn(
                  'capitalize text-xs',
                  idx < currentShotIndex && 'bg-green-600'
                )}
              >
                {idx + 1}. {type}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Legacy Quick Product Mode Guide */}
      {mode === 'quick-product' && (
        <div className="p-3 bg-amber-500/10 border-b border-amber-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
              AI will generate additional listing images
            </span>
          </div>
          <div className="flex gap-2">
            {quickProductTypes.map((type, idx) => (
              <Badge
                key={type}
                variant={idx < capturedImages.length ? 'default' : 'outline'}
                className={cn(
                  'capitalize text-xs',
                  idx < capturedImages.length && 'bg-green-600'
                )}
              >
                {idx + 1}. {type}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Image Grid */}
      <div className="flex-1 overflow-auto p-4">
        {capturedImages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <Camera className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg font-medium">No images yet</p>
            <p className="text-sm text-center">
              {mode === 'batch' 
                ? 'Tap the camera button to start capturing'
                : mode === 'quick-product-batch'
                ? 'Capture Front, Back, Side, Detail for each product'
                : 'Capture Front, Back, Label, and Detail shots'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Group images by product in batch mode */}
            {mode === 'quick-product-batch' ? (
              Array.from({ length: productCount }).map((_, productIdx) => {
                const productImages = capturedImages.filter(img => img.productIndex === productIdx);
                if (productImages.length === 0) return null;
                
                return (
                  <div key={productIdx} className="border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">
                        Product #{productIdx + 1}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {productImages.length}/4 shots
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {productImages.map((image) => (
                        <div 
                          key={image.id}
                          className="relative aspect-square rounded-lg overflow-hidden bg-muted border group"
                        >
                          <img 
                            src={image.previewUrl} 
                            alt="Captured" 
                            className="w-full h-full object-cover"
                          />
                          
                          {/* Type badge */}
                          {image.type && (
                            <Badge className="absolute top-1 left-1 capitalize text-[10px] px-1 py-0 bg-blue-600">
                              {image.type}
                            </Badge>
                          )}
                          
                          {/* Stain indicator */}
                          {image.hasStain && (
                            <Badge className="absolute top-1 right-1 bg-red-600 text-[10px] px-1 py-0">
                              <AlertCircle className="w-2 h-2" />
                            </Badge>
                          )}

                          {/* Overlay actions on tap/hover */}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                            <Button 
                              size="sm" 
                              variant="secondary"
                              className="h-6 w-6 p-0"
                              onClick={() => handleOpenNote(image.id)}
                            >
                              <AlertCircle className="w-3 h-3" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="destructive"
                              className="h-6 w-6 p-0"
                              onClick={() => handleRemoveImage(image.id)}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {capturedImages.map((image) => (
                  <div 
                    key={image.id}
                    className="relative aspect-square rounded-lg overflow-hidden bg-muted border group"
                  >
                    <img 
                      src={image.previewUrl} 
                      alt="Captured" 
                      className="w-full h-full object-cover"
                    />
                    
                    {/* Type badge for quick product mode */}
                    {image.type && (
                      <Badge className="absolute top-2 left-2 capitalize text-xs bg-blue-600">
                        {image.type}
                      </Badge>
                    )}
                    
                    {/* Stain indicator */}
                    {image.hasStain && (
                      <Badge className="absolute top-2 right-2 bg-red-600">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Stain
                      </Badge>
                    )}
                    
                    {/* Note indicator */}
                    {image.note && !image.hasStain && (
                      <Badge className="absolute top-2 right-2 bg-amber-600">
                        Note
                      </Badge>
                    )}

                    {/* Overlay actions */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button 
                        size="sm" 
                        variant="secondary"
                        onClick={() => handleOpenNote(image.id)}
                      >
                        <AlertCircle className="w-4 h-4 mr-1" />
                        Note
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={() => handleRemoveImage(image.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Capture Controls */}
      <div className="p-4 border-t bg-card flex items-center justify-center gap-4">
        {mode === 'batch' ? (
          <>
            <Button
              size="lg"
              className="h-16 w-16 rounded-full"
              onClick={handleCapture}
            >
              <Camera className="w-8 h-8" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-16 w-16 rounded-full"
              onClick={() => {
                const input = fileInputRef.current;
                if (input) {
                  input.removeAttribute('capture');
                  input.click();
                  // Restore capture attribute after
                  setTimeout(() => input.setAttribute('capture', 'environment'), 100);
                }
              }}
            >
              <Upload className="w-6 h-6" />
            </Button>
          </>
        ) : mode === 'quick-product-batch' ? (
          <div className="flex flex-col items-center gap-2">
            <Button
              size="lg"
              className="h-16 px-8"
              onClick={handleCapture}
            >
              <Camera className="w-6 h-6 mr-2" />
              Capture {quickBatchTypes[currentShotIndex]?.toUpperCase() || 'FRONT'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Product #{currentProductIndex + 1} • {currentShotIndex}/4 shots
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            {currentShotIndex < 4 ? (
              <>
                <Button
                  size="lg"
                  className="h-16 px-8"
                  onClick={handleCapture}
                >
                  <Camera className="w-6 h-6 mr-2" />
                  Capture {quickProductTypes[currentShotIndex].toUpperCase()}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {4 - currentShotIndex} shot{4 - currentShotIndex !== 1 ? 's' : ''} remaining
                </p>
              </>
            ) : (
              <div className="text-center">
                <div className="flex items-center gap-2 text-green-600 mb-2">
                  <Check className="w-5 h-5" />
                  <span className="font-medium">All 4 shots captured!</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tap Done to generate listing images
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Note Dialog */}
      {showNoteDialog && selectedImage && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-card rounded-lg w-full max-w-md overflow-hidden">
            {/* Preview */}
            <div className="aspect-video relative">
              <img 
                src={selectedImage.previewUrl} 
                alt="Selected" 
                className="w-full h-full object-contain bg-black"
              />
            </div>
            
            {/* Note Form */}
            <div className="p-4 space-y-4">
              <h3 className="font-semibold">Add Note</h3>
              
              <Button
                variant={markAsStain ? 'destructive' : 'outline'}
                className="w-full"
                onClick={() => setMarkAsStain(!markAsStain)}
              >
                <AlertCircle className="w-4 h-4 mr-2" />
                {markAsStain ? 'Marked as Stain' : 'Mark as Stain'}
              </Button>
              
              <Textarea
                placeholder="Add a note about this image (e.g., small hole on sleeve, fading on collar)..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={3}
              />
              
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    setShowNoteDialog(false);
                    setSelectedImageId(null);
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleSaveNote}
                >
                  <Check className="w-4 h-4 mr-1" />
                  Save & Continue
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
