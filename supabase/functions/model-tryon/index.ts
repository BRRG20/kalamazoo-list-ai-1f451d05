import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  garmentImageUrl: string;
  modelId: string;
  modelReferenceUrl?: string; // Optional reference image for consistent model identity
  poseId?: string;
  fitStyle?: 'regular' | 'oversized' | 'tucked';
  styleOutfit?: boolean;
  outfitStyle?: 'stylish_casual' | 'streetwear' | 'vintage' | 'hipster' | 'cool' | 'vibrant' | 'chic';
}

const MAX_RETRIES = 2;

// FIXED MODEL IDENTITIES with deterministic seed hints
// These descriptions are designed to be as specific as possible for consistency
const MODEL_DESCRIPTIONS: Record<string, { description: string; gender: 'male' | 'female'; seed: string }> = {
  '11111111-1111-1111-1111-111111111111': {
    gender: 'male',
    seed: 'ALEX_MODEL_V1_SEED_001',
    description: `EXACT MODEL IDENTITY - ALEX (MUST REPLICATE EXACTLY):
Face ID: ALEX-32-M-001
- Age: Exactly 32 years old
- Hair: Dark brown, short buzzcut fade, 0.5 inch on top, clean taper on sides
- Eyes: Deep brown, almond shape, heavy brow ridge
- Face: Square jaw, Roman nose (slightly aquiline), high cheekbones, clean-shaven
- Skin: Warm olive Mediterranean skin tone, slight tan, clear complexion
- Body: Athletic lean, 6'1" (185cm), broad shoulders, slim waist
- Expression: Neutral cool confidence with relaxed eyes

THIS IS THE SAME PERSON EVERY TIME. Generate as if photographing the same model in different shots.`
  },

  '22222222-2222-2222-2222-222222222222': {
    gender: 'male',
    seed: 'MARCUS_MODEL_V1_SEED_002',
    description: `EXACT MODEL IDENTITY - MARCUS (MUST REPLICATE EXACTLY):
Face ID: MARCUS-33-M-002
- Age: Exactly 33 years old
- Hair: Light brown, medium length swept back, textured waves, natural movement
- Eyes: Blue-grey, deep set, European shape
- Face: Angular Nordic features, designer stubble (3-day), defined cheekbones
- Skin: Fair Scandinavian skin, light freckles across nose and cheeks
- Body: Lean tall, 5'11" (180cm), slim build, model proportions
- Expression: Cool understated confidence, slight knowing look

THIS IS THE SAME PERSON EVERY TIME. Generate as if photographing the same model in different shots.`
  },

  '33333333-3333-3333-3333-333333333333': {
    gender: 'female',
    seed: 'SOPHIE_MODEL_V1_SEED_003',
    description: `EXACT MODEL IDENTITY - SOPHIE (MUST REPLICATE EXACTLY):
Face ID: SOPHIE-31-F-003
- Age: Exactly 31 years old
- Hair: Jet black, sleek straight, shoulder length bob, center parted
- Eyes: Dark brown, large almond shape, Asian-European features
- Face: High sculpted cheekbones, small nose, full natural lips, oval face shape
- Skin: Porcelain fair, flawless smooth, cool undertone
- Body: Slim model build, 5'8" (173cm), elegant long limbs
- Expression: Cool mysterious confidence, editorial gaze

THIS IS THE SAME PERSON EVERY TIME. Generate as if photographing the same model in different shots.`
  },

  '44444444-4444-4444-4444-444444444444': {
    gender: 'female',
    seed: 'EMMA_MODEL_V1_SEED_004',
    description: `EXACT MODEL IDENTITY - EMMA (MUST REPLICATE EXACTLY):
Face ID: EMMA-34-F-004
- Age: Exactly 34 years old
- Hair: Chestnut brown, long flowing waves past shoulders, side parted left
- Eyes: Hazel-green, large round, warm expression
- Face: Soft oval features, natural full brows, warm smile lines, heart-shaped face
- Skin: Golden sun-kissed, medium tone, healthy glow, light freckles
- Body: Slim-average, 5'7" (170cm), feminine proportions
- Expression: Warm confident, approachable yet editorial

THIS IS THE SAME PERSON EVERY TIME. Generate as if photographing the same model in different shots.`
  },
};

