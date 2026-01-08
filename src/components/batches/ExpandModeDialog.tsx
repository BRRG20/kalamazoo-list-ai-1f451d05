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
      <DialogContent className="sm:max-w-md">
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
            className="h-auto p-4 flex flex-col items-start gap-2 text-left hover:border-primary"
            onClick={() => {
              onSelectMode('product_photos');
              onOpenChange(false);
            }}
          >
            <div className="flex items-center gap-2 font-semibold">
              <Package className="w-5 h-5 text-primary" />
              Expand Product Photos
            </div>
            <p className="text-sm text-muted-foreground font-normal">
              Create e-commerce shots from your <strong>original product images</strong>. 
              Generates close-up crops of details, neckline, and hem. 
              <span className="text-primary"> No AI models involved.</span>
            </p>
          </Button>

          {/* Mode 2: AI Model Image Expand */}
          <Button
            variant="outline"
            className="h-auto p-4 flex flex-col items-start gap-2 text-left hover:border-primary disabled:opacity-50"
            onClick={() => {
              if (hasExistingModelImages) {
                onSelectMode('ai_model');
                onOpenChange(false);
              }
            }}
            disabled={!hasExistingModelImages}
          >
            <div className="flex items-center gap-2 font-semibold">
              <User className="w-5 h-5 text-cyan-600" />
              Expand AI Model Image
            </div>
            <p className="text-sm text-muted-foreground font-normal">
              Create additional angles from your <strong>existing AI model images</strong>. 
              Same person, same outfit, different camera angles.
              <span className="text-cyan-600"> Uses existing model only.</span>
            </p>
            {!hasExistingModelImages && (
              <Alert variant="destructive" className="mt-2 py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  No AI model images found. Generate model images first using "Model Try-On".
                </AlertDescription>
              </Alert>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
