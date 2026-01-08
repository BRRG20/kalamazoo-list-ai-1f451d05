import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  productId: string;
  sourceImageUrl: string; // The source image for expansion
  mode: 'product_photos' | 'ai_model'; // Which expansion mode
  currentImageCount?: number; // How many images the product currently has
  maxImages?: number; // Maximum total images allowed (default 9)
}

const MAX_RETRIES = 2;

// PRODUCT PHOTO EXPANSION - Strictly crops/reframes from original photos
// NO AI generation, NO beautification, NO hallucination
const PRODUCT_PHOTO_SHOTS = [
  {
    id: 'detail_crop',
    name: 'Detail Close-up (Graphic/Print/Label)',
    prompt: `🎯 TASK: Create a CROPPED CLOSE-UP from this exact product photo.

⚠️ CRITICAL RULES - YOU MUST FOLLOW EXACTLY:
1. You are ONLY cropping/reframing the provided image
2. DO NOT generate new content
3. DO NOT add any elements not in the source
4. DO NOT change colors, textures, or graphics
5. DO NOT "beautify" or "enhance" the image
6. This is a CROP operation, not a generation operation

🔍 TARGET: Find and crop to the most distinctive feature:
- If graphic/print exists → center it in frame (fill 60-80%)
- If logo/text → make it prominent and readable
- If pattern → show representative texture area
- If plain → focus on best construction detail (stitching, collar, buttons)

📐 COMPOSITION:
- E-commerce quality close-up crop
- Sharp focus on the detail
- No excessive negative space
- Square or landscape orientation preferred

OUTPUT: A crisp, EXACT crop from the source showing the sellable detail.`
  },
  {
    id: 'upper_crop',
    name: 'Upper Garment Crop (Neckline/Shoulder)',
    prompt: `🎯 TASK: Create an UPPER BODY CROP from this exact product photo.

⚠️ CRITICAL RULES - YOU MUST FOLLOW EXACTLY:
1. You are ONLY cropping/reframing the provided image
2. DO NOT generate new content
3. DO NOT add any elements not in the source
4. DO NOT change colors, textures, or graphics
5. DO NOT "beautify" or "enhance" the image
6. This is a CROP operation, not a generation operation

🔍 TARGET: Upper portion of the garment:
- Neckline and collar construction
- Shoulder seams and fit
- Upper chest area
- Any closures (buttons, zippers, hoods)

📐 COMPOSITION:
- Frame the top 30-40% of the garment
- Show collar/neckline detail clearly
- Landscape or square crop preferred
- E-commerce product photography style

OUTPUT: A crisp EXACT crop showing neckline and shoulder area.`
  },
  {
    id: 'lower_crop',
    name: 'Lower Garment Crop (Hem/Cuff/Pocket)',
    prompt: `🎯 TASK: Create a LOWER/EDGE CROP from this exact product photo.

⚠️ CRITICAL RULES - YOU MUST FOLLOW EXACTLY:
1. You are ONLY cropping/reframing the provided image
2. DO NOT generate new content
3. DO NOT add any elements not in the source
4. DO NOT change colors, textures, or graphics
5. DO NOT "beautify" or "enhance" the image
6. This is a CROP operation, not a generation operation

🔍 TARGET: Choose the most interesting visible detail:
- Hem/bottom edge with stitching
- Cuff/sleeve end
- Pocket construction
- Side seam details
- Waistband (if visible)
- Any hardware (zippers, buttons, rivets)

📐 COMPOSITION:
- Focus on construction quality
- Show fabric texture clearly
- Square or landscape crop preferred
- E-commerce product photography style

OUTPUT: A crisp EXACT crop showing hem, cuff, or edge detail.`
  },
];

