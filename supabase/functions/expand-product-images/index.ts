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

// Generate specific crop/close-up instructions
const EXPANSION_PROMPTS = [
  {
    type: 'chest_closeup',
    instruction: `Create a CROPPED close-up of the CHEST/UPPER BODY area of this garment.
FRAME: From just below the neckline to just above the waist.
SHOW: Fabric texture, any prints or graphics on chest, collar details.
RULES: 
- This is a CROP from the original garment photo, not a new photo
- EXACT same fabric, color, texture as original
- NO changes to the garment whatsoever
- Natural lighting, matte finish
- E-commerce quality crop`
  },
  {
    type: 'sleeve_detail',
    instruction: `Create a CROPPED close-up of the SLEEVE area of this garment.
FRAME: Focus on one sleeve from shoulder to cuff.
SHOW: Sleeve construction, cuff details, any sleeve graphics/patches.
RULES:
- This is a CROP from the original garment photo, not a new photo
- EXACT same fabric, color, texture as original
- NO changes to the garment whatsoever
- Natural lighting, matte finish
- E-commerce quality crop`
  },
  {
    type: 'collar_neckline',
    instruction: `Create a CROPPED close-up of the COLLAR/NECKLINE area of this garment.
FRAME: From top of shoulders up to include full collar/neckline.
SHOW: Collar shape, neckline style, any tags visible, stitching details.
RULES:
- This is a CROP from the original garment photo, not a new photo
- EXACT same fabric, color, texture as original
- NO changes to the garment whatsoever
- Natural lighting, matte finish
- E-commerce quality crop`
  },
  {
    type: 'fabric_texture',
    instruction: `Create a MACRO close-up showing the FABRIC TEXTURE of this garment.
FRAME: Tight crop showing fabric weave/knit pattern.
SHOW: Material quality, texture, weave pattern, fabric weight impression.
RULES:
- This is a MACRO CROP from the original garment photo
- EXACT same fabric appearance as original - worn is worn, faded is faded
- NO enhancement, NO smoothing, NO "improvement"
- Shows authentic texture customer will receive
- Natural lighting, matte finish`
  },
  {
    type: 'hem_bottom',
    instruction: `Create a CROPPED view of the HEM/BOTTOM area of this garment.
FRAME: Lower third of garment including hem.
SHOW: Hem style, any bottom graphics, overall length impression.
RULES:
- This is a CROP from the original garment photo
- EXACT same fabric, color, texture as original
- NO changes to the garment whatsoever
- Natural lighting, matte finish
- E-commerce quality crop`
  },
  {
    type: 'back_detail',
    instruction: `Create a CROPPED close-up of a KEY DETAIL from the back of this garment.
FRAME: Focus on most interesting back element (graphic, label area, seam detail).
SHOW: Back details, any prints/graphics, construction quality.
RULES:
- This is a CROP from the back view photo
- EXACT same fabric, color, texture as original
- NO changes to the garment whatsoever
- Natural lighting, matte finish
- E-commerce quality crop`
  },
];

async function generateExpansionImage(
  sourceImageUrl: string,
  expansionType: string,
  instruction: string,
  apiKey: string,
  attempt: number = 1
): Promise<string | null> {
  const prompt = `TASK: Generate an e-commerce product image crop/close-up.

🔒 HARD RULE: CLOTHING LOCK (NON-NEGOTIABLE) 🔒
The clothing in the source image must NOT change in ANY way.

KEEP EXACT:
✅ Color - exact same shades
✅ Fabric texture - cotton stays cotton
✅ Fabric weight and drape
✅ All prints, graphics, text
✅ Natural finish - matte, not glossy

FORBIDDEN:
❌ NO glossing or artificial shine
❌ NO CGI or hyper-rendered effects
❌ NO fabric smoothing
❌ NO color correction
❌ NO texture enhancement
❌ NO "improvement" of any kind

If the fabric is worn, faded, or vintage - it MUST look worn, faded, or vintage.
This is for e-commerce - customers must recognize exactly what they're buying.

${instruction}

BACKGROUND: Clean white or soft grey gradient, professional studio lighting.
The output must look like a real photograph, not AI-generated art.`;

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
      console.error(`AI API error for ${expansionType} (attempt ${attempt}):`, response.status, errorText);
      
      if (attempt < MAX_RETRIES) {
        console.log(`Retrying ${expansionType}...`);
        await new Promise(r => setTimeout(r, 1000));
        return generateExpansionImage(sourceImageUrl, expansionType, instruction, apiKey, attempt + 1);
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
    console.error(`Error generating ${expansionType}:`, error);
    
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 1000));
      return generateExpansionImage(sourceImageUrl, expansionType, instruction, apiKey, attempt + 1);
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
    
    const fileName = `${productId}/expanded_${imageType}_${Date.now()}.png`;
    
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
    const { productId, frontImageUrl, backImageUrl, labelImageUrl, detailImageUrl, targetCount = 8 } = body;

    if (!productId || !frontImageUrl) {
      return new Response(
        JSON.stringify({ error: 'productId and frontImageUrl are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting image expansion for product ${productId}`);
    console.log(`Source images: front=${!!frontImageUrl}, back=${!!backImageUrl}, label=${!!labelImageUrl}, detail=${!!detailImageUrl}`);

    // Calculate how many images to generate
    const existingCount = [frontImageUrl, backImageUrl, labelImageUrl, detailImageUrl].filter(Boolean).length;
    const toGenerate = Math.max(0, targetCount - existingCount);
    
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

    // Select which expansions to generate
    const selectedExpansions = EXPANSION_PROMPTS.slice(0, toGenerate);
    const generatedImages: { type: string; url: string }[] = [];

    // Generate each expansion
    for (const expansion of selectedExpansions) {
      // Use back image for back_detail, front for everything else
      const sourceUrl = expansion.type === 'back_detail' && backImageUrl 
        ? backImageUrl 
        : frontImageUrl;

      console.log(`Generating ${expansion.type} from ${expansion.type === 'back_detail' ? 'back' : 'front'} image...`);
      
      const base64Image = await generateExpansionImage(
        sourceUrl,
        expansion.type,
        expansion.instruction,
        apiKey
      );

      if (base64Image) {
        // Upload to storage
        const publicUrl = await uploadBase64ToStorage(
          base64Image,
          productId,
          expansion.type,
          supabaseUrl,
          supabaseKey
        );

        if (publicUrl) {
          generatedImages.push({ type: expansion.type, url: publicUrl });
          console.log(`Successfully generated and uploaded ${expansion.type}`);
        }
      } else {
        console.warn(`Failed to generate ${expansion.type}`);
      }

      // Small delay between generations to avoid rate limits
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`Image expansion complete. Generated ${generatedImages.length} images.`);

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