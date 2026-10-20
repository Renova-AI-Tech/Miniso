import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@renova/ui/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

export const labelVariants = cva(
  'font-sans text-primary leading-[18px] peer-disabled:cursor-not-allowed peer-disabled:text-muted-foreground',
  {
    variants: {
      variant: {
        default: 'font-extrabold text-[13px]',
        caption: 'font-extrabold text-[13px] text-primary normal-case tracking-normal',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

interface LabelProps
  extends React.ComponentProps<typeof LabelPrimitive.Root>,
    VariantProps<typeof labelVariants> {}

function Label({ className, variant, ref, ...props }: LabelProps) {
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(labelVariants({ variant }), className)}
      {...props}
    />
  );
}
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
