import { useState, useEffect, useCallback } from 'react';
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

  const fetchStats = useCallback(async () => {
    if (!batchId) {
      setStats({ uploaded: 0, notUploaded: 0, failed: 0, total: 0 });
      return;
    }

    setIsLoading(true);
    try {
      // Query for uploaded: has shopify_product_id OR status = 'created_in_shopify'
      const { count: uploadedCount, error: uploadedError } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('batch_id', batchId)
        .is('deleted_at', null)
        .or('shopify_product_id.not.is.null,status.eq.created_in_shopify');

      if (uploadedError) throw uploadedError;

      // Query for failed: status = 'error'
      const { count: failedCount, error: failedError } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('batch_id', batchId)
        .is('deleted_at', null)
        .eq('status', 'error');

      if (failedError) throw failedError;

      // Query for notUploaded: no shopify_product_id AND status != 'created_in_shopify' AND status != 'error'
      const { count: notUploadedCount, error: notUploadedError } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('batch_id', batchId)
        .is('deleted_at', null)
        .is('shopify_product_id', null)
        .not('status', 'eq', 'created_in_shopify')
        .not('status', 'eq', 'error');

      if (notUploadedError) throw notUploadedError;

      // Query total
      const { count: totalCount, error: totalError } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('batch_id', batchId)
        .is('deleted_at', null);

      if (totalError) throw totalError;

      setStats({
        uploaded: uploadedCount || 0,
        notUploaded: notUploadedCount || 0,
        failed: failedCount || 0,
        total: totalCount || 0,
      });
    } catch (error) {
      console.error('Error fetching Shopify stats:', error);
    } finally {
      setIsLoading(false);
    }
  }, [batchId]);

  // Fetch stats on mount and when batchId changes
  useEffect(() => {
    fetchStats();
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
          // Refetch stats when any product in the batch changes
          fetchStats();
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
