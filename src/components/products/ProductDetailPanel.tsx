import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  Mic, 
  Square,
  Copy, 
  Check,
  Save,
  Loader2,
  Camera,
  ShoppingBag,
  Pause,
  Play
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { ImageGallery } from './ImageGallery';
import { generateListingBlock } from '@/hooks/use-database';
import type { Product, ProductImage, Department, Era, Condition, Settings } from '@/types';

interface ProductDetailPanelProps {
  product: Product;
  images: ProductImage[];
  onClose: () => void;
  onSave: (updates: Partial<Product>) => void;
  onUpdateImage: (imageId: string, updates: Partial<ProductImage>) => void;
  onReorderImages: (imageId: string, newPosition: number) => void;
  onDeleteImage?: (imageId: string) => void;
  onMoveImages?: (imageIds: string[], targetProductId: string) => void;
  otherProducts?: Product[];
  onGenerateAI: (regenerateOnly?: 'title' | 'style_a' | 'style_b' | 'all') => void;
  onCreateInShopify?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  isGenerating: boolean;
  regeneratingField?: string | null;
  isCreatingShopify?: boolean;
  isShopifyConfigured?: boolean;
  settings?: Settings | null;
}

const UNSET_VALUE = '__unset__';
const departments: Department[] = ['Women', 'Men', 'Unisex', 'Kids'];
const eras: Era[] = ['80s', '90s', 'Y2K', 'Modern'];
const conditions: Condition[] = ['Excellent', 'Very good', 'Good', 'Fair'];
const garmentTypes = ['sweater', 'jumper', 'hoodie', 't-shirt', 'shirt', 'blouse', 'jeans', 'trousers', 'dress', 'skirt', 'jacket', 'coat', 'fleece', 'cardigan', 'vest', 'shorts', 'flannel shirt'];
const fits = ['oversized', 'boxy', 'regular', 'slim', 'cropped', 'relaxed', 'fitted'];
const patterns = ['plain', 'striped', 'graphic', 'fair isle', 'cable knit', 'argyle', 'floral', 'abstract', 'checked', 'plaid'];

