"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { flushSync } from "react-dom";

import { cn } from "@/lib/utils";

type ThemeMode = "light" | "dark";

interface AnimatedThemeTogglerProps
  extends React.ComponentPropsWithoutRef<"button"> {
  duration?: number;
  storageKey?: string;
  onThemeChange?: (theme: ThemeMode) => void;
}

export const AnimatedThemeToggler = ({
  className,
  duration = 400,
  storageKey = "theme",
  onThemeChange,
  onClick,
  ...props
}: AnimatedThemeTogglerProps) => {
  const buttonRef = useRef<HTMLButtonElement>(null);

  const subscribeToTheme = useCallback((onStoreChange: () => void) => {
    if (typeof document === "undefined") {
      return () => undefined;
    }

    const observer = new MutationObserver(() => {
      onStoreChange();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  const getThemeSnapshot = useCallback(() => {
    if (typeof document === "undefined") {
      return false;
    }

    return document.documentElement.classList.contains("dark");
  }, []);

  const isDark = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, () => false);

  const applyTheme = useCallback(
    (nextTheme: ThemeMode) => {
      const nextIsDark = nextTheme === "dark";
      document.documentElement.classList.toggle("dark", nextIsDark);
      window.localStorage.setItem(storageKey, nextTheme);
      onThemeChange?.(nextTheme);
    },
    [onThemeChange, storageKey],
  );

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(storageKey);

    if (savedTheme === "light" || savedTheme === "dark") {
      const nextIsDark = savedTheme === "dark";
      document.documentElement.classList.toggle("dark", nextIsDark);
      onThemeChange?.(savedTheme);
    } else {
      onThemeChange?.(getThemeSnapshot() ? "dark" : "light");
    }
  }, [getThemeSnapshot, onThemeChange, storageKey]);

  const toggleTheme = useCallback(async () => {
    const nextTheme: ThemeMode = isDark ? "light" : "dark";

    if (typeof document.startViewTransition !== "function") {
      applyTheme(nextTheme);
      return;
    }

    const transition = document.startViewTransition(() => {
      flushSync(() => {
        applyTheme(nextTheme);
      });
    });

    await transition.ready.catch(() => undefined);

    if (!buttonRef.current) {
      return;
    }

    const { top, left, width, height } = buttonRef.current.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const maxRadius = Math.hypot(
      Math.max(left, window.innerWidth - left),
      Math.max(top, window.innerHeight - top),
    );

    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${maxRadius}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration,
        easing: "ease-in-out",
        pseudoElement: "::view-transition-new(root)",
      },
    );
  }, [applyTheme, duration, isDark]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={(event) => {
        onClick?.(event);

        if (!event.defaultPrevented) {
          void toggleTheme();
        }
      }}
      className={cn(className)}
      {...props}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      <span className="sr-only">Toggle theme</span>
    </button>
  );
};
