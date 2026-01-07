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

// Model descriptions for consistent appearance
const MODEL_DESCRIPTIONS: Record<string, string> = {
  '11111111-1111-1111-1111-111111111111': 'Alex: A professional male model aged 30-35 years old with short dark hair, clean-shaven, athletic build, height 6ft, warm skin tone, neutral confident expression.',
  '22222222-2222-2222-2222-222222222222': 'Marcus: A stylish male model aged 30-35 years old with medium-length brown hair, light stubble, lean athletic build, height 5ft11, fair skin tone, relaxed friendly expression.',
  '33333333-3333-3333-3333-333333333333': 'Sophie: An elegant female model aged 30-35 years old with shoulder-length auburn hair, slim build, height 5ft8, light skin tone, professional composed expression.',
  '44444444-4444-4444-4444-444444444444': 'Emma: A natural female model aged 30-35 years old with long dark wavy hair, average build, height 5ft7, medium skin tone, warm approachable expression.',
};

const POSE_DESCRIPTIONS: Record<string, string> = {
  'front_neutral': 'standing straight facing the camera with arms relaxed at sides, feet shoulder-width apart',
  'three_quarter': 'standing at a 3/4 angle to the camera, body turned slightly, face toward camera',
  'relaxed': 'standing with a relaxed casual posture, slight weight shift to one leg, natural arm position',
  'arms_bent': 'standing with arms slightly bent, hands loosely clasped or one hand on hip',
  'movement': 'captured mid-stride or with subtle natural movement, dynamic but professional',
};

// Outfit styling descriptions - these define complementary garments
const OUTFIT_STYLE_DESCRIPTIONS: Record<string, string> = {
  'stylish_casual': `STYLING DIRECTION: Stylish Casual / Going Out
- Clean, modern, wearable aesthetic
- Simple well-fitted jeans or tailored trousers
- Clean white or subtle neutral trainers/shoes
- Minimal accessories (maybe a simple watch)
- Overall: Smart casual, ready to go out, understated but intentional`,

  'streetwear': `STYLING DIRECTION: Streetwear / Urban
- Relaxed, urban aesthetic
- Cargo pants, relaxed jeans, or joggers
- Fresh sneakers (Jordan-style, Nike, Adidas)
- Layering if appropriate (hoodie under/over, bomber jacket)
- Overall: Street-ready, comfortable but stylish`,

  'vintage': `STYLING DIRECTION: Vintage / Era-Aware
- Retro silhouettes matching the garment era
- High-waisted trousers or classic denim
- Era-appropriate footwear (loafers, vintage sneakers, boots)
- Subtle nostalgic styling, not costume
- Overall: Authentic vintage feel, wearable nostalgia`,

  'hipster': `STYLING DIRECTION: Hipster / Shoreditch / Indie
- Creative, fashion-forward choices
- Interesting proportions and layering
- Mix of textures (denim, corduroy, knits)
- Unique footwear (Doc Martens, desert boots, retro runners)
- Overall: Indie aesthetic, creative but not over-the-top`,

  'cool': `STYLING DIRECTION: Cool / Understated
- Understated confidence
- Clean lines, neutral tones (black, grey, white, navy)
- Well-fitted basics
- Classic clean footwear
- Overall: Effortlessly cool, minimal styling`,

  'vibrant': `STYLING DIRECTION: Vibrant / Bold Colour
- Bolder but tasteful colour combinations
- Complementary colours to the hero garment
- Still wearable and coordinated
- Clean styling with colour as the focus
- Overall: Colourful but not clashing, intentional vibrancy`,

  'chic': `STYLING DIRECTION: Chic / Elevated Casual
- Polished, elevated casual aesthetic
- Clean silhouettes, refined proportions
- Quality-looking basics
- Elegant footwear (clean leather, minimal design)
- Overall: Sophisticated casual, ready for any occasion`,
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

ABSOLUTE REQUIREMENTS FOR THE HERO GARMENT:
1. COPY EXACTLY: every color, shade, pattern, texture from the input image
2. COPY EXACTLY: all logos, text, graphics, prints - character for character
3. COPY EXACTLY: all buttons, zippers, stitching, seams, labels, tags
4. COPY EXACTLY: any wear, fading, distressing, vintage characteristics
5. The hero garment is the SINGLE SOURCE OF TRUTH - copy it perfectly

PHOTOGRAPHY STYLE:
- Professional studio lighting
- Plain off-white/light grey background
- Full body shot showing the complete styled outfit
- Sharp focus on the hero garment
- Natural shadows and depth

WHAT NOT TO DO:
- DO NOT alter the hero garment in ANY way
- DO NOT generate a "similar" garment - use the EXACT one from the input
- DO NOT add distracting accessories
- DO NOT over-style or create runway/editorial looks
- DO NOT create costume-like or fantasy outfits
- Keep it wearable and realistic`;
  } else {
    // Product-only mode - just the garment on model
    prompt = `TASK: Place this EXACT garment onto a fashion model for e-commerce product photography.

MODEL TO USE:
${modelDescription}

POSE:
${poseDescription}

FIT STYLE:
${fitInstructions}

ABSOLUTE REQUIREMENTS - DO NOT VIOLATE:
1. The garment in the output MUST be a PIXEL-PERFECT representation of the input image
2. DO NOT change, alter, redesign, or reimagine ANY aspect of the garment
3. COPY EXACTLY: every color, every shade, every pattern, every texture
4. COPY EXACTLY: all logos, all text, all graphics, all prints - character for character, line for line
5. COPY EXACTLY: all buttons, zippers, stitching, seams, labels, tags
6. COPY EXACTLY: any wear, fading, distressing, or vintage characteristics
7. The garment is the SINGLE SOURCE OF TRUTH - the input image defines 100% of how the clothing looks

WHAT TO GENERATE:
- A professional studio photo with the model wearing this EXACT garment
- Plain off-white/light grey background
- Professional studio lighting
- Full or 3/4 body shot showing the complete garment
- The model's body and pose as described above

WHAT NOT TO DO:
- DO NOT generate a "similar" garment - use the EXACT one from the image
- DO NOT change colors or patterns
- DO NOT remove or alter any text, logos, or graphics
- DO NOT add accessories or styling not in the original
- DO NOT "improve" or "enhance" the garment design
- DO NOT hallucinate or invent any garment details

The input image is your ONLY reference for the garment. Copy it exactly onto the model.`;
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