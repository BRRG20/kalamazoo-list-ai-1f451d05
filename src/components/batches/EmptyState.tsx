import { Package, ArrowRight } from 'lucide-react';

export function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center bg-muted/30">
      <div className="text-center max-w-md px-6">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Package className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Welcome to Kalamazoo Lister
        </h2>
        <p className="text-muted-foreground mb-4">
          Select a batch from the sidebar or create a new one to start listing your vintage items.
        </p>
        <div className="flex items-center justify-center gap-2 text-sm text-primary">
          <ArrowRight className="w-4 h-4" />
          <span>Create or select a batch to begin</span>
        </div>
      </div>
    </div>
  );
}