export function ProductDetailPanel({
  product,
  images,
  onClose,
  onSave,
  onUpdateImage,
  onReorderImages,
  onDeleteImage,
  onMoveImages,
  otherProducts = [],
  onGenerateAI,
  onCreateInShopify,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  isGenerating,
  regeneratingField,
  isCreatingShopify,
  isShopifyConfigured,
  settings,
}: ProductDetailPanelProps) {
  const [formData, setFormData] = useState<Partial<Product>>({});
  const [isListening, setIsListening] = useState(false);
  const [isParsingVoice, setIsParsingVoice] = useState(false);
  const [isAnalyzingImages, setIsAnalyzingImages] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [descriptionStyle, setDescriptionStyle] = useState<'A' | 'B'>('A');
  const [isApplyingFixes, setIsApplyingFixes] = useState(false);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [isScrollPaused, setIsScrollPaused] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState<'slow' | 'medium' | 'fast'>('medium');
  const recognitionRef = useRef<any>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const autoScrollIntervalRef = useRef<number | null>(null);
  const hasAutoStartedRef = useRef(false);
  const hasAutoScrollStartedRef = useRef(false);

  // Settings with defaults
  const autoStartRecording = settings?.auto_start_recording ?? true;
  const autoScrollReview = settings?.auto_scroll_review ?? false;

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
      pit_to_pit: product.pit_to_pit,
      made_in: product.made_in,
      colour_main: product.colour_main,
      colour_secondary: product.colour_secondary,
      pattern: product.pattern,
      shopify_tags: product.shopify_tags,
      collections_tags: product.collections_tags,
      etsy_tags: product.etsy_tags,
      description: product.description,
      description_style_a: product.description_style_a,
      description_style_b: product.description_style_b,
      listing_block: product.listing_block,
      raw_input_text: product.raw_input_text,
      notes: product.notes,
    });
    
    // Reset auto-start flag when product changes
    hasAutoStartedRef.current = false;
  }, [product]);

  // Auto-start recording when Edit opens (with toggle)
  useEffect(() => {
    if (autoStartRecording && !hasAutoStartedRef.current && !isListening && !isParsingVoice) {
      hasAutoStartedRef.current = true;
      const timer = setTimeout(() => {
        startVoiceInput();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [autoStartRecording, product.id]);

  // Auto-scroll functionality - reset when product changes
  useEffect(() => {
    hasAutoScrollStartedRef.current = false;
    setIsScrollPaused(false);
    stopAutoScroll();
  }, [product.id]);

  // Start auto-scroll when enabled
  useEffect(() => {
    if (autoScrollReview && !hasAutoScrollStartedRef.current && !isAutoScrolling) {
      hasAutoScrollStartedRef.current = true;
      const timer = setTimeout(() => {
        startAutoScroll();
      }, 800); // Delay to let content render
      return () => clearTimeout(timer);
    }
  }, [autoScrollReview, product.id]);

  // Speed settings: slow=20px/s, medium=40px/s, fast=70px/s
  const getScrollPixelsPerSecond = useCallback(() => {
    switch (scrollSpeed) {
      case 'slow': return 20;
      case 'medium': return 40;
      case 'fast': return 70;
      default: return 40;
    }
  }, [scrollSpeed]);

  const startAutoScroll = useCallback(() => {
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
    }
    setIsAutoScrolling(true);
    setIsScrollPaused(false);
    
    const pxPerSecond = getScrollPixelsPerSecond();
    const intervalMs = 50;
    const pxPerInterval = (pxPerSecond * intervalMs) / 1000;
    
    autoScrollIntervalRef.current = window.setInterval(() => {
      if (contentRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
        if (scrollTop + clientHeight >= scrollHeight - 5) {
          // Reached bottom, stop
          stopAutoScroll();
        } else {
          contentRef.current.scrollTop += pxPerInterval;
        }
      }
    }, intervalMs);
  }, [getScrollPixelsPerSecond]);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }
    setIsAutoScrolling(false);
  }, []);

  const handleManualScroll = useCallback(() => {
    // User manually scrolled, pause auto-scroll
    if (isAutoScrolling && !isScrollPaused) {
      setIsScrollPaused(true);
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
        autoScrollIntervalRef.current = null;
      }
    }
  }, [isAutoScrolling, isScrollPaused]);

  const toggleScrollPause = useCallback(() => {
    if (isScrollPaused) {
      setIsScrollPaused(false);
      startAutoScroll();
    } else {
      setIsScrollPaused(true);
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
        autoScrollIntervalRef.current = null;
      }
    }
  }, [isScrollPaused, startAutoScroll]);

  // Update scroll speed and restart if scrolling
  const changeScrollSpeed = useCallback((newSpeed: 'slow' | 'medium' | 'fast') => {
    setScrollSpeed(newSpeed);
    if (isAutoScrolling && !isScrollPaused) {
      // Restart with new speed
      setTimeout(() => startAutoScroll(), 50);
    }
  }, [isAutoScrolling, isScrollPaused, startAutoScroll]);

  const updateField = <K extends keyof Product>(field: K, value: Product[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
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

  const startVoiceInput = async () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error('Voice input not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
    } catch (err) {
      console.error('Microphone permission error:', err);
      toast.error('Microphone access denied.');
      return;
    }

    setVoiceTranscript('');

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-GB';
    recognition.maxAlternatives = 5;

    let finalTranscript = '';
    let interimTranscript = '';

    const fixNumberTranscript = (text: string): string => {
      return text
        .replace(/\bfastest\s*£?(\d+)/gi, '£$1')
        .replace(/\bthe\s+fastest\s+/gi, '')
        .replace(/\bfive\b/gi, '5')
        .replace(/\btwenty five\b/gi, '25')
        .replace(/\btwenty-five\b/gi, '25')
        .replace(/\bfifteen\b/gi, '15')
        .replace(/\bthirty five\b/gi, '35')
        .replace(/\bforty five\b/gi, '45')
        .replace(/\bfifty five\b/gi, '55')
        .replace(/(\d+)\s*pounds?\b/gi, '£$1')
        .replace(/(\d+)\s*quid\b/gi, '£$1');
    };

    recognition.onstart = () => {
      console.log('Voice recognition started');
      setIsListening(true);
      finalTranscript = '';
      interimTranscript = '';
    };
    
    recognition.onend = () => {
      console.log('Voice recognition ended, final transcript:', finalTranscript);
      setIsListening(false);
      if (finalTranscript.trim()) {
        setVoiceTranscript(finalTranscript.trim());
      }
    };
    
    recognition.onerror = (event: any) => {
      console.error('Voice recognition error:', event.error);
      setIsListening(false);
      if (event.error === 'not-allowed') {
        toast.error('Microphone access denied.');
      } else if (event.error === 'no-speech') {
        toast.info('No speech detected.');
      } else if (event.error === 'audio-capture') {
        toast.error('No microphone found.');
      } else if (event.error === 'network') {
        toast.error('Network error.');
      } else if (event.error !== 'aborted') {
        toast.error(`Voice error: ${event.error}`);
      }
    };

    recognition.onresult = (event: any) => {
      interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        let bestTranscript = result[0].transcript;
        
        for (let j = 0; j < result.length; j++) {
          const alt = result[j].transcript;
          if (/£\d+|\b\d{2,}\b/.test(alt)) {
            bestTranscript = alt;
            break;
          }
        }
        
        if (result.isFinal) {
          const fixedTranscript = fixNumberTranscript(bestTranscript);
          finalTranscript += fixedTranscript + ' ';
        } else {
          interimTranscript += bestTranscript;
        }
      }
      
      const displayText = fixNumberTranscript((finalTranscript + interimTranscript).trim());
      if (displayText) {
        setVoiceTranscript(displayText);
      }
    };

    recognitionRef.current = recognition;
    
    try {
      recognition.start();
    } catch (error) {
      console.error('Failed to start recognition:', error);
      toast.error('Failed to start voice input.');
      setIsListening(false);
    }
  };

  const stopVoiceInput = useCallback(() => {
    console.log('Stopping voice input');
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.log('Recognition already stopped');
      }
    }
    setIsListening(false);
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      stopAutoScroll();
    };
  }, []);

  const applyVoiceToFields = async (): Promise<boolean> => {
    if (!voiceTranscript.trim()) {
      toast.error('No voice transcript to apply');
      return false;
    }

    // Guard: transcript too short
    const wordCount = voiceTranscript.trim().split(/\s+/).length;
    if (wordCount < 3) {
      toast.info('Transcript too short to apply changes.');
      return false;
    }
    
    setIsParsingVoice(true);
    setIsApplyingFixes(true);
    
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-voice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ 
          transcript: voiceTranscript,
          existingCondition: formData.condition 
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Voice parsing failed');
      }
      
      const data = await response.json();
      const parsed = data.parsed;
      
      if (Object.keys(parsed).length === 0) {
        toast.info('No fields detected in voice input.');
        return false;
      }
      
      // Apply parsed fields - only update if parsed value exists (preserve existing)
      const fieldUpdates: Partial<Product> = {};
      const updatedFields: string[] = [];
      
      if (parsed.price !== undefined) {
        fieldUpdates.price = parsed.price;
        updatedFields.push('price');
      }
      if (parsed.department) {
        fieldUpdates.department = parsed.department;
        updatedFields.push('department');
      }
      if (parsed.era) {
        fieldUpdates.era = parsed.era;
        updatedFields.push('era');
      }
      if (parsed.condition) {
        fieldUpdates.condition = parsed.condition;
        updatedFields.push('condition');
      }
      if (parsed.size_label) {
        fieldUpdates.size_label = parsed.size_label;
        updatedFields.push('size');
      }
      if (parsed.size_recommended) {
        fieldUpdates.size_recommended = parsed.size_recommended;
        updatedFields.push('recommended size');
      }
      if (parsed.brand) {
        fieldUpdates.brand = parsed.brand;
        updatedFields.push('brand');
      }
      if (parsed.material) {
        fieldUpdates.material = parsed.material;
        updatedFields.push('material');
      }
      if (parsed.colour_main) {
        fieldUpdates.colour_main = parsed.colour_main;
        updatedFields.push('colour');
      }
      if (parsed.colour_secondary) {
        fieldUpdates.colour_secondary = parsed.colour_secondary;
        updatedFields.push('secondary colour');
      }
      if (parsed.pattern) {
        fieldUpdates.pattern = parsed.pattern;
        updatedFields.push('pattern');
      }
      if (parsed.fit) {
        fieldUpdates.fit = parsed.fit;
        updatedFields.push('fit');
      }
      if (parsed.garment_type) {
        fieldUpdates.garment_type = parsed.garment_type;
        updatedFields.push('garment type');
      }
      if (parsed.pit_to_pit) {
        fieldUpdates.pit_to_pit = parsed.pit_to_pit;
        updatedFields.push('pit to pit');
      }
      if (parsed.made_in) {
        fieldUpdates.made_in = parsed.made_in;
        updatedFields.push('made in');
      }
      if (parsed.flaws) {
        fieldUpdates.flaws = parsed.flaws;
        updatedFields.push('flaws');
      }
      if (parsed.shopify_tags) {
        fieldUpdates.shopify_tags = parsed.shopify_tags;
        updatedFields.push('Shopify tags');
      }
      if (parsed.collections_tags) {
        fieldUpdates.collections_tags = parsed.collections_tags;
        updatedFields.push('collection tags');
      }
      if (parsed.etsy_tags) {
        fieldUpdates.etsy_tags = parsed.etsy_tags;
        updatedFields.push('Etsy tags');
      }
      if (parsed.notes) {
        // Append to existing notes
        fieldUpdates.notes = (formData.notes || '') + (formData.notes ? '\n' : '') + parsed.notes;
        updatedFields.push('notes');
      }
      
      if (parsed.preferred_style) {
        const newStyle = parsed.preferred_style === 'B' ? 'B' : 'A';
        setDescriptionStyle(newStyle);
        updatedFields.push(`style ${newStyle}`);
      }
      
      if (parsed.description_text) {
        const activeStyle = parsed.preferred_style === 'B' ? 'B' : (parsed.preferred_style === 'A' ? 'A' : descriptionStyle);
        if (activeStyle === 'A') {
          const existingDesc = formData.description_style_a || '';
          const separator = existingDesc.trim() ? ' ' : '';
          fieldUpdates.description_style_a = existingDesc.trim() + separator + parsed.description_text;
          updatedFields.push('description (Style A)');
        } else {
          const existingDesc = formData.description_style_b || '';
          const separator = existingDesc.trim() ? ' ' : '';
          fieldUpdates.description_style_b = existingDesc.trim() + separator + parsed.description_text;
          updatedFields.push('description (Style B)');
        }
      }
      
      const updatedFormData = { ...formData, ...fieldUpdates };
      setFormData(updatedFormData);
      
      // Append transcript to raw input
      updatedFormData.raw_input_text = (formData.raw_input_text || '') + (formData.raw_input_text ? '\n' : '') + voiceTranscript;

      // Auto-regenerate descriptions with updated product data
      if (updatedFields.length > 0) {
        try {
          toast.info('Regenerating descriptions...');
          const listingResponse = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-listing`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              },
              body: JSON.stringify({
                product: { ...product, ...updatedFormData },
                imageUrls: images.slice(0, 2).map(img => img.url),
              }),
            }
          );
          
          if (listingResponse.ok) {
            const { generated } = await listingResponse.json();
            if (generated) {
              setFormData(prev => ({
                ...prev,
                ...fieldUpdates,
                raw_input_text: updatedFormData.raw_input_text,
                description_style_a: generated.description_style_a || prev.description_style_a,
                description_style_b: generated.description_style_b || prev.description_style_b,
              }));
              updatedFields.push('descriptions regenerated');
            }
          }
        } catch (descError) {
          console.error('Error regenerating descriptions:', descError);
        }
      }
      
      toast.success(`Updated: ${updatedFields.join(', ')}`);
      setVoiceTranscript('');
      return true;
      
    } catch (error) {
      console.error('Voice parsing error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to parse voice input');
      return false;
    } finally {
      setIsParsingVoice(false);
      setIsApplyingFixes(false);
    }
  };

  // Navigation with auto-stop/save/apply
  const handleNavigate = async (direction: 'prev' | 'next') => {
    if (isApplyingFixes) return; // Prevent double-submits
    
    // If recording is active, stop and apply
    if (isListening) {
      stopVoiceInput();
      // Wait a moment for transcript to finalize
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // If there's a transcript, apply it
    if (voiceTranscript.trim()) {
      setIsApplyingFixes(true);
      await applyVoiceToFields();
      // Save after applying
      await handleSave();
      setIsApplyingFixes(false);
    }
    
    // Clear transcript for next item
    setVoiceTranscript('');
    
    // Navigate
    if (direction === 'prev' && onPrevious) {
      onPrevious();
    } else if (direction === 'next' && onNext) {
      onNext();
    }
  };

  const analyzeImages = async () => {
    if (images.length === 0) {
      toast.error('No images to analyze');
      return;
    }
    
    setIsAnalyzingImages(true);
    
    try {
      const imageUrls = images.slice(0, 4).map(img => img.url);
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-images`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ imageUrls }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Image analysis failed');
      }
      
      const data = await response.json();
      const extracted = data.extracted;
      
      if (!extracted || Object.keys(extracted).length === 0) {
        toast.info('Could not extract details from images');
        return;
      }
      
      const fieldUpdates: Partial<Product> = {};
      const updatedFields: string[] = [];
      
      if (extracted.brand) {
        fieldUpdates.brand = extracted.brand;
        updatedFields.push('brand');
      }
      if (extracted.size_label) {
        fieldUpdates.size_label = extracted.size_label;
        updatedFields.push('size');
      }
      if (extracted.material) {
        fieldUpdates.material = extracted.material;
        updatedFields.push('material');
      }
      if (extracted.made_in) {
        fieldUpdates.made_in = extracted.made_in;
        updatedFields.push('made in');
      }
      if (extracted.garment_type) {
        fieldUpdates.garment_type = extracted.garment_type.toLowerCase();
        updatedFields.push('garment type');
      }
      if (extracted.department) {
        fieldUpdates.department = extracted.department;
        updatedFields.push('department');
      }
      if (extracted.colour_main) {
        fieldUpdates.colour_main = extracted.colour_main;
        updatedFields.push('colour');
      }
      if (extracted.colour_secondary) {
        fieldUpdates.colour_secondary = extracted.colour_secondary;
        updatedFields.push('secondary colour');
      }
      if (extracted.pattern) {
        fieldUpdates.pattern = extracted.pattern.toLowerCase();
        updatedFields.push('pattern');
      }
      if (extracted.era) {
        fieldUpdates.era = extracted.era;
        updatedFields.push('era');
      }
      if (extracted.condition) {
        fieldUpdates.condition = extracted.condition;
        updatedFields.push('condition');
      }
      if (extracted.fit) {
        fieldUpdates.fit = extracted.fit.toLowerCase();
        updatedFields.push('fit');
      }
      
      setFormData(prev => ({ ...prev, ...fieldUpdates }));
      
      if (updatedFields.length > 0) {
        toast.success(`Extracted: ${updatedFields.join(', ')}`);
      } else {
        toast.info('No new details extracted from images');
      }
      
    } catch (error) {
      console.error('Image analysis error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to analyze images');
    } finally {
      setIsAnalyzingImages(false);
    }
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
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-start justify-center p-0 md:p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-none md:rounded-lg shadow-lg w-full max-w-6xl min-h-screen md:min-h-0 md:h-[90vh] flex flex-col md:overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card flex items-center justify-between p-2 md:p-4 border-b border-border gap-2">
          <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleNavigate('prev')}
              disabled={!hasPrevious || isApplyingFixes}
              className="h-8 w-8"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleNavigate('next')}
              disabled={!hasNext || isApplyingFixes}
              className="h-8 w-8"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <span className="text-xs md:text-sm text-muted-foreground ml-1 truncate max-w-[80px] md:max-w-none">
              {product.sku}
            </span>
            {isApplyingFixes && (
              <span className="text-xs text-primary flex items-center gap-1 ml-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Applying...
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="icon"
              onClick={() => analyzeImages()}
              disabled={isAnalyzingImages || images.length === 0}
              className="h-10 w-10 md:h-9 md:w-auto md:px-3"
              type="button"
            >
              {isAnalyzingImages ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Camera className="w-5 h-5 md:mr-1" />
              )}
              <span className="hidden md:inline">Analyze</span>
            </Button>
            <Button
              variant="default"
              size="icon"
              onClick={() => onGenerateAI('all')}
              disabled={isGenerating}
              className="h-10 w-10 md:h-9 md:w-auto md:px-3"
              type="button"
            >
              {isGenerating && !regeneratingField ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Sparkles className="w-5 h-5 md:mr-1" />
              )}
              <span className="hidden md:inline">Generate</span>
            </Button>
            <Button 
              onClick={() => handleSave()} 
              disabled={isSaving} 
              size="icon"
              className="h-10 w-10 md:h-9 md:w-auto md:px-3"
              type="button"
            >
              {isSaving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Save className="w-5 h-5 md:mr-1" />
              )}
              <span className="hidden md:inline">Save</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onCreateInShopify?.()}
              disabled={isCreatingShopify || !isShopifyConfigured || product.status === 'created_in_shopify'}
              className="h-10 w-10 md:h-9 md:w-auto md:px-3"
              type="button"
            >
              {isCreatingShopify ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : product.status === 'created_in_shopify' ? (
                <Check className="w-5 h-5 text-success" />
              ) : (
                <ShoppingBag className="w-5 h-5 md:mr-1" />
              )}
              <span className="hidden md:inline">
                {product.status === 'created_in_shopify' ? 'Done' : 'Shopify'}
              </span>
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-10 w-10" type="button">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Static Voice Recording Section */}
        <div className="flex-shrink-0 border-b border-border p-3 md:p-4 bg-background">
          <div className="max-w-4xl mx-auto">
            {/* Auto-scroll control */}
            {autoScrollReview && (
              <div className="flex items-center justify-between gap-2 bg-muted/50 rounded-lg p-2 border border-border mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Speed:</span>
                  <div className="flex items-center gap-1 border border-border rounded-md p-0.5 bg-background">
                    <Button
                      variant={scrollSpeed === 'slow' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => changeScrollSpeed('slow')}
                      className="h-6 px-2 text-xs"
                      type="button"
                    >
                      Slow
                    </Button>
                    <Button
                      variant={scrollSpeed === 'medium' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => changeScrollSpeed('medium')}
                      className="h-6 px-2 text-xs"
                      type="button"
                    >
                      Medium
                    </Button>
                    <Button
                      variant={scrollSpeed === 'fast' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => changeScrollSpeed('fast')}
                      className="h-6 px-2 text-xs"
                      type="button"
                    >
                      Fast
                    </Button>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleScrollPause}
                  className="gap-1 h-7"
                >
                  {isScrollPaused || !isAutoScrolling ? (
                    <>
                      <Play className="w-3 h-3" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="w-3 h-3" />
                      Pause
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Voice Recording Section */}
            <section className="bg-muted/30 rounded-lg p-4 border border-border">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 border border-border rounded-md p-1 bg-background">
                  <Button
                    variant={descriptionStyle === 'A' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setDescriptionStyle('A')}
                    className="h-7 px-2 text-xs"
                    type="button"
                  >
                    Style A
                  </Button>
                  <Button
                    variant={descriptionStyle === 'B' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setDescriptionStyle('B')}
                    className="h-7 px-2 text-xs"
                    type="button"
                  >
                    Style B
                  </Button>
                </div>
                
                {!isListening ? (
                  <Button
                    variant="outline"
                    onClick={startVoiceInput}
                    disabled={isParsingVoice}
                    className="flex-1 md:flex-none"
                  >
                    <Mic className="w-4 h-4 mr-2" />
                    Start Recording
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    onClick={stopVoiceInput}
                    className="flex-1 md:flex-none"
                  >
                    <Square className="w-4 h-4 mr-2" />
                    Stop Recording
                  </Button>
                )}
                
                {isListening && (
                  <span className="text-sm text-destructive animate-pulse flex items-center gap-2">
                    <span className="w-2 h-2 bg-destructive rounded-full animate-pulse" />
                    Recording...
                  </span>
                )}
                
                {voiceTranscript && !isListening && (
                  <Button 
                    variant="default" 
                    onClick={applyVoiceToFields}
                    disabled={isParsingVoice}
                  >
                    {isParsingVoice ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Parsing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Apply to Fields
                      </>
                    )}
                  </Button>
                )}
                
                {voiceTranscript && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setVoiceTranscript('')}
                  >
                    Clear
                  </Button>
                )}
              </div>
              
              {voiceTranscript && (
                <div className="mt-2 p-3 bg-muted/50 rounded-lg border border-border">
                  <Label className="text-xs text-muted-foreground">Voice Transcript:</Label>
                  <p className="text-sm mt-1 text-foreground">{voiceTranscript}</p>
                </div>
              )}
              
              {!voiceTranscript && !isListening && (
                <p className="text-xs text-muted-foreground mt-2">
                  Speak product details. All attributes mentioned will auto-populate and descriptions will regenerate.
                </p>
              )}
            </section>
          </div>
        </div>

        {/* Scrollable Content - Description first, then attributes, then images */}
        <div 
          ref={contentRef}
          className="flex-1 overflow-y-auto scrollbar-thin p-3 md:p-4"
          onScroll={handleManualScroll}
        >
          <div className="max-w-4xl mx-auto space-y-6">
            <section>
              <h3 className="font-semibold text-foreground mb-3">Generated Description</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label>Style A – Ultra Minimal (~55-65 words)</Label>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onGenerateAI('style_a')}
                        disabled={isGenerating}
                        title="Regenerate Style A only"
                      >
                        {regeneratingField === 'style_a' ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                      </Button>
                      <CopyButton text={formData.description_style_a || ''} field="Style A" />
                    </div>
                  </div>
                  <Textarea
                    value={formData.description_style_a || ''}
                    onChange={(e) => updateField('description_style_a', e.target.value)}
                    placeholder="Ultra minimal description..."
                    rows={6}
                    className="text-sm"
                  />
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label>Style B – Natural Minimal SEO (~70-80 words)</Label>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onGenerateAI('style_b')}
                        disabled={isGenerating}
                        title="Regenerate Style B only"
                      >
                        {regeneratingField === 'style_b' ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                      </Button>
                      <CopyButton text={formData.description_style_b || ''} field="Style B" />
                    </div>
                  </div>
                  <Textarea
                    value={formData.description_style_b || ''}
                    onChange={(e) => updateField('description_style_b', e.target.value)}
                    placeholder="Natural minimal SEO description..."
                    rows={6}
                    className="text-sm"
                  />
                </div>
              </div>
            </section>

            {/* ATTRIBUTES SECTION */}
            <section>
              <h3 className="font-semibold text-foreground mb-3">Attributes</h3>
              <div className="grid gap-4">
                {/* Title */}
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Label>Title (max 80 chars)</Label>
                    <Input
                      value={formData.title || ''}
                      onChange={(e) => updateField('title', e.target.value)}
                      placeholder="Vintage 90s Brand Womens Grey Hoodie Size L"
                      maxLength={80}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {(formData.title || '').length}/80 characters
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onGenerateAI('title')}
                      disabled={isGenerating}
                      title="Regenerate title only"
                    >
                      {regeneratingField === 'title' ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                    </Button>
                    <CopyButton text={formData.title || ''} field="Title" />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                      value={formData.garment_type || UNSET_VALUE}
                      onValueChange={(v) => updateField('garment_type', v === UNSET_VALUE ? '' : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNSET_VALUE}>(Not set)</SelectItem>
                        {garmentTypes.map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Department</Label>
                    <Select
                      value={formData.department || UNSET_VALUE}
                      onValueChange={(v) => updateField('department', v === UNSET_VALUE ? '' as Department : v as Department)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNSET_VALUE}>(Not set)</SelectItem>
                        {departments.map(d => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Era</Label>
                    <Select
                      value={formData.era || UNSET_VALUE}
                      onValueChange={(v) => updateField('era', v === UNSET_VALUE ? '' as Era : v as Era)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select era" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNSET_VALUE}>(Not set)</SelectItem>
                        {eras.map(e => (
                          <SelectItem key={e} value={e}>{e}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                      value={formData.fit || UNSET_VALUE}
                      onValueChange={(v) => updateField('fit', v === UNSET_VALUE ? '' : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select fit" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNSET_VALUE}>(Not set)</SelectItem>
                        {fits.map(f => (
                          <SelectItem key={f} value={f}>{f}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label>Pit to Pit</Label>
                    <Input
                      value={formData.pit_to_pit || ''}
                      onChange={(e) => updateField('pit_to_pit', e.target.value)}
                      placeholder="e.g. 23 inches"
                    />
                  </div>
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
                      value={formData.condition || UNSET_VALUE}
                      onValueChange={(v) => updateField('condition', v === UNSET_VALUE ? '' as Condition : v as Condition)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select condition" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNSET_VALUE}>(Not set)</SelectItem>
                        {conditions.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label>Flaws</Label>
                    <Input
                      value={formData.flaws || ''}
                      onChange={(e) => updateField('flaws', e.target.value)}
                      placeholder="e.g. Minor pilling"
                    />
                  </div>
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
                      value={formData.pattern || UNSET_VALUE}
                      onValueChange={(v) => updateField('pattern', v === UNSET_VALUE ? '' : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select pattern" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNSET_VALUE}>(Not set)</SelectItem>
                        {patterns.map(p => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </section>

            {/* Tags Section */}
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
                      placeholder="spring-edit, knitwear"
                      rows={2}
                    />
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <Label>Etsy Tags (up to 13)</Label>
                    <Textarea
                      value={formData.etsy_tags || ''}
                      onChange={(e) => updateField('etsy_tags', e.target.value)}
                      placeholder="vintage sweater, retro knitwear"
                      rows={2}
                    />
                  </div>
                  <CopyButton text={formData.etsy_tags || ''} field="Etsy tags" />
                </div>
              </div>
            </section>

            {/* Images Section */}
            <section>
              <h3 className="font-semibold text-foreground mb-3">Images</h3>
              <ImageGallery
                images={images}
                onUpdateImage={onUpdateImage}
                onReorderImages={onReorderImages}
                onDeleteImage={onDeleteImage}
                onMoveImages={onMoveImages}
                otherProducts={otherProducts}
                currentProductId={product.id}
              />
            </section>

            {/* Notes Section */}
            <section>
              <h3 className="font-semibold text-foreground mb-3">Notes</h3>
              <Textarea
                value={formData.notes || ''}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="Internal notes..."
                rows={3}
              />
            </section>

            {/* Legacy Description */}
            <section>
              <h3 className="font-semibold text-foreground mb-3">Legacy Description (for Shopify)</h3>
              <Textarea
                value={formData.description || ''}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Legacy description used for Shopify export..."
                rows={4}
              />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}