// AI MODEL EXPANSION - Additional angles of SAME model
// NEVER generate a new model, NEVER change the person
const AI_MODEL_SHOTS = [
  {
    id: 'model_detail',
    name: 'Model Detail Close-up',
    prompt: `🎯 TASK: Create a DETAIL CLOSE-UP from this AI model photo.

🔒 IDENTITY LOCK - NON-NEGOTIABLE:
- The person MUST be the EXACT SAME person from the source
- SAME face, SAME skin tone, SAME body type
- NEVER swap to a different person or gender
- This is the same photoshoot, just a different crop

🔒 CLOTHING LOCK - NON-NEGOTIABLE:
- The garment MUST remain IDENTICAL to source
- EXACT colour (no shifting)
- EXACT texture (no gloss/shine added)
- EXACT graphics/prints (character-for-character)
- NO hallucinated elements

⚠️ DO NOT ZOOM INTO FACE - This is PRODUCT-focused.

🎯 TARGET: Find the most sellable garment detail:
- If graphic/print → center it prominently
- If logo → make it readable
- If pattern → show texture clearly
- Show from mid-chest area

📐 OUTPUT: A close-up crop from the same photoshoot showing garment detail on model.`
  },
  {
    id: 'model_upper',
    name: 'Model Upper Body',
    prompt: `🎯 TASK: Create an UPPER BODY crop from this AI model photo.

🔒 IDENTITY LOCK - NON-NEGOTIABLE:
- The person MUST be the EXACT SAME person from the source
- SAME face, SAME skin tone, SAME body type
- NEVER swap to a different person or gender
- This is the same photoshoot, just a different frame

🔒 CLOTHING LOCK - NON-NEGOTIABLE:
- The garment MUST remain IDENTICAL to source
- EXACT colour, texture, graphics, wear
- NO "improving" or "beautifying" the fabric

🎯 TARGET: Shoulders to mid-chest:
- Show collar/neckline fit on the model
- Include shoulder seams
- Can show partial chin but DO NOT focus on face
- This shows HOW THE GARMENT FITS

📐 OUTPUT: Upper body crop from the same photoshoot showing fit at neckline.`
  },
  {
    id: 'model_lower',
    name: 'Model Lower/Edge Detail',
    prompt: `🎯 TASK: Create a LOWER DETAIL crop from this AI model photo.

🔒 IDENTITY LOCK - NON-NEGOTIABLE:
- The person MUST be the EXACT SAME person from the source
- SAME body, SAME skin tone
- NEVER swap to a different person
- Hands must have realistic anatomy (5 fingers, natural joints)

🔒 CLOTHING LOCK - NON-NEGOTIABLE:
- The garment MUST remain IDENTICAL to source
- EXACT colour, texture, graphics, wear
- NO hallucinated elements

🎯 TARGET: Choose the best visible lower detail:
- Hem/bottom edge of garment
- Cuff/sleeve ending
- Pocket if visible
- Side seam construction

📐 OUTPUT: Lower body/edge crop from the same photoshoot showing garment construction.`
  },
];

