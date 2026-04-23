import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Local drop-in for @radix-ui/react-visually-hidden's VisuallyHidden.
 *
 * Hides content visually while keeping it accessible to screen readers — same
 * technique Radix itself uses (absolute positioning + 1px clipped box). Lives
 * in-repo so preview/dev environments don't need to resolve a separate npm
 * package just for this tiny primitive.
 */
type VisuallyHiddenProps = React.HTMLAttributes<HTMLSpanElement> & {
  asChild?: boolean;
};

export const VisuallyHidden = React.forwardRef<HTMLSpanElement, VisuallyHiddenProps>(
  ({ className, asChild: _asChild, children, ...rest }, ref) => {
    return (
      <span
        ref={ref}
        // Tailwind's `sr-only` is the standard visually-hidden pattern.
        className={cn('sr-only', className)}
        {...rest}
      >
        {children}
      </span>
    );
  },
);
VisuallyHidden.displayName = 'VisuallyHidden';

export default VisuallyHidden;
