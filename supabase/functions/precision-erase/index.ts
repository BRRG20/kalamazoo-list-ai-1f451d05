import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  imageUrl: string;
  maskDataUrl: string; // Base64 mask image where white = areas to erase
  intensity: number; // 1-100 scale
  mode: 'erase' | 'smooth'; // Erase removes objects, smooth reduces wrinkles/creases
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

    const { imageUrl, maskDataUrl, intensity, mode }: RequestBody = await req.json();
    
    if (!imageUrl) {
      throw new Error('imageUrl is required');
    }
    if (!maskDataUrl) {
      throw new Error('maskDataUrl is required');
    }

    console.log('Processing precision erase:', { 
      mode,
      intensity,
      imageUrlPrefix: imageUrl.substring(0, 50) + '...',
    });

    const intensityDescription = intensity > 75 
      ? 'completely' 
      : intensity > 50 
        ? 'significantly' 
        : intensity > 25 
          ? 'moderately' 
          : 'subtly';

    const modeInstructions = mode === 'erase' 
      ? `Remove/erase the marked areas ${intensityDescription}. This could include stains, marks, dirt, unwanted graphics, small objects, or any visual imperfections.`
      : `Smooth/reduce creases, wrinkles, and fabric distortions in the marked areas ${intensityDescription}. Reduce harsh folds while maintaining natural fabric drape.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
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
                text: `You are a professional photo retoucher. I have a clothing product photo and a mask showing areas to edit.

TASK: ${modeInstructions}

CRITICAL RULES - MUST FOLLOW:
1. ❌ DO NOT create white patches, transparent gaps, holes, or flat color fills
2. ❌ DO NOT blur the entire image - only work on marked areas
3. ❌ DO NOT change the model pose, lighting, color tone, garment shape, or overall vibe
4. ❌ DO NOT alter any unmarked areas - they must remain pixel-perfect
5. ✅ Reconstruct removed areas using surrounding context: fabric texture, weave pattern, lighting, grain, shadows
6. ✅ Match the exact fabric type (cotton, denim, knit, fleece, jersey, etc.)
7. ✅ Preserve stitching, seams, natural folds, and drape in the reconstructed area
8. ✅ Blend seamlessly so edits are completely undetectable
9. ✅ Maintain photo-realistic quality suitable for commercial e-commerce

The white areas in the mask indicate where to apply the edit. Black areas must remain untouched.

Output the edited image maintaining original dimensions and quality.`
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl }
              },
              {
                type: 'image_url',
                image_url: { url: maskDataUrl }
              }
            ]
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.', success: false }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.', success: false }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI processing failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log('AI response structure:', JSON.stringify({
      hasChoices: !!data.choices,
      choicesLength: data.choices?.length,
      hasImages: !!data.choices?.[0]?.message?.images,
      imagesLength: data.choices?.[0]?.message?.images?.length,
    }));

    // Extract generated image from response
    let processedImage = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    if (!processedImage && data.choices?.[0]?.message?.images?.[0]?.url) {
      processedImage = data.choices[0].message.images[0].url;
    }
    
    if (!processedImage && data.choices?.[0]?.message?.images?.[0]) {
      const img = data.choices[0].message.images[0];
      if (typeof img === 'string' && img.startsWith('data:')) {
        processedImage = img;
      }
    }

    if (!processedImage) {
      console.error('No image in response:', JSON.stringify(data).substring(0, 500));
      throw new Error('No processed image returned from AI');
    }

    return new Response(JSON.stringify({ 
      processedImageUrl: processedImage,
      success: true 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in precision-erase function:', error);
    
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Precision erase failed',
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
