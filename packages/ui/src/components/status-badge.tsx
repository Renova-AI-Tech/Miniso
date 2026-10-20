import { cn } from '@renova/ui/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';

export type StatusBadgeTone = 'neutral' | 'accent' | 'secondary' | 'warning';

export const statusBadgeVariants = cva(
  'inline-flex min-h-8 items-center justify-center rounded-none border px-3 py-2 font-extrabold font-sans text-[13px] leading-4',
  {
    variants: {
      tone: {
        accent: 'border-[#8CDDD5] bg-accent/10 text-[#17615D]',
        neutral: 'border-border bg-muted text-muted-foreground',
        secondary: 'border-border bg-card text-primary',
        warning: 'border-[#E6C985] bg-[#FFF8EA] text-[#7A4D00]',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
);

export interface StatusBadgeProps {
  children: ReactNode;
  className?: string;
  tone?: VariantProps<typeof statusBadgeVariants>['tone'];
}

export function StatusBadge({ children, tone = 'neutral', className }: StatusBadgeProps) {
  return <span className={cn(statusBadgeVariants({ tone }), className)}>{children}</span>;
}

export interface AccessBadgeProps {
  children: ReactNode;
  className?: string;
}

export function AccessBadge({ children, className }: AccessBadgeProps) {
  return (
    <StatusBadge tone="secondary" {...(className === undefined ? {} : { className })}>
      {children}
    </StatusBadge>
  );
}
