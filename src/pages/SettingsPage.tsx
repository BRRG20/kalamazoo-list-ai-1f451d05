import { useState, useEffect } from 'react';
import { Save, Check, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSettings } from '@/hooks/use-database';

export default function SettingsPage() {
  const { settings, loading, updateSettings, isShopifyConfigured } = useSettings();
  const [formData, setFormData] = useState({
    shopify_store_url: '',
    shopify_access_token: '',
    default_images_per_product: 9,
    default_currency: 'GBP',
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setFormData({
        shopify_store_url: settings.shopify_store_url,
        shopify_access_token: settings.shopify_access_token,
        default_images_per_product: settings.default_images_per_product,
        default_currency: settings.default_currency,
      });
    }
  }, [settings]);

  const shopifyConnected = isShopifyConfigured();

  const handleChange = <K extends keyof typeof formData>(field: K, value: typeof formData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    
    // Validate
    if (formData.default_images_per_product < 1) {
      toast.error('Images per product must be at least 1');
      setIsSaving(false);
      return;
    }

    const success = await updateSettings({
      shopify_store_url: formData.shopify_store_url.trim(),
      shopify_access_token: formData.shopify_access_token.trim(),
      default_images_per_product: formData.default_images_per_product,
      default_currency: formData.default_currency.trim() || 'GBP',
    });

    setIsSaving(false);
    
    if (success) {
      toast.success('Settings saved');
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="h-full flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto scrollbar-thin">
        <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure your Shopify connection and default preferences.
            </p>
          </div>

          {/* Shopify Configuration */}
          <Card>
            <CardHeader className="p-4 md:p-6">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base md:text-lg">
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
              <CardDescription className="text-sm">
                Enter your Shopify store URL and Admin API Access Token to enable product creation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 md:p-6 pt-0 md:pt-0">
              <div className="space-y-2">
                <Label htmlFor="shopify_store_url">Store URL</Label>
                <Input
                  id="shopify_store_url"
                  type="url"
                  value={formData.shopify_store_url}
                  onChange={(e) => handleChange('shopify_store_url', e.target.value)}
                  placeholder="https://yourstore.myshopify.com"
                />
                <p className="text-xs text-muted-foreground">
                  Your Shopify store's admin URL
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="shopify_access_token">Admin API Access Token</Label>
                <Input
                  id="shopify_access_token"
                  type="password"
                  value={formData.shopify_access_token}
                  onChange={(e) => handleChange('shopify_access_token', e.target.value)}
                  placeholder="shpat_xxxxxxxxxxxxxxxx"
                />
                <p className="text-xs text-muted-foreground">
                  Create a private app in Shopify Admin → Apps → Develop apps
                </p>
              </div>

              {!shopifyConnected && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    Shopify is not configured. Add your store URL and access token to enable product creation.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Default Settings */}
          <Card>
            <CardHeader className="p-4 md:p-6">
              <CardTitle className="text-base md:text-lg">Default Settings</CardTitle>
              <CardDescription className="text-sm">
                Configure default values for new batches and products.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 md:p-6 pt-0 md:pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="default_images_per_product">Images per Product</Label>
                  <Input
                    id="default_images_per_product"
                    type="number"
                    min={1}
                    max={20}
                    value={formData.default_images_per_product}
                    onChange={(e) => handleChange('default_images_per_product', parseInt(e.target.value) || 9)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Default images per product when auto-grouping.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="default_currency">Default Currency</Label>
                  <Input
                    id="default_currency"
                    value={formData.default_currency}
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
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
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
