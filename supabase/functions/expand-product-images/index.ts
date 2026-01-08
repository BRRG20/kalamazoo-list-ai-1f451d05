import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  productId: string;
  frontImageUrl: string;
  backImageUrl?: string;
  labelImageUrl?: string;
  detailImageUrl?: string;
  targetCount?: number; // Default 8 total images
}

const MAX_RETRIES = 2;

// AI Models with consistent identities for plain background shots
const AI_MODELS = [
  {
    id: 'alex',
    name: 'Alex',
    gender: 'male',
    description: 'Male model, age 30-35, athletic build. Short dark brown hair, warm olive skin, brown eyes. Clean-shaven, natural expression.',
  },
  {
    id: 'marcus',
    name: 'Marcus', 
    gender: 'male',
    description: 'Male model, age 28-32, athletic build. Black skin, short fade haircut, dark brown eyes. Strong jawline, confident expression.',
  },
  {
    id: 'elena',
    name: 'Elena',
    gender: 'female',
    description: 'Female model, age 28-32, slim build. Long dark hair, Mediterranean olive skin, hazel eyes. Natural makeup, warm expression.',
  },
  {
    id: 'lily',
    name: 'Lily',
    gender: 'female', 
    description: 'Female model, age 25-30, slim athletic build. Blonde hair in loose waves, fair skin, blue eyes. Fresh-faced, approachable look.',
  },
  {
    id: 'mei',
    name: 'Mei',
    gender: 'female',
    description: 'Female model, age 26-30, slim build. East Asian features, straight black hair shoulder length, dark brown eyes. Elegant, serene expression.',
  },
  {
    id: 'ryan',
    name: 'Ryan',
    gender: 'male',
    description: 'Male model, age 30-35, medium athletic build. Light brown hair slightly wavy, fair skin, green eyes. Relaxed friendly expression.',
  },
];

// Different poses for variety
const POSES = [
  {
    id: 'front_straight',
    description: 'Standing straight, facing camera directly, arms relaxed at sides. Full body visible from head to below knees.',
  },
  {
    id: 'front_casual',
    description: 'Standing with slight weight shift to one leg, one hand in pocket or relaxed. Natural casual pose, full body visible.',
  },
  {
    id: 'three_quarter',
    description: 'Body turned 30-45 degrees from camera, face toward camera. Shows garment dimension and fit. Full body visible.',
  },
  {
    id: 'movement',
    description: 'Mid-stride walking pose, natural movement frozen. Shows how garment moves and drapes. Full body visible.',
  },
];

