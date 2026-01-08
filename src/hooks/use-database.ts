import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Batch, Product, ProductImage, Settings, ProductStatus, Department, Era, Condition } from '@/types';

// Constants for upload limits
export const UPLOAD_LIMITS = {
  RECOMMENDED_IMAGES_PER_BATCH: 200,
  WARNING_THRESHOLD: 300,
  RECOMMENDED_PRODUCTS_FOR_AI: 20,
};

// Export validation - check what's missing for Shopify export
export interface ExportValidation {
  isValid: boolean;
  missingFields: string[];
  warnings: string[];
}

export function validateProductForExport(product: Product, imageCount: number): ExportValidation {
  const missingFields: string[] = [];
  const warnings: string[] = [];
  
  if (!product.title || product.title.trim() === '') missingFields.push('title');
  if (!product.price || product.price <= 0) missingFields.push('price');
  if (imageCount === 0) missingFields.push('images');
  
  // Warnings (not blocking but flagged)
  if (!product.brand) warnings.push('brand');
  if (!product.department) warnings.push('department');
  if (!product.garment_type) warnings.push('type');
  if (!product.pit_to_pit) warnings.push('pit to pit');
  if (!product.description_style_a && !product.description) warnings.push('description');
  
  return {
    isValid: missingFields.length === 0,
    missingFields,
    warnings,
  };
}

// Helper to get current user ID
async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// Helper to map DB rows to typed objects
function mapBatch(row: any): Batch {
  return {
    id: row.id,
    name: row.name,
    notes: row.notes || '',
    created_at: row.created_at,
  };
}

function mapProduct(row: any): Product {
  return {
    id: row.id,
    batch_id: row.batch_id,
    sku: row.sku || '',
    status: row.status as ProductStatus,
    raw_input_text: row.raw_input_text || '',
    title: row.title || '',
    description: row.description || '',
    description_style_a: row.description_style_a || row.description || '',
    description_style_b: row.description_style_b || row.listing_block || '',
    price: parseFloat(row.price) || 0,
    currency: row.currency || 'GBP',
    era: (row.era || '') as Era,
    garment_type: row.garment_type || '',
    department: (row.department || '') as Department,
    brand: row.brand || '',
    colour_main: row.colour_main || '',
    colour_secondary: row.colour_secondary || '',
    pattern: row.pattern || '',
    size_label: row.size_label || '',
    size_recommended: row.size_recommended || '',
    fit: row.fit || '',
    material: row.material || '',
    condition: (row.condition || '') as Condition,
    flaws: row.flaws || '',
    pit_to_pit: row.pit_to_pit || '',
    made_in: row.made_in || '',
    notes: row.notes || '',
    shopify_tags: row.shopify_tags || '',
    etsy_tags: row.etsy_tags || '',
    collections_tags: row.collections_tags || '',
    shopify_product_id: row.shopify_product_id,
    shopify_handle: row.shopify_handle,
    listing_block: row.listing_block || '',
    // Marketplace fields
    etsy_listing_id: row.etsy_listing_id,
    etsy_listing_state: row.etsy_listing_state,
    ebay_listing_id: row.ebay_listing_id,
    ebay_listing_state: row.ebay_listing_state,
    sleeve_length: row.sleeve_length || '',
    style: row.style || '',
    size_type: row.size_type || '',
    who_made: row.who_made || '',
    when_made: row.when_made || '',
    category_path: row.category_path || '',
    // Hidden state - persisted in database
    is_hidden: row.is_hidden || false,
  };
}

function mapImage(row: any): ProductImage {
  return {
    id: row.id,
    product_id: row.product_id || '',
    url: row.url,
    position: row.position,
    include_in_shopify: row.include_in_shopify,
  };
}

function mapSettings(row: any): Settings {
  return {
    id: row.id,
    shopify_store_url: row.shopify_store_url || '',
    default_images_per_product: row.default_images_per_product || 9,
    default_currency: row.default_currency || 'GBP',
  };
}

