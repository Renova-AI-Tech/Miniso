import { Slot } from '@radix-ui/react-slot';
import { cn } from '@renova/ui/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none font-extrabold font-sans text-sm leading-4 ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:border disabled:border-border disabled:bg-background disabled:text-muted-foreground disabled:opacity-100 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'select-none bg-primary text-primary-foreground transition-all duration-200 hover:bg-primary-hover',
        accent:
          'select-none bg-accent text-accent-foreground shadow-sm transition-all duration-200 hover:bg-accent/90',
        destructive:
          'border border-destructive bg-destructive text-destructive-foreground hover:opacity-90',
        outline: 'border border-primary bg-transparent text-primary hover:bg-muted',
        secondary: 'border border-border bg-muted text-primary hover:bg-muted/80',
        ghost:
          'bg-transparent text-[#17615D] underline-offset-4 hover:bg-transparent hover:text-primary hover:underline',
        link: 'h-auto bg-transparent p-0 text-[#17615D] underline-offset-4 hover:text-primary hover:underline',
      },
      size: {
        default: 'h-[42px] px-[18px]',
        sm: 'h-9 px-3 text-[13px]',
        lg: 'h-12 px-8',
        icon: 'size-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({ className, variant, size, asChild = false, ref, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
}
Button.displayName = 'Button';

export { Button };
