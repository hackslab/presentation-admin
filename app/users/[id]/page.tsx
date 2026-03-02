"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";

type ThemeMode = "light" | "dark";
type AdminRole = "ADMIN" | "SUPERADMIN";
type PresentationStatus = "pending" | "completed" | "failed";
type SortOrder = "asc" | "desc";
type PresentationLanguageFilter = "all" | "uz" | "ru" | "en";

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

interface ApiError {
  message?: string | string[];
  error?: string;
}

interface ConnectionPageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

interface ConnectionResponse<TNode> {
  totalCount: number;
  nodes: TNode[];
  pageInfo: ConnectionPageInfo;
}

interface PresentationMetadata {
  prompt?: string;
  language?: string;
  pageCount?: number;
  useImages?: boolean;
  fileName?: string;
  fileSizeKb?: number;
  storageProvider?: string;
  storageBucket?: string;
  storageKey?: string;
  downloadUrl?: string;
  failReason?: string;
}

interface PresentationRow {
  id: number;
  status: PresentationStatus;
  createdAt: string;
  telegramId: string;
  firstName: string | null;
  username: string | null;
  metadata: PresentationMetadata | null;
}

interface UserDetails {
  id: number;
  telegramId: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  phoneNumber: string | null;
  profileImageUrl: string | null;
  profileImageUpdatedAt: string | null;
  profileImageCheckedAt: string | null;
  isActive: boolean;
  isBroadcastActive: boolean;
  broadcastBlockedAt: string | null;
  broadcastBlockedReason: string | null;
  createdAt: string;
  totalGeneratedCount?: number;
  totalGenerations: number;
  usedToday: number;
  lastGenerationAt: string | null;
}

interface UserDetailsResponse {
  user: UserDetails;
  presentations: ConnectionResponse<PresentationRow>;
}

interface UserProfileImageSyncResult {
  status: string;
  profileUpdated: boolean;
  reason?: string;
}

interface TelegramProfilePhotoItem {
  fileUniqueId: string;
  width: number;
  height: number;
  mimeType: string;
  dataUrl: string;
}

interface TelegramProfilePhotosResponse {
  telegramId: string;
  totalCount: number;
  photos: TelegramProfilePhotoItem[];
}

const API_PROXY_PREFIX = "/backend";
const THEME_STORAGE_KEY = "admin-panel-theme";
const SESSION_STORAGE_KEY = "admin-panel-session";
const EMPTY_CONNECTION_PAGE_INFO: ConnectionPageInfo = {
  hasNextPage: false,
  hasPreviousPage: false,
  startCursor: null,
  endCursor: null,
};

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

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsedDate);
}

function getUserTotalGeneratedCount(user: UserDetails): number {
  const rawValue =
    typeof user.totalGeneratedCount === "number" &&
    Number.isFinite(user.totalGeneratedCount)
      ? user.totalGeneratedCount
      : user.totalGenerations;

  if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
    return 0;
  }

  return Math.max(0, rawValue);
}

function formatBoolean(value: boolean): string {
  return value ? "Yes" : "No";
}

function formatFileSizeMb(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }

  return `${(value / 1024).toFixed(2)} MB`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Request failed.";
}

function formatSyncStatus(status: string): string {
  return status.replace(/-/g, " ");
}

