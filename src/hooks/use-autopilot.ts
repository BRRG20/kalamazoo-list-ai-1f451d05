import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type QCStatus = 'draft' | 'generating' | 'ready' | 'needs_review' | 'blocked' | 'approved' | 'published' | 'failed';
export type AutopilotRunStatus = 'running' | 'awaiting_qc' | 'publishing' | 'completed' | 'failed';

export interface AutopilotRun {
  id: string;
  user_id: string;
  batch_id: string;
  status: AutopilotRunStatus;
  batch_size: number;
  total_cards: number;
  processed_cards: number;
  current_batch: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutopilotProduct {
  id: string;
  title: string | null;
  sku: string | null;
  price: number | null;
  qc_status: QCStatus;
  confidence: number | null;
  flags: Record<string, boolean>;
  batch_number: number | null;
  generated_at: string | null;
  size_label: string | null;
  size_recommended: string | null;
  condition: string | null;
  brand: string | null;
  garment_type: string | null;
  shopify_product_id: string | null;
}

export function useAutopilot(batchId: string | null) {
  const [run, setRun] = useState<AutopilotRun | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  // Fetch current run for batch
  const fetchRun = useCallback(async () => {
    if (!batchId) {
      setRun(null);
      return;
    }

    const { data, error } = await supabase
      .from('autopilot_runs')
      .select('*')
      .eq('batch_id', batchId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching autopilot run:', error);
      return;
    }

    if (data) {
      setRun(data as unknown as AutopilotRun);
    } else {
      setRun(null);
    }
  }, [batchId]);

  // Start autopilot
  const startAutopilot = async () => {
    if (!batchId || isStarting) return null;

    setIsStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke('start-autopilot', {
        body: { batch_id: batchId },
      });

      if (error) {
        console.error('Error starting autopilot:', error);
        toast.error('Failed to start Autopilot');
        return null;
      }

      toast.success(data.message || 'Autopilot started');
      await fetchRun();
      setIsPolling(true);
      return data.run_id;
    } catch (err) {
      console.error('Error starting autopilot:', err);
      toast.error('Failed to start Autopilot');
      return null;
    } finally {
      setIsStarting(false);
    }
  };

  // Stop autopilot
  const stopAutopilot = async () => {
    if (!run || run.status !== 'running') return false;

    try {
      const { error } = await supabase
        .from('autopilot_runs')
        .update({ status: 'failed', last_error: 'Stopped by user' })
        .eq('id', run.id);

      if (error) {
        console.error('Error stopping autopilot:', error);
        toast.error('Failed to stop Autopilot');
        return false;
      }

      // Also reset any products that are currently "generating" back to "draft"
      await supabase
        .from('products')
        .update({ qc_status: 'draft' })
        .eq('run_id', run.id)
        .eq('qc_status', 'generating');

      toast.success('Autopilot stopped');
      setIsPolling(false);
      await fetchRun();
      return true;
    } catch (err) {
      console.error('Error stopping autopilot:', err);
      toast.error('Failed to stop Autopilot');
      return false;
    }
  };

  // Poll for updates when run is active
  useEffect(() => {
    if (!run || !isPolling) return;
    if (run.status !== 'running') {
      setIsPolling(false);
      if (run.status === 'awaiting_qc') {
        toast.success('Autopilot complete! Ready for QC review.');
      }
      return;
    }

    const interval = setInterval(fetchRun, 3000);
    return () => clearInterval(interval);
  }, [run, isPolling, fetchRun]);

  // Initial fetch
  useEffect(() => {
    fetchRun();
  }, [fetchRun]);

  return {
    run,
    isStarting,
    isPolling,
    startAutopilot,
    stopAutopilot,
    refetch: fetchRun,
  };
}

export function useQCProducts(runId: string | null, statusFilter: QCStatus | 'all' = 'all') {
  const [products, setProducts] = useState<AutopilotProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState<Record<QCStatus, number>>({
    draft: 0,
    generating: 0,
    ready: 0,
    needs_review: 0,
    blocked: 0,
    approved: 0,
    published: 0,
    failed: 0,
  });

  const fetchProducts = useCallback(async () => {
    if (!runId) {
      setProducts([]);
      return;
    }

    setLoading(true);
    try {
      let query = supabase
        .from('products')
        .select('id, title, sku, price, qc_status, confidence, flags, batch_number, generated_at, size_label, size_recommended, condition, brand, garment_type, shopify_product_id')
        .eq('run_id', runId)
        .is('deleted_at', null);

      if (statusFilter !== 'all') {
        query = query.eq('qc_status', statusFilter);
      }

      const { data, error } = await query.order('batch_number', { ascending: true });

      if (error) {
        console.error('Error fetching QC products:', error);
        return;
      }

      const mapped = (data || []).map(p => ({
        ...p,
        flags: (p.flags as Record<string, boolean>) || {},
      })) as AutopilotProduct[];

      setProducts(mapped);
    } finally {
      setLoading(false);
    }
  }, [runId, statusFilter]);

  // Fetch counts for all statuses
  const fetchCounts = useCallback(async () => {
    if (!runId) return;

    const statuses: QCStatus[] = ['draft', 'generating', 'ready', 'needs_review', 'blocked', 'approved', 'published', 'failed'];
    const newCounts: Record<QCStatus, number> = { ...counts };

    for (const status of statuses) {
      const { count } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('run_id', runId)
        .eq('qc_status', status)
        .is('deleted_at', null);

      newCounts[status] = count || 0;
    }

    setCounts(newCounts);
  }, [runId]);

  // Approve products
  const approveProducts = async (productIds: string[]) => {
    if (productIds.length === 0) return false;

    const { error } = await supabase
      .from('products')
      .update({ qc_status: 'approved' })
      .in('id', productIds);

    if (error) {
      console.error('Error approving products:', error);
      toast.error('Failed to approve products');
      return false;
    }

    toast.success(`Approved ${productIds.length} product(s)`);
    await fetchProducts();
    await fetchCounts();
    return true;
  };

  // Send back to draft
  const sendToDraft = async (productIds: string[]) => {
    if (productIds.length === 0) return false;

    const { error } = await supabase
      .from('products')
      .update({ qc_status: 'draft', flags: {}, confidence: null })
      .in('id', productIds);

    if (error) {
      console.error('Error sending to draft:', error);
      toast.error('Failed to send products to draft');
      return false;
    }

    toast.success(`Sent ${productIds.length} product(s) back to draft`);
    await fetchProducts();
    await fetchCounts();
    return true;
  };

  useEffect(() => {
    fetchProducts();
    fetchCounts();
  }, [fetchProducts, fetchCounts]);

  return {
    products,
    loading,
    counts,
    approveProducts,
    sendToDraft,
    refetch: () => {
      fetchProducts();
      fetchCounts();
    },
  };
}
