import { useState } from 'react';
import { Save, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getSettings, updateSettings, isShopifyConfigured } from '@/lib/store';
import type { Settings } from '@/types';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(getSettings());
  const [isSaving, setIsSaving] = useState(false);
  const shopifyConnected = isShopifyConfigured();

  const handleChange = <K extends keyof Settings>(field: K, value: Settings[K]) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    
    // Validate
    if (settings.default_images_per_product < 1) {
      toast.error('Images per product must be at least 1');
      setIsSaving(false);
      return;
    }

    updateSettings({
      shopify_store_url: settings.shopify_store_url.trim(),
      shopify_access_token: settings.shopify_access_token.trim(),
      default_images_per_product: settings.default_images_per_product,
      default_currency: settings.default_currency.trim() || 'GBP',
    });

    await new Promise(resolve => setTimeout(resolve, 300));
    setIsSaving(false);
    toast.success('Settings saved');
  };

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto scrollbar-thin">
        <div className="max-w-2xl mx-auto p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
            <p className="text-muted-foreground mt-1">
              Configure your Shopify connection and default preferences.
            </p>
          </div>

          {/* Shopify Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Shopify Connection
                {shopifyConnected ? (
                  <span className="inline-flex items-center gap-1 text-xs font-normal text-success bg-success/10 px-2 py-0.5 rounded-full">
                    <Check className="w-3 h-3" />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    Not connected
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                Enter your Shopify store URL and Admin API Access Token to enable product creation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="shopify_store_url">Store URL</Label>
                <Input
                  id="shopify_store_url"
                  type="url"
                  value={settings.shopify_store_url}
                  onChange={(e) => handleChange('shopify_store_url', e.target.value)}
                  placeholder="https://yourstore.myshopify.com"
                />
                <p className="text-xs text-muted-foreground">
                  Your Shopify store's admin URL (e.g., https://yourstore.myshopify.com)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="shopify_access_token">Admin API Access Token</Label>
                <Input
                  id="shopify_access_token"
                  type="password"
                  value={settings.shopify_access_token}
                  onChange={(e) => handleChange('shopify_access_token', e.target.value)}
                  placeholder="shpat_xxxxxxxxxxxxxxxx"
                />
                <p className="text-xs text-muted-foreground">
                  Create a private app in Shopify Admin → Apps → Develop apps to get this token.
                </p>
              </div>

              {!shopifyConnected && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Shopify is not configured. Add your store URL and access token to enable product creation.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Default Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Default Settings</CardTitle>
              <CardDescription>
                Configure default values for new batches and products.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="default_images_per_product">Images per Product</Label>
                  <Input
                    id="default_images_per_product"
                    type="number"
                    min={1}
                    max={20}
                    value={settings.default_images_per_product}
                    onChange={(e) => handleChange('default_images_per_product', parseInt(e.target.value) || 9)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Default number of images per product when auto-grouping.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="default_currency">Default Currency</Label>
                  <Input
                    id="default_currency"
                    value={settings.default_currency}
                    onChange={(e) => handleChange('default_currency', e.target.value.toUpperCase())}
                    placeholder="GBP"
                    maxLength={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Currency code (e.g., GBP, USD, EUR).
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>Saving...</>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Settings
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
