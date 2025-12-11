import { useState, useCallback } from 'react';
import type { Product } from '@/types';

export interface ProductAIState {
  productId: string;
  title: string;
  description: string;
  description_style_a: string;
  description_style_b: string;
  shopify_tags: string;
  etsy_tags: string;
  collections_tags: string;
  status: string;
}

export interface BulkAIUndoState {
  timestamp: number;
  products: ProductAIState[];
}

export function useAIUndo() {
  // Per-product undo state (last AI state before generation)
  const [productUndoStates, setProductUndoStates] = useState<Record<string, ProductAIState>>({});
  
  // Bulk operation undo stack (last 5 bulk operations)
  const [bulkUndoStack, setBulkUndoStack] = useState<BulkAIUndoState[]>([]);

  // Save a product's state before AI generation
  const saveProductState = useCallback((product: Product) => {
    const state: ProductAIState = {
      productId: product.id,
      title: product.title || '',
      description: product.description || '',
      description_style_a: product.description_style_a || '',
      description_style_b: product.description_style_b || '',
      shopify_tags: product.shopify_tags || '',
      etsy_tags: product.etsy_tags || '',
      collections_tags: product.collections_tags || '',
      status: product.status || 'new',
    };
    
    setProductUndoStates(prev => ({
      ...prev,
      [product.id]: state,
    }));
    
    return state;
  }, []);

  // Save multiple products' states before bulk AI generation
  const saveBulkState = useCallback((products: Product[]) => {
    const states = products.map(product => ({
      productId: product.id,
      title: product.title || '',
      description: product.description || '',
      description_style_a: product.description_style_a || '',
      description_style_b: product.description_style_b || '',
      shopify_tags: product.shopify_tags || '',
      etsy_tags: product.etsy_tags || '',
      collections_tags: product.collections_tags || '',
      status: product.status || 'new',
    }));
    
    const bulkState: BulkAIUndoState = {
      timestamp: Date.now(),
      products: states,
    };
    
    // Also save individual states
    const newProductStates: Record<string, ProductAIState> = {};
    states.forEach(state => {
      newProductStates[state.productId] = state;
    });
    
    setProductUndoStates(prev => ({
      ...prev,
      ...newProductStates,
    }));
    
    setBulkUndoStack(prev => [...prev.slice(-4), bulkState]);
    
    return bulkState;
  }, []);

  // Get the saved state for a product (for undo)
  const getProductUndoState = useCallback((productId: string): ProductAIState | null => {
    return productUndoStates[productId] || null;
  }, [productUndoStates]);

  // Check if a product has undo state available
  const hasUndoState = useCallback((productId: string): boolean => {
    return !!productUndoStates[productId];
  }, [productUndoStates]);

  // Get the last bulk undo state
  const getLastBulkUndoState = useCallback((): BulkAIUndoState | null => {
    return bulkUndoStack[bulkUndoStack.length - 1] || null;
  }, [bulkUndoStack]);

  // Pop the last bulk undo state (after using it)
  const popBulkUndoState = useCallback((): BulkAIUndoState | null => {
    const last = bulkUndoStack[bulkUndoStack.length - 1];
    if (last) {
      setBulkUndoStack(prev => prev.slice(0, -1));
    }
    return last || null;
  }, [bulkUndoStack]);

  // Clear undo state for a product (after successful undo)
  const clearProductUndoState = useCallback((productId: string) => {
    setProductUndoStates(prev => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }, []);

  // Check if bulk undo is available
  const hasBulkUndoState = bulkUndoStack.length > 0;
  
  // Get count of products in last bulk operation
  const lastBulkCount = bulkUndoStack[bulkUndoStack.length - 1]?.products.length || 0;

  return {
    saveProductState,
    saveBulkState,
    getProductUndoState,
    hasUndoState,
    getLastBulkUndoState,
    popBulkUndoState,
    clearProductUndoState,
    hasBulkUndoState,
    lastBulkCount,
  };
}
