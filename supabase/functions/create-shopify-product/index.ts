import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Input validation constants
const MAX_PRODUCTS = 100;
const MAX_STRING_LENGTH = 1000;

function sanitizeString(value: unknown, maxLength = MAX_STRING_LENGTH): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') return String(value).slice(0, maxLength);
  return value.slice(0, maxLength).trim();
}

function validateProducts(products: unknown): { valid: boolean; error?: string } {
  if (!Array.isArray(products)) {
    return { valid: false, error: 'Products must be an array' };
  }
  if (products.length === 0) {
    return { valid: false, error: 'At least one product is required' };
  }
  if (products.length > MAX_PRODUCTS) {
    return { valid: false, error: `Maximum ${MAX_PRODUCTS} products allowed per request` };
  }
  return { valid: true };
}

function validateStoreUrl(url: unknown): { valid: boolean; error?: string; sanitized?: string } {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'Shopify store URL is required' };
  }
  let storeUrl = url.trim();
  
  // Convert admin.shopify.com/store/STORE_NAME format to STORE_NAME.myshopify.com
  const adminMatch = storeUrl.match(/admin\.shopify\.com\/store\/([^\/]+)/);
  if (adminMatch) {
    storeUrl = `https://${adminMatch[1]}.myshopify.com`;
  }
  
  // Remove protocol and trailing slash for validation
  const cleaned = storeUrl
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  
  // Validate it's in the correct format
  if (!cleaned.includes('.myshopify.com')) {
    return { valid: false, error: 'Invalid Shopify store URL. Should be like: https://yourstore.myshopify.com' };
  }
  
  // Ensure https:// prefix
  const finalUrl = `https://${cleaned}`;
  return { valid: true, sanitized: finalUrl.replace(/\/$/, '') };
}

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

    // Validate products array
    const productsValidation = validateProducts(products);
    if (!productsValidation.valid) {
      return new Response(
        JSON.stringify({ error: productsValidation.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate store URL
    const urlValidation = validateStoreUrl(shopifyStoreUrl);
    if (!urlValidation.valid) {
      return new Response(
        JSON.stringify({ error: urlValidation.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const storeUrl = urlValidation.sanitized!;

    // Get Shopify access token from server-side secrets
    const shopifyAccessToken = Deno.env.get('SHOPIFY_ACCESS_TOKEN');
    
    if (!shopifyAccessToken) {
      console.error('SHOPIFY_ACCESS_TOKEN secret not configured');
      return new Response(
        JSON.stringify({ error: 'Shopify access token not configured. Please contact your administrator.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Creating ${products.length} products in Shopify using store: ${storeUrl}`);

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
        
        // Sanitize product data
        const sanitizedTitle = sanitizeString(product.title, 200);
        const sanitizedSku = sanitizeString(product.sku, 100);
        const sanitizedBrand = sanitizeString(product.brand, 100);
        const sanitizedGarmentType = sanitizeString(product.garment_type, 100);
        
        console.log(`Processing product ${sanitizedSku}: ${sanitizedTitle}`);
        console.log(`  - ${productImages.length} images`);

        // Build tags array from shopify_tags and collections_tags
        const tags: string[] = [];
        if (product.shopify_tags) {
          tags.push(...product.shopify_tags.split(',').map(t => t.trim()).filter(Boolean));
        }
        if (product.collections_tags) {
          tags.push(...product.collections_tags.split(',').map(t => t.trim()).filter(Boolean));
        }

        // Format description for Shopify - preserve line breaks properly
        const formatDescriptionHtml = (desc: string): string => {
          if (!desc) return '';
          
          // Split into paragraphs on double newlines, then use <br> for single newlines within
          const paragraphs = desc.split(/\n\n+/).filter(Boolean);
          
          return paragraphs.map(para => {
            // Convert single newlines to <br> within each paragraph
            const formatted = para.trim().replace(/\n/g, '<br>');
            return `<p>${formatted}</p>`;
          }).join('');
        };

        // Build Shopify product payload
        const shopifyProduct = {
          product: {
            title: sanitizedTitle || sanitizedSku || 'Untitled Product',
            body_html: formatDescriptionHtml(product.description || ''),
            vendor: sanitizedBrand || 'Kalamazoo Vintage',
            product_type: sanitizedGarmentType || '',
            tags: tags.join(', '),
            variants: [
              {
                price: product.price?.toString() || '0',
                sku: sanitizedSku || '',
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
