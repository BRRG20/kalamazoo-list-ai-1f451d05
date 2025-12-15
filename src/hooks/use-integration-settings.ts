import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './use-auth';
import { toast } from 'sonner';

export type IntegrationType = 'etsy' | 'ebay';
export type OAuthStatus = 'not_connected' | 'connected' | 'expired';
export type RateLimitMode = 'default' | 'conservative' | 'custom';
export type Environment = 'production' | 'sandbox';

export interface IntegrationSettings {
  id: string;
  user_id: string;
  integration_type: IntegrationType;
  environment: Environment;
  rate_limit_mode: RateLimitMode;
  max_requests_per_second: number | null;
  max_requests_per_day: number | null;
  oauth_status: OAuthStatus;
  connected_at: string | null;
  connected_shop_name: string | null;
  connected_shop_id: string | null;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EtsySettingsForm {
  environment: Environment;
  rate_limit_mode: RateLimitMode;
  max_requests_per_second: number | null;
  max_requests_per_day: number | null;
}

export function useIntegrationSettings(integrationType: IntegrationType) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<IntegrationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('integration_settings')
        .select('*')
        .eq('user_id', user.id)
        .eq('integration_type', integrationType)
        .maybeSingle();

      if (error) throw error;
      setSettings(data as IntegrationSettings | null);
    } catch (error) {
      console.error('Error fetching integration settings:', error);
    } finally {
      setLoading(false);
    }
  }, [user, integrationType]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveSettings = async (formData: EtsySettingsForm): Promise<boolean> => {
    if (!user) {
      toast.error('You must be logged in to save settings');
      return false;
    }

    setSaving(true);
    try {
      const settingsData = {
        user_id: user.id,
        integration_type: integrationType,
        environment: formData.environment,
        rate_limit_mode: formData.rate_limit_mode,
        max_requests_per_second: formData.rate_limit_mode === 'custom' ? formData.max_requests_per_second : null,
        max_requests_per_day: formData.rate_limit_mode === 'custom' ? formData.max_requests_per_day : null,
      };

      if (settings) {
        // Update existing
        const { error } = await supabase
          .from('integration_settings')
          .update(settingsData)
          .eq('id', settings.id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('integration_settings')
          .insert(settingsData);

        if (error) throw error;
      }

      await fetchSettings();
      toast.success('Etsy settings saved.');
      return true;
    } catch (error) {
      console.error('Error saving integration settings:', error);
      toast.error('Failed to save settings');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const updateOAuthStatus = async (
    status: OAuthStatus,
    shopName?: string,
    shopId?: string,
    expiresAt?: string
  ): Promise<boolean> => {
    if (!user || !settings) return false;

    try {
      const { error } = await supabase
        .from('integration_settings')
        .update({
          oauth_status: status,
          connected_at: status === 'connected' ? new Date().toISOString() : null,
          connected_shop_name: shopName || null,
          connected_shop_id: shopId || null,
          token_expires_at: expiresAt || null,
        })
        .eq('id', settings.id);

      if (error) throw error;
      await fetchSettings();
      return true;
    } catch (error) {
      console.error('Error updating OAuth status:', error);
      return false;
    }
  };

  const disconnect = async (): Promise<boolean> => {
    if (!settings) return false;

    try {
      // Call edge function to clear tokens
      const { error: fnError } = await supabase.functions.invoke('etsy-disconnect', {
        body: { integration_id: settings.id }
      });

      if (fnError) {
        console.error('Edge function error:', fnError);
        // Continue anyway to update local status
      }

      // Update local status
      const { error } = await supabase
        .from('integration_settings')
        .update({
          oauth_status: 'not_connected',
          connected_at: null,
          connected_shop_name: null,
          connected_shop_id: null,
          token_expires_at: null,
        })
        .eq('id', settings.id);

      if (error) throw error;
      
      await fetchSettings();
      toast.success('Etsy disconnected');
      return true;
    } catch (error) {
      console.error('Error disconnecting:', error);
      toast.error('Failed to disconnect');
      return false;
    }
  };

  return {
    settings,
    loading,
    saving,
    saveSettings,
    updateOAuthStatus,
    disconnect,
    refetch: fetchSettings,
  };
}
