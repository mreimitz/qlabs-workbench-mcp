"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { BrandLogo } from "@brand/icons";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  PageShell,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  ThemeSwitcher,
  TopNav,
  cn,
  useSidebar,
} from "@brand/ui";
import {
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  X,
} from "lucide-react";
import {
  getPrimaryNavItem,
  primaryNavItems,
  secondaryNavItems,
  type SecondaryNavItem,
} from "./navigation";
import type { ViewKey } from "./types";

export type WorkbenchShellProps = {
  activeView: ViewKey;
  busy: boolean;
  children: ReactNode;
  contextPanel?: ReactNode;
  onRefresh: () => void;
  onViewChange: (view: ViewKey) => void;
  secondaryContent?: ReactNode;
  secondaryWidthClassName?: string;
};

export function WorkbenchShell({
  activeView,
  busy,
  children,
  contextPanel,
  onRefresh,
  onViewChange,
  secondaryContent,
  secondaryWidthClassName,
}: WorkbenchShellProps) {
  const activeItem = getPrimaryNavItem(activeView);
  const secondaryItems = secondaryNavItems[activeView];
  const mainRef = useRef<HTMLElement>(null);
  const [secondaryOpen, setSecondaryOpen] = useState(true);
  const [contextOpen, setContextOpen] = useState(true);
  const hasSecondary = secondaryItems.length > 0 || Boolean(secondaryContent);
  const hasContextPanel = Boolean(contextPanel);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0 });
  }, [activeView]);

  useEffect(() => {
    setSecondaryOpen(hasSecondary);
  }, [activeView, hasSecondary]);

  useEffect(() => {
    setContextOpen(hasContextPanel);
  }, [activeView, hasContextPanel]);

  return (
    <SidebarProvider style={{ "--sidebar-width": "14rem" } as CSSProperties}>
      <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
        <Sidebar
          side="left"
          variant="sidebar"
          collapsible="icon"
          className="w-56 border-e"
        >
          <SidebarHeader className="flex h-14 justify-center border-b px-3 py-0">
            <div className="flex min-w-0 items-center gap-2.5">
              <BrandLogo variant="mark" height={24} title="Qlik" />
              <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                <div className="truncate text-sm font-semibold">
                  QLabs Workbench
                </div>
                <div className="truncate text-[11px] text-sidebar-muted-foreground">
                  MCP control plane
                </div>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {primaryNavItems.map((item) => (
                    <PrimaryNavButton
                      key={item.id}
                      activeView={activeView}
                      item={item}
                      onViewChange={onViewChange}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-t p-3 group-data-[collapsible=icon]:hidden">
            <div className="truncate text-xs text-sidebar-muted-foreground">
              Admin UI
            </div>
          </SidebarFooter>
        </Sidebar>

        <SecondarySidebar
          activeView={activeView}
          open={secondaryOpen}
          title={activeItem.label}
          items={secondaryItems}
          widthClassName={secondaryWidthClassName}
          onOpenChange={setSecondaryOpen}
        >
          {secondaryContent}
        </SecondarySidebar>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopNav
            className="border-b"
            start={
              <div className="flex min-w-0 items-center gap-2">
                <SidebarTrigger />
                {hasSecondary ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="hidden md:inline-flex"
                    aria-label={
                      secondaryOpen
                        ? "Collapse section navigation"
                        : "Expand section navigation"
                    }
                    onClick={() => setSecondaryOpen((open) => !open)}
                  >
                    {secondaryOpen ? (
                      <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
                    )}
                  </Button>
                ) : null}
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem className="hidden sm:inline-flex">
                      Admin
                    </BreadcrumbItem>
                    <BreadcrumbSeparator className="hidden sm:inline-flex" />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{activeItem.label}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
            }
            end={
              <div className="ms-auto flex min-w-0 items-center gap-2">
                {hasContextPanel ? (
                  <Button
                    variant="outline-subtle"
                    size="icon-sm"
                    className="hidden xl:inline-flex"
                    aria-label={
                      contextOpen
                        ? "Collapse context panel"
                        : "Expand context panel"
                    }
                    onClick={() => setContextOpen((open) => !open)}
                  >
                    {contextOpen ? (
                      <PanelRightClose className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
                    )}
                  </Button>
                ) : null}
                <ThemeSwitcher
                  themes={["qlik-bright", "qlik-dark"]}
                  mode="dropdown"
                  showSystem
                  size="sm"
                />
                <Button
                  variant="outline-subtle"
                  size="icon-sm"
                  onClick={onRefresh}
                  disabled={busy}
                  aria-label={busy ? "Refreshing" : "Refresh"}
                >
                  <RefreshCw
                    className={cn("h-4 w-4", busy && "animate-spin")}
                    aria-hidden="true"
                  />
                </Button>
              </div>
            }
          />

          <div className="flex min-h-0 flex-1">
            <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto">
              <PageShell width="full" className="px-3 py-3 sm:px-4 lg:px-5">
                {children}
              </PageShell>
            </main>
            {hasContextPanel ? (
              <aside
                aria-label="Context panel"
                data-state={contextOpen ? "expanded" : "collapsed"}
                className={cn(
                  "hidden shrink-0 overflow-hidden border-s bg-background transition-[width] duration-base ease-entrance xl:flex",
                  contextOpen ? "w-80" : "w-0",
                )}
              >
                <div className="h-full w-80 shrink-0">{contextPanel}</div>
              </aside>
            ) : null}
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}

function PrimaryNavButton(props: {
  activeView: ViewKey;
  item: (typeof primaryNavItems)[number];
  onViewChange: (view: ViewKey) => void;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const Icon = props.item.icon;
  const isActive = props.activeView === props.item.id;
  const hasSecondary = secondaryNavItems[props.item.id].length > 0;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        className="h-9 w-full px-3 text-sm"
        onClick={() => {
          props.onViewChange(props.item.id);
          if (window.location.hash) {
            window.history.replaceState(
              null,
              "",
              window.location.pathname + window.location.search,
            );
          }
          if (isMobile) setOpenMobile(false);
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{props.item.label}</span>
        </div>
        {hasSecondary ? (
          <ChevronRight
            className={cn(
              "ms-auto h-4 w-4 shrink-0 transition-transform",
              isActive && "rotate-90",
            )}
            aria-hidden="true"
          />
        ) : null}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function SecondarySidebar(props: {
  activeView: ViewKey;
  children?: ReactNode;
  open: boolean;
  title: string;
  items: SecondaryNavItem[];
  onOpenChange: (open: boolean) => void;
  widthClassName?: string;
}) {
  const [selectedItem, setSelectedItem] = useState(props.items[0]?.id ?? "");
  const widthClassName = props.widthClassName ?? "w-60";

  useEffect(() => {
    setSelectedItem(props.items[0]?.id ?? "");
  }, [props.activeView, props.items]);

  if (props.items.length === 0 && !props.children) return null;

  return (
    <aside
      aria-label={`${props.title} sections`}
      data-state={props.open ? "expanded" : "collapsed"}
      className={cn(
        "hidden shrink-0 overflow-hidden border-e bg-sidebar text-sidebar-foreground transition-[width] duration-base ease-entrance md:flex",
        props.open ? widthClassName : "w-0",
      )}
    >
      <div className={cn("flex h-full shrink-0 flex-col", widthClassName)}>
        <div className="flex h-14 items-center justify-between gap-2 border-b px-3">
          <h2 className="truncate text-sm font-medium">{props.title}</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Collapse section navigation"
            onClick={() => props.onOpenChange(false)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        {props.children ? (
          <div className="min-h-0 flex-1">{props.children}</div>
        ) : (
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {props.items.map((item) => {
                    const Icon = item.icon;
                    const sectionId = `${props.activeView}-${item.id}`;
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          asChild
                          isActive={selectedItem === item.id}
                          className="h-auto w-full gap-2 px-3 py-2 text-sm"
                        >
                          <a
                            href={`#${sectionId}`}
                            onClick={() => setSelectedItem(item.id)}
                          >
                            <Icon
                              className="mt-0.5 h-4 w-4 shrink-0 self-start"
                              aria-hidden="true"
                            />
                            <div className="min-w-0 flex-1 text-start">
                              <div className="truncate font-medium">
                                {item.label}
                              </div>
                              <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-sidebar-muted-foreground">
                                {item.description}
                              </div>
                            </div>
                          </a>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        )}
      </div>
    </aside>
  );
}
