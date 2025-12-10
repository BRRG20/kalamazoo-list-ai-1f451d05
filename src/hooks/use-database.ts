import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Batch, Product, ProductImage, Settings, ProductStatus, Department, Era, Condition } from '@/types';

// Constants for upload limits
export const UPLOAD_LIMITS = {
  RECOMMENDED_IMAGES_PER_BATCH: 200,
  WARNING_THRESHOLD: 300,
  RECOMMENDED_PRODUCTS_FOR_AI: 20,
};

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
    department: (row.department || 'Women') as Department,
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
    made_in: row.made_in || '',
    notes: row.notes || '',
    shopify_tags: row.shopify_tags || '',
    etsy_tags: row.etsy_tags || '',
    collections_tags: row.collections_tags || '',
    shopify_product_id: row.shopify_product_id,
    shopify_handle: row.shopify_handle,
    listing_block: row.listing_block || '',
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

// Products Hook
export function useProducts(batchId: string | null) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchProducts = useCallback(async () => {
    if (!batchId) {
      setProducts([]);
      return;
    }
    
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('batch_id', batchId)
      .order('created_at', { ascending: true });
    
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

  const createProduct = async (sku: string) => {
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
        department: 'Women',
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

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    // Filter out undefined values and map to DB column names
    const dbUpdates: Record<string, any> = {};
    
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.raw_input_text !== undefined) dbUpdates.raw_input_text = updates.raw_input_text;
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
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
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting product:', error);
      return false;
    }
    
    setProducts(prev => prev.filter(p => p.id !== id));
    return true;
  };

  return { products, loading, createProduct, updateProduct, deleteProduct, refetch: fetchProducts };
}

// Images Hook
export function useImages() {
  const [imageCache, setImageCache] = useState<Record<string, ProductImage[]>>({});

  const fetchImagesForProduct = async (productId: string): Promise<ProductImage[]> => {
    if (imageCache[productId]) {
      return imageCache[productId];
    }

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
  };

  const fetchImagesForBatch = async (batchId: string): Promise<ProductImage[]> => {
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
  };

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

  const deleteImage = async (id: string) => {
    const { error } = await supabase
      .from('images')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting image:', error);
      return false;
    }
    
    // Clear all caches since we don't know which product this was in
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
    deleteImage,
    excludeLastNImages, 
    clearCache, 
    imageCache 
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
