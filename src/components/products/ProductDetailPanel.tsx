import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
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
  Eraser,
  Undo2,
  Shirt,
  User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ImageGallery } from './ImageGallery';
import { ShopifyStatusSection } from './ShopifyStatusSection';
import { generateListingBlock } from '@/hooks/use-database';
import { useBackgroundRemoval } from '@/hooks/use-background-removal';
import { useModelTryOn, type PoseType, type FitStyle, type OutfitStyle } from '@/hooks/use-model-tryon';
import { ModelTryOnDialog } from '@/components/model-tryon/ModelTryOnDialog';
import { supabase } from '@/integrations/supabase/client';
import type { Product, ProductImage, Department, Era, Condition } from '@/types';

interface ProductDetailPanelProps {
  product: Product;
  images: ProductImage[];
  batchId: string;
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
  autoStartRecording?: boolean;
  // Shopify status override props
  onMarkAsUploaded?: (shopifyProductId?: string) => void;
  onMarkAsPending?: () => void;
}

const UNSET_VALUE = '__unset__';
const departments: Department[] = ['Women', 'Men', 'Unisex', 'Kids'];
const eras: Era[] = ['80s', '90s', 'Y2K', 'Modern'];
const conditions: Condition[] = ['Excellent', 'Very good', 'Good', 'Fair'];
const garmentTypes = ['sweater', 'jumper', 'hoodie', 't-shirt', 'shirt', 'blouse', 'jeans', 'trousers', 'dress', 'skirt', 'jacket', 'coat', 'fleece', 'cardigan', 'vest', 'shorts', 'flannel shirt'];
const fits = ['oversized', 'boxy', 'regular', 'slim', 'cropped', 'relaxed', 'fitted'];
const patterns = ['plain', 'striped', 'graphic', 'fair isle', 'cable knit', 'argyle', 'floral', 'abstract', 'checked', 'plaid'];
const VOICE_FIELD_KEYS = [
  'price',
  'department',
  'era',
  'condition',
  'size_label',
  'size_recommended',
  'brand',
  'material',
  'colour_main',
  'colour_secondary',
  'pattern',
  'fit',
  'garment_type',
  'pit_to_pit',
  'made_in',
  'flaws',
  'shopify_tags',
  'collections_tags',
  'etsy_tags',
  'notes',
] as const;

