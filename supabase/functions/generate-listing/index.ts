import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { verifyAuth, unauthorizedResponse, corsHeaders } from "../_shared/auth.ts";

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

const SYSTEM_PROMPT = `You are generating product listings for Kalamazoo, a vintage clothing app.
You have STRONG OCR/Vision capabilities. You MUST carefully read all text visible in images.

==========================================
**MANDATORY 2-STEP EXTRACTION PROCESS**
==========================================

You MUST complete both steps. Step 1 forces you to extract raw text BEFORE filling structured fields.

**STEP 1: RAW OCR TEXT EXTRACTION (DO THIS FIRST)**
Scan ALL images and extract the EXACT text you see. Return in the ocr_text object:

ocr_text.label_text = Extract ALL text from clothing labels/tags:
  - Brand name (e.g., "La Paz", "Patagonia", "Nike")
  - Size on label (e.g., "L", "XL", "42", "Large")
  - Fabric composition (e.g., "100% Wool", "80% Cotton 20% Polyester")
  - Country of origin (e.g., "Made in Ecuador", "Made in USA")
  - Care instructions if visible
  
ocr_text.measurement_text = Extract ALL text from measurement signs/notes:
  - Look for handwritten or printed signs showing measurements
  - Extract pit-to-pit numbers (e.g., "Pit to Pit: 24", "PTP 22", "24 inches", just "24")
  - Extract any other measurements shown
  
If NO text is visible for labels, set label_text to "No label text visible"
If NO measurement sign exists, set measurement_text to "No measurement sign visible"

**STEP 2: STRUCTURED FIELD MAPPING**
Use the raw text from Step 1 to populate structured fields:
- brand: Extract from ocr_text.label_text
- size_label: Extract size from ocr_text.label_text (S, M, L, XL, or numeric)
- material: Extract fabric composition from ocr_text.label_text
- made_in: Extract country from ocr_text.label_text
- pit_to_pit: Extract measurement from ocr_text.measurement_text (format as "X inches")

CRITICAL: If pit-to-pit appears on a sign (e.g., "24" or "Pit to Pit: 24"), 
the pit_to_pit field MUST be "24 inches". Do NOT leave it null if a number is visible.

Then analyze garment visually for:
- garment_type: What type (Sweater, Hoodie, T-Shirt, Jacket, Cardigan, Flannel Shirt, etc.)
- department: Men, Women, or Unisex based on cut/silhouette
- fit: Oversized, Slim, Regular, Boxy, Relaxed
- era: 80s, 90s, Y2K ONLY if style clearly indicates — otherwise null
- condition: Excellent, Very good, Good, Fair
- flaws: Describe visible damage/wear or null
- colour_main, colour_secondary, pattern, style

==========================================
CRITICAL RULES — NEVER BREAK THESE
==========================================

1. NEVER output "Unknown", "Not specified", "N/A", or placeholder text
2. If a value is not visible AND not provided, set to JSON null (not the string "null")
3. Brand in description MUST match the brand from labels OR product details exactly
4. Era: ONLY include if explicitly 80s, 90s, or Y2K — otherwise null
5. Made In: ONLY include if readable in image label — otherwise null
6. **CRITICAL**: NEVER write the literal string "null" in title or descriptions
7. **CRITICAL FOR TITLE**: Use brand and size from labels/images. DO NOT invent them.
8. **CRITICAL**: Title must be MAX 80 characters, with size LAST

==========================================
TITLE RULES — CRITICAL
==========================================

**MANDATORY**: The title MUST use values from:
1. FIRST: What you READ from labels in the images (brand tag, size label)
2. FALLBACK: What is provided in product details

Format: Brand → Era (if known) → Gender → Item Type → Key Feature → Size

Rules:
- Start with the brand name from labels or product details
- Gender: Mens / Womens / Unisex (based on garment cut visible in images)
- If era is NOT evident from style, leave it out (do NOT guess)
- Max 80 characters, NO punctuation
- Size ALWAYS at the end: "Size L" or "Size XL"
- NO hype words: "rare", "beautiful", "excellent", "amazing"

Examples:
- Brand label shows "Malinmor", size label shows "L" → "Malinmor Vintage Mens Chunky Knit Wool Sweater Size L"
- Brand label shows "Nike", size label shows "XL" → "Nike Mens Graphic Print T Shirt Size XL"

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

Brand: [EXACT brand from product details or labels - OMIT LINE if not available]
Label Size: [EXACT size from labels - OMIT LINE if not visible/available]
Pit to Pit: [measurement from sign/note - OMIT LINE if not visible]
Material: [fabric from label - OMIT LINE if not visible]
Era: [ONLY if 80s/90s/Y2K - OMIT LINE otherwise]
Condition: [condition, with flaws in parentheses if any]
Colour: [main colour, and secondary if applicable]

CRITICAL: In descriptions, NEVER write "null", "N/A", "Unknown", or any placeholder.
If a value is not available, OMIT THE ENTIRE LINE from the attribute block.
Example - if no pit-to-pit measurement exists, do NOT write "Pit to Pit: null" - just skip that line entirely.

==========================================
EXTRACT ALL FIELDS FROM IMAGES (OCR + VISION)
==========================================

You MUST populate these fields by analyzing images (use OCR for text, vision for visuals):

FROM LABELS (read with OCR):
- brand: Read the brand name from clothing label/tag
- size_label: Read size from label (S, M, L, XL, or numeric like 42)
- material: Read fabric composition (e.g., "100% Cotton")
- made_in: Read country of origin if visible

FROM SIGNS/NOTES (read with OCR):
- pit_to_pit: Read measurement if written on a sign (e.g., "22 inches")
- price: Read if visible on tag/sign

FROM VISUAL ANALYSIS:
- garment_type: What type of garment (T-Shirt, Hoodie, Sweater, Jacket, Cardigan, Flannel Shirt, etc.)
- department: Men, Women, or Unisex based on cut/style visible
- fit: How it fits (Regular, Oversized, Slim, Boxy, Relaxed)
- era: ONLY if clearly 80s, 90s, or Y2K style (otherwise null)
- condition: Assess from images (Excellent, Very good, Good, Fair)
- flaws: Describe visible damage, stains, wear if any (otherwise null)
- colour_main: Primary colour of garment
- colour_secondary: Secondary colour if applicable (otherwise null)
- pattern: Pattern type (Solid, Striped, Graphic, Checked, etc.)
- style: Style description (Casual, Streetwear, Preppy, etc.)
- size_recommended: Your size recommendation based on fit/measurements

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
OUTPUT FORMAT (STRICT JSON — ALL FIELDS REQUIRED)
==========================================

Respond with ONLY valid JSON (no markdown, no code blocks).
EVERY key below MUST be present. Set to null if not determinable.
The ocr_text object is MANDATORY — you must report raw extracted text.

{
  "ocr_text": {
    "label_text": "Raw text from clothing labels (brand, size, material, made in) or 'No label text visible'",
    "measurement_text": "Raw text from measurement signs (e.g., 'Pit to Pit: 24') or 'No measurement sign visible'"
  },
  "title": "Brand + Era(optional) + Gender + Item Type + Feature + Size LAST, max 80 chars, NO null string",
  "description_style_a": "[2-4 sentences]\\n\\nBrand: [value]\\nLabel Size: [value]\\n...",
  "description_style_b": "[2-4 sentences, slightly more descriptive]\\n\\nBrand: [value]\\n...",
  "shopify_tags": "Brand, Type, Material, Era, Style",
  "etsy_tags": "13 comma-separated tags, max 20 chars each",
  "collections_tags": "Collection1, Collection2",
  "garment_type": "T-Shirt, Hoodie, Sweater, Jacket, etc. or null",
  "department": "Men, Women, or Unisex or null",
  "brand": "Brand name from ocr_text.label_text or null",
  "fit": "Regular, Oversized, Slim, Boxy, Relaxed or null",
  "era": "80s, 90s, Y2K or null",
  "condition": "Excellent, Very good, Good, Fair or null",
  "flaws": "Description of visible damage or null",
  "colour_main": "Primary colour or null",
  "colour_secondary": "Secondary colour or null",
  "material": "Fabric from ocr_text.label_text or null",
  "made_in": "Country from ocr_text.label_text or null",
  "pattern": "Solid, Striped, Graphic, Checked, etc. or null",
  "style": "Casual, Streetwear, Preppy, etc. or null",
  "size_label": "Size from ocr_text.label_text (S, M, L, XL) or null",
  "size_recommended": "Recommended fit size or null",
  "pit_to_pit": "Measurement from ocr_text.measurement_text as 'X inches' or null",
  "price": "Number only or null"
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

    const { product, imageUrls, regenerateOnly } = await req.json();
    
    // Debug: Log incoming request details
    console.log(`[generate-listing] Received ${imageUrls?.length || 0} image URLs`);
    
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
    
    // Debug: Log validated image count
    console.log(`[generate-listing] Valid image URLs after validation: ${validImageUrls.length}`);

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
    let userPrompt = `Generate a vintage clothing listing for this product.

