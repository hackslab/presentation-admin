"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

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
    const message =
      typeof (payload as ApiError).message === "string"
        ? (payload as ApiError).message
        : `Request failed (${response.status})`;
    throw new Error(message);
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

export default function Home() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [presentations, setPresentations] = useState<PresentationRow[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [presentationFilter, setPresentationFilter] =
    useState<PresentationFilter>("all");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastResult, setBroadcastResult] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [failingPresentationId, setFailingPresentationId] = useState<
    number | null
  >(null);
  const [error, setError] = useState<string>("");

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

  const loadDashboard = useCallback(async () => {
    setError("");

    try {
      const [overviewData, usersData, presentationsData] = await Promise.all([
        fetchJson<Overview>("/api/admin/overview"),
        fetchJson<UserRow[]>(`/api/admin/users?${userQueryString}`),
        fetchJson<PresentationRow[]>(
          `/api/admin/presentations?${presentationQueryString}`,
        ),
      ]);

      setOverview(overviewData);
      setUsers(usersData);
      setPresentations(presentationsData);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Failed to load data.";
      setError(message);
    }
  }, [presentationQueryString, userQueryString]);

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
        `Done. Sent: ${result.sent}/${result.recipients}, failed: ${result.failed}.`,
      );
    } catch (broadcastError) {
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
      const message =
        failError instanceof Error ? failError.message : "Could not update status.";
      setError(message);
    } finally {
      setFailingPresentationId(null);
    }
  };

  return (
    <div className="min-h-screen px-4 py-6 sm:px-8 sm:py-10">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-2xl border border-[#d5e0dd] bg-[#fffef9]/85 p-6 shadow-[0_10px_30px_rgba(25,42,47,0.08)] backdrop-blur">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-mono uppercase tracking-[0.18em] text-[#0f766e]">
                Telegram Operations
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-[#1d2a2d] sm:text-4xl">
                Bot Admin Panel
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-[#5b6e71] sm:text-base">
                Monitor users, review generation jobs, and send announcements to
                registered bot users.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing || loading}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[#0f766e] px-5 text-sm font-semibold text-white transition hover:bg-[#0d655f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? "Refreshing..." : "Refresh data"}
            </button>
          </div>
        </header>

        {error ? (
          <div className="rounded-xl border border-[#f4c7c3] bg-[#fff1ef] px-4 py-3 text-sm text-[#9b1c12]">
            {error}
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "Total users",
              value: overview?.totalUsers ?? 0,
              hint: `${overview?.registeredUsers ?? 0} completed registration`,
            },
            {
              label: "Active (24h)",
              value: overview?.activeUsers24h ?? 0,
              hint: `${overview?.generated24h ?? 0} completed in 24h`,
            },
            {
              label: "Pending jobs",
              value: overview?.pendingJobs ?? 0,
              hint: "Can be force-failed below",
            },
            {
              label: "Lifetime jobs",
              value:
                (overview?.completedJobs ?? 0) + (overview?.failedJobs ?? 0),
              hint: `${overview?.completedJobs ?? 0} done / ${overview?.failedJobs ?? 0} failed`,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-[#d5e0dd] bg-[#ffffffcc] p-4 shadow-[0_8px_22px_rgba(28,45,50,0.05)]"
            >
              <p className="text-sm text-[#5b6e71]">{item.label}</p>
              <p className="mt-2 text-3xl font-semibold text-[#1d2a2d]">
                {item.value}
              </p>
              <p className="mt-1 text-xs text-[#6a7d80]">{item.hint}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <div className="rounded-2xl border border-[#d5e0dd] bg-[#fffefc] p-5 shadow-[0_10px_30px_rgba(25,42,47,0.07)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-[#1d2a2d]">Users</h2>
                  <p className="text-sm text-[#5b6e71]">
                    Search by Telegram ID, username, first name, or phone.
                  </p>
                </div>
                <form onSubmit={handleSearchSubmit} className="flex gap-2">
                  <input
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Search users"
                    className="h-10 w-44 rounded-lg border border-[#c8d6d2] bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] sm:w-60"
                  />
                  <button
                    type="submit"
                    className="h-10 rounded-lg bg-[#1d2a2d] px-4 text-sm font-semibold text-white transition hover:bg-[#162024]"
                  >
                    Apply
                  </button>
                </form>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-[#e1eae7] text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-[#6a7d80]">
                      <th className="px-2 py-3">User</th>
                      <th className="px-2 py-3">Phone</th>
                      <th className="px-2 py-3">Usage</th>
                      <th className="px-2 py-3">Last activity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf2f0]">
                    {users.length === 0 ? (
                      <tr>
                        <td className="px-2 py-4 text-[#667a7d]" colSpan={4}>
                          No users found.
                        </td>
                      </tr>
                    ) : (
                      users.map((user) => (
                        <tr key={user.id} className="align-top">
                          <td className="px-2 py-3">
                            <p className="font-semibold text-[#1d2a2d]">
                              {user.firstName ?? "Unknown"}
                            </p>
                            <p className="font-mono text-xs text-[#5b6e71]">
                              ID {user.telegramId}
                            </p>
                            <p className="text-xs text-[#5b6e71]">
                              {user.username ? `@${user.username}` : "No username"}
                            </p>
                          </td>
                          <td className="px-2 py-3 text-[#42565a]">
                            {user.phoneNumber ?? "Not registered"}
                          </td>
                          <td className="px-2 py-3">
                            <p className="text-[#1d2a2d]">
                              {user.usedToday} in 24h / {user.totalGenerations} total
                            </p>
                            <p className="text-xs text-[#5b6e71]">
                              Joined {formatDateTime(user.createdAt)}
                            </p>
                          </td>
                          <td className="px-2 py-3 text-[#42565a]">
                            {formatDateTime(user.lastGenerationAt)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <aside className="rounded-2xl border border-[#d5e0dd] bg-[#fffefc] p-5 shadow-[0_10px_30px_rgba(25,42,47,0.07)]">
            <h2 className="text-xl font-semibold text-[#1d2a2d]">Broadcast</h2>
            <p className="mt-1 text-sm text-[#5b6e71]">
              Sends a message to all users who completed registration.
            </p>

            <form onSubmit={handleBroadcastSubmit} className="mt-4 space-y-3">
              <textarea
                value={broadcastMessage}
                onChange={(event) => setBroadcastMessage(event.target.value)}
                placeholder="Write your message..."
                rows={7}
                className="w-full rounded-lg border border-[#c8d6d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#0f766e]"
              />
              <button
                type="submit"
                disabled={broadcasting}
                className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#0f766e] px-4 text-sm font-semibold text-white transition hover:bg-[#0d655f] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {broadcasting ? "Sending..." : "Send broadcast"}
              </button>
            </form>

            <p className="mt-3 min-h-5 text-sm text-[#42565a]">{broadcastResult}</p>
          </aside>
        </section>

        <section className="rounded-2xl border border-[#d5e0dd] bg-[#fffefc] p-5 shadow-[0_10px_30px_rgba(25,42,47,0.07)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[#1d2a2d]">
                Recent presentations
              </h2>
              <p className="text-sm text-[#5b6e71]">
                Review the latest jobs and force-fail stuck pending ones.
              </p>
            </div>

            <label className="text-sm text-[#5b6e71]">
              Status
              <select
                value={presentationFilter}
                onChange={(event) =>
                  setPresentationFilter(event.target.value as PresentationFilter)
                }
                className="ml-2 h-10 rounded-lg border border-[#c8d6d2] bg-white px-3 text-sm text-[#1d2a2d] outline-none focus:border-[#0f766e]"
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </label>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-[#e1eae7] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[#6a7d80]">
                  <th className="px-2 py-3">Job</th>
                  <th className="px-2 py-3">Status</th>
                  <th className="px-2 py-3">Prompt</th>
                  <th className="px-2 py-3">Options</th>
                  <th className="px-2 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2f0]">
                {presentations.length === 0 ? (
                  <tr>
                    <td className="px-2 py-4 text-[#667a7d]" colSpan={5}>
                      No presentations found.
                    </td>
                  </tr>
                ) : (
                  presentations.map((item) => (
                    <tr key={item.id} className="align-top">
                      <td className="px-2 py-3">
                        <p className="font-semibold text-[#1d2a2d]">#{item.id}</p>
                        <p className="text-xs text-[#5b6e71]">
                          {item.firstName ?? "Unknown"} ({item.telegramId})
                        </p>
                        <p className="text-xs text-[#5b6e71]">
                          {formatDateTime(item.createdAt)}
                        </p>
                      </td>
                      <td className="px-2 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                            item.status === "completed"
                              ? "bg-[#dff7ee] text-[#136947]"
                              : item.status === "pending"
                                ? "bg-[#fff1d7] text-[#7a4c00]"
                                : "bg-[#ffe8e5] text-[#a1261e]"
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="max-w-72 px-2 py-3 text-[#42565a]">
                        <p className="break-words">
                          {item.metadata?.prompt ?? "No prompt"}
                        </p>
                      </td>
                      <td className="px-2 py-3 text-xs text-[#42565a]">
                        <p>Lang: {item.metadata?.language ?? "-"}</p>
                        <p>Template: {item.metadata?.templateId ?? "-"}</p>
                        <p>Pages: {item.metadata?.pageCount ?? "-"}</p>
                        <p>
                          Images: {item.metadata?.useImages ? "Enabled" : "Off"}
                        </p>
                      </td>
                      <td className="px-2 py-3">
                        {item.status === "pending" ? (
                          <button
                            type="button"
                            onClick={() => handleFailPending(item.id)}
                            disabled={failingPresentationId === item.id}
                            className="inline-flex h-9 items-center justify-center rounded-lg bg-[#b42318] px-3 text-xs font-semibold text-white transition hover:bg-[#9a1d14] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {failingPresentationId === item.id
                              ? "Updating..."
                              : "Mark failed"}
                          </button>
                        ) : (
                          <span className="text-xs text-[#6a7d80]">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {loading ? (
          <p className="text-center text-sm text-[#5b6e71]">Loading dashboard...</p>
        ) : null}
      </main>
    </div>
  );
}
