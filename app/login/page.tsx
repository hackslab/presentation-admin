"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { ShineBorder } from "@/components/ui/shine-border";

type ThemeMode = "light" | "dark";

interface AdminProfile {
  id: number;
  name: string;
  username: string;
  role: "ADMIN" | "SUPERADMIN";
  createdAt: string;
  updatedAt: string;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  admin: AdminProfile;
}

interface ApiError {
  message?: string | string[];
  error?: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";
const API_PROXY_PREFIX = "/backend";
const THEME_STORAGE_KEY = "axiom-admin-theme";
const SESSION_STORAGE_KEY = "axiom-admin-session";

function parseApiError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const typedPayload = payload as ApiError;

  if (Array.isArray(typedPayload.message)) {
    return typedPayload.message.join(" ");
  }

  if (typeof typedPayload.message === "string") {
    return typedPayload.message;
  }

  if (typeof typedPayload.error === "string") {
    return typedPayload.error;
  }

  return fallback;
}

async function parseResponseBody<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return null as T;
  }

  const rawText = await response.text();

  if (!rawText) {
    return null as T;
  }

  try {
    return JSON.parse(rawText) as T;
  } catch {
    return rawText as T;
  }
}

function resolveNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/login")) {
    return "/";
  }

  return value;
}

function toErrorMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }

  return "Sign in failed. Try again.";
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [isHydrated, setIsHydrated] = useState(false);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nextPath = useMemo(() => resolveNextPath(searchParams.get("next")), [searchParams]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const savedSession = window.localStorage.getItem(SESSION_STORAGE_KEY);

    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
      document.documentElement.classList.toggle("dark", savedTheme === "dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    if (savedSession) {
      try {
        const parsedSession = JSON.parse(savedSession) as AuthResponse;

        if (parsedSession?.accessToken) {
          router.replace(nextPath);
          return;
        }
      } catch {
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }

    setIsHydrated(true);
  }, [nextPath, router]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [isHydrated, theme]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_PROXY_PREFIX}/admin/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
        }),
        cache: "no-store",
      });

      if (!response.ok) {
        const errorPayload = await parseResponseBody<unknown>(response).catch(() => null);
        const errorMessage = parseApiError(errorPayload, `Login failed with ${response.status}`);
        throw new Error(errorMessage);
      }

      const payload = await parseResponseBody<AuthResponse>(response);
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
      router.replace(nextPath);
    } catch (requestError) {
      toast.error(toErrorMessage(requestError));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="dashboard-shell min-h-screen" data-theme={theme}>
      <div
        className="relative flex min-h-screen items-center justify-center p-4"
        style={{
          background:
            "radial-gradient(circle at 15% 12%, var(--glow-a), transparent 40%), radial-gradient(circle at 85% 5%, var(--glow-b), transparent 45%), var(--app-bg)",
        }}
      >
        <div className="pointer-events-none absolute inset-0 terminal-grid opacity-60" />

        <div className="surface-glass relative z-10 w-full max-w-md overflow-hidden rounded-3xl p-6 md:p-7">
          <ShineBorder
            borderWidth={1}
            duration={10}
            shineColor={["rgba(14,165,233,0.66)", "rgba(249,115,22,0.45)"]}
          />

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[0.67rem] font-semibold tracking-[0.2em] uppercase text-muted">MagicUI Console</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-main">Axiom Admin Login</h1>
            </div>

            <AnimatedThemeToggler
              storageKey={THEME_STORAGE_KEY}
              onThemeChange={setTheme}
              aria-label="Toggle theme"
              className="inline-flex size-9 items-center justify-center rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] text-main transition hover:border-[var(--accent)]"
            />
          </div>

          <p className="mt-3 text-sm text-muted">Use your admin credentials to access the dashboard.</p>

          <form className="mt-5 space-y-3" onSubmit={handleLogin}>
            <label className="grid gap-2 text-sm text-main">
              Username
              <input
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                }}
                className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-main outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                placeholder="admin"
                autoComplete="username"
                required
              />
            </label>

            <label className="grid gap-2 text-sm text-main">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
                className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-main outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                placeholder="admin123"
                autoComplete="current-password"
                required
              />
            </label>

            <button
              type="submit"
              disabled={isSubmitting || !isHydrated}
              aria-label={isSubmitting ? "Signing in" : "Sign in"}
              title={isSubmitting ? "Signing in" : "Sign in"}
              className="inline-flex w-full items-center justify-center rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-main transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <LogIn className="size-4" aria-hidden="true" />
              )}
              <span className="sr-only">{isSubmitting ? "Signing in" : "Sign in"}</span>
            </button>
          </form>

          <div className="mt-4 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2">
            <p className="text-[0.65rem] tracking-[0.16em] uppercase text-muted">Target API</p>
            <p className="mt-1 break-all text-xs text-main">{API_BASE_URL}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