**CRITICAL OCR TASK - DO THIS FIRST:**
1. SCAN ALL ${validImageUrls.length} IMAGES for text/labels/signs
2. READ any clothing labels (brand tag, size label like "L" or "XL", material composition, "Made in X")
3. READ any handwritten measurement signs (look for pit-to-pit numbers like "22 inches" or just "22")
4. EXTRACT the size from labels (S, M, L, XL, etc.) and populate size_label field
5. EXTRACT pit-to-pit measurement from any sign/note and populate pit_to_pit field

Product Details:
${productContext}`;
    
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

    // Deterministic image selection: prioritize label + measurement sign images
    const selectPriorityImages = (urls: string[]): string[] => {
      if (urls.length <= 4) return urls;
      
      const lowerUrls = urls.map(u => u.toLowerCase());
      
      // Find label image (clothing tag with size/material/brand)
      const labelIdx = lowerUrls.findIndex(u => 
        u.includes('label') || u.includes('tag') || u.includes('care') || 
        u.includes('fabric') || u.includes('size-label') || u.includes('sizelabel')
      );
      
      // Find measurement sign image (pit-to-pit sign)
      const measureIdx = lowerUrls.findIndex(u => 
        u.includes('pit') || u.includes('ptp') || u.includes('measure') || 
        u.includes('measurement') || u.includes('sign')
      );
      
      const usedIndices = new Set<number>();
      const result: string[] = [];
      
      // Priority 1: Label image
      if (labelIdx !== -1) {
        result.push(urls[labelIdx]);
        usedIndices.add(labelIdx);
      }
      
      // Priority 2: Measurement sign image
      if (measureIdx !== -1 && !usedIndices.has(measureIdx)) {
        result.push(urls[measureIdx]);
        usedIndices.add(measureIdx);
      }
      
      // Priority 3: Front/main garment (first non-label/non-measure image, or index 0)
      const frontIdx = lowerUrls.findIndex((u, i) => 
        !usedIndices.has(i) && (u.includes('front') || u.includes('main') || u.includes('primary'))
      );
      if (frontIdx !== -1) {
        result.push(urls[frontIdx]);
        usedIndices.add(frontIdx);
      } else {
        // Default to first available non-used image
        const firstAvail = urls.findIndex((_, i) => !usedIndices.has(i));
        if (firstAvail !== -1) {
          result.push(urls[firstAvail]);
          usedIndices.add(firstAvail);
        }
      }
      
      // Priority 4: Extra detail (next available)
      for (let i = 0; i < urls.length && result.length < 4; i++) {
        if (!usedIndices.has(i)) {
          result.push(urls[i]);
          usedIndices.add(i);
        }
      }
      
      return result;
    };

    // Add images if provided (up to 4 for comprehensive OCR/vision analysis)
    if (validImageUrls && validImageUrls.length > 0) {
      const imagesToUse = selectPriorityImages(validImageUrls);
      
      // Log selected image roles for debugging
      const lowerSelected = imagesToUse.map(u => u.toLowerCase());
      console.log(`[generate-listing] Image selection: ${imagesToUse.length} of ${validImageUrls.length} images`, {
        hasLabel: lowerSelected.some(u => u.includes('label') || u.includes('tag') || u.includes('care')),
        hasMeasure: lowerSelected.some(u => u.includes('pit') || u.includes('ptp') || u.includes('measure')),
      });
      
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
        // Use Gemini 2.5 Pro for better OCR/vision capabilities on labels and signs
        model: "google/gemini-2.5-pro",
        max_tokens: 2500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT + "\n\nIMPORTANT: You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanatory text. Just the raw JSON object." },
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
    
    // Debug: Log raw response (truncated for brevity)
    console.log("[generate-listing] Raw AI response (first 800 chars):", rawContent.substring(0, 800));
    
    
    // Extract JSON from response - handle markdown code blocks and truncated responses
    let generated;
    try {
      generated = JSON.parse(rawContent);
    } catch {
      let jsonString = rawContent;
      
      // Remove markdown code block markers (handle both complete and truncated blocks)
      // First try complete code block
      const codeBlockMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonString = codeBlockMatch[1].trim();
      } else {
        // Handle truncated code block (starts with ``` but no closing)
        const truncatedBlockMatch = rawContent.match(/```(?:json)?\s*([\s\S]*)/);
        if (truncatedBlockMatch) {
          jsonString = truncatedBlockMatch[1].trim();
        }
      }
      
      // Try to find JSON object
      const jsonMatch = jsonString.match(/\{[\s\S]*/);
      if (jsonMatch) {
        jsonString = jsonMatch[0];
      }
      
      // Escape unescaped newlines inside JSON strings (AI often outputs literal newlines)
      const escapeNewlinesInStrings = (str: string): string => {
        let result = '';
        let inString = false;
        let escapeNext = false;
        
        for (let i = 0; i < str.length; i++) {
          const char = str[i];
          
          if (escapeNext) {
            result += char;
            escapeNext = false;
            continue;
          }
          
          if (char === '\\') {
            result += char;
            escapeNext = true;
            continue;
          }
          
          if (char === '"') {
            inString = !inString;
            result += char;
            continue;
          }
          
          // If we're inside a string and hit a literal newline, escape it
          if (inString && (char === '\n' || char === '\r')) {
            result += char === '\n' ? '\\n' : '\\r';
            continue;
          }
          
          result += char;
        }
        
        return result;
      };
      
      jsonString = escapeNewlinesInStrings(jsonString);
      
      // Try to repair truncated JSON by closing incomplete strings and braces
      const repairJson = (str: string): string => {
        // Check if JSON appears truncated (doesn't end with })
        if (!str.trim().endsWith('}')) {
          console.log("[AI] Attempting to repair truncated JSON");
          
          // Count open braces and quotes
          let inString = false;
          let escapeNext = false;
          let braceCount = 0;
          
          for (const char of str) {
            if (escapeNext) {
              escapeNext = false;
              continue;
            }
            if (char === '\\') {
              escapeNext = true;
              continue;
            }
            if (char === '"' && !escapeNext) {
              inString = !inString;
            }
            if (!inString) {
              if (char === '{') braceCount++;
              if (char === '}') braceCount--;
            }
          }
          
          // If we're in a string, close it
          if (inString) {
            str += '"';
          }
          
          // Close any unclosed braces
          while (braceCount > 0) {
            str += '}';
            braceCount--;
          }
        }
        return str;
      };
      
      jsonString = repairJson(jsonString);
      
      try {
        generated = JSON.parse(jsonString);
      } catch (parseError) {
        console.error("Failed to parse JSON after repair:", jsonString.substring(0, 500));
        console.error("Parse error:", parseError);
        
        // Final fallback: return minimal valid response instead of failing
        console.log("[AI] Using minimal fallback response");
        generated = {
          title: null,
          description_style_a: null,
          description_style_b: null,
          shopify_tags: null,
          etsy_tags: null,
          collections_tags: null,
          garment_type: null,
          fit: null,
          era: null,
          condition: null,
          department: null,
        };
      }
    }
    
    // Debug: Log raw OCR text extraction (Step 1 of 2-step process)
    if (generated.ocr_text) {
      console.log("[generate-listing] OCR Step 1 - Raw text:", JSON.stringify(generated.ocr_text));
      
      // CRITICAL: Fallback regex extraction for pit_to_pit if AI didn't map it
      // This catches cases where ocr_text.measurement_text has a number but pit_to_pit is still null
      if (!generated.pit_to_pit && generated.ocr_text.measurement_text) {
        const measureText = generated.ocr_text.measurement_text;
        // Match patterns like "24", "24 inches", "24in", "24"", "Pit to Pit: 24", "PTP 22"
        const pitMatch = measureText.match(/(?:pit[- ]?to[- ]?pit|ptp)?[:\s]*(\d+(?:\.\d+)?)\s*(?:inches?|in|"|'')?/i);
        if (pitMatch) {
          generated.pit_to_pit = `${pitMatch[1]} inches`;
          console.log(`[generate-listing] REGEX FALLBACK: Extracted pit_to_pit "${generated.pit_to_pit}" from measurement_text`);
        }
      }
      
      // CRITICAL: Fallback for size_label from label_text if AI didn't map it
      if (!generated.size_label && generated.ocr_text.label_text) {
        const labelText = generated.ocr_text.label_text;
        // Match common size patterns
        const sizeMatch = labelText.match(/\b(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|\d{1,2})\b/i);
        if (sizeMatch) {
          generated.size_label = sizeMatch[1].toUpperCase();
          console.log(`[generate-listing] REGEX FALLBACK: Extracted size_label "${generated.size_label}" from label_text`);
        }
      }
    } else {
      console.log("[generate-listing] WARNING: ocr_text object missing from response");
    }
    
    // Debug: Log OCR-extracted fields specifically to verify label/sign parsing
    console.log("[generate-listing] OCR Step 2 - Mapped fields:", JSON.stringify({
      brand: generated.brand,
      size_label: generated.size_label,
      size_recommended: generated.size_recommended,
      pit_to_pit: generated.pit_to_pit,
      material: generated.material,
      made_in: generated.made_in,
      garment_type: generated.garment_type,
      department: generated.department,
      era: generated.era,
      fit: generated.fit,
      condition: generated.condition,
    }));

    // Get the correct size to use in title (recommended_size takes priority, then label)
    const correctSize = product.size_recommended || product.size_label || generated.size_recommended || generated.size_label;
    
    // Normalize size helper
    const normalizeSize = (s: string | null | undefined): string | null => {
      if (!s || s === 'null' || s === 'undefined') return null;
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
    
    // Ensure title is max 80 chars, has no punctuation, and uses CORRECT size
    if (generated.title) {
      // Remove punctuation
      generated.title = generated.title.replace(/[,\-–—:;]/g, ' ').replace(/\s+/g, ' ').trim();
      
      // CRITICAL: Remove any "Size null" or "Size undefined" from title
      generated.title = generated.title.replace(/\s+Size\s+(null|undefined)\b/gi, '').trim();
      
      // CRITICAL: Validate and fix size in title (only if we have a valid size)
      const normalizedCorrect = normalizeSize(correctSize);
      
      if (normalizedCorrect) {
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
          // No size in title - add it if there's room
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
    
    // CRITICAL: Sanitize descriptions to remove "null" placeholders
    // Helper: convert null-like values to empty string for safe text rendering
    const safeText = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      const str = String(val).trim();
      const lower = str.toLowerCase();
      if (lower === 'null' || lower === 'undefined' || lower === 'n/a' || lower === 'not available' || lower === 'not specified') {
        return '';
      }
      return str;
    };
    
    const sanitizeDescription = (desc: string | null): string | null => {
      if (!desc) return null;
      
      // Process line by line
      let sanitized = desc
        .split('\n')
        .map(line => {
          // For attribute lines (Label: Value format), sanitize the value part
          const colonIdx = line.indexOf(':');
          if (colonIdx > 0) {
            const label = line.substring(0, colonIdx + 1);
            const value = line.substring(colonIdx + 1);
            const sanitizedValue = safeText(value);
            // If value is empty after sanitization, keep the line as "Label:" (blank value)
            // But skip entire line if it's a standard attribute with no value
            if (sanitizedValue === '') {
              // Check if this is a standard attribute line that should be omitted entirely
              const labelLower = label.toLowerCase().trim();
              const omitLabels = ['brand:', 'label size:', 'pit to pit:', 'material:', 'era:', 'made in:', 'colour:', 'pattern:', 'style:', 'flaws:'];
              if (omitLabels.some(l => labelLower.startsWith(l.replace(':', '')))) {
                return null; // Omit this line entirely
              }
            }
            return label + ' ' + sanitizedValue;
          }
          
          // For regular lines, check if it's just "null" or similar
          const trimmed = line.trim().toLowerCase();
          if (trimmed === 'null' || trimmed === 'undefined' || trimmed === 'n/a') {
            return null; // Omit this line
          }
          
          // Replace any standalone "null" word in the line
          return line.replace(/\bnull\b/gi, '').replace(/\bundefined\b/gi, '').replace(/\s{2,}/g, ' ').trim();
        })
        .filter(line => line !== null)
        .join('\n');
      
      // Clean up any double blank lines
      sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
      return sanitized.trim() || null;
    };
    
    if (generated.description_style_a) {
      generated.description_style_a = sanitizeDescription(generated.description_style_a);
    }
    if (generated.description_style_b) {
      generated.description_style_b = sanitizeDescription(generated.description_style_b);
    }
    
    // CRITICAL: Sanitize title to remove any "null" strings
    if (generated.title) {
      // Remove "null", "undefined", "N/A" from title
      generated.title = generated.title
        .replace(/\bnull\b/gi, '')
        .replace(/\bundefined\b/gi, '')
        .replace(/\bN\/A\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }
    
    // CRITICAL: Sanitize string "null" values to actual null
    // AI sometimes outputs the literal string "null" instead of JSON null
    const sanitizeNullString = (val: unknown): string | null => {
      if (val === null || val === undefined) return null;
      if (typeof val !== 'string') return String(val);
      const trimmed = val.trim().toLowerCase();
      if (trimmed === 'null' || trimmed === 'undefined' || trimmed === 'n/a' || trimmed === '') {
        return null;
      }
      return val;
    };
    
    // Ensure ALL fields are included in response (complete schema)
    const finalGenerated = {
      title: sanitizeNullString(generated.title),
      description_style_a: generated.description_style_a || null,
      description_style_b: generated.description_style_b || null,
      shopify_tags: sanitizeNullString(generated.shopify_tags),
      etsy_tags: sanitizeNullString(generated.etsy_tags),
      collections_tags: sanitizeNullString(generated.collections_tags),
      // Core attributes - must all be present
      garment_type: sanitizeNullString(generated.garment_type),
      department: sanitizeNullString(generated.department),
      brand: sanitizeNullString(generated.brand),
      fit: sanitizeNullString(generated.fit),
      era: sanitizeNullString(generated.era),
      condition: sanitizeNullString(generated.condition),
      flaws: sanitizeNullString(generated.flaws),
      colour_main: sanitizeNullString(generated.colour_main),
      colour_secondary: sanitizeNullString(generated.colour_secondary),
      material: sanitizeNullString(generated.material),
      made_in: sanitizeNullString(generated.made_in),
      pattern: sanitizeNullString(generated.pattern),
      style: sanitizeNullString(generated.style),
      // Sizes and measurements - CRITICAL: sanitize these especially
      size_label: sanitizeNullString(generated.size_label),
      size_recommended: sanitizeNullString(generated.size_recommended),
      pit_to_pit: sanitizeNullString(generated.pit_to_pit),
      price: generated.price || null,
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
