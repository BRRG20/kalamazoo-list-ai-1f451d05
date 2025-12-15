import { useState, useEffect } from 'react';
import { 
  Save, 
  Loader2, 
  Check, 
  AlertCircle, 
  Shield, 
  TestTube2, 
  Link2Off, 
  ExternalLink,
  Eye,
  EyeOff,
  Copy
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { 
  useIntegrationSettings, 
  type EtsySettingsForm, 
  type RateLimitMode,
  type Environment 
} from '@/hooks/use-integration-settings';
import { supabase } from '@/integrations/supabase/client';

// Etsy SVG icon
function EtsyIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8.559 3.5C7.09 3.5 6 4.59 6 6.059v11.882C6 19.41 7.09 20.5 8.559 20.5h6.882c1.469 0 2.559-1.09 2.559-2.559v-1.706h-2v1.706c0 .308-.251.559-.559.559H8.559c-.308 0-.559-.251-.559-.559V6.059c0-.308.251-.559.559-.559h6.882c.308 0 .559.251.559.559v1.706h2V6.059C18 4.59 16.91 3.5 15.441 3.5H8.559z"/>
      <path d="M12 8l-4 4 4 4 1.5-1.5L11 12h8v-2h-8l2.5-2.5L12 8z"/>
    </svg>
  );
}

