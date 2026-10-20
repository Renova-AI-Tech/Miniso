export const fieldControlClassName =
  'flex min-h-[46px] w-full rounded-none border border-border bg-card px-[14px] py-3 font-sans text-foreground text-sm ring-offset-background outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 aria-invalid:border-[#B7791F] aria-invalid:bg-[#FFF8EA] aria-invalid:ring-[#B7791F] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100';

export const textAreaClassName = `${fieldControlClassName} min-h-24 resize-y`;

export const selectClassName = fieldControlClassName;

export const compactFieldControlClassName =
  'flex h-8 min-h-0 w-full rounded-none border border-border bg-muted px-3 py-0 font-sans text-foreground text-xs ring-offset-background outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100';
