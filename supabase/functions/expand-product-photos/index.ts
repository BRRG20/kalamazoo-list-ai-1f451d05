import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  productId: string;
  sourceImageUrl: string;
  mode: 'product_photos' | 'ai_model';
  currentImageCount?: number;
  maxImages?: number;
  shotCount?: number; // 1=fast, 2=standard, 3=high (default 3 for backwards compat)
}

const MAX_RETRIES = 2;

// PRODUCT PHOTO EXPANSION - Strictly crops/reframes from original photos
// NO AI generation, NO beautification, NO hallucination
const PRODUCT_PHOTO_SHOTS = [
  {
    id: 'detail_crop',
    name: 'Detail Close-up (Graphic/Print/Label)',
    prompt: `You are an image cropping tool. You MUST output a region cropped directly from the provided source image. 

ABSOLUTE RULES:
- Output pixels MUST come from the source image. Do NOT invent, generate, or hallucinate any pixels.
- Do NOT change any colours, textures, lighting, or details.
- Do NOT add, remove, or modify anything.
- The output must look like a screenshot/crop of the original, not a new generation.

CROP TARGET: Zoom into the most visually distinctive area of the garment:
- Graphic, print, logo, or text if present (fill 60-80% of frame)
- Otherwise: collar, buttons, stitching, or texture detail
- Output should be a tight, focused crop of that area

Output a single cropped image, nothing else.`
  },
  {
    id: 'upper_crop',
    name: 'Upper Garment Crop (Neckline/Shoulder)',
    prompt: `You are an image cropping tool. You MUST output a region cropped directly from the provided source image.

ABSOLUTE RULES:
- Output pixels MUST come from the source image. Do NOT invent, generate, or hallucinate any pixels.
- Do NOT change any colours, textures, lighting, or details.
- Do NOT add, remove, or modify anything.
- The output must look like a screenshot/crop of the original, not a new generation.

CROP TARGET: The upper 30-40% of the garment showing:
- Neckline, collar, and shoulder area
- Any closures (buttons, zippers) at the top

Output a single cropped image, nothing else.`
  },
  {
    id: 'lower_crop',
    name: 'Lower Garment Crop (Hem/Cuff/Pocket)',
    prompt: `You are an image cropping tool. You MUST output a region cropped directly from the provided source image.

ABSOLUTE RULES:
- Output pixels MUST come from the source image. Do NOT invent, generate, or hallucinate any pixels.
- Do NOT change any colours, textures, lighting, or details.
- Do NOT add, remove, or modify anything.
- The output must look like a screenshot/crop of the original, not a new generation.

CROP TARGET: The lower portion or edge details of the garment:
- Hem, cuff, pocket, side seam, or waistband
- Any hardware (zippers, buttons, rivets)

Output a single cropped image, nothing else.`
  },
];

// AI MODEL EXPANSION - Additional angles of SAME model
// NEVER generate a new model, NEVER change the person
const AI_MODEL_SHOTS = [
  {
    id: 'model_detail',
    name: 'Model Detail Close-up',
    prompt: `You are an image cropping tool. You MUST output a region cropped directly from the provided source image.

ABSOLUTE RULES:
- Output pixels MUST come from the source image. Do NOT invent, generate, or hallucinate any pixels.
- Do NOT change any colours, textures, lighting, skin tone, or details.
- Do NOT swap, alter, or replace the person. The SAME person must appear.
- The output must look like a screenshot/crop of the original, not a new generation.

CROP TARGET: Zoom into the most visually distinctive garment detail on the model:
- Graphic, print, logo area on the chest/torso
- Or collar/neckline area showing fit on the model

Output a single cropped image, nothing else.`
  },
  {
    id: 'model_upper',
    name: 'Model Upper Body',
    prompt: `You are an image cropping tool. You MUST output a region cropped directly from the provided source image.

ABSOLUTE RULES:
- Output pixels MUST come from the source image. Do NOT invent, generate, or hallucinate any pixels.
- Do NOT change any colours, textures, lighting, skin tone, or details.
- Do NOT swap, alter, or replace the person. The SAME person must appear.
- The output must look like a screenshot/crop of the original, not a new generation.

CROP TARGET: Upper body from shoulders to mid-chest:
- Neckline and collar fit on the model
- Shoulder seam area

Output a single cropped image, nothing else.`
  },
  {
    id: 'model_lower',
    name: 'Model Lower/Edge Detail',
    prompt: `You are an image cropping tool. You MUST output a region cropped directly from the provided source image.

ABSOLUTE RULES:
- Output pixels MUST come from the source image. Do NOT invent, generate, or hallucinate any pixels.
- Do NOT change any colours, textures, lighting, skin tone, or details.
- Do NOT swap, alter, or replace the person. The SAME person must appear.
- The output must look like a screenshot/crop of the original, not a new generation.

CROP TARGET: Lower portion of the garment on the model:
- Hem, cuff, pocket, or side seam area

Output a single cropped image, nothing else.`
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
        model: 'google/gemini-3-pro-image-preview',
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
    const { productId, sourceImageUrl, mode, currentImageCount = 0, maxImages = 9, shotCount } = body;

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

    // Select shot types based on mode, limited by remaining slots AND shotCount
    const allShotTypes = mode === 'product_photos' ? PRODUCT_PHOTO_SHOTS : AI_MODEL_SHOTS;
    const maxShots = shotCount != null ? Math.min(shotCount, remainingSlots) : remainingSlots;
    const shotTypes = allShotTypes.slice(0, maxShots);
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