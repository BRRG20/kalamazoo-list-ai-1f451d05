import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a vintage clothing expert analyzing product images for a resale listing app.

STRICT RULES:
1. ERA: Only assign "80s", "90s", or "Y2K" if CLEARLY evident from design, labels, or construction. If uncertain, leave era EMPTY (not "Modern" or any other value).
2. CONDITION: Use values like "Excellent", "Very good", "Good – light wear", "Good – some fading", "Fair – visible wear". NEVER invent flaws you cannot see.
3. Extract ONLY what you can confidently see in the images.
4. For brand, material, made_in - only include if visible on labels/tags.
5. If you cannot determine something, leave it blank/null.

Extract the following from the images:
- brand (from label if visible)
- size_label (from label if visible)
- material (from label if visible, e.g. "100% Cotton", "80% Acrylic 20% Wool")
- made_in (from label if visible, e.g. "Made in Italy")
- garment_type (e.g. "Jumper", "Shirt", "Jacket", "Jeans", "T-Shirt")
- department ("Women", "Men", "Unisex", "Kids" - based on cut/style)
- colour_main (primary color)
- colour_secondary (secondary color if applicable)
- pattern (e.g. "Solid", "Striped", "Graphic", "Abstract", "Fair Isle", "Cable Knit")
- era (ONLY "80s", "90s", "Y2K" OR null if uncertain)
- condition (general assessment from visible wear)
- fit (e.g. "Oversized", "Regular", "Slim", "Relaxed")
- style (e.g. "Chunky Knit", "Minimal", "Graphic", "Workwear", "Preppy")

Respond ONLY with valid JSON in this exact format:
{
  "brand": "string or null",
  "size_label": "string or null",
  "material": "string or null",
  "made_in": "string or null",
  "garment_type": "string or null",
  "department": "Women" | "Men" | "Unisex" | "Kids" | null,
  "colour_main": "string or null",
  "colour_secondary": "string or null",
  "pattern": "string or null",
  "era": "80s" | "90s" | "Y2K" | null,
  "condition": "string or null",
  "fit": "string or null",
  "style": "string or null"
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrls } = await req.json();
    
    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      throw new Error("No image URLs provided");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build content array with images
    const content: any[] = [
      { type: "text", text: "Analyze these vintage clothing images and extract product details. Be conservative with era - only assign 80s/90s/Y2K if clearly evident." }
    ];

    // Add up to 4 images for analysis
    const imagesToAnalyze = imageUrls.slice(0, 4);
    for (const url of imagesToAnalyze) {
      content.push({
        type: "image_url",
        image_url: { url }
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
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
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add more credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI analysis failed");
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || "";
    
    // Extract JSON from response
    let extracted;
    try {
      // Try to parse directly first
      extracted = JSON.parse(rawContent);
    } catch {
      // Try to find JSON in the response
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not parse AI response");
      }
    }

    return new Response(JSON.stringify({ extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in analyze-images:", error);
    const message = error instanceof Error ? error.message : "Analysis failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
