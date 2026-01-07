import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  imageUrl: string;
  secondPass?: boolean;
  shadow?: 'none' | 'light' | 'medium' | 'harsh';
}

async function processBackgroundRemoval(
  imageUrl: string, 
  apiKey: string,
  addShadow: 'none' | 'light' | 'medium' | 'harsh' = 'none'
): Promise<string> {
  const shadowInstruction = addShadow !== 'none' 
    ? `After removing background, add a ${addShadow === 'light' ? 'subtle, soft' : addShadow === 'medium' ? 'moderate, natural' : 'strong, dramatic'} drop shadow at the bottom of the garment to give it depth and ground the product. The shadow should appear as if light is coming from above.`
    : '';

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
              text: `Remove the background from this clothing product photo for e-commerce use.

CRITICAL REQUIREMENTS:
1. Keep ONLY the garment/clothing and the hanger (including the metal hook)
2. Make the background 100% transparent (PNG with alpha channel)
3. VERY IMPORTANT: The triangular or rectangular OPENING in the middle of the hanger where you can see through to the background - this visible area through the hanger opening MUST also be completely transparent, NOT gray or white
4. Remove ALL background visible through any gaps, holes, or openings - including the space inside the hanger frame
5. Ensure clean, crisp edges with NO stray pixels, artifacts, halos, or incomplete removal
6. No remnant shadows or fringes around any edges
7. Every single pixel that is not part of the actual clothing fabric or hanger material must be fully transparent

${shadowInstruction}

Output a clean product cutout with ONLY the garment and hanger visible, against a 100% transparent background.`
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl
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
    throw new Error(`AI processing failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const generatedImage = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  
  if (!generatedImage) {
    throw new Error('No processed image returned from AI');
  }

  return generatedImage;
}

async function cleanupPass(imageUrl: string, apiKey: string): Promise<string> {
  console.log('Running cleanup second pass...');
  
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
              text: `This is a product image that has already had background removal applied. Please clean it up:

CLEANUP REQUIREMENTS:
1. Find and remove ANY remaining background artifacts, stray pixels, or gray/white patches
2. The area inside the hanger opening (triangular/rectangular gap) should be 100% transparent - if there's any gray or white remaining there, make it transparent
3. Clean up any rough or jagged edges on the clothing and hanger
4. Remove any halos, fringes, or semi-transparent areas around the edges
5. Ensure ALL areas that should be transparent are fully transparent (alpha = 0)
6. Keep the existing drop shadow if present
7. Do not alter the clothing or hanger itself - only clean the edges and remove background remnants

Output the cleaned product image with perfect transparency where the background should be.`
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl
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
    throw new Error(`Cleanup pass failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const generatedImage = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  
  if (!generatedImage) {
    throw new Error('No processed image returned from cleanup pass');
  }

  return generatedImage;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { imageUrl, secondPass = false, shadow = 'none' }: RequestBody = await req.json();
    
    if (!imageUrl) {
      throw new Error('imageUrl is required');
    }

    console.log('Processing image for background removal:', { 
      imageUrl: imageUrl.substring(0, 50) + '...', 
      secondPass, 
      shadow 
    });

    // First pass - remove background (with shadow if requested)
    let processedImage = await processBackgroundRemoval(imageUrl, LOVABLE_API_KEY, shadow);
    console.log('First pass complete');

    // Second pass - cleanup for better edge quality
    if (secondPass) {
      try {
        processedImage = await cleanupPass(processedImage, LOVABLE_API_KEY);
        console.log('Cleanup pass complete');
      } catch (cleanupError) {
        console.error('Cleanup pass failed, using first pass result:', cleanupError);
        // Continue with first pass result if cleanup fails
      }
    }

    return new Response(JSON.stringify({ 
      processedImageUrl: processedImage,
      success: true 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in remove-background function:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Background removal failed';
    
    // Check for rate limit or credit errors
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