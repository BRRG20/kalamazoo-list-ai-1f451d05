import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Input validation
const MAX_STRING_LENGTH = 1000;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_IMAGE_URLS = 4;
const MAX_URL_LENGTH = 2048;
const URL_PATTERN = /^https?:\/\/.+/i;

function sanitizeString(value: unknown, maxLength = MAX_STRING_LENGTH): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  return value.slice(0, maxLength).trim() || null;
}

function sanitizeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(num) || num < 0 || num > 1000000) return null;
  return num;
}

function validateProduct(product: unknown): { valid: boolean; error?: string; sanitized?: Record<string, unknown> } {
  if (!product || typeof product !== 'object') {
    return { valid: false, error: 'Product object is required' };
  }
  const p = product as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {
    garment_type: sanitizeString(p.garment_type),
    brand: sanitizeString(p.brand),
    colour_main: sanitizeString(p.colour_main),
    colour_secondary: sanitizeString(p.colour_secondary),
    pattern: sanitizeString(p.pattern),
    size_label: sanitizeString(p.size_label),
    size_recommended: sanitizeString(p.size_recommended),
    fit: sanitizeString(p.fit),
    material: sanitizeString(p.material),
    made_in: sanitizeString(p.made_in),
    era: sanitizeString(p.era, 50),
    condition: sanitizeString(p.condition, 100),
    flaws: sanitizeString(p.flaws),
    department: sanitizeString(p.department, 50),
    raw_input_text: sanitizeString(p.raw_input_text, MAX_DESCRIPTION_LENGTH),
    price: sanitizeNumber(p.price),
  };
  return { valid: true, sanitized };
}

