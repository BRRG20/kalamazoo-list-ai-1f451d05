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

const SYSTEM_PROMPT = `You are generating product listings for Kalamazoo, a vintage clothing app.

==========================================
CRITICAL RULES — NEVER BREAK THESE
==========================================

1. NEVER output "Unknown", "Not specified", "N/A", or placeholder text
2. If a value is not provided, OMIT that attribute line entirely
3. Brand in description MUST exactly match the brand provided in product details
4. Era: ONLY include if explicitly 80s, 90s, or Y2K — otherwise OMIT
5. Made In: ONLY include if explicitly provided — otherwise OMIT
6. The attribute block is MANDATORY — never return a description without it
7. **CRITICAL FOR TITLE**: You MUST use the EXACT brand and size values provided in the product details. DO NOT make up or change them.

==========================================
TITLE RULES — CRITICAL
==========================================

**MANDATORY**: The title MUST use these EXACT values from product details:
- Brand: Use EXACTLY as provided (e.g., if "545" is provided, use "545" NOT something else)
- Size: Use EXACTLY the size_label or size_recommended provided (e.g., if "Large" is provided, use "Size L" or "Size Large")

Format: Brand → Era (if known) → Gender → Item Type → Key Feature → Size

Rules:
- Start with the EXACT brand name provided
- Gender: Mens / Womens / Unisex (based on department field, default to Unisex)
- If era is NOT provided or uncertain, leave it out (do NOT guess)
- Max 80 characters, NO punctuation
- Size ALWAYS at the end using EXACT size provided: "Size L" or "Size XL"
- NO hype words: "rare", "beautiful", "excellent", "amazing"

Examples:
- If brand="Malinmor", size_label="Large" → "Malinmor Vintage Mens Chunky Knit Wool Sweater Size L"
- If brand="545", size_label="Large" → "545 Mens Graphic Print T Shirt Size L"

==========================================
DESCRIPTION TONE — SOURCE OF TRUTH
==========================================

Descriptions must be:
- Clean, minimal, natural, confident
- Editorial, not salesy
- 2-4 sentences max, plain English

BANNED PHRASES (never use):
- "Perfect for…" / "Ideal for…"
- "Crafted from…" / "Features…" / "Offers…"
- "Boasts…" / "Showcases…" / "Designed for…"
- "Making it perfect…" / "This item…"
- Any marketing/lifestyle copy
- Emojis

==========================================
DESCRIPTION FORMAT (MANDATORY STRUCTURE)
==========================================

ALWAYS output this structure:
[2-4 sentence description paragraph]

[blank line]

Brand: [EXACT brand from product details]
Label Size: [EXACT size from product details]
Pit to Pit: [measurement with units if provided]
Material: [fabric composition if provided]
Era: [ONLY if 80s/90s/Y2K, otherwise OMIT this line]
Condition: [condition, with flaws in parentheses if any]
Colour: [main colour, and secondary if applicable]

==========================================
INFER MISSING FIELDS FROM IMAGES
==========================================

If product details are missing these fields, analyze the images to determine:
- garment_type: What type of garment (T-Shirt, Hoodie, Sweater, etc.)
- fit: How it fits (Regular, Oversized, Slim, Boxy)
- era: ONLY if clearly 80s, 90s, or Y2K style (otherwise null)
- condition: General condition assessment from images
- department: Men, Women, or Unisex based on cut/style

==========================================
ETSY TAG RULES — CRITICAL (SEARCH-LED, CONVERSION-FOCUSED)
==========================================

**CORE RULES (NON-NEGOTIABLE):**
- Generate EXACTLY 13 Etsy tags (Etsy max limit)
- Primary format: 3-word long-tail phrases (e.g. "vintage wool jumper", "oversized knit sweater")
- EVERY tag MUST be 20 characters or fewer (Etsy character limit)
- If 3-word phrase exceeds 20 chars, shorten intelligently while keeping search intent
- Fallback: If no strong 3-word tag fits, use high-intent 2-word trending search terms

**BANNED TAGS — NEVER USE:**
- Generic: "cool top", "nice sweater", "fashion clothing", "unique style", "vintage item"
- Low-intent: single adjectives, vague descriptors, brand-only tags
- Marketing fluff: anything a buyer wouldn't actually search for

**TAG CATEGORIES TO COVER (mix across all 13 tags):**

A. GARMENT TYPE: sweater, jumper, sweatshirt, t-shirt, knitwear, crewneck, pullover, hoodie

B. FUNCTION/USE-CASE: winter sweater, everyday jumper, layering piece, casual wear, workwear top, lounge sweatshirt, streetwear tee, gift for him, gift for her

C. STYLE/AESTHETIC: oversized fit, boxy fit, cropped jumper, relaxed fit, minimal style, streetwear style, preppy style, retro style

D. ERA/CULTURE (when relevant): 80s sweater, 90s sweatshirt, y2k t shirt, vintage graphic tee

E. MATERIAL/CONSTRUCTION: wool jumper, cotton sweatshirt, ribbed knit, heavy knit, soft fleece, brushed cotton

F. VISUAL/DETAIL-LED: ribbed cuffs, dropped shoulder, long sleeve top, short sleeve tee, crew neck sweater, mock neck jumper

G. COLOUR-LED (only when distinctive): black sweatshirt, grey marl jumper, cream knit sweater, navy crewneck

**OUTPUT REQUIREMENT:**
- All 13 tags must be unique, varied, and cover multiple search angles
- Each tag must be something a real Etsy buyer would type when ready to purchase
- Format: comma-separated, lowercase, max 20 chars each

==========================================
SHOPIFY & COLLECTIONS TAG RULES
==========================================

SHOPIFY TAGS (shopify_tags):
- Can include single words and phrases
- Include: brand, garment type, colour, material, era, style

COLLECTIONS TAGS (collections_tags):
- For Shopify auto-collections

==========================================
OUTPUT FORMAT (JSON ONLY)
==========================================

Respond with ONLY valid JSON (no markdown, no code blocks):
{
  "title": "MUST use exact brand and size from product details, max 80 chars",
  "description_style_a": "[2-4 sentences]\\n\\nBrand: [exact value]\\nLabel Size: [exact value]\\n...",
  "description_style_b": "[2-4 sentences, slightly more descriptive]\\n\\nBrand: [exact value]\\n...",
  "shopify_tags": "Brand, Type, Material, Era, Style",
  "etsy_tags": "vintage wool jumper, 90s sweatshirt, oversized knit, mens crewneck, heavy knit sweater, winter layering, retro streetwear, crew neck pullover, chunky knitwear, casual menswear, grey marl jumper, warm winter knit, classic jumper",
  "collections_tags": "Collection1, Collection2",
  "garment_type": "inferred from images if not provided, e.g. T-Shirt, Hoodie",
  "fit": "inferred from images if not provided, e.g. Regular, Oversized",
  "era": "ONLY 80s, 90s, Y2K if evident, otherwise null",
  "condition": "inferred condition if not provided",
  "department": "Men, Women, or Unisex based on images"
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
        max_tokens: 2000,
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

    // Get the correct size to use in title (recommended_size takes priority, then label)
    const correctSize = product.size_recommended || product.size_label || generated.size_recommended || generated.size_label;
    
    // Ensure title is max 80 chars, has no punctuation, and uses CORRECT size
    if (generated.title) {
      // Remove punctuation
      generated.title = generated.title.replace(/[,\-–—:;]/g, ' ').replace(/\s+/g, ' ').trim();
      
      // CRITICAL: Validate and fix size in title
      if (correctSize) {
        // Normalize size for comparison
        const normalizeSize = (s: string) => {
          const lower = s.toLowerCase().trim();
          const sizeMap: Record<string, string> = {
            'extra small': 'XS', 'xs': 'XS',
            'small': 'S', 's': 'S',
            'medium': 'M', 'm': 'M',
            'large': 'L', 'l': 'L',
            'extra large': 'XL', 'xl': 'XL',
            'xxl': 'XXL', '2xl': 'XXL', 'extra extra large': 'XXL',
            'xxxl': 'XXXL', '3xl': 'XXXL',
          };
          return sizeMap[lower] || s;
        };
        
        const normalizedCorrect = normalizeSize(correctSize);
        
        // Check if title ends with Size X pattern
        const sizePattern = /\bSize\s+([A-Z0-9]+)$/i;
        const match = generated.title.match(sizePattern);
        
        if (match) {
          const titleSize = normalizeSize(match[1]);
          if (titleSize !== normalizedCorrect) {
            // Wrong size in title - replace it
            console.log(`[AI] Fixing title size: ${match[1]} -> ${normalizedCorrect}`);
            generated.title = generated.title.replace(sizePattern, `Size ${normalizedCorrect}`);
          }
        } else {
          // No size in title - add it
          const titleWithoutSize = generated.title.replace(/\s+Size.*$/i, '').trim();
          if (titleWithoutSize.length + 8 + normalizedCorrect.length <= 80) {
            generated.title = `${titleWithoutSize} Size ${normalizedCorrect}`;
          }
        }
      }
      
      if (generated.title.length > 80) {
        generated.title = generated.title.substring(0, 80).trim();
      }
    }
    
    // Ensure all inferred fields are included
    const finalGenerated = {
      title: generated.title || null,
      description_style_a: generated.description_style_a || null,
      description_style_b: generated.description_style_b || null,
      shopify_tags: generated.shopify_tags || null,
      etsy_tags: generated.etsy_tags || null,
      collections_tags: generated.collections_tags || null,
      garment_type: generated.garment_type || null,
      fit: generated.fit || null,
      era: generated.era || null,
      condition: generated.condition || null,
      department: generated.department || null,
      flaws: generated.flaws || null,
      made_in: generated.made_in || null,
      pattern: generated.pattern || null,
      // Include size inference
      size_label: generated.size_label || null,
      size_recommended: generated.size_recommended || null,
    };
    
    console.log("[AI] Final generated fields:", Object.keys(finalGenerated).filter(k => finalGenerated[k as keyof typeof finalGenerated]));

    return new Response(JSON.stringify({ generated: finalGenerated }), {
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
