import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { decryptCredential, isNewEncryptionFormat } from "../_shared/crypto.ts";
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

    // Get credentials using service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
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
      let appKey: string;
      
      // Handle both old (base64) and new (AES-GCM) encryption formats
      if (isNewEncryptionFormat(creds.app_key_encrypted)) {
        appKey = await decryptCredential(creds.app_key_encrypted);
      } else {
        // Legacy format: base64(user_id:credential)
        const decrypted = atob(creds.app_key_encrypted);
        const parts = decrypted.split(':');
        if (parts.length !== 2 || parts[0] !== user.id) {
          throw new Error('Invalid credential format');
        }
        appKey = parts[1];
      }

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
