"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Eye,
  Loader2,
  LogOut,
  RefreshCw,
  Save,
  Send,
  UserPlus,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { BentoCard, BentoGrid } from "@/components/ui/bento-grid";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { NumberTicker } from "@/components/ui/number-ticker";
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
  statistics: {
    totalJobs: number;
    registrationRate: number;
    completionRate: number;
    pendingRate: number;
    failureRate: number;
    avgGenerationsPerActiveUser24h: number;
  };
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

interface BroadcastHistoryItem {
  id: number;
  adminId: number | null;
  adminName: string | null;
  adminUsername: string | null;
  message: string;
  imageDataUrl: string | null;
  imageFileName: string | null;
  imageMimeType: string | null;
  recipients: number;
  sent: number;
  failed: number;
  createdAt: string;
}

interface RuntimeSettingsResponse {
  mainThemePromptCharacterLimit: number;
  freePresentationGenerationLimit: number;
}

interface ConnectionPageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

interface ConnectionEdge<TNode> {
  cursor: string;
  node: TNode;
}

interface ConnectionResponse<TNode> {
  totalCount: number;
  edges: ConnectionEdge<TNode>[];
  nodes: TNode[];
  pageInfo: ConnectionPageInfo;
}

interface UsersConnectionResponse extends ConnectionResponse<UserRow> {
  search: string | null;
}

interface ApiError {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

const API_PROXY_PREFIX = "/backend";
const THEME_STORAGE_KEY = "axiom-admin-theme";
const SESSION_STORAGE_KEY = "axiom-admin-session";
const STATS_CACHE_STORAGE_KEY = "axiom-admin-stats-cache";
const MAIN_THEME_PROMPT_LIMIT_MIN = 10;
const MAIN_THEME_PROMPT_LIMIT_MAX = 4096;
const FREE_PRESENTATION_GENERATION_LIMIT_MIN = 1;
const FREE_PRESENTATION_GENERATION_LIMIT_MAX = 100;
const BROADCAST_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const EMPTY_CONNECTION_PAGE_INFO: ConnectionPageInfo = {
  hasNextPage: false,
  hasPreviousPage: false,
  startCursor: null,
  endCursor: null,
};

interface JobCompositionStats {
  totalJobs: number;
  completionRate: number;
  pendingRate: number;
  failureRate: number;
}

interface UserLifecycleSnapshot {
  startedOnly: number;
  registeredNoGeneration: number;
  registeredAndGenerated: number;
}

interface CachedStatistics {
  jobComposition: JobCompositionStats;
  userLifecycle: UserLifecycleSnapshot;
}

const EMPTY_JOB_COMPOSITION: JobCompositionStats = {
  totalJobs: 0,
  completionRate: 0,
  pendingRate: 0,
  failureRate: 0,
};

const EMPTY_USER_LIFECYCLE: UserLifecycleSnapshot = {
  startedOnly: 0,
  registeredNoGeneration: 0,
  registeredAndGenerated: 0,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

function toNonNegative(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(value, 0);
}

function parseCachedStatistics(
  rawValue: string | null,
): CachedStatistics | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    const root = asRecord(parsed);

    if (!root) {
      return null;
    }

    const jobRaw = asRecord(root.jobComposition);
    const lifecycleRaw = asRecord(root.userLifecycle);

    if (!jobRaw || !lifecycleRaw) {
      return null;
    }

    return {
      jobComposition: {
        totalJobs: toNonNegative(jobRaw.totalJobs),
        completionRate: clampNumber(
          toNonNegative(jobRaw.completionRate),
          0,
          100,
        ),
        pendingRate: clampNumber(toNonNegative(jobRaw.pendingRate), 0, 100),
        failureRate: clampNumber(toNonNegative(jobRaw.failureRate), 0, 100),
      },
      userLifecycle: {
        startedOnly: toNonNegative(lifecycleRaw.startedOnly),
        registeredNoGeneration: toNonNegative(
          lifecycleRaw.registeredNoGeneration,
        ),
        registeredAndGenerated: toNonNegative(
          lifecycleRaw.registeredAndGenerated,
        ),
      },
    };
  } catch {
    return null;
  }
}

type SectionKey =
  | "overview"
  | "settings"
  | "users"
  | "presentations"
  | "broadcast"
  | "admins";

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

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;

      if (typeof result !== "string") {
        reject(new Error("Failed to read image data."));
        return;
      }

      resolve(result);
    };

    reader.onerror = () => {
      reject(new Error("Failed to read image data."));
    };

    reader.readAsDataURL(file);
  });
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-md bg-[var(--skeleton-fill)]",
        className,
      )}
    />
  );
}

