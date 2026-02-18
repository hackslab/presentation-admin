"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { BentoCard, BentoGrid } from "@/components/ui/bento-grid";
import { ShineBorder } from "@/components/ui/shine-border";
import { cn } from "@/lib/utils";

type ThemeMode = "light" | "dark";
type AdminRole = "ADMIN" | "SUPERADMIN";
type PresentationStatus = "pending" | "completed" | "failed";
type PresentationStatusFilter = PresentationStatus | "all";

interface AdminProfile {
  id: number;
  name: string;
  username: string;
  role: AdminRole;
  createdAt: string;
  updatedAt: string;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  admin: AdminProfile;
}

interface OverviewResponse {
  totalUsers: number;
  registeredUsers: number;
  activeUsers24h: number;
  generated24h: number;
  pendingJobs: number;
  completedJobs: number;
  failedJobs: number;
}

interface UserRow {
  id: number;
  telegramId: string;
  firstName: string;
  username: string | null;
  phoneNumber: string | null;
  createdAt: string;
  totalGenerations: number;
  usedToday: number;
  lastGenerationAt: string | null;
}

interface PresentationMetadata {
  prompt?: string;
  language?: string;
  pageCount?: number;
  useImages?: boolean;
  fileName?: string;
}

interface PresentationRow {
  id: number;
  status: PresentationStatus;
  createdAt: string;
  telegramId: string;
  firstName: string;
  username: string | null;
  metadata?: PresentationMetadata;
}

interface BroadcastResult {
  recipients: number;
  sent: number;
  failed: number;
}