function resolveParamId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export default function UserDetailsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const rawId = resolveParamId(params.id);
  const userId = useMemo(() => {
    const parsed = Number(rawId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return null;
    }

    return parsed;
  }, [rawId]);

  const [theme, setTheme] = useState<ThemeMode>("light");
  const [isHydrated, setIsHydrated] = useState(false);
  const [session, setSession] = useState<AuthResponse | null>(null);
  const [user, setUser] = useState<UserDetails | null>(null);
  const [presentations, setPresentations] = useState<PresentationRow[]>([]);
  const [presentationsTotalCount, setPresentationsTotalCount] = useState(0);
  const [presentationsPage, setPresentationsPage] = useState(1);
  const [presentationsAfterHistory, setPresentationsAfterHistory] = useState<
    Array<string | null>
  >([null]);
  const [presentationsPageInfo, setPresentationsPageInfo] =
    useState<ConnectionPageInfo>(EMPTY_CONNECTION_PAGE_INFO);

  const [presentationStatus, setPresentationStatus] = useState<
    PresentationStatus | "all"
  >("all");
  const [presentationLanguage, setPresentationLanguage] =
    useState<PresentationLanguageFilter>("all");
  const [presentationSortOrder, setPresentationSortOrder] =
    useState<SortOrder>("desc");
  const [presentationLimit, setPresentationLimit] = useState(20);

  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingProfileImage, setIsSyncingProfileImage] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isProfileModalLoading, setIsProfileModalLoading] = useState(false);
  const [profileModalError, setProfileModalError] = useState<string | null>(
    null,
  );
  const [telegramProfilePhotos, setTelegramProfilePhotos] = useState<
    TelegramProfilePhotoItem[]
  >([]);
  const [telegramProfilePhotoTotalCount, setTelegramProfilePhotoTotalCount] =
    useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestVersionRef = useRef(0);

  const apiRequest = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      if (!session?.accessToken) {
        throw new Error("Sign in first to access protected resources.");
      }

      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${session.accessToken}`);

      if (init?.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      const response = await fetch(`${API_PROXY_PREFIX}${path}`, {
        ...init,
        headers,
        cache: "no-store",
      });

      if (!response.ok) {
        const errorPayload = await parseResponseBody<unknown>(response).catch(
          () => null,
        );
        const message = parseApiError(
          errorPayload,
          `GET ${path} failed with ${response.status}`,
        );

        throw new Error(message);
      }

      return parseResponseBody<T>(response);
    },
    [session?.accessToken],
  );

  const fetchUserDetails = useCallback(
    async ({
      after = null,
      page = 1,
    }: {
      after?: string | null;
      page?: number;
    } = {}) => {
      if (!userId) {
        return;
      }

      setIsLoading(true);
      const requestVersion = ++requestVersionRef.current;

      try {
        const query = new URLSearchParams();

        if (presentationStatus !== "all") {
          query.set("status", presentationStatus);
        }

        if (presentationLanguage !== "all") {
          query.set("language", presentationLanguage);
        }

        query.set("sortOrder", presentationSortOrder);
        query.set("first", `${Math.max(1, Math.min(200, presentationLimit))}`);

        if (after) {
          query.set("after", after);
        }

        const payload = await apiRequest<UserDetailsResponse>(
          `/admin/users/${userId}?${query.toString()}`,
        );

        if (requestVersion !== requestVersionRef.current) {
          return;
        }

        setUser(payload.user);
        setPresentations(payload.presentations.nodes);
        setPresentationsTotalCount(payload.presentations.totalCount);
        setPresentationsPageInfo(
          payload.presentations.pageInfo ?? EMPTY_CONNECTION_PAGE_INFO,
        );
        setPresentationsPage(Math.max(1, page));
        setErrorMessage(null);
      } catch (error) {
        if (requestVersion !== requestVersionRef.current) {
          return;
        }

        const message = toErrorMessage(error);
        setErrorMessage(message);
        setUser(null);
        setPresentations([]);
        setPresentationsTotalCount(0);
        setPresentationsPageInfo(EMPTY_CONNECTION_PAGE_INFO);
      } finally {
        if (requestVersion === requestVersionRef.current) {
          setIsLoading(false);
        }
      }
    },
    [
      apiRequest,
      presentationLanguage,
      presentationLimit,
      presentationSortOrder,
      presentationStatus,
      userId,
    ],
  );

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
        setSession(parsedSession);
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
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [isHydrated, theme]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (session?.accessToken) {
      return;
    }

    const nextPath = pathname?.startsWith("/") ? pathname : `/users/${rawId}`;
    router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
  }, [isHydrated, pathname, rawId, router, session?.accessToken]);

  useEffect(() => {
    if (!isHydrated || !session?.accessToken || !userId) {
      return;
    }

    setPresentationsPage(1);
    setPresentationsAfterHistory([null]);
    setPresentationsPageInfo(EMPTY_CONNECTION_PAGE_INFO);
    void fetchUserDetails({ after: null, page: 1 });
  }, [fetchUserDetails, isHydrated, session?.accessToken, userId]);

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

  const handleNextPage = async () => {
    if (
      !presentationsPageInfo.hasNextPage ||
      !presentationsPageInfo.endCursor
    ) {
      return;
    }

    const nextPage = presentationsPage + 1;
    const nextAfter = presentationsPageInfo.endCursor;

    setPresentationsAfterHistory((previous) => {
      const trimmed = previous.slice(0, presentationsPage);
      return [...trimmed, nextAfter];
    });

    await fetchUserDetails({ page: nextPage, after: nextAfter });
  };

  const handlePreviousPage = async () => {
    if (presentationsPage <= 1) {
      return;
    }

    const previousPage = presentationsPage - 1;
    const previousAfter = presentationsAfterHistory[previousPage - 1] ?? null;

    setPresentationsAfterHistory((previous) => previous.slice(0, previousPage));

    await fetchUserDetails({ page: previousPage, after: previousAfter });
  };

  const handleReload = async () => {
    try {
      const after = presentationsAfterHistory[presentationsPage - 1] ?? null;
      await fetchUserDetails({ page: presentationsPage, after });
    } catch (error) {
      toast.error(toErrorMessage(error));
    }
  };

  const handleSyncProfileImage = async () => {
    if (!userId) {
      return;
    }

    setIsSyncingProfileImage(true);

    try {
      const result = await apiRequest<UserProfileImageSyncResult>(
        `/admin/users/${userId}/profile-images/sync`,
        {
          method: "POST",
        },
      );

      const reasonSuffix = result.reason ? ` (${result.reason})` : "";

      if (result.status === "failed") {
        toast.error(`Profile sync failed${reasonSuffix}`);
      } else {
        toast.success(
          `Profile sync ${formatSyncStatus(result.status)}${reasonSuffix}`,
        );
      }

      const after = presentationsAfterHistory[presentationsPage - 1] ?? null;
      await fetchUserDetails({ page: presentationsPage, after });
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setIsSyncingProfileImage(false);
    }
  };

  const handleOpenProfileModal = async () => {
    if (!userId) {
      return;
    }

    setIsProfileModalOpen(true);
    setIsProfileModalLoading(true);
    setProfileModalError(null);

    try {
      const result = await apiRequest<TelegramProfilePhotosResponse>(
        `/admin/users/${userId}/profile-images/telegram`,
      );

      setTelegramProfilePhotos(result.photos ?? []);
      setTelegramProfilePhotoTotalCount(
        Number(result.totalCount ?? result.photos?.length ?? 0),
      );
    } catch (error) {
      const message = toErrorMessage(error);
      setProfileModalError(message);
      setTelegramProfilePhotos([]);
      setTelegramProfilePhotoTotalCount(0);
      toast.error(message);
    } finally {
      setIsProfileModalLoading(false);
    }
  };

  const statusPillClass = (status: PresentationStatus) => {
    if (status === "pending") {
      return "border-amber-300 bg-amber-100 text-amber-700";
    }

    if (status === "failed") {
      return "border-rose-300 bg-rose-100 text-rose-700";
    }

    return "border-emerald-300 bg-emerald-100 text-emerald-700";
  };

  return (
    <div className="dashboard-shell min-h-screen" data-theme={theme}>
      <div
        className="relative min-h-screen px-4 py-6 sm:px-6"
        style={{
          background:
            "radial-gradient(circle at 12% 8%, var(--glow-a), transparent 38%), radial-gradient(circle at 82% 6%, var(--glow-b), transparent 40%), var(--app-bg)",
        }}
      >
        <div className="pointer-events-none absolute inset-0 terminal-grid opacity-55" />

        <div className="relative mx-auto max-w-6xl space-y-4">
          <header className="surface-glass rounded-3xl p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Link
                  href="/users"
                  className="inline-flex items-center gap-2 text-sm text-muted hover:text-main"
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Back to users
                </Link>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-main">
                  User #{rawId || "-"}
                </h1>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleSyncProfileImage();
                  }}
                  disabled={!userId || isSyncingProfileImage}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-main disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSyncingProfileImage ? (
                    <Loader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <RefreshCw className="size-4" aria-hidden="true" />
                  )}
                  Sync profile
                </button>

                <AnimatedThemeToggler
                  storageKey={THEME_STORAGE_KEY}
                  onThemeChange={setTheme}
                  aria-label="Toggle theme"
                  className="inline-flex size-9 items-center justify-center rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] text-main transition hover:border-[var(--accent)]"
                />
              </div>
            </div>
          </header>

          {!userId ? (
            <article className="surface-glass rounded-3xl p-5 text-sm text-rose-600">
              Invalid user id in URL.
            </article>
          ) : null}

          {errorMessage && userId ? (
            <article className="surface-glass rounded-3xl p-5 text-sm text-rose-600">
              {errorMessage}
            </article>
          ) : null}

          {isLoading && !user && !errorMessage && userId ? (
            <article className="surface-glass rounded-3xl p-5 text-sm text-main">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Loading user details...
              </span>
            </article>
          ) : null}

          {user ? (
            <article className="surface-glass rounded-3xl p-5 sm:p-6">
              <div className="flex flex-wrap items-start gap-4">
                <button
                  type="button"
                  onClick={() => {
                    void handleOpenProfileModal();
                  }}
                  className="group inline-flex flex-col items-center gap-1"
                >
                  {user.profileImageUrl ? (
                    <img
                      src={user.profileImageUrl}
                      alt={fullName || "User profile"}
                      className="h-16 w-16 rounded-2xl border border-[var(--surface-border)] object-cover"
                    />
                  ) : (
                    <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-2)] text-xl font-semibold text-muted">
                      {(
                        user.firstName?.[0] ??
                        user.lastName?.[0] ??
                        "?"
                      ).toUpperCase()}
                    </div>
                  )}
                  <span className="text-[0.68rem] text-muted underline decoration-transparent group-hover:decoration-current">
                    View photos
                  </span>
                </button>

                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-xl font-semibold text-main">
                    {fullName || "Unknown user"}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted">
                    <span>Telegram ID: {user.telegramId}</span>
                    {user.username ? (
                      <a
                        href={`https://t.me/${user.username}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 underline decoration-transparent hover:decoration-current"
                      >
                        @{user.username}
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </a>
                    ) : (
                      <span>@no_username</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-2 text-sm text-main sm:grid-cols-2 lg:grid-cols-3">
                <p>Phone: {user.phoneNumber || "-"}</p>
                <p>Joined: {formatDate(user.createdAt)}</p>
                <p>Total generations: {getUserTotalGeneratedCount(user)}</p>
                <p>Used in last 24h: {user.usedToday}</p>
                <p>Last generation: {formatDate(user.lastGenerationAt)}</p>
                <p>Active: {formatBoolean(user.isActive)}</p>
                <p>Broadcast active: {formatBoolean(user.isBroadcastActive)}</p>
                <p>
                  Broadcast blocked at: {formatDate(user.broadcastBlockedAt)}
                </p>
                <p>
                  Broadcast blocked reason: {user.broadcastBlockedReason || "-"}
                </p>
                <p>
                  Profile checked at: {formatDate(user.profileImageCheckedAt)}
                </p>
                <p>
                  Profile updated at: {formatDate(user.profileImageUpdatedAt)}
                </p>
              </div>
            </article>
          ) : null}

          <article className="surface-glass rounded-3xl p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-main">
                  Generated presentations
                </h3>
                <p className="text-sm text-muted">
                  Full list of presentations generated by this user.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <select
                  value={presentationStatus}
                  onChange={(event) => {
                    setPresentationStatus(
                      event.target.value as PresentationStatus | "all",
                    );
                  }}
                  className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-main outline-none focus:border-[var(--accent)]"
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                </select>

                <select
                  value={presentationLanguage}
                  onChange={(event) => {
                    setPresentationLanguage(
                      event.target.value as PresentationLanguageFilter,
                    );
                  }}
                  className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-main outline-none focus:border-[var(--accent)]"
                >
                  <option value="all">All languages</option>
                  <option value="uz">Uzbek</option>
                  <option value="ru">Russian</option>
                  <option value="en">English</option>
                </select>

                <select
                  value={presentationSortOrder}
                  onChange={(event) => {
                    setPresentationSortOrder(event.target.value as SortOrder);
                  }}
                  className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-main outline-none focus:border-[var(--accent)]"
                >
                  <option value="desc">Newest first</option>
                  <option value="asc">Oldest first</option>
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
                    void handleReload();
                  }}
                  disabled={isLoading || !userId}
                  className="inline-flex size-9 items-center justify-center rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] text-main disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? (
                    <Loader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <RefreshCw className="size-4" aria-hidden="true" />
                  )}
                  <span className="sr-only">Reload presentations</span>
                </button>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--surface-border)]">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-[var(--surface-2)] text-left text-[0.72rem] tracking-[0.12em] text-muted uppercase">
                    <tr>
                      <th className="px-3 py-2">ID</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Prompt</th>
                      <th className="px-3 py-2">Lang</th>
                      <th className="px-3 py-2">Slides</th>
                      <th className="px-3 py-2">File</th>
                      <th className="px-3 py-2">Created</th>
                      <th className="px-3 py-2">Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {presentations.map((presentation) => {
                      const metadata = presentation.metadata;
                      const failReason =
                        metadata?.failReason?.trim() || "Reason not available.";

                      return (
                        <tr
                          key={presentation.id}
                          className="border-t border-[var(--surface-border)] bg-[var(--surface-1)]"
                        >
                          <td className="px-3 py-2 font-mono text-main">
                            #{presentation.id}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold uppercase ${statusPillClass(presentation.status)}`}
                            >
                              {presentation.status}
                            </span>
                            {presentation.status === "failed" ? (
                              <p
                                className="mt-1 max-w-[260px] whitespace-normal break-words text-xs text-rose-700"
                                style={{
                                  display: "-webkit-box",
                                  WebkitBoxOrient: "vertical",
                                  WebkitLineClamp: 2,
                                  overflow: "hidden",
                                }}
                              >
                                {failReason}
                              </p>
                            ) : null}
                          </td>
                          <td className="max-w-[260px] px-3 py-2 text-main">
                            <p
                              className="truncate"
                              title={metadata?.prompt || "-"}
                            >
                              {metadata?.prompt || "-"}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-main">
                            {metadata?.language?.toUpperCase() || "-"}
                          </td>
                          <td className="px-3 py-2 text-main">
                            {metadata?.pageCount ?? "-"}
                          </td>
                          <td className="px-3 py-2 text-main">
                            <p>{metadata?.fileName || "-"}</p>
                            <p className="text-xs text-muted">
                              {formatFileSizeMb(metadata?.fileSizeKb)}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-main">
                            {formatDate(presentation.createdAt)}
                          </td>
                          <td className="px-3 py-2">
                            {metadata?.downloadUrl ? (
                              <a
                                href={metadata.downloadUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-2)] px-2 py-1 text-xs text-main"
                              >
                                <Download
                                  className="size-3.5"
                                  aria-hidden="true"
                                />
                                Open
                              </a>
                            ) : (
                              <span className="text-xs text-muted">N/A</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {!isLoading && presentations.length === 0 ? (
                <p className="px-3 py-5 text-sm text-muted">
                  No presentations found.
                </p>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-muted">
                <p>
                  Page {presentationsPage} - {presentations.length} shown of{" "}
                  {presentationsTotalCount}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void handlePreviousPage();
                    }}
                    disabled={isLoading || presentationsPage <= 1}
                    className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-1)] px-2 py-1 text-main disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleNextPage();
                    }}
                    disabled={
                      isLoading ||
                      !presentationsPageInfo.hasNextPage ||
                      !presentationsPageInfo.endCursor
                    }
                    className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-1)] px-2 py-1 text-main disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </article>

          {isProfileModalOpen ? (
            <div
              className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 p-4 sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-label="Telegram profile photos"
            >
              <div className="surface-glass max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-3xl">
                <div className="flex items-center justify-between border-b border-[var(--surface-border)] px-4 py-3 sm:px-5">
                  <div>
                    <h3 className="text-base font-semibold text-main">
                      Telegram profile photos
                    </h3>
                    <p className="text-xs text-muted">
                      Showing {telegramProfilePhotos.length} of{" "}
                      {telegramProfilePhotoTotalCount}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileModalOpen(false);
                    }}
                    className="inline-flex size-8 items-center justify-center rounded-lg border border-[var(--surface-border)] bg-[var(--surface-2)] text-main"
                  >
                    <X className="size-4" aria-hidden="true" />
                    <span className="sr-only">Close</span>
                  </button>
                </div>

                <div className="max-h-[calc(90vh-64px)] overflow-y-auto p-4 sm:p-5">
                  {isProfileModalLoading ? (
                    <p className="inline-flex items-center gap-2 text-sm text-main">
                      <Loader2
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                      Loading images from Telegram...
                    </p>
                  ) : profileModalError ? (
                    <p className="text-sm text-rose-600">{profileModalError}</p>
                  ) : telegramProfilePhotos.length === 0 ? (
                    <p className="text-sm text-muted">
                      No Telegram profile photos found.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {telegramProfilePhotos.map((photo) => (
                        <a
                          key={photo.fileUniqueId}
                          href={photo.dataUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block overflow-hidden rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)]"
                        >
                          <img
                            src={photo.dataUrl}
                            alt="Telegram profile"
                            className="aspect-square w-full object-cover"
                          />
                          <p className="px-2 py-1 text-[0.68rem] text-muted">
                            {photo.width}x{photo.height}
                          </p>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
