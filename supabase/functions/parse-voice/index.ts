import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Input validation
const MAX_TRANSCRIPT_LENGTH = 5000;
const MAX_CONDITION_LENGTH = 500;

function validateInput(transcript: unknown, existingCondition: unknown): { valid: boolean; error?: string } {
  if (typeof transcript !== 'string' || transcript.trim().length < 2) {
    return { valid: false, error: 'Transcript is required and must be at least 2 characters' };
  }
  if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
    return { valid: false, error: `Transcript exceeds maximum length of ${MAX_TRANSCRIPT_LENGTH} characters` };
  }
  if (existingCondition !== undefined && existingCondition !== null && typeof existingCondition !== 'string') {
    return { valid: false, error: 'existingCondition must be a string if provided' };
  }
  if (typeof existingCondition === 'string' && existingCondition.length > MAX_CONDITION_LENGTH) {
    return { valid: false, error: `existingCondition exceeds maximum length of ${MAX_CONDITION_LENGTH} characters` };
  }
  return { valid: true };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a voice input parser for a vintage clothing listing app.

CRITICAL RULES:
1. Extract ALL mentioned attributes in a SINGLE pass
2. User may say attributes in ANY order — detect and map all of them
3. NEVER output placeholder text like "Unknown" or "Not specified"
4. If a value is not mentioned, DO NOT include that key in output

You must return ONLY a single JSON object. No text before or after.

==========================================
FIELD MAPPINGS (be flexible with phrasing)
==========================================

PRICE:
- "price" / "pounds" / "£" / "quid" / numbers with currency context → price (number only)
- Example: "25 pounds" → price: 25

SIZE:
- "size" / "label size" / "tagged" / "size on label" → size_label (e.g. "M", "L", "UK 12", "W32 L30")
- "recommended" / "fits like" / "would fit" / "true to size" → size_recommended

MEASUREMENTS:
- "pit to pit" / "ptp" / "p2p" / "chest" / "chest measurement" / "across the chest" → pit_to_pit
- Always include unit: "23 inches", "22in", "56cm"

CONDITION:
- "condition" / "quality" / "state" → condition (Excellent, Very good, Good, Fair)
- "flaw" / "wear" / "damage" / "hole" / "stain" / "bobbling" / "fading" / "mark" →
  - If condition mentioned: append flaws in parentheses, e.g. "Very good (minor bobbling on sleeves)"
  - Also set separate "flaws" field with plain text summary

DEPARTMENT (default to Unisex if unclear):
- "women" / "ladies" / "womens" → department: "Women"
- "men" / "mens" / "gents" → department: "Men"  
- "unisex" / "either" → department: "Unisex"
- "kids" / "children" → department: "Kids"

ERA (ONLY if explicitly stated — never guess):
- "80s" / "eighties" / "1980s" → era: "80s"
- "90s" / "nineties" / "1990s" → era: "90s"
- "Y2K" / "2000s" / "millennium" / "early 2000s" → era: "Y2K"
- If not mentioned, DO NOT include era key

BRAND:
- "brand" / "brand is" / company/designer names → brand
- Example: "Ralph Lauren sweater" → brand: "Ralph Lauren"

MATERIAL:
- "material" / "fabric" / "made of" / "100%" / fabric types → material
- Example: "wool sweater" → material: "Wool"
- Example: "100% cotton" → material: "100% Cotton"

COLOURS:
- "colour" / "color" / colour words → colour_main
- "secondary colour" / "accent" / "with [colour]" → colour_secondary
- Example: "dark green and navy" → colour_main: "Dark green", colour_secondary: "Navy"

PATTERN:
- "striped" / "checked" / "plain" / "graphic" / "printed" / "patterned" → pattern

GARMENT TYPE:
- Clothing items: sweater, jumper, hoodie, t-shirt, shirt, jacket, cardigan, flannel, vest, sweatshirt, polo → garment_type

FIT:
- "oversized" / "slim" / "boxy" / "relaxed" / "fitted" / "regular" → fit

