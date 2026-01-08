import { useState } from 'react';
import { Sparkles, Camera, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { MobileCaptureInterface } from './MobileCaptureInterface';

interface QuickProductShotsButtonProps {
  onComplete: (files: File[], notes: Map<string, { note?: string; hasStain?: boolean; type?: string; productIndex?: number }>) => void;
  disabled?: boolean;
}

export function QuickProductShotsButton({
  onComplete,
  disabled = false,
}: QuickProductShotsButtonProps) {
  const [showCapture, setShowCapture] = useState(false);

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCapture(true)}
              disabled={disabled}
              className="gap-2"
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              Quick Product (4)
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="font-medium mb-1">Quick Product Shots</p>
            <p className="text-xs text-muted-foreground">
              Capture 4 shots (Front, Back, Label, Detail) and AI will generate additional listing images to reach ~8 total.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <MobileCaptureInterface
        isOpen={showCapture}
        onClose={() => setShowCapture(false)}
        onComplete={onComplete}
        mode="quick-product"
      />
    </>
  );
}

interface BatchCaptureButtonProps {
  onComplete: (files: File[], notes: Map<string, { note?: string; hasStain?: boolean; type?: string; productIndex?: number }>) => void;
  disabled?: boolean;
}

export function BatchCaptureButton({
  onComplete,
  disabled = false,
}: BatchCaptureButtonProps) {
  const [showCapture, setShowCapture] = useState(false);

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCapture(true)}
              disabled={disabled}
              className="gap-2"
            >
              <Camera className="w-4 h-4" />
              Batch Capture
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="font-medium mb-1">Continuous Batch Capture</p>
            <p className="text-xs text-muted-foreground">
              Rapid-fire photo capture. Take multiple photos, add condition notes, then upload all at once.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <MobileCaptureInterface
        isOpen={showCapture}
        onClose={() => setShowCapture(false)}
        onComplete={onComplete}
        mode="batch"
      />
    </>
  );
}

interface QuickProductBatchButtonProps {
  onComplete: (files: File[], notes: Map<string, { note?: string; hasStain?: boolean; type?: string; productIndex?: number }>) => void;
  disabled?: boolean;
}

export function QuickProductBatchButton({
  onComplete,
  disabled = false,
}: QuickProductBatchButtonProps) {
  const [showCapture, setShowCapture] = useState(false);

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCapture(true)}
              disabled={disabled}
              className="gap-2 text-cyan-600 border-cyan-300 hover:bg-cyan-50 hover:border-cyan-400"
            >
              <Layers className="w-4 h-4" />
              Quick Batch (4-shot)
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="font-medium mb-1">Quick Product Batch (4-shot)</p>
            <p className="text-xs text-muted-foreground">
              Continuously capture Front/Back/Side/Detail for multiple products. 
              Auto-groups into products of 4 on upload. Perfect for rapid inventory photography.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <MobileCaptureInterface
        isOpen={showCapture}
        onClose={() => setShowCapture(false)}
        onComplete={onComplete}
        mode="quick-product-batch"
      />
    </>
  );
}
