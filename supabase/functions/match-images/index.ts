import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_IMAGES = 200;
const BATCH_SIZE = 20; // Process images in batches

const SYSTEM_PROMPT = `You are an image similarity expert. Analyze these product images and group them by visual similarity.

Images that belong together typically:
- Show the same garment from different angles
- Have the same colors, patterns, and style
- Show similar labels or tags
- Are clearly the same product photographed multiple times

CRITICAL RULES:
1. Each image should only belong to ONE group
2. Group numbers should start from 1 and be sequential
3. Similar-looking but DIFFERENT products should be in DIFFERENT groups
4. Look for subtle differences in color, pattern, or style to distinguish items
5. Label/tag photos should be grouped with the main product they belong to

Return ONLY a JSON array where each element contains:
- imageIndex: the 0-based index of the image in the input array
- groupNumber: which product group this image belongs to (1, 2, 3, etc.)

Example response:
[
  {"imageIndex": 0, "groupNumber": 1},
  {"imageIndex": 1, "groupNumber": 1},
  {"imageIndex": 2, "groupNumber": 2},
  {"imageIndex": 3, "groupNumber": 2}
]`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrls, imagesPerGroup } = await req.json();
    
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return new Response(JSON.stringify({ error: "imageUrls array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (imageUrls.length > MAX_IMAGES) {
      return new Response(JSON.stringify({ error: `Maximum ${MAX_IMAGES} images allowed` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // For smaller batches, process all at once
    if (imageUrls.length <= BATCH_SIZE) {
      const groups = await analyzeImageBatch(imageUrls, LOVABLE_API_KEY, 0, imagesPerGroup);
      return new Response(JSON.stringify({ groups }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For larger sets, process in batches and merge results
    const allGroups: { imageUrl: string; groupNumber: number }[] = [];
    let currentGroupOffset = 0;

    for (let i = 0; i < imageUrls.length; i += BATCH_SIZE) {
      const batchUrls = imageUrls.slice(i, i + BATCH_SIZE);
      const batchResult = await analyzeImageBatch(batchUrls, LOVABLE_API_KEY, i, imagesPerGroup);
      
      // Offset group numbers to avoid conflicts between batches
      const maxGroupInBatch = Math.max(...batchResult.map((r: any) => r.groupNumber), 0);
      
      for (const item of batchResult) {
        allGroups.push({
          imageUrl: item.imageUrl,
          groupNumber: item.groupNumber + currentGroupOffset
        });
      }
      
      currentGroupOffset += maxGroupInBatch;
    }

    return new Response(JSON.stringify({ groups: allGroups }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in match-images:", error);
    const message = error instanceof Error ? error.message : "Matching failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function analyzeImageBatch(
  imageUrls: string[], 
  apiKey: string, 
  startIndex: number,
  imagesPerGroup?: number
): Promise<{ imageUrl: string; groupNumber: number }[]> {
  // Build content with images
  const content: any[] = [
    { 
      type: "text", 
      text: `Analyze these ${imageUrls.length} product images and group them by visual similarity. 
${imagesPerGroup ? `Hint: products typically have around ${imagesPerGroup} images each, but use your judgment based on visual similarity.` : ''}
Group images that show the SAME product together. Different products should be in different groups.
Return a JSON array with imageIndex and groupNumber for each image.` 
    }
  ];

  for (let i = 0; i < imageUrls.length; i++) {
    content.push({
      type: "image_url",
      image_url: { url: imageUrls[i] }
    });
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content }
      ],
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Rate limit exceeded. Please try again in a moment.");
    }
    if (response.status === 402) {
      throw new Error("AI credits exhausted. Please add more credits.");
    }
    const errorText = await response.text();
    console.error("AI gateway error:", response.status, errorText);
    throw new Error("AI matching failed");
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content || "";
  
  // Extract JSON from response
  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("Could not parse AI response");
    }
  }

  // Map back to URLs
  return parsed.map((item: { imageIndex: number; groupNumber: number }) => ({
    imageUrl: imageUrls[item.imageIndex],
    groupNumber: item.groupNumber
  }));
}