// Generate listing block
export function generateListingBlock(product: Product): string {
  const lines: string[] = [];
  
  lines.push(`Title: ${product.title || 'Untitled'}`);
  lines.push(`Price: £${product.price || 0}`);
  
  if (product.era && product.era !== 'Modern') {
    lines.push(`Era: ${product.era}`);
  }
  
  if (product.garment_type) lines.push(`Garment: ${product.garment_type}`);
  if (product.department) lines.push(`Department: ${product.department}`);
  if (product.brand) lines.push(`Brand: ${product.brand}`);
  if (product.material) lines.push(`Material: ${product.material}`);
  
  const colours = [product.colour_main, product.colour_secondary].filter(Boolean).join(', ');
  if (colours) lines.push(`Colour: ${colours}`);
  
  if (product.size_label) lines.push(`Size (label): ${product.size_label}`);
  if (product.size_recommended) lines.push(`Size (recommended): ${product.size_recommended}`);
  if (product.fit) lines.push(`Fit: ${product.fit}`);
  if (product.condition) lines.push(`Condition: ${product.condition}`);
  lines.push(`Flaws: ${product.flaws || 'None noted'}`);
  
  lines.push('');
  lines.push('Description:');
  lines.push(product.description || 'No description');
  
  return lines.join('\n');
}

// Batches Hook
export function useBatches() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBatches = useCallback(async () => {
    const { data, error } = await supabase
      .from('batches')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching batches:', error);
      toast.error('Failed to load batches');
      return;
    }
    
    setBatches((data || []).map(mapBatch));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  const createBatch = async (name: string, notes: string = '') => {
    const userId = await getCurrentUserId();
    if (!userId) {
      toast.error('You must be logged in');
      return null;
    }

    const { data, error } = await supabase
      .from('batches')
      .insert({ name, notes, user_id: userId })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating batch:', error);
      toast.error('Failed to create batch');
      return null;
    }
    
    const newBatch = mapBatch(data);
    setBatches(prev => [newBatch, ...prev]);
    return newBatch;
  };

  const updateBatch = async (id: string, updates: { name?: string; notes?: string }) => {
    const { error } = await supabase
      .from('batches')
      .update(updates)
      .eq('id', id);
    
    if (error) {
      console.error('Error updating batch:', error);
      toast.error('Failed to update batch');
      return false;
    }
    
    setBatches(prev => prev.map(b => 
      b.id === id ? { ...b, ...updates } : b
    ));
    return true;
  };

  const deleteBatch = async (id: string) => {
    const { error } = await supabase
      .from('batches')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting batch:', error);
      toast.error('Failed to delete batch');
      return false;
    }
    
    setBatches(prev => prev.filter(b => b.id !== id));
    return true;
  };

  const getProductCount = async (batchId: string) => {
    const { count, error } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('batch_id', batchId);
    
    if (error) return 0;
    return count || 0;
  };

  return { batches, loading, createBatch, updateBatch, deleteBatch, getProductCount, refetch: fetchBatches };
}

