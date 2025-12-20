import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Loader2, 
  ArrowLeft,
  Upload,
  RefreshCw
} from 'lucide-react';
import { useQCProducts, useAutopilot, type QCStatus, type AutopilotProduct } from '@/hooks/use-autopilot';
import { useSettings } from '@/hooks/use-database';

function ProductQCCard({ 
  product, 
  selected, 
  onToggle,
  showFlags = false 
}: { 
  product: AutopilotProduct;
  selected: boolean;
  onToggle: () => void;
  showFlags?: boolean;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchImage = async () => {
      const { data } = await supabase
        .from('images')
        .select('url')
        .eq('product_id', product.id)
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle();
      
      if (data) setImageUrl(data.url);
    };
    fetchImage();
  }, [product.id]);

  const flagLabels: Record<string, string> = {
    missing_size: 'Missing size',
    missing_measurements: 'Missing measurements',
    era_uncertain: 'Era uncertain',
    brand_unclear: 'Brand unclear',
    damage_present_not_described: 'Damage not described',
    price_out_of_band: 'Price unusual',
    missing_price: 'Missing price',
    missing_required_fields: 'Missing required fields',
  };

  return (
    <div 
      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
        selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
      }`}
      onClick={onToggle}
    >
      <Checkbox checked={selected} onCheckedChange={onToggle} onClick={e => e.stopPropagation()} />
      
      <div className="w-12 h-12 rounded bg-muted overflow-hidden flex-shrink-0">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-muted-foreground/20" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{product.title || product.sku || 'Untitled'}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>£{product.price || 0}</span>
          <span>•</span>
          <span>{product.size_recommended || product.size_label || 'No size'}</span>
          {product.confidence !== null && (
            <>
              <span>•</span>
              <span className={product.confidence >= 85 ? 'text-green-500' : product.confidence >= 60 ? 'text-yellow-500' : 'text-red-500'}>
                {product.confidence}%
              </span>
            </>
          )}
        </div>
        
        {showFlags && Object.keys(product.flags).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(product.flags).filter(([_, v]) => v).map(([key]) => (
              <Badge key={key} variant="outline" className="text-xs py-0">
                {flagLabels[key] || key}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function QCDashboardPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const runId = searchParams.get('run');
  
  const [activeTab, setActiveTab] = useState<'ready' | 'needs_review' | 'blocked'>('ready');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPublishing, setIsPublishing] = useState(false);

  const { run, refetch: refetchRun } = useAutopilot(null);
  const { settings, isShopifyConfigured } = useSettings();
  
  // Fetch current run details if runId provided
  const [currentRun, setCurrentRun] = useState<any>(null);
  useEffect(() => {
    if (!runId) return;
    const fetchRun = async () => {
      const { data } = await supabase
        .from('autopilot_runs')
        .select('*')
        .eq('id', runId)
        .single();
      if (data) setCurrentRun(data);
    };
    fetchRun();
  }, [runId]);

  const statusFilter = activeTab === 'ready' ? 'ready' : activeTab === 'needs_review' ? 'needs_review' : 'blocked';
  const { products, loading, counts, approveProducts, sendToDraft, refetch } = useQCProducts(runId, statusFilter);

  // Auto-select all ready products
  useEffect(() => {
    if (activeTab === 'ready' && products.length > 0) {
      setSelectedIds(new Set(products.map(p => p.id)));
    } else {
      setSelectedIds(new Set());
    }
  }, [activeTab, products]);

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(products.map(p => p.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleApproveSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    await approveProducts(ids);
    setSelectedIds(new Set());
  };

  const handleSendToDraft = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    await sendToDraft(ids);
    setSelectedIds(new Set());
  };

  const handlePublishApproved = async () => {
    if (!isShopifyConfigured()) {
      toast.error('Shopify is not configured. Go to Settings to set up your store.');
      return;
    }

    setIsPublishing(true);
    try {
      // Fetch all approved products for this run
      const { data: approvedProducts, error: fetchError } = await supabase
        .from('products')
        .select('*')
        .eq('run_id', runId)
        .eq('qc_status', 'approved')
        .is('deleted_at', null);

      if (fetchError || !approvedProducts || approvedProducts.length === 0) {
        toast.error('No approved products to publish');
        return;
      }

      // Fetch images for all products
      const productIds = approvedProducts.map(p => p.id);
      const { data: allImages } = await supabase
        .from('images')
        .select('*')
        .in('product_id', productIds)
        .order('position', { ascending: true });

      // Group images by product
      const imagesByProduct: Record<string, any[]> = {};
      for (const img of allImages || []) {
        if (!imagesByProduct[img.product_id]) {
          imagesByProduct[img.product_id] = [];
        }
        imagesByProduct[img.product_id].push({
          url: img.url,
          position: img.position,
        });
      }

      // Prepare products for Shopify
      const shopifyProducts = approvedProducts.map(p => ({
        id: p.id,
        title: p.title || p.sku || 'Untitled',
        description: p.description_style_a || p.description || '',
        price: p.price,
        currency: p.currency,
        sku: p.sku,
        brand: p.brand,
        garment_type: p.garment_type,
        shopify_tags: p.shopify_tags,
        collections_tags: p.collections_tags,
      }));

      // Call Shopify create function
      const { data: result, error: shopifyError } = await supabase.functions.invoke('create-shopify-product', {
        body: {
          products: shopifyProducts,
          images: imagesByProduct,
          shopifyStoreUrl: settings?.shopify_store_url,
        },
      });

      if (shopifyError) {
        console.error('Shopify publish error:', shopifyError);
        toast.error('Failed to publish to Shopify');
        return;
      }

      // Update products with Shopify IDs and set qc_status to published
      const successIds: string[] = [];
      for (const res of result.results || []) {
        if (res.success && res.shopifyProductId) {
          successIds.push(res.productId);
          await supabase
            .from('products')
            .update({
              qc_status: 'published',
              shopify_product_id: res.shopifyProductId,
              shopify_handle: res.shopifyHandle,
              status: 'created_in_shopify',
            })
            .eq('id', res.productId);
        }
      }

      toast.success(`Published ${successIds.length} product(s) to Shopify`);
      refetch();
    } catch (err) {
      console.error('Publish error:', err);
      toast.error('Failed to publish to Shopify');
    } finally {
      setIsPublishing(false);
    }
  };

  if (!runId) {
    return (
      <AppLayout>
        <div className="container max-w-4xl py-8 px-4">
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold mb-2">No Run Selected</h2>
            <p className="text-muted-foreground mb-4">Please start an Autopilot run first.</p>
            <Button onClick={() => navigate('/autopilot')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go to Autopilot
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container max-w-6xl py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/autopilot')} className="mb-2">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Autopilot
            </Button>
            <h1 className="text-2xl font-bold">QC Dashboard</h1>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refetch}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            {counts.approved > 0 && (
              <Button 
                onClick={handlePublishApproved} 
                disabled={isPublishing}
                className="bg-green-600 hover:bg-green-700"
              >
                {isPublishing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                Publish Approved ({counts.approved})
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-500">{counts.ready}</div>
              <div className="text-sm text-muted-foreground">Ready</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-yellow-500">{counts.needs_review}</div>
              <div className="text-sm text-muted-foreground">Needs Review</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-red-500">{counts.blocked}</div>
              <div className="text-sm text-muted-foreground">Blocked</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-blue-500">{counts.approved}</div>
              <div className="text-sm text-muted-foreground">Approved</div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="mb-4">
            <TabsTrigger value="ready" className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Ready ({counts.ready})
            </TabsTrigger>
            <TabsTrigger value="needs_review" className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              Needs Review ({counts.needs_review})
            </TabsTrigger>
            <TabsTrigger value="blocked" className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-500" />
              Blocked ({counts.blocked})
            </TabsTrigger>
          </TabsList>

          <Card>
            <CardHeader className="py-3 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {selectedIds.size} of {products.length} selected
                  </span>
                  <Button variant="ghost" size="sm" onClick={selectAll}>Select All</Button>
                  <Button variant="ghost" size="sm" onClick={deselectAll}>Clear</Button>
                </div>
                
                <div className="flex items-center gap-2">
                  {activeTab === 'ready' && selectedIds.size > 0 && (
                    <Button size="sm" onClick={handleApproveSelected}>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve All Ready ({selectedIds.size})
                    </Button>
                  )}
                  {activeTab === 'needs_review' && selectedIds.size > 0 && (
                    <Button size="sm" onClick={handleApproveSelected}>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve Selected
                    </Button>
                  )}
                  {(activeTab === 'blocked' || activeTab === 'needs_review') && selectedIds.size > 0 && (
                    <Button variant="outline" size="sm" onClick={handleSendToDraft}>
                      Send to Draft ({selectedIds.size})
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                {loading ? (
                  <div className="p-4 space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : products.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    No products in this category
                  </div>
                ) : (
                  <div className="p-4 space-y-2">
                    {products.map(product => (
                      <ProductQCCard
                        key={product.id}
                        product={product}
                        selected={selectedIds.has(product.id)}
                        onToggle={() => toggleSelection(product.id)}
                        showFlags={activeTab !== 'ready'}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </Tabs>
      </div>
    </AppLayout>
  );
}