ORIGIN (ONLY if explicitly stated):
- "made in" / "manufactured in" / "from [country]" → made_in
- If not mentioned, DO NOT include made_in key

TAGS:
- "Shopify tags" / "for Shopify" → shopify_tags (comma-separated)
- "Etsy tags" / "for Etsy" → etsy_tags (comma-separated, 2-3 words each)
- "collection tags" / "collections" → collections_tags (comma-separated)

NOTES:
- "notes" / "additional" / "also note" → notes

DESCRIPTION:
- "description" / "add to description" / "for the description" → description_text
- "style A" / "minimal" → preferred_style: "A"
- "style B" / "SEO" → preferred_style: "B"

==========================================
EXAMPLES
==========================================

Input: "Brand is Ralph Lauren, wool sweater, pit to pit 22 inches, size medium, dark green and navy"
Output: {"brand": "Ralph Lauren", "garment_type": "Sweater", "material": "Wool", "pit_to_pit": "22 inches", "size_label": "Medium", "colour_main": "Dark green", "colour_secondary": "Navy"}

Input: "Price 25 pounds, women's, 90s era, condition very good with minor bobbling"
Output: {"price": 25, "department": "Women", "era": "90s", "condition": "Very good (minor bobbling)", "flaws": "minor bobbling"}

Input: "Nike hoodie, oversized fit, black, large, made in USA"
Output: {"brand": "Nike", "garment_type": "Hoodie", "fit": "Oversized", "colour_main": "Black", "size_label": "Large", "made_in": "USA"}

Input: "Vintage t-shirt, graphic print, condition good some fading on the hem"
Output: {"garment_type": "T-Shirt", "pattern": "Graphic", "condition": "Good (some fading on the hem)", "flaws": "some fading on the hem"}

==========================================
ALLOWED OUTPUT KEYS
==========================================

Only return these keys (any subset):
price, garment_type, department, era, brand, fit, size_label, size_recommended,
pit_to_pit, material, condition, flaws, made_in, colour_main, colour_secondary,
pattern, shopify_tags, collections_tags, etsy_tags, notes, description_text,
preferred_style

Respond ONLY with valid JSON.`;

console.log("Parse-voice function initialized");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcript, existingCondition } = await req.json();
    
    // Validate inputs
    const validation = validateInput(transcript, existingCondition);
    if (!validation.valid) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const cleanTranscript = transcript.trim();
    console.log("Received transcript:", cleanTranscript.substring(0, 100) + (cleanTranscript.length > 100 ? '...' : ''));

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const userPrompt = existingCondition 
      ? `Parse this voice input for product fields. Current condition is: "${existingCondition}". If new flaws are mentioned, append them.\n\nVoice input: "${cleanTranscript}"`
      : `Parse this voice input for product fields:\n\n"${cleanTranscript}"`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
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
      throw new Error("Voice parsing failed");
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || "";
    
    console.log("AI response:", rawContent);
    
    // Extract JSON from response
    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        console.log("No valid JSON found in response");
        parsed = {};
      }
    }

    // Clean up the parsed data - remove null/undefined values
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value !== null && value !== undefined && value !== "") {
        // Map condition values to match the exact database enum values
        if (key === 'condition' && typeof value === 'string') {
          const conditionValue = value.toLowerCase();
          if (conditionValue.startsWith('excellent')) {
            cleaned[key] = 'Excellent';
          } else if (conditionValue.startsWith('very good')) {
            cleaned[key] = 'Very good';
          } else if (conditionValue.startsWith('good')) {
            cleaned[key] = 'Good';
          } else if (conditionValue.startsWith('fair')) {
            cleaned[key] = 'Fair';
          } else {
            cleaned[key] = value;
          }
        } else {
          cleaned[key] = value;
        }
      }
    }

    return new Response(JSON.stringify({ parsed: cleaned }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in parse-voice:", error);
    const message = error instanceof Error ? error.message : "Parsing failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
