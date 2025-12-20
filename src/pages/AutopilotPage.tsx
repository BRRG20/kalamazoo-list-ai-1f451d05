import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Zap, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';
import { useBatches } from '@/hooks/use-database';
import { useAutopilot } from '@/hooks/use-autopilot';

export default function AutopilotPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { batches, loading: batchesLoading } = useBatches();
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(
    searchParams.get('batch') || null
  );

  const { run, isStarting, isPolling, startAutopilot } = useAutopilot(selectedBatchId);

  // Auto-select latest batch if none selected
  useEffect(() => {
    if (!selectedBatchId && batches.length > 0) {
      setSelectedBatchId(batches[0].id);
    }
  }, [batches, selectedBatchId]);

  const progress = run ? (run.processed_cards / Math.max(run.total_cards, 1)) * 100 : 0;

  const handleStart = async () => {
    if (!selectedBatchId) return;
    await startAutopilot();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge variant="default" className="bg-blue-500">Running</Badge>;
      case 'awaiting_qc':
        return <Badge variant="default" className="bg-yellow-500">Awaiting QC</Badge>;
      case 'publishing':
        return <Badge variant="default" className="bg-purple-500">Publishing</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-green-500">Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <AppLayout>
      <div className="container max-w-4xl py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Autopilot</h1>
          <p className="text-muted-foreground">
            Automatically generate listings and run QC for an entire batch
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" />
              Start Autopilot
            </CardTitle>
            <CardDescription>
              Select a batch to process. Autopilot will generate listings in batches of 30 and run Auto-QC on each product.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Select
                value={selectedBatchId || ''}
                onValueChange={setSelectedBatchId}
                disabled={isStarting || run?.status === 'running'}
              >
                <SelectTrigger className="w-[300px]">
                  <SelectValue placeholder="Select a batch..." />
                </SelectTrigger>
                <SelectContent>
                  {batchesLoading ? (
                    <SelectItem value="loading" disabled>Loading...</SelectItem>
                  ) : (
                    batches.map(batch => (
                      <SelectItem key={batch.id} value={batch.id}>
                        {batch.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              <Button
                onClick={handleStart}
                disabled={!selectedBatchId || isStarting || run?.status === 'running'}
                size="lg"
              >
                {isStarting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : run?.status === 'running' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Start Autopilot
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {run && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Run Progress</CardTitle>
                {getStatusBadge(run.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Products Processed</span>
                  <span>{run.processed_cards} / {run.total_cards}</span>
                </div>
                <Progress value={progress} className="h-3" />
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Current Batch:</span>
                  <span className="ml-2 font-medium">{run.current_batch}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Batch Size:</span>
                  <span className="ml-2 font-medium">{run.batch_size}</span>
                </div>
              </div>

              {run.last_error && (
                <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-md">
                  <AlertCircle className="w-4 h-4 text-destructive mt-0.5" />
                  <span className="text-sm text-destructive">{run.last_error}</span>
                </div>
              )}

              {(run.status === 'awaiting_qc' || run.status === 'completed') && (
                <div className="pt-4 border-t">
                  <Button
                    onClick={() => navigate(`/qc-dashboard?run=${run.id}`)}
                    className="w-full"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Go to QC Dashboard
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>How Autopilot Works</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>Select a batch containing your product cards with images</li>
              <li>Click "Start Autopilot" to begin automatic processing</li>
              <li>Products are generated in batches of 30 to prevent crashes</li>
              <li>Auto-QC runs on each product and assigns a status:
                <ul className="list-disc list-inside ml-6 mt-1 space-y-1">
                  <li><Badge variant="default" className="bg-green-500 text-xs">Ready</Badge> - All required fields present, high confidence</li>
                  <li><Badge variant="default" className="bg-yellow-500 text-xs">Needs Review</Badge> - Some fields may need attention</li>
                  <li><Badge variant="destructive" className="text-xs">Blocked</Badge> - Missing critical fields</li>
                </ul>
              </li>
              <li>When complete, review and approve products in the QC Dashboard</li>
              <li>Publish approved products to Shopify with one click</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
