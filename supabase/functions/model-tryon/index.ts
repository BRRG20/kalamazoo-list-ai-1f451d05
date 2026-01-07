import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  garmentImageUrl: string;
  modelId: string;
  poseId?: string;
  fitStyle?: 'regular' | 'oversized' | 'tucked';
  styleOutfit?: boolean;
  outfitStyle?: 'stylish_casual' | 'streetwear' | 'vintage' | 'hipster' | 'cool' | 'vibrant' | 'chic';
}

const MAX_RETRIES = 2;

// FIXED MODEL APPEARANCES - These exact descriptions MUST be used for consistency
// Each model has a FIXED, UNCHANGING appearance that MUST be identical every generation
const MODEL_DESCRIPTIONS: Record<string, string> = {
  '11111111-1111-1111-1111-111111111111': `Alex: A male fashion model, EXACTLY aged 32 years old.
FIXED APPEARANCE (DO NOT DEVIATE):
- Hair: Short, neatly styled dark brown hair, side-parted to the left, approximately 2 inches on top
- Eyes: Brown eyes
- Face: Clean-shaven, strong jawline, straight nose
- Skin: Warm olive/tan skin tone
- Build: Lean athletic, height 6ft (183cm)
- Expression: Neutral confidence, slight knowing smile, relaxed brow
This EXACT person must appear in every image. Do not change ANY facial features.`,

  '22222222-2222-2222-2222-222222222222': `Marcus: A male fashion model, EXACTLY aged 33 years old.
FIXED APPEARANCE (DO NOT DEVIATE):
- Hair: Medium-length textured light brown hair, swept back casually, approximately 3 inches
- Eyes: Blue-grey eyes
- Face: Light stubble (3-day beard), defined cheekbones, slightly rounded chin
- Skin: Fair/light skin tone with subtle freckles
- Build: Lean, height 5ft11 (180cm)
- Expression: Cool and relaxed, understated confidence, minimal smile
This EXACT person must appear in every image. Do not change ANY facial features.`,

  '33333333-3333-3333-3333-333333333333': `Sophie: A female fashion model, EXACTLY aged 31 years old.
FIXED APPEARANCE (DO NOT DEVIATE):
- Hair: Sleek black straight bob, chin-length, center-parted
- Eyes: Dark brown eyes
- Face: High cheekbones, delicate features, full lips
- Skin: Light/fair skin tone with porcelain complexion
- Build: Slim, height 5ft8 (173cm)
- Expression: Neutral but approachable, cool confidence, closed-mouth subtle smile
This EXACT person must appear in every image. Do not change ANY facial features.`,

  '44444444-4444-4444-4444-444444444444': `Emma: A female fashion model, EXACTLY aged 34 years old.
FIXED APPEARANCE (DO NOT DEVIATE):
- Hair: Long flowing chestnut brown hair, loose waves, past shoulders
- Eyes: Hazel/green eyes
- Face: Soft features, natural brows, warm smile lines
- Skin: Medium/golden skin tone
- Build: Slim-average, height 5ft7 (170cm)
- Expression: Relaxed confidence, warm natural smile, approachable
This EXACT person must appear in every image. Do not change ANY facial features.`,
};

