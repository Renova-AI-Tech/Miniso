import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@renova/ui/components/ui/sidebar';
import { cn } from '@renova/ui/lib/utils';
import type { ComponentProps, ComponentType } from 'react';

/** Nome do ícone Material Symbols Outlined (ligature), ex.: `dashboard`, `architecture`. */
export type AppSidebarNavItem = {
  id: string;
  label: string;
  icon: string;
  /** Se true, usa preenchimento (ex.: item ativo no Stitch). */
  iconFill?: boolean;
  href: string;
  groupId?: string;
  groupLabel?: string;
};

interface AppSidebarNavGroup {
  id: string;
  label?: string;
  items: AppSidebarNavItem[];
}

export type AppSidebarLinkProps = Omit<ComponentProps<'a'>, 'href'> & { to: string };

export type AppSidebarProps = {
  items: AppSidebarNavItem[];
  activeId: string;
  /** Quando definido (ex.: `/logo.png` no app), substitui o bloco ícone + título do brand. */
  brandLogoSrc?: string;
  brandLogoAlt?: string;
  brandTitle?: string;
  brandSubtitle?: string;
  visionLabel?: string;
  visionValue?: string;
  showVisionPanel?: boolean;
  userName?: string;
  userRole?: string;
  userAvatarUrl?: string;
  accountMenuLabel?: string;
  accountActions?: Array<{
    id: string;
    label: string;
    onSelect: () => void;
    disabled?: boolean;
  }>;
  className?: string;
  linkComponent?: ComponentType<AppSidebarLinkProps>;
};

const EMPTY_ACCOUNT_ACTIONS: NonNullable<AppSidebarProps['accountActions']> = [];

function DefaultLink({ to, ...props }: AppSidebarLinkProps) {
  return <a href={to} {...props} />;
}

function groupNavigationItems(items: AppSidebarNavItem[]): AppSidebarNavGroup[] {
  return items.reduce<AppSidebarNavGroup[]>((groups, item) => {
    const groupId = item.groupId ?? 'navigation';
    const existingGroup = groups.find((group) => group.id === groupId);

    if (existingGroup) {
      existingGroup.items.push(item);
      return groups;
    }

    groups.push({
      id: groupId,
      ...(item.groupLabel === undefined ? {} : { label: item.groupLabel }),
      items: [item],
    });

    return groups;
  }, []);
}

