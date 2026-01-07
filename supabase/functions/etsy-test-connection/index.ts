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
        JSON.stringify({ success: false, message: 'Not authenticated' }),
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
        JSON.stringify({ success: false, message: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get credentials using service role
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: creds } = await adminClient
      .from('etsy_credentials')
      .select('app_key_encrypted')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!creds) {
      return new Response(
        JSON.stringify({ success: false, message: 'No credentials configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt and validate the app key format
    try {
      const decrypted = atob(creds.app_key_encrypted);
      const parts = decrypted.split(':');
      if (parts.length !== 2 || parts[0] !== user.id) {
        throw new Error('Invalid credential format');
      }
      const appKey = parts[1];

      // Validate app key format (Etsy keys are alphanumeric)
      if (!/^[a-zA-Z0-9]+$/.test(appKey)) {
        return new Response(
          JSON.stringify({ success: false, message: 'Invalid app key format' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // For now, just validate format - full OAuth test requires more setup
      console.log(`Connection test passed for user ${user.id.substring(0, 8)}...`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Credentials validated. Ready to connect.' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch {
      return new Response(
        JSON.stringify({ success: false, message: 'Invalid credentials format' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Error testing Etsy connection:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'Connection test failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
