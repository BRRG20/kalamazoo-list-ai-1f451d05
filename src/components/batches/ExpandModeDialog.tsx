import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Package, User, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
      <DialogContent className="sm:max-w-[420px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Choose Expansion Mode</DialogTitle>
          <DialogDescription>
            Select how you want to expand images for {productCount} product{productCount > 1 ? 's' : ''}.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-3 py-3">
          {/* Mode 1: Product Photo Expand */}
          <Button
            variant="outline"
            className="h-auto p-3 flex flex-col items-start gap-1.5 text-left hover:border-primary w-full"
            onClick={() => {
              onSelectMode('product_photos');
              onOpenChange(false);
            }}
          >
            <div className="flex items-center gap-2 font-semibold text-sm">
              <Package className="w-4 h-4 text-primary flex-shrink-0" />
              Expand Product Photos
            </div>
            <p className="text-xs text-muted-foreground font-normal leading-relaxed">
              Create e-commerce shots from your <strong>original product images</strong>. 
              Close-up crops of details, neckline, and hem. 
              <span className="text-primary"> No AI models.</span>
            </p>
          </Button>

          {/* Mode 2: AI Model Image Expand */}
          <Button
            variant="outline"
            className="h-auto p-3 flex flex-col items-start gap-1.5 text-left hover:border-primary disabled:opacity-50 w-full"
            onClick={() => {
              if (hasExistingModelImages) {
                onSelectMode('ai_model');
                onOpenChange(false);
              }
            }}
            disabled={!hasExistingModelImages}
          >
            <div className="flex items-center gap-2 font-semibold text-sm">
              <User className="w-4 h-4 text-cyan-600 flex-shrink-0" />
              Expand AI Model Image
            </div>
            <p className="text-xs text-muted-foreground font-normal leading-relaxed">
              Additional angles from your <strong>existing AI model images</strong>. 
              Same person, same outfit, different angles.
              <span className="text-cyan-600"> Uses existing model only.</span>
            </p>
            {!hasExistingModelImages && (
              <div className="mt-1.5 flex items-start gap-2 text-destructive text-xs">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>No AI model images found. Use "Model Try-On" first.</span>
              </div>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
