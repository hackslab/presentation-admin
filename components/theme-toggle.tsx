"use client";

import { useState } from "react";

const STORAGE_KEY = "admin-theme";
type ThemeMode = "light" | "dark";
type ThemeToggleProps = {
  className?: string;
};

function readThemeFromDocument(): ThemeMode {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v2.5" />
      <path d="M12 19v2.5" />
      <path d="M4.9 4.9l1.8 1.8" />
      <path d="M17.3 17.3l1.8 1.8" />
      <path d="M2.5 12H5" />
      <path d="M19 12h2.5" />
      <path d="M4.9 19.1l1.8-1.8" />
      <path d="M17.3 6.7l1.8-1.8" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 13.2A8.6 8.6 0 1 1 10.8 4a7 7 0 1 0 9.2 9.2z" />
    </svg>
  );
}

export default function ThemeToggle({ className = "" }: ThemeToggleProps) {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof document === "undefined") {
      return "light";
    }

    return readThemeFromDocument();
  });

  const handleToggle = () => {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === "dark" ? "light" : "dark";

      document.documentElement.dataset.theme = nextTheme;

      try {
        window.localStorage.setItem(STORAGE_KEY, nextTheme);
      } catch {
        // Ignore storage failures without blocking theme switch.
      }

      return nextTheme;
    });
  };

  const isDark = theme === "dark";
  const nextThemeLabel = theme === "dark" ? "light" : "dark";
  const modeLabel = isDark ? "Dark mode" : "Light mode";

  return (
    <button
      type="button"
      aria-label={`Switch to ${nextThemeLabel} theme`}
      aria-pressed={isDark}
      data-theme-mode={theme}
      onClick={handleToggle}
      className={[
        "group flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left",
        "transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-[#5a8ab0] focus-visible:ring-offset-1",
        isDark
          ? "border-[#385d78] bg-[linear-gradient(160deg,#0f2438_0%,#132c43_100%)] text-[#dce8f4] shadow-[0_10px_22px_rgba(2,10,18,0.35)]"
          : "border-[#c8d9e7] bg-[linear-gradient(160deg,#f8fbff_0%,#eff6fc_100%)] text-[#102e45] shadow-[0_10px_20px_rgba(21,56,82,0.12)]",
        className,
      ].join(" ")}
    >
      <span className="flex min-w-0 flex-col leading-none">
        <span
          className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${
            isDark ? "text-[#8fa9bf]" : "text-[#597387]"
          }`}
        >
          Theme
        </span>
        <span className={`mt-1.5 text-sm font-semibold ${isDark ? "text-[#e4eef7]" : "text-[#17374f]"}`}>
          {modeLabel}
        </span>
      </span>

      <span
        aria-hidden="true"
        className={[
          "relative inline-flex h-7 w-12 shrink-0 rounded-full border p-[2px] transition-all duration-300",
          isDark
            ? "border-[#4b6f89] bg-[linear-gradient(170deg,#112844_0%,#1a3a5e_100%)]"
            : "border-[#b9d2e4] bg-[linear-gradient(170deg,#8fd0f3_0%,#bfe7fb_100%)]",
        ].join(" ")}
      >
        <span
          className={[
            "relative flex h-[22px] w-[22px] items-center justify-center rounded-full transition-transform duration-300",
            isDark
              ? "translate-x-[22px] bg-[linear-gradient(165deg,#edf3ff_0%,#c2d3ee_100%)] shadow-[0_4px_10px_rgba(3,10,25,0.35)]"
              : "translate-x-0 bg-[linear-gradient(165deg,#ffe89f_0%,#ffc75b_100%)] shadow-[0_4px_10px_rgba(163,95,21,0.24)]",
          ].join(" ")}
        >
          <SunIcon
            className={[
              "h-3.5 w-3.5 transition-all duration-300",
              isDark ? "scale-75 opacity-0 text-[#9d640e]" : "scale-100 opacity-100 text-[#98550b]",
            ].join(" ")}
          />
          <MoonIcon
            className={[
              "absolute h-3.5 w-3.5 transition-all duration-300",
              isDark ? "scale-100 opacity-100 text-[#4d6682]" : "scale-75 opacity-0 text-[#dceaff]",
            ].join(" ")}
          />
        </span>
      </span>
    </button>
  );
}
