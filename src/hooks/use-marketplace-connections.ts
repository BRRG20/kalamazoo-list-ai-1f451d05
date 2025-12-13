import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { MarketplaceConnection, MarketplaceType } from '@/types/marketplace';

async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export function useMarketplaceConnections() {
  const [connections, setConnections] = useState<MarketplaceConnection[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConnections = useCallback(async () => {
    const userId = await getCurrentUserId();
    if (!userId) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('marketplace_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching marketplace connections:', error);
      setLoading(false);
      return;
    }

    setConnections((data || []).map(row => ({
      id: row.id,
      marketplace: row.marketplace as MarketplaceType,
      shop_id: row.shop_id,
      shop_name: row.shop_name,
      connected_at: row.connected_at,
      expires_at: row.expires_at,
      is_active: row.is_active,
    })));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const isConnected = (marketplace: MarketplaceType): boolean => {
    return connections.some(c => c.marketplace === marketplace && c.is_active);
  };

  const getConnection = (marketplace: MarketplaceType): MarketplaceConnection | undefined => {
    return connections.find(c => c.marketplace === marketplace && c.is_active);
  };

  const disconnect = async (marketplace: MarketplaceType): Promise<boolean> => {
    const connection = getConnection(marketplace);
    if (!connection) return false;

    const { error } = await supabase
      .from('marketplace_connections')
      .update({ is_active: false })
      .eq('id', connection.id);

    if (error) {
      console.error('Error disconnecting marketplace:', error);
      toast.error(`Failed to disconnect ${marketplace}`);
      return false;
    }

    setConnections(prev => prev.filter(c => c.id !== connection.id));
    toast.success(`Disconnected from ${marketplace}`);
    return true;
  };

  // Note: Actual OAuth connection would be handled by edge functions
  // This is a placeholder for the connection flow
  const initiateConnection = async (marketplace: MarketplaceType): Promise<void> => {
    toast.info(`${marketplace} connection requires API credentials. This feature is coming soon.`);
    // In production, this would:
    // 1. Call an edge function that generates OAuth URL
    // 2. Redirect user to marketplace OAuth page
    // 3. Handle callback and store tokens server-side
  };

  return {
    connections,
    loading,
    isConnected,
    getConnection,
    disconnect,
    initiateConnection,
    refetch: fetchConnections,
  };
}