export function AppSidebar({
  items,
  activeId,
  brandLogoSrc,
  brandLogoAlt,
  brandTitle = 'Renova',
  brandSubtitle = 'Consulting Group',
  visionLabel = 'Contexto',
  visionValue,
  showVisionPanel = false,
  userName,
  userRole,
  userAvatarUrl,
  accountMenuLabel = 'Conta',
  accountActions = EMPTY_ACCOUNT_ACTIONS,
  className,
  linkComponent: Link = DefaultLink,
}: AppSidebarProps) {
  const navigationGroups = groupNavigationItems(items);

  return (
    <Sidebar
      className={cn(
        'overflow-hidden border-outline-variant/10 border-r bg-primary text-primary-foreground **:data-[sidebar=sidebar]:border-outline-variant/10 **:data-[sidebar=sidebar]:bg-primary **:data-[sidebar=sidebar]:text-primary-foreground',
        className,
      )}
      variant="sidebar"
    >
      <SidebarHeader className="flex flex-col gap-5 border-outline-variant/10 border-b px-4 pt-5 pb-6">
        <div className="flex w-full min-w-0 items-center">
          <div className="flex min-w-0 flex-1 items-center justify-center gap-4">
            {brandLogoSrc ? (
              <img
                src={brandLogoSrc}
                alt={brandLogoAlt ?? `${brandTitle} ${brandSubtitle}`}
                className="h-11 w-auto max-w-full object-contain object-left sm:h-12"
                decoding="async"
              />
            ) : (
              <>
                <div className="flex size-10 shrink-0 items-center justify-center bg-sidebar-highlight">
                  <span className="material-symbols-outlined text-2xl text-primary" aria-hidden>
                    architecture
                  </span>
                </div>
                <div className="min-w-0 leading-none">
                  <h1 className="font-display font-semibold text-2xl text-white tracking-tight">
                    {brandTitle}
                  </h1>
                  <p className="mt-1.5 font-medium font-sans text-[11px] text-sidebar-highlight/95 uppercase tracking-[0.16em]">
                    {brandSubtitle}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {showVisionPanel ? (
          <div className="min-w-0">
            <div className="rounded-md border border-outline-variant/15 bg-primary/35 px-4 py-3.5 shadow-black/10 shadow-sm">
              <span className="block font-medium font-sans text-[11px] text-primary-foreground/70 uppercase tracking-[0.12em]">
                {visionLabel}
              </span>
              <div className="mt-3 flex items-center justify-between gap-3 text-white">
                <span className="font-medium text-[0.9375rem] leading-snug tracking-tight">
                  {visionValue}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </SidebarHeader>

      <SidebarContent className="gap-3 px-0 py-3">
        {navigationGroups.map((group) => (
          <SidebarGroup
            key={group.id}
            aria-label={group.label ?? 'Navegação'}
            className="px-2 py-0"
          >
            {group.label ? (
              <SidebarGroupLabel className="h-7 rounded-none px-4 font-sans font-semibold text-[10px] text-on-primary-container/70 uppercase tracking-normal">
                {group.label}
              </SidebarGroupLabel>
            ) : null}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0">
                {group.items.map((item) => {
                  const active = item.id === activeId;
                  const filled = active || item.iconFill;
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        asChild
                        className={cn(
                          'h-auto min-h-12 rounded-none border-transparent border-l-[3px] px-4 py-3 text-primary-foreground hover:bg-white/5 hover:text-white data-[active=true]:bg-transparent',
                          active
                            ? 'sidebar-nav-active border-l-sidebar-highlight text-white'
                            : 'text-on-primary-container',
                        )}
                        isActive={active}
                        size="lg"
                      >
                        <Link
                          to={item.href}
                          title={item.label}
                          className="group/nav flex w-full items-center gap-4"
                        >
                          <span
                            className={cn(
                              'material-symbols-outlined shrink-0 text-[24px] leading-none',
                              filled && 'ms-fill',
                              active
                                ? 'text-sidebar-highlight'
                                : 'text-on-primary-container group-hover/nav:text-white',
                            )}
                            aria-hidden
                          >
                            {item.icon}
                          </span>
                          <span className="font-medium font-sans text-sm tracking-tight">
                            {item.label}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {userName ? (
        <SidebarFooter className="border-outline-variant/10 border-t p-2">
          <div className="flex items-center gap-3 rounded-md bg-primary/20 p-3">
            <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden bg-outline-variant/20">
              {userAvatarUrl ? (
                <img
                  src={userAvatarUrl}
                  alt=""
                  className="h-full w-full object-cover contrast-125 grayscale"
                />
              ) : (
                <span className="font-sans font-semibold text-on-primary-container text-xs">
                  {userName
                    .split(/\s+/)
                    .map((p) => p[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-sans font-semibold text-sm text-white tracking-tight">
                {userName}
              </p>
              {userRole ? (
                <p className="font-sans text-[10px] text-on-primary-container uppercase tracking-widest">
                  {userRole}
                </p>
              ) : null}
            </div>
            {accountActions.length > 0 ? (
              <details className="group/account relative">
                <summary
                  className="shrink-0 cursor-pointer list-none text-on-primary-container transition-colors hover:text-white"
                  aria-label={accountMenuLabel}
                >
                  <span className="material-symbols-outlined text-xl" aria-hidden>
                    account_circle
                  </span>
                </summary>
                <div className="absolute right-0 bottom-[calc(100%+0.5rem)] z-50 min-w-40 rounded-md border border-outline-variant/25 bg-primary px-1 py-1 shadow-black/30 shadow-lg">
                  {accountActions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={action.onSelect}
                      disabled={action.disabled}
                      className="w-full rounded px-3 py-2 text-left font-sans text-sm text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        </SidebarFooter>
      ) : null}
    </Sidebar>
  );
}
