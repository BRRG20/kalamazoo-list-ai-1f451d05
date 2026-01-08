import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  productId: string;
  frontImageUrl: string; // The MODEL image to use as source (not the flat product photo)
  backImageUrl?: string;
  labelImageUrl?: string;
  detailImageUrl?: string;
  targetCount?: number;
}

const MAX_RETRIES = 2;

// REALISM BLOCK - Shared across all close-up generations
const REALISM_BLOCK = `
🚨 HUMAN REALISM REQUIREMENTS (IF MODEL VISIBLE) 🚨
If any part of a human model is visible in the crop:
- Preserve natural skin texture with visible pores
- NO airbrushing, NO smoothing, NO beauty filters
- Hands: realistic joints, visible knuckle lines, natural nail texture
- NO glossy/waxy skin appearance
- Keep natural imperfections visible

🔐 IDENTITY LOCK (IF MODEL VISIBLE):
- The person in the output MUST be the SAME person from the source image
- NEVER swap to a different person or gender
- Maintain same skin tone, same face structure, same body

⚠️ DO NOT ZOOM INTO FACE - Close-ups are PRODUCT-LED, not face-focused.
`;

// PRODUCT LOCK - Shared across all generations
const PRODUCT_LOCK = `
🔒 PRODUCT ACCURACY LOCK 🔒
The GARMENT must remain IDENTICAL to source:
- EXACT colour (no shifting, no saturation change)
- EXACT texture (matte stays matte, no gloss/shine)
- EXACT graphics/prints (copy character-for-character)
- EXACT wear/fading (if vintage, show vintage)
- NO hallucinated elements (no invented logos, no added pockets, no new seams)
- NO "improving" or "beautifying" the fabric
`;

// Three DISTINCT close-up shot types for strong e-commerce angles
// These MUST be clearly different compositions, not minor variations
const CLOSE_UP_SHOTS = [
  {
    id: 'detail_closeup',
    name: '1) Detail Close-up (Graphic/Print/Label)',
    prompt: `TASK: Create a DETAIL CLOSE-UP focusing on the most distinctive feature of this garment.

${REALISM_BLOCK}
${PRODUCT_LOCK}

🎯 TARGET AREA - Choose the BEST option:
1. If graphic/print exists → zoom into it prominently (fill 60-80% of frame)
2. If logo/text exists → center it clearly, make readable
3. If pattern/texture → show representative area with clear detail
4. If branding/label on garment (NOT tag) → focus there
5. If plain garment → focus on best construction detail (stitching, collar, button)

COMPOSITION REQUIREMENTS:
- This is an E-COMMERCE HERO close-up - must be SELLABLE quality
- Fill the frame with the detail - no excessive negative space
- Sharp focus on the feature
- This should be a "front-facing detail shot" - looking straight at the detail

⚠️ DO NOT:
- Zoom into the model's face
- Crop awkwardly mid-limb
- Show blurry or out-of-focus areas
- Add any elements not in the source
- Change colors, textures, or graphics

OUTPUT: A crisp, product-focused close-up that highlights the most sellable detail.`
  },
  {
    id: 'upper_closeup',
    name: '2) Upper Close-up (Neckline/Shoulder/Chest)',
    prompt: `TASK: Create an UPPER BODY close-up focusing on neckline, shoulder, and chest area.

${REALISM_BLOCK}
${PRODUCT_LOCK}

🎯 TARGET AREA: Upper torso - neckline to mid-chest
- Show collar construction and fit
- Include shoulder seam and shoulder fit
- Show neckline shape clearly (crew, V-neck, collar, etc.)
- If buttons/closures at neck → include them
- If hood/zipper → show the detail

COMPOSITION REQUIREMENTS:
- Frame from just above shoulders to mid-chest (chest to shoulder crop)
- Can include partial face (chin area) but do NOT focus on face
- This is about HOW THE GARMENT FITS at the neckline
- Strong e-commerce angle - like a product zoom on a shopping site

⚠️ DO NOT:
- Make this a face portrait
- Zoom into face features
- Crop at awkward points
- Change the garment's appearance
- Add glossy/CGI finish

OUTPUT: A strong upper-body crop showing neckline and shoulder fit.`
  },
  {
    id: 'lower_closeup',
    name: '3) Lower Close-up (Hem/Cuff/Pocket/Side)',
    prompt: `TASK: Create a LOWER BODY or EDGE DETAIL close-up focusing on hem, cuff, pocket, or side seam.

${REALISM_BLOCK}
${PRODUCT_LOCK}

🎯 TARGET AREA - Choose the BEST visible option:
1. HEM → show bottom edge of garment, stitching, finish
2. CUFF → sleeve end, ribbing, button if present
3. POCKET → show pocket construction, position, any details
4. SIDE SEAM → show how garment is constructed at sides
5. WAISTBAND → if visible, show elastic/drawstring/button

COMPOSITION REQUIREMENTS:
- Focus on CONSTRUCTION QUALITY and DETAIL
- This tells the buyer about garment quality
- Show fabric texture in this area
- Include any hardware (zippers, buttons, rivets)
- If hands/arms visible → ensure realistic anatomy (5 fingers, natural joints)

⚠️ DO NOT:
- Make this generic - choose the MOST INTERESTING lower detail
- Crop awkwardly through hands
- Show blurry areas
- Add elements not in source
- "Improve" worn or vintage details

OUTPUT: A crisp edge/hem/cuff detail that shows garment quality and construction.`
  },
];

async function generateCloseUpImage(
  sourceImageUrl: string,
  shotType: typeof CLOSE_UP_SHOTS[0],
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
    const { productId, frontImageUrl } = body;

    if (!productId || !frontImageUrl) {
      return new Response(
        JSON.stringify({ error: 'productId and frontImageUrl are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting close-up expansion for product ${productId}`);
    console.log(`Source image (model): ${frontImageUrl.substring(0, 60)}...`);
    console.log(`Generating 3 DISTINCT close-up compositions...`);

    const generatedImages: { type: string; url: string }[] = [];

    // Generate all 3 close-up shots in parallel
    // These MUST be distinctly different compositions
    const generatePromises = CLOSE_UP_SHOTS.map(async (shotType) => {
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

    console.log(`Close-up expansion complete. Generated ${generatedImages.length}/3 images.`);

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
