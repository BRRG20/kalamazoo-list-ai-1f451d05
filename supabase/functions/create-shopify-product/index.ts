import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { verifyAuth, unauthorizedResponse, corsHeaders } from "../_shared/auth.ts";

// Input validation constants
const MAX_PRODUCTS = 100;
const MAX_STRING_LENGTH = 1000;
const IMAGE_UPLOAD_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

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

// Sleep helper for retry delays
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Upload a single image to a Shopify product with retry logic
async function uploadImageWithRetry(
  storeUrl: string,
  accessToken: string,
  shopifyProductId: string,
  imageUrl: string,
  position: number,
  retries = IMAGE_UPLOAD_RETRIES
): Promise<{ success: boolean; error?: string; imageId?: string }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(
        `${storeUrl}/admin/api/2024-01/products/${shopifyProductId}/images.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken,
          },
          body: JSON.stringify({
            image: {
              src: imageUrl,
              position: position + 1, // Shopify positions are 1-indexed
            }
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        return { success: true, imageId: data.image?.id?.toString() };
      }

      const errorText = await response.text();
      console.error(`Image upload attempt ${attempt}/${retries} failed: ${response.status} - ${errorText}`);
      
      // If it's a 4xx error (client error), don't retry
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return { success: false, error: `Image upload failed: ${response.status} - ${errorText}` };
      }

      // Wait before retry (exponential backoff)
      if (attempt < retries) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    } catch (error) {
      console.error(`Image upload attempt ${attempt}/${retries} error:`, error);
      if (attempt < retries) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  return { success: false, error: `Failed to upload image after ${retries} attempts` };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication before processing
    const authResult = await verifyAuth(req);
    if (!authResult.authenticated) {
      return unauthorizedResponse(authResult.error);
    }

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
      imageResults?: { url: string; success: boolean; error?: string }[];
    }[] = [];

    for (const product of products as ProductPayload[]) {
      try {
        const productImages = (images[product.id] || []) as ImagePayload[];
        
        // Sort images by position to maintain order
        productImages.sort((a, b) => a.position - b.position);
        
        // Sanitize product data
        const sanitizedTitle = sanitizeString(product.title, 200);
        const sanitizedSku = sanitizeString(product.sku, 100);
        const sanitizedBrand = sanitizeString(product.brand, 100);
        const sanitizedGarmentType = sanitizeString(product.garment_type, 100);
        
        console.log(`Processing product ${sanitizedSku}: ${sanitizedTitle}`);
        console.log(`  - ${productImages.length} images to upload`);

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

        // STEP 1: Create product WITHOUT images first
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
            // Do NOT include images here - we'll upload them separately for reliability
          }
        };

        console.log(`  - Creating product in Shopify (without images)`);

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
          console.error(`  - Shopify product creation error: ${shopifyResponse.status} - ${errorText}`);
          results.push({
            productId: product.id,
            success: false,
            error: `Shopify API error: ${shopifyResponse.status} - ${errorText}`,
          });
          continue;
        }

        const shopifyData = await shopifyResponse.json();
        const createdProduct = shopifyData.product;
        const shopifyProductId = createdProduct.id.toString();

        console.log(`  - Product created: ${shopifyProductId}`);

        // STEP 2: Upload images one by one with retry logic
        const imageResults: { url: string; success: boolean; error?: string }[] = [];
        let allImagesSuccess = true;

        for (let i = 0; i < productImages.length; i++) {
          const img = productImages[i];
          console.log(`  - Uploading image ${i + 1}/${productImages.length}: ${img.url.substring(0, 50)}...`);
          
          const result = await uploadImageWithRetry(
            storeUrl,
            shopifyAccessToken,
            shopifyProductId,
            img.url,
            i // Use array index for position to ensure correct order
          );

          imageResults.push({
            url: img.url,
            success: result.success,
            error: result.error,
          });

          if (!result.success) {
            allImagesSuccess = false;
            console.error(`  - Failed to upload image ${i + 1}: ${result.error}`);
          } else {
            console.log(`  - Image ${i + 1} uploaded successfully`);
          }

          // Small delay between images to avoid rate limiting
          if (i < productImages.length - 1) {
            await sleep(200);
          }
        }

        // STEP 3: Verify images were attached by fetching product
        console.log(`  - Verifying images on Shopify product`);
        const verifyResponse = await fetch(
          `${storeUrl}/admin/api/2024-01/products/${shopifyProductId}.json`,
          {
            method: 'GET',
            headers: {
              'X-Shopify-Access-Token': shopifyAccessToken,
            },
          }
        );

        let verifiedImageCount = 0;
        if (verifyResponse.ok) {
          const verifyData = await verifyResponse.json();
          verifiedImageCount = verifyData.product?.images?.length || 0;
          console.log(`  - Verified ${verifiedImageCount}/${productImages.length} images on Shopify`);
        }

        // Determine overall success
        const partialSuccess = imageResults.some(r => r.success);
        const hasImageErrors = imageResults.some(r => !r.success);

        if (!allImagesSuccess && productImages.length > 0) {
          const failedCount = imageResults.filter(r => !r.success).length;
          console.warn(`  - Product created with ${failedCount} failed image(s)`);
        }

        results.push({
          productId: product.id,
          success: true, // Product was created successfully
          shopifyProductId: `gid://shopify/Product/${shopifyProductId}`,
          shopifyHandle: createdProduct.handle,
          imageResults: imageResults,
          error: hasImageErrors 
            ? `Product created but ${imageResults.filter(r => !r.success).length}/${productImages.length} images failed` 
            : undefined,
        });

      } catch (productError) {
        console.error(`Error creating product ${product.id}:`, productError);
        results.push({
          productId: product.id,
          success: false,
          error: productError instanceof Error ? productError.message : 'Unknown error',
        });
      }

      // Delay between products to avoid rate limiting
      await sleep(300);
    }

    const successCount = results.filter(r => r.success).length;
    const errorCount = results.filter(r => !r.success).length;
    const partialCount = results.filter(r => r.success && r.error).length;

    console.log(`Completed: ${successCount} success (${partialCount} with image warnings), ${errorCount} errors`);

    return new Response(
      JSON.stringify({ results, successCount, errorCount, partialCount }),
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
