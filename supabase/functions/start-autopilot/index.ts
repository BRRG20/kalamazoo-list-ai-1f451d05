import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { batch_id } = await req.json();

    if (!batch_id) {
      return new Response(JSON.stringify({ error: "batch_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[Autopilot] Starting for batch ${batch_id}, user ${user.id}`);

    // Check if there's already a running autopilot for this batch
    const { data: existingRun } = await supabase
      .from("autopilot_runs")
      .select("*")
      .eq("batch_id", batch_id)
      .eq("user_id", user.id)
      .eq("status", "running")
      .maybeSingle();

    if (existingRun) {
      console.log(`[Autopilot] Resuming existing run ${existingRun.id}`);
      return new Response(JSON.stringify({ 
        run_id: existingRun.id, 
        status: "resumed",
        message: "Resumed existing autopilot run" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Count total products in this batch that need processing
    const { count: totalCards } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("batch_id", batch_id)
      .eq("user_id", user.id)
      .is("deleted_at", null);

    if (!totalCards || totalCards === 0) {
      return new Response(JSON.stringify({ error: "No products found in batch" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create new autopilot run
    const { data: newRun, error: createError } = await supabase
      .from("autopilot_runs")
      .insert({
        user_id: user.id,
        batch_id: batch_id,
        status: "running",
        batch_size: 30,
        total_cards: totalCards,
        processed_cards: 0,
        current_batch: 0,
      })
      .select()
      .single();

    if (createError) {
      console.error("[Autopilot] Failed to create run:", createError);
      return new Response(JSON.stringify({ error: "Failed to create autopilot run" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[Autopilot] Created run ${newRun.id} with ${totalCards} cards`);

    // Set all products to draft qc_status and attach run_id
    const { error: updateError } = await supabase
      .from("products")
      .update({ 
        qc_status: "draft", 
        run_id: newRun.id,
        flags: {},
        confidence: null,
        batch_number: null,
        generated_at: null
      })
      .eq("batch_id", batch_id)
      .eq("user_id", user.id)
      .is("deleted_at", null);

    if (updateError) {
      console.error("[Autopilot] Failed to update products:", updateError);
    }

    // Trigger the first batch processing (async, don't wait)
    const processUrl = `${supabaseUrl}/functions/v1/process-autopilot-batch`;
    fetch(processUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ run_id: newRun.id }),
    }).catch(err => console.error("[Autopilot] Failed to trigger batch processing:", err));

    return new Response(JSON.stringify({ 
      run_id: newRun.id, 
      status: "started",
      total_cards: totalCards,
      message: `Autopilot started with ${totalCards} products` 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[Autopilot] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