// Products Hook with mutation locking
export function useProducts(batchId: string | null) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const mutationLockRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Acquire mutation lock - returns true if lock acquired, false if already locked
  const acquireLock = useCallback((): boolean => {
    if (mutationLockRef.current) {
      console.warn('Mutation already in progress, skipping');
      return false;
    }
    mutationLockRef.current = true;
    setIsMutating(true);
    return true;
  }, []);

  // Release mutation lock
  const releaseLock = useCallback(() => {
    mutationLockRef.current = false;
    setIsMutating(false);
  }, []);

  const fetchProducts = useCallback(async () => {
    if (!batchId) {
      setProducts([]);
      return;
    }
    
    // Cancel any in-flight requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('batch_id', batchId)
      .eq('is_hidden', false) // CRITICAL: Only fetch non-hidden products
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching products:', error);
      toast.error('Failed to load products');
      setLoading(false);
      return;
    }
    
    setProducts((data || []).map(mapProduct));
    setLoading(false);
  }, [batchId]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // DEPRECATED: Use createProductWithImages instead to prevent empty products
  const createProduct = async (sku: string) => {
    console.warn('DEPRECATED: createProduct called without images. Use createProductWithImages instead.');
    if (!batchId) return null;
    
    const userId = await getCurrentUserId();
    if (!userId) {
      toast.error('You must be logged in');
      return null;
    }

    const { data, error } = await supabase
      .from('products')
      .insert({ 
        batch_id: batchId, 
        sku,
        status: 'new',
        currency: 'GBP',
        user_id: userId,
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating product:', error);
      return null;
    }
    
    const newProduct = mapProduct(data);
    setProducts(prev => [...prev, newProduct]);
    return newProduct;
  };

  /**
   * ENFORCED SINGLE FUNCTION: Creates a product WITH images in one atomic operation.
   * This is the ONLY way to create a product - prevents empty products.
   * @param imageUrls - Array of image URLs to attach (MUST have at least 1)
   * @throws Error if imageUrls is empty
   */
  const createProductWithImages = async (imageUrls: string[]): Promise<Product | null> => {
    // HARD GUARD: Cannot create product with 0 images
    if (!imageUrls || imageUrls.length === 0) {
      console.error('BLOCKED: Attempted to create product with 0 images');
      toast.error('Cannot create a product with 0 images');
      throw new Error('Cannot create a product with 0 images');
    }

    if (!batchId) {
      console.error('No batch ID for product creation');
      return null;
    }
    
    const userId = await getCurrentUserId();
    if (!userId) {
      toast.error('You must be logged in');
      return null;
    }

    // Step 1: Create the product (SKU will be generated after AI categorization)
    const { data: productData, error: productError } = await supabase
      .from('products')
      .insert({ 
        batch_id: batchId, 
        sku: null, // SKU generated after AI categorization with proper format
        status: 'new',
        currency: 'GBP',
        user_id: userId,
      })
      .select()
      .single();
    
    if (productError || !productData) {
      console.error('Error creating product:', productError);
      toast.error('Failed to create product');
      return null;
    }

    const newProduct = mapProduct(productData);

    // Step 2: Link ALL images to this product (update existing image records)
    let linkedCount = 0;
    for (let i = 0; i < imageUrls.length; i++) {
      const { error: updateError } = await supabase
        .from('images')
        .update({ product_id: newProduct.id, position: i })
        .eq('url', imageUrls[i])
        .eq('batch_id', batchId);
      
      if (!updateError) {
        linkedCount++;
      } else {
        console.error('Error linking image:', updateError);
      }
    }

    // Step 3: SAFETY CHECK - If no images were linked, delete the product immediately
    if (linkedCount === 0) {
      console.error('SAFETY: No images were linked, deleting empty product');
      await supabase.from('products').delete().eq('id', newProduct.id);
      toast.error('Failed to link images to product');
      return null;
    }

    console.log(`Created product ${newProduct.id} with ${linkedCount} images`);
    setProducts(prev => [...prev, newProduct]);
    return newProduct;
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    // Filter out undefined values and map to DB column names
    const dbUpdates: Record<string, any> = {};
    
    if (updates.sku !== undefined) dbUpdates.sku = updates.sku;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.raw_input_text !== undefined) dbUpdates.raw_input_text = updates.raw_input_text;
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.description_style_a !== undefined) dbUpdates.description_style_a = updates.description_style_a;
    if (updates.description_style_b !== undefined) dbUpdates.description_style_b = updates.description_style_b;
    if (updates.price !== undefined) dbUpdates.price = updates.price;
    if (updates.currency !== undefined) dbUpdates.currency = updates.currency;
    if (updates.era !== undefined) dbUpdates.era = updates.era || null;
    if (updates.garment_type !== undefined) dbUpdates.garment_type = updates.garment_type;
    if (updates.department !== undefined) dbUpdates.department = updates.department;
    if (updates.brand !== undefined) dbUpdates.brand = updates.brand;
    if (updates.colour_main !== undefined) dbUpdates.colour_main = updates.colour_main;
    if (updates.colour_secondary !== undefined) dbUpdates.colour_secondary = updates.colour_secondary;
    if (updates.pattern !== undefined) dbUpdates.pattern = updates.pattern;
    if (updates.size_label !== undefined) dbUpdates.size_label = updates.size_label;
    if (updates.size_recommended !== undefined) dbUpdates.size_recommended = updates.size_recommended;
    if (updates.fit !== undefined) dbUpdates.fit = updates.fit;
    if (updates.material !== undefined) dbUpdates.material = updates.material;
    if (updates.condition !== undefined) dbUpdates.condition = updates.condition || null;
    if (updates.flaws !== undefined) dbUpdates.flaws = updates.flaws;
    if (updates.made_in !== undefined) dbUpdates.made_in = updates.made_in;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
    if (updates.shopify_tags !== undefined) dbUpdates.shopify_tags = updates.shopify_tags;
    if (updates.etsy_tags !== undefined) dbUpdates.etsy_tags = updates.etsy_tags;
    if (updates.collections_tags !== undefined) dbUpdates.collections_tags = updates.collections_tags;
    if (updates.shopify_product_id !== undefined) dbUpdates.shopify_product_id = updates.shopify_product_id;
    if (updates.shopify_handle !== undefined) dbUpdates.shopify_handle = updates.shopify_handle;
    if (updates.listing_block !== undefined) dbUpdates.listing_block = updates.listing_block;
    if (updates.pit_to_pit !== undefined) dbUpdates.pit_to_pit = updates.pit_to_pit;
    // Marketplace fields
    if (updates.etsy_listing_id !== undefined) dbUpdates.etsy_listing_id = updates.etsy_listing_id;
    if (updates.etsy_listing_state !== undefined) dbUpdates.etsy_listing_state = updates.etsy_listing_state;
    if (updates.ebay_listing_id !== undefined) dbUpdates.ebay_listing_id = updates.ebay_listing_id;
    if (updates.ebay_listing_state !== undefined) dbUpdates.ebay_listing_state = updates.ebay_listing_state;
    if (updates.sleeve_length !== undefined) dbUpdates.sleeve_length = updates.sleeve_length;
    if (updates.style !== undefined) dbUpdates.style = updates.style;
    if (updates.size_type !== undefined) dbUpdates.size_type = updates.size_type;
    if (updates.who_made !== undefined) dbUpdates.who_made = updates.who_made;
    if (updates.when_made !== undefined) dbUpdates.when_made = updates.when_made;
    if (updates.category_path !== undefined) dbUpdates.category_path = updates.category_path;
    
    const { error } = await supabase
      .from('products')
      .update(dbUpdates)
      .eq('id', id);
    
    if (error) {
      console.error('Error updating product:', error);
      toast.error('Failed to update product');
      return false;
    }
    
    setProducts(prev => prev.map(p => 
      p.id === id ? { ...p, ...updates } : p
    ));
    return true;
  };

  const deleteProduct = async (id: string) => {
    // Soft delete: set deleted_at timestamp instead of actually deleting
    const { error } = await supabase
      .from('products')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    
    if (error) {
      console.error('Error soft-deleting product:', error);
      return false;
    }
    
    setProducts(prev => prev.filter(p => p.id !== id));
    return true;
  };

  const permanentlyDeleteProduct = async (id: string) => {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error permanently deleting product:', error);
      return false;
    }
    
    return true;
  };

  /**
   * Delete products that have 0 images attached.
   * SAFE GUARD: Only deletes products that:
   * 1. Have 0 images
   * 2. Have no title or user-entered data
   * 3. Were created in the last hour (automation-created)
   */
  const deleteEmptyProducts = async (): Promise<number> => {
    if (!batchId) return 0;
    
    // Prevent concurrent cleanup
    if (!acquireLock()) return 0;
    
    try {
      // Find all products in this batch with minimal data (likely automation-created)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      
      const { data: batchProducts, error: fetchError } = await supabase
        .from('products')
        .select('id, title, brand, description, created_at')
        .eq('batch_id', batchId)
        .is('deleted_at', null)
        .gte('created_at', oneHourAgo); // Only recently created products
      
      if (fetchError || !batchProducts || !Array.isArray(batchProducts)) {
        console.error('Error fetching products for cleanup:', fetchError);
        return 0;
      }
      
      let deletedCount = 0;
      const productsToCheck: string[] = [];
      
      // Pre-filter: only check products with no user-entered data
      for (const product of batchProducts) {
        if (!product || !product.id) continue;
        
        // Skip if product has user-entered data
        if (product.title && product.title.trim() !== '') continue;
        if (product.brand && product.brand.trim() !== '') continue;
        if (product.description && product.description.trim() !== '') continue;
        
        productsToCheck.push(product.id);
      }
      
      // Check image count only for candidates
      for (const productId of productsToCheck) {
        const { count, error: countError } = await supabase
          .from('images')
          .select('id', { count: 'exact', head: true })
          .eq('product_id', productId);
        
        if (!countError && count === 0) {
          // This product has 0 images AND no user data - safe to delete
          const { error: deleteError } = await supabase
            .from('products')
            .delete()
            .eq('id', productId);
          
          if (!deleteError) {
            deletedCount++;
            console.log(`Auto-deleted empty product: ${productId}`);
          } else {
            console.error('Error deleting empty product:', productId, deleteError);
          }
        }
      }
      
      if (deletedCount > 0) {
        // Update local state only - don't trigger full refetch
        setProducts(prev => prev.filter(p => !productsToCheck.includes(p.id) || 
          (p.title && p.title.trim() !== '') || 
          (p.brand && p.brand.trim() !== '')));
      }
      
      return deletedCount;
    } catch (error) {
      console.error('Error in deleteEmptyProducts:', error);
      return 0;
    } finally {
      releaseLock();
    }
  };

  /**
   * Hide a product - permanently removes from visible list
   * Can ONLY be unhidden via explicit user action
   */
  const hideProduct = async (id: string, showToast: boolean = true): Promise<boolean> => {
    const { error } = await supabase
      .from('products')
      .update({ is_hidden: true })
      .eq('id', id);
    
    if (error) {
      console.error('Error hiding product:', error);
      toast.error('Failed to hide product');
      return false;
    }
    
    // Remove from local state immediately
    setProducts(prev => prev.filter(p => p.id !== id));
    if (showToast) {
      toast.success('Product hidden');
    }
    return true;
  };

  /**
   * Unhide a product - only available in hidden products view
   * Explicit user action required
   */
  const unhideProduct = async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('products')
      .update({ is_hidden: false })
      .eq('id', id);
    
    if (error) {
      console.error('Error unhiding product:', error);
      toast.error('Failed to unhide product');
      return false;
    }
    
    toast.success('Product unhidden');
    return true;
  };

  return { 
    products, 
    loading,
    isMutating,
    acquireLock,
    releaseLock,
    createProduct, 
    createProductWithImages,
    updateProduct, 
    deleteProduct, 
    permanentlyDeleteProduct, 
    deleteEmptyProducts,
    hideProduct,
    unhideProduct,
    refetch: fetchProducts 
  };
}

