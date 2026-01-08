import { useState } from 'react';
import { Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MobileCaptureInterface } from './MobileCaptureInterface';
import { useIsMobile } from '@/hooks/use-mobile';

interface BatchCaptureButtonProps {
  onComplete: (files: File[], notes: Map<string, { note?: string; hasStain?: boolean; type?: string }>) => void;
  disabled?: boolean;
}

export function BatchCaptureButton({ onComplete, disabled }: BatchCaptureButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useIsMobile();

  // Only show on mobile devices
  if (!isMobile) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        disabled={disabled}
      >
        <Camera className="w-4 h-4 mr-2" />
        Batch Camera
      </Button>
      
      <MobileCaptureInterface
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onComplete={onComplete}
        mode="batch"
      />
    </>
  );
}
