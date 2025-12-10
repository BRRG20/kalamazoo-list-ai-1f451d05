import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a voice input parser for a vintage clothing listing app. Parse spoken text and extract ONLY the fields that are explicitly mentioned.

CRITICAL RULES:
1. ONLY extract fields that the user explicitly mentions
2. NEVER guess or invent values
3. If a field is not mentioned, do NOT include it in the response
4. For condition with flaws, format as: "Very good (flaw description)"
5. For era, ONLY accept "80s", "90s", or "Y2K" - anything else should be null
6. Recommended size should be formatted as ranges like "UK 12-14" or "M-L"

FIELD MAPPINGS:
- "price" / "pounds" / "£" → price (number)
- "size" / "label size" → size_label
- "recommended" / "fits like" / "would fit" → size_recommended
- "condition" → condition (e.g. "Excellent", "Very good", "Good – light wear")
- "flaw" / "wear" / "damage" → append to condition in parentheses
- "women" / "men" / "unisex" / "kids" → department
- "80s" / "90s" / "Y2K" / "2000s" → era (only these values, 2000s = Y2K)
- "notes" / "additional" → notes
- "brand" → brand
- "material" / "fabric" → material
- "colour" / "color" → colour_main or colour_secondary
- "pattern" → pattern
- "style" → style (e.g. "chunky", "minimal", "oversized")
- "fit" → fit
- "garment" / "type" → garment_type

EXAMPLES:
Input: "Price is 25 pounds. Women's department. True 90s. Condition very good, minor bobbling on sleeves."
Output: {"price": 25, "department": "Women", "era": "90s", "condition": "Very good (minor bobbling on sleeves)"}

Input: "Recommended size UK 12 to 14. Some fading on the hem."
Output: {"size_recommended": "UK 12-14", "condition": "(some fading on the hem)"}

Input: "Brand is Adidas. Made of 100% cotton."
Output: {"brand": "Adidas", "material": "100% Cotton"}

Respond ONLY with valid JSON containing only the fields mentioned.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcript, existingCondition } = await req.json();
    
    if (!transcript) {
      throw new Error("No transcript provided");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const userPrompt = existingCondition 
      ? `Parse this voice input. Current condition is: "${existingCondition}". If new flaws are mentioned, append them.\n\nVoice input: "${transcript}"`
      : `Parse this voice input:\n\n"${transcript}"`;

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
    
    // Extract JSON from response
    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        // If no valid JSON, return empty object
        parsed = {};
      }
    }

    // Clean up the parsed data - remove null/undefined values
    const cleaned: Record<string, any> = {};
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
