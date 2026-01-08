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
  targetCount?: number;
}

const MAX_RETRIES = 2;

// Close-up shot types for product detail expansion
const CLOSE_UP_SHOTS = [
  {
    id: 'fabric_texture',
    name: 'Fabric Texture Close-up',
    prompt: `Generate a CLOSE-UP photograph showing the fabric texture and weave of this garment.

REQUIREMENTS:
- Extreme close-up of the fabric material (macro-style shot)
- Show the actual weave pattern, thread texture, and material quality
- Natural lighting that reveals fabric depth and texture
- Fill the entire frame with fabric detail
- Plain neutral background where fabric edges are visible
- If there's any print or pattern, show how it looks up close

CRITICAL - EXACT REPLICATION:
- The fabric color MUST match the source image exactly
- The texture/weave pattern MUST be identical to the source
- If fabric is worn, pilled, or faded - show it exactly as-is
- NO enhancement, NO smoothing, NO color correction
- This must look like a real photo taken of the actual item`,
  },
  {
    id: 'collar_neckline',
    name: 'Collar/Neckline Detail',
    prompt: `Generate a CLOSE-UP photograph of the collar, neckline, or neck area of this garment.

REQUIREMENTS:
- Focused shot of the collar/neckline construction
- Show stitching quality, collar shape, and construction details
- Include any buttons, zippers, or closures in this area
- Soft studio lighting to show depth and form
- Lay flat or on form to show the detail clearly

CRITICAL - EXACT REPLICATION:
- Colors MUST match the source image exactly
- Stitching and construction details must be accurate
- If there's wear on the collar - show it exactly
- NO enhancement, NO smoothing, NO idealization
- This must look like a real product photo`,
  },
  {
    id: 'label_branding',
    name: 'Label/Brand Detail',
    prompt: `Generate a CLOSE-UP photograph showing the label, brand tag, or any branding elements on this garment.

REQUIREMENTS:
- Clear, readable shot of the main label/tag
- Show brand name, size, care instructions if visible
- Good lighting to ensure text is legible
- Include any embroidered logos or printed branding
- If no visible label, show the inside neckline/collar area

CRITICAL - EXACT REPLICATION:
- Text on labels must be accurate to what's shown in source
- Colors and fonts must match exactly
- Show any wear, fading, or imperfections on labels as-is
- NO inventing brand names or labels not in source
- This must look like a real photo of the actual label`,
  },
];

async function generateCloseUpImage(
  sourceImageUrl: string,
  shotType: typeof CLOSE_UP_SHOTS[0],
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
        return generateCloseUpImage(sourceImageUrl, shotType, apiKey, attempt + 1);
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
    console.error(`Error generating ${shotType.id}:`, error);
    
    if (error instanceof Error && (error.message.includes('Rate limit') || error.message.includes('Payment'))) {
      throw error;
    }
    
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 2000));
      return generateCloseUpImage(sourceImageUrl, shotType, apiKey, attempt + 1);
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
    
    const fileName = `${productId}/closeup_${imageType}_${Date.now()}.png`;
    
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
    const { productId, frontImageUrl } = body;

    if (!productId || !frontImageUrl) {
      return new Response(
        JSON.stringify({ error: 'productId and frontImageUrl are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting close-up image expansion for product ${productId}`);

    const generatedImages: { type: string; url: string }[] = [];

    // Generate all 3 close-up shots in parallel for speed
    console.log(`Generating 3 close-up shots in parallel...`);
    
    const generatePromises = CLOSE_UP_SHOTS.map(async (shotType) => {
      console.log(`Queuing ${shotType.name}...`);
      
      const base64Image = await generateCloseUpImage(
        frontImageUrl,
        shotType,
        apiKey
      );

      if (base64Image) {
        const publicUrl = await uploadBase64ToStorage(
          base64Image,
          productId,
          shotType.id,
          supabaseUrl,
          supabaseKey
        );

        if (publicUrl) {
          console.log(`Successfully generated: ${shotType.name}`);
          return { type: shotType.id, url: publicUrl };
        }
      }
      console.warn(`Failed to generate: ${shotType.name}`);
      return null;
    });

    const results = await Promise.all(generatePromises);
    for (const result of results) {
      if (result) {
        generatedImages.push(result);
      }
    }

    console.log(`Close-up expansion complete. Generated ${generatedImages.length} images.`);

    return new Response(
      JSON.stringify({ 
        success: true,
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
