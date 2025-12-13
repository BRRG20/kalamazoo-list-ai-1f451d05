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
    pit_to_pit: sanitizeString(p.pit_to_pit),
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

const SYSTEM_PROMPT = `You are generating product descriptions for Kalamazoo, a vintage clothing app.

==========================================
DESCRIPTION TONE — SOURCE OF TRUTH (DO NOT DEVIATE)
==========================================

Descriptions must be:
- Minimal
- Editorial
- Confident
- Neutral
- Human
- Premium vintage-store tone

Do NOT use:
- Marketing language
- Sales phrases
- Lifestyle copy
- "Perfect for…"
- "Ideal for…"
- "Crafted from…"
- "Features…"
- "Offers…"
- "Boasts…"
- "Showcases…"
- "Designed for…"
- "Making it perfect…"
- "This item…"
- Emojis
- Over-explaining
- Repetition of attributes listed below

==========================================
DESCRIPTION FORMAT (ALWAYS THIS EXACT STRUCTURE)
==========================================

Write 1–2 short sentences ONLY describing what the item is and what makes it distinct.
Stop immediately after those sentences.
Then show a clean attribute list.

If any information is unknown, OMIT IT ENTIRELY.
NEVER write "Unknown".

FORMAT:
[1-2 sentence description paragraph]

Brand:
Label Size:
Measurements:
Material:
Era:
Condition:
Colour:

Do NOT add extra sections. Do NOT repeat information from attributes in the description.

==========================================
CORRECT EXAMPLES (MATCH THIS EXACT STYLE)
==========================================

EXAMPLE 1:
Vintage Malinmor chunky knit sweater, made in the Republic of Ireland from pure new wool. Ribbed crew neckline with cream stripe detailing across the chest and shoulders.

Brand: Malinmor
Label Size: Large
Measurements: Pit to pit approx. 21"
Material: 100% Pure New Wool
Era: Vintage
Condition: Very good
Colour: Dark grey with cream stripes

EXAMPLE 2:
Vintage 90s Ralph Lauren wool turtleneck sweater in a multicoloured geometric knit. Heavyweight, warm, and well-made with a relaxed vintage fit.

Brand: Ralph Lauren
Label Size: Medium
Measurements: Pit to pit 22"
Material: 100% Pure New Wool
Era: 1990s
Condition: Very good
Colour: Multicolour

==========================================
TITLE FORMAT (Etsy-Optimised, Max 80 chars)
==========================================

Brand/Franchise → Era (if known) → Gender → Item Type → Key Feature → Size

Rules:
- Start with brand name or recognisable franchise
- If era unknown, leave it out (do NOT guess)
- Max 80 characters, NO punctuation (no commas, hyphens, dashes)
- Gender: Mens / Womens / Unisex (only if obvious)
- Size ALWAYS at the end: "Size L" or "W32 L30"
- NO hype words: "rare", "beautiful", "excellent", "amazing"

Examples:
- "Malinmor Vintage Mens Chunky Knit Wool Sweater Size L"
- "Ralph Lauren 90s Mens Wool Turtleneck Geometric Knit Size M"

==========================================
ERA & CONDITION RULES
==========================================

ERA: Only 80s, 90s, Y2K, or "Vintage" if older. If uncertain → LEAVE BLANK.
CONDITION: Use "Excellent", "Very good", "Good", "Fair".
If flaws exist, add in parentheses: "Very good (small mark on sleeve)"
NEVER invent flaws.

==========================================
FINAL RULE
==========================================

If the generated description does not match the CORRECT EXAMPLES tone exactly, regenerate it before returning.
The tone must be minimal, editorial, confident, neutral, human. No marketing language whatsoever.

==========================================
OUTPUT FORMAT
==========================================

Respond ONLY with valid JSON (no markdown, no code blocks):
{
  "title": "max 80 chars, no punctuation, brand first",
  "description_style_a": "1-2 sentences + attribute block (minimal)",
  "description_style_b": "1-2 sentences + attribute block (slightly more descriptive)",
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

    // Build context from product fields - only include fields with values
    const contextLines: string[] = ["Product Details:"];
    
    if (product.brand) contextLines.push(`- Brand: ${product.brand}`);
    if (product.garment_type) contextLines.push(`- Garment Type: ${product.garment_type}`);
    if (product.department) contextLines.push(`- Department: ${product.department} (use Mens/Womens/Unisex in title)`);
    if (product.colour_main) contextLines.push(`- Colour Main: ${product.colour_main}`);
    if (product.colour_secondary) contextLines.push(`- Colour Secondary: ${product.colour_secondary}`);
    if (product.pattern) contextLines.push(`- Pattern/Style: ${product.pattern}`);
    if (product.size_label) contextLines.push(`- Size Label: ${product.size_label}`);
    if (product.pit_to_pit) contextLines.push(`- Pit to Pit: ${product.pit_to_pit}`);
    if (product.size_recommended) contextLines.push(`- Size Recommended: ${product.size_recommended}`);
    if (product.material) contextLines.push(`- Material: ${product.material}`);
    if (product.era) contextLines.push(`- Era: ${product.era} (ONLY include if 80s, 90s, or Y2K)`);
    if (product.condition) contextLines.push(`- Condition: ${product.condition}`);
    if (product.flaws) contextLines.push(`- Flaws: ${product.flaws}`);
    if (product.fit) contextLines.push(`- Fit: ${product.fit}`);
    if (product.made_in) contextLines.push(`- Made In: ${product.made_in}`);
    if (product.raw_input_text) contextLines.push(`- Additional Notes: ${product.raw_input_text}`);
    
    const productContext = contextLines.join('\n');

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