function validateImageUrls(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  return urls
    .filter((url): url is string => 
      typeof url === 'string' && URL_PATTERN.test(url) && url.length <= MAX_URL_LENGTH
    )
    .slice(0, MAX_IMAGE_URLS);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a vintage clothing listing expert. Generate SEO-optimized product titles and descriptions for Etsy and resale platforms.

==========================================
VISUAL VOCABULARY (USE FULL RANGE)
==========================================

You are not limited to predefined terms. Use your full visual understanding while staying accurate to clothing.

When describing graphics or patterns, use terms such as (but not limited to):
abstract graphic, geometric print, retro graphic, minimalist graphic, anime/manga character, portrait graphic, logo print, colour-block design, stripe pattern, distressed texture, chunky knit, ribbed knit, heavyweight cotton, stonewash, oversized fit, boxy fit, clean aesthetic, muted tones, vibrant tones, monochrome palette, embroidered patch, graffiti-style print, line-art graphic, etc.

Generate new descriptive terms when needed based on the product details.

==========================================
SEO RULES (MANDATORY)
==========================================

Optimize the title and description with strong SEO keywords relevant to the item:
"vintage", "retro", "graphic sweatshirt", "90s style", "anime hoodie", "oversized fit", "streetwear", "unisex", "Y2K aesthetic", "crew neck sweater", etc.

RULES:
- Only add keywords that genuinely match the item
- Do NOT keyword stuff — blend keywords naturally into clean sentences
- Use brand/franchise names as SEO anchors in both title and description

==========================================
TITLE FORMAT (SEO-Optimized, CRITICAL)
==========================================

Generate titles in this EXACT order:
**Brand/Franchise → Era (only if known: 80s, 90s, Y2K) → Gender → Item Type → Key Features/Graphic → Size**

ALWAYS start with the brand OR recognizable content on the garment:
- Pop culture: Naruto, Tupac, Beyoncé, The Beatles, Nirvana, etc.
- Sports teams: Lakers, Bulls, Manchester United, etc.
- Anime/Manga: Dragon Ball Z, One Piece, Sailor Moon, etc.
- Movies/TV: Star Wars, Marvel, Disney, Simpsons, etc.
- Brands: Nike, Harley-Davidson, Champion, Carhartt, etc.

Examples:
- "Naruto Shippuden Vintage Mens Black Anime Graphic T Shirt Size L"
- "Tupac 90s Mens Black Streetwear T Shirt Juice Era Graphic Size XL"
- "Nike Vintage 90s Womens Grey Oversized Hoodie Embroidered Swoosh Size M"
- "Harley Davidson Retro Mens Black Leather Biker Jacket Eagle Back Size L"

RULES:
- Max 80 characters, NO punctuation (no commas, hyphens, dashes)
- If pop culture/franchise is visible, it MUST appear first
- Include SEO keywords naturally: "Vintage", "Retro", "Streetwear", "Oversized", etc.
- Gender: Mens / Womens / Unisex (only if obvious, else Unisex)
- Era ONLY if clearly 80s, 90s, or Y2K - otherwise OMIT entirely
- Size ALWAYS at the end: "Size L" or "W32 L30"
- NEVER use hype words: "rare", "beautiful", "excellent", "amazing"

==========================================
DESCRIPTION RULES (SEO-Optimized, 2-3 sentences)
==========================================

Start by describing the item and any recognizable pop culture element:
- "Features the iconic Naruto front graphic on this vintage anime tee..."
- "Classic 90s streetwear piece inspired by Tupac's Juice era look..."
- "Retro Nike aesthetic with signature embroidered swoosh..."

Mention key visuals, fabric, fit, and aesthetic using relevant SEO keywords.
Tone: clean, confident, minimal. NO social media language.

Generate TWO styles:

STYLE A — ULTRA MINIMAL SEO (~55–65 words):
Short, clean, factual with SEO keywords. State garment type, colour, key features, construction, fit.

STYLE B — NATURAL MINIMAL SEO (~70–80 words):
Slightly smoother flow with natural SEO integration. Include type, colour, material, features, fit, aesthetic.

BOTH must end with this structured block:

Brand:
Label Size:
Measurements (Pit to Pit):
Condition:
Material:
Style:
Era: (only 80s/90s/Y2K or blank)
Colour:

==========================================
ERA & CONDITION RULES
==========================================

ERA: Only 80s, 90s, or Y2K. If not certain → LEAVE BLANK.
CONDITION: Use "Excellent", "Very good", "Good – light wear", "Good – some fading", "Fair – worn".
If flaws exist, add in parentheses: "Very good (small mark on sleeve)"
NEVER invent flaws.

==========================================
CONFLICT RESOLUTION
==========================================

If information conflicts, correct it using common sense.

==========================================
OUTPUT FORMAT
==========================================

Respond ONLY with valid JSON (no markdown, no code blocks):
{
  "title": "max 80 chars, no punctuation, brand/franchise first, SEO keywords",
  "description_style_a": "ultra minimal SEO ~55-65 words + structured block",
  "description_style_b": "natural minimal SEO ~70-80 words + structured block",
  "shopify_tags": "tag1, tag2, tag3",
  "etsy_tags": "tag1, tag2, tag3",
  "collections_tags": "collection1, collection2"
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { product, imageUrls, regenerateOnly } = await req.json();
    
    // Validate product input
    const validation = validateProduct(product);
    if (!validation.valid) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const sanitizedProduct = validation.sanitized!;
    const validImageUrls = validateImageUrls(imageUrls);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build context from product fields
    const productContext = `
Product Details:
- Brand: ${product.brand || "Unknown"}
- Garment Type: ${product.garment_type || "Unknown"}
- Department: ${product.department || "Unknown"} (use Mens/Womens/Unisex in title)
- Colour Main: ${product.colour_main || "Unknown"}
- Colour Secondary: ${product.colour_secondary || ""}
- Pattern/Style: ${product.pattern || ""}
- Size Label: ${product.size_label || "Unknown"}
- Size Recommended: ${product.size_recommended || ""}
- Material: ${product.material || "Unknown"}
- Era: ${product.era || ""} (ONLY include if 80s, 90s, or Y2K - otherwise leave blank)
- Condition: ${product.condition || "Good"}
- Flaws: ${product.flaws || ""}
- Fit: ${product.fit || ""}
- Made In: ${product.made_in || ""}
- Additional Notes: ${product.raw_input_text || ""}
`;

    // Adjust prompt based on what to regenerate
    let userPrompt = `Generate a vintage clothing listing for this product:\n${productContext}`;
    
    if (regenerateOnly === 'title') {
      userPrompt = `Generate ONLY the title for this product (respond with just the title field in JSON):\n${productContext}`;
    } else if (regenerateOnly === 'style_a') {
      userPrompt = `Generate ONLY Description Style A (ultra minimal) for this product:\n${productContext}`;
    } else if (regenerateOnly === 'style_b') {
      userPrompt = `Generate ONLY Description Style B (natural minimal SEO) for this product:\n${productContext}`;
    }

    const content: any[] = [
      { type: "text", text: userPrompt }
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
    
    console.log("Raw AI response:", rawContent.substring(0, 500));
    
    // Extract JSON from response - handle markdown code blocks
    let generated;
    try {
      generated = JSON.parse(rawContent);
    } catch {
      // Try to extract JSON from markdown code blocks
      let jsonString = rawContent;
      
      // Remove markdown code block markers
      const codeBlockMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonString = codeBlockMatch[1].trim();
      } else {
        // Try to find raw JSON object
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonString = jsonMatch[0];
        }
      }
      
      try {
        generated = JSON.parse(jsonString);
      } catch (parseError) {
        console.error("Failed to parse JSON:", jsonString.substring(0, 300));
        throw new Error("Could not parse AI response");
      }
    }

    // Ensure title is max 80 chars and has no punctuation
    if (generated.title) {
      // Remove punctuation
      generated.title = generated.title.replace(/[,\-–—:;]/g, ' ').replace(/\s+/g, ' ').trim();
      if (generated.title.length > 80) {
        generated.title = generated.title.substring(0, 80).trim();
      }
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