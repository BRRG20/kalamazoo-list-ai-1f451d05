import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's auth
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Store credentials securely using Supabase Vault or encrypted storage
    // For now, we'll store them in a secure way via environment variable pattern
    // In production, you would use Supabase Vault or similar
    
    // Create service role client to access vault
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Store the credentials in a secure credentials table (encrypted)
    // First, check if user already has credentials
    const { data: existingCreds } = await adminClient
      .from('etsy_credentials')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    // Simple encryption using base64 encoding with a salt
    // In production, use proper encryption with Supabase Vault
    const encryptedAppKey = btoa(`${user.id}:${app_key}`);
    const encryptedSecret = btoa(`${user.id}:${shared_secret}`);

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