// Pose descriptions - cool, neutral, model-like poses (inspired by fashion editorials)
// Reference: ASOS, Zara, high-end e-commerce with varied crops and angles
const POSE_DESCRIPTIONS: Record<string, string> = {
  'front_neutral': `Standing facing camera with cool, relaxed stance - weight slightly shifted, one hand relaxed at side or gently resting on hip/thigh area. Natural model pose, not stiff. Face toward camera with neutral cool expression. Hair styled sleek (low bun, slicked back, or natural waves). Full body visible with natural soft shadow beneath feet.`,
  'three_quarter': `Standing at 3/4 angle with effortless cool pose, body angled but face toward camera. One hand can be in pocket or relaxed at side, the other arm natural. Confident, editorial feel. Hair styled elegantly. Side profile shows clean silhouette of the outfit.`,
  'relaxed': `Relaxed casual stance, weight on one leg creating natural S-curve in body. Arms natural - hands in pockets, thumbs hooked in waistband, or one arm relaxed while other touches hip. Cool, approachable but model-like. Confident posture.`,
  'arms_bent': `Cool stance with arms naturally bent - hand on hip showing waistline, or arms bent with hands resting near pockets. Editorial pose, confident but not stiff. Shows garment fit around torso clearly. Can include subtle accessories on wrists (chunky silver or black bracelets, elegant watch).`,
  'close_up_detail': `CLOSE-UP CROP: Frame from approximately chest/shoulder level down to mid-thigh. Focus on the garment's waist, hip, and torso area. Model's hands can be relaxed at sides, one hand touching pocket or waistband, or thumbs hooked in belt loops. Shows fabric texture, fit, and construction details clearly. Face may be partially visible or cropped at chin level.`,
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
  poseType: string,
  fitStyle: string,
  styleOutfit: boolean,
  outfitStyle: string,
  apiKey: string,
  attempt: number = 1
): Promise<string> {
  const modelDescription = MODEL_DESCRIPTIONS[modelId] || MODEL_DESCRIPTIONS['11111111-1111-1111-1111-111111111111'];
  const poseDescription = POSE_DESCRIPTIONS[poseType] || POSE_DESCRIPTIONS['front_neutral'];
  
  const fitInstructions = fitStyle === 'oversized' 
    ? 'Style the garment with a slightly oversized, relaxed fit.'
    : fitStyle === 'tucked'
    ? 'If applicable, show the garment tucked in for a polished look.'
    : 'Style the garment with a natural regular fit.';

  // Build the prompt based on whether we're styling the outfit
  let prompt: string;
  
  if (styleOutfit) {
    const stylingDirection = OUTFIT_STYLE_DESCRIPTIONS[outfitStyle] || OUTFIT_STYLE_DESCRIPTIONS['stylish_casual'];
    
    prompt = `TASK: Place this EXACT garment onto a fashion model AND style a complete outfit around it for e-commerce product photography.

THE HERO PRODUCT (THIS IS THE MAIN FOCUS):
The garment in the input image is the HERO ITEM. It MUST be:
- PIXEL-PERFECT copy of the input image
- Completely unaltered - same colors, patterns, logos, text, graphics
- The dominant visual element of the image
- Clearly visible and not obscured by other items

MODEL TO USE:
${modelDescription}

POSE:
${poseDescription}

MODEL APPEARANCE (CRITICAL):
- Face MUST be clearly visible and in frame
- Expression: cool, neutral, effortlessly confident - like a fashion editorial
- Can have subtle knowing smile or relaxed neutral expression
- NO exaggerated smiling, NO stiff poses
- Think: cool street-style fashion photography, candid but composed
- Model should look like they belong in a magazine or brand campaign
- Natural soft lighting on face

FIT STYLE FOR HERO GARMENT:
${fitInstructions}

${stylingDirection}

STYLING RULES (CRITICAL):
1. The HERO GARMENT (input image) is the STAR - other items support it, don't compete
2. Add complementary items: trousers/jeans, footwear, maybe a jacket/overshirt if it doesn't cover the hero
3. DO NOT add accessories that distract (no bags, hats, jewelry unless very subtle)
4. DO NOT add logos on complementary items that compete with the hero
5. Colours of complementary items MUST work with the hero garment - no clashing
6. Fit must be realistic - no extreme proportions unless style demands it
7. The styled outfit must look like something a real person would wear

ABSOLUTE REQUIREMENTS FOR THE HERO GARMENT (CRITICAL - NO EXCEPTIONS):
1. COPY EXACTLY: every color, shade, pattern, texture from the input image
2. COPY EXACTLY: all logos, text, graphics, prints - character for character
3. COPY EXACTLY: all buttons, zippers, stitching, seams, labels, tags
4. COPY EXACTLY: any wear, fading, distressing, vintage characteristics
5. The hero garment is the SINGLE SOURCE OF TRUTH - copy it perfectly
6. FABRIC MUST LOOK NATURAL: No high gloss, no artificial shine, no CGI look
7. Preserve the EXACT fabric texture - matte cotton stays matte, wool stays wooly, etc.
8. The garment must look like a real photo, not a digital render

PHOTOGRAPHY STYLE (REFERENCE: ASOS, ZARA, HIGH-END E-COMMERCE):
- Professional photography studio setting
- BACKGROUND: Soft gradient backdrop - cream/warm beige on one side smoothly transitioning to cool grey/white on the other. NOT flat white, NOT solid grey. Subtle warmth and depth.
- Professional studio lighting - softbox/beauty lighting setup with natural soft shadows
- Full body shot OR close-up detail crop (waist to mid-thigh) showing the styled outfit
- Sharp focus on the hero garment with natural fabric texture visible
- Soft natural shadow beneath model's feet (not harsh, not dropped shadow effect)
- High-end e-commerce/lookbook quality - think ASOS, Zara, Net-a-Porter
- Model's hair should be styled elegantly: sleek low bun, slicked back, or natural polished waves
- If accessories are added: chunky silver/chrome bracelets, statement watches, luxury leather tote bags (brown suede, black leather), pointed toe heels or clean minimalist sneakers

WHAT NOT TO DO:
- DO NOT alter the hero garment in ANY way
- DO NOT generate a "similar" garment - use the EXACT one from the input
- DO NOT add distracting accessories
- DO NOT over-style or create runway/editorial looks
- DO NOT create costume-like or fantasy outfits
- DO NOT make stiff or awkward poses
- DO NOT add gloss, shine, or artificial enhancement to the fabric
- DO NOT make the clothing look CGI or digitally rendered
- Keep it wearable, natural, and realistic for real buyers`;
  } else {
    // Product-only mode - just the garment on model
    prompt = `TASK: Place this EXACT garment onto a fashion model for e-commerce product photography.

MODEL TO USE:
${modelDescription}

POSE:
${poseDescription}

MODEL APPEARANCE (CRITICAL):
- Face MUST be clearly visible and in frame
- Expression: cool, neutral, effortlessly confident - like a fashion editorial
- Can have subtle knowing smile or relaxed neutral expression
- NO exaggerated smiling, NO stiff poses
- Think: cool street-style fashion photography, candid but composed
- Model should look like they belong in a magazine or brand campaign
- Natural soft lighting on face

FIT STYLE:
${fitInstructions}

ABSOLUTE REQUIREMENTS - DO NOT VIOLATE (THE INPUT IMAGE IS THE SINGLE SOURCE OF TRUTH):
1. The garment in the output MUST be a PIXEL-PERFECT representation of the input image
2. DO NOT change, alter, redesign, or reimagine ANY aspect of the garment
3. COPY EXACTLY: every color, every shade, every pattern, every texture
4. COPY EXACTLY: all logos, all text, all graphics, all prints - character for character, line for line
5. COPY EXACTLY: all buttons, zippers, stitching, seams, labels, tags
6. COPY EXACTLY: any wear, fading, distressing, or vintage characteristics
7. The garment is the SINGLE SOURCE OF TRUTH - the input image defines 100% of how the clothing looks
8. FABRIC MUST LOOK NATURAL: No high gloss, no artificial shine, no CGI look
9. Preserve the EXACT fabric texture - matte cotton stays matte, wool stays wooly, knit stays knit
10. The garment must look like a real photograph, not a digital render or 3D model

WHAT TO GENERATE:
- A professional fashion photo with the model wearing this EXACT garment
- BACKGROUND: Soft gradient backdrop - cream/warm beige on one side smoothly transitioning to cool grey/white on the other. NOT flat white, NOT solid grey. Subtle warmth and depth like ASOS/Zara product shots.
- Professional studio lighting - softbox/beauty lighting setup
- Full body shot OR close-up detail crop (from chest to mid-thigh) depending on pose
- If close-up crop: focus on waist/hip area showing fit, fabric texture, and garment details
- The model's body and pose as described above
- Soft natural shadow beneath model (not harsh drop shadow)
- Hair styled elegantly: sleek low bun, slicked back, or natural polished waves
- High-end e-commerce/lookbook quality image - think ASOS, Zara, Net-a-Porter

WHAT NOT TO DO:
- DO NOT generate a "similar" garment - use the EXACT one from the image
- DO NOT change colors or patterns
- DO NOT remove or alter any text, logos, or graphics
- DO NOT add accessories or styling not in the original
- DO NOT "improve" or "enhance" the garment design
- DO NOT hallucinate or invent any garment details
- DO NOT make stiff or awkward poses
- DO NOT add gloss, shine, or artificial enhancement to the fabric
- DO NOT make the clothing look CGI or digitally rendered
- The output must look like a real photo a buyer would trust

The input image is your ONLY reference for the garment. Copy it exactly onto the model with natural, realistic fabric appearance.`;
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
      return processModelTryOn(garmentImageUrl, modelId, poseType, fitStyle, styleOutfit, outfitStyle, apiKey, attempt + 1);
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