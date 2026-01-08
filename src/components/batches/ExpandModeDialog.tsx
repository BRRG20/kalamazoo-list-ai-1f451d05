import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Package, User, AlertCircle, Info } from 'lucide-react';

export type ExpandMode = 'product_photos' | 'ai_model';

interface ExpandModeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectMode: (mode: ExpandMode) => void;
  hasExistingModelImages: boolean;
  productCount: number;
}

export function ExpandModeDialog({
  open,
  onOpenChange,
  onSelectMode,
  hasExistingModelImages,
  productCount,
}: ExpandModeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-w-[95vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Choose Expansion Mode</DialogTitle>
          <DialogDescription>
            Select how you want to expand images for {productCount} product{productCount > 1 ? 's' : ''}.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          {/* Mode 1: Product Photo Expand */}
          <Button
            variant="outline"
            className="h-auto p-4 flex flex-col items-start gap-2 text-left hover:border-primary w-full whitespace-normal"
            onClick={() => {
              onSelectMode('product_photos');
              onOpenChange(false);
            }}
          >
            <div className="flex items-center gap-2 font-semibold text-sm">
              <Package className="w-5 h-5 text-primary flex-shrink-0" />
              <span>Expand Product Photos</span>
            </div>
            <p className="text-xs text-muted-foreground font-normal leading-relaxed pl-7">
              Create e-commerce shots from your <strong>original product images</strong>. 
              Close-up crops of details, neckline, and hem. No AI models.
            </p>
          </Button>

          {/* Mode 2: AI Model Image Expand */}
          <Button
            variant="outline"
            className="h-auto p-4 flex flex-col items-start gap-2 text-left hover:border-cyan-600 w-full whitespace-normal"
            onClick={() => {
              onSelectMode('ai_model');
              onOpenChange(false);
            }}
          >
            <div className="flex items-center gap-2 font-semibold text-sm">
              <User className="w-5 h-5 text-cyan-600 flex-shrink-0" />
              <span>Expand AI Model Image</span>
            </div>
            <p className="text-xs text-muted-foreground font-normal leading-relaxed pl-7">
              Additional angles from your <strong>existing AI model images</strong>. 
              Same person, same outfit, different poses and angles.
            </p>
            {!hasExistingModelImages && (
              <div className="mt-1 flex items-start gap-2 text-amber-600 text-xs pl-7">
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>No AI model images found. A model will be generated first using Model Try-On.</span>
              </div>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