// Pose descriptions - specific and consistent
const POSE_DESCRIPTIONS: Record<string, string> = {
  'front_neutral': `Standing facing camera directly. Weight evenly distributed. Arms relaxed at sides or one hand lightly in pocket. Shoulders back, natural stance. Full body visible. Professional studio pose.`,
  'three_quarter': `Body angled 30-45 degrees to camera. Looking at camera. One hand in pocket or on hip. Weight on back leg. Shows outfit dimension and fit. Editorial confident stance.`,
  'relaxed': `Natural S-curve stance. Weight on one leg. Arms in relaxed position - can be crossed, in pockets, or at waist. Approachable energy while maintaining editorial quality.`,
  'arms_bent': `Standing with one or both arms bent. Hand on hip, touching face, or adjusting clothing. Shows arm and torso fit. Confident pose with editorial energy.`,
  'close_up_detail': `CROPPED VIEW: Chest to mid-thigh only. Focus on garment details. Hands visible near waist or pockets. Face partially visible or cropped at chin. Shows fabric texture and fit details.`,
  'movement': `Dynamic walking or turning pose. Caught mid-motion. Hair and fabric showing natural movement. Energy and life while maintaining sharp focus on garment.`,
};

// Outfit styling descriptions - rich, diverse, inspiration-driven
const OUTFIT_STYLE_DESCRIPTIONS: Record<string, string> = {
  'stylish_casual': `STYLING DIRECTION: Stylish Casual / Elevated Everyday
INSPIRATION: Rihanna off-duty, A$AP Rocky casual moments, SoHo NYC daytime, Shoreditch creatives
BOTTOMS (pick one at random each time for variety):
- Straight-leg dark wash jeans
- Pleated cream or khaki trousers
- Relaxed-fit black chinos
- Cropped ankle-length tailored pants
FOOTWEAR (pick one at random):
- Clean white leather sneakers (Common Projects style)
- Black Chelsea boots
- Cream/beige suede loafers
- Minimalist running shoes (New Balance 550, Veja)
LAYERS (optional, pick if appropriate):
- Unstructured blazer in navy or camel
- Light bomber jacket
- Cashmere cardigan open
ACCESSORIES:
- Simple silver or gold watch
- Minimal chain necklace (subtle, not chunky)
- Clean leather belt
STYLING RULES: Clean lines, quality fabrics, nothing loud. Colors coordinate - neutrals, earth tones, navy. Everything fits well but not tight.`,

  'streetwear': `STYLING DIRECTION: Streetwear / Urban Commercial
INSPIRATION: A$AP Rocky, Travis Scott, Brooklyn NYC, London streetwear scene, Supreme drops, Palace
BOTTOMS (pick one at random each time for variety):
- Baggy cargo pants (olive, black, or cream)
- Wide-leg jeans with raw hem
- Technical joggers with zip pockets
- Vintage-wash Dickies or Carhartt work pants
FOOTWEAR (pick one at random):
- Air Jordan 1s (Chicago, Bred, or neutral colorway)
- Nike Dunks (any color matching the fit)
- New Balance 550 or 2002R
- Adidas Samba or Gazelle
- Nike Air Force 1 (white or black)
LAYERS (pick one or two):
- Oversized hoodie (can be under or over hero garment)
- Puffer vest or jacket
- Vintage denim jacket
- Coach jacket or windbreaker
ACCESSORIES (add 1-2):
- Small crossbody bag or shoulder bag
- Beanie or dad cap
- Simple silver chain
- Digital watch (Casio style)
STYLING RULES: Relaxed proportions, intentional but effortless. Mix of hype and vintage. Colors can be bold but coordinated.`,

  'vintage': `STYLING DIRECTION: Vintage / Era-Authentic
INSPIRATION: 70s rock, 80s new wave, 90s grunge, Y2K styling, Northern Soul, vintage denim heads
BOTTOMS (match to garment era, pick randomly):
- High-waisted pleated trousers (70s/80s)
- Relaxed straight-leg faded jeans (90s)
- Corduroy wide-legs (70s)
- Baggy carpenter jeans (Y2K)
- Bootcut jeans (Y2K/70s)
FOOTWEAR (era-appropriate, pick randomly):
- Vintage leather boots (Chelsea or western)
- Converse Chuck Taylor (70s)
- Platform loafers (90s)
- Retro running shoes (New Balance 574, Saucony)
- Doc Martens boots
LAYERS (pick if appropriate):
- Vintage leather or suede jacket
- Knitted cardigan or vest
- Denim trucker jacket (faded, vintage wash)
- Wool overcoat
ACCESSORIES (add 1-2 for authenticity):
- Vintage watch (leather strap)
- Bandana (pocket or neck)
- Vintage belt with interesting buckle
- Period-accurate sunglasses
STYLING RULES: Authentic to the era, not costume. Lived-in quality. Faded, worn textures welcome.`,

  'hipster': `STYLING DIRECTION: Hipster / Shoreditch / Brooklyn Creative
INSPIRATION: Shoreditch East London, Williamsburg Brooklyn, coffee shop DJs, indie label A&Rs, record store vibes
BOTTOMS (pick one at random each time):
- Slim-fit raw selvedge denim
- Cropped chinos showing ankle
- Brown or olive corduroy pants
- Relaxed-fit vintage Levi's
- High-waisted pleated trousers
FOOTWEAR (pick one at random):
- Doc Martens 1461 or 1490 boots
- Desert boots (Clark's or similar)
- Vintage running shoes (New Balance 990, ASICS Gel)
- Leather moccasins or loafers
- Suede Wallabees
LAYERS (pick if appropriate):
- Denim jacket (oversized vintage)
- Wool or fleece overshirt
- Quilted liner jacket
- Vintage work jacket
ACCESSORIES (important for this style - add 2-3):
- Simple matte black or silver ring (on index or pinky finger)
- Analogue watch with leather strap
- Beanie or flat cap
- Tote bag (canvas, natural)
- Round or square prescription-style glasses
- Thin gold or silver necklace
STYLING RULES: Curated, not trying too hard. Mix of vintage finds and quality basics. Earth tones, olive, mustard, burgundy, forest green. Textures matter.`,

  'cool': `STYLING DIRECTION: Cool / Understated Minimal
INSPIRATION: Scandinavian minimalism, COS campaigns, Japanese basics (MUJI, Uniqlo U), quiet luxury
BOTTOMS (pick one at random):
- Black straight-leg trousers
- Dark navy or charcoal wool pants
- Clean black jeans (no distressing)
- Tailored jogger pants
FOOTWEAR (pick one at random):
- Clean white leather sneakers
- Black leather derby shoes
- Suede grey sneakers
- Black Chelsea boots
- White canvas shoes
LAYERS (subtle, minimal):
- Black or grey overcoat
- Navy bomber jacket
- Zip-up knit cardigan
ACCESSORIES (minimal, quality):
- Simple black leather watch
- No jewelry or very subtle (thin chain only)
- Clean leather belt
STYLING RULES: Monochromatic or tonal. Black, white, grey, navy only. Impeccable fit. Clean lines. No logos visible. Quality over everything.`,

  'vibrant': `STYLING DIRECTION: Vibrant / Bold Color Story
INSPIRATION: Rihanna color blocking, Pharrell, Tyler the Creator, Italian street style, Lagos fashion scene
BOTTOMS (pick to complement hero garment color):
- Bold colored trousers (pick complementary to hero)
- Bright white jeans or pants
- Colored corduroy (mustard, teal, burgundy)
- Primary colored chinos
FOOTWEAR (can be bold):
- Colorful sneakers matching the palette
- Bright white clean sneakers
- Patent leather boots in unexpected color
- Colored suede loafers
LAYERS:
- Color-blocked jacket
- Vibrant cardigan or sweater
- Patterned shirt unbuttoned over hero
ACCESSORIES:
- Colored watch strap
- Bold sunglasses
- Interesting jewelry (chunky rings, statement necklace)
STYLING RULES: Colors must WORK together - complementary or analogous, not random. One hero color, others support it. Still wearable, not costume.`,

  'chic': `STYLING DIRECTION: Chic / Elevated Luxury Casual
INSPIRATION: Parisian style, Italian aperitivo hour, old money aesthetic, Loro Piana vibes, fashion week off-duty
BOTTOMS (pick one at random):
- Tailored cream or beige trousers
- High-quality dark denim
- Pleated wool trousers
- Linen blend wide pants
FOOTWEAR (quality leather):
- Leather loafers (brown or black)
- Suede driving shoes
- Clean leather sneakers
- Polished Chelsea boots
LAYERS (refined):
- Cashmere sweater draped over shoulders
- Unstructured linen blazer
- Fine knit polo or half-zip
- Suede or leather jacket (butter-soft)
ACCESSORIES (subtle luxury):
- Quality leather belt
- Elegant watch (leather strap or minimal metal)
- Sunglasses (classic shapes)
- Silk scarf (pocket square or light neck tie)
STYLING RULES: Everything looks expensive even if it isn't. Neutral palette - cream, camel, navy, grey, white. Fabrics look luxe. Perfect tailoring.`,

  'eastern_fusion': `STYLING DIRECTION: Eastern Fusion / Japanese-Korean Streetwear with Western Twist
INSPIRATION: Tokyo Harajuku (toned down), Seoul streetwear, Korean fashion editorials, Japanese workwear brands (Kapital, Visvim), modern Americana with Eastern sensibility
BOTTOMS (pick one at random):
- Wide cropped trousers showing ankle
- Relaxed tapered pants with pleats
- Patchwork or artisan denim
- Utility pants with interesting details
- Hakama-inspired wide trousers (subtle)
FOOTWEAR (pick one at random):
- White minimalist sneakers
- Leather sandals (if appropriate)
- Canvas sneakers (Moonstar, Shoes Like Pottery)
- Suede boots with interesting sole
- New Balance Japanese exclusive colorways
LAYERS (considered, architectural):
- Oversized structured coat
- Deconstructed blazer
- Long cardigan or open robe jacket
- Technical shell jacket (minimal branding)
- Noragi or chore jacket
ACCESSORIES (intentional details):
- Leather or canvas tote bag
- Minimal silver jewelry
- Bucket hat or newsboy cap
- Interesting socks showing above ankle
- Simple beaded bracelet
STYLING RULES: Proportions are intentional - oversized meets cropped. Textures mix interestingly. Earth tones with one pop element. Craftsmanship visible. Looks effortless but clearly considered. NOT costume - wearable Western interpretation of Eastern aesthetic.`,
};