export default function Home() {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [isHydrated, setIsHydrated] = useState(false);

  const [session, setSession] = useState<AuthResponse | null>(null);
  const [profile, setProfile] = useState<AdminProfile | null>(null);

  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [overviewUsers, setOverviewUsers] = useState<UserRow[]>([]);
  const [hasLoadedOverviewUsers, setHasLoadedOverviewUsers] = useState(false);
  const [cachedStatistics, setCachedStatistics] =
    useState<CachedStatistics | null>(null);
  const [presentations, setPresentations] = useState<PresentationRow[]>([]);
  const [selectedPresentation, setSelectedPresentation] =
    useState<PresentationRow | null>(null);
  const [admins, setAdmins] = useState<AdminProfile[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [isPresentationsLoading, setIsPresentationsLoading] = useState(true);
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);
  const [isAdminsLoading, setIsAdminsLoading] = useState(true);

  const [userSearch, setUserSearch] = useState("");
  const [debouncedUserSearch, setDebouncedUserSearch] = useState("");
  const [userLimit, setUserLimit] = useState(20);
  const [usersTotalCount, setUsersTotalCount] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersAfterHistory, setUsersAfterHistory] = useState<
    Array<string | null>
  >([null]);
  const [usersPageInfo, setUsersPageInfo] = useState<ConnectionPageInfo>(
    EMPTY_CONNECTION_PAGE_INFO,
  );

  const [presentationLimit, setPresentationLimit] = useState(15);
  const [presentationStatus, setPresentationStatus] =
    useState<PresentationStatusFilter>("all");
  const [presentationsTotalCount, setPresentationsTotalCount] = useState(0);
  const [presentationsPage, setPresentationsPage] = useState(1);
  const [presentationsAfterHistory, setPresentationsAfterHistory] = useState<
    Array<string | null>
  >([null]);
  const [presentationsPageInfo, setPresentationsPageInfo] =
    useState<ConnectionPageInfo>(EMPTY_CONNECTION_PAGE_INFO);

  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastResult, setBroadcastResult] =
    useState<BroadcastResult | null>(null);
  const [broadcastHistory, setBroadcastHistory] = useState<
    BroadcastHistoryItem[]
  >([]);
  const [isBroadcastHistoryLoading, setIsBroadcastHistoryLoading] =
    useState(false);
  const [isBroadcastSending, setIsBroadcastSending] = useState(false);
  const [broadcastImageFile, setBroadcastImageFile] = useState<File | null>(
    null,
  );
  const [broadcastImagePreviewUrl, setBroadcastImagePreviewUrl] = useState<
    string | null
  >(null);
  const [runtimeSettings, setRuntimeSettings] =
    useState<RuntimeSettingsResponse | null>(null);
  const [
    mainThemePromptCharacterLimitInput,
    setMainThemePromptCharacterLimitInput,
  ] = useState("");
  const [
    freePresentationGenerationLimitInput,
    setFreePresentationGenerationLimitInput,
  ] = useState("");
  const [isSavingRuntimeSettings, setIsSavingRuntimeSettings] = useState(false);

  const [adminName, setAdminName] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminRole, setAdminRole] = useState<AdminRole>("ADMIN");

  const usersRequestVersionRef = useRef(0);
  const presentationsRequestVersionRef = useRef(0);
  const lastDashboardPathRef = useRef<string | null>(null);
  const broadcastImageInputRef = useRef<HTMLInputElement | null>(null);

  const apiRequest = useCallback(
    async <T,>(
      path: string,
      options: RequestInit = {},
      requiresAuth = true,
    ): Promise<T> => {
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
        const errorPayload = await parseResponseBody<unknown>(response).catch(
          () => null,
        );
        const errorMessage = parseApiError(
          errorPayload,
          `${method} ${path} failed with ${response.status}`,
        );

        throw new Error(errorMessage);
      }

      return parseResponseBody<T>(response);
    },
    [session?.accessToken],
  );

  const fetchMe = useCallback(async () => {
    const data = await apiRequest<AdminProfile>("/admin/auth/me");
    setProfile(data);
  }, [apiRequest]);

  const fetchOverview = useCallback(async () => {
    const data = await apiRequest<OverviewResponse>("/admin/overview");
    setOverview(data);
  }, [apiRequest]);

  const fetchUsersPage = useCallback(
    async ({
      after = null,
      page = 1,
      search = debouncedUserSearch,
    }: {
      after?: string | null;
      page?: number;
      search?: string;
    } = {}) => {
      setIsUsersLoading(true);
      const requestVersion = ++usersRequestVersionRef.current;

      try {
        const query = new URLSearchParams();

        if (search) {
          query.set("search", search);
        }

        query.set("first", `${Math.max(1, Math.min(200, userLimit))}`);

        if (after) {
          query.set("after", after);
        }

        const data = await apiRequest<UsersConnectionResponse>(
          `/admin/users?${query.toString()}`,
        );

        if (requestVersion !== usersRequestVersionRef.current) {
          return;
        }

        setUsers(data.nodes);
        setUsersTotalCount(data.totalCount);
        setUsersPageInfo(data.pageInfo ?? EMPTY_CONNECTION_PAGE_INFO);
        setUsersPage(Math.max(1, page));
      } finally {
        if (requestVersion === usersRequestVersionRef.current) {
          setIsUsersLoading(false);
        }
      }
    },
    [apiRequest, debouncedUserSearch, userLimit],
  );

  const fetchUsersFirstPage = useCallback(
    async (search = debouncedUserSearch) => {
      setUsersPage(1);
      setUsersAfterHistory([null]);
      setUsersPageInfo(EMPTY_CONNECTION_PAGE_INFO);

      await fetchUsersPage({ page: 1, after: null, search });
    },
    [debouncedUserSearch, fetchUsersPage],
  );

  const fetchUsersCurrentPage = useCallback(async () => {
    const after = usersAfterHistory[usersPage - 1] ?? null;
    await fetchUsersPage({ page: usersPage, after });
  }, [fetchUsersPage, usersAfterHistory, usersPage]);

  const fetchUsersNextPage = useCallback(async () => {
    if (!usersPageInfo.hasNextPage || !usersPageInfo.endCursor) {
      return;
    }

    const nextPage = usersPage + 1;
    const nextAfter = usersPageInfo.endCursor;

    setUsersAfterHistory((previous) => {
      const trimmed = previous.slice(0, usersPage);
      return [...trimmed, nextAfter];
    });

    await fetchUsersPage({ page: nextPage, after: nextAfter });
  }, [
    fetchUsersPage,
    usersPage,
    usersPageInfo.endCursor,
    usersPageInfo.hasNextPage,
  ]);

  const fetchUsersPreviousPage = useCallback(async () => {
    if (usersPage <= 1) {
      return;
    }

    const previousPage = usersPage - 1;
    const previousAfter = usersAfterHistory[previousPage - 1] ?? null;

    setUsersAfterHistory((previous) => previous.slice(0, previousPage));

    await fetchUsersPage({ page: previousPage, after: previousAfter });
  }, [fetchUsersPage, usersAfterHistory, usersPage]);

  const fetchOverviewUsers = useCallback(async () => {
    const data = await apiRequest<UsersConnectionResponse>(
      "/admin/users?first=200",
    );
    setOverviewUsers(data.nodes);
    setHasLoadedOverviewUsers(true);
  }, [apiRequest]);

  const fetchPresentationsPage = useCallback(
    async ({
      after = null,
      page = 1,
    }: {
      after?: string | null;
      page?: number;
    } = {}) => {
      setIsPresentationsLoading(true);
      const requestVersion = ++presentationsRequestVersionRef.current;

      try {
        const query = new URLSearchParams();

        if (presentationStatus !== "all") {
          query.set("status", presentationStatus);
        }

        query.set("first", `${Math.max(1, Math.min(200, presentationLimit))}`);

        if (after) {
          query.set("after", after);
        }

        const data = await apiRequest<ConnectionResponse<PresentationRow>>(
          `/admin/presentations?${query.toString()}`,
        );

        if (requestVersion !== presentationsRequestVersionRef.current) {
          return;
        }

        setPresentations(data.nodes);
        setPresentationsTotalCount(data.totalCount);
        setPresentationsPageInfo(data.pageInfo ?? EMPTY_CONNECTION_PAGE_INFO);
        setPresentationsPage(Math.max(1, page));
      } finally {
        if (requestVersion === presentationsRequestVersionRef.current) {
          setIsPresentationsLoading(false);
        }
      }
    },
    [apiRequest, presentationLimit, presentationStatus],
  );

  const fetchPresentationsFirstPage = useCallback(async () => {
    setPresentationsPage(1);
    setPresentationsAfterHistory([null]);
    setPresentationsPageInfo(EMPTY_CONNECTION_PAGE_INFO);

    await fetchPresentationsPage({ page: 1, after: null });
  }, [fetchPresentationsPage]);

  const fetchPresentationsCurrentPage = useCallback(async () => {
    const after = presentationsAfterHistory[presentationsPage - 1] ?? null;
    await fetchPresentationsPage({ page: presentationsPage, after });
  }, [fetchPresentationsPage, presentationsAfterHistory, presentationsPage]);

  const fetchPresentationsNextPage = useCallback(async () => {
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

    await fetchPresentationsPage({ page: nextPage, after: nextAfter });
  }, [
    fetchPresentationsPage,
    presentationsPage,
    presentationsPageInfo.endCursor,
    presentationsPageInfo.hasNextPage,
  ]);

  const fetchPresentationsPreviousPage = useCallback(async () => {
    if (presentationsPage <= 1) {
      return;
    }

    const previousPage = presentationsPage - 1;
    const previousAfter = presentationsAfterHistory[previousPage - 1] ?? null;

    setPresentationsAfterHistory((previous) => previous.slice(0, previousPage));

    await fetchPresentationsPage({ page: previousPage, after: previousAfter });
  }, [fetchPresentationsPage, presentationsAfterHistory, presentationsPage]);

  const fetchRuntimeSettings = useCallback(async () => {
    setIsSettingsLoading(true);

    try {
      const data = await apiRequest<RuntimeSettingsResponse>("/admin/settings");
      setRuntimeSettings(data);
      setMainThemePromptCharacterLimitInput(
        `${data.mainThemePromptCharacterLimit}`,
      );
      setFreePresentationGenerationLimitInput(
        `${data.freePresentationGenerationLimit}`,
      );
    } finally {
      setIsSettingsLoading(false);
    }
  }, [apiRequest]);

  const fetchAdmins = useCallback(async () => {
    setIsAdminsLoading(true);

    try {
      const data = await apiRequest<AdminProfile[]>("/admin/admins");
      setAdmins(data);
    } catch (error) {
      setAdmins([]);
      toast.error(toErrorMessage(error));
    } finally {
      setIsAdminsLoading(false);
    }
  }, [apiRequest]);

  const fetchBroadcastHistory = useCallback(async () => {
    setIsBroadcastHistoryLoading(true);

    try {
      const data = await apiRequest<BroadcastHistoryItem[]>(
        "/admin/broadcasts?first=50",
      );
      setBroadcastHistory(data);
    } catch (error) {
      setBroadcastHistory([]);
      toast.error(toErrorMessage(error));
    } finally {
      setIsBroadcastHistoryLoading(false);
    }
  }, [apiRequest]);

  const refreshDashboard = useCallback(async () => {
    if (!session?.accessToken) {
      return;
    }

    setIsLoading(true);

    const presentationFetchTask = pathname.startsWith("/presentations")
      ? fetchPresentationsCurrentPage()
      : fetchPresentationsFirstPage();

    const results = await Promise.allSettled([
      fetchMe(),
      fetchOverview(),
      fetchOverviewUsers(),
      presentationFetchTask,
      ...(pathname.startsWith("/settings") ? [fetchRuntimeSettings()] : []),
      ...(pathname.startsWith("/users") ? [fetchUsersCurrentPage()] : []),
      ...(pathname.startsWith("/admins") ? [fetchAdmins()] : []),
      ...(pathname.startsWith("/broadcast") ? [fetchBroadcastHistory()] : []),
    ]);

    const rejected = results.find(
      (item): item is PromiseRejectedResult => item.status === "rejected",
    );

    if (rejected) {
      toast.error(toErrorMessage(rejected.reason));
    }

    setIsLoading(false);
  }, [
    pathname,
    fetchAdmins,
    fetchMe,
    fetchOverview,
    fetchOverviewUsers,
    fetchBroadcastHistory,
    fetchPresentationsCurrentPage,
    fetchPresentationsFirstPage,
    fetchRuntimeSettings,
    fetchUsersCurrentPage,
    session?.accessToken,
  ]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const savedSession = window.localStorage.getItem(SESSION_STORAGE_KEY);
    const savedStatistics = window.localStorage.getItem(
      STATS_CACHE_STORAGE_KEY,
    );

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
        setProfile(parsedSession.admin);
      } catch {
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }

    if (savedStatistics) {
      const parsedStatistics = parseCachedStatistics(savedStatistics);

      if (parsedStatistics) {
        setCachedStatistics(parsedStatistics);
      } else {
        window.localStorage.removeItem(STATS_CACHE_STORAGE_KEY);
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
    if (!selectedPresentation) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedPresentation(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedPresentation]);

  useEffect(() => {
    return () => {
      if (broadcastImagePreviewUrl) {
        URL.revokeObjectURL(broadcastImagePreviewUrl);
      }
    };
  }, [broadcastImagePreviewUrl]);

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

    if (lastDashboardPathRef.current === pathname) {
      return;
    }

    lastDashboardPathRef.current = pathname;

    void refreshDashboard();
  }, [isHydrated, pathname, refreshDashboard, session?.accessToken]);

  useEffect(() => {
    if (session?.accessToken) {
      return;
    }

    lastDashboardPathRef.current = null;
  }, [session?.accessToken]);

  useEffect(() => {
    if (!isHydrated || session?.accessToken) {
      return;
    }

    const nextPath =
      pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    router.replace(`/login${nextPath}`);
  }, [isHydrated, pathname, router, session?.accessToken]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDebouncedUserSearch(userSearch.trim());
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isHydrated, userSearch]);

  useEffect(() => {
    if (
      !isHydrated ||
      !session?.accessToken ||
      !pathname.startsWith("/users")
    ) {
      return;
    }

    void fetchUsersFirstPage();
  }, [
    fetchUsersFirstPage,
    isHydrated,
    pathname,
    session?.accessToken,
    userLimit,
    debouncedUserSearch,
  ]);

  useEffect(() => {
    if (
      !isHydrated ||
      !session?.accessToken ||
      !pathname.startsWith("/presentations")
    ) {
      return;
    }

    void fetchPresentationsFirstPage();
  }, [
    fetchPresentationsFirstPage,
    isHydrated,
    pathname,
    presentationLimit,
    presentationStatus,
    session?.accessToken,
  ]);

  const pendingPresentations = presentations.filter(
    (item) => item.status === "pending",
  );

  const generatedUsersCount = useMemo(
    () => overviewUsers.filter((user) => user.totalGenerations > 0).length,
    [overviewUsers],
  );

  const liveJobCompositionStats = useMemo<JobCompositionStats | null>(() => {
    if (!overview?.statistics) {
      return null;
    }

    return {
      totalJobs: Math.max(overview.statistics.totalJobs, 0),
      completionRate: clampNumber(overview.statistics.completionRate, 0, 100),
      pendingRate: clampNumber(overview.statistics.pendingRate, 0, 100),
      failureRate: clampNumber(overview.statistics.failureRate, 0, 100),
    };
  }, [overview]);

  const cachedJobComposition =
    cachedStatistics?.jobComposition ?? EMPTY_JOB_COMPOSITION;
  const jobCompositionStats = liveJobCompositionStats ?? cachedJobComposition;
  const usingCachedJobComposition = !liveJobCompositionStats;

  const liveUserLifecycleSnapshot =
    useMemo<UserLifecycleSnapshot | null>(() => {
      if (!overview || !hasLoadedOverviewUsers) {
        return null;
      }

      return {
        startedOnly: Math.max(
          (overview.totalUsers ?? 0) - (overview.registeredUsers ?? 0),
          0,
        ),
        registeredNoGeneration: Math.max(
          (overview.registeredUsers ?? 0) - generatedUsersCount,
          0,
        ),
        registeredAndGenerated: generatedUsersCount,
      };
    }, [generatedUsersCount, hasLoadedOverviewUsers, overview]);

  const cachedUserLifecycle =
    cachedStatistics?.userLifecycle ?? EMPTY_USER_LIFECYCLE;
  const userLifecycleSnapshot =
    liveUserLifecycleSnapshot ?? cachedUserLifecycle;
  const usingCachedLifecycle = !liveUserLifecycleSnapshot;

  const userLifecycleStats = useMemo(
    () => [
      {
        label: "Started only",
        value: userLifecycleSnapshot.startedOnly,
        colorClass: "bg-sky-400/90",
      },
      {
        label: "Registered, no generation",
        value: userLifecycleSnapshot.registeredNoGeneration,
        colorClass: "bg-amber-400/90",
      },
      {
        label: "Registered and generated",
        value: userLifecycleSnapshot.registeredAndGenerated,
        colorClass: "bg-emerald-400/90",
      },
    ],
    [userLifecycleSnapshot],
  );

  const userLifecycleTotal = useMemo(
    () => userLifecycleStats.reduce((sum, item) => sum + item.value, 0),
    [userLifecycleStats],
  );

  const cachedUserLifecycleTotal = useMemo(
    () =>
      cachedUserLifecycle.startedOnly +
      cachedUserLifecycle.registeredNoGeneration +
      cachedUserLifecycle.registeredAndGenerated,
    [cachedUserLifecycle],
  );

  const cachedLifecycleValueByLabel = useMemo(
    () => ({
      "Started only": cachedUserLifecycle.startedOnly,
      "Registered, no generation": cachedUserLifecycle.registeredNoGeneration,
      "Registered and generated": cachedUserLifecycle.registeredAndGenerated,
    }),
    [cachedUserLifecycle],
  );

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (!liveJobCompositionStats && !liveUserLifecycleSnapshot) {
      return;
    }

    const next: CachedStatistics = {
      jobComposition:
        liveJobCompositionStats ??
        cachedStatistics?.jobComposition ??
        EMPTY_JOB_COMPOSITION,
      userLifecycle:
        liveUserLifecycleSnapshot ??
        cachedStatistics?.userLifecycle ??
        EMPTY_USER_LIFECYCLE,
    };

    window.localStorage.setItem(STATS_CACHE_STORAGE_KEY, JSON.stringify(next));
  }, [
    cachedStatistics,
    isHydrated,
    liveJobCompositionStats,
    liveUserLifecycleSnapshot,
  ]);

  const activeSection = useMemo<SectionKey>(() => {
    if (pathname.startsWith("/settings")) {
      return "settings";
    }

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

  const showPendingQueueSkeleton =
    isPresentationsLoading && pendingPresentations.length === 0;
  const showUsersSkeleton = isUsersLoading && users.length === 0;
  const showPresentationsSkeleton =
    isPresentationsLoading && presentations.length === 0;
  const showSettingsSkeleton = isSettingsLoading && !runtimeSettings;
  const showAdminsSkeleton = isAdminsLoading && admins.length === 0;

  const sectionCopy = useMemo(
    () => ({
      overview: {
        eyebrow: "Admin Operations",
        title: "Presentation Platform Command Deck",
        description:
          "Live platform overview with pending moderation items and quick navigation to operational pages.",
      },
      settings: {
        eyebrow: "Configuration",
        title: "Generation Settings",
        description:
          "Manage runtime configuration for generation behavior and prompt validation.",
      },
      users: {
        eyebrow: "User Intelligence",
        title: "User Directory",
        description:
          "Search and audit user activity through the documented admin user endpoint.",
      },
      presentations: {
        eyebrow: "Moderation",
        title: "Presentation Stream",
        description:
          "Review generated presentations and force-fail pending items when needed.",
      },
      broadcast: {
        eyebrow: "Messaging",
        title: "Broadcast Console",
        description: "Send platform-wide announcements to reachable users.",
      },
      admins: {
        eyebrow: "Access Control",
        title: "Admin Management",
        description:
          "Review admin roster and create new admin accounts based on role permissions.",
      },
    }),
    [],
  );

  const navItems = useMemo(
    () => [
      {
        key: "overview" as const,
        label: "Overview",
        href: "/",
      },
      {
        key: "users" as const,
        label: "Users",
        href: "/users",
      },
      {
        key: "presentations" as const,
        label: "Presentations",
        href: "/presentations",
      },
      {
        key: "broadcast" as const,
        label: "Broadcast",
        href: "/broadcast",
      },
      {
        key: "admins" as const,
        label: "Admins",
        href: "/admins",
      },
      {
        key: "settings" as const,
        label: "Settings",
        href: "/settings",
      },
    ],
    [],
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

  const handleLogout = async () => {
    if (session?.accessToken) {
      try {
        await apiRequest<{ success: boolean }>(
          "/admin/auth/logout",
          {
            method: "POST",
          },
          true,
        );
      } catch {}
    }

    setSession(null);
    setProfile(null);
    setOverview(null);
    setUsers([]);
    setDebouncedUserSearch("");
    setUsersTotalCount(0);
    setUsersPage(1);
    setUsersAfterHistory([null]);
    setUsersPageInfo(EMPTY_CONNECTION_PAGE_INFO);
    setOverviewUsers([]);
    setHasLoadedOverviewUsers(false);
    setPresentations([]);
    setPresentationsTotalCount(0);
    setPresentationsPage(1);
    setPresentationsAfterHistory([null]);
    setPresentationsPageInfo(EMPTY_CONNECTION_PAGE_INFO);
    setBroadcastMessage("");
    setBroadcastResult(null);
    setBroadcastHistory([]);
    setIsBroadcastHistoryLoading(false);
    setIsBroadcastSending(false);
    setBroadcastImageFile(null);
    if (broadcastImagePreviewUrl) {
      URL.revokeObjectURL(broadcastImagePreviewUrl);
    }
    setBroadcastImagePreviewUrl(null);
    setAdmins([]);
    setRuntimeSettings(null);
    setMainThemePromptCharacterLimitInput("");
    setFreePresentationGenerationLimitInput("");
    setIsSavingRuntimeSettings(false);
    toast.success("Session cleared.");
    router.replace("/login");
  };

  const handleFailPresentation = async (id: number) => {
    try {
      const result = await apiRequest<{ updated: boolean }>(
        `/admin/presentations/${id}/fail`,
        { method: "POST" },
      );

      if (result.updated) {
        toast.success(`Presentation #${id} moved to failed.`);
      } else {
        toast.info(`Presentation #${id} was not pending.`);
      }

      await fetchPresentationsCurrentPage();
      await fetchOverview();
    } catch (error) {
      toast.error(toErrorMessage(error));
    }
  };

  const clearBroadcastImage = () => {
    if (broadcastImagePreviewUrl) {
      URL.revokeObjectURL(broadcastImagePreviewUrl);
    }

    if (broadcastImageInputRef.current) {
      broadcastImageInputRef.current.value = "";
    }

    setBroadcastImagePreviewUrl(null);
    setBroadcastImageFile(null);
  };

  const handleBroadcastImageChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      clearBroadcastImage();
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      event.target.value = "";
      return;
    }

    if (file.size > BROADCAST_IMAGE_MAX_BYTES) {
      toast.error("Image must be 5 MB or smaller.");
      event.target.value = "";
      return;
    }

    clearBroadcastImage();
    setBroadcastImageFile(file);
    setBroadcastImagePreviewUrl(URL.createObjectURL(file));
  };

  const handleBroadcast = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedMessage = broadcastMessage.trim();

    if (!trimmedMessage) {
      toast.error("Message is required.");
      return;
    }

    if (broadcastImageFile && trimmedMessage.length > 1024) {
      toast.error("Message must be 1024 characters or less with an image.");
      return;
    }

    setIsBroadcastSending(true);

    try {
      const imageDataUrl = broadcastImageFile
        ? await readFileAsDataUrl(broadcastImageFile)
        : undefined;

      const result = await apiRequest<BroadcastResult>(
        "/admin/broadcast",
        {
          method: "POST",
          body: JSON.stringify({
            message: trimmedMessage,
            imageDataUrl,
            imageFileName: broadcastImageFile?.name,
          }),
        },
        true,
      );

      setBroadcastResult(result);
      setBroadcastMessage("");
      clearBroadcastImage();
      await fetchBroadcastHistory();
      toast.success("Broadcast queued successfully.");
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setIsBroadcastSending(false);
    }
  };

  const saveRuntimeSettings = async (
    payload: Partial<RuntimeSettingsResponse>,
    successMessage: string,
  ) => {
    setIsSavingRuntimeSettings(true);

    try {
      const updated = await apiRequest<RuntimeSettingsResponse>(
        "/admin/settings",
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
      );

      setRuntimeSettings(updated);
      setMainThemePromptCharacterLimitInput(
        `${updated.mainThemePromptCharacterLimit}`,
      );
      setFreePresentationGenerationLimitInput(
        `${updated.freePresentationGenerationLimit}`,
      );
      toast.success(successMessage);
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setIsSavingRuntimeSettings(false);
    }
  };

  const handleSaveRuntimeSettings = async () => {
    const parsedMainThemeLimit = Number(
      mainThemePromptCharacterLimitInput.trim(),
    );

    if (!Number.isInteger(parsedMainThemeLimit)) {
      toast.error("Main theme prompt limit must be an integer.");
      return;
    }

    if (
      parsedMainThemeLimit < MAIN_THEME_PROMPT_LIMIT_MIN ||
      parsedMainThemeLimit > MAIN_THEME_PROMPT_LIMIT_MAX
    ) {
      toast.error(
        `Main theme prompt limit must be between ${MAIN_THEME_PROMPT_LIMIT_MIN} and ${MAIN_THEME_PROMPT_LIMIT_MAX}.`,
      );
      return;
    }

    const parsedFreeGenerationLimit = Number(
      freePresentationGenerationLimitInput.trim(),
    );

    if (!Number.isInteger(parsedFreeGenerationLimit)) {
      toast.error("Free presentation generation limit must be an integer.");
      return;
    }

    if (
      parsedFreeGenerationLimit < FREE_PRESENTATION_GENERATION_LIMIT_MIN ||
      parsedFreeGenerationLimit > FREE_PRESENTATION_GENERATION_LIMIT_MAX
    ) {
      toast.error(
        `Free presentation generation limit must be between ${FREE_PRESENTATION_GENERATION_LIMIT_MIN} and ${FREE_PRESENTATION_GENERATION_LIMIT_MAX}.`,
      );
      return;
    }

    await saveRuntimeSettings(
      {
        mainThemePromptCharacterLimit: parsedMainThemeLimit,
        freePresentationGenerationLimit: parsedFreeGenerationLimit,
      },
      "Runtime settings updated.",
    );
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
        true,
      );

      setAdminName("");
      setAdminUsername("");
      setAdminPassword("");
      setAdminRole("ADMIN");

      toast.success("New admin account created.");
      await fetchAdmins();
    } catch (error) {
      toast.error(toErrorMessage(error));
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
            <aside className="surface-glass flex h-fit self-start flex-col rounded-3xl p-5 lg:sticky lg:top-8">
              <div className="relative overflow-hidden rounded-2xl p-4 surface-muted">
                <ShineBorder
                  borderWidth={1}
                  duration={9}
                  shineColor={[
                    "rgba(14,165,233,0.75)",
                    "rgba(249,115,22,0.55)",
                  ]}
                />
                <p className="text-[0.67rem] font-semibold tracking-[0.2em] uppercase text-muted">
                  MagicUI Console
                </p>
                <h1 className="mt-2 text-xl font-semibold tracking-tight text-main">
                  Axiom Admin
                </h1>
                <p className="mt-2 text-xs text-muted">
                  Operating on the documented endpoints with real-time controls.
                </p>
              </div>

              <div className="mt-5 rounded-2xl surface-muted p-3">
                <div className="flex w-full items-center justify-between rounded-xl border border-[var(--surface-border)] bg-[var(--surface-3)] px-3 py-2 text-sm font-medium text-main">
                  <span>Theme</span>
                  <AnimatedThemeToggler
                    storageKey={THEME_STORAGE_KEY}
                    onThemeChange={setTheme}
                    aria-label="Toggle theme"
                    className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--surface-border)] bg-[var(--surface-2)] text-main transition hover:border-[var(--accent)]"
                  />
                </div>
              </div>

              <nav className="mt-5 space-y-2">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex w-full items-center rounded-xl border px-3 py-2 text-sm transition",
                      activeSection === item.key
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-main"
                        : "border-[var(--surface-border)] bg-[var(--surface-2)] text-main hover:border-[var(--accent)]",
                    )}
                  >
                    <span>{item.label}</span>
                  </Link>
                ))}
              </nav>
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
                    <p className="mt-2 max-w-2xl text-sm text-muted">
                      {sectionCopy[activeSection].description}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void refreshDashboard();
                      }}
                      disabled={!session || isLoading}
                      aria-label={isLoading ? "Syncing all" : "Sync all"}
                      title={isLoading ? "Syncing all" : "Sync all"}
                      className="inline-flex size-9 items-center justify-center rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] text-main transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isLoading ? (
                        <Loader2
                          className="size-4 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <RefreshCw className="size-4" aria-hidden="true" />
                      )}
                      <span className="sr-only">
                        {isLoading ? "Syncing all" : "Sync all"}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void handleLogout();
                      }}
                      disabled={!session}
                      aria-label="Logout"
                      title="Logout"
                      className="inline-flex size-9 items-center justify-center rounded-xl border border-rose-300/50 bg-rose-200/30 text-rose-700 transition hover:bg-rose-300/35 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <LogOut className="size-4" aria-hidden="true" />
                      <span className="sr-only">Logout</span>
                    </button>
                  </div>
                </div>

                {profile ? (
                  <p className="mt-4 text-xs text-muted">
                    Signed in as{" "}
                    <span className="font-semibold text-main">
                      {profile.name}
                    </span>{" "}
                    ({profile.role}) - @{profile.username}
                  </p>
                ) : isLoading ? (
                  <SkeletonBlock className="mt-4 h-4 w-64" />
                ) : null}
              </header>

              {!session ? (
                <section className="surface-glass rounded-3xl p-5 md:p-6">
                  <h3 className="text-xl font-semibold text-main">
                    Redirecting to login
                  </h3>
                  <p className="mt-2 text-sm text-muted">
                    Authentication now lives on a dedicated `/login` page.
                  </p>
                </section>
              ) : (
                <>
                  <div key={activeSection}>
                    {activeSection === "overview" ? (
                      <BentoGrid>
                        <BentoCard
                          title="Pending Queue"
                          description="Moderation candidate list"
                          className="surface-glass order-2 md:col-span-2"
                        >
                          <div className="space-y-2">
                            {showPendingQueueSkeleton ? (
                              Array.from({ length: 4 }).map((_, index) => (
                                <div
                                  key={`pending-skeleton-${index}`}
                                  className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2"
                                >
                                  <SkeletonBlock className="h-4 w-4/5" />
                                  <SkeletonBlock className="mt-2 h-3 w-2/3" />
                                </div>
                              ))
                            ) : pendingPresentations.length === 0 ? (
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
                                    <p className="text-sm font-medium text-main">
                                      #{item.id}{" "}
                                      {item.metadata?.prompt ??
                                        "Untitled prompt"}
                                    </p>
                                    <p className="text-xs text-muted">
                                      {item.firstName} -{" "}
                                      {formatDate(item.createdAt)}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void handleFailPresentation(item.id);
                                    }}
                                    aria-label="Mark failed"
                                    title="Mark failed"
                                    className="inline-flex size-7 items-center justify-center rounded-lg border border-rose-300 bg-rose-100 text-rose-700"
                                  >
                                    <XCircle
                                      className="size-3.5"
                                      aria-hidden="true"
                                    />
                                    <span className="sr-only">Mark failed</span>
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        </BentoCard>

                        <BentoCard
                          title="Statistics"
                          description=""
                          className="surface-glass order-1 md:col-span-4"
                          as="div"
                        >
                          <div className="space-y-3">
                            <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-2)] p-3 transition-colors duration-300 hover:border-[var(--accent)]">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs text-muted">
                                  Job composition
                                </p>
                                <p className="text-sm font-semibold text-main">
                                  <NumberTicker
                                    value={jobCompositionStats.totalJobs}
                                    startValue={
                                      usingCachedJobComposition
                                        ? 0
                                        : cachedJobComposition.totalJobs
                                    }
                                  />{" "}
                                  total
                                </p>
                              </div>

                              <div className="mt-3 flex h-3 overflow-hidden rounded-full border border-[var(--surface-border)] bg-[var(--surface-3)]">
                                <div
                                  className="h-full bg-emerald-400/90 transition-[width] duration-700 ease-out"
                                  style={{
                                    width: `${jobCompositionStats.completionRate}%`,
                                  }}
                                />
                                <div
                                  className="h-full bg-amber-400/90 transition-[width] duration-700 ease-out"
                                  style={{
                                    width: `${jobCompositionStats.pendingRate}%`,
                                  }}
                                />
                                <div
                                  className="h-full bg-rose-400/90 transition-[width] duration-700 ease-out"
                                  style={{
                                    width: `${jobCompositionStats.failureRate}%`,
                                  }}
                                />
                              </div>

                              <div className="mt-2 grid grid-cols-3 gap-2 text-[0.7rem] text-muted">
                                <p className="flex items-center gap-1.5">
                                  <span className="inline-block size-2 rounded-full bg-emerald-400/90" />
                                  Completed:{" "}
                                  <NumberTicker
                                    value={jobCompositionStats.completionRate}
                                    startValue={
                                      usingCachedJobComposition
                                        ? 0
                                        : cachedJobComposition.completionRate
                                    }
                                    decimalPlaces={1}
                                  />
                                  %
                                </p>
                                <p className="flex items-center gap-1.5">
                                  <span className="inline-block size-2 rounded-full bg-amber-400/90" />
                                  Pending:{" "}
                                  <NumberTicker
                                    value={jobCompositionStats.pendingRate}
                                    startValue={
                                      usingCachedJobComposition
                                        ? 0
                                        : cachedJobComposition.pendingRate
                                    }
                                    decimalPlaces={1}
                                  />
                                  %
                                </p>
                                <p className="flex items-center gap-1.5">
                                  <span className="inline-block size-2 rounded-full bg-rose-400/90" />
                                  Failed:{" "}
                                  <NumberTicker
                                    value={jobCompositionStats.failureRate}
                                    startValue={
                                      usingCachedJobComposition
                                        ? 0
                                        : cachedJobComposition.failureRate
                                    }
                                    decimalPlaces={1}
                                  />
                                  %
                                </p>
                              </div>
                            </div>

                            <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-2)] p-3 transition-colors duration-300 hover:border-[var(--accent)]">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs text-muted">
                                  User lifecycle
                                </p>
                                <p className="text-sm font-semibold text-main">
                                  <NumberTicker
                                    value={userLifecycleTotal}
                                    startValue={
                                      usingCachedLifecycle
                                        ? 0
                                        : cachedUserLifecycleTotal
                                    }
                                  />{" "}
                                  users
                                </p>
                              </div>

                              <div className="mt-3 flex h-3 overflow-hidden rounded-full border border-[var(--surface-border)] bg-[var(--surface-3)]">
                                {userLifecycleStats.map((item) => (
                                  <div
                                    key={item.label}
                                    className={cn(
                                      "h-full transition-all duration-700",
                                      item.colorClass,
                                    )}
                                    style={{
                                      width: `${userLifecycleTotal > 0 ? (item.value / userLifecycleTotal) * 100 : 0}%`,
                                    }}
                                  />
                                ))}
                              </div>

                              <div className="mt-2 grid gap-2 text-[0.72rem] text-muted sm:grid-cols-3">
                                {userLifecycleStats.map((item) => (
                                  <div
                                    key={item.label}
                                    className="flex items-center gap-2"
                                  >
                                    <span
                                      className={cn(
                                        "inline-block size-2 rounded-full",
                                        item.colorClass,
                                      )}
                                    />
                                    <p>
                                      {item.label}:{" "}
                                      <NumberTicker
                                        value={item.value}
                                        startValue={
                                          usingCachedLifecycle
                                            ? 0
                                            : (cachedLifecycleValueByLabel[
                                                item.label as keyof typeof cachedLifecycleValueByLabel
                                              ] ?? 0)
                                        }
                                      />{" "}
                                      (
                                      <NumberTicker
                                        value={
                                          userLifecycleTotal > 0
                                            ? (item.value /
                                                userLifecycleTotal) *
                                              100
                                            : 0
                                        }
                                        startValue={
                                          usingCachedLifecycle
                                            ? 0
                                            : cachedUserLifecycleTotal > 0
                                              ? ((cachedLifecycleValueByLabel[
                                                  item.label as keyof typeof cachedLifecycleValueByLabel
                                                ] ?? 0) /
                                                  cachedUserLifecycleTotal) *
                                                100
                                              : 0
                                        }
                                        decimalPlaces={1}
                                      />
                                      %)
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </BentoCard>
                      </BentoGrid>
                    ) : null}

                    {activeSection === "settings" ? (
                      <section>
                        <article className="surface-glass rounded-3xl p-5">
                          <div className="flex flex-wrap items-end justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-semibold text-main">
                                Runtime settings
                              </h3>
                              <p className="text-sm text-muted">
                                Manage generation limits used by Telegram flow.
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  void fetchRuntimeSettings();
                                }}
                                disabled={
                                  !session ||
                                  isSavingRuntimeSettings ||
                                  isSettingsLoading
                                }
                                aria-label="Reload settings"
                                title="Reload settings"
                                className="inline-flex size-9 items-center justify-center rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] text-main transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isSettingsLoading ? (
                                  <Loader2
                                    className="size-4 animate-spin"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <RefreshCw
                                    className="size-4"
                                    aria-hidden="true"
                                  />
                                )}
                                <span className="sr-only">Reload settings</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  void handleSaveRuntimeSettings();
                                }}
                                disabled={
                                  isSavingRuntimeSettings ||
                                  isSettingsLoading ||
                                  !runtimeSettings ||
                                  !mainThemePromptCharacterLimitInput.trim() ||
                                  !freePresentationGenerationLimitInput.trim()
                                }
                                aria-label={
                                  isSavingRuntimeSettings
                                    ? "Saving settings"
                                    : "Save all settings"
                                }
                                title={
                                  isSavingRuntimeSettings
                                    ? "Saving settings"
                                    : "Save all settings"
                                }
                                className="inline-flex size-9 items-center justify-center rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] text-main disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isSavingRuntimeSettings ? (
                                  <Loader2
                                    className="size-4 animate-spin"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <Save className="size-4" aria-hidden="true" />
                                )}
                                <span className="sr-only">
                                  {isSavingRuntimeSettings
                                    ? "Saving settings"
                                    : "Save all settings"}
                                </span>
                              </button>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            {showSettingsSkeleton ? (
                              Array.from({ length: 2 }).map((_, index) => (
                                <article
                                  key={`settings-skeleton-${index}`}
                                  className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] p-3"
                                >
                                  <SkeletonBlock className="h-4 w-40" />
                                  <SkeletonBlock className="mt-2 h-3 w-2/3" />
                                  <SkeletonBlock className="mt-4 h-3 w-24" />
                                  <SkeletonBlock className="mt-2 h-8 w-28" />
                                  <SkeletonBlock className="mt-2 h-3 w-5/6" />
                                </article>
                              ))
                            ) : (
                              <>
                                <article className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] p-3">
                                  <div>
                                    <h4 className="text-xs font-semibold tracking-wide text-main uppercase">
                                      Main theme prompt limit
                                    </h4>
                                    <p className="mt-0.5 text-[0.72rem] text-muted">
                                      Max characters for main theme prompt.
                                    </p>
                                  </div>

                                  <div className="mt-2 space-y-2">
                                    <p className="text-xs text-main">
                                      Current:{" "}
                                      <span className="font-semibold">
                                        {runtimeSettings?.mainThemePromptCharacterLimit ??
                                          "-"}
                                      </span>
                                    </p>

                                    <input
                                      type="number"
                                      min={MAIN_THEME_PROMPT_LIMIT_MIN}
                                      max={MAIN_THEME_PROMPT_LIMIT_MAX}
                                      value={mainThemePromptCharacterLimitInput}
                                      onChange={(event) => {
                                        setMainThemePromptCharacterLimitInput(
                                          event.target.value,
                                        );
                                      }}
                                      className="w-28 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-1)] px-2.5 py-1.5 text-xs text-main outline-none focus:border-[var(--accent)]"
                                      required
                                    />

                                    <p className="text-[0.72rem] text-muted">
                                      Allowed range:{" "}
                                      {MAIN_THEME_PROMPT_LIMIT_MIN}-
                                      {MAIN_THEME_PROMPT_LIMIT_MAX} characters.
                                    </p>
                                  </div>
                                </article>

                                <article className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] p-3">
                                  <div>
                                    <h4 className="text-xs font-semibold tracking-wide text-main uppercase">
                                      Free generation limit
                                    </h4>
                                    <p className="mt-0.5 text-[0.72rem] text-muted">
                                      Free presentation quota per 24 hours.
                                    </p>
                                  </div>

                                  <div className="mt-2 space-y-2">
                                    <p className="text-xs text-main">
                                      Current:{" "}
                                      <span className="font-semibold">
                                        {runtimeSettings?.freePresentationGenerationLimit ??
                                          "-"}
                                      </span>
                                    </p>

                                    <input
                                      type="number"
                                      min={
                                        FREE_PRESENTATION_GENERATION_LIMIT_MIN
                                      }
                                      max={
                                        FREE_PRESENTATION_GENERATION_LIMIT_MAX
                                      }
                                      value={
                                        freePresentationGenerationLimitInput
                                      }
                                      onChange={(event) => {
                                        setFreePresentationGenerationLimitInput(
                                          event.target.value,
                                        );
                                      }}
                                      className="w-28 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-1)] px-2.5 py-1.5 text-xs text-main outline-none focus:border-[var(--accent)]"
                                      required
                                    />

                                    <p className="text-[0.72rem] text-muted">
                                      Allowed range:{" "}
                                      {FREE_PRESENTATION_GENERATION_LIMIT_MIN}-
                                      {FREE_PRESENTATION_GENERATION_LIMIT_MAX}{" "}
                                      per 24 hours.
                                    </p>
                                  </div>
                                </article>
                              </>
                            )}
                          </div>
                        </article>
                      </section>
                    ) : null}

                    {activeSection === "users" ? (
                      <section>
                        <article className="surface-glass rounded-3xl p-5">
                          <div className="flex flex-wrap items-end justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-semibold text-main">
                                Users
                              </h3>
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
                                  const search = userSearch.trim();
                                  setDebouncedUserSearch(search);
                                  void fetchUsersFirstPage(search);
                                }}
                                disabled={isUsersLoading}
                                aria-label="Reload users"
                                title="Reload users"
                                className="inline-flex size-9 items-center justify-center rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] text-main disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isUsersLoading ? (
                                  <Loader2
                                    className="size-4 animate-spin"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <RefreshCw
                                    className="size-4"
                                    aria-hidden="true"
                                  />
                                )}
                                <span className="sr-only">Reload users</span>
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
                                {showUsersSkeleton
                                  ? Array.from({ length: 6 }).map(
                                      (_, index) => (
                                        <tr
                                          key={`users-skeleton-${index}`}
                                          className="border-t border-[var(--surface-border)] bg-[var(--surface-1)]"
                                        >
                                          <td className="px-3 py-2">
                                            <SkeletonBlock className="h-4 w-32" />
                                            <SkeletonBlock className="mt-2 h-3 w-24" />
                                          </td>
                                          <td className="px-3 py-2">
                                            <SkeletonBlock className="h-4 w-28" />
                                          </td>
                                          <td className="px-3 py-2">
                                            <SkeletonBlock className="h-4 w-10" />
                                          </td>
                                          <td className="px-3 py-2">
                                            <SkeletonBlock className="h-4 w-32" />
                                          </td>
                                        </tr>
                                      ),
                                    )
                                  : users.map((user) => (
                                      <tr
                                        key={user.id}
                                        className="border-t border-[var(--surface-border)] bg-[var(--surface-1)]"
                                      >
                                        <td className="px-3 py-2 text-main">
                                          <p className="font-medium">
                                            {user.firstName}
                                          </p>
                                          <p className="text-xs text-muted">
                                            @{user.username ?? "no_username"}
                                          </p>
                                        </td>
                                        <td className="px-3 py-2 text-main">
                                          {user.telegramId}
                                        </td>
                                        <td className="px-3 py-2 text-main">
                                          {user.totalGenerations}
                                        </td>
                                        <td className="px-3 py-2 text-main">
                                          {formatDate(user.lastGenerationAt)}
                                        </td>
                                      </tr>
                                    ))}
                              </tbody>
                            </table>

                            {!isUsersLoading && users.length === 0 ? (
                              <p className="px-3 py-5 text-sm text-muted">
                                No users found for this filter.
                              </p>
                            ) : null}

                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-muted">
                              <p>
                                Page {usersPage} - {users.length} shown of{" "}
                                {usersTotalCount}
                              </p>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    void fetchUsersPreviousPage();
                                  }}
                                  disabled={isUsersLoading || usersPage <= 1}
                                  className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-1)] px-2 py-1 text-main disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Prev
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void fetchUsersNextPage();
                                  }}
                                  disabled={
                                    isUsersLoading ||
                                    !usersPageInfo.hasNextPage ||
                                    !usersPageInfo.endCursor
                                  }
                                  className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-1)] px-2 py-1 text-main disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Next
                                </button>
                              </div>
                            </div>
                          </div>
                        </article>
                      </section>
                    ) : null}

                    {activeSection === "presentations" ? (
                      <section>
                        <article className="surface-glass rounded-3xl p-5">
                          <div className="flex flex-wrap items-end justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-semibold text-main">
                                Presentations
                              </h3>
                              <p className="text-sm text-muted">
                                GET /admin/presentations + POST
                                /admin/presentations/:id/fail
                              </p>
                            </div>

                            <div className="flex gap-2">
                              <select
                                value={presentationStatus}
                                onChange={(event) => {
                                  setPresentationStatus(
                                    event.target
                                      .value as PresentationStatusFilter,
                                  );
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
                                  setPresentationLimit(
                                    Number(event.target.value),
                                  );
                                }}
                                className="w-24 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-main outline-none focus:border-[var(--accent)]"
                              />

                              <button
                                type="button"
                                onClick={() => {
                                  void fetchPresentationsCurrentPage();
                                }}
                                disabled={isPresentationsLoading}
                                aria-label="Reload presentations"
                                title="Reload presentations"
                                className="inline-flex size-9 items-center justify-center rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] text-main disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isPresentationsLoading ? (
                                  <Loader2
                                    className="size-4 animate-spin"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <RefreshCw
                                    className="size-4"
                                    aria-hidden="true"
                                  />
                                )}
                                <span className="sr-only">
                                  Reload presentations
                                </span>
                              </button>
                            </div>
                          </div>

                          <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--surface-border)]">
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-sm">
                                <thead className="bg-[var(--surface-2)] text-left text-[0.72rem] tracking-[0.12em] text-muted uppercase">
                                  <tr>
                                    <th className="px-3 py-2">ID</th>
                                    <th className="px-3 py-2">Prompt</th>
                                    <th className="px-3 py-2">User</th>
                                    <th className="px-3 py-2">Status</th>
                                    <th className="px-3 py-2">Lang</th>
                                    <th className="px-3 py-2">Slides</th>
                                    <th className="px-3 py-2">Created</th>
                                    <th className="px-3 py-2">Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {showPresentationsSkeleton
                                    ? Array.from({ length: 7 }).map(
                                        (_, index) => (
                                          <tr
                                            key={`presentations-skeleton-${index}`}
                                            className="border-t border-[var(--surface-border)] bg-[var(--surface-1)]"
                                          >
                                            <td className="px-3 py-2">
                                              <SkeletonBlock className="h-4 w-12" />
                                            </td>
                                            <td className="px-3 py-2">
                                              <SkeletonBlock className="h-4 w-48" />
                                              <SkeletonBlock className="mt-2 h-4 w-40" />
                                            </td>
                                            <td className="px-3 py-2">
                                              <SkeletonBlock className="h-4 w-24" />
                                              <SkeletonBlock className="mt-2 h-3 w-20" />
                                            </td>
                                            <td className="px-3 py-2">
                                              <SkeletonBlock className="h-6 w-20 rounded-full" />
                                            </td>
                                            <td className="px-3 py-2">
                                              <SkeletonBlock className="h-4 w-14" />
                                            </td>
                                            <td className="px-3 py-2">
                                              <SkeletonBlock className="h-4 w-10" />
                                            </td>
                                            <td className="px-3 py-2">
                                              <SkeletonBlock className="h-4 w-28" />
                                            </td>
                                            <td className="px-3 py-2">
                                              <SkeletonBlock className="h-7 w-16" />
                                            </td>
                                          </tr>
                                        ),
                                      )
                                    : presentations.map((item) => (
                                        <tr
                                          key={item.id}
                                          className="border-t border-[var(--surface-border)] bg-[var(--surface-1)]"
                                        >
                                          <td className="px-3 py-2 font-medium text-main">
                                            #{item.id}
                                          </td>
                                          <td className="px-3 py-2 text-main">
                                            <p
                                              className="max-w-xs whitespace-normal break-words"
                                              style={{
                                                display: "-webkit-box",
                                                WebkitBoxOrient: "vertical",
                                                WebkitLineClamp: 3,
                                                overflow: "hidden",
                                              }}
                                            >
                                              {item.metadata?.prompt ??
                                                "Untitled prompt"}
                                            </p>
                                          </td>
                                          <td className="px-3 py-2 text-main">
                                            <p>{item.firstName}</p>
                                            <p className="text-xs text-muted">
                                              @{item.username ?? "no_username"}
                                            </p>
                                          </td>
                                          <td className="px-3 py-2">
                                            <span
                                              className={cn(
                                                "rounded-full border px-2 py-1 text-xs font-semibold",
                                                statusPillClass(item.status),
                                              )}
                                            >
                                              {item.status}
                                            </span>
                                          </td>
                                          <td className="px-3 py-2 text-main">
                                            {item.metadata?.language ?? "-"}
                                          </td>
                                          <td className="px-3 py-2 text-main">
                                            {item.metadata?.pageCount ?? "-"}
                                          </td>
                                          <td className="px-3 py-2 text-main">
                                            {formatDate(item.createdAt)}
                                          </td>
                                          <td className="px-3 py-2 text-main">
                                            <div className="flex items-center gap-2">
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setSelectedPresentation(item);
                                                }}
                                                aria-label={`View presentation #${item.id}`}
                                                title="View presentation"
                                                className="inline-flex size-7 items-center justify-center rounded-lg border border-[var(--surface-border)] bg-[var(--surface-2)] text-main"
                                              >
                                                <Eye
                                                  className="size-3.5"
                                                  aria-hidden="true"
                                                />
                                                <span className="sr-only">
                                                  View presentation
                                                </span>
                                              </button>

                                              {item.status === "pending" ? (
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    void handleFailPresentation(
                                                      item.id,
                                                    );
                                                  }}
                                                  aria-label="Force fail"
                                                  title="Force fail"
                                                  className="inline-flex size-7 items-center justify-center rounded-lg border border-rose-300 bg-rose-100 text-rose-700"
                                                >
                                                  <XCircle
                                                    className="size-3.5"
                                                    aria-hidden="true"
                                                  />
                                                  <span className="sr-only">
                                                    Force fail
                                                  </span>
                                                </button>
                                              ) : null}
                                            </div>
                                          </td>
                                        </tr>
                                      ))}
                                </tbody>
                              </table>
                            </div>

                            {!isPresentationsLoading &&
                            presentations.length === 0 ? (
                              <p className="px-3 py-5 text-sm text-muted">
                                No presentations found for selected filter.
                              </p>
                            ) : null}

                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-muted">
                              <p>
                                Page {presentationsPage} -{" "}
                                {presentations.length} shown of{" "}
                                {presentationsTotalCount}
                              </p>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    void fetchPresentationsPreviousPage();
                                  }}
                                  disabled={
                                    isPresentationsLoading ||
                                    presentationsPage <= 1
                                  }
                                  className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-1)] px-2 py-1 text-main disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Prev
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void fetchPresentationsNextPage();
                                  }}
                                  disabled={
                                    isPresentationsLoading ||
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
                      </section>
                    ) : null}

                    {activeSection === "broadcast" ? (
                      <section>
                        <article className="surface-glass rounded-3xl p-5">
                          <h3 className="text-lg font-semibold text-main">
                            Broadcast
                          </h3>
                          <p className="text-sm text-muted">
                            POST /admin/broadcast and GET /admin/broadcasts for
                            delivery history
                          </p>

                          <div className="mt-4 grid gap-4 xl:grid-cols-2">
                            <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-2)] p-4">
                              <p className="text-xs font-semibold tracking-wide text-main uppercase">
                                Broadcast field
                              </p>

                              <form
                                className="mt-3 space-y-3"
                                onSubmit={handleBroadcast}
                              >
                                <textarea
                                  value={broadcastMessage}
                                  onChange={(event) => {
                                    setBroadcastMessage(event.target.value);
                                  }}
                                  rows={5}
                                  maxLength={broadcastImageFile ? 1024 : 4096}
                                  placeholder="Hello everyone! New templates are now available."
                                  className="w-full resize-y rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-main outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                                  required
                                />

                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-xs text-muted">
                                    {broadcastMessage.length}/
                                    {broadcastImageFile ? 1024 : 4096}
                                  </p>

                                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-1)] px-3 py-2 text-xs font-medium text-main">
                                    Attach image
                                    <input
                                      ref={broadcastImageInputRef}
                                      type="file"
                                      accept="image/png,image/jpeg,image/webp,image/gif"
                                      className="sr-only"
                                      onChange={handleBroadcastImageChange}
                                    />
                                  </label>
                                </div>

                                {broadcastImageFile && broadcastImagePreviewUrl ? (
                                  <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-1)] p-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="text-sm font-medium text-main">
                                          {broadcastImageFile.name}
                                        </p>
                                        <p className="text-xs text-muted">
                                          {(broadcastImageFile.size / 1024).toFixed(
                                            1,
                                          )}{" "}
                                          KB
                                        </p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={clearBroadcastImage}
                                        className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-2)] px-2 py-1 text-xs text-main"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                    <img
                                      src={broadcastImagePreviewUrl}
                                      alt="Broadcast attachment preview"
                                      className="mt-3 max-h-52 w-full rounded-xl border border-[var(--surface-border)] object-cover"
                                    />
                                  </div>
                                ) : null}

                                <div className="flex justify-end">
                                  <button
                                    type="submit"
                                    aria-label="Send broadcast"
                                    title="Send broadcast"
                                    disabled={isBroadcastSending}
                                    className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] px-3 text-main disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {isBroadcastSending ? (
                                      <Loader2
                                        className="size-4 animate-spin"
                                        aria-hidden="true"
                                      />
                                    ) : (
                                      <Send
                                        className="size-4"
                                        aria-hidden="true"
                                      />
                                    )}
                                    <span className="text-xs font-medium">
                                      Send
                                    </span>
                                  </button>
                                </div>
                              </form>

                              {broadcastResult ? (
                                <div className="mt-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-1)] p-3 text-sm text-main">
                                  Recipients:{" "}
                                  <span className="font-semibold">
                                    {broadcastResult.recipients}
                                  </span>
                                  , sent:{" "}
                                  <span className="font-semibold">
                                    {broadcastResult.sent}
                                  </span>
                                  , failed:{" "}
                                  <span className="font-semibold">
                                    {broadcastResult.failed}
                                  </span>
                                </div>
                              ) : null}
                            </div>

                            <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-2)] p-4">
                              <p className="text-xs font-semibold tracking-wide text-main uppercase">
                                Broadcasted messages
                              </p>

                              <div className="mt-3 max-h-[30rem] space-y-3 overflow-y-auto pr-1">
                                {isBroadcastHistoryLoading ? (
                                  Array.from({ length: 3 }).map((_, index) => (
                                    <div
                                      key={`broadcast-history-skeleton-${index}`}
                                      className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-1)] p-3"
                                    >
                                      <SkeletonBlock className="h-3 w-28" />
                                      <SkeletonBlock className="mt-2 h-4 w-full" />
                                      <SkeletonBlock className="mt-3 h-20 w-full rounded-xl" />
                                    </div>
                                  ))
                                ) : broadcastHistory.length === 0 ? (
                                  <p className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-1)] px-3 py-4 text-sm text-muted">
                                    No broadcast messages yet.
                                  </p>
                                ) : (
                                  broadcastHistory.map((item) => (
                                    <article
                                      key={item.id}
                                      className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-1)] p-3"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-xs text-muted">
                                          {formatDate(item.createdAt)}
                                        </p>
                                        <p className="text-xs text-muted">
                                          by{" "}
                                          {item.adminUsername
                                            ? `@${item.adminUsername}`
                                            : item.adminName ?? "Unknown admin"}
                                        </p>
                                      </div>

                                      <p className="mt-2 text-sm text-main whitespace-pre-wrap">
                                        {item.message}
                                      </p>

                                      {item.imageDataUrl ? (
                                        <img
                                          src={item.imageDataUrl}
                                          alt={
                                            item.imageFileName
                                              ? `Attachment ${item.imageFileName}`
                                              : "Broadcast attachment"
                                          }
                                          className="mt-3 max-h-56 w-full rounded-xl border border-[var(--surface-border)] object-cover"
                                        />
                                      ) : null}

                                      <p className="mt-3 text-xs text-muted">
                                        Recipients: {item.recipients}, sent: {" "}
                                        {item.sent}, failed: {item.failed}
                                      </p>
                                    </article>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        </article>
                      </section>
                    ) : null}

                    {activeSection === "admins" ? (
                      <section>
                        <article className="surface-glass rounded-3xl p-5">
                          <h3 className="text-lg font-semibold text-main">
                            Admins
                          </h3>
                          <p className="text-sm text-muted">
                            GET /admin/admins, POST /admin/admins (SUPERADMIN
                            only)
                          </p>

                          <div className="mt-4 grid gap-4 lg:grid-cols-2">
                            <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-2)] p-3">
                              <p className="text-xs font-semibold tracking-wide text-main uppercase">
                                Admin list
                              </p>
                              <div className="mt-3 space-y-2">
                                {showAdminsSkeleton ? (
                                  Array.from({ length: 3 }).map((_, index) => (
                                    <div
                                      key={`admins-skeleton-${index}`}
                                      className="flex items-center justify-between rounded-xl border border-[var(--surface-border)] bg-[var(--surface-1)] px-3 py-2"
                                    >
                                      <div>
                                        <SkeletonBlock className="h-4 w-28" />
                                        <SkeletonBlock className="mt-2 h-3 w-20" />
                                      </div>
                                      <SkeletonBlock className="h-6 w-20 rounded-full" />
                                    </div>
                                  ))
                                ) : admins.length === 0 ? (
                                  <p className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-muted">
                                    No admins found.
                                  </p>
                                ) : (
                                  admins.map((admin) => (
                                    <div
                                      key={admin.id}
                                      className="flex items-center justify-between rounded-xl border border-[var(--surface-border)] bg-[var(--surface-1)] px-3 py-2"
                                    >
                                      <div>
                                        <p className="text-sm font-medium text-main">
                                          {admin.name}
                                        </p>
                                        <p className="text-xs text-muted">
                                          @{admin.username}
                                        </p>
                                      </div>
                                      <span className="rounded-full border border-[var(--surface-border)] bg-[var(--surface-3)] px-2 py-1 text-xs font-semibold text-main">
                                        {admin.role}
                                      </span>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>

                            <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-2)] p-3">
                              <p className="text-xs font-semibold tracking-wide text-main uppercase">
                                Create admin
                              </p>
                              {profile?.role === "SUPERADMIN" ? (
                                <form
                                  className="mt-3 grid gap-2 sm:grid-cols-2"
                                  onSubmit={handleCreateAdmin}
                                >
                                  <input
                                    value={adminName}
                                    onChange={(event) => {
                                      setAdminName(event.target.value);
                                    }}
                                    placeholder="Name"
                                    className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-main outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                                    required
                                  />

                                  <input
                                    value={adminUsername}
                                    onChange={(event) => {
                                      setAdminUsername(event.target.value);
                                    }}
                                    placeholder="Username"
                                    className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-main outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                                    required
                                  />

                                  <input
                                    value={adminPassword}
                                    onChange={(event) => {
                                      setAdminPassword(event.target.value);
                                    }}
                                    placeholder="Password"
                                    type="password"
                                    className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-main outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                                    required
                                  />

                                  <select
                                    value={adminRole}
                                    onChange={(event) => {
                                      setAdminRole(
                                        event.target.value as AdminRole,
                                      );
                                    }}
                                    className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-main outline-none focus:border-[var(--accent)]"
                                  >
                                    <option value="ADMIN">ADMIN</option>
                                    <option value="SUPERADMIN">
                                      SUPERADMIN
                                    </option>
                                  </select>

                                  <button
                                    type="submit"
                                    aria-label="Create admin"
                                    title="Create admin"
                                    className="sm:col-span-2 inline-flex items-center justify-center rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-main"
                                  >
                                    <UserPlus
                                      className="size-4"
                                      aria-hidden="true"
                                    />
                                    <span className="sr-only">
                                      Create admin
                                    </span>
                                  </button>
                                </form>
                              ) : (
                                <p className="mt-3 text-sm text-muted">
                                  Create/update/delete admin actions require
                                  SUPERADMIN role.
                                </p>
                              )}
                            </div>
                          </div>
                        </article>
                      </section>
                    ) : null}
                  </div>
                </>
              )}

              {selectedPresentation ? (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
                  onClick={() => {
                    setSelectedPresentation(null);
                  }}
                >
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Presentation #${selectedPresentation.id}`}
                    className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-1)] shadow-2xl"
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <div className="flex items-center justify-between border-b border-[var(--surface-border)] bg-[var(--surface-2)] px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-main">
                          Presentation #{selectedPresentation.id}
                        </p>
                        <p className="text-xs text-muted">
                          {selectedPresentation.status} -{" "}
                          {formatDate(selectedPresentation.createdAt)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPresentation(null);
                        }}
                        className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-semibold text-main"
                      >
                        Close
                      </button>
                    </div>

                    <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
                      <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] p-3 text-sm text-main">
                        <p>
                          User:{" "}
                          <span className="font-semibold">
                            {selectedPresentation.firstName}
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          @{selectedPresentation.username ?? "no_username"} -
                          Telegram ID: {selectedPresentation.telegramId}
                        </p>
                      </div>

                      <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] p-3">
                        <p className="text-xs font-semibold tracking-wide text-main uppercase">
                          Prompt
                        </p>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-main">
                          {selectedPresentation.metadata?.prompt ??
                            "Untitled prompt"}
                        </p>
                      </div>

                      <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] p-3 text-sm text-main">
                        <p>
                          Language:{" "}
                          {selectedPresentation.metadata?.language ?? "-"}
                        </p>
                        <p className="mt-1">
                          Slides:{" "}
                          {selectedPresentation.metadata?.pageCount ?? "-"}
                        </p>
                        <p className="mt-1">
                          Uses images:{" "}
                          {selectedPresentation.metadata?.useImages
                            ? "Yes"
                            : "No"}
                        </p>
                        <p className="mt-1 break-all">
                          File: {selectedPresentation.metadata?.fileName ?? "-"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
