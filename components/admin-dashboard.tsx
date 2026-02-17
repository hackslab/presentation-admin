"use client";

import {
  FormEvent,
  MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import ThemeToggle from "@/components/theme-toggle";

type Overview = {
  totalUsers: number;
  registeredUsers: number;
  activeUsers24h: number;
  generated24h: number;
  pendingJobs: number;
  completedJobs: number;
  failedJobs: number;
};

type UserRow = {
  id: number;
  telegramId: string;
  firstName: string | null;
  username: string | null;
  phoneNumber: string | null;
  createdAt: string;
  totalGenerations: number;
  usedToday: number;
  lastGenerationAt: string | null;
};

type PresentationMetadata = {
  prompt?: string;
  language?: "uz" | "ru" | "en";
  templateId?: number;
  pageCount?: number;
  useImages?: boolean;
  fileName?: string;
};

type PresentationRow = {
  id: number;
  status: "pending" | "completed" | "failed";
  createdAt: string;
  telegramId: string;
  firstName: string | null;
  username: string | null;
  metadata: PresentationMetadata | null;
};

type BroadcastResult = {
  recipients: number;
  sent: number;
  failed: number;
};

type ApiError = {
  message?: string;
};

type PresentationFilter = "all" | "pending" | "completed" | "failed";

type AdminRole = "ADMIN" | "SUPERADMIN";

type AdminRecord = {
  id: number;
  name: string;
  username: string;
  role: AdminRole;
  createdAt: string;
  updatedAt: string;
};

type CreateAdminInput = {
  name: string;
  username: string;
  password: string;
  role: AdminRole;
};

type UpdateAdminInput = {
  name?: string;
  username?: string;
  password?: string;
  role?: AdminRole;
};

class ApiRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "content-type": "application/json",
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as T | ApiError;
  if (!response.ok) {
    const payloadMessage = (payload as ApiError).message;
    const message =
      typeof payloadMessage === "string"
        ? payloadMessage
        : `Request failed (${response.status})`;
    throw new ApiRequestError(response.status, message);
  }

  return payload as T;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleString();
}

function formatShortDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function statusPillClass(status: PresentationRow["status"]) {
  if (status === "completed") {
    return "bg-[#d8f5e4] text-[#0d6840]";
  }

  if (status === "pending") {
    return "bg-[#fdf0d5] text-[#925e06]";
  }

  return "bg-[#fee2e2] text-[#9a2c2c]";
}

const PRESENTATION_FILTERS: PresentationFilter[] = [
  "all",
  "pending",
  "completed",
  "failed",
];

