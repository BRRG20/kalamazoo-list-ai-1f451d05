import { v4 as uuidv4 } from 'uuid';
import type { Batch, Product, ProductImage, Settings, ProductStatus, Department, Era, Condition } from '@/types';

// In-memory store (will be replaced with database later)
const store = {
  batches: [] as Batch[],
  products: [] as Product[],
  images: [] as ProductImage[],
  settings: {
    id: '1',
    shopify_store_url: '',
    shopify_access_token: '',
    default_images_per_product: 9,
    default_currency: 'GBP',
  } as Settings,
};

// Batch operations
export function getBatches(): Batch[] {
  return [...store.batches].sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function getBatch(id: string): Batch | undefined {
  return store.batches.find(b => b.id === id);
}

export function createBatch(name: string, notes: string = ''): Batch {
  const batch: Batch = {
    id: uuidv4(),
    name,
    notes,
    created_at: new Date().toISOString(),
  };
  store.batches.push(batch);
  return batch;
}

export function updateBatch(id: string, updates: Partial<Omit<Batch, 'id' | 'created_at'>>): Batch | undefined {
  const batch = store.batches.find(b => b.id === id);
  if (batch) {
    Object.assign(batch, updates);
  }
  return batch;
}

export function deleteBatch(id: string): void {
  const products = getProductsByBatch(id);
  products.forEach(p => deleteProduct(p.id));
  store.batches = store.batches.filter(b => b.id !== id);
}

// Product operations
export function getProductsByBatch(batchId: string): Product[] {
  return store.products.filter(p => p.batch_id === batchId);
}

export function getProduct(id: string): Product | undefined {
  return store.products.find(p => p.id === id);
}

export function createProduct(batchId: string, sku: string): Product {
  const product: Product = {
    id: uuidv4(),
    batch_id: batchId,
    sku,
    status: 'new',
    raw_input_text: '',
    title: '',
    description: '',
    price: 0,
    currency: store.settings.default_currency,
    era: '',
    garment_type: '',
    department: 'Women',
    brand: '',
    colour_main: '',
    colour_secondary: '',
    pattern: '',
    size_label: '',
    size_recommended: '',
    fit: '',
    material: '',
    condition: '',
    flaws: '',
    made_in: '',
    notes: '',
    shopify_tags: '',
    etsy_tags: '',
    collections_tags: '',
    shopify_product_id: null,
    shopify_handle: null,
    listing_block: '',
  };
  store.products.push(product);
  return product;
}

export function updateProduct(id: string, updates: Partial<Omit<Product, 'id' | 'batch_id'>>): Product | undefined {
  const product = store.products.find(p => p.id === id);
  if (product) {
    Object.assign(product, updates);
  }
  return product;
}

export function deleteProduct(id: string): void {
  store.images = store.images.filter(i => i.product_id !== id);
  store.products = store.products.filter(p => p.id !== id);
}

// Image operations
export function getImagesByProduct(productId: string): ProductImage[] {
  return store.images
    .filter(i => i.product_id === productId)
    .sort((a, b) => a.position - b.position);
}

export function getUnassignedImages(batchId: string): ProductImage[] {
  const batchProducts = getProductsByBatch(batchId);
  const productIds = new Set(batchProducts.map(p => p.id));
  return store.images.filter(i => !productIds.has(i.product_id));
}

export function addImage(productId: string, url: string, position: number): ProductImage {
  const image: ProductImage = {
    id: uuidv4(),
    product_id: productId,
    url,
    position,
    include_in_shopify: true,
  };
  store.images.push(image);
  return image;
}

export function updateImage(id: string, updates: Partial<Omit<ProductImage, 'id' | 'product_id'>>): ProductImage | undefined {
  const image = store.images.find(i => i.id === id);
  if (image) {
    Object.assign(image, updates);
  }
  return image;
}

export function deleteImage(id: string): void {
  store.images = store.images.filter(i => i.id !== id);
}

export function excludeLastNImagesFromShopify(productId: string, n: number): void {
  const images = getImagesByProduct(productId);
  const lastN = images.slice(-n);
  lastN.forEach(img => {
    updateImage(img.id, { include_in_shopify: false });
  });
}

// Settings operations
export function getSettings(): Settings {
  return { ...store.settings };
}

export function updateSettings(updates: Partial<Omit<Settings, 'id'>>): Settings {
  Object.assign(store.settings, updates);
  return { ...store.settings };
}

export function isShopifyConfigured(): boolean {
  return !!(store.settings.shopify_store_url && store.settings.shopify_access_token);
}

// Utility
export function getProductCount(batchId: string): number {
  return store.products.filter(p => p.batch_id === batchId).length;
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
