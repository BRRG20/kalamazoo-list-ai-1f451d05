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
  sideImageUrl?: string;
  detailImageUrl?: string;
}

const MAX_RETRIES = 2;

// Real photo crop definitions - these are cropping operations on the ORIGINAL photos
// NO hallucination, NO adding elements, just smart crops from existing pixels
const CROP_SHOTS = [
  {
    id: 'chest_crop',
    name: 'Chest/Shoulder Close-up',
    sourcePreference: ['front', 'back'], // Prefer front, fallback to back
    prompt: `TASK: Create a CROPPED close-up from this exact garment photograph.

CRITICAL RULES - REAL PHOTO ONLY:
- You MUST crop from THIS EXACT photograph - no generation of new content
- DO NOT change colors, lighting, texture, or any visual properties
- DO NOT add shadows, effects, or enhancements
- DO NOT smooth, sharpen, or apply any filters
- Keep the exact matte finish - no glossy/CGI look
- Preserve any natural imperfections, wear, or fabric texture

CROP AREA: Upper chest and shoulder region
- Zoom into the upper torso area (chest to shoulders)
- Show the neckline/collar construction
- Include any buttons, zippers, or closures visible
- Maintain original pixel quality - no interpolation artifacts

OUTPUT: A cropped section showing chest/shoulder detail with zero alterations.`,
  },
  {
    id: 'fabric_macro',
    name: 'Fabric Texture Macro',
    sourcePreference: ['detail', 'front', 'back'], // Prefer detail shot
    prompt: `TASK: Create a MACRO CROP from this exact garment photograph.

CRITICAL RULES - REAL PHOTO ONLY:
- You MUST crop from THIS EXACT photograph - no generation of new content
- DO NOT change colors, lighting, texture, or any visual properties
- DO NOT add smoothing, sharpening, or clarity adjustments
- DO NOT enhance or alter the fabric appearance in any way
- Keep the exact matte finish - no glossy/CGI look
- Preserve pilling, wear, fading exactly as photographed

CROP AREA: Fabric texture region
- Zoom into a representative area showing fabric weave/texture
- Focus on the main body material (avoid seams/edges if possible)
- Show the actual hand-feel through visual texture
- Maintain original photograph grain and quality

OUTPUT: A tight macro crop showing fabric texture with zero alterations.`,
  },
  {
    id: 'feature_crop',
    name: 'Feature Detail (Logo/Print/Stitch)',
    sourcePreference: ['front', 'detail', 'back'], // Prefer front for logos
    prompt: `TASK: Create a DETAIL CROP focusing on any print, logo, or distinctive feature.

CRITICAL RULES - REAL PHOTO ONLY:
- You MUST crop from THIS EXACT photograph - no generation of new content
- DO NOT change colors, contrast, or saturation
- DO NOT sharpen text or enhance readability artificially
- DO NOT add shadows, highlights, or depth
- Keep the exact matte finish - no glossy/CGI look
- Preserve any cracking, fading, or aging on prints exactly

CROP AREA: Most prominent feature
- If there's a logo/graphic: zoom into it clearly
- If there's text: center it in frame
- If there's pattern: show a representative section
- If there's stitching detail: focus on that
- If plain: focus on any pocket, button, or unique construction

OUTPUT: A cropped section of the most distinctive feature with zero alterations.`,
  },
  {
    id: 'hem_cuff_crop',
    name: 'Hem/Cuff/Edge Detail',
    sourcePreference: ['side', 'front', 'back'], // Prefer side for edges
    prompt: `TASK: Create a CROP focusing on garment edges like hem, cuff, or waistband.

CRITICAL RULES - REAL PHOTO ONLY:
- You MUST crop from THIS EXACT photograph - no generation of new content
- DO NOT change colors, lighting, or fabric appearance
- DO NOT add shadows or depth enhancement
- DO NOT smooth edges or hide imperfections
- Keep the exact matte finish - no glossy/CGI look
- Show wear on edges exactly as photographed

CROP AREA: Lower edge or sleeve detail
- Zoom into hem, cuff, waistband, or sleeve edge
- Show construction quality (stitching, ribbing, etc.)
- Include any elastic, drawstring, or closure visible
- If sleeves not visible, focus on bottom hem

OUTPUT: A cropped section of edge/hem detail with zero alterations.`,
  },
];

