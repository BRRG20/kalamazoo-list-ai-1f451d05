import { useState, useRef, useEffect, useCallback } from 'react';
import { Eraser, Paintbrush, Minus, Plus, RotateCcw, Check, X, Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { usePrecisionErase, type EraseMode } from '@/hooks/use-precision-erase';

interface ImageEditCanvasProps {
  imageUrl: string;
  onSave: (newImageUrl: string) => void;
  onCancel: () => void;
}

interface BrushStroke {
  points: { x: number; y: number }[];
  size: number;
}

export function ImageEditCanvas({ imageUrl, onSave, onCancel }: ImageEditCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);
  const [brushSize, setBrushSize] = useState(30);
  const [intensity, setIntensity] = useState(75);
  const [mode, setMode] = useState<EraseMode>('erase');
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokes, setStrokes] = useState<BrushStroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<BrushStroke | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  
  const { isProcessing, processErase } = usePrecisionErase();

  // Load image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImageObj(img);
      setImageLoaded(true);
    };
    img.onerror = () => {
      console.error('Failed to load image');
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Calculate canvas dimensions and scale
  useEffect(() => {
    if (!imageObj || !containerRef.current) return;

    const calculateScale = () => {
      const container = containerRef.current;
      if (!container) return;
      
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      
      if (containerWidth === 0 || containerHeight === 0) return;
      
      const scaleX = containerWidth / imageObj.width;
      const scaleY = containerHeight / imageObj.height;
      const newScale = Math.min(scaleX, scaleY, 1);
      
      setScale(newScale);
      setOffset({
        x: (containerWidth - imageObj.width * newScale) / 2,
        y: (containerHeight - imageObj.height * newScale) / 2,
      });
    };

    // Initial calculation
    calculateScale();
    
    // Recalculate on resize
    const resizeObserver = new ResizeObserver(calculateScale);
    resizeObserver.observe(containerRef.current);
    
    return () => resizeObserver.disconnect();
  }, [imageObj]);

  // Render canvas
  useEffect(() => {
    if (!canvasRef.current || !maskCanvasRef.current || !imageObj) return;

    const canvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const maskCtx = maskCanvas.getContext('2d');
    
    if (!ctx || !maskCtx) return;

    // Set canvas size to image size
    canvas.width = imageObj.width;
    canvas.height = imageObj.height;
    maskCanvas.width = imageObj.width;
    maskCanvas.height = imageObj.height;

    // Draw image
    ctx.drawImage(imageObj, 0, 0);

    // Draw mask strokes
    maskCtx.fillStyle = 'black';
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    maskCtx.fillStyle = 'white';
    maskCtx.lineCap = 'round';
    maskCtx.lineJoin = 'round';

    const allStrokes = currentStroke ? [...strokes, currentStroke] : strokes;
    
    for (const stroke of allStrokes) {
      if (stroke.points.length === 0) continue;
      
      maskCtx.beginPath();
      maskCtx.lineWidth = stroke.size;
      maskCtx.strokeStyle = 'white';
      
      if (stroke.points.length === 1) {
        maskCtx.arc(stroke.points[0].x, stroke.points[0].y, stroke.size / 2, 0, Math.PI * 2);
        maskCtx.fill();
      } else {
        maskCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          maskCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        maskCtx.stroke();
      }
    }

    // Overlay mask on image with semi-transparent red
    if (!showPreview && allStrokes.length > 0) {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = mode === 'erase' ? '#ef4444' : '#3b82f6';
      
      for (const stroke of allStrokes) {
        if (stroke.points.length === 0) continue;
        
        ctx.beginPath();
        ctx.lineWidth = stroke.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = mode === 'erase' ? '#ef4444' : '#3b82f6';
        
        if (stroke.points.length === 1) {
          ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
          for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
          }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
  }, [imageObj, strokes, currentStroke, showPreview, mode]);

  const getCanvasPoint = useCallback((e: React.PointerEvent) => {
    if (!canvasRef.current) return null;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    const clientX = e.clientX;
    const clientY = e.clientY;
    
    // Convert screen coordinates to canvas coordinates
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    
    return { x, y };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only prevent default for touch to stop scrolling
    if (e.pointerType === 'touch') {
      e.preventDefault();
    }
    const point = getCanvasPoint(e);
    if (!point) return;
    
    // Capture pointer for reliable tracking
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    
    setIsDrawing(true);
    setCurrentStroke({
      points: [point],
      size: brushSize,
    });
  }, [getCanvasPoint, brushSize]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDrawing || !currentStroke) return;
    
    // Only prevent default when actively drawing
    if (e.pointerType === 'touch') {
      e.preventDefault();
    }
    
    const point = getCanvasPoint(e);
    if (!point) return;
    
    setCurrentStroke(prev => prev ? {
      ...prev,
      points: [...prev.points, point],
    } : null);
  }, [isDrawing, currentStroke, getCanvasPoint]);

  const handlePointerUp = useCallback((e?: React.PointerEvent) => {
    if (e) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
    if (currentStroke && currentStroke.points.length > 0) {
      setStrokes(prev => [...prev, currentStroke]);
    }
    setCurrentStroke(null);
    setIsDrawing(false);
  }, [currentStroke]);

  const handleUndo = () => {
    setStrokes(prev => prev.slice(0, -1));
    setPreviewUrl(null);
    setShowPreview(false);
  };

  const handleClear = () => {
    setStrokes([]);
    setCurrentStroke(null);
    setPreviewUrl(null);
    setShowPreview(false);
  };

  const handlePreview = async () => {
    if (!maskCanvasRef.current || strokes.length === 0) return;
    
    const maskDataUrl = maskCanvasRef.current.toDataURL('image/png');
    const result = await processErase(imageUrl, maskDataUrl, intensity, mode);
    
    if (result) {
      setPreviewUrl(result);
      setShowPreview(true);
    }
  };

  const handleApply = () => {
    if (previewUrl) {
      onSave(previewUrl);
    }
  };

  const handleRejectPreview = () => {
    setShowPreview(false);
    setPreviewUrl(null);
  };

  if (!imageLoaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Toolbar */}
      <div className="flex-none p-3 border-b border-border bg-card">
        <div className="flex flex-wrap items-center gap-4">
          {/* Mode toggle */}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Mode:</Label>
            <ToggleGroup 
              type="single" 
              value={mode} 
              onValueChange={(v) => v && setMode(v as EraseMode)}
              className="bg-muted/50 rounded-md p-0.5"
            >
              <ToggleGroupItem 
                value="erase" 
                className="h-8 px-3 text-xs data-[state=on]:bg-destructive data-[state=on]:text-destructive-foreground"
              >
                <Eraser className="h-3.5 w-3.5 mr-1.5" />
                Erase
              </ToggleGroupItem>
              <ToggleGroupItem 
                value="smooth" 
                className="h-8 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                <Paintbrush className="h-3.5 w-3.5 mr-1.5" />
                Smooth
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Brush size */}
          <div className="flex items-center gap-2 min-w-[160px]">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Brush:</Label>
            <div className="flex items-center gap-1.5 flex-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setBrushSize(prev => Math.max(5, prev - 10))}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <Slider
                value={[brushSize]}
                onValueChange={([v]) => setBrushSize(v)}
                min={5}
                max={100}
                step={5}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setBrushSize(prev => Math.min(100, prev + 10))}
              >
                <Plus className="h-3 w-3" />
              </Button>
              <span className="text-xs text-muted-foreground w-8 text-center">{brushSize}</span>
            </div>
          </div>

          {/* Intensity */}
          <div className="flex items-center gap-2 min-w-[160px]">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Intensity:</Label>
            <Slider
              value={[intensity]}
              onValueChange={([v]) => setIntensity(v)}
              min={25}
              max={100}
              step={25}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground w-8 text-center">{intensity}%</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUndo}
              disabled={strokes.length === 0 || isProcessing}
              className="h-8"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Undo
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={strokes.length === 0 || isProcessing}
              className="h-8"
            >
              Clear
            </Button>
          </div>
        </div>
      </div>

      {/* Canvas area */}
      <div 
        ref={containerRef}
        className="flex-1 min-h-0 overflow-hidden relative bg-muted/30 flex items-center justify-center"
      >
        {showPreview && previewUrl ? (
          <img
            src={previewUrl}
            alt="Preview"
            className="max-w-full max-h-full object-contain"
            style={{
              transform: `scale(${scale})`,
            }}
          />
        ) : (
          <canvas
            ref={canvasRef}
            className="cursor-crosshair touch-none"
            style={{
              width: imageObj ? imageObj.width * scale : 'auto',
              height: imageObj ? imageObj.height * scale : 'auto',
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        )}
        
        {/* Hidden mask canvas */}
        <canvas
          ref={maskCanvasRef}
          className="hidden"
        />

        {/* Brush cursor indicator */}
        {!showPreview && (
          <div 
            className="pointer-events-none fixed border-2 rounded-full"
            style={{
              width: brushSize * scale,
              height: brushSize * scale,
              borderColor: mode === 'erase' ? 'rgba(239, 68, 68, 0.8)' : 'rgba(59, 130, 246, 0.8)',
              transform: 'translate(-50%, -50%)',
              display: 'none', // Will be shown via JS on mouse move
            }}
            id="brush-cursor"
          />
        )}
      </div>

      {/* Bottom action bar */}
      <div className="flex-none p-3 border-t border-border bg-card">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={onCancel} disabled={isProcessing}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          
          <div className="flex items-center gap-2">
            {showPreview ? (
              <>
                <Button 
                  variant="outline" 
                  onClick={handleRejectPreview}
                  disabled={isProcessing}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Back to Edit
                </Button>
                <Button onClick={handleApply} disabled={isProcessing}>
                  <Check className="h-4 w-4 mr-2" />
                  Apply Changes
                </Button>
              </>
            ) : (
              <Button
                onClick={handlePreview}
                disabled={strokes.length === 0 || isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4 mr-2" />
                    Preview
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
