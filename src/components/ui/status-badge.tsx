import { cn } from '@/lib/utils';
import type { ProductStatus } from '@/types';

interface StatusBadgeProps {
  status: ProductStatus;
  className?: string;
}

const statusConfig: Record<ProductStatus, { label: string; className: string }> = {
  new: {
    label: 'New',
    className: 'bg-muted text-muted-foreground',
  },
  generated: {
    label: 'AI Generated',
    className: 'bg-primary/10 text-primary',
  },
  ready_for_shopify: {
    label: 'Ready',
    className: 'bg-accent/20 text-accent-foreground',
  },
  created_in_shopify: {
    label: 'In Shopify',
    className: 'bg-success/10 text-success',
  },
  error: {
    label: 'Error',
    className: 'bg-destructive/10 text-destructive',
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
