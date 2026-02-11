import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Package, User, Info, Zap, Settings2, Sparkles } from 'lucide-react';

export type ExpandMode = 'product_photos' | 'ai_model';
export type ExpandQuality = 'fast' | 'standard' | 'high';

export const QUALITY_SHOT_COUNT: Record<ExpandQuality, number> = {
  fast: 1,
  standard: 2,
  high: 3,
};

interface ExpandModeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectMode: (mode: ExpandMode, quality: ExpandQuality) => void;
  hasExistingModelImages: boolean;
  productCount: number;
}

const QUALITY_OPTIONS: { value: ExpandQuality; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'fast', label: 'Fast', icon: <Zap className="w-4 h-4" />, desc: '1 shot — quickest' },
  { value: 'standard', label: 'Standard', icon: <Settings2 className="w-4 h-4" />, desc: '2 shots — balanced' },
  { value: 'high', label: 'High', icon: <Sparkles className="w-4 h-4" />, desc: '3 shots — most detail' },
];

export function ExpandModeDialog({
  open,
  onOpenChange,
  onSelectMode,
  hasExistingModelImages,
  productCount,
}: ExpandModeDialogProps) {
  const [quality, setQuality] = useState<ExpandQuality>('standard');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-w-[95vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Choose Expansion Mode</DialogTitle>
          <DialogDescription>
            Select how you want to expand images for {productCount} product{productCount > 1 ? 's' : ''}.
          </DialogDescription>
        </DialogHeader>

        {/* Quality selector */}
        <div className="flex items-center gap-1.5 py-1">
          <span className="text-xs font-medium text-muted-foreground mr-1">Quality:</span>
          {QUALITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setQuality(opt.value)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                quality === opt.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground -mt-1">
          {QUALITY_OPTIONS.find(o => o.value === quality)?.desc}
        </p>
        
        <div className="grid gap-4 py-4">
          {/* Mode 1: Product Photo Expand */}
          <Button
            variant="outline"
            className="h-auto p-4 flex flex-col items-start gap-2 text-left hover:border-primary w-full whitespace-normal"
            onClick={() => {
              onSelectMode('product_photos', quality);
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
              onSelectMode('ai_model', quality);
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
