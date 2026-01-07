import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  imageUrl: string;
}

const MAX_RETRIES = 2;

async function processGhostMannequin(
  imageUrl: string, 
  apiKey: string,
  attempt: number = 1
): Promise<string> {
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
              text: `Transform this clothing product photo into a professional ghost mannequin / invisible mannequin style image.

CRITICAL REQUIREMENTS:

1. HANGER REMOVAL & INFILL:
   - Completely remove the hanger (plastic, wooden, or metal) from the image
   - Intelligently infill the neckline/collar area where the hanger was
   - The infill MUST seamlessly match the garment's fabric texture, color, pattern, and lighting
   - Create a natural collar/neckline shape as if the garment is worn on an invisible form
   - The neck opening should look natural and complete, not cut off or unfinished

2. FABRIC CONTINUITY:
   - Match the exact fabric texture, weave pattern, and material appearance in all infilled areas
   - Ensure color consistency - the infill should blend perfectly with the surrounding fabric
   - If the garment has patterns (stripes, checks, prints), continue them naturally in infilled areas

3. STRUCTURAL REPAIRS:
   - Fix any cracked, folded, or partially visible labels - make them look clean and complete
   - If a hood is visible but partially hidden or folded awkwardly, complete it naturally
   - Repair any missing back portions that should be visible (like the back of hoods)
   - Ensure collar stays, ribbing, and trim details are complete and natural-looking

4. PROFESSIONAL FINISH:
   - The final image should look like a high-end e-commerce product photo
   - Maintain the exact same lighting, shadows, and overall mood
   - Keep the transparent/white background as-is
   - The garment should appear to float naturally as if on an invisible mannequin form

5. PRESERVE EVERYTHING ELSE:
   - Do NOT alter the garment's overall shape, fit, or drape
   - Keep all original details: buttons, zippers, pockets, logos, prints exactly as they are
   - Only remove the hanger and fill in where needed

Output the transformed ghost mannequin image with seamless infill and no visible hanger.`
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
  console.log(`Ghost mannequin response structure (attempt ${attempt}):`, JSON.stringify({
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
      console.log(`Retrying ghost mannequin (attempt ${attempt + 1})...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return processGhostMannequin(imageUrl, apiKey, attempt + 1);
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

    const { imageUrl }: RequestBody = await req.json();
    
    if (!imageUrl) {
      throw new Error('imageUrl is required');
    }

    console.log('Processing ghost mannequin:', imageUrl.substring(0, 50) + '...');

    const processedImage = await processGhostMannequin(imageUrl, LOVABLE_API_KEY);
    console.log('Ghost mannequin processing complete');

    return new Response(JSON.stringify({ 
      processedImageUrl: processedImage,
      success: true 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ghost-mannequin function:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Ghost mannequin processing failed';
    
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
