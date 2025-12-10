import { useState, useEffect } from 'react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  Mic, 
  MicOff,
  Copy, 
  Check,
  Save,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ImageGallery } from './ImageGallery';
import { generateListingBlock } from '@/hooks/use-database';
import type { Product, ProductImage, Department, Era, Condition } from '@/types';

interface ProductDetailPanelProps {
  product: Product;
  images: ProductImage[];
  onClose: () => void;
  onSave: (updates: Partial<Product>) => void;
  onUpdateImage: (imageId: string, updates: Partial<ProductImage>) => void;
  onReorderImages: (imageId: string, newPosition: number) => void;
  onGenerateAI: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  isGenerating: boolean;
}

const departments: Department[] = ['Women', 'Men', 'Unisex', 'Kids'];
const eras: Era[] = ['80s', '90s', 'Y2K', 'Modern', ''];
const conditions: Condition[] = ['Excellent', 'Very good', 'Good – light wear', 'Fair – visible wear', ''];
const garmentTypes = ['sweater', 'jumper', 'hoodie', 't-shirt', 'shirt', 'blouse', 'jeans', 'trousers', 'dress', 'skirt', 'jacket', 'coat', 'fleece', 'cardigan', 'vest', 'shorts'];
const fits = ['oversized', 'boxy', 'regular', 'slim', 'cropped', 'relaxed', 'fitted'];
const patterns = ['plain', 'striped', 'graphic', 'fair isle', 'cable knit', 'argyle', 'floral', 'abstract', 'checked', 'plaid'];