// Deleted Products Hook (for recovery)
export function useDeletedProducts(batchId: string | null) {
  const [deletedProducts, setDeletedProducts] = useState<(Product & { deleted_at: string })[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDeletedProducts = useCallback(async () => {
    if (!batchId) {
      setDeletedProducts([]);
      return;
    }
    
    setLoading(true);
    // Use RPC or direct query with explicit filter to bypass default RLS
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('batch_id', batchId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching deleted products:', error);
      setLoading(false);
      return;
    }
    
    setDeletedProducts((data || []).map(row => ({
      ...mapProduct(row),
      deleted_at: row.deleted_at,
    })));
    setLoading(false);
  }, [batchId]);

  useEffect(() => {
    fetchDeletedProducts();
  }, [fetchDeletedProducts]);

  const recoverProduct = async (id: string) => {
    const { error } = await supabase
      .from('products')
      .update({ deleted_at: null })
      .eq('id', id);
    
    if (error) {
      console.error('Error recovering product:', error);
      toast.error('Failed to recover product');
      return false;
    }
    
    setDeletedProducts(prev => prev.filter(p => p.id !== id));
    toast.success('Product recovered successfully');
    return true;
  };

  const permanentlyDelete = async (id: string) => {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error permanently deleting product:', error);
      toast.error('Failed to permanently delete product');
      return false;
    }
    
    setDeletedProducts(prev => prev.filter(p => p.id !== id));
    toast.success('Product permanently deleted');
    return true;
  };

  const emptyTrash = async () => {
    if (deletedProducts.length === 0) return;
    
    const ids = deletedProducts.map(p => p.id);
    const { error } = await supabase
      .from('products')
      .delete()
      .in('id', ids);
    
    if (error) {
      console.error('Error emptying trash:', error);
      toast.error('Failed to empty trash');
      return false;
    }
    
    setDeletedProducts([]);
    toast.success('Trash emptied successfully');
    return true;
  };

  return { 
    deletedProducts, 
    loading, 
    recoverProduct, 
    permanentlyDelete, 
    emptyTrash, 
    refetch: fetchDeletedProducts 
  };
}

