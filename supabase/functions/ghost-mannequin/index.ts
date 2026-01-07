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
              text: `Edit this clothing photo to remove the hanger and fill in the gap naturally.

STYLE REQUIREMENTS - MATCH THE ORIGINAL:
- Keep the EXACT same image quality, tone, and aesthetic - do NOT enhance, sharpen, or add gloss
- Match the original lighting conditions precisely - if it's soft/matte, keep it soft/matte
- Preserve the natural, authentic look of the photo - avoid any artificial or over-processed appearance
- The result should look like it was photographed without a hanger, not digitally altered

HANGER REMOVAL:
- Remove the hanger completely
- Fill in the neckline/collar area with fabric that matches the surrounding garment exactly
- The infill must have the same texture, weave, color saturation, and wear/fading as the rest of the item
- Create a natural collar shape as if worn on an invisible form

CRITICAL - DO NOT ALTER TEXT OR GRAPHICS:
- Any text on labels, tags, or prints MUST remain exactly as shown - do NOT regenerate or modify any lettering
- Logos, brand names, care labels - preserve them EXACTLY, character for character
- If a label is cracked or folded, leave it as-is rather than creating gibberish text
- Graphics, prints, and patterns must be preserved pixel-perfectly - do NOT redraw or approximate them

FABRIC & TEXTURE:
- Match the exact fabric texture and appearance in infilled areas
- If the garment looks worn, faded, or has natural imperfections, the infill should match that character
- Continue patterns (stripes, checks) naturally but do NOT modify existing pattern areas

PRESERVE:
- Original image resolution and quality
- Natural shadows and lighting
- All garment details: buttons, zippers, pockets, stitching
- The authentic, natural feel of the photo

Output the edited image with hanger removed and natural infill only.`
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