export function ProductDetailPanel({
  product,
  images,
  onClose,
  onSave,
  onUpdateImage,
  onReorderImages,
  onGenerateAI,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  isGenerating,
}: ProductDetailPanelProps) {
  const [formData, setFormData] = useState<Partial<Product>>({});
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setFormData({
      title: product.title,
      price: product.price,
      garment_type: product.garment_type,
      department: product.department,
      era: product.era,
      brand: product.brand,
      size_label: product.size_label,
      size_recommended: product.size_recommended,
      fit: product.fit,
      material: product.material,
      condition: product.condition,
      flaws: product.flaws,
      made_in: product.made_in,
      colour_main: product.colour_main,
      colour_secondary: product.colour_secondary,
      pattern: product.pattern,
      shopify_tags: product.shopify_tags,
      collections_tags: product.collections_tags,
      etsy_tags: product.etsy_tags,
      description: product.description,
      listing_block: product.listing_block,
      raw_input_text: product.raw_input_text,
      notes: product.notes,
    });
  }, [product]);

  const updateField = <K extends keyof Product>(field: K, value: Product[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Generate listing block
      const updatedProduct = { ...product, ...formData };
      const listingBlock = generateListingBlock(updatedProduct as Product);
      onSave({ ...formData, listing_block: listingBlock });
      toast.success('Product saved');
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success(`${field} copied to clipboard`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const startVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error('Voice input not supported in this browser. Please type in the notes box instead.');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      toast.error('Voice recognition error. Please try again.');
    };

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setVoiceTranscript(transcript);
    };

    recognition.start();
  };

  const stopVoiceInput = () => {
    setIsListening(false);
    // Recognition will stop via onend
  };

  const applyVoiceToFields = () => {
    if (!voiceTranscript.trim()) {
      toast.error('No voice transcript to apply');
      return;
    }
    
    updateField('raw_input_text', (formData.raw_input_text || '') + '\n' + voiceTranscript);
    toast.success('Voice transcript added to raw input. Click "Generate AI" to parse and apply.');
    setVoiceTranscript('');
  };

  const CopyButton = ({ text, field }: { text: string; field: string }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => copyToClipboard(text, field)}
      disabled={!text}
    >
      {copiedField === field ? (
        <Check className="w-4 h-4 text-success" />
      ) : (
        <Copy className="w-4 h-4" />
      )}
    </Button>
  );

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onPrevious}
              disabled={!hasPrevious}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onNext}
              disabled={!hasNext}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <span className="text-sm text-muted-foreground ml-2">
              {product.sku}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              onClick={onGenerateAI}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Generate AI
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Images */}
          <div className="w-1/3 border-r border-border p-4 overflow-y-auto scrollbar-thin">
            <ImageGallery
              images={images}
              onUpdateImage={onUpdateImage}
              onReorderImages={onReorderImages}
            />
          </div>

          {/* Right: Fields */}
          <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
            <div className="space-y-6 max-w-2xl">
              {/* Core Section */}
              <section>
                <h3 className="font-semibold text-foreground mb-3">Core</h3>
                <div className="grid gap-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Label>Title</Label>
                      <Input
                        value={formData.title || ''}
                        onChange={(e) => updateField('title', e.target.value)}
                        placeholder="e.g. 90s Red Chunky Jumper – Women's L"
                      />
                    </div>
                    <CopyButton text={formData.title || ''} field="Title" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Price (£)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={formData.price || ''}
                        onChange={(e) => updateField('price', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div>
                      <Label>Garment Type</Label>
                      <Select
                        value={formData.garment_type || ''}
                        onValueChange={(v) => updateField('garment_type', v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {garmentTypes.map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Department</Label>
                      <Select
                        value={formData.department || ''}
                        onValueChange={(v) => updateField('department', v as Department)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select department" />
                        </SelectTrigger>
                        <SelectContent>
                          {departments.map(d => (
                            <SelectItem key={d} value={d}>{d}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Era</Label>
                      <Select
                        value={formData.era || ''}
                        onValueChange={(v) => updateField('era', v as Era)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select era" />
                        </SelectTrigger>
                        <SelectContent>
                          {eras.filter(Boolean).map(e => (
                            <SelectItem key={e} value={e}>{e}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Brand</Label>
                      <Input
                        value={formData.brand || ''}
                        onChange={(e) => updateField('brand', e.target.value)}
                        placeholder="e.g. Gap, Levi's"
                      />
                    </div>
                    <div>
                      <Label>Fit</Label>
                      <Select
                        value={formData.fit || ''}
                        onValueChange={(v) => updateField('fit', v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select fit" />
                        </SelectTrigger>
                        <SelectContent>
                          {fits.map(f => (
                            <SelectItem key={f} value={f}>{f}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Size (Label)</Label>
                      <Input
                        value={formData.size_label || ''}
                        onChange={(e) => updateField('size_label', e.target.value)}
                        placeholder="e.g. L, UK 14"
                      />
                    </div>
                    <div>
                      <Label>Size (Recommended)</Label>
                      <Input
                        value={formData.size_recommended || ''}
                        onChange={(e) => updateField('size_recommended', e.target.value)}
                        placeholder="e.g. Best for UK 12–14"
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* Material & Condition */}
              <section>
                <h3 className="font-semibold text-foreground mb-3">Material & Condition</h3>
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Material</Label>
                      <Input
                        value={formData.material || ''}
                        onChange={(e) => updateField('material', e.target.value)}
                        placeholder="e.g. 100% wool"
                      />
                    </div>
                    <div>
                      <Label>Condition</Label>
                      <Select
                        value={formData.condition || ''}
                        onValueChange={(v) => updateField('condition', v as Condition)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select condition" />
                        </SelectTrigger>
                        <SelectContent>
                          {conditions.filter(Boolean).map(c => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Flaws</Label>
                      <Input
                        value={formData.flaws || ''}
                        onChange={(e) => updateField('flaws', e.target.value)}
                        placeholder="e.g. Minor pilling on cuffs"
                      />
                    </div>
                    <div>
                      <Label>Made In</Label>
                      <Input
                        value={formData.made_in || ''}
                        onChange={(e) => updateField('made_in', e.target.value)}
                        placeholder="e.g. Ecuador"
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* Colours & Pattern */}
              <section>
                <h3 className="font-semibold text-foreground mb-3">Colours & Pattern</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Main Colour</Label>
                    <Input
                      value={formData.colour_main || ''}
                      onChange={(e) => updateField('colour_main', e.target.value)}
                      placeholder="e.g. Red"
                    />
                  </div>
                  <div>
                    <Label>Secondary Colour</Label>
                    <Input
                      value={formData.colour_secondary || ''}
                      onChange={(e) => updateField('colour_secondary', e.target.value)}
                      placeholder="e.g. Navy"
                    />
                  </div>
                  <div>
                    <Label>Pattern</Label>
                    <Select
                      value={formData.pattern || ''}
                      onValueChange={(v) => updateField('pattern', v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select pattern" />
                      </SelectTrigger>
                      <SelectContent>
                        {patterns.map(p => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

              {/* Tags & Collections */}
              <section>
                <h3 className="font-semibold text-foreground mb-3">Tags & Collections</h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <Label>Shopify Tags</Label>
                      <Textarea
                        value={formData.shopify_tags || ''}
                        onChange={(e) => updateField('shopify_tags', e.target.value)}
                        placeholder="vintage, retro, knitwear"
                        rows={2}
                      />
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <Label>Collections Tags</Label>
                      <Textarea
                        value={formData.collections_tags || ''}
                        onChange={(e) => updateField('collections_tags', e.target.value)}
                        placeholder="spring-edit, knitwear, 80s90s-graphics"
                        rows={2}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Tags used for Shopify automatic collections
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <Label>Etsy Tags (up to 13)</Label>
                      <Textarea
                        value={formData.etsy_tags || ''}
                        onChange={(e) => updateField('etsy_tags', e.target.value)}
                        placeholder="vintage sweater, retro knitwear, 90s fashion"
                        rows={2}
                      />
                    </div>
                    <CopyButton text={formData.etsy_tags || ''} field="Etsy tags" />
                  </div>
                </div>
              </section>

              {/* Description & Listing Block */}
              <section>
                <h3 className="font-semibold text-foreground mb-3">Description & Listing Block</h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <Label>Description</Label>
                      <Textarea
                        value={formData.description || ''}
                        onChange={(e) => updateField('description', e.target.value)}
                        placeholder="A beautiful vintage piece..."
                        rows={4}
                      />
                    </div>
                    <CopyButton text={formData.description || ''} field="Description" />
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <Label>Listing Block (auto-generated)</Label>
                      <Textarea
                        value={formData.listing_block || ''}
                        readOnly
                        rows={6}
                        className="bg-muted/50"
                      />
                    </div>
                    <CopyButton text={formData.listing_block || ''} field="Listing block" />
                  </div>
                </div>
              </section>

              {/* Voice Input & Notes */}
              <section>
                <h3 className="font-semibold text-foreground mb-3">Voice Input & Notes</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Button
                      variant={isListening ? 'destructive' : 'outline'}
                      onClick={isListening ? stopVoiceInput : startVoiceInput}
                    >
                      {isListening ? (
                        <>
                          <MicOff className="w-4 h-4 mr-2" />
                          Stop Recording
                        </>
                      ) : (
                        <>
                          <Mic className="w-4 h-4 mr-2" />
                          Start Voice Input
                        </>
                      )}
                    </Button>
                    {voiceTranscript && (
                      <Button variant="outline" onClick={applyVoiceToFields}>
                        Apply to Fields
                      </Button>
                    )}
                  </div>
                  
                  {voiceTranscript && (
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <Label className="text-xs">Voice Transcript:</Label>
                      <p className="text-sm mt-1">{voiceTranscript}</p>
                    </div>
                  )}

                  <div>
                    <Label>Raw Input Text</Label>
                    <Textarea
                      value={formData.raw_input_text || ''}
                      onChange={(e) => updateField('raw_input_text', e.target.value)}
                      placeholder="Paste or type notes here..."
                      rows={3}
                    />
                  </div>

                  <div>
                    <Label>Notes</Label>
                    <Textarea
                      value={formData.notes || ''}
                      onChange={(e) => updateField('notes', e.target.value)}
                      placeholder="Any additional notes..."
                      rows={2}
                    />
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
