import { Button } from '@renova/ui/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@renova/ui/components/ui/sheet';
import { cn } from '@renova/ui/lib/utils';
import type { ComponentProps, ReactNode } from 'react';

interface DrawerShellProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: ComponentProps<typeof SheetContent>['onCloseAutoFocus'];
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function DrawerShell({
  open,
  onOpenChange,
  onCloseAutoFocus,
  eyebrow,
  title,
  description,
  children,
  footer,
  className,
}: DrawerShellProps) {
  return (
    <Sheet
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
    >
      <SheetContent
        onCloseAutoFocus={onCloseAutoFocus}
        showClose={false}
        className={cn(
          'flex w-full flex-col overflow-hidden border-border border-l p-0 shadow-[-24px_0_48px_rgba(30,58,58,0.08)] sm:max-w-[528px]',
          className,
        )}
      >
        <SheetHeader className="gap-1.5 space-y-0 border-border border-b px-8 py-5 text-left">
          <div className="flex items-start justify-between gap-5">
            <div className="min-w-0">
              {eyebrow ? (
                <p className="font-extrabold font-sans text-[11px] text-muted-foreground uppercase leading-[14px] tracking-[0.28em]">
                  {eyebrow}
                </p>
              ) : null}
            </div>
            <SheetClose asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-[34px] shrink-0 text-primary"
                aria-label="Fechar painel"
              >
                ×
              </Button>
            </SheetClose>
          </div>
          <SheetTitle className="font-display text-[32px] text-primary leading-[38px]">
            {title}
          </SheetTitle>
          {description ? (
            <SheetDescription className="font-sans text-muted-foreground text-sm leading-[21px]">
              {description}
            </SheetDescription>
          ) : null}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-7">{children}</div>

        {footer ? (
          <SheetFooter className="flex-row items-center justify-end gap-3 border-border border-t px-8 py-5">
            {footer}
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

interface DrawerCancelButtonProps {
  disabled?: boolean;
  children?: ReactNode;
}

export function DrawerCancelButton({ disabled, children = 'Cancelar' }: DrawerCancelButtonProps) {
  return (
    <SheetClose asChild>
      <Button type="button" variant="outline" disabled={disabled}>
        {children}
      </Button>
    </SheetClose>
  );
}
