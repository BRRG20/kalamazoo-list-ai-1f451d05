import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { verifyAuth, unauthorizedResponse, corsHeaders } from "../_shared/auth.ts";

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

const SYSTEM_PROMPT = `You are a voice input parser for a vintage clothing listing app. The speech recognition may produce garbled or unclear text, so you must INFER what the user meant based on context.

CRITICAL RULES:
1. Extract ALL mentioned attributes in a SINGLE pass
2. User may say attributes in ANY order — detect and map all of them
3. NEVER output placeholder text like "Unknown" or "Not specified"
4. If a value is not mentioned, DO NOT include that key in output
5. Speech recognition often garbles words - use context to infer meaning:
   - "common" often means "condition"
   - "engine" might mean "condition" 
   - "car" might mean "colour"
   - Numbers followed by "inches" usually mean pit_to_pit measurement
   - Random words near clothing terms are often brand names

You must return ONLY a single JSON object. No text before or after.

==========================================
FIELD MAPPINGS (be VERY flexible with mishearings)
==========================================

PRICE:
- "price" / "pounds" / "£" / "quid" / numbers with currency → price (number only)

SIZE:
- "size" / "medium" / "large" / "small" / "XL" / letters like "M" "L" "S" → size_label
- "fits like" / "would fit" / "recommended" → size_recommended

MEASUREMENTS:
- ANY number followed by "inches" or "in" → pit_to_pit (e.g. "22 inches" → "22 inches")
- "pit to pit" / "ptp" / "p2p" / "chest" → pit_to_pit

CONDITION (map garbled words like "common" → condition):
- Look for: "condition" / "common" / "engine" / "quality" / "state"
- Values: "Excellent" / "Very good" / "Good" / "Fair"
- "pretty good" / "quite good" / "okay" → "Good"
- "very good" / "really good" → "Very good"
- Any flaws mentioned → append in parentheses AND set "flaws" field

DEPARTMENT:
- "women" / "ladies" / "womens" → "Women"
- "men" / "mens" / "gents" → "Men"
- "unisex" → "Unisex"
- "kids" / "children" → "Kids"

ERA (ONLY if clearly stated):
- "80s" / "eighties" → "80s"
- "90s" / "nineties" → "90s"  
- "Y2K" / "2000s" → "Y2K"

BRAND:
- Any proper noun or company name mentioned → brand
- "brand is [name]" / "[name] sweater" → brand

MATERIAL:
- "wool" / "cotton" / "polyester" / "acrylic" / fabric types → material

COLOURS (also check for "car" which may mean "colour"):
- Colour words: blue, red, green, black, white, navy, cream, grey, etc. → colour_main
- Second colour mentioned → colour_secondary

PATTERN:
- "striped" / "checked" / "plain" / "graphic" / "printed" → pattern

GARMENT TYPE:
- sweater, jumper, hoodie, t-shirt, shirt, jacket, cardigan, flannel, vest → garment_type

FIT:
- "oversized" / "slim" / "boxy" / "relaxed" / "fitted" → fit

ORIGIN:
- "made in [country]" → made_in

TAGS:
- "Shopify tags" → shopify_tags
- "Etsy tags" → etsy_tags
- "collection tags" → collections_tags

==========================================
EXAMPLES WITH GARBLED SPEECH
==========================================

Input: "This is 24 common is pretty common and the era is quite okay the brand is just the size is medium 22 inches is common and the engine is very good the blue car is white"
Analysis: "common" = condition, "24" and "22 inches" = measurements, "engine is very good" = condition very good, "blue car is white" = blue colour, white secondary
Output: {"pit_to_pit": "22 inches", "size_label": "Medium", "condition": "Very good", "colour_main": "Blue", "colour_secondary": "White"}

Input: "Brand is Ralph Lauren wool sweater pit to pit 22 inches size medium dark green and navy"
Output: {"brand": "Ralph Lauren", "garment_type": "Sweater", "material": "Wool", "pit_to_pit": "22 inches", "size_label": "Medium", "colour_main": "Dark green", "colour_secondary": "Navy"}

Input: "Nike hoodie oversized fit black large made in USA price 25 pounds"
Output: {"brand": "Nike", "garment_type": "Hoodie", "fit": "Oversized", "colour_main": "Black", "size_label": "Large", "made_in": "USA", "price": 25}

==========================================
ALLOWED OUTPUT KEYS
==========================================

Only return these keys (any subset):
price, garment_type, department, era, brand, fit, size_label, size_recommended,
pit_to_pit, material, condition, flaws, made_in, colour_main, colour_secondary,
pattern, shopify_tags, collections_tags, etsy_tags, notes, description_text, preferred_style

Respond ONLY with valid JSON.`;

console.log("Parse-voice function initialized");

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
        model: "google/gemini-2.5-flash",
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