// Hidden Products Hook (for viewing/unhiding hidden products)
export function useHiddenProducts(batchId: string | null) {
  const [hiddenProducts, setHiddenProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchHiddenProducts = useCallback(async () => {
    if (!batchId) {
      setHiddenProducts([]);
      return;
    }
    
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('batch_id', batchId)
      .eq('is_hidden', true)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching hidden products:', error);
      setLoading(false);
      return;
    }
    
    setHiddenProducts((data || []).map(mapProduct));
    setLoading(false);
  }, [batchId]);

  useEffect(() => {
    fetchHiddenProducts();
  }, [fetchHiddenProducts]);

  const unhideProduct = async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('products')
      .update({ is_hidden: false })
      .eq('id', id);
    
    if (error) {
      console.error('Error unhiding product:', error);
      toast.error('Failed to unhide product');
      return false;
    }
    
    setHiddenProducts(prev => prev.filter(p => p.id !== id));
    toast.success('Product unhidden');
    return true;
  };

  return { 
    hiddenProducts, 
    loading, 
    unhideProduct,
    refetch: fetchHiddenProducts 
  };
}

// Images Hook
export function useImages() {
  const [imageCache, setImageCache] = useState<Record<string, ProductImage[]>>({});

  const fetchImagesForProduct = useCallback(async (productId: string): Promise<ProductImage[]> => {
    // Always fetch fresh from database to ensure consistency
    const { data, error } = await supabase
      .from('images')
      .select('*')
      .eq('product_id', productId)
      .order('position', { ascending: true });
    
    if (error) {
      console.error('Error fetching images:', error);
      return [];
    }
    
    const images = (data || []).map(mapImage);
    setImageCache(prev => ({ ...prev, [productId]: images }));
    return images;
  }, []);

  const fetchImagesForBatch = useCallback(async (batchId: string): Promise<ProductImage[]> => {
    const { data, error } = await supabase
      .from('images')
      .select('*')
      .eq('batch_id', batchId)
      .order('position', { ascending: true });
    
    if (error) {
      console.error('Error fetching batch images:', error);
      return [];
    }
    
    return (data || []).map(mapImage);
  }, []);

  const addImage = async (productId: string, batchId: string, url: string, position: number) => {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user ID for image upload');
      return null;
    }

    const { data, error } = await supabase
      .from('images')
      .insert({ 
        product_id: productId, 
        batch_id: batchId,
        url, 
        position,
        include_in_shopify: true,
        user_id: userId,
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error adding image:', error);
      return null;
    }
    
    const newImage = mapImage(data);
    setImageCache(prev => ({
      ...prev,
      [productId]: [...(prev[productId] || []), newImage].sort((a, b) => a.position - b.position),
    }));
    return newImage;
  };

  const addImageToBatch = async (batchId: string, url: string, position: number) => {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user ID for image upload');
      return null;
    }

    const { data, error } = await supabase
      .from('images')
      .insert({ 
        product_id: null, 
        batch_id: batchId,
        url, 
        position,
        include_in_shopify: true,
        user_id: userId,
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error adding image to batch:', error);
      return null;
    }
    
    return mapImage(data);
  };

  const updateImage = async (id: string, productId: string, updates: Partial<ProductImage>) => {
    const dbUpdates: Record<string, any> = {};
    if (updates.position !== undefined) dbUpdates.position = updates.position;
    if (updates.include_in_shopify !== undefined) dbUpdates.include_in_shopify = updates.include_in_shopify;

    const { error } = await supabase
      .from('images')
      .update(dbUpdates)
      .eq('id', id);
    
    if (error) {
      console.error('Error updating image:', error);
      return false;
    }
    
    setImageCache(prev => ({
      ...prev,
      [productId]: (prev[productId] || []).map(img => 
        img.id === id ? { ...img, ...updates } : img
      ).sort((a, b) => a.position - b.position),
    }));
    return true;
  };

  const updateImageProductId = async (imageId: string, newProductId: string | null, position: number) => {
    const { error } = await supabase
      .from('images')
      .update({ product_id: newProductId, position })
      .eq('id', imageId);
    
    if (error) {
      console.error('Error updating image product:', error);
      return false;
    }
    
    return true;
  };

  const updateImageProductIdByUrl = async (imageUrl: string, newProductId: string | null, position: number) => {
    const { error } = await supabase
      .from('images')
      .update({ product_id: newProductId, position })
      .eq('url', imageUrl);
    
    if (error) {
      console.error('Error updating image product by URL:', error);
      return false;
    }
    
    return true;
  };

  const deleteImage = async (id: string) => {
    // Soft delete: set deleted_at timestamp instead of permanently deleting
    const { error } = await supabase
      .from('images')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    
    if (error) {
      console.error('Error soft-deleting image:', error);
      return false;
    }
    
    // Clear all caches since we don't know which product this was in
    setImageCache({});
    return true;
  };

  const permanentlyDeleteImage = async (id: string) => {
    const { error } = await supabase
      .from('images')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error permanently deleting image:', error);
      return false;
    }
    
    return true;
  };

  const recoverImage = async (id: string) => {
    const { error } = await supabase
      .from('images')
      .update({ deleted_at: null })
      .eq('id', id);
    
    if (error) {
      console.error('Error recovering image:', error);
      return false;
    }
    
    // Clear cache to force refetch
    setImageCache({});
    return true;
  };

  const excludeLastNImages = async (productId: string, n: number) => {
    const images = await fetchImagesForProduct(productId);
    const sortedImages = [...images].sort((a, b) => b.position - a.position);
    const toExclude = sortedImages.slice(0, n);
    
    for (const img of toExclude) {
      await updateImage(img.id, productId, { include_in_shopify: false });
    }
  };

  const clearCache = (productId?: string) => {
    if (productId) {
      setImageCache(prev => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
    } else {
      setImageCache({});
    }
  };

  return { 
    fetchImagesForProduct, 
    fetchImagesForBatch,
    addImage, 
    addImageToBatch,
    updateImage, 
    updateImageProductId,
    updateImageProductIdByUrl,
    deleteImage,
    permanentlyDeleteImage,
    recoverImage,
    excludeLastNImages, 
    clearCache, 
    imageCache 
  };
}

