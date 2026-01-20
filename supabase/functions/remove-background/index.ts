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

const MAX_RETRIES = 3;

async function processBackgroundRemoval(
  imageUrl: string, 
  apiKey: string,
  addShadow: 'none' | 'light' | 'medium' | 'harsh' = 'none',
  attempt: number = 1
): Promise<string> {
  const shadowInstruction = addShadow !== 'none' 
    ? `After removing background, add a ${addShadow === 'light' ? 'subtle, soft' : addShadow === 'medium' ? 'moderate, natural' : 'strong, dramatic'} drop shadow at the bottom of the garment to give it depth and ground the product. The shadow should appear as if light is coming from above.`
    : '';

  // Critical orientation preservation instruction
  const orientationLock = `CRITICAL CONSTRAINTS - DO NOT VIOLATE:
- DO NOT rotate, flip, mirror, or change the orientation of the image in any way
- DO NOT crop, resize, or change the aspect ratio or dimensions
- Preserve the EXACT original orientation (if portrait/vertical, output must be portrait/vertical; if landscape/horizontal, output must be landscape/horizontal)
- The subject position must remain exactly where it is in the frame
- Preserve full sharpness and detail: no blur, no pixelation, no smoothing
- ONLY remove the background pixels, replacing them with transparency`;

  // Use slightly different prompts on retry to avoid repeated refusals
  const prompts = [
    `${orientationLock}

Remove the background from this image. Replace all background pixels with full transparency (alpha=0). Keep only the clothing/garment and any hanger. Output as transparent PNG. ${shadowInstruction}`,
    `${orientationLock}

Make the background fully transparent. Keep only the clothing item visible. Do not transform the image in any way. Return the edited PNG image with transparency. ${shadowInstruction}`,
    `${orientationLock}

Background removal only: Replace non-clothing pixels with transparency. The garment must remain exactly as positioned. Export as transparent PNG. ${shadowInstruction}`
  ];

  const promptText = prompts[Math.min(attempt - 1, prompts.length - 1)];

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
              text: promptText
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
    console.error(`AI API error (attempt ${attempt}):`, response.status, errorText);
    throw new Error(`AI processing failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  console.log(`AI response structure (attempt ${attempt}):`, JSON.stringify({
    hasChoices: !!data.choices,
    choicesLength: data.choices?.length,
    hasMessage: !!data.choices?.[0]?.message,
    hasImages: !!data.choices?.[0]?.message?.images,
    imagesLength: data.choices?.[0]?.message?.images?.length,
    textContent: data.choices?.[0]?.message?.content?.substring?.(0, 100)
  }));
  
  // Try multiple paths to find the image
  let generatedImage = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  
  // Alternative path: sometimes image might be in a different structure
  if (!generatedImage && data.choices?.[0]?.message?.images?.[0]?.url) {
    generatedImage = data.choices[0].message.images[0].url;
  }
  
  // Another alternative: base64 directly
  if (!generatedImage && data.choices?.[0]?.message?.images?.[0]) {
    const img = data.choices[0].message.images[0];
    if (typeof img === 'string' && img.startsWith('data:')) {
      generatedImage = img;
    }
  }
  
  if (!generatedImage) {
    console.error(`No image found in response (attempt ${attempt}). Full response:`, JSON.stringify(data).substring(0, 500));
    
    // Retry if we haven't exhausted attempts
    if (attempt < MAX_RETRIES) {
      console.log(`Retrying background removal (attempt ${attempt + 1})...`);
      await new Promise(resolve => setTimeout(resolve, 1500)); // Wait 1.5 seconds before retry
      return processBackgroundRemoval(imageUrl, apiKey, addShadow, attempt + 1);
    }
    
    throw new Error('No processed image returned from AI after retries');
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
              text: `Clean up this product image that has had background removal applied.

CRITICAL - DO NOT VIOLATE:
- DO NOT rotate, flip, mirror, or change the orientation
- DO NOT crop, resize, or change aspect ratio or dimensions
- Preserve EXACT original orientation and subject position
- Preserve full sharpness: no blur, no pixelation, no smoothing

CLEANUP REQUIREMENTS:
1. Find and remove ANY remaining background artifacts, stray pixels, or gray/white patches
2. The area inside the hanger opening should be 100% transparent
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
    console.error('Cleanup pass: No image in response:', JSON.stringify(data).substring(0, 500));
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