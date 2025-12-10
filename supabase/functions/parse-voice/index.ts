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

const SYSTEM_PROMPT = `You are a voice input parser for a vintage clothing listing app. Parse spoken text and extract product fields that are mentioned.

IMPORTANT: Speech recognition may have errors. Try to interpret what the user likely meant.

FIELD MAPPINGS (be flexible with phrasing):
- "price" / "pounds" / "£" / "quid" / numbers with context → price (number only)
- "size" / "label size" / "tagged" → size_label (e.g. "M", "L", "UK 12")
- "recommended" / "fits like" / "would fit" / "true to size" → size_recommended
- "condition" / "quality" / "state" → condition (Excellent, Very good, Good, Fair)
- "flaw" / "wear" / "damage" / "hole" / "stain" / "bobbling" / "fading" → append to condition in parentheses
- "women" / "ladies" / "men" / "unisex" / "kids" → department (Women, Men, Unisex, Kids)
- "80s" / "eighties" / "90s" / "nineties" / "Y2K" / "2000s" / "millennium" → era (80s, 90s, or Y2K only)
- "notes" / "additional" / "also" → notes
- "brand" / company names → brand
- "material" / "fabric" / "cotton" / "wool" / "polyester" / "silk" → material
- "colour" / "color" / color words (red, blue, black, etc.) → colour_main
- "pattern" / "striped" / "checked" / "plain" / "graphic" → pattern
- "fit" / "oversized" / "slim" / "boxy" / "relaxed" → fit
- "garment" / "type" / clothing items (shirt, jumper, jacket, etc.) → garment_type

DESCRIPTION CONTENT:
- If user says "description" / "add to description" / "for the description" followed by text → description_text
- Any narrative/story content about the item (not just field values) → description_text
- Example: "for the description this is a lovely vintage piece perfect for autumn" → description_text: "This is a lovely vintage piece perfect for autumn."

STYLE SELECTION:
- "style A" / "use style A" / "style 1" / "minimal" → preferred_style: "A"
- "style B" / "use style B" / "style 2" / "SEO" → preferred_style: "B"

CONDITION FORMAT:
- If flaws mentioned with condition: "Very good (minor bobbling on sleeves)"
- If only flaws mentioned: "(some fading on the hem)"

EXAMPLES:
Input: "Price is 25 pounds"
Output: {"price": 25}

Input: "Women's, 90s era, condition very good with minor bobbling"
Output: {"department": "Women", "era": "90s", "condition": "Very good (minor bobbling)"}

Input: "For the description this is a beautiful authentic vintage piece from the nineties"
Output: {"description_text": "This is a beautiful authentic vintage piece from the nineties."}

Input: "Use style B for descriptions"
Output: {"preferred_style": "B"}

Input: "Add to description great for layering in winter, also brand is Gap"
Output: {"description_text": "Great for layering in winter.", "brand": "Gap"}

If no product fields are detected, return an empty object: {}

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
        cleaned[key] = value;
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