async function generateModelImage(
  sourceImageUrl: string,
  model: typeof AI_MODELS[0],
  pose: typeof POSES[0],
  apiKey: string,
  attempt: number = 1
): Promise<string | null> {
  const prompt = `TASK: Generate an e-commerce model photo on a PLAIN STUDIO BACKGROUND.

MODEL IDENTITY (MUST BE CONSISTENT):
${model.description}
Model name: ${model.name}
Seed ID: ${model.id}-model-v1

POSE:
${pose.description}

🔒 HARD RULE: CLOTHING LOCK (NON-NEGOTIABLE) 🔒
The garment from the source image MUST appear EXACTLY as it is:
✅ EXACT same color - no shifts, no enhancements
✅ EXACT same fabric texture - if it's worn cotton, it stays worn cotton  
✅ EXACT same prints, graphics, logos - pixel-perfect replication
✅ EXACT same fit and drape characteristics
✅ Natural matte finish - NO artificial gloss or CGI shine

FORBIDDEN:
❌ NO glossing or artificial shine
❌ NO fabric smoothing or enhancement
❌ NO color correction or saturation boost
❌ NO CGI or hyper-rendered effects
❌ NO adding accessories or styling
❌ NO changing the garment in ANY way

If the garment is faded, worn, or vintage - it MUST look faded, worn, or vintage.

BACKGROUND:
- Clean, solid white or very light grey (#F5F5F5) studio background
- PLAIN - no gradients, no textures, no props
- Professional photography studio lighting
- Soft, even lighting with minimal shadows

OUTPUT REQUIREMENTS:
- Professional e-commerce product photography style
- Model wearing ONLY the garment from the source image
- Plain solid color bottoms (black or navy jeans/trousers) if source is a top
- No distracting elements
- The focus is 100% on the garment

This is for e-commerce - customers must see exactly what they're buying.`;

  try {
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
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: sourceImageUrl } }
            ]
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AI API error for ${model.id}/${pose.id} (attempt ${attempt}):`, response.status, errorText);
      
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      if (response.status === 402) {
        throw new Error('Payment required. Please add credits to your workspace.');
      }
      
      if (attempt < MAX_RETRIES) {
        console.log(`Retrying ${model.id}/${pose.id}...`);
        await new Promise(r => setTimeout(r, 2000));
        return generateModelImage(sourceImageUrl, model, pose, apiKey, attempt + 1);
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

    return generatedImage || null;
  } catch (error) {
    console.error(`Error generating ${model.id}/${pose.id}:`, error);
    
    // Re-throw rate limit and payment errors
    if (error instanceof Error && (error.message.includes('Rate limit') || error.message.includes('Payment'))) {
      throw error;
    }
    
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 2000));
      return generateModelImage(sourceImageUrl, model, pose, apiKey, attempt + 1);
    }
    return null;
  }
}

async function uploadBase64ToStorage(
  base64Data: string,
  productId: string,
  imageType: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<string | null> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Remove data URL prefix if present
    const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Uint8Array.from(atob(base64Content), c => c.charCodeAt(0));
    
    const fileName = `${productId}/model_${imageType}_${Date.now()}.png`;
    
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
    const { productId, frontImageUrl, backImageUrl, targetCount = 8 } = body;

    if (!productId || !frontImageUrl) {
      return new Response(
        JSON.stringify({ error: 'productId and frontImageUrl are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting AI model image expansion for product ${productId}`);

    // Calculate how many model images to generate - LIMIT TO 3 to avoid timeout
    const existingCount = [frontImageUrl, backImageUrl].filter(Boolean).length;
    const toGenerate = Math.max(0, Math.min(targetCount - existingCount, 3)); // Max 3 model images per call to avoid timeout
    
    console.log(`Existing: ${existingCount}, Target: ${targetCount}, To generate: ${toGenerate}`);

    if (toGenerate === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Already have enough images',
          generatedImages: [] 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Randomly select models and poses for variety
    const shuffledModels = [...AI_MODELS].sort(() => Math.random() - 0.5);
    const shuffledPoses = [...POSES].sort(() => Math.random() - 0.5);
    
    const generatedImages: { type: string; url: string }[] = [];

    // Generate model images - using Promise.all for parallel generation (faster)
    const generatePromises = [];
    
    for (let i = 0; i < toGenerate; i++) {
      const model = shuffledModels[i % shuffledModels.length];
      const pose = shuffledPoses[i % shuffledPoses.length];

      console.log(`Queuing model image ${i + 1}/${toGenerate}: ${model.name} in ${pose.id} pose...`);
      
      generatePromises.push(
        (async () => {
          const base64Image = await generateModelImage(
            frontImageUrl,
            model,
            pose,
            apiKey
          );

          if (base64Image) {
            // Upload to storage
            const publicUrl = await uploadBase64ToStorage(
              base64Image,
              productId,
              `${model.id}_${pose.id}`,
              supabaseUrl,
              supabaseKey
            );

            if (publicUrl) {
              console.log(`Successfully generated and uploaded model image: ${model.name}/${pose.id}`);
              return { type: `model_${model.id}_${pose.id}`, url: publicUrl };
            }
          }
          console.warn(`Failed to generate model image: ${model.name}/${pose.id}`);
          return null;
        })()
      );
    }

    // Wait for all generations to complete in parallel
    const results = await Promise.all(generatePromises);
    for (const result of results) {
      if (result) {
        generatedImages.push(result);
      }
    }

    console.log(`AI model image expansion complete. Generated ${generatedImages.length} images.`);

    return new Response(
      JSON.stringify({ 
        success: true,
        generatedImages,
        totalImages: existingCount + generatedImages.length,
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
