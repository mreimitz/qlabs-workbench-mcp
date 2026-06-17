"use client";

import { useEffect, type ReactNode } from "react";
import { useTheme, ThemeProvider } from "@brand/tokens";

export function Providers(props: { children: ReactNode }) {
  return (
    <ThemeProvider defaultTheme="qlik-bright">
      <ThemeBootstrap />
      <HideNextDevOverlay />
      {props.children}
    </ThemeProvider>
  );
}

const THEME_STORAGE_KEY = "brand-ui-theme";
const SYSTEM_STORAGE_KEY = "brand-ui-theme-system";
const allowedThemes = ["qlik-bright", "qlik-dark"] as const;

function ThemeBootstrap() {
  const { setTheme } = useTheme();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme && !allowedThemes.includes(storedTheme as (typeof allowedThemes)[number])) {
      window.localStorage.setItem(THEME_STORAGE_KEY, "qlik-bright");
      window.localStorage.setItem(SYSTEM_STORAGE_KEY, "0");
      setTheme("qlik-bright");
      return;
    }

    const storedSystem = window.localStorage.getItem(SYSTEM_STORAGE_KEY);
    if (storedTheme || storedSystem) return;

    window.localStorage.setItem(SYSTEM_STORAGE_KEY, "1");
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
    setTheme(prefersDark ? "qlik-dark" : "qlik-bright");
  }, [setTheme]);

  return null;
}

function HideNextDevOverlay() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (typeof window === "undefined") return;

    const hide = () => {
      const roots: Array<Document | ShadowRoot> = [document];
      const visited = new Set<unknown>();

      while (roots.length) {
        const root = roots.pop();
        if (!root || visited.has(root)) continue;
        visited.add(root);

        const panels = root.querySelectorAll?.("#devtools-indicator, #panel-route");
        panels?.forEach((el) => {
          (el as HTMLElement).style.display = "none";
        });

        root.querySelectorAll?.("*")?.forEach((el) => {
          const anyEl = el as unknown as { shadowRoot?: ShadowRoot | null };
          if (anyEl.shadowRoot) roots.push(anyEl.shadowRoot);
        });
      }
    };

    hide();
    const interval = window.setInterval(hide, 250);
    const timeout = window.setTimeout(() => window.clearInterval(interval), 4000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, []);

  return null;
}
