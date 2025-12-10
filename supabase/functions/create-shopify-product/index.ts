import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProductPayload {
  id: string;
  title: string;
  description: string;
  price: number | null;
  currency: string;
  sku: string | null;
  brand: string | null;
  garment_type: string | null;
  shopify_tags: string | null;
  collections_tags: string | null;
}

interface ImagePayload {
  url: string;
  position: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { products, images, shopifyStoreUrl } = await req.json();

    // Get Shopify access token from server-side secrets
    const shopifyAccessToken = Deno.env.get('SHOPIFY_ACCESS_TOKEN');
    
    if (!shopifyAccessToken) {
      console.error('SHOPIFY_ACCESS_TOKEN secret not configured');
      return new Response(
        JSON.stringify({ error: 'Shopify access token not configured. Please contact your administrator.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Creating ${products.length} products in Shopify`);

    if (!shopifyStoreUrl) {
      return new Response(
        JSON.stringify({ error: 'Shopify store URL not provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Clean store URL - handle both admin.shopify.com and myshopify.com formats
    let storeUrl = shopifyStoreUrl.trim();
    
    // Convert admin.shopify.com/store/STORE_NAME format to STORE_NAME.myshopify.com
    const adminMatch = storeUrl.match(/admin\.shopify\.com\/store\/([^\/]+)/);
    if (adminMatch) {
      storeUrl = `https://${adminMatch[1]}.myshopify.com`;
      console.log(`Converted admin URL to: ${storeUrl}`);
    }
    
    // Validate it's now in the correct format
    if (!storeUrl.includes('.myshopify.com')) {
      return new Response(
        JSON.stringify({ error: 'Invalid Shopify store URL. Should be like: https://yourstore.myshopify.com or https://admin.shopify.com/store/yourstore' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Ensure https:// prefix exists
    if (!storeUrl.startsWith('https://') && !storeUrl.startsWith('http://')) {
      storeUrl = `https://${storeUrl}`;
    }
    
    // Remove trailing slash
    storeUrl = storeUrl.replace(/\/$/, '');
    
    console.log(`Using Shopify store URL: ${storeUrl}`);

    const results: { 
      productId: string; 
      success: boolean; 
      shopifyProductId?: string; 
      shopifyHandle?: string;
      error?: string;
    }[] = [];

    for (const product of products as ProductPayload[]) {
      try {
        const productImages = (images[product.id] || []) as ImagePayload[];
        
        console.log(`Processing product ${product.sku}: ${product.title}`);
        console.log(`  - ${productImages.length} images`);

        // Build tags array from shopify_tags and collections_tags
        const tags: string[] = [];
        if (product.shopify_tags) {
          tags.push(...product.shopify_tags.split(',').map(t => t.trim()).filter(Boolean));
        }
        if (product.collections_tags) {
          tags.push(...product.collections_tags.split(',').map(t => t.trim()).filter(Boolean));
        }

        // Build Shopify product payload
        const shopifyProduct = {
          product: {
            title: product.title || product.sku || 'Untitled Product',
            body_html: product.description ? `<p>${product.description.replace(/\n/g, '</p><p>')}</p>` : '',
            vendor: product.brand || 'Kalamazoo Vintage',
            product_type: product.garment_type || '',
            tags: tags.join(', '),
            variants: [
              {
                price: product.price?.toString() || '0',
                sku: product.sku || '',
                inventory_quantity: 1,
                inventory_management: 'shopify',
              }
            ],
            images: productImages.map(img => ({
              src: img.url,
              position: img.position,
            })),
          }
        };

        console.log(`  - Sending to Shopify API`);

        // Create product in Shopify
        const shopifyResponse = await fetch(
          `${storeUrl}/admin/api/2024-01/products.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': shopifyAccessToken,
            },
            body: JSON.stringify(shopifyProduct),
          }
        );

        if (!shopifyResponse.ok) {
          const errorText = await shopifyResponse.text();
          console.error(`  - Shopify error: ${shopifyResponse.status} - ${errorText}`);
          results.push({
            productId: product.id,
            success: false,
            error: `Shopify API error: ${shopifyResponse.status}`,
          });
          continue;
        }

        const shopifyData = await shopifyResponse.json();
        const createdProduct = shopifyData.product;

        console.log(`  - Created successfully: ${createdProduct.id}`);

        results.push({
          productId: product.id,
          success: true,
          shopifyProductId: `gid://shopify/Product/${createdProduct.id}`,
          shopifyHandle: createdProduct.handle,
        });

      } catch (productError) {
        console.error(`Error creating product ${product.id}:`, productError);
        results.push({
          productId: product.id,
          success: false,
          error: productError instanceof Error ? productError.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const errorCount = results.filter(r => !r.success).length;

    console.log(`Completed: ${successCount} success, ${errorCount} errors`);

    return new Response(
      JSON.stringify({ results, successCount, errorCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