export function ProductDetailPanel({
  product,
  images,
  batchId,
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
  autoStartRecording = false,
  onMarkAsUploaded,
  onMarkAsPending,
}: ProductDetailPanelProps) {
  const { isProcessing: isRemovingBg, progress: bgProgress, removeBackgroundBulk, applyGhostMannequinBulk } = useBackgroundRemoval();
  const { isProcessing: isModelProcessing, progress: modelProgress, processBulk: processModelBulk } = useModelTryOn();
  const [formData, setFormData] = useState<Partial<Product>>({});
  const [isListening, setIsListening] = useState(false);
  const [isParsingVoice, setIsParsingVoice] = useState(false);
  const [isAnalyzingImages, setIsAnalyzingImages] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [localImages, setLocalImages] = useState<ProductImage[]>(images);
  // Background removal undo state
  const [bgUndoData, setBgUndoData] = useState<{ imageId: string; originalUrl: string; newUrl: string }[]>([]);
  const [ghostUndoData, setGhostUndoData] = useState<{ imageId: string; originalUrl: string; newUrl: string }[]>([]);
  const [modelUndoData, setModelUndoData] = useState<{ imageId: string; originalUrl: string; newUrl: string }[]>([]);
  const [isGhostProcessing, setIsGhostProcessing] = useState(false);
  const [ghostProgress, setGhostProgress] = useState({ current: 0, total: 0 });
  const [showModelTryOnDialog, setShowModelTryOnDialog] = useState(false);
  const [descriptionStyle, setDescriptionStyle] = useState<'A' | 'B'>('A');
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [recorderMountCount, setRecorderMountCount] = useState(0);
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'stopping'>('idle');
  const [micPermission, setMicPermission] = useState<'unknown' | 'granted' | 'denied' | 'error'>('unknown');
  const [sttEngine, setSttEngine] = useState<string>('unknown');
  const [voiceEventDebug, setVoiceEventDebug] = useState({
    startCount: 0,
    resultCount: 0,
    endCount: 0,
    errorCount: 0,
    lastStartAt: null as string | null,
    lastResultAt: null as string | null,
    lastEndAt: null as string | null,
    lastErrorAt: null as string | null,
  });
  const [debugTranscripts, setDebugTranscripts] = useState({
    interim: '',
    final: '',
  });
  const [debugParsedAttributes, setDebugParsedAttributes] = useState<Record<string, unknown> | null>(null);
  const [debugPopulateStatus, setDebugPopulateStatus] = useState({
    called: false,
    updatedCount: 0,
    updatedFields: [] as string[],
    totalPossibleFields: VOICE_FIELD_KEYS.length,
    missingFields: [] as string[],
    error: null as string | null,
  });
  const recognitionRef = useRef<any>(null);
  const recorderMountRef = useRef(0);
  
  // Track unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const initialFormDataRef = useRef<Partial<Product>>({});
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSaveTimeRef = useRef<number>(0);

  useEffect(() => {
    const initialData = {
      sku: product.sku,
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
    };
    setFormData(initialData);
    initialFormDataRef.current = initialData;
    setHasUnsavedChanges(false);
  }, [product]);
  
  // Track changes to formData
  useEffect(() => {
    const hasChanges = Object.keys(formData).some(key => {
      const k = key as keyof typeof formData;
      return formData[k] !== initialFormDataRef.current[k];
    });
    setHasUnsavedChanges(hasChanges);
    
    // Auto-save draft with debounce (every 3 seconds if changes detected)
    if (hasChanges && autoSaveTimerRef.current === null) {
      autoSaveTimerRef.current = setTimeout(async () => {
        const now = Date.now();
        // Only auto-save if at least 3 seconds since last save
        if (now - lastSaveTimeRef.current >= 3000) {
          console.log('[AutoSave] Saving draft...');
          try {
            const updatedProduct = { ...product, ...formData };
            const listingBlock = generateListingBlock(updatedProduct as Product);
            await onSave({ ...formData, listing_block: listingBlock });
            lastSaveTimeRef.current = now;
            initialFormDataRef.current = formData;
            setHasUnsavedChanges(false);
          } catch (e) {
            console.error('[AutoSave] Failed:', e);
          }
        }
        autoSaveTimerRef.current = null;
      }, 3000);
    }
    
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [formData, product, onSave]);
  
  // Auto-start recording when panel opens with autoStartRecording flag
  useEffect(() => {
    if (autoStartRecording && !isListening && !isParsingVoice) {
      // Small delay to let UI settle
      const timer = setTimeout(() => {
        startVoiceInput();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoStartRecording]);


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
      initialFormDataRef.current = formData;
      setHasUnsavedChanges(false);
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
      toast.error('Voice input not supported in this browser. Please type in the Raw Input Text box instead.');
      return;
    }

    // Request microphone permission first
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop the stream immediately - we just needed to request permission
      stream.getTracks().forEach(track => track.stop());
    } catch (err) {
      console.error('Microphone permission error:', err);
      toast.error('Microphone access denied. Please allow microphone access and try again.');
      return;
    }

    // Clear previous transcript when starting new recording
    setVoiceTranscript('');

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-GB';
    recognition.maxAlternatives = 3;

    let finalTranscript = '';
    let interimTranscript = '';

    // Lightly normalize transcript (numbers & currency) but keep wording as close as possible
    const fixTranscript = (text: string): string => {
      return text
        // Normalize common number words
        .replace(/\bfive\b/gi, '5')
        .replace(/\bten\b/gi, '10')
        .replace(/\beleven\b/gi, '11')
        .replace(/\btwelve\b/gi, '12')
        .replace(/\bthirteen\b/gi, '13')
        .replace(/\bfourteen\b/gi, '14')
        .replace(/\bfifteen\b/gi, '15')
        .replace(/\bsixteen\b/gi, '16')
        .replace(/\bseventeen\b/gi, '17')
        .replace(/\beighteen\b/gi, '18')
        .replace(/\bnineteen\b/gi, '19')
        .replace(/\btwenty[- ]?one\b/gi, '21')
        .replace(/\btwenty[- ]?two\b/gi, '22')
        .replace(/\btwenty[- ]?three\b/gi, '23')
        .replace(/\btwenty[- ]?four\b/gi, '24')
        .replace(/\btwenty[- ]?five\b/gi, '25')
        // Ensure pound symbols are kept
        .replace(/(\d+)\s*pounds?\b/gi, '£$1')
        .replace(/(\d+)\s*quid\b/gi, '£$1')
        // Clean up extra spaces
        .replace(/\s+/g, ' ')
        .trim();
    };

    recognition.onstart = () => {
      console.log('Voice recognition started');
      setIsListening(true);
      finalTranscript = '';
      interimTranscript = '';
      toast.success('Listening... Speak now');
    };
    
    recognition.onend = () => {
      console.log('Voice recognition ended, final transcript:', finalTranscript);
      setIsListening(false);
      const cleaned = fixTranscript(finalTranscript).trim();
      if (cleaned) {
        setVoiceTranscript(cleaned);
        console.log('Auto-applying voice to fields with transcript:', cleaned);
        // Auto-apply once recording stops so user doesn't need an extra click
        setTimeout(() => {
          // Guard against double-runs
          if (!isParsingVoiceRef.current) {
            applyVoiceToFields(cleaned).catch((err) => {
              console.error('Auto applyVoiceToFields error:', err);
            });
          }
        }, 0);
      }
    };
    
    recognition.onerror = (event: any) => {
      console.error('Voice recognition error:', event.error);
      setIsListening(false);
      if (event.error === 'not-allowed') {
        toast.error('Microphone access denied. Please allow microphone access in your browser settings.');
      } else if (event.error === 'no-speech') {
        toast.info('No speech detected. Speak closer to the microphone.');
      } else if (event.error === 'audio-capture') {
        toast.error('No microphone found. Please connect a microphone.');
      } else if (event.error === 'network') {
        toast.error('Network error. Check your internet connection.');
      } else if (event.error !== 'aborted') {
        toast.error(`Voice error: ${event.error}. Please try again.`);
      }
    };

    recognition.onresult = (event: any) => {
      interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        
        if (result.isFinal) {
          const fixedTranscript = fixTranscript(transcript);
          console.log('Final result:', transcript, '-> fixed:', fixedTranscript, 'confidence:', result[0].confidence);
          finalTranscript += fixedTranscript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }
      
      // Show both final and interim results for real-time feedback
      const displayText = fixTranscript((finalTranscript + interimTranscript).trim());
      if (displayText) {
        setVoiceTranscript(displayText);
      }
    };

    recognition.onsoundstart = () => {
      console.log('Sound detected');
    };

    recognition.onsoundend = () => {
      console.log('Sound ended');
    };

    recognitionRef.current = recognition;
    
    try {
      recognition.start();
    } catch (error) {
      console.error('Failed to start recognition:', error);
      toast.error('Failed to start voice input. Please try again.');
      setIsListening(false);
    }
  };

  const stopVoiceInput = () => {
    console.log('Stopping voice input');
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.log('Recognition already stopped');
      }
    }
    setIsListening(false);
  };

  // Keep a ref to latest formData so flush-on-unmount always uses current values
  const formDataRef = useRef(formData);
  formDataRef.current = formData;
  const hasUnsavedRef = useRef(hasUnsavedChanges);
  hasUnsavedRef.current = hasUnsavedChanges;
  const productRef = useRef(product);
  productRef.current = product;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Flush unsaved changes immediately (used on close & unmount)
  const flushSave = useRef(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (hasUnsavedRef.current) {
      try {
        const updatedProduct = { ...productRef.current, ...formDataRef.current };
        const listingBlock = generateListingBlock(updatedProduct as Product);
        onSaveRef.current({ ...formDataRef.current, listing_block: listingBlock });
        hasUnsavedRef.current = false;
      } catch (e) {
        console.error('[FlushSave] Failed:', e);
      }
    }
  });

  // Cleanup on unmount – flush pending saves & stop recognition
  useEffect(() => {
    return () => {
      flushSave.current();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore
        }
      }
    };
  }, []);

  const isParsingVoiceRef = useRef(false);

  const applyVoiceToFields = async (transcriptOverride?: string) => {
    const transcriptToUse = (transcriptOverride ?? voiceTranscript).trim();
    if (!transcriptToUse) {
      toast.error('No voice transcript to apply');
      return;
    }
    
    console.log('[Voice] Applying voice to fields with transcript:', transcriptToUse);
    setIsParsingVoice(true);
    isParsingVoiceRef.current = true;
    
    try {
      // Call the parse-voice edge function
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-voice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ 
          transcript: transcriptToUse,
          existingCondition: formData.condition 
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Voice parsing failed');
      }
      
      const data = await response.json();
      const parsed = data.parsed;
      console.log('[Voice] Parsed attributes from edge function:', parsed);
      
      if (!parsed || Object.keys(parsed).length === 0) {
        toast.info('No fields detected in voice input. Try speaking more clearly.');
        return;
      }
      
      // Apply parsed fields to form
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
        fieldUpdates.notes = (formData.notes || '') + '\n' + parsed.notes;
        updatedFields.push('notes');
      }
      
      // Handle style preference change
      if (parsed.preferred_style) {
        const newStyle = parsed.preferred_style === 'B' ? 'B' : 'A';
        setDescriptionStyle(newStyle);
        updatedFields.push(`style ${newStyle}`);
      }
      
      // Handle description text - append to currently selected style
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
      
      // Update form data first
      const updatedFormData = { ...formData, ...fieldUpdates };
      setFormData(updatedFormData);
      
      // Also add transcript to raw input for reference
      updatedFormData.raw_input_text = (formData.raw_input_text || '') + '\n' + transcriptToUse;

      // Auto-regenerate descriptions with the updated product data
      if (updatedFields.length > 0) {
        try {
          toast.info('Regenerating descriptions...');
          
          // Get the user's access token for authenticated edge function calls
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) {
            console.error('No user session for description regeneration');
            throw new Error('Not authenticated');
          }
          
          const listingResponse = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-listing`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
                'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
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
          } else {
            console.error('Failed to regenerate descriptions');
          }
        } catch (descError) {
          console.error('Error regenerating descriptions:', descError);
        }
      }
      
      toast.success(`Updated: ${updatedFields.join(', ')}`);
      setVoiceTranscript('');
      
    } catch (error) {
      console.error('Voice parsing error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to parse voice input');
    } finally {
      setIsParsingVoice(false);
      isParsingVoiceRef.current = false;
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
      
      // Apply extracted fields to form
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
        {/* Header - sticky on mobile */}
        <div className="sticky top-0 z-10 bg-card flex items-center justify-between p-2 md:p-4 border-b border-border gap-2">
          <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={onPrevious}
              disabled={!hasPrevious}
              className="h-8 w-8"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onNext}
              disabled={!hasNext}
              className="h-8 w-8"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <span className="text-xs md:text-sm text-muted-foreground ml-1 truncate max-w-[80px] md:max-w-none">
              {product.sku}
            </span>
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
            <Button variant="ghost" size="icon" onClick={() => { flushSave.current(); onClose(); }} className="h-10 w-10" type="button">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Voice Recording - Always visible at top */}
        <div className="border-b border-border p-3 md:p-4 bg-muted/30">
          <div className="flex flex-wrap items-center gap-2 max-w-6xl">
            {/* Description Style Toggle */}
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
                onClick={() => applyVoiceToFields()}
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
            <div className="mt-2 p-3 bg-muted/50 rounded-lg border border-border max-w-6xl">
              <Label className="text-xs text-muted-foreground">Voice Transcript:</Label>
              <p className="text-sm mt-1 text-foreground">{voiceTranscript}</p>
            </div>
          )}
          
          {!voiceTranscript && !isListening && (
            <p className="text-xs text-muted-foreground mt-2">
              Speak product details or description. Say "for the description..." to add text to Style {descriptionStyle}.
            </p>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col md:flex-row md:overflow-hidden">
          {/* Left: Images */}
          <div className="md:h-auto md:w-1/3 border-b md:border-b-0 md:border-r border-border p-2 md:p-4 md:overflow-y-auto scrollbar-thin flex-shrink-0">
            {/* Remove All Backgrounds button */}
            {images.length > 0 && (
              <div className="mb-3 space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const undoEntries: { imageId: string; originalUrl: string; newUrl: string }[] = [];
                    const imageUrls = images.map(img => img.url);
                    await removeBackgroundBulk(imageUrls, batchId, async (originalUrl, newUrl) => {
                      const img = images.find(i => i.url === originalUrl);
                      if (img) {
                        // Store for undo
                        undoEntries.push({ imageId: img.id, originalUrl, newUrl });
                        await supabase
                          .from('images')
                          .update({ url: newUrl })
                          .eq('id', img.id);
                        onUpdateImage(img.id, { url: newUrl } as any);
                      }
                    });
                    if (undoEntries.length > 0) {
                      setBgUndoData(undoEntries);
                    }
                  }}
                  disabled={isRemovingBg}
                  className="w-full text-primary hover:text-primary hover:bg-primary/10"
                >
                  {isRemovingBg ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Removing BG ({bgProgress.current}/{bgProgress.total})
                    </>
                  ) : (
                    <>
                      <Eraser className="w-4 h-4 mr-2" />
                      Remove All Backgrounds ({images.length})
                    </>
                  )}
                </Button>
                
                {/* Ghost Mannequin button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    setIsGhostProcessing(true);
                    setGhostProgress({ current: 0, total: images.length });
                    const undoEntries: { imageId: string; originalUrl: string; newUrl: string }[] = [];
                    const imageUrls = images.map(img => img.url);
                    await applyGhostMannequinBulk(imageUrls, batchId, async (originalUrl, newUrl) => {
                      const img = images.find(i => i.url === originalUrl);
                      if (img) {
                        undoEntries.push({ imageId: img.id, originalUrl, newUrl });
                        setGhostProgress(prev => ({ ...prev, current: prev.current + 1 }));
                        await supabase
                          .from('images')
                          .update({ url: newUrl })
                          .eq('id', img.id);
                        onUpdateImage(img.id, { url: newUrl } as any);
                      }
                    });
                    if (undoEntries.length > 0) {
                      setGhostUndoData(undoEntries);
                    }
                    setIsGhostProcessing(false);
                  }}
                  disabled={isGhostProcessing || isRemovingBg}
                  className="w-full text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                >
                  {isGhostProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Ghost Mannequin ({ghostProgress.current}/{ghostProgress.total})
                    </>
                  ) : (
                    <>
                      <Shirt className="w-4 h-4 mr-2" />
                      Ghost Mannequin ({images.length})
                    </>
                  )}
                </Button>
                
                {/* Undo Background Removal button */}
                {bgUndoData.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      // Restore original URLs
                      for (const entry of bgUndoData) {
                        await supabase
                          .from('images')
                          .update({ url: entry.originalUrl })
                          .eq('id', entry.imageId);
                        onUpdateImage(entry.imageId, { url: entry.originalUrl } as any);
                      }
                      toast.success(`Restored ${bgUndoData.length} images to original`);
                      setBgUndoData([]);
                    }}
                    className="w-full text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                  >
                    <Undo2 className="w-4 h-4 mr-2" />
                    Undo BG Removal ({bgUndoData.length})
                  </Button>
                )}
                
                {/* Undo Ghost Mannequin button - always visible */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    for (const entry of ghostUndoData) {
                      await supabase
                        .from('images')
                        .update({ url: entry.originalUrl })
                        .eq('id', entry.imageId);
                      onUpdateImage(entry.imageId, { url: entry.originalUrl } as any);
                    }
                    toast.success(`Restored ${ghostUndoData.length} images to original`);
                    setGhostUndoData([]);
                  }}
                  disabled={ghostUndoData.length === 0}
                  className={cn(
                    "w-full",
                    ghostUndoData.length > 0 
                      ? "text-purple-600 hover:text-purple-700 hover:bg-purple-50" 
                      : "text-muted-foreground"
                  )}
                >
                  <Undo2 className="w-4 h-4 mr-2" />
                  Undo Ghost {ghostUndoData.length > 0 ? `(${ghostUndoData.length})` : ''}
                </Button>
                
                {/* Model Try-On button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowModelTryOnDialog(true)}
                  disabled={isModelProcessing || isRemovingBg || isGhostProcessing}
                  className="w-full text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                >
                  {isModelProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Model Try-On ({modelProgress.current}/{modelProgress.total})
                    </>
                  ) : (
                    <>
                      <User className="w-4 h-4 mr-2" />
                      Place on Model ({images.length})
                    </>
                  )}
                </Button>
                
                {/* Undo Model Try-On button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    for (const entry of modelUndoData) {
                      await supabase
                        .from('images')
                        .update({ url: entry.originalUrl })
                        .eq('id', entry.imageId);
                      onUpdateImage(entry.imageId, { url: entry.originalUrl } as any);
                    }
                    toast.success(`Restored ${modelUndoData.length} images to original`);
                    setModelUndoData([]);
                  }}
                  disabled={modelUndoData.length === 0}
                  className={cn(
                    "w-full",
                    modelUndoData.length > 0 
                      ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" 
                      : "text-muted-foreground"
                  )}
                >
                  <Undo2 className="w-4 h-4 mr-2" />
                  Undo Model {modelUndoData.length > 0 ? `(${modelUndoData.length})` : ''}
                </Button>
              </div>
            )}
            <ImageGallery
              images={images}
              batchId={batchId}
              productId={product.id}
              onUpdateImage={onUpdateImage}
              onReorderImages={onReorderImages}
              onDeleteImage={onDeleteImage}
              onMoveImages={onMoveImages}
              otherProducts={otherProducts}
              currentProductId={product.id}
            />
          </div>

          {/* Right: Fields */}
          <div className="flex-1 overflow-y-auto scrollbar-thin p-3 md:p-4">
            <div className="space-y-4 md:space-y-6 max-w-2xl">
              {/* Core Section */}
              <section>
                <h3 className="font-semibold text-foreground mb-3">Core</h3>
                <div className="grid gap-4">
                  {/* SKU Field */}
                  <div>
                    <Label>SKU</Label>
                    <Input
                      value={formData.sku || ''}
                      onChange={(e) => updateField('sku', e.target.value)}
                      placeholder="Enter SKU"
                      className="font-mono"
                    />
                  </div>

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
                  </div>

                  <div className="grid grid-cols-2 gap-4">
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

                  <div>
                    <Label>Pit to Pit</Label>
                    <Input
                      value={formData.pit_to_pit || ''}
                      onChange={(e) => updateField('pit_to_pit', e.target.value)}
                      placeholder="e.g. 23 inches"
                    />
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

              {/* Description Styles */}
              <section>
                <h3 className="font-semibold text-foreground mb-3">Descriptions</h3>
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
                    />
                  </div>

                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <Label>Legacy Description (for Shopify)</Label>
                      <Textarea
                        value={formData.description || ''}
                        onChange={(e) => updateField('description', e.target.value)}
                        placeholder="Description used for Shopify..."
                        rows={4}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Tip: Copy Style A or B above to use as your Shopify description
                      </p>
                    </div>
                    <CopyButton text={formData.description || ''} field="Description" />
                  </div>
                </div>
              </section>

              {/* Shopify Upload Status */}
              {onMarkAsUploaded && onMarkAsPending && (
                <section>
                  <h3 className="font-semibold text-foreground mb-3">Shopify Status</h3>
                  <ShopifyStatusSection
                    product={product}
                    onMarkAsUploaded={onMarkAsUploaded}
                    onMarkAsPending={onMarkAsPending}
                  />
                </section>
              )}

              {/* Notes */}
              <section>
                <h3 className="font-semibold text-foreground mb-3">Notes</h3>
                <div className="space-y-4">
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

      {/* Model Try-On Dialog */}
      <ModelTryOnDialog
        open={showModelTryOnDialog}
        onOpenChange={setShowModelTryOnDialog}
        onConfirm={async (modelId, poseId, fitStyle, styleOutfit, outfitStyle) => {
          setShowModelTryOnDialog(false);
          
          // Get current user for RLS
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            toast.error('You must be logged in to use this feature');
            return;
          }
          
          const addedImageIds: string[] = [];
          // Use only the first image as reference for model try-on
          const firstImage = images.length > 0 ? images.sort((a, b) => (a.position || 0) - (b.position || 0))[0] : null;
          if (!firstImage) return;
          
          const imageData = [{ id: firstImage.id, url: firstImage.url }];
          
          await processModelBulk(imageData, batchId, modelId, poseId, fitStyle, styleOutfit, outfitStyle, async (originalUrl, newUrl) => {
            // Shift existing images to make room at position 0
            for (const existingImg of images) {
              await supabase
                .from('images')
                .update({ position: (existingImg.position || 0) + 1 })
                .eq('id', existingImg.id);
            }
            
            // INSERT new model image at position 0 (front of gallery)
            const { data: newImage, error } = await supabase
              .from('images')
              .insert({
                url: newUrl,
                product_id: product.id,
                batch_id: batchId,
                position: 0,
                include_in_shopify: true,
                user_id: user.id
              })
              .select()
              .single();
            
            if (!error && newImage) {
              addedImageIds.push(newImage.id);
              toast.success('Model image added');
            } else if (error) {
              console.error('Failed to insert model image:', error);
              toast.error('Failed to add model image');
            }
          });
          
          if (addedImageIds.length > 0) {
            setModelUndoData(addedImageIds.map(id => ({ imageId: id, originalUrl: '', newUrl: '' })));
          }
        }}
        isProcessing={isModelProcessing}
        imageCount={images.length}
      />
    </div>
  );
}