export default function EtsyIntegrationSettings() {
  const { settings, loading, saving, saveSettings, disconnect } = useIntegrationSettings('etsy');
  
  // Form state for non-secret settings
  const [formData, setFormData] = useState<EtsySettingsForm>({
    environment: 'production',
    rate_limit_mode: 'default',
    max_requests_per_second: null,
    max_requests_per_day: null,
  });

  // Credential input state (for display only - not stored in DB)
  const [appKeyInput, setAppKeyInput] = useState('');
  const [sharedSecretInput, setSharedSecretInput] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [credentialsConfigured, setCredentialsConfigured] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [savingCredentials, setSavingCredentials] = useState(false);

  // Get the OAuth redirect URL
  const redirectUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/auth/etsy/callback`
    : '';

  useEffect(() => {
    if (settings) {
      setFormData({
        environment: settings.environment as Environment,
        rate_limit_mode: settings.rate_limit_mode as RateLimitMode,
        max_requests_per_second: settings.max_requests_per_second,
        max_requests_per_day: settings.max_requests_per_day,
      });
    }
  }, [settings]);

  // Check if credentials are configured (via edge function)
  useEffect(() => {
    const checkCredentials = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('etsy-check-credentials');
        if (!error && data?.configured) {
          setCredentialsConfigured(true);
        }
      } catch {
        // Credentials not configured
      }
    };
    checkCredentials();
  }, []);

  const handleSaveSettings = async () => {
    await saveSettings(formData);
  };

  const handleSaveCredentials = async () => {
    if (!appKeyInput.trim()) {
      toast.error('Please enter your Etsy App Key');
      return;
    }
    if (!sharedSecretInput.trim()) {
      toast.error('Please enter your Etsy Shared Secret');
      return;
    }

    setSavingCredentials(true);
    try {
      const { error } = await supabase.functions.invoke('etsy-save-credentials', {
        body: {
          app_key: appKeyInput.trim(),
          shared_secret: sharedSecretInput.trim(),
        }
      });

      if (error) throw error;

      setCredentialsConfigured(true);
      setAppKeyInput('');
      setSharedSecretInput('');
      toast.success('Etsy credentials saved securely.');
    } catch (error) {
      console.error('Error saving credentials:', error);
      toast.error('Failed to save credentials');
    } finally {
      setSavingCredentials(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const { data, error } = await supabase.functions.invoke('etsy-test-connection');
      
      if (error) throw error;
      
      if (data?.success) {
        toast.success('Connection test successful! Ready to connect.');
      } else {
        toast.error(data?.message || 'Connection test failed');
      }
    } catch (error) {
      console.error('Test connection error:', error);
      toast.error('Failed to test connection');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleConnect = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('etsy-oauth-start');
      
      if (error) throw error;
      
      if (data?.auth_url) {
        window.location.href = data.auth_url;
      } else {
        toast.error('Failed to start OAuth flow');
      }
    } catch (error) {
      console.error('OAuth start error:', error);
      toast.error('Failed to start connection');
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your Etsy account?')) {
      return;
    }
    await disconnect();
  };

  const handleCopyRedirectUrl = () => {
    navigator.clipboard.writeText(redirectUrl);
    toast.success('Redirect URL copied to clipboard');
  };

  const isConnected = settings?.oauth_status === 'connected';

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card className={isConnected ? 'border-success/30 bg-success/5' : ''}>
        <CardHeader className="p-4 md:p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <EtsyIcon className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  Etsy Integration
                  {isConnected ? (
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
                  Connect your Etsy shop to publish listings directly.
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        {isConnected && settings?.connected_shop_name && (
          <CardContent className="p-4 md:p-6 pt-0">
            <p className="text-sm text-muted-foreground">
              Connected shop: <span className="font-medium text-foreground">{settings.connected_shop_name}</span>
            </p>
            {settings.connected_at && (
              <p className="text-xs text-muted-foreground mt-1">
                Connected {new Date(settings.connected_at).toLocaleDateString()}
              </p>
            )}
          </CardContent>
        )}
      </Card>

      {/* Credentials Section */}
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" />
            API Credentials
          </CardTitle>
          <CardDescription>
            Enter your Etsy API credentials. These are stored securely server-side.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 md:p-6 pt-0">
          {credentialsConfigured ? (
            <Alert className="border-success/30 bg-success/5">
              <Check className="h-4 w-4 text-success" />
              <AlertDescription>
                API credentials are configured. Enter new values below to update them.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Get your API credentials from the{' '}
                <a 
                  href="https://www.etsy.com/developers/your-apps" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  Etsy Developer Portal
                </a>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="etsy_app_key">Etsy App Key / Client ID</Label>
              <Input
                id="etsy_app_key"
                type="text"
                value={appKeyInput}
                onChange={(e) => setAppKeyInput(e.target.value)}
                placeholder={credentialsConfigured ? '••••••••••••••••' : 'Enter your Etsy App Key'}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="etsy_shared_secret">Etsy Shared Secret / Client Secret</Label>
              <div className="relative">
                <Input
                  id="etsy_shared_secret"
                  type={showSecret ? 'text' : 'password'}
                  value={sharedSecretInput}
                  onChange={(e) => setSharedSecretInput(e.target.value)}
                  placeholder={credentialsConfigured ? '••••••••••••••••' : 'Enter your Etsy Shared Secret'}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>OAuth Redirect URL</Label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={redirectUrl}
                  readOnly
                  className="bg-muted text-muted-foreground"
                />
                <Button variant="outline" size="icon" onClick={handleCopyRedirectUrl}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Add this URL to your Etsy app's redirect URLs in the Developer Portal.
              </p>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button 
              onClick={handleSaveCredentials} 
              disabled={savingCredentials || (!appKeyInput && !sharedSecretInput)}
            >
              {savingCredentials ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Credentials
            </Button>
            {credentialsConfigured && (
              <Button 
                variant="outline" 
                onClick={handleTestConnection}
                disabled={testingConnection}
              >
                {testingConnection ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <TestTube2 className="w-4 h-4 mr-2" />
                )}
                Test Connection
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Connection Actions */}
      {credentialsConfigured && (
        <Card>
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-base">Connection</CardTitle>
            <CardDescription>
              {isConnected 
                ? 'Your Etsy account is connected and ready to use.'
                : 'Connect your Etsy account to start publishing listings.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            <div className="flex gap-2">
              {isConnected ? (
                <Button 
                  variant="destructive"
                  onClick={handleDisconnect}
                >
                  <Link2Off className="w-4 h-4 mr-2" />
                  Disconnect Etsy
                </Button>
              ) : (
                <Button onClick={handleConnect}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Connect Etsy Account
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Rate Limiting & Environment */}
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base">Advanced Settings</CardTitle>
          <CardDescription>
            Configure rate limiting and environment options.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 md:p-6 pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="environment">Environment</Label>
              <Select
                value={formData.environment}
                onValueChange={(value) => setFormData(prev => ({ ...prev, environment: value as Environment }))}
              >
                <SelectTrigger id="environment">
                  <SelectValue placeholder="Select environment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="production">Production</SelectItem>
                  <SelectItem value="sandbox">Sandbox (Testing)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rate_limit_mode">Rate Limit Mode</Label>
              <Select
                value={formData.rate_limit_mode}
                onValueChange={(value) => setFormData(prev => ({ ...prev, rate_limit_mode: value as RateLimitMode }))}
              >
                <SelectTrigger id="rate_limit_mode">
                  <SelectValue placeholder="Select rate limit mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="conservative">Conservative</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {formData.rate_limit_mode === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="max_rps">Max Requests / Second</Label>
                <Input
                  id="max_rps"
                  type="number"
                  min={1}
                  max={10}
                  value={formData.max_requests_per_second ?? ''}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    max_requests_per_second: e.target.value ? parseInt(e.target.value) : null 
                  }))}
                  placeholder="e.g., 5"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_rpd">Max Requests / Day</Label>
                <Input
                  id="max_rpd"
                  type="number"
                  min={1}
                  max={10000}
                  value={formData.max_requests_per_day ?? ''}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    max_requests_per_day: e.target.value ? parseInt(e.target.value) : null 
                  }))}
                  placeholder="e.g., 5000"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={handleSaveSettings} disabled={saving}>
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
