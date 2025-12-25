import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ShopifyStats {
  uploaded: number;
  notUploaded: number;
  failed: number;
  total: number;
}

export function useShopifyStats(batchId: string | null) {
  const [stats, setStats] = useState<ShopifyStats>({
    uploaded: 0,
    notUploaded: 0,
    failed: 0,
    total: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const isMountedRef = useRef(true);

  const fetchStats = useCallback(async () => {
    if (!batchId) {
      setStats({ uploaded: 0, notUploaded: 0, failed: 0, total: 0 });
      return;
    }

    setIsLoading(true);
    try {
      // Single query to get all products and compute stats client-side
      // This is more efficient than 4 separate count queries
      const { data: products, error } = await supabase
        .from('products')
        .select('id, shopify_product_id, status')
        .eq('batch_id', batchId)
        .is('deleted_at', null);

      if (error) throw error;
      if (!isMountedRef.current) return;

      const allProducts = products || [];
      let uploaded = 0;
      let failed = 0;
      let notUploaded = 0;

      for (const product of allProducts) {
        const isUploaded = product.shopify_product_id || product.status === 'created_in_shopify';
        const isFailed = product.status === 'error';

        if (isUploaded) {
          uploaded++;
        } else if (isFailed) {
          failed++;
        } else {
          notUploaded++;
        }
      }

      setStats({
        uploaded,
        notUploaded,
        failed,
        total: allProducts.length,
      });
    } catch (error) {
      console.error('Error fetching Shopify stats:', error);
      // Don't crash - keep previous stats
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [batchId]);

  // Fetch stats on mount and when batchId changes
  useEffect(() => {
    isMountedRef.current = true;
    fetchStats();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchStats]);

  // Subscribe to realtime updates for the products table
  useEffect(() => {
    if (!batchId) return;

    const channel = supabase
      .channel(`shopify-stats-${batchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products',
          filter: `batch_id=eq.${batchId}`,
        },
        () => {
          // Debounce refetch to avoid rapid updates
          setTimeout(() => {
            if (isMountedRef.current) {
              fetchStats();
            }
          }, 100);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [batchId, fetchStats]);

  return {
    stats,
    isLoading,
    refetch: fetchStats,
  };
}
