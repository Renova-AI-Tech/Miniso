import { cn } from '@renova/ui/lib/utils';

export interface FieldErrorProps {
  message?: string;
  className?: string;
}

export function FieldError({ message, className }: FieldErrorProps) {
  if (!message) {
    return null;
  }

  return <p className={cn('font-sans text-[#9A650F] text-xs leading-4', className)}>{message}</p>;
}