export default function AdminDashboard() {
  const router = useRouter();

  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [presentations, setPresentations] = useState<PresentationRow[]>([]);
  const [currentAdmin, setCurrentAdmin] = useState<AdminRecord | null>(null);
  const [managedAdmins, setManagedAdmins] = useState<AdminRecord[]>([]);
  const [adminAccessError, setAdminAccessError] = useState<string>("");
  const [adminActionMessage, setAdminActionMessage] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [presentationFilter, setPresentationFilter] =
    useState<PresentationFilter>("all");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastResult, setBroadcastResult] = useState("");
  const [newAdminForm, setNewAdminForm] = useState<CreateAdminInput>({
    name: "",
    username: "",
    password: "",
    role: "ADMIN",
  });
  const [editingAdminId, setEditingAdminId] = useState<number | null>(null);
  const [editingAdminForm, setEditingAdminForm] = useState<UpdateAdminInput>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [deletingAdminId, setDeletingAdminId] = useState<number | null>(null);
  const [failingPresentationId, setFailingPresentationId] = useState<
    number | null
  >(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState("");

  const userQueryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "60");

    if (searchQuery) {
      params.set("search", searchQuery);
    }

    return params.toString();
  }, [searchQuery]);

  const presentationQueryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "30");

    if (presentationFilter !== "all") {
      params.set("status", presentationFilter);
    }

    return params.toString();
  }, [presentationFilter]);

  const handleUnauthorized = useCallback(
    (errorValue: unknown) => {
      if (errorValue instanceof ApiRequestError && errorValue.status === 401) {
        router.replace("/login");
        return true;
      }

      return false;
    },
    [router],
  );

  const loadDashboard = useCallback(async () => {
    setError("");

    try {
      const [overviewData, usersData, presentationsData, meData] =
        await Promise.all([
          fetchJson<Overview>("/api/admin/overview"),
          fetchJson<UserRow[]>(`/api/admin/users?${userQueryString}`),
          fetchJson<PresentationRow[]>(
            `/api/admin/presentations?${presentationQueryString}`,
          ),
          fetchJson<AdminRecord>("/api/auth/me"),
        ]);

      setOverview(overviewData);
      setUsers(usersData);
      setPresentations(presentationsData);
      setCurrentAdmin(meData);

      if (meData.role === "SUPERADMIN") {
        try {
          const adminRows = await fetchJson<AdminRecord[]>("/api/admin/admins");
          setManagedAdmins(adminRows);
          setAdminAccessError("");
        } catch (adminListError) {
          if (handleUnauthorized(adminListError)) {
            return;
          }

          if (
            adminListError instanceof ApiRequestError &&
            adminListError.status === 403
          ) {
            setManagedAdmins([]);
            setAdminAccessError("SUPERADMIN role is required to manage admins.");
          } else {
            setAdminAccessError(
              adminListError instanceof Error
                ? adminListError.message
                : "Could not load admin list.",
            );
          }
        }
      } else {
        setManagedAdmins([]);
        setAdminAccessError("");
      }

      setLastUpdatedAt(new Date().toISOString());
    } catch (loadError) {
      if (handleUnauthorized(loadError)) {
        return;
      }

      const message =
        loadError instanceof Error ? loadError.message : "Failed to load data.";
      setError(message);
    }
  }, [handleUnauthorized, presentationQueryString, userQueryString]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      await loadDashboard();
      setLoading(false);
    };

    void run();
  }, [loadDashboard]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchQuery(searchInput.trim());
  };

  const handleSidebarNavClick = (
    event: MouseEvent<HTMLAnchorElement>,
    sectionId: string,
  ) => {
    event.preventDefault();

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (sectionId === "overview") {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
      window.history.replaceState(null, "", `#${sectionId}`);
      return;
    }

    const section = document.getElementById(sectionId);
    if (!section) {
      return;
    }

    section.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });

    window.history.replaceState(null, "", `#${sectionId}`);
  };

  const handleBroadcastSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = broadcastMessage.trim();

    if (!message) {
      setBroadcastResult("Write a message before sending broadcast.");
      return;
    }

    setBroadcastResult("");
    setBroadcasting(true);

    try {
      const result = await fetchJson<BroadcastResult>("/api/admin/broadcast", {
        method: "POST",
        body: JSON.stringify({ message }),
      });

      setBroadcastMessage("");
      setBroadcastResult(
        `Done. Sent ${result.sent}/${result.recipients}. Failed ${result.failed}.`,
      );
    } catch (broadcastError) {
      if (handleUnauthorized(broadcastError)) {
        return;
      }

      const message =
        broadcastError instanceof Error
          ? broadcastError.message
          : "Broadcast failed.";
      setBroadcastResult(message);
    } finally {
      setBroadcasting(false);
    }
  };

  const handleFailPending = async (id: number) => {
    setFailingPresentationId(id);

    try {
      await fetchJson<{ updated: boolean }>(`/api/admin/presentations/${id}/fail`, {
        method: "POST",
      });
      await loadDashboard();
    } catch (failError) {
      if (handleUnauthorized(failError)) {
        return;
      }

      const message =
        failError instanceof Error ? failError.message : "Could not update status.";
      setError(message);
    } finally {
      setFailingPresentationId(null);
    }
  };

  const handleCreateAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAdminActionMessage("");

    const payload: CreateAdminInput = {
      name: newAdminForm.name.trim(),
      username: newAdminForm.username.trim(),
      password: newAdminForm.password.trim(),
      role: newAdminForm.role,
    };

    if (!payload.name || !payload.username || !payload.password) {
      setAdminActionMessage("Name, username, and password are required.");
      return;
    }

    setSavingAdmin(true);

    try {
      await fetchJson<AdminRecord>("/api/admin/admins", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setNewAdminForm({
        name: "",
        username: "",
        password: "",
        role: "ADMIN",
      });
      setAdminActionMessage("Admin created.");
      await loadDashboard();
    } catch (createError) {
      if (handleUnauthorized(createError)) {
        return;
      }

      setAdminActionMessage(
        createError instanceof Error
          ? createError.message
          : "Could not create admin.",
      );
    } finally {
      setSavingAdmin(false);
    }
  };

  const beginEditAdmin = (admin: AdminRecord) => {
    setEditingAdminId(admin.id);
    setEditingAdminForm({
      name: admin.name,
      username: admin.username,
      role: admin.role,
    });
    setAdminActionMessage("");
  };

  const handleUpdateAdmin = async (adminId: number) => {
    if (!editingAdminId || editingAdminId !== adminId) {
      return;
    }

    setSavingAdmin(true);
    setAdminActionMessage("");

    const payload: UpdateAdminInput = {};

    if (editingAdminForm.name !== undefined) {
      payload.name = editingAdminForm.name.trim();
    }

    if (editingAdminForm.username !== undefined) {
      payload.username = editingAdminForm.username.trim();
    }

    if (editingAdminForm.password !== undefined) {
      const nextPassword = editingAdminForm.password.trim();
      if (nextPassword) {
        payload.password = nextPassword;
      }
    }

    if (editingAdminForm.role) {
      payload.role = editingAdminForm.role;
    }

    try {
      await fetchJson<AdminRecord>(`/api/admin/admins/${adminId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      setEditingAdminId(null);
      setEditingAdminForm({});
      setAdminActionMessage("Admin updated.");
      await loadDashboard();
    } catch (updateError) {
      if (handleUnauthorized(updateError)) {
        return;
      }

      setAdminActionMessage(
        updateError instanceof Error
          ? updateError.message
          : "Could not update admin.",
      );
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleDeleteAdmin = async (adminId: number) => {
    setDeletingAdminId(adminId);
    setAdminActionMessage("");

    try {
      await fetchJson<{ deleted: boolean }>(`/api/admin/admins/${adminId}`, {
        method: "DELETE",
      });

      setAdminActionMessage("Admin deleted.");
      if (editingAdminId === adminId) {
        setEditingAdminId(null);
        setEditingAdminForm({});
      }
      await loadDashboard();
    } catch (deleteError) {
      if (handleUnauthorized(deleteError)) {
        return;
      }

      setAdminActionMessage(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete admin.",
      );
    } finally {
      setDeletingAdminId(null);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  };

  const queueState = useMemo(() => {
    if (!overview) {
      return {
        label: "Checking queue",
        tone: "bg-[#e8edf3] text-[#3b4c5a]",
      };
    }

    if (overview.pendingJobs === 0) {
      return {
        label: "Queue healthy",
        tone: "bg-[#d8f5e4] text-[#0d6840]",
      };
    }

    if (overview.pendingJobs < 5) {
      return {
        label: "Minor queue delay",
        tone: "bg-[#fdf0d5] text-[#925e06]",
      };
    }

    return {
      label: "Queue congestion",
      tone: "bg-[#fee2e2] text-[#9a2c2c]",
    };
  }, [overview]);

  const completionRate = useMemo(() => {
    if (!overview) {
      return 0;
    }

    const totalResolved = overview.completedJobs + overview.failedJobs;
    if (totalResolved <= 0) {
      return 0;
    }

    return Math.round((overview.completedJobs / totalResolved) * 100);
  }, [overview]);

  const watchList = useMemo(() => {
    return presentations
      .filter((item) => item.status !== "completed")
      .slice(0, 5)
      .map((item) => ({
        id: item.id,
        status: item.status,
        user: item.firstName ?? item.username ?? item.telegramId,
        createdAt: item.createdAt,
        prompt: item.metadata?.prompt ?? "No prompt",
      }));
  }, [presentations]);

  const overviewCards = [
    {
      label: "Total users",
      value: overview?.totalUsers ?? 0,
      hint: `${overview?.registeredUsers ?? 0} completed registration`,
      accent: "from-[#0f172a] to-[#1e293b] text-white",
    },
    {
      label: "Active in 24h",
      value: overview?.activeUsers24h ?? 0,
      hint: `${overview?.generated24h ?? 0} presentations generated`,
      accent: "from-[#0c4a6e] to-[#0369a1] text-white",
    },
    {
      label: "Pending jobs",
      value: overview?.pendingJobs ?? 0,
      hint: "Manual fail action available",
      accent: "from-[#78350f] to-[#b45309] text-white",
    },
    {
      label: "Success rate",
      value: `${completionRate}%`,
      hint: `${overview?.completedJobs ?? 0} completed / ${overview?.failedJobs ?? 0} failed`,
      accent: "from-[#14532d] to-[#166534] text-white",
    },
  ];

  const panelClass =
    "rounded-2xl border border-[#d7e1e8] bg-[linear-gradient(160deg,rgba(255,255,255,0.95)_0%,rgba(247,251,254,0.95)_100%)] shadow-[0_16px_40px_rgba(26,44,63,0.1),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-[6px] animate-in fade-in slide-in-from-bottom-2 duration-500";

  const animatedPanelClass = "animate-in fade-in slide-in-from-bottom-2 duration-500";

  return (
    <div
      className="relative min-h-screen px-4 py-5 sm:px-6 lg:px-8 lg:py-8"
      style={{
        background:
          "radial-gradient(1200px 550px at -10% -15%, rgba(248, 252, 255, 1) 0%, transparent 62%), radial-gradient(1000px 520px at 105% 120%, rgba(189, 212, 233, 1) 0%, transparent 60%), linear-gradient(180deg, #e6edf4, #c7d5e4)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(90, 118, 145, 0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(90, 118, 145, 0.16) 1px, transparent 1px), radial-gradient(1200px 420px at 12% -8%, rgba(255, 255, 255, 0.56), transparent)",
          backgroundSize: "44px 44px, 44px 44px, auto",
          backgroundPosition: "center, center, center",
        }}
      />

      <div className="mx-auto w-full max-w-[1680px]">
        <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className={`${panelClass} h-fit p-4 sm:p-5 xl:sticky xl:top-6 xl:self-start`}>
            <div className="space-y-5">
              <div>
                <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-[#3f5e76]">
                  Telegram Ops
                </p>
                <h1 className="mt-3 text-2xl font-semibold text-[#10202f]">
                  Admin Console
                </h1>
                <p className="mt-2 text-sm text-[#5b7184]">
                  Monitor user behavior, queue pressure, and outbound broadcast
                  operations.
                </p>
              </div>

              <nav className="space-y-2 text-sm">
                {[
                  {
                    id: "overview",
                    label: "Overview",
                    meta: "System pulse",
                  },
                  {
                    id: "users",
                    label: "Users",
                    meta: `${users.length} listed`,
                  },
                  {
                    id: "broadcast",
                    label: "Broadcast",
                    meta: "Delivery control",
                  },
                  {
                    id: "jobs",
                    label: "Job queue",
                    meta: `${presentations.length} records`,
                  },
                  {
                    id: "admins",
                    label: "Admins",
                    meta:
                      currentAdmin?.role === "SUPERADMIN"
                        ? `${managedAdmins.length} operators`
                        : "Restricted",
                  },
                ].map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    onClick={(event) => handleSidebarNavClick(event, item.id)}
                    className="block rounded-xl border border-[#d7e1e8] bg-[#f9fbfd] px-3 py-2 transition hover:border-[#9fb6c9] hover:bg-white"
                  >
                    <p className="font-medium text-[#173248]">{item.label}</p>
                    <p className="text-xs text-[#6a8093]">{item.meta}</p>
                  </a>
                ))}
              </nav>

              <div className="rounded-xl border border-[#d7e1e8] bg-white p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6b8094]">
                    Queue health
                  </p>
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-semibold ${queueState.tone}`}
                  >
                    {queueState.label}
                  </span>
                </div>
                <p className="mt-3 text-sm text-[#4d6579]">
                  Last sync: {lastUpdatedAt ? formatDateTime(lastUpdatedAt) : "-"}
                </p>
              </div>

              <ThemeToggle className="w-full" />

              <Button
                type="button"
                color="secondary"
                onClick={handleLogout}
                className="h-10 w-full rounded-xl !border !border-[#d8e0e7] !bg-white !text-sm !font-semibold !text-[#1b3448] hover:!border-[#b8c8d6] hover:!bg-[#f7f9fb]"
              >
                Sign out
              </Button>
            </div>
          </aside>

          <main className="space-y-5">
            <section className={`${panelClass} p-5 sm:p-6`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-mono uppercase tracking-[0.2em] text-[#4f6a81]">
                    Operations center
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold text-[#112638] sm:text-4xl">
                    Real-time Bot Administration
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm text-[#5b7184] sm:text-base">
                    Keep bot operations stable with visibility into users,
                    presentations, and announcement delivery.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-xl border border-[#d8e0e7] bg-[#f4f8fc] px-3 py-2 text-sm text-[#28465e]">
                    Signed in as{" "}
                    <span className="font-semibold">
                      {currentAdmin?.username ?? "..."}
                    </span>
                    {currentAdmin?.role ? ` (${currentAdmin.role})` : ""}
                  </div>

                  <Button
                    type="button"
                    onClick={handleRefresh}
                    isDisabled={refreshing || loading}
                    className="h-10 rounded-xl !bg-[#123a57] !text-sm !font-semibold !text-white hover:!bg-[#1a4c70] disabled:!opacity-60"
                  >
                    {refreshing ? "Refreshing..." : "Refresh data"}
                  </Button>
                </div>
              </div>
            </section>

            {error ? (
              <div className="rounded-xl border border-[#f4c5c5] bg-[#fff2f2] px-4 py-3 text-sm text-[#9a2c2c]">
                {error}
              </div>
            ) : null}

            <section id="overview" className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
              {overviewCards.map((card, index) => (
                <article
                  key={card.label}
                  className={`${animatedPanelClass} rounded-2xl bg-gradient-to-br p-4 shadow-[0_14px_28px_rgba(10,20,40,0.2)] ${card.accent}`}
                  style={{ animationDelay: `${index * 70}ms` }}
                >
                  <p className="text-sm text-white/80">{card.label}</p>
                  <p className="mt-3 text-3xl font-semibold">{card.value}</p>
                  <p className="mt-2 text-xs text-white/80">{card.hint}</p>
                </article>
              ))}
            </section>

            <section className="grid gap-5 2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <section id="users" className={`${panelClass} p-5`}>
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-[#102637]">Users</h3>
                    <p className="text-sm text-[#5b7184]">
                      Search by Telegram ID, username, first name, or phone.
                    </p>
                  </div>

                  <form
                    onSubmit={handleSearchSubmit}
                    className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"
                  >
                    <Input
                      value={searchInput}
                      onChange={setSearchInput}
                      placeholder="Search users"
                      className="sm:w-60"
                      wrapperClassName="!h-10 !rounded-xl !bg-white !ring-1 !ring-[#d4dee6] focus-within:!ring-[#4f84ac]"
                      inputClassName="!px-3 !py-0 !text-sm !text-[#173248]"
                    />
                    <Button
                      type="submit"
                      className="h-10 rounded-xl !bg-[#173d59] !text-sm !font-semibold !text-white hover:!bg-[#204e72]"
                    >
                      Apply
                    </Button>
                  </form>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-[#e4ebf1] text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-[0.14em] text-[#6b8094]">
                        <th className="px-3 py-3">User</th>
                        <th className="px-3 py-3">Contact</th>
                        <th className="px-3 py-3">Usage</th>
                        <th className="px-3 py-3">Last activity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf2f6]">
                      {users.length === 0 ? (
                        <tr>
                          <td className="px-3 py-6 text-[#60788b]" colSpan={4}>
                            No users found.
                          </td>
                        </tr>
                      ) : (
                        users.map((user) => (
                          <tr key={user.id} className="align-top hover:bg-[#f8fbfd]">
                            <td className="px-3 py-3">
                              <p className="font-semibold text-[#122a3c]">
                                {user.firstName ?? "Unknown"}
                              </p>
                              <p className="font-mono text-xs text-[#5c7588]">
                                ID {user.telegramId}
                              </p>
                              <p className="text-xs text-[#5c7588]">
                                {user.username ? `@${user.username}` : "No username"}
                              </p>
                            </td>
                            <td className="px-3 py-3 text-[#395265]">
                              {user.phoneNumber ?? "Not registered"}
                            </td>
                            <td className="px-3 py-3 text-[#1e374a]">
                              <p>
                                {user.usedToday} today / {user.totalGenerations} total
                              </p>
                              <p className="text-xs text-[#5f788b]">
                                Joined {formatDateTime(user.createdAt)}
                              </p>
                            </td>
                            <td className="px-3 py-3 text-[#395265]">
                              {formatDateTime(user.lastGenerationAt)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="space-y-5">
                <section id="broadcast" className={`${panelClass} p-5`}>
                  <h3 className="text-xl font-semibold text-[#102637]">Broadcast</h3>
                  <p className="mt-1 text-sm text-[#5b7184]">
                    Send an announcement to users who completed registration.
                  </p>

                  <form onSubmit={handleBroadcastSubmit} className="mt-4 space-y-3">
                    <TextArea
                      value={broadcastMessage}
                      onChange={setBroadcastMessage}
                      placeholder="Write your message..."
                      rows={7}
                      textAreaClassName="!rounded-xl !bg-white !px-3 !py-2 !text-sm !text-[#173248] !ring-1 !ring-[#d4dee6] focus:!ring-[#4f84ac]"
                    />
                    <Button
                      type="submit"
                      isDisabled={broadcasting}
                      className="h-10 w-full rounded-xl !bg-[#0f6f5b] !text-sm !font-semibold !text-white hover:!bg-[#0f5e4d] disabled:!opacity-60"
                    >
                      {broadcasting ? "Sending..." : "Send broadcast"}
                    </Button>
                  </form>

                  <p
                    className={`mt-3 min-h-5 text-sm ${
                      broadcastResult.startsWith("Done")
                        ? "text-[#136949]"
                        : "text-[#7b4453]"
                    }`}
                  >
                    {broadcastResult}
                  </p>
                </section>

                <section className={`${panelClass} p-5`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-[#102637]">Watchlist</h3>
                    <span className="text-xs text-[#6b8094]">Last 5 issues</span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {watchList.length === 0 ? (
                      <p className="rounded-xl border border-[#dbe5ec] bg-[#f8fbfd] px-3 py-2 text-sm text-[#5f778a]">
                        No pending or failed jobs at the moment.
                      </p>
                    ) : (
                      watchList.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-xl border border-[#dbe5ec] bg-[#f8fbfd] px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-[#173248]">
                              #{item.id} - {item.user}
                            </p>
                            <span
                              className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusPillClass(item.status)}`}
                            >
                              {item.status}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-[#5f778a]">
                            {item.prompt}
                          </p>
                          <p className="mt-1 text-xs text-[#73889a]">
                            {formatDateTime(item.createdAt)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </section>

            <section id="jobs" className={`${panelClass} p-5`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-[#102637]">Presentation Jobs</h3>
                  <p className="text-sm text-[#5b7184]">
                    Filter status and manually fail jobs stuck in pending state.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {PRESENTATION_FILTERS.map((filterValue) => (
                    <Button
                      key={filterValue}
                      type="button"
                      color="secondary"
                      onClick={() => setPresentationFilter(filterValue)}
                      className={`h-9 rounded-full !px-4 !text-sm !font-semibold ${
                        presentationFilter === filterValue
                          ? "!bg-[#173d59] !text-white"
                          : "!bg-[#edf3f7] !text-[#375469] hover:!bg-[#dfeaf2]"
                      }`}
                    >
                      {filterValue === "all"
                        ? "All"
                        : filterValue.charAt(0).toUpperCase() + filterValue.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-[#e4ebf1] text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.14em] text-[#6b8094]">
                      <th className="px-3 py-3">Job</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Prompt</th>
                      <th className="px-3 py-3">Options</th>
                      <th className="px-3 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf2f6]">
                    {presentations.length === 0 ? (
                      <tr>
                        <td className="px-3 py-6 text-[#60788b]" colSpan={5}>
                          No presentations found.
                        </td>
                      </tr>
                    ) : (
                      presentations.map((item) => (
                        <tr key={item.id} className="align-top hover:bg-[#f8fbfd]">
                          <td className="px-3 py-3">
                            <p className="font-semibold text-[#122a3c]">#{item.id}</p>
                            <p className="text-xs text-[#5c7588]">
                              {item.firstName ?? "Unknown"} ({item.telegramId})
                            </p>
                            <p className="text-xs text-[#5c7588]">
                              {formatShortDate(item.createdAt)}
                            </p>
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusPillClass(item.status)}`}
                            >
                              {item.status}
                            </span>
                          </td>
                          <td className="max-w-80 px-3 py-3 text-[#395265]">
                            <p className="line-clamp-3 break-words">
                              {item.metadata?.prompt ?? "No prompt"}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-xs text-[#395265]">
                            <p>Lang: {item.metadata?.language ?? "-"}</p>
                            <p>Template: {item.metadata?.templateId ?? "-"}</p>
                            <p>Pages: {item.metadata?.pageCount ?? "-"}</p>
                            <p>Images: {item.metadata?.useImages ? "Enabled" : "Off"}</p>
                          </td>
                          <td className="px-3 py-3">
                            {item.status === "pending" ? (
                              <Button
                                type="button"
                                onClick={() => handleFailPending(item.id)}
                                isDisabled={failingPresentationId === item.id}
                                className="h-9 rounded-lg !bg-[#a82a2a] !px-3 !text-xs !font-semibold !text-white hover:!bg-[#902626] disabled:!opacity-60"
                              >
                                {failingPresentationId === item.id
                                  ? "Updating..."
                                  : "Mark failed"}
                              </Button>
                            ) : (
                              <span className="text-xs text-[#718799]">-</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="admins" className={`${panelClass} p-5`}>
              <div className="flex flex-col gap-2">
                <h3 className="text-xl font-semibold text-[#102637]">Admin Management</h3>
                <p className="text-sm text-[#5b7184]">
                  Manage operator accounts and roles through backend admin endpoints.
                </p>
              </div>

              {currentAdmin?.role !== "SUPERADMIN" ? (
                <p className="mt-4 rounded-xl border border-[#dbe5ec] bg-[#f8fbfd] px-3 py-2 text-sm text-[#5f778a]">
                  Your role is <span className="font-semibold">{currentAdmin?.role ?? "ADMIN"}</span>.
                  Only SUPERADMIN accounts can manage admins.
                </p>
              ) : (
                <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
                  <form
                    onSubmit={handleCreateAdmin}
                    className="space-y-3 rounded-xl border border-[#dbe5ec] bg-[#f8fbfd] p-4"
                  >
                    <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#516a7d]">
                      Create admin
                    </h4>

                    <Input
                      value={newAdminForm.name}
                      onChange={(value) =>
                        setNewAdminForm((previous) => ({
                          ...previous,
                          name: value,
                        }))
                      }
                      placeholder="Full name"
                      wrapperClassName="!h-10 !rounded-lg !bg-white !ring-1 !ring-[#d4dee6] focus-within:!ring-[#4f84ac]"
                      inputClassName="!px-3 !py-0 !text-sm !text-[#173248]"
                    />

                    <Input
                      value={newAdminForm.username}
                      onChange={(value) =>
                        setNewAdminForm((previous) => ({
                          ...previous,
                          username: value,
                        }))
                      }
                      placeholder="Username"
                      wrapperClassName="!h-10 !rounded-lg !bg-white !ring-1 !ring-[#d4dee6] focus-within:!ring-[#4f84ac]"
                      inputClassName="!px-3 !py-0 !text-sm !text-[#173248]"
                    />

                    <Input
                      type="password"
                      value={newAdminForm.password}
                      onChange={(value) =>
                        setNewAdminForm((previous) => ({
                          ...previous,
                          password: value,
                        }))
                      }
                      placeholder="Password"
                      wrapperClassName="!h-10 !rounded-lg !bg-white !ring-1 !ring-[#d4dee6] focus-within:!ring-[#4f84ac]"
                      inputClassName="!px-3 !py-0 !text-sm !text-[#173248]"
                    />

                    <NativeSelect
                      value={newAdminForm.role}
                      onChange={(event) =>
                        setNewAdminForm((previous) => ({
                          ...previous,
                          role: event.target.value as AdminRole,
                        }))
                      }
                      options={[
                        { label: "ADMIN", value: "ADMIN" },
                        { label: "SUPERADMIN", value: "SUPERADMIN" },
                      ]}
                      selectClassName="!h-10 !w-full !rounded-lg !bg-white !px-3 !text-sm !text-[#173248] !ring-1 !ring-[#d4dee6] focus-visible:!ring-[#4f84ac]"
                    />

                    <Button
                      type="submit"
                      isDisabled={savingAdmin}
                      className="h-10 w-full rounded-lg !bg-[#173d59] !text-sm !font-semibold !text-white hover:!bg-[#204e72] disabled:!opacity-60"
                    >
                      {savingAdmin ? "Saving..." : "Create admin"}
                    </Button>

                    {adminActionMessage ? (
                      <p className="text-sm text-[#5f778a]">{adminActionMessage}</p>
                    ) : null}

                    {adminAccessError ? (
                      <p className="text-sm text-[#9a2c2c]">{adminAccessError}</p>
                    ) : null}
                  </form>

                  <div className="overflow-x-auto rounded-xl border border-[#dbe5ec] bg-white">
                    <table className="min-w-full divide-y divide-[#edf2f6] text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-[0.12em] text-[#6b8094]">
                          <th className="px-3 py-3">Name</th>
                          <th className="px-3 py-3">Username</th>
                          <th className="px-3 py-3">Role</th>
                          <th className="px-3 py-3">Updated</th>
                          <th className="px-3 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#edf2f6]">
                        {managedAdmins.length === 0 ? (
                          <tr>
                            <td className="px-3 py-6 text-[#60788b]" colSpan={5}>
                              No admins found.
                            </td>
                          </tr>
                        ) : (
                          managedAdmins.map((admin) => {
                            const isEditing = editingAdminId === admin.id;

                            return (
                              <tr key={admin.id} className="align-top hover:bg-[#f8fbfd]">
                                <td className="px-3 py-3">
                                  {isEditing ? (
                                    <input
                                      value={editingAdminForm.name ?? ""}
                                      onChange={(event) =>
                                        setEditingAdminForm((previous) => ({
                                          ...previous,
                                          name: event.target.value,
                                        }))
                                      }
                                      className="h-9 w-full rounded-lg border border-[#d4dee6] bg-white px-2 text-sm text-[#173248] outline-none transition focus:border-[#4f84ac]"
                                    />
                                  ) : (
                                    <span className="font-medium text-[#122a3c]">{admin.name}</span>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  {isEditing ? (
                                    <input
                                      value={editingAdminForm.username ?? ""}
                                      onChange={(event) =>
                                        setEditingAdminForm((previous) => ({
                                          ...previous,
                                          username: event.target.value,
                                        }))
                                      }
                                      className="h-9 w-full rounded-lg border border-[#d4dee6] bg-white px-2 text-sm text-[#173248] outline-none transition focus:border-[#4f84ac]"
                                    />
                                  ) : (
                                    <span className="text-[#395265]">{admin.username}</span>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  {isEditing ? (
                                    <select
                                      value={editingAdminForm.role ?? admin.role}
                                      onChange={(event) =>
                                        setEditingAdminForm((previous) => ({
                                          ...previous,
                                          role: event.target.value as AdminRole,
                                        }))
                                      }
                                      className="h-9 rounded-lg border border-[#d4dee6] bg-white px-2 text-sm text-[#173248] outline-none transition focus:border-[#4f84ac]"
                                    >
                                      <option value="ADMIN">ADMIN</option>
                                      <option value="SUPERADMIN">SUPERADMIN</option>
                                    </select>
                                  ) : (
                                    <span className="rounded-full bg-[#edf3f7] px-2 py-1 text-xs font-semibold text-[#375469]">
                                      {admin.role}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-[#5f778a]">
                                  {formatDateTime(admin.updatedAt)}
                                  {isEditing ? (
                                    <input
                                      type="password"
                                      value={editingAdminForm.password ?? ""}
                                      onChange={(event) =>
                                        setEditingAdminForm((previous) => ({
                                          ...previous,
                                          password: event.target.value,
                                        }))
                                      }
                                      placeholder="New password (optional)"
                                      className="mt-2 h-9 w-full rounded-lg border border-[#d4dee6] bg-white px-2 text-sm text-[#173248] outline-none transition focus:border-[#4f84ac]"
                                    />
                                  ) : null}
                                </td>
                                <td className="px-3 py-3">
                                  <div className="flex flex-wrap gap-2">
                                    {isEditing ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleUpdateAdmin(admin.id)}
                                          disabled={savingAdmin}
                                          className="h-8 rounded-lg bg-[#173d59] px-3 text-xs font-semibold text-white transition hover:bg-[#204e72] disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                          Save
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingAdminId(null);
                                            setEditingAdminForm({});
                                          }}
                                          className="h-8 rounded-lg border border-[#d4dee6] bg-white px-3 text-xs font-semibold text-[#26465d] transition hover:bg-[#f5f8fb]"
                                        >
                                          Cancel
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => beginEditAdmin(admin)}
                                        className="h-8 rounded-lg border border-[#d4dee6] bg-white px-3 text-xs font-semibold text-[#26465d] transition hover:bg-[#f5f8fb]"
                                      >
                                        Edit
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => handleDeleteAdmin(admin.id)}
                                      disabled={
                                        deletingAdminId === admin.id ||
                                        currentAdmin?.id === admin.id
                                      }
                                      className="h-8 rounded-lg bg-[#a82a2a] px-3 text-xs font-semibold text-white transition hover:bg-[#902626] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {deletingAdminId === admin.id
                                        ? "Deleting..."
                                        : "Delete"}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            {loading ? (
              <p className="text-center text-sm text-[#5f778a]">Loading dashboard...</p>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
