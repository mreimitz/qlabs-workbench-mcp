"use client";

import type { ComponentProps, ReactNode } from "react";
import { Badge, Button, cn } from "@brand/ui";
import type { LucideIcon } from "lucide-react";

export function EnterprisePage(props: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto flex w-full max-w-[1600px] flex-col gap-4", props.className)}>
      {props.children}
    </div>
  );
}

export function EnterpriseHeader(props: {
  actions?: ReactNode;
  description?: string;
  eyebrow?: string;
  meta?: ReactNode;
  title: string;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-4 border-b pb-4">
      <div className="min-w-0">
        {props.eyebrow ? (
          <div className="mb-1 text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
            {props.eyebrow}
          </div>
        ) : null}
        <h2 className="truncate text-base font-semibold leading-6">{props.title}</h2>
        {props.description ? (
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{props.description}</p>
        ) : null}
        {props.meta ? <div className="mt-2 flex flex-wrap gap-2">{props.meta}</div> : null}
      </div>
      {props.actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{props.actions}</div> : null}
    </div>
  );
}

export function CommandBar(props: { children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex min-h-12 flex-wrap items-center justify-between gap-3 border-b bg-surface-muted/40 px-4 py-3",
        props.className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">{props.children}</div>
      {props.actions ? <div className="flex shrink-0 items-center gap-2">{props.actions}</div> : null}
    </div>
  );
}

export function Panel(props: {
  children: ReactNode;
  className?: string;
  id?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <section id={props.id} className={cn("min-w-0 overflow-hidden rounded-md border bg-background", props.className)}>
      {props.title || props.description || props.actions ? (
        <div className="flex min-h-14 flex-wrap items-start justify-between gap-4 border-b px-4 py-3">
          <div className="min-w-0">
            {props.title ? <h3 className="truncate text-sm font-semibold leading-5">{props.title}</h3> : null}
            {props.description ? (
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{props.description}</p>
            ) : null}
          </div>
          {props.actions ? <div className="flex shrink-0 items-center gap-2">{props.actions}</div> : null}
        </div>
      ) : null}
      {props.children}
    </section>
  );
}

export function MetricStrip(props: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-3 md:grid-cols-2 xl:grid-cols-4", props.className)}>{props.children}</div>;
}

export function MetricPill(props: {
  icon?: LucideIcon;
  label: string;
  value: ReactNode;
  description?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const Icon = props.icon;
  const toneClass = {
    default: "border-border",
    success: "border-success/30 bg-success/5",
    warning: "border-warning/30 bg-warning/5",
    danger: "border-destructive/30 bg-destructive/5",
  }[props.tone ?? "default"];

  return (
    <div className={cn("flex min-h-16 min-w-0 items-start gap-3 rounded-md border px-4 py-3", toneClass)}>
      {Icon ? <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
      <div className="min-w-0">
        <div className="truncate text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
          {props.label}
        </div>
        <div className="mt-0.5 truncate text-lg font-semibold leading-6 tabular-nums">{props.value}</div>
        {props.description ? (
          <div className="mt-0.5 truncate text-xs leading-4 text-muted-foreground">{props.description}</div>
        ) : null}
      </div>
    </div>
  );
}

export function InlineActionButton(props: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <Button variant="outline-subtle" size="sm" disabled={props.disabled} onClick={props.onClick}>
      {props.children}
    </Button>
  );
}

export function CompactBadge(props: { children: ReactNode; variant?: ComponentProps<typeof Badge>["variant"] }) {
  return (
    <Badge variant={props.variant ?? "secondary"} className="h-5 rounded-sm px-1.5 text-[11px] font-medium">
      {props.children}
    </Badge>
  );
}
