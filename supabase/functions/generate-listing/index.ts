import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a vintage clothing listing expert. Generate product titles, descriptions, and tags for resale platforms.

TITLE RULES (CRITICAL):
- Maximum 80 characters
- Include: garment type, main colour, fabric (if relevant), era (ONLY if 80s/90s/Y2K), size label
- No emojis, no hype words ("beautiful", "gorgeous", "must-have")
- Clean, factual, minimal
- Examples: "90s Red Acrylic Chunky Jumper – Women's L", "Vintage Navy Wool Zip Fleece – XL"

DESCRIPTION STRUCTURE (EXACT ORDER):
First write 2-3 sentences:
- Sentence 1: Garment type, colour, fabric/material
- Sentence 2: Fit, vibe, how it can be worn
- Sentence 3: Optional era context ONLY if era is confirmed

Then add this structured block:

Brand: {brand}
Label Size: {size_label}
Recommended Size: {size_recommended or blank}
Materials: {material}
Era: {era or blank if unknown}
Condition: {condition}
Style: {style}
Made in: {made_in}

TONE: Minimal, confident, stylish. NOT corny, NOT influencer-like, NOT hype.

ERA RULES:
- Only include era if it's confirmed as 80s, 90s, or Y2K
- If era is empty/unknown, do NOT mention it anywhere

SHOPIFY TAGS: 6-15 tags, comma-separated, relevant to garment type, style, era, material
ETSY TAGS: Up to 13 tags, comma-separated, optimized for search
COLLECTIONS TAGS: For Shopify auto-collections (e.g. "Knitwear", "Outerwear", "Denim")

Respond ONLY with valid JSON:
{
  "title": "max 80 chars",
  "description": "full structured description",
  "shopify_tags": "tag1, tag2, tag3",
  "etsy_tags": "tag1, tag2, tag3",
  "collections_tags": "collection1, collection2"
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { product, imageUrls } = await req.json();
    
    if (!product) {
      throw new Error("No product data provided");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build context from product fields
    const productContext = `
Product Details:
- Brand: ${product.brand || "Unknown"}
- Garment Type: ${product.garment_type || "Unknown"}
- Department: ${product.department || "Unknown"}
- Colour Main: ${product.colour_main || "Unknown"}
- Colour Secondary: ${product.colour_secondary || ""}
- Pattern: ${product.pattern || ""}
- Size Label: ${product.size_label || "Unknown"}
- Size Recommended: ${product.size_recommended || ""}
- Material: ${product.material || "Unknown"}
- Era: ${product.era || ""} (ONLY include in listing if 80s, 90s, or Y2K)
- Condition: ${product.condition || "Good"}
- Fit: ${product.fit || ""}
- Made In: ${product.made_in || ""}
- Style: ${product.style || product.pattern || ""}
- Additional Notes: ${product.raw_input_text || ""}
`;

    const content: any[] = [
      { type: "text", text: `Generate a vintage clothing listing for this product:\n${productContext}` }
    ];

    // Add images if provided (up to 2 for context)
    if (imageUrls && Array.isArray(imageUrls)) {
      const imagesToUse = imageUrls.slice(0, 2);
      for (const url of imagesToUse) {
        content.push({
          type: "image_url",
          image_url: { url }
        });
      }
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
      throw new Error("Listing generation failed");
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || "";
    
    // Extract JSON from response
    let generated;
    try {
      generated = JSON.parse(rawContent);
    } catch {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        generated = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not parse AI response");
      }
    }

    // Ensure title is max 80 chars
    if (generated.title && generated.title.length > 80) {
      generated.title = generated.title.substring(0, 77) + "...";
    }

    return new Response(JSON.stringify({ generated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in generate-listing:", error);
    const message = error instanceof Error ? error.message : "Generation failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