async function generateCropImage(
  sourceImageUrl: string,
  shotType: { id: string; name: string; prompt: string },
  apiKey: string,
  attempt: number = 1
): Promise<string | null> {
  try {
    console.log(`Generating ${shotType.name}...`);
    
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
              { type: 'text', text: shotType.prompt },
              { type: 'image_url', image_url: { url: sourceImageUrl } }
            ]
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AI API error for ${shotType.id} (attempt ${attempt}):`, response.status, errorText);
      
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      if (response.status === 402) {
        throw new Error('Payment required. Please add credits to your workspace.');
      }
      
      if (attempt < MAX_RETRIES) {
        console.log(`Retrying ${shotType.id}...`);
        await new Promise(r => setTimeout(r, 2000));
        return generateCropImage(sourceImageUrl, shotType, apiKey, attempt + 1);
      }
      return null;
    }

    const data = await response.json();
    
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

    if (generatedImage) {
      console.log(`Successfully generated ${shotType.name}`);
    } else {
      console.warn(`No image returned for ${shotType.name}`);
    }

    return generatedImage || null;
  } catch (error) {
    console.error(`Error generating ${shotType.id}:`, error);
    
    if (error instanceof Error && (error.message.includes('Rate limit') || error.message.includes('Payment'))) {
      throw error;
    }
    
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 2000));
      return generateCropImage(sourceImageUrl, shotType, apiKey, attempt + 1);
    }
    return null;
  }
}

async function uploadBase64ToStorage(
  base64Data: string,
  productId: string,
  imageType: string,
  mode: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<string | null> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Remove data URL prefix if present
    const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Uint8Array.from(atob(base64Content), c => c.charCodeAt(0));
    
    const fileName = `${productId}/${mode}_${imageType}_${Date.now()}.png`;
    
    const { data, error } = await supabase.storage
      .from('product-images')
      .upload(fileName, imageBuffer, {
        contentType: 'image/png',
        upsert: false,
      });

    if (error) {
      console.error('Storage upload error:', error);
      return null;
    }

    const { data: publicUrl } = supabase.storage
      .from('product-images')
      .getPublicUrl(fileName);

    console.log(`Uploaded ${imageType} to storage: ${publicUrl.publicUrl.substring(0, 60)}...`);
    return publicUrl.publicUrl;
  } catch (error) {
    console.error('Upload error:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!apiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing');
    }

    const body: RequestBody = await req.json();
    const { productId, sourceImageUrl, mode, currentImageCount = 0, maxImages = 9 } = body;

    if (!productId || !sourceImageUrl || !mode) {
      return new Response(
        JSON.stringify({ error: 'productId, sourceImageUrl, and mode are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate how many images we can generate (cap at maxImages total)
    const remainingSlots = Math.max(0, maxImages - currentImageCount);
    
    if (remainingSlots === 0) {
      console.log(`Product ${productId} already has ${currentImageCount} images (max: ${maxImages}). No expansion needed.`);
      return new Response(
        JSON.stringify({ 
          success: true,
          mode,
          generatedImages: [],
          totalImages: 0,
          message: `Product already has ${currentImageCount} images (max: ${maxImages})`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Select shot types based on mode, limited by remaining slots
    const allShotTypes = mode === 'product_photos' ? PRODUCT_PHOTO_SHOTS : AI_MODEL_SHOTS;
    const shotTypes = allShotTypes.slice(0, remainingSlots);
    const modeLabel = mode === 'product_photos' ? 'PRODUCT PHOTO' : 'AI MODEL';
    
    console.log(`Starting ${modeLabel} expansion for product ${productId}`);
    console.log(`Current images: ${currentImageCount}, Max: ${maxImages}, Generating: ${shotTypes.length} crops`);
    console.log(`Source image: ${sourceImageUrl.substring(0, 60)}...`);

    const generatedImages: { type: string; url: string }[] = [];

    // Generate all 3 crop shots in parallel
    const generatePromises = shotTypes.map(async (shotType) => {
      const base64Image = await generateCropImage(
        sourceImageUrl,
        shotType,
        apiKey
      );

      if (base64Image) {
        const publicUrl = await uploadBase64ToStorage(
          base64Image,
          productId,
          shotType.id,
          mode,
          supabaseUrl,
          supabaseKey
        );

        if (publicUrl) {
          return { type: shotType.id, url: publicUrl };
        }
      }
      console.warn(`Failed to create: ${shotType.name}`);
      return null;
    });

    const results = await Promise.all(generatePromises);
    for (const result of results) {
      if (result) {
        generatedImages.push(result);
      }
    }

    console.log(`${modeLabel} expansion complete. Generated ${generatedImages.length}/${shotTypes.length} images.`);

    return new Response(
      JSON.stringify({ 
        success: true,
        mode,
        generatedImages,
        totalImages: generatedImages.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Image expansion error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Image expansion failed';
    const status = errorMessage.includes('Rate limit') ? 429 
      : errorMessage.includes('Payment') ? 402 
      : 500;
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});