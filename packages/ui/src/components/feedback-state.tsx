import { cn } from '@renova/ui/lib/utils';
import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';

export const successStateVariants = cva(
  'rounded-none border border-accent bg-accent/10 px-5 py-4 font-sans text-[#17615D] text-sm leading-relaxed',
);

export interface SuccessStateProps {
  children: ReactNode;
  className?: string;
}

export function SuccessState({ children, className }: SuccessStateProps) {
  return <div className={cn(successStateVariants(), className)}>{children}</div>;
}
