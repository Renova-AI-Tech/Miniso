import { cn } from '@renova/ui/lib/utils';
import type * as React from 'react';

export interface SwitchProps extends Omit<React.ComponentProps<'button'>, 'onChange'> {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export function Switch({
  checked,
  className,
  disabled,
  onCheckedChange,
  onClick,
  ...props
}: SwitchProps) {
  return (
    <button
      aria-checked={checked}
      className={cn(
        'inline-flex h-8 w-14 shrink-0 items-center border border-border bg-muted p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        checked && 'border-primary bg-primary',
        className,
      )}
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event);

        if (!event.defaultPrevented) {
          onCheckedChange?.(!checked);
        }
      }}
      role="switch"
      type="button"
      {...props}
    >
      <span
        className={cn(
          'block size-5 bg-background transition-transform',
          checked && 'translate-x-6',
        )}
      />
    </button>
  );
}
