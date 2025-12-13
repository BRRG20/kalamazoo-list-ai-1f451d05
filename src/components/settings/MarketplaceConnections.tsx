import { Check, AlertCircle, Loader2, ExternalLink, Link2Off, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMarketplaceConnections } from '@/hooks/use-marketplace-connections';
import type { MarketplaceType } from '@/types/marketplace';

interface MarketplaceCardProps {
  marketplace: MarketplaceType;
  title: string;
  description: string;
  icon: React.ReactNode;
  isConnected: boolean;
  shopName?: string;
  onConnect: () => void;
  onDisconnect: () => void;
  loading?: boolean;
}

function MarketplaceCard({
  marketplace,
  title,
  description,
  icon,
  isConnected,
  shopName,
  onConnect,
  onDisconnect,
  loading,
}: MarketplaceCardProps) {
  return (
    <Card className={isConnected ? 'border-success/30 bg-success/5' : ''}>
      <CardHeader className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              {icon}
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {title}
                {isConnected && (
                  <span className="inline-flex items-center gap-1 text-xs font-normal text-success bg-success/10 px-2 py-0.5 rounded-full">
                    <Check className="w-3 h-3" />
                    Connected
                  </span>
                )}
              </CardTitle>
              <CardDescription className="text-sm mt-0.5">
                {description}
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {isConnected ? (
          <div className="space-y-3">
            {shopName && (
              <p className="text-sm text-muted-foreground">
                Shop: <span className="font-medium text-foreground">{shopName}</span>
              </p>
            )}
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={onDisconnect}
                disabled={loading}
              >
                <Link2Off className="w-4 h-4 mr-1" />
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onConnect}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <ExternalLink className="w-4 h-4 mr-1" />
            )}
            Connect {title}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// SVG icons for marketplaces
function EtsyIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8.559 3.5C7.09 3.5 6 4.59 6 6.059v11.882C6 19.41 7.09 20.5 8.559 20.5h6.882c1.469 0 2.559-1.09 2.559-2.559v-1.706h-2v1.706c0 .308-.251.559-.559.559H8.559c-.308 0-.559-.251-.559-.559V6.059c0-.308.251-.559.559-.559h6.882c.308 0 .559.251.559.559v1.706h2V6.059C18 4.59 16.91 3.5 15.441 3.5H8.559z"/>
      <path d="M12 8l-4 4 4 4 1.5-1.5L11 12h8v-2h-8l2.5-2.5L12 8z"/>
    </svg>
  );
}

function EbayIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.836 5.324c-1.976 0-3.422 1.14-3.422 3.204 0 1.524.762 2.436 2.106 2.828v.024c-1.248.3-1.8 1.008-1.8 2.148 0 1.944 1.392 3.072 3.576 3.072 1.764 0 2.988-.768 3.42-2.016h.024c.048 1.284.804 2.016 2.184 2.016 1.668 0 2.748-1.08 2.748-2.928 0-.924-.324-1.668-.924-2.172v-.024c.612-.492.924-1.2.924-2.076 0-1.944-1.272-3.084-3.3-3.084-1.56 0-2.664.708-3.12 1.86h-.024c-.36-1.2-1.428-1.86-2.892-1.86zm8.04 0c-2.028 0-3.3 1.14-3.3 3.084 0 .876.312 1.584.924 2.076v.024c-.6.504-.924 1.248-.924 2.172 0 1.848 1.08 2.928 2.748 2.928 1.38 0 2.136-.732 2.184-2.016h.024c.432 1.248 1.656 2.016 3.42 2.016 2.184 0 3.576-1.128 3.576-3.072 0-1.14-.552-1.848-1.8-2.148v-.024c1.344-.392 2.106-1.304 2.106-2.828 0-2.064-1.446-3.204-3.422-3.204z"/>
    </svg>
  );
}

export default function MarketplaceConnections() {
  const { 
    connections, 
    loading, 
    isConnected, 
    getConnection,
    disconnect, 
    initiateConnection 
  } = useMarketplaceConnections();

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const etsyConnection = getConnection('etsy');
  const ebayConnection = getConnection('ebay');

  return (
    <div className="space-y-4">
      <Alert className="border-primary/20 bg-primary/5">
        <ShoppingBag className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm">
          Connect your marketplace accounts to publish listings directly from Kalamazoo Lister. 
          Your credentials are stored securely server-side.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4">
        <MarketplaceCard
          marketplace="etsy"
          title="Etsy"
          description="Sell vintage and handmade items on Etsy"
          icon={<EtsyIcon />}
          isConnected={isConnected('etsy')}
          shopName={etsyConnection?.shop_name ?? undefined}
          onConnect={() => initiateConnection('etsy')}
          onDisconnect={() => disconnect('etsy')}
          loading={loading}
        />

        <MarketplaceCard
          marketplace="ebay"
          title="eBay"
          description="List items on the world's largest marketplace"
          icon={<EbayIcon />}
          isConnected={isConnected('ebay')}
          shopName={ebayConnection?.shop_name ?? undefined}
          onConnect={() => initiateConnection('ebay')}
          onDisconnect={() => disconnect('ebay')}
          loading={loading}
        />
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          <strong>Coming soon:</strong> Direct API connections to Etsy and eBay are in development. 
          For now, you can use Crosslist to sync products from Shopify.
        </AlertDescription>
      </Alert>
    </div>
  );
}