async function generateCropFromSource(
  sourceImageUrl: string,
  cropType: typeof CROP_SHOTS[0],
  apiKey: string,
  attempt: number = 1
): Promise<string | null> {
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
              { type: 'text', text: cropType.prompt },
              { type: 'image_url', image_url: { url: sourceImageUrl } }
            ]
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AI API error for ${cropType.id} (attempt ${attempt}):`, response.status, errorText);
      
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      if (response.status === 402) {
        throw new Error('Payment required. Please add credits to your workspace.');
      }
      
      if (attempt < MAX_RETRIES) {
        console.log(`Retrying ${cropType.id}...`);
        await new Promise(r => setTimeout(r, 2000));
        return generateCropFromSource(sourceImageUrl, cropType, apiKey, attempt + 1);
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
    console.error(`Error generating ${cropType.id}:`, error);
    
    if (error instanceof Error && (error.message.includes('Rate limit') || error.message.includes('Payment'))) {
      throw error;
    }
    
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 2000));
      return generateCropFromSource(sourceImageUrl, cropType, apiKey, attempt + 1);
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
    
    const fileName = `${productId}/photo_crop_${imageType}_${Date.now()}.png`;
    
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
    const { productId, frontImageUrl, backImageUrl, sideImageUrl, detailImageUrl } = body;

    if (!productId) {
      return new Response(
        JSON.stringify({ error: 'productId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build source map for intelligent source selection
    const sourceMap: Record<string, string | undefined> = {
      front: frontImageUrl,
      back: backImageUrl,
      side: sideImageUrl,
      detail: detailImageUrl,
    };

    // Find the best available source for each crop
    const findBestSource = (preferences: string[]): string | null => {
      for (const pref of preferences) {
        if (sourceMap[pref]) {
          return sourceMap[pref]!;
        }
      }
      // Fallback to any available source
      return frontImageUrl || backImageUrl || sideImageUrl || detailImageUrl || null;
    };

    console.log(`Starting REAL PHOTO expansion for product ${productId}`);
    console.log(`Available sources: front=${!!frontImageUrl}, back=${!!backImageUrl}, side=${!!sideImageUrl}, detail=${!!detailImageUrl}`);

    const generatedImages: { type: string; url: string }[] = [];

    // Generate all 4 crops in parallel
    console.log(`Generating 4 real-photo crops...`);
    
    const generatePromises = CROP_SHOTS.map(async (cropType) => {
      const sourceUrl = findBestSource(cropType.sourcePreference);
      
      if (!sourceUrl) {
        console.warn(`No source image available for ${cropType.name}`);
        return null;
      }
      
      console.log(`Queuing ${cropType.name} from source...`);
      
      const base64Image = await generateCropFromSource(
        sourceUrl,
        cropType,
        apiKey
      );

      if (base64Image) {
        const publicUrl = await uploadBase64ToStorage(
          base64Image,
          productId,
          cropType.id,
          supabaseUrl,
          supabaseKey
        );

        if (publicUrl) {
          console.log(`Successfully created: ${cropType.name}`);
          return { type: cropType.id, url: publicUrl };
        }
      }
      console.warn(`Failed to create: ${cropType.name}`);
      return null;
    });

    const results = await Promise.all(generatePromises);
    for (const result of results) {
      if (result) {
        generatedImages.push(result);
      }
    }

    console.log(`Real photo expansion complete. Generated ${generatedImages.length} cropped images.`);

    return new Response(
      JSON.stringify({ 
        success: true,
        generatedImages,
        totalImages: generatedImages.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Photo expansion error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Photo expansion failed';
    const status = errorMessage.includes('Rate limit') ? 429 
      : errorMessage.includes('Payment') ? 402 
      : 500;
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
