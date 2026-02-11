import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { X, RotateCcw, CheckCircle2, XCircle, Loader2, Clock, Square } from 'lucide-react';
import type { BatchExpandState, ExpandItemState } from '@/hooks/use-image-expansion';

interface BatchExpandProgressProps {
  state: BatchExpandState;
  onCancel: () => void;
  onDismiss: () => void;
  onRetryFailed: () => void;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  queued: <Clock className="w-3 h-3 text-muted-foreground" />,
  processing: <Loader2 className="w-3 h-3 text-cyan-600 animate-spin" />,
  done: <CheckCircle2 className="w-3 h-3 text-green-600" />,
  failed: <XCircle className="w-3 h-3 text-red-500" />,
};

export function BatchExpandProgress({ state, onCancel, onDismiss, onRetryFailed }: BatchExpandProgressProps) {
  if (state.total === 0) return null;

  const pct = Math.round((state.completed / state.total) * 100);
  const doneCount = state.items.filter(i => i.status === 'done').length;
  const failedCount = state.items.filter(i => i.status === 'failed').length;
  const isFinished = !state.running;

  return (
    <div className="border rounded-lg p-3 mb-3 bg-background shadow-sm space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {state.running
            ? `Expanding images: ${state.completed}/${state.total}`
            : state.cancelled
              ? `Expansion cancelled (${doneCount} done, ${failedCount} failed)`
              : failedCount > 0
                ? `Expansion complete (${doneCount} done, ${failedCount} failed)`
                : `Expansion complete — ${doneCount} products expanded`}
        </span>
        <div className="flex gap-1">
          {state.running && (
            <Button variant="destructive" size="sm" onClick={onCancel} className="h-7 px-3 text-xs font-semibold">
              <Square className="w-3 h-3 mr-1 fill-current" />
              STOP
            </Button>
          )}
          {isFinished && failedCount > 0 && (
            <Button variant="outline" size="sm" onClick={onRetryFailed} className="h-7 px-2 text-xs">
              <RotateCcw className="w-3 h-3 mr-1" />
              Retry {failedCount}
            </Button>
          )}
          {isFinished && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDismiss}>
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      <Progress value={pct} className="h-2" />

      {/* Compact item list — only show processing + failed (done items just counted) */}
      {state.items.filter(i => i.status === 'processing' || i.status === 'failed').length > 0 && (
        <div className="max-h-24 overflow-y-auto space-y-0.5 text-xs">
          {state.items
            .filter(i => i.status === 'processing' || i.status === 'failed')
            .map(item => (
              <div key={item.productId} className="flex items-center gap-1.5">
                {STATUS_ICON[item.status]}
                <span className="truncate flex-1 text-muted-foreground">
                  {item.productId.slice(0, 8)}…
                </span>
                {item.error && (
                  <span className="text-red-500 truncate max-w-[180px]">{item.error}</span>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