async function processModelTryOn(
  garmentImageUrl: string, 
  modelId: string,
  modelReferenceUrl: string | null,
  poseType: string,
  fitStyle: string,
  styleOutfit: boolean,
  outfitStyle: string,
  apiKey: string,
  attempt: number = 1
): Promise<string> {
  const modelData = MODEL_DESCRIPTIONS[modelId] || MODEL_DESCRIPTIONS['11111111-1111-1111-1111-111111111111'];
  const poseDescription = POSE_DESCRIPTIONS[poseType] || POSE_DESCRIPTIONS['front_neutral'];
  
  const fitInstructions = fitStyle === 'oversized' 
    ? 'Style the garment with a slightly oversized, relaxed fit.'
    : fitStyle === 'tucked'
    ? 'If applicable, show the garment tucked in for a polished look.'
    : 'Style the garment with a natural regular fit.';

  // Consistency instruction - use seed hint for deterministic generation
  const consistencyInstruction = `
⚠️ MODEL CONSISTENCY - CRITICAL ⚠️
Model Seed ID: ${modelData.seed}
This model must look IDENTICAL across all generations. Use this seed ID to ensure the same face, body, and features every time.

${modelData.description}

IMPORTANT: Generate the SAME PERSON every time this seed ID is used. This is like photographing the same real model multiple times - the person should be recognizable as the same individual.`;

  // Build the prompt based on whether we're styling the outfit
  let prompt: string;
  
  if (styleOutfit) {
    const stylingDirection = OUTFIT_STYLE_DESCRIPTIONS[outfitStyle] || OUTFIT_STYLE_DESCRIPTIONS['stylish_casual'];
    
    prompt = `TASK: Place this EXACT garment onto a specific fashion model AND style a complete outfit around it for e-commerce product photography.

⚠️ CRITICAL: GARMENT ACCURACY IS NON-NEGOTIABLE ⚠️
The garment in the input image is the SINGLE SOURCE OF TRUTH. You MUST:
- COPY THE GARMENT EXACTLY AS IT APPEARS - pixel for pixel
- ALL TEXT ON THE GARMENT MUST BE COPIED CHARACTER-FOR-CHARACTER
- If the front says "WANT", output MUST say "WANT" - no alternatives, no reinterpretation
- ALL graphics, logos, prints MUST be copied EXACTLY - same position, same size, same colors
- DO NOT alter, reimagine, or "improve" ANY text or graphics
- If you cannot read text clearly, copy it as visible marks rather than inventing text

THE HERO PRODUCT (THIS IS THE MAIN FOCUS):
The garment in the input image is the HERO ITEM. It MUST be:
- PIXEL-PERFECT copy of the input image
- Completely unaltered - same colors, patterns, logos, text, graphics
- The dominant visual element of the image
- Clearly visible and not obscured by other items

${consistencyInstruction}

POSE:
${poseDescription}

${stylingDirection}

STYLING RULES:
1. The HERO GARMENT (input image) is the STAR - other items support it, don't compete
2. Add complementary items: trousers/jeans, footwear, jacket/layers if appropriate
3. VARY the outfit styling each generation for buyer choice
4. Accessories encouraged: watches, bracelets, rings, subtle jewelry, quality bags
5. Colors of complementary items MUST work with the hero garment
6. Everything should look like something a stylish person would actually wear

⚠️ ABSOLUTE REQUIREMENTS FOR THE HERO GARMENT (ZERO TOLERANCE):
1. COPY ALL TEXT EXACTLY: If it says "WANT", output says "WANT" - CHARACTER FOR CHARACTER
2. COPY ALL GRAPHICS EXACTLY: Same position, same size, same colors, same details
3. COPY EXACTLY: every color, shade, pattern, texture from the input image
4. COPY EXACTLY: all logos, prints - line for line, shape for shape
5. FABRIC MUST LOOK NATURAL: No high gloss, no artificial shine, no CGI look
6. The garment must look like a real photo, not a digital render

BACKGROUND (CREATIVE VARIATION ENCOURAGED):
✅ VARY backgrounds between: soft cream/beige gradients, cool grey gradients, warm to cool transitions, subtle pastel undertones, clean studio white, soft textured backdrops
✅ Professional studio lighting with natural soft shadows
✅ High-end e-commerce quality - think ASOS, Zara, Net-a-Porter

WHAT CAN VARY (ENCOURAGED FOR BUYER CHOICE):
✅ Background colors and gradients
✅ Outfit styling and complementary pieces  
✅ Pose variations within the cool/editorial range
✅ Expression variations (all within cool/chic/confident range)
✅ Hair styling variations (always elegant)
✅ Accessories and finishing touches

WHAT CANNOT CHANGE (NON-NEGOTIABLE):
❌ The hero garment - must be EXACT copy
❌ Any text/graphics on the garment - copy CHARACTER FOR CHARACTER
❌ The model's core identity (face structure, age range, beauty level)
❌ Overall quality level - must remain high-end editorial`;
  } else {
    // Product-only mode - just the garment on model
    prompt = `TASK: Place this EXACT garment onto a fashion model for e-commerce product photography.

⚠️ CRITICAL: GARMENT ACCURACY IS NON-NEGOTIABLE ⚠️
The garment in the input image is the SINGLE SOURCE OF TRUTH. You MUST:
- COPY THE GARMENT EXACTLY AS IT APPEARS - pixel for pixel
- ALL TEXT ON THE GARMENT MUST BE COPIED CHARACTER-FOR-CHARACTER
- If the front says "WANT", output MUST say "WANT" - no alternatives, no reinterpretation
- ALL graphics, logos, prints MUST be copied EXACTLY - same position, same size, same colors
- DO NOT alter, reimagine, or "improve" ANY text or graphics
- If you cannot read text clearly, copy it as visible marks rather than inventing text

${consistencyInstruction}

POSE:
${poseDescription}

FIT STYLE:
${fitInstructions}

⚠️ ABSOLUTE REQUIREMENTS FOR THE GARMENT (ZERO TOLERANCE):
1. COPY ALL TEXT EXACTLY: If garment says "WANT", output says "WANT" - CHARACTER FOR CHARACTER
2. COPY ALL GRAPHICS EXACTLY: Same position, same size, same colors, same details
3. COPY EXACTLY: every color, shade, pattern, texture from the input image
4. FABRIC MUST LOOK NATURAL: No high gloss, no artificial shine, no CGI look
5. The garment must look like a real photograph, not a digital render

BACKGROUND (CREATIVE VARIATION ENCOURAGED):
✅ VARY backgrounds between: soft cream/beige gradients, cool grey gradients, warm to cool transitions, subtle pastel undertones, clean studio white, soft textured backdrops
✅ Professional studio lighting with natural soft shadows
✅ High-end e-commerce quality

WHAT CAN VARY (ENCOURAGED FOR BUYER CHOICE):
✅ Background colors and gradients
✅ Pose variations within the cool/editorial range
✅ Expression variations (all within cool/chic/confident range)
✅ Hair styling variations (always elegant)

WHAT CANNOT CHANGE (NON-NEGOTIABLE):
❌ The garment - must be EXACT copy of input
❌ Any text/graphics on the garment - copy CHARACTER FOR CHARACTER
❌ The model's core identity (face structure, age range 30-35, beauty level)
❌ Overall quality level - must remain high-end editorial

The input image is your ONLY reference for the garment. Copy it EXACTLY - especially all text and graphics. Generate VARIATIONS in pose, expression, and background.`;
  }

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-image-preview',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            },
            {
              type: 'image_url',
              image_url: {
                url: garmentImageUrl
              }
            }
          ]
        }
      ],
      modalities: ['image', 'text']
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`AI API error (attempt ${attempt}):`, response.status, errorText);
    throw new Error(`AI processing failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  console.log(`Model try-on response structure (attempt ${attempt}):`, JSON.stringify({
    hasChoices: !!data.choices,
    choicesLength: data.choices?.length,
    hasMessage: !!data.choices?.[0]?.message,
    hasImages: !!data.choices?.[0]?.message?.images,
    imagesLength: data.choices?.[0]?.message?.images?.length,
  }));
  
  // Try multiple paths to find the image
  let generatedImage = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  
  if (!generatedImage && data.choices?.[0]?.message?.images?.[0]?.url) {
    generatedImage = data.choices[0].message.images[0].url;
  }
  
  if (!generatedImage && data.choices?.[0]?.message?.images?.[0]) {
    const img = data.choices[0].message.images[0];
    if (typeof img === 'string' && img.startsWith('data:')) {
      generatedImage = img;
    }
  }
  
  if (!generatedImage) {
    console.error(`No image found in response (attempt ${attempt}). Full response:`, JSON.stringify(data).substring(0, 500));
    
    if (attempt < MAX_RETRIES) {
      console.log(`Retrying model try-on (attempt ${attempt + 1})...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return processModelTryOn(garmentImageUrl, modelId, modelReferenceUrl, poseType, fitStyle, styleOutfit, outfitStyle, apiKey, attempt + 1);
    }
    
    throw new Error('No processed image returned from AI after retries');
  }

  return generatedImage;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { 
      garmentImageUrl, 
      modelId, 
      poseId, 
      fitStyle = 'regular',
      styleOutfit = false,
      outfitStyle = 'stylish_casual'
    }: RequestBody = await req.json();
    
    if (!garmentImageUrl) {
      throw new Error('garmentImageUrl is required');
    }
    
    if (!modelId) {
      throw new Error('modelId is required');
    }

    // Determine pose type - default to front_neutral
    const poseType = poseId || 'front_neutral';

    console.log('Processing model try-on:', {
      garment: garmentImageUrl.substring(0, 50) + '...',
      modelId,
      poseType,
      fitStyle,
      styleOutfit,
      outfitStyle
    });

    const processedImage = await processModelTryOn(
      garmentImageUrl, 
      modelId, 
      null, // modelReferenceUrl - not used yet
      poseType, 
      fitStyle,
      styleOutfit,
      outfitStyle,
      LOVABLE_API_KEY
    );
    
    console.log('Model try-on processing complete', { styleOutfit, outfitStyle });

    return new Response(JSON.stringify({ 
      processedImageUrl: processedImage,
      success: true,
      styled: styleOutfit
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in model-tryon function:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Model try-on processing failed';
    
    if (errorMessage.includes('429')) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.', success: false }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (errorMessage.includes('402')) {
      return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.', success: false }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});