import { cn } from '@renova/ui/lib/utils';
import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';

export const emptyStateVariants = cva(
  'rounded-none border border-border border-dashed bg-card px-[22px] py-[22px] font-sans text-muted-foreground text-sm leading-relaxed',
);

export interface EmptyStateProps {
  children: ReactNode;
  className?: string;
}

export function EmptyState({ children, className }: EmptyStateProps) {
  return <div className={cn(emptyStateVariants(), className)}>{children}</div>;
}
