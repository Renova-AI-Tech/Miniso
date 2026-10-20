import { cn } from '@renova/ui/lib/utils';
import { cva } from 'class-variance-authority';
import type * as React from 'react';

export const inputVariants = cva(
  'flex min-h-[46px] w-full rounded-none border border-border bg-card px-[14px] py-3 font-sans text-foreground text-sm ring-offset-background transition-colors file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 aria-invalid:border-[#B7791F] aria-invalid:bg-[#FFF8EA] aria-invalid:ring-[#B7791F]',
);

function Input({ className, type, ref, ...props }: React.ComponentProps<'input'>) {
  return <input type={type} className={cn(inputVariants(), className)} ref={ref} {...props} />;
}
Input.displayName = 'Input';

export { Input };