// Deleted Images Hook (for recovery)
export function useDeletedImages(batchId: string | null) {
  const [deletedImages, setDeletedImages] = useState<(ProductImage & { deleted_at: string })[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDeletedImages = useCallback(async () => {
    if (!batchId) {
      setDeletedImages([]);
      return;
    }
    
    setLoading(true);
    // Query deleted images for this batch
    const { data, error } = await supabase
      .from('images')
      .select('*')
      .eq('batch_id', batchId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching deleted images:', error);
      setLoading(false);
      return;
    }
    
    setDeletedImages((data || []).map(row => ({
      ...mapImage(row),
      deleted_at: row.deleted_at,
    })));
    setLoading(false);
  }, [batchId]);

  useEffect(() => {
    fetchDeletedImages();
  }, [fetchDeletedImages]);

  const recoverImage = async (id: string) => {
    const { error } = await supabase
      .from('images')
      .update({ deleted_at: null })
      .eq('id', id);
    
    if (error) {
      console.error('Error recovering image:', error);
      toast.error('Failed to recover image');
      return false;
    }
    
    setDeletedImages(prev => prev.filter(img => img.id !== id));
    toast.success('Image recovered successfully');
    return true;
  };

  const permanentlyDelete = async (id: string) => {
    const { error } = await supabase
      .from('images')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error permanently deleting image:', error);
      toast.error('Failed to permanently delete image');
      return false;
    }
    
    setDeletedImages(prev => prev.filter(img => img.id !== id));
    toast.success('Image permanently deleted');
    return true;
  };

  const emptyImageTrash = async () => {
    if (deletedImages.length === 0) return true;
    
    const ids = deletedImages.map(img => img.id);
    const { error } = await supabase
      .from('images')
      .delete()
      .in('id', ids);
    
    if (error) {
      console.error('Error emptying image trash:', error);
      toast.error('Failed to empty image trash');
      return false;
    }
    
    setDeletedImages([]);
    toast.success('Image trash emptied successfully');
    return true;
  };

  const recoverAllImages = async () => {
    if (deletedImages.length === 0) return true;
    
    const ids = deletedImages.map(img => img.id);
    const { error } = await supabase
      .from('images')
      .update({ deleted_at: null })
      .in('id', ids);
    
    if (error) {
      console.error('Error recovering all images:', error);
      toast.error('Failed to recover all images');
      return false;
    }
    
    setDeletedImages([]);
    toast.success('All images recovered successfully');
    return true;
  };

  return { 
    deletedImages, 
    loading, 
    recoverImage, 
    permanentlyDelete, 
    emptyImageTrash,
    recoverAllImages,
    refetch: fetchDeletedImages 
  };
}

