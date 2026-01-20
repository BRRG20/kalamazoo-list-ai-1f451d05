import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { verifyAuth, unauthorizedResponse, corsHeaders } from "../_shared/auth.ts";

// Input validation
const MAX_IMAGE_URLS = 4;
const MAX_URL_LENGTH = 2048;
const URL_PATTERN = /^https?:\/\/.+/i;

function validateImageUrls(imageUrls: unknown): { valid: boolean; error?: string; urls?: string[] } {
  if (!Array.isArray(imageUrls)) {
    return { valid: false, error: 'imageUrls must be an array' };
  }
  if (imageUrls.length === 0) {
    return { valid: false, error: 'At least one image URL is required' };
  }
  if (imageUrls.length > MAX_IMAGE_URLS) {
    return { valid: false, error: `Maximum ${MAX_IMAGE_URLS} image URLs allowed` };
  }
  const validUrls: string[] = [];
  for (const url of imageUrls) {
    if (typeof url !== 'string') {
      return { valid: false, error: 'All image URLs must be strings' };
    }
    if (!URL_PATTERN.test(url)) {
      return { valid: false, error: `Invalid URL format` };
    }
    if (url.length > MAX_URL_LENGTH) {
      return { valid: false, error: `URL exceeds maximum length of ${MAX_URL_LENGTH} characters` };
    }
    validUrls.push(url);
  }
  return { valid: true, urls: validUrls };
}

const SYSTEM_PROMPT = `You are a vintage clothing expert analyzing product images for a resale listing app.

==========================================
VISUAL ANALYSIS (USE FULL VOCABULARY)
==========================================

You are not limited to predefined terms. Use your full visual understanding while staying accurate to clothing.

When describing graphics or patterns, use terms such as (but not limited to):
abstract graphic, geometric print, retro graphic, minimalist graphic, anime/manga character, portrait graphic, logo print, colour-block design, stripe pattern, distressed texture, chunky knit, ribbed knit, heavyweight cotton, stonewash, oversized fit, boxy fit, clean aesthetic, muted tones, vibrant tones, monochrome palette, embroidered patch, graffiti-style print, line-art graphic, etc.

Generate new descriptive terms when needed based on what you see.

==========================================
POP CULTURE & BRAND DETECTION (CRITICAL)
==========================================

ALWAYS detect and include recognizable content:
- Music artists: Tupac, Beyoncé, Nirvana, Metallica, The Beatles, etc.
- Anime/Manga: Naruto, Dragon Ball Z, One Piece, Sailor Moon, etc.
- Movies/TV: Star Wars, Marvel, DC, Disney, Simpsons, etc.
- Sports teams: NBA, NFL, MLB, Premier League teams, etc.
- Gaming: PlayStation, Nintendo, Pokémon, etc.
- Brands: Nike, Harley-Davidson, Carhartt, Champion, etc.
- Characters: Mickey Mouse, Bart Simpson, SpongeBob, etc.

If ANY recognizable pop culture, celebrity, character, sports team, anime, comic, or music icon is visible on the garment, you MUST include it in the brand field or pop_culture field.

==========================================
STRICT EXTRACTION RULES
==========================================

1. BRAND: Extract visible brand OR recognizable franchise/character/artist on the garment.
2. ERA: Only assign "80s", "90s", or "Y2K" if CLEARLY evident. If uncertain, leave BLANK/null.
3. CONDITION: Use "Excellent", "Very good", "Good – light wear", "Good – some fading", "Fair – visible wear". NEVER invent flaws.
4. DEPARTMENT: Only set Men/Women if clearly evident from cut/style. Default to "Unisex" if unclear.
5. For material, made_in - only include if visible on labels/tags.
6. If you cannot determine something, leave it blank/null.

Extract:
- brand (from label OR recognizable content like Naruto, Nike, Tupac, etc.)
- size_label (from label if visible)
- material (from label if visible)
- made_in (from label if visible)
- garment_type (e.g. "T-Shirt", "Hoodie", "Jacket", "Jeans", "Sweatshirt", "Crew Neck Sweater")
- department ("Men", "Women", "Unisex", "Kids" - default to Unisex if unclear)
- colour_main (primary color)
- colour_secondary (secondary color if applicable)
- pattern (e.g. "Graphic", "Solid", "Striped", "Abstract", "Logo Print", "Geometric Print", "Portrait Graphic")
- era (ONLY "80s", "90s", "Y2K" OR null if uncertain)
- condition (general assessment)
- fit (e.g. "Oversized", "Regular", "Slim", "Boxy")
- style (e.g. "Graphic Tee", "Band Tee", "Anime", "Sports", "Streetwear", "Vintage", "Retro")
- pop_culture (any recognizable character, artist, show, team detected - for title use)
- visual_style (describe the graphic/pattern style: "abstract graphic", "line-art", "minimalist", "graffiti-style", etc.)

Respond ONLY with valid JSON:
{
  "brand": "string or null",
  "size_label": "string or null",
  "material": "string or null",
  "made_in": "string or null",
  "garment_type": "string or null",
  "department": "Men" | "Women" | "Unisex" | "Kids" | null,
  "colour_main": "string or null",
  "colour_secondary": "string or null",
  "pattern": "string or null",
  "era": "80s" | "90s" | "Y2K" | null,
  "condition": "string or null",
  "fit": "string or null",
  "style": "string or null",
  "pop_culture": "string or null",
  "visual_style": "string or null"
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication before processing
    const authResult = await verifyAuth(req);
    if (!authResult.authenticated) {
      return unauthorizedResponse(authResult.error);
    }

    const { imageUrls } = await req.json();
    
    // Validate inputs
    const validation = validateImageUrls(imageUrls);
    if (!validation.valid) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build content array with images
    const content: any[] = [
      { type: "text", text: "Analyze these vintage clothing images and extract product details. Be conservative with era - only assign 80s/90s/Y2K if clearly evident." }
    ];

    // Add up to 9 images for analysis (to read all label images)
    const imagesToAnalyze = imageUrls.slice(0, 9);
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
