import { useState } from 'react';
import { Loader2, User, UserCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { AIFashionModel, PoseType, FitStyle, OutfitStyle } from '@/hooks/use-model-tryon';

interface ModelTryOnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (modelId: string, poseId: PoseType, fitStyle: FitStyle, styleOutfit: boolean, outfitStyle: OutfitStyle) => void;
  isProcessing?: boolean;
  imageCount?: number;
}

const MODELS: AIFashionModel[] = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Alex', gender: 'male', description: 'Professional, neutral styling' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Marcus', gender: 'male', description: 'Stylish, relaxed demeanor' },
  { id: '33333333-3333-3333-3333-333333333333', name: 'Sophie', gender: 'female', description: 'Elegant, professional' },
  { id: '44444444-4444-4444-4444-444444444444', name: 'Emma', gender: 'female', description: 'Natural, approachable' },
];

const POSES: { id: PoseType; name: string }[] = [
  { id: 'front_neutral', name: 'Front Neutral' },
  { id: 'three_quarter', name: '3/4 Angle' },
  { id: 'relaxed', name: 'Relaxed' },
  { id: 'arms_bent', name: 'Arms Bent' },
  { id: 'close_up_detail', name: 'Close-Up Detail' },
];

const FIT_STYLES: { id: FitStyle; name: string; description: string }[] = [
  { id: 'regular', name: 'Regular', description: 'Natural fit' },
  { id: 'oversized', name: 'Oversized', description: 'Relaxed, looser fit' },
  { id: 'tucked', name: 'Tucked', description: 'Tucked in look' },
];

const OUTFIT_STYLES: { id: OutfitStyle; name: string; description: string }[] = [
  { id: 'stylish_casual', name: 'Stylish Casual', description: 'Rihanna off-duty, SoHo NYC vibes' },
  { id: 'streetwear', name: 'Streetwear', description: 'A$AP Rocky, Brooklyn, Supreme drops' },
  { id: 'vintage', name: 'Vintage', description: 'Era-authentic, 70s-Y2K styling' },
  { id: 'hipster', name: 'Hipster', description: 'Shoreditch London, Williamsburg creative' },
  { id: 'cool', name: 'Cool', description: 'Scandinavian minimal, quiet luxury' },
  { id: 'vibrant', name: 'Vibrant', description: 'Bold color blocking, Tyler style' },
  { id: 'chic', name: 'Chic', description: 'Parisian elegance, old money aesthetic' },
  { id: 'eastern_fusion', name: 'Eastern Fusion', description: 'Tokyo-Seoul meets Western street' },
];

export function ModelTryOnDialog({
  open,
  onOpenChange,
  onConfirm,
  isProcessing = false,
  imageCount = 1,
}: ModelTryOnDialogProps) {
  const [selectedModelId, setSelectedModelId] = useState<string>(MODELS[0].id);
  const [selectedPose, setSelectedPose] = useState<PoseType>('front_neutral');
  const [selectedFit, setSelectedFit] = useState<FitStyle>('regular');
  const [styleOutfit, setStyleOutfit] = useState<boolean>(false);
  const [outfitStyle, setOutfitStyle] = useState<OutfitStyle>('stylish_casual');

  const handleConfirm = () => {
    onConfirm(selectedModelId, selectedPose, selectedFit, styleOutfit, outfitStyle);
  };

  const maleModels = MODELS.filter(m => m.gender === 'male');
  const femaleModels = MODELS.filter(m => m.gender === 'female');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Place on Model</DialogTitle>
          <DialogDescription>
            Select a model, pose, and fit style to visualize {imageCount > 1 ? `${imageCount} garments` : 'the garment'} on a fashion model.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Model Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Select Model</Label>
            <RadioGroup
              value={selectedModelId}
              onValueChange={setSelectedModelId}
              className="grid grid-cols-2 gap-3"
            >
              {/* Male Models */}
              <div className="space-y-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Male</span>
                {maleModels.map((model) => (
                  <label
                    key={model.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                      selectedModelId === model.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <RadioGroupItem value={model.id} className="sr-only" />
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">{model.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{model.description}</p>
                    </div>
                  </label>
                ))}
              </div>

              {/* Female Models */}
              <div className="space-y-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Female</span>
                {femaleModels.map((model) => (
                  <label
                    key={model.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                      selectedModelId === model.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <RadioGroupItem value={model.id} className="sr-only" />
                    <div className="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center flex-shrink-0">
                      <UserCircle className="w-5 h-5 text-pink-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">{model.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{model.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </RadioGroup>
          </div>

          {/* Pose Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Pose</Label>
            <Select value={selectedPose} onValueChange={(v) => setSelectedPose(v as PoseType)}>
              <SelectTrigger>
                <SelectValue placeholder="Select pose" />
              </SelectTrigger>
              <SelectContent>
                {POSES.map((pose) => (
                  <SelectItem key={pose.id} value={pose.id}>
                    {pose.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fit Style Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Fit Style</Label>
            <RadioGroup
              value={selectedFit}
              onValueChange={(v) => setSelectedFit(v as FitStyle)}
              className="flex gap-2"
            >
              {FIT_STYLES.map((fit) => (
                <label
                  key={fit.id}
                  className={cn(
                    "flex-1 p-2 rounded-lg border cursor-pointer transition-colors text-center",
                    selectedFit === fit.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <RadioGroupItem value={fit.id} className="sr-only" />
                  <p className="font-medium text-sm">{fit.name}</p>
                  <p className="text-xs text-muted-foreground">{fit.description}</p>
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* Style Outfit Toggle */}
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <Label className="text-sm font-medium">Style Outfit</Label>
              </div>
              <Switch 
                checked={styleOutfit} 
                onCheckedChange={setStyleOutfit}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Generate a complete styled outfit around your product. The product remains the hero item.
            </p>

            {/* Outfit Style Selection - only shown when styleOutfit is enabled */}
            {styleOutfit && (
              <div className="space-y-2 pt-2">
                <Label className="text-sm font-medium">Outfit Style</Label>
                <Select value={outfitStyle} onValueChange={(v) => setOutfitStyle(v as OutfitStyle)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select style" />
                  </SelectTrigger>
                  <SelectContent>
                    {OUTFIT_STYLES.map((style) => (
                      <SelectItem key={style.id} value={style.id}>
                        <div className="flex flex-col">
                          <span>{style.name}</span>
                          <span className="text-xs text-muted-foreground">{style.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isProcessing}>
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : styleOutfit ? (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Place & Style
              </>
            ) : (
              <>Place on Model</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}