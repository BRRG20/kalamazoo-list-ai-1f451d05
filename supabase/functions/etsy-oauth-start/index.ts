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
        JSON.stringify({ error: 'Not authenticated' }),
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
        JSON.stringify({ error: 'No credentials configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt app key
    let appKey: string;
    try {
      const decrypted = atob(creds.app_key_encrypted);
      const parts = decrypted.split(':');
      if (parts.length !== 2 || parts[0] !== user.id) {
        throw new Error('Invalid credential format');
      }
      appKey = parts[1];
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid credentials' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get integration settings
    const { data: settings } = await supabase
      .from('integration_settings')
      .select('environment')
      .eq('user_id', user.id)
      .eq('integration_type', 'etsy')
      .maybeSingle();

    const environment = settings?.environment || 'production';
    
    // Build OAuth URL
    const redirectUri = req.headers.get('origin') 
      ? `${req.headers.get('origin')}/auth/etsy/callback`
      : 'https://kalamazoo-lister.lovable.app/auth/etsy/callback';
    
    // Etsy OAuth 2.0 parameters
    const state = btoa(JSON.stringify({ 
      user_id: user.id,
      timestamp: Date.now(),
    }));
    
    const scope = 'listings_r listings_w shops_r shops_w';
    
    // Build the authorization URL
    // Note: For production, you'd use the actual Etsy OAuth endpoint
    const baseUrl = environment === 'sandbox' 
      ? 'https://www.etsy.com/oauth/connect' // Etsy doesn't have separate sandbox
      : 'https://www.etsy.com/oauth/connect';
    
    const authUrl = new URL(baseUrl);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', appKey);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    
    // Generate PKCE code verifier and challenge
    const codeVerifier = crypto.randomUUID() + crypto.randomUUID();
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const base64Digest = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    authUrl.searchParams.set('code_challenge', base64Digest);

    // Store code verifier for later use in token exchange
    await adminClient
      .from('etsy_credentials')
      .update({
        // Store verifier temporarily (will be used in callback)
        access_token_encrypted: btoa(`verifier:${codeVerifier}`),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    console.log(`OAuth flow started for user ${user.id.substring(0, 8)}...`);

    return new Response(
      JSON.stringify({ auth_url: authUrl.toString() }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error starting OAuth:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to start OAuth flow' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
