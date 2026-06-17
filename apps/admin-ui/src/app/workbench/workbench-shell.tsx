"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
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
  cn,
  useSidebar,
} from "@brand/ui";
import { ChevronRight } from "lucide-react";
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
  onRefresh: () => void;
  onViewChange: (view: ViewKey) => void;
};

export function WorkbenchShell({
  activeView,
  busy,
  children,
  onRefresh,
  onViewChange,
}: WorkbenchShellProps) {
  const activeItem = getPrimaryNavItem(activeView);
  const secondaryItems = secondaryNavItems[activeView];
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0 });
  }, [activeView]);

  return (
    <SidebarProvider>
      <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
        <Sidebar
          side="left"
          variant="sidebar"
          collapsible="icon"
          className="w-64 border-e"
        >
          <SidebarHeader className="border-b px-3 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                QLabs Workbench
              </div>
              <div className="truncate text-xs text-sidebar-muted-foreground">
                Local MCP operations
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
          <SidebarFooter className="border-t p-3">
            <div className="text-xs text-sidebar-muted-foreground">
              Admin UI
            </div>
          </SidebarFooter>
        </Sidebar>

        <SecondarySidebar
          activeView={activeView}
          title={activeItem.label}
          items={secondaryItems}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-surface-elevated/80 px-4 backdrop-blur">
            <div className="md:hidden">
              <SidebarTrigger />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-medium">
                {activeItem.label}
              </h1>
            </div>
            <div className="ms-auto flex min-w-0 items-center gap-2">
              <ThemeSwitcher
                themes={["qlik-bright", "qlik-dark"]}
                mode="dropdown"
                showSystem
                size="sm"
              />
              <Button
                variant="outline-subtle"
                size="sm"
                onClick={onRefresh}
                disabled={busy}
              >
                {busy ? "Refreshing" : "Refresh"}
              </Button>
            </div>
          </header>

          <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto">
            <PageShell width="full" className="px-4 py-4 sm:px-6 lg:px-6">
              {children}
            </PageShell>
          </main>
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
        className="h-10 w-full px-3"
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
  title: string;
  items: SecondaryNavItem[];
}) {
  const [selectedItem, setSelectedItem] = useState(props.items[0]?.id ?? "");

  useEffect(() => {
    setSelectedItem(props.items[0]?.id ?? "");
  }, [props.activeView, props.items]);

  if (props.items.length === 0) return null;

  return (
    <Sidebar
      side="left"
      variant="sidebar"
      collapsible="none"
      className="hidden w-72 animate-in border-e duration-base ease-entrance md:flex"
    >
      <SidebarHeader className="flex h-14 flex-row items-center border-b px-4">
        <h2 className="truncate text-sm font-medium">{props.title}</h2>
      </SidebarHeader>
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
                      className="h-auto w-full gap-3 px-3 py-2"
                    >
                      <a
                        href={`#${sectionId}`}
                        onClick={() => setSelectedItem(item.id)}
                      >
                        <Icon
                          className="mt-0.5 h-5 w-5 shrink-0 self-start"
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1 text-start">
                          <div className="truncate font-medium">
                            {item.label}
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-xs text-sidebar-muted-foreground">
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
    </Sidebar>
  );
}
