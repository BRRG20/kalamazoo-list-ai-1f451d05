import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { encryptCredential } from "../_shared/crypto.ts";
import { verifyAuth, unauthorizedResponse, corsHeaders } from "../_shared/auth.ts";

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authResult = await verifyAuth(req);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse(authResult.error);
    }
    const user = authResult.user;

    // Parse request body
    const { app_key, shared_secret } = await req.json();

    // Validate inputs (max 256 chars, alphanumeric with some special chars)
    if (!app_key || typeof app_key !== 'string' || app_key.length > 256) {
      return new Response(
        JSON.stringify({ error: 'Invalid app_key' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!shared_secret || typeof shared_secret !== 'string' || shared_secret.length > 256) {
      return new Response(
        JSON.stringify({ error: 'Invalid shared_secret' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create service role client for database operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check if user already has credentials
    const { data: existingCreds } = await adminClient
      .from('etsy_credentials')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    // Encrypt credentials using AES-256-GCM
    const encryptedAppKey = await encryptCredential(app_key);
    const encryptedSecret = await encryptCredential(shared_secret);

    if (existingCreds) {
      // Update existing
      const { error: updateError } = await adminClient
        .from('etsy_credentials')
        .update({
          app_key_encrypted: encryptedAppKey,
          shared_secret_encrypted: encryptedSecret,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingCreds.id);

      if (updateError) throw updateError;
    } else {
      // Insert new
      const { error: insertError } = await adminClient
        .from('etsy_credentials')
        .insert({
          user_id: user.id,
          app_key_encrypted: encryptedAppKey,
          shared_secret_encrypted: encryptedSecret,
        });

      if (insertError) throw insertError;
    }

    // Log success (without sensitive data)
    console.log(`Etsy credentials saved for user ${user.id.substring(0, 8)}...`);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error saving Etsy credentials:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to save credentials' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
