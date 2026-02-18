"use client";

import { useEffect, useState } from "react";
import { Toaster } from "sonner";

type SonnerTheme = "light" | "dark";

function resolveTheme(): SonnerTheme {
  if (typeof document === "undefined") {
    return "light";
  }

  return document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
}

export function AppToaster() {
  const [theme, setTheme] = useState<SonnerTheme>(() => resolveTheme());

  useEffect(() => {
    const rootElement = document.documentElement;

    const updateTheme = () => {
      setTheme(resolveTheme());
    };

    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(rootElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  return <Toaster closeButton position="bottom-right" richColors theme={theme} />;
}
