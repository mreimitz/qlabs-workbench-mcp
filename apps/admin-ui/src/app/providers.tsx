"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "@brand/tokens";

export function Providers(props: { children: ReactNode }) {
  return <ThemeProvider defaultTheme="qlik-dark">{props.children}</ThemeProvider>;
}
