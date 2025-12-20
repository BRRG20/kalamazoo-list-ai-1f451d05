import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Auto-QC required fields
const REQUIRED_FIELDS = ["title", "description_style_a", "garment_type", "condition"];
const SIZE_FIELDS = ["size_label", "size_recommended"];

interface QCResult {
  qc_status: "ready" | "needs_review" | "blocked";
  confidence: number;
  flags: Record<string, boolean>;
}

function runAutoQC(product: any): QCResult {
  const flags: Record<string, boolean> = {};
  let confidence = 100;

  // Check required fields
  const missingRequired: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    if (!product[field] || product[field].toString().trim() === "") {
      missingRequired.push(field);
      confidence -= 15;
    }
  }

  // Check size (at least one must be present)
  const hasSize = SIZE_FIELDS.some(f => product[f] && product[f].toString().trim() !== "");
  if (!hasSize) {
    flags.missing_size = true;
    confidence -= 20;
  }

  // Check measurements
  if (!product.pit_to_pit || product.pit_to_pit.toString().trim() === "") {
    flags.missing_measurements = true;
    confidence -= 10;
  }

  // Check era uncertainty
  if (!product.era || product.era === "") {
    flags.era_uncertain = true;
    confidence -= 5;
  }

  // Check brand
  if (!product.brand || product.brand.toString().trim() === "") {
    flags.brand_unclear = true;
    confidence -= 10;
  }

  // Check for damage/flaws present but not described
  if (product.condition && ["Fair", "Good"].includes(product.condition)) {
    if (!product.flaws || product.flaws.toString().trim() === "") {
      flags.damage_present_not_described = true;
      confidence -= 10;
    }
  }

  // Check price
  const price = parseFloat(product.price) || 0;
  if (price <= 0) {
    flags.missing_price = true;
    confidence -= 20;
  } else if (price < 5 || price > 1000) {
    flags.price_out_of_band = true;
    confidence -= 5;
  }

  // Ensure confidence is in bounds
  confidence = Math.max(0, Math.min(100, confidence));

  // Determine QC status
  let qc_status: "ready" | "needs_review" | "blocked";
  
  if (missingRequired.length > 0) {
    qc_status = "blocked";
    flags.missing_required_fields = true;
  } else if (confidence >= 85 && Object.keys(flags).length === 0) {
    qc_status = "ready";
  } else if (confidence >= 60) {
    qc_status = "needs_review";
  } else {
    qc_status = "blocked";
  }

  return { qc_status, confidence, flags };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const { run_id } = await req.json();

    if (!run_id) {
      return new Response(JSON.stringify({ error: "run_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[Autopilot Batch] Processing run ${run_id}`);

    // Get the run details
    const { data: run, error: runError } = await supabase
      .from("autopilot_runs")
      .select("*")
      .eq("id", run_id)
      .single();

    if (runError || !run) {
      console.error("[Autopilot Batch] Run not found:", runError);
      return new Response(JSON.stringify({ error: "Run not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (run.status !== "running") {
      console.log(`[Autopilot Batch] Run ${run_id} is not running (${run.status})`);
      return new Response(JSON.stringify({ message: "Run is not in running state" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch next batch of products (draft or failed, ordered by created_at)
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("*")
      .eq("run_id", run_id)
      .in("qc_status", ["draft", "failed"])
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(run.batch_size);

    if (productsError) {
      console.error("[Autopilot Batch] Failed to fetch products:", productsError);
      throw new Error("Failed to fetch products");
    }

    if (!products || products.length === 0) {
      // No more products to process - update run status
      console.log(`[Autopilot Batch] Run ${run_id} complete - no more products`);
      await supabase
        .from("autopilot_runs")
        .update({ status: "awaiting_qc", updated_at: new Date().toISOString() })
        .eq("id", run_id);

      return new Response(JSON.stringify({ 
        message: "Autopilot complete",
        status: "awaiting_qc"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currentBatch = run.current_batch + 1;
    console.log(`[Autopilot Batch] Processing batch ${currentBatch} with ${products.length} products`);

    // Mark products as generating
    const productIds = products.map(p => p.id);
    await supabase
      .from("products")
      .update({ qc_status: "generating", batch_number: currentBatch })
      .in("id", productIds);

    // Update run current_batch
    await supabase
      .from("autopilot_runs")
      .update({ current_batch: currentBatch, updated_at: new Date().toISOString() })
      .eq("id", run_id);

    let processedCount = 0;
    let errorCount = 0;

    // Process each product
    for (const product of products) {
      try {
        // Get product images
        const { data: images } = await supabase
          .from("images")
          .select("url")
          .eq("product_id", product.id)
          .order("position", { ascending: true })
          .limit(2);

        const imageUrls = images?.map(img => img.url) || [];

        // Call generate-listing
        const genResponse = await fetch(`${supabaseUrl}/functions/v1/generate-listing`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            product: {
              garment_type: product.garment_type,
              brand: product.brand,
              colour_main: product.colour_main,
              colour_secondary: product.colour_secondary,
              pattern: product.pattern,
              size_label: product.size_label,
              size_recommended: product.size_recommended,
              pit_to_pit: product.pit_to_pit,
              fit: product.fit,
              material: product.material,
              era: product.era,
              condition: product.condition,
              flaws: product.flaws,
              department: product.department,
              made_in: product.made_in,
              raw_input_text: product.raw_input_text,
            },
            imageUrls,
          }),
        });

        if (!genResponse.ok) {
          const errText = await genResponse.text();
          console.error(`[Autopilot Batch] Generate failed for ${product.id}:`, errText);
          
          // Mark as failed
          await supabase
            .from("products")
            .update({ 
              qc_status: "failed",
              generated_at: new Date().toISOString()
            })
            .eq("id", product.id);
          
          errorCount++;
          continue;
        }

        const generated = await genResponse.json();
        console.log(`[Autopilot Batch] Generated for ${product.id}:`, Object.keys(generated));

        // Update product with generated data
        const updates: Record<string, any> = {
          generated_at: new Date().toISOString(),
        };

        if (generated.title) updates.title = generated.title;
        if (generated.description_style_a) updates.description_style_a = generated.description_style_a;
        if (generated.description_style_b) updates.description_style_b = generated.description_style_b;
        if (generated.shopify_tags) updates.shopify_tags = generated.shopify_tags;
        if (generated.etsy_tags) updates.etsy_tags = generated.etsy_tags;
        if (generated.collections_tags) updates.collections_tags = generated.collections_tags;
        
        // Update inferred fields if not already set
        if (!product.garment_type && generated.garment_type) updates.garment_type = generated.garment_type;
        if (!product.fit && generated.fit) updates.fit = generated.fit;
        if (!product.era && generated.era) updates.era = generated.era;
        if (!product.condition && generated.condition) updates.condition = generated.condition;
        if (!product.department && generated.department) updates.department = generated.department;
        if (!product.flaws && generated.flaws) updates.flaws = generated.flaws;
        if (!product.made_in && generated.made_in) updates.made_in = generated.made_in;
        if (!product.pattern && generated.pattern) updates.pattern = generated.pattern;

        // Run Auto-QC
        const mergedProduct = { ...product, ...updates };
        const qcResult = runAutoQC(mergedProduct);

        updates.qc_status = qcResult.qc_status;
        updates.confidence = qcResult.confidence;
        updates.flags = qcResult.flags;
        updates.status = "generated";

        await supabase
          .from("products")
          .update(updates)
          .eq("id", product.id);

        processedCount++;
        console.log(`[Autopilot Batch] Product ${product.id}: ${qcResult.qc_status} (${qcResult.confidence}%)`);

      } catch (productError) {
        console.error(`[Autopilot Batch] Error processing ${product.id}:`, productError);
        await supabase
          .from("products")
          .update({ qc_status: "failed" })
          .eq("id", product.id);
        errorCount++;
      }
    }

    // Update run processed count
    const newProcessed = run.processed_cards + processedCount;
    const updateData: Record<string, any> = {
      processed_cards: newProcessed,
      updated_at: new Date().toISOString(),
    };

    if (errorCount > 0) {
      updateData.last_error = `Batch ${currentBatch}: ${errorCount} products failed`;
    }

    await supabase
      .from("autopilot_runs")
      .update(updateData)
      .eq("id", run_id);

    console.log(`[Autopilot Batch] Batch ${currentBatch} complete: ${processedCount} processed, ${errorCount} errors`);

    // Trigger next batch (async)
    fetch(`${supabaseUrl}/functions/v1/process-autopilot-batch`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ run_id }),
    }).catch(err => console.error("[Autopilot Batch] Failed to trigger next batch:", err));

    return new Response(JSON.stringify({ 
      message: `Batch ${currentBatch} complete`,
      processed: processedCount,
      errors: errorCount,
      total_processed: newProcessed,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[Autopilot Batch] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