interface ApiError {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";
const API_PROXY_PREFIX = "/backend";
const THEME_STORAGE_KEY = "axiom-admin-theme";
const SESSION_STORAGE_KEY = "axiom-admin-session";

type SectionKey = "overview" | "users" | "presentations" | "broadcast" | "admins";

function toErrorMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }

  return "An unexpected error occurred.";
}

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

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) {
    return "-";
  }

  const parsedDate = new Date(dateString);

  if (Number.isNaN(parsedDate.getTime())) {
    return dateString;
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsedDate);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export default function Home() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [isHydrated, setIsHydrated] = useState(false);

  const [session, setSession] = useState<AuthResponse | null>(null);
  const [profile, setProfile] = useState<AdminProfile | null>(null);

  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [presentations, setPresentations] = useState<PresentationRow[]>([]);
  const [admins, setAdmins] = useState<AdminProfile[]>([]);

  const [adminsError, setAdminsError] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalInfo, setGlobalInfo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [loginUsername, setLoginUsername] = useState("admin");
  const [loginPassword, setLoginPassword] = useState("admin123");
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);

  const [userSearch, setUserSearch] = useState("");
  const [userLimit, setUserLimit] = useState(20);

  const [presentationLimit, setPresentationLimit] = useState(15);
  const [presentationStatus, setPresentationStatus] = useState<PresentationStatusFilter>("pending");

  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastResult, setBroadcastResult] = useState<BroadcastResult | null>(null);

  const [adminName, setAdminName] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminRole, setAdminRole] = useState<AdminRole>("ADMIN");

  const apiRequest = useCallback(
    async <T,>(path: string, options: RequestInit = {}, requiresAuth = true): Promise<T> => {
      const method = (options.method ?? "GET").toUpperCase();
      const headers = new Headers(options.headers);

      if (options.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      if (requiresAuth) {
        if (!session?.accessToken) {
          throw new Error("Sign in first to access protected endpoints.");
        }

        headers.set("Authorization", `Bearer ${session.accessToken}`);
      }

      const response = await fetch(`${API_PROXY_PREFIX}${path}`, {
        ...options,
        headers,
        cache: "no-store",
      });

      if (!response.ok) {
        const errorPayload = await parseResponseBody<unknown>(response).catch(() => null);
        const errorMessage = parseApiError(
          errorPayload,
          `${method} ${path} failed with ${response.status}`
        );

        throw new Error(errorMessage);
      }

      return parseResponseBody<T>(response);
    },
    [session?.accessToken]
  );

  const fetchMe = useCallback(async () => {
    const data = await apiRequest<AdminProfile>("/admin/auth/me");
    setProfile(data);
  }, [apiRequest]);

  const fetchOverview = useCallback(async () => {
    const data = await apiRequest<OverviewResponse>("/admin/overview");
    setOverview(data);
  }, [apiRequest]);

  const fetchUsers = useCallback(async () => {
    const query = new URLSearchParams();

    if (userSearch.trim()) {
      query.set("search", userSearch.trim());
    }

    query.set("limit", `${Math.max(1, Math.min(200, userLimit))}`);

    const data = await apiRequest<UserRow[]>(`/admin/users?${query.toString()}`);
    setUsers(data);
  }, [apiRequest, userLimit, userSearch]);

  const fetchPresentations = useCallback(async () => {
    const query = new URLSearchParams();

    if (presentationStatus !== "all") {
      query.set("status", presentationStatus);
    }

    query.set("limit", `${Math.max(1, Math.min(200, presentationLimit))}`);

    const data = await apiRequest<PresentationRow[]>(`/admin/presentations?${query.toString()}`);
    setPresentations(data);
  }, [apiRequest, presentationLimit, presentationStatus]);

  const fetchAdmins = useCallback(async () => {
    try {
      const data = await apiRequest<AdminProfile[]>("/admin/admins");
      setAdmins(data);
      setAdminsError(null);
    } catch (error) {
      setAdmins([]);
      setAdminsError(toErrorMessage(error));
    }
  }, [apiRequest]);

  const refreshDashboard = useCallback(async () => {
    if (!session?.accessToken) {
      return;
    }

    setIsLoading(true);
    setGlobalError(null);

    const results = await Promise.allSettled([
      fetchMe(),
      fetchOverview(),
      fetchUsers(),
      fetchPresentations(),
      fetchAdmins(),
    ]);

    const rejected = results.find(
      (item): item is PromiseRejectedResult => item.status === "rejected"
    );

    if (rejected) {
      setGlobalError(toErrorMessage(rejected.reason));
    }

    setIsLoading(false);
  }, [fetchAdmins, fetchMe, fetchOverview, fetchPresentations, fetchUsers, session?.accessToken]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const savedSession = window.localStorage.getItem(SESSION_STORAGE_KEY);

    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
    }

    if (savedSession) {
      try {
        const parsedSession = JSON.parse(savedSession) as AuthResponse;
        setSession(parsedSession);
        setProfile(parsedSession.admin);
      } catch {
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }

    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [isHydrated, theme]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (session) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      return;
    }

    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }, [isHydrated, session]);

  useEffect(() => {
    if (!isHydrated || !session?.accessToken) {
      return;
    }

    void refreshDashboard();
  }, [isHydrated, refreshDashboard, session?.accessToken]);

  const overviewCards = useMemo(
    () => [
      {
        label: "Total users",
        value: overview?.totalUsers ?? 0,
      },
      {
        label: "Registered",
        value: overview?.registeredUsers ?? 0,
      },
      {
        label: "Active (24h)",
        value: overview?.activeUsers24h ?? 0,
      },
      {
        label: "Generated (24h)",
        value: overview?.generated24h ?? 0,
      },
      {
        label: "Pending jobs",
        value: overview?.pendingJobs ?? 0,
      },
      {
        label: "Completed jobs",
        value: overview?.completedJobs ?? 0,
      },
      {
        label: "Failed jobs",
        value: overview?.failedJobs ?? 0,
      },
    ],
    [overview]
  );

  const pendingPresentations = presentations.filter((item) => item.status === "pending");

  const activeSection = useMemo<SectionKey>(() => {
    if (pathname.startsWith("/users")) {
      return "users";
    }

    if (pathname.startsWith("/presentations")) {
      return "presentations";
    }

    if (pathname.startsWith("/broadcast")) {
      return "broadcast";
    }

    if (pathname.startsWith("/admins")) {
      return "admins";
    }

    return "overview";
  }, [pathname]);

  const sectionCopy = useMemo(
    () => ({
      overview: {
        eyebrow: "Admin Operations",
        title: "Presentation Platform Command Deck",
        description:
          "Live platform overview with pending moderation items and quick navigation to operational pages.",
      },
      users: {
        eyebrow: "User Intelligence",
        title: "User Directory",
        description: "Search and audit user activity through the documented admin user endpoint.",
      },
      presentations: {
        eyebrow: "Moderation",
        title: "Presentation Stream",
        description: "Review generated presentations and force-fail pending items when needed.",
      },
      broadcast: {
        eyebrow: "Messaging",
        title: "Broadcast Console",
        description: "Send platform-wide announcements to reachable users.",
      },
      admins: {
        eyebrow: "Access Control",
        title: "Admin Management",
        description: "Review admin roster and create new admin accounts based on role permissions.",
      },
    }),
    []
  );

  const navItems = useMemo(
    () => [
      {
        key: "overview" as const,
        label: "Overview",
        href: "/",
        stat: overview?.pendingJobs ?? 0,
      },
      {
        key: "users" as const,
        label: "Users",
        href: "/users",
        stat: users.length,
      },
      {
        key: "presentations" as const,
        label: "Presentations",
        href: "/presentations",
        stat: presentations.length,
      },
      {
        key: "broadcast" as const,
        label: "Broadcast",
        href: "/broadcast",
        stat: broadcastResult?.sent ?? 0,
      },
      {
        key: "admins" as const,
        label: "Admins",
        href: "/admins",
        stat: admins.length,
      },
    ],
    [admins.length, broadcastResult?.sent, overview?.pendingJobs, presentations.length, users.length]
  );

  const statusPillClass = (status: PresentationStatus) => {
    if (status === "pending") {
      return "border-amber-300 bg-amber-100 text-amber-700";
    }

    if (status === "failed") {
      return "border-rose-300 bg-rose-100 text-rose-700";
    }

    return "border-emerald-300 bg-emerald-100 text-emerald-700";
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGlobalError(null);
    setGlobalInfo(null);
    setIsSubmittingLogin(true);

    try {
      const payload = await apiRequest<AuthResponse>(
        "/admin/auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            username: loginUsername,
            password: loginPassword,
          }),
        },
        false
      );

      setSession(payload);
      setProfile(payload.admin);
      setGlobalInfo("Signed in successfully.");
    } catch (error) {
      setGlobalError(toErrorMessage(error));
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  const handleRefreshToken = async () => {
    if (!session?.refreshToken) {
      return;
    }

    setGlobalError(null);

    try {
      const payload = await apiRequest<AuthResponse>(
        "/admin/auth/refresh",
        {
          method: "POST",
          body: JSON.stringify({
            refreshToken: session.refreshToken,
          }),
        },
        false
      );

      setSession(payload);
      setProfile(payload.admin);
      setGlobalInfo("Access token rotated (15m TTL renewed).");
    } catch (error) {
      setGlobalError(toErrorMessage(error));
    }
  };

  const handleLogout = async () => {
    setGlobalError(null);

    if (session?.accessToken) {
      try {
        await apiRequest<{ success: boolean }>(
          "/admin/auth/logout",
          {
            method: "POST",
          },
          true
        );
      } catch {
      }
    }

    setSession(null);
    setProfile(null);
    setOverview(null);
    setUsers([]);
    setPresentations([]);
    setAdmins([]);
    setAdminsError(null);
    setGlobalInfo("Session cleared.");
  };

  const handleFailPresentation = async (id: number) => {
    try {
      const result = await apiRequest<{ updated: boolean }>(
        `/admin/presentations/${id}/fail`,
        { method: "POST" }
      );

      if (result.updated) {
        setGlobalInfo(`Presentation #${id} moved to failed.`);
      } else {
        setGlobalInfo(`Presentation #${id} was not pending.`);
      }

      await fetchPresentations();
      await fetchOverview();
    } catch (error) {
      setGlobalError(toErrorMessage(error));
    }
  };

  const handleBroadcast = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const result = await apiRequest<BroadcastResult>(
        "/admin/broadcast",
        {
          method: "POST",
          body: JSON.stringify({ message: broadcastMessage }),
        },
        true
      );

      setBroadcastResult(result);
      setBroadcastMessage("");
      setGlobalInfo("Broadcast queued successfully.");
    } catch (error) {
      setGlobalError(toErrorMessage(error));
    }
  };

  const handleCreateAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      await apiRequest<AdminProfile>(
        "/admin/admins",
        {
          method: "POST",
          body: JSON.stringify({
            name: adminName,
            username: adminUsername,
            password: adminPassword,
            role: adminRole,
          }),
        },
        true
      );

      setAdminName("");
      setAdminUsername("");
      setAdminPassword("");
      setAdminRole("ADMIN");

      setGlobalInfo("New admin account created.");
      await fetchAdmins();
    } catch (error) {
      setGlobalError(toErrorMessage(error));
    }
  };

  return (
    <div className="dashboard-shell min-h-screen" data-theme={theme}>
      <div
        className="relative min-h-screen"
        style={{
          background:
            "radial-gradient(circle at 10% 10%, var(--glow-a), transparent 40%), radial-gradient(circle at 85% 0%, var(--glow-b), transparent 45%), var(--app-bg)",
        }}
      >
        <div className="pointer-events-none absolute inset-0 terminal-grid opacity-60" />

        <div className="relative mx-auto max-w-[1400px] p-4 md:p-8">
          <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
            <aside className="surface-glass flex min-h-[calc(100vh-4rem)] flex-col rounded-3xl p-5">
              <div className="relative overflow-hidden rounded-2xl p-4 surface-muted">
                <ShineBorder
                  borderWidth={1}
                  duration={9}
                  shineColor={["rgba(14,165,233,0.75)", "rgba(249,115,22,0.55)"]}
                />
                <p className="text-[0.67rem] font-semibold tracking-[0.2em] uppercase text-muted">MagicUI Console</p>
                <h1 className="mt-2 text-xl font-semibold tracking-tight text-main">Axiom Admin</h1>
                <p className="mt-2 text-xs text-muted">Operating on the documented endpoints with real-time controls.</p>
              </div>

              <div className="mt-5 rounded-2xl surface-muted p-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border border-[var(--surface-border)] bg-[var(--surface-3)] px-3 py-2 text-sm font-medium text-main transition hover:border-[var(--accent)]"
                  onClick={() => {
                    setTheme((current) => (current === "light" ? "dark" : "light"));
                  }}
                >
                  <span>Theme</span>
                  <span className="relative inline-flex h-6 w-11 items-center rounded-full border border-[var(--surface-border)] bg-[var(--surface-2)] px-0.5">
                    <span
                      className={cn(
                        "absolute h-4 w-4 rounded-full bg-[var(--accent)] transition-transform",
                        theme === "dark" ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </span>
                </button>
              </div>

              <nav className="mt-5 space-y-2">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm transition",
                      activeSection === item.key
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-main"
                        : "border-[var(--surface-border)] bg-[var(--surface-2)] text-main hover:border-[var(--accent)]"
                    )}
                  >
                    <span>{item.label}</span>
                    <span className="rounded-md border border-[var(--surface-border)] bg-[var(--surface-3)] px-1.5 py-0.5 text-xs">
                      {item.stat}
                    </span>
                  </Link>
                ))}
              </nav>

              <div className="mt-auto rounded-2xl surface-muted p-3">
                <p className="text-[0.65rem] tracking-[0.18em] uppercase text-muted">Target API</p>
                <p className="mt-2 break-all text-xs text-main">{API_BASE_URL}</p>
                <p className="mt-2 text-xs text-muted">Requests proxy through `{API_PROXY_PREFIX}` for local same-origin access.</p>
              </div>
            </aside>

            <main className="space-y-6">
              <header className="surface-glass relative overflow-hidden rounded-3xl p-5 md:p-6">
                <ShineBorder
                  borderWidth={1}
                  duration={10}
                  shineColor={["rgba(14,165,233,0.6)", "rgba(56,189,248,0.28)"]}
                />
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.16em] uppercase text-muted">
                      {sectionCopy[activeSection].eyebrow}
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-tight text-main md:text-3xl">
                      {sectionCopy[activeSection].title}
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm text-muted">{sectionCopy[activeSection].description}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void refreshDashboard();
                      }}
                      disabled={!session || isLoading}
                      className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-medium text-main transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isLoading ? "Syncing..." : "Sync all"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void handleRefreshToken();
                      }}
                      disabled={!session}
                      className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-medium text-main transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Rotate token
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void handleLogout();
                      }}
                      disabled={!session}
                      className="rounded-xl border border-rose-300/50 bg-rose-200/30 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-300/35 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Logout
                    </button>
                  </div>
                </div>

                {profile ? (
                  <p className="mt-4 text-xs text-muted">
                    Signed in as <span className="font-semibold text-main">{profile.name}</span> ({profile.role}) - @{profile.username}
                  </p>
                ) : null}
              </header>

              {globalError ? (
                <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">{globalError}</div>
              ) : null}

              {globalInfo ? (
                <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{globalInfo}</div>
              ) : null}

              {!session ? (
                <section className="surface-glass rounded-3xl p-5 md:p-6">
                  <h3 className="text-xl font-semibold text-main">Admin authentication</h3>
                  <p className="mt-2 text-sm text-muted">Uses `POST /admin/auth/login` and stores both access and refresh tokens in local storage.</p>

                  <form className="mt-5 grid gap-3 md:grid-cols-3" onSubmit={handleLogin}>
                    <label className="grid gap-2 text-sm text-main">
                      Username
                      <input
                        value={loginUsername}
                        onChange={(event) => {
                          setLoginUsername(event.target.value);
                        }}
                        className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                        placeholder="admin"
                        required
                      />
                    </label>

                    <label className="grid gap-2 text-sm text-main">
                      Password
                      <input
                        type="password"
                        value={loginPassword}
                        onChange={(event) => {
                          setLoginPassword(event.target.value);
                        }}
                        className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                        placeholder="admin123"
                        required
                      />
                    </label>

                    <button
                      type="submit"
                      disabled={isSubmittingLogin}
                      className="mt-auto rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-sm font-semibold text-main transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSubmittingLogin ? "Signing in..." : "Sign in"}
                    </button>
                  </form>
                </section>
              ) : (
                <>
                  <div key={activeSection}>
                    {activeSection === "overview" ? (
                      <BentoGrid>
                        <BentoCard
                          title="Live Metrics"
                          description="Sourced from GET /admin/overview"
                          className="surface-glass md:col-span-4"
                        >
                          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                            {overviewCards.map((item) => (
                              <div
                                key={item.label}
                                className="relative overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-2)] p-3"
                              >
                                <ShineBorder
                                  borderWidth={1}
                                  duration={12}
                                  shineColor={["rgba(34,211,238,0.4)", "rgba(14,165,233,0.1)"]}
                                />
                                <p className="text-xs text-muted">{item.label}</p>
                                <p className="mt-2 text-xl font-semibold text-main">
                                  {formatNumber(item.value)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </BentoCard>

                        <BentoCard
                          title="Pending Queue"
                          description="Moderation candidate list"
                          className="surface-glass md:col-span-2"
                        >
                          <div className="space-y-2">
                            {pendingPresentations.length === 0 ? (
                              <p className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-muted">
                                No pending presentations in current filter.
                              </p>
                            ) : (
                              pendingPresentations.slice(0, 5).map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-center justify-between rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2"
                                >
                                  <div>
                                    <p className="text-sm font-medium text-main">#{item.id} {item.metadata?.prompt ?? "Untitled prompt"}</p>
                                    <p className="text-xs text-muted">{item.firstName} - {formatDate(item.createdAt)}</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void handleFailPresentation(item.id);
                                    }}
                                    className="rounded-lg border border-rose-300 bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700"
                                  >
                                    Mark failed
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        </BentoCard>

                        <BentoCard
                          title="Quick Access"
                          description="Jump between admin routes"
                          className="surface-glass md:col-span-3"
                        >
                          <div className="grid gap-2 sm:grid-cols-2">
                            {navItems.filter((item) => item.key !== "overview").map((item) => (
                              <Link
                                key={item.href}
                                href={item.href}
                                className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-left text-sm font-medium text-main transition hover:border-[var(--accent)]"
                              >
                                {item.label}
                              </Link>
                            ))}
                          </div>
                        </BentoCard>
                      </BentoGrid>
                    ) : null}

                    {activeSection === "users" ? (
                      <section>
                        <article className="surface-glass rounded-3xl p-5">
                          <div className="flex flex-wrap items-end justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-semibold text-main">Users</h3>
                              <p className="text-sm text-muted">GET /admin/users with search + limit</p>
                            </div>

                            <div className="flex gap-2">
                              <input
                                value={userSearch}
                                onChange={(event) => {
                                  setUserSearch(event.target.value);
                                }}
                                placeholder="Search username, first name..."
                                className="w-48 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-main outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                              />
                              <input
                                type="number"
                                min={1}
                                max={200}
                                value={userLimit}
                                onChange={(event) => {
                                  setUserLimit(Number(event.target.value));
                                }}
                                className="w-24 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-main outline-none focus:border-[var(--accent)]"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  void fetchUsers();
                                }}
                                className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-medium text-main"
                              >
                                Reload
                              </button>
                            </div>
                          </div>

                          <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--surface-border)]">
                            <table className="min-w-full text-sm">
                              <thead className="bg-[var(--surface-2)] text-left text-[0.72rem] tracking-[0.12em] text-muted uppercase">
                                <tr>
                                  <th className="px-3 py-2">User</th>
                                  <th className="px-3 py-2">Telegram</th>
                                  <th className="px-3 py-2">Total</th>
                                  <th className="px-3 py-2">Last generation</th>
                                </tr>
                              </thead>
                              <tbody>
                                {users.slice(0, 10).map((user) => (
                                  <tr key={user.id} className="border-t border-[var(--surface-border)] bg-[var(--surface-1)]">
                                    <td className="px-3 py-2 text-main">
                                      <p className="font-medium">{user.firstName}</p>
                                      <p className="text-xs text-muted">@{user.username ?? "no_username"}</p>
                                    </td>
                                    <td className="px-3 py-2 text-main">{user.telegramId}</td>
                                    <td className="px-3 py-2 text-main">{user.totalGenerations}</td>
                                    <td className="px-3 py-2 text-main">{formatDate(user.lastGenerationAt)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            {users.length === 0 ? (
                              <p className="px-3 py-5 text-sm text-muted">No users found for this filter.</p>
                            ) : null}
                          </div>
                        </article>
                      </section>
                    ) : null}

                    {activeSection === "presentations" ? (
                      <section>
                        <article className="surface-glass rounded-3xl p-5">
                          <div className="flex flex-wrap items-end justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-semibold text-main">Presentations</h3>
                              <p className="text-sm text-muted">GET /admin/presentations + POST /admin/presentations/:id/fail</p>
                            </div>

                            <div className="flex gap-2">
                              <select
                                value={presentationStatus}
                                onChange={(event) => {
                                  setPresentationStatus(event.target.value as PresentationStatusFilter);
                                }}
                                className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-main outline-none focus:border-[var(--accent)]"
                              >
                                <option value="all">All</option>
                                <option value="pending">Pending</option>
                                <option value="completed">Completed</option>
                                <option value="failed">Failed</option>
                              </select>

                              <input
                                type="number"
                                min={1}
                                max={200}
                                value={presentationLimit}
                                onChange={(event) => {
                                  setPresentationLimit(Number(event.target.value));
                                }}
                                className="w-24 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-main outline-none focus:border-[var(--accent)]"
                              />

                              <button
                                type="button"
                                onClick={() => {
                                  void fetchPresentations();
                                }}
                                className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-medium text-main"
                              >
                                Reload
                              </button>
                            </div>
                          </div>

                          <div className="mt-4 space-y-2">
                            {presentations.slice(0, 8).map((item) => (
                              <div
                                key={item.id}
                                className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-2)] p-3"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm font-semibold text-main">#{item.id} {item.metadata?.prompt ?? "Untitled prompt"}</p>
                                  <span
                                    className={cn(
                                      "rounded-full border px-2 py-1 text-xs font-semibold",
                                      statusPillClass(item.status)
                                    )}
                                  >
                                    {item.status}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-muted">{item.firstName} ({item.username ?? "no_username"}) - {formatDate(item.createdAt)}</p>
                                <p className="mt-1 text-xs text-muted">Lang: {item.metadata?.language ?? "-"} / Slides: {item.metadata?.pageCount ?? "-"}</p>

                                {item.status === "pending" ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void handleFailPresentation(item.id);
                                    }}
                                    className="mt-3 rounded-lg border border-rose-300 bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700"
                                  >
                                    Force fail
                                  </button>
                                ) : null}
                              </div>
                            ))}

                            {presentations.length === 0 ? (
                              <p className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-4 text-sm text-muted">
                                No presentations found for selected filter.
                              </p>
                            ) : null}
                          </div>
                        </article>
                      </section>
                    ) : null}

                    {activeSection === "broadcast" ? (
                      <section>
                        <article className="surface-glass rounded-3xl p-5">
                          <h3 className="text-lg font-semibold text-main">Broadcast</h3>
                          <p className="text-sm text-muted">POST /admin/broadcast to all users with phone numbers</p>

                          <form className="mt-4 space-y-3" onSubmit={handleBroadcast}>
                            <textarea
                              value={broadcastMessage}
                              onChange={(event) => {
                                setBroadcastMessage(event.target.value);
                              }}
                              rows={4}
                              maxLength={4096}
                              placeholder="Hello everyone! New templates are now available."
                              className="w-full resize-y rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-main outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                              required
                            />

                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs text-muted">{broadcastMessage.length}/4096</p>
                              <button
                                type="submit"
                                className="rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-sm font-semibold text-main"
                              >
                                Send broadcast
                              </button>
                            </div>
                          </form>

                          {broadcastResult ? (
                            <div className="mt-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-2)] p-3 text-sm text-main">
                              Recipients: <span className="font-semibold">{broadcastResult.recipients}</span>, sent: <span className="font-semibold">{broadcastResult.sent}</span>, failed: <span className="font-semibold">{broadcastResult.failed}</span>
                            </div>
                          ) : null}
                        </article>
                      </section>
                    ) : null}

                    {activeSection === "admins" ? (
                      <section>
                        <article className="surface-glass rounded-3xl p-5">
                          <h3 className="text-lg font-semibold text-main">Admins</h3>
                          <p className="text-sm text-muted">GET /admin/admins, POST /admin/admins (SUPERADMIN only)</p>

                          {adminsError ? (
                            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                              {adminsError}
                            </div>
                          ) : (
                            <div className="mt-4 space-y-2">
                              {admins.map((admin) => (
                                <div
                                  key={admin.id}
                                  className="flex items-center justify-between rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2"
                                >
                                  <div>
                                    <p className="text-sm font-medium text-main">{admin.name}</p>
                                    <p className="text-xs text-muted">@{admin.username}</p>
                                  </div>
                                  <span className="rounded-full border border-[var(--surface-border)] bg-[var(--surface-3)] px-2 py-1 text-xs font-semibold text-main">
                                    {admin.role}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {profile?.role === "SUPERADMIN" ? (
                            <form className="mt-4 grid gap-2 sm:grid-cols-2" onSubmit={handleCreateAdmin}>
                              <input
                                value={adminName}
                                onChange={(event) => {
                                  setAdminName(event.target.value);
                                }}
                                placeholder="Name"
                                className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-main outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                                required
                              />

                              <input
                                value={adminUsername}
                                onChange={(event) => {
                                  setAdminUsername(event.target.value);
                                }}
                                placeholder="Username"
                                className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-main outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                                required
                              />

                              <input
                                value={adminPassword}
                                onChange={(event) => {
                                  setAdminPassword(event.target.value);
                                }}
                                placeholder="Password"
                                type="password"
                                className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-main outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                                required
                              />

                              <select
                                value={adminRole}
                                onChange={(event) => {
                                  setAdminRole(event.target.value as AdminRole);
                                }}
                                className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-main outline-none focus:border-[var(--accent)]"
                              >
                                <option value="ADMIN">ADMIN</option>
                                <option value="SUPERADMIN">SUPERADMIN</option>
                              </select>

                              <button
                                type="submit"
                                className="sm:col-span-2 rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-sm font-semibold text-main"
                              >
                                Create admin
                              </button>
                            </form>
                          ) : (
                            <p className="mt-4 text-sm text-muted">Create/update/delete admin actions require SUPERADMIN role.</p>
                          )}
                        </article>
                      </section>
                    ) : null}
                  </div>
                </>
              )}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