// Settings Hook
export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    const userId = await getCurrentUserId();
    if (!userId) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error) {
      console.error('Error fetching settings:', error);
      setLoading(false);
      return;
    }
    
    // If no settings exist, create default settings for this user
    if (!data) {
      const { data: newData, error: createError } = await supabase
        .from('settings')
        .insert({ 
          user_id: userId,
          default_images_per_product: 9,
          default_currency: 'GBP',
        })
        .select()
        .single();
      
      if (createError) {
        console.error('Error creating settings:', createError);
        setLoading(false);
        return;
      }
      
      setSettings(mapSettings(newData));
    } else {
      setSettings(mapSettings(data));
    }
    
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = async (updates: Partial<Settings>) => {
    if (!settings) return false;

    const dbUpdates: Record<string, any> = {};
    if (updates.shopify_store_url !== undefined) dbUpdates.shopify_store_url = updates.shopify_store_url;
    if (updates.default_images_per_product !== undefined) dbUpdates.default_images_per_product = updates.default_images_per_product;
    if (updates.default_currency !== undefined) dbUpdates.default_currency = updates.default_currency;

    const { error } = await supabase
      .from('settings')
      .update(dbUpdates)
      .eq('id', settings.id);
    
    if (error) {
      console.error('Error updating settings:', error);
      toast.error('Failed to save settings');
      return false;
    }
    
    setSettings(prev => prev ? { ...prev, ...updates } : prev);
    return true;
  };

  const isShopifyConfigured = () => {
    return !!settings?.shopify_store_url;
  };

  return { settings, loading, updateSettings, isShopifyConfigured, refetch: fetchSettings };
}

// Image Upload Hook
export function useImageUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadStartTime, setUploadStartTime] = useState<number | null>(null);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [uploadCompleted, setUploadCompleted] = useState(0);

  const uploadImage = async (file: File, batchId: string): Promise<string | null> => {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('User not authenticated');
      return null;
    }
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${batchId}/${crypto.randomUUID()}.${fileExt}`;

    const { error } = await supabase.storage
      .from('product-images')
      .upload(fileName, file);

    if (error) {
      console.error('Error uploading image:', error);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  };

  const uploadImages = async (files: File[], batchId: string): Promise<string[]> => {
    setUploading(true);
    setProgress(0);
    setUploadStartTime(Date.now());
    setUploadTotal(files.length);
    setUploadCompleted(0);

    const BATCH_SIZE = 10; // Upload 10 images in parallel for bulk uploads
    const urls: string[] = [];
    let completed = 0;
    
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(file => uploadImage(file, batchId))
      );
      
      results.forEach(url => {
        if (url) urls.push(url);
      });
      
      completed += batch.length;
      setUploadCompleted(completed);
      setProgress(Math.round((completed / files.length) * 100));
    }

    setUploading(false);
    setUploadStartTime(null);
    setProgress(0);
    return urls;
  };

  return { uploadImage, uploadImages, uploading, progress, uploadStartTime, uploadTotal, uploadCompleted };
}
