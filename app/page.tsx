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
  Bold,
  Code2,
  Download,
  Eye,
  EyeOff,
  Italic,
  KeyRound,
  Link2,
  Loader2,
  LogOut,
  Pencil,
  RefreshCw,
  Save,
  Send,
  Trash2,
  UserPlus,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { BentoCard, BentoGrid } from "@/components/ui/bento-grid";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { AvatarCircles } from "@/components/ui/avatar-circles";
import { NumberTicker } from "@/components/ui/number-ticker";
import { ShineBorder } from "@/components/ui/shine-border";
import { cn } from "@/lib/utils";

type ThemeMode = "light" | "dark";
type AdminRole = "ADMIN" | "SUPERADMIN";
type PresentationStatus = "pending" | "completed" | "failed";
type PresentationStatusFilter = PresentationStatus | "all";
type SortOrder = "asc" | "desc";
type UserRegistrationFilter = "all" | "registered" | "unregistered";
type PresentationLanguageFilter = "all" | "uz" | "ru" | "en";
type JoinedUsersRange = "90d" | "60d" | "30d" | "15d" | "7d" | "1d";

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
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  profileImageUrl: string | null;
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
  fileSizeKb?: number;
  storageKey?: string;
  downloadUrl?: string;
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
  geminiModel: string;
  geminiImageModel: string;
  geminiModelSuggestions: string[];
  geminiImageModelSuggestions: string[];
}

interface SystemPromptResponse {
  id: number;
  key: string;
  title: string;
  description: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

type RuntimeModelField = "geminiModel" | "geminiImageModel";

type UserProfileSyncJobStatus = "queued" | "running" | "completed" | "failed";

interface SyncUserProfileImagesResponse {
  id: number;
  status: UserProfileSyncJobStatus;
  totalUsers: number;
  processed: number;
  profileFieldsUpdated: number;
  updated: number;
  unchanged: number;
  removed: number;
  noPhoto: number;
  skippedRecentlyChecked: number;
  skippedConfigMissing: number;
  skippedInactive: number;
  deactivated: number;
  failed: number;
  progressPercent: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
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

interface UserJoinedDateRow {
  createdAt: string;
}

interface PresentationCreatedDateRow {
  createdAt: string;
}

interface DailyJoinedUsersPoint {
  dateKey: string;
  label: string;
  count: number;
}

interface DailyJoinedUsersChartPoint extends DailyJoinedUsersPoint {
  x: number;
  y: number;
}

interface ApiError {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

const API_PROXY_PREFIX = "/backend";
const THEME_STORAGE_KEY = "admin-panel-theme";
const SESSION_STORAGE_KEY = "admin-panel-session";
const STATS_CACHE_STORAGE_KEY = "admin-panel-stats-cache";
const MAIN_THEME_PROMPT_LIMIT_MIN = 10;
const MAIN_THEME_PROMPT_LIMIT_MAX = 4096;
const FREE_PRESENTATION_GENERATION_LIMIT_MIN = 1;
const FREE_PRESENTATION_GENERATION_LIMIT_MAX = 100;
const RUNTIME_MODEL_NAME_MAX_LENGTH = 120;
const BROADCAST_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const BROADCAST_LINK_PLACEHOLDER_TEXT = "link text";
const BROADCAST_LINK_PLACEHOLDER_URL = "https://example.com";
const BROADCAST_HISTORY_PAGE_SIZE = 20;
const DAILY_JOINED_USERS_CHART_WIDTH = 100;
const DAILY_JOINED_USERS_CHART_HEIGHT = 46;
const DAILY_JOINED_USERS_CHART_PADDING_X = 2.5;
const DAILY_JOINED_USERS_CHART_PADDING_TOP = 3;
const DAILY_JOINED_USERS_CHART_PADDING_BOTTOM = 4.5;
const JOINED_USERS_RANGE_OPTIONS: Array<{
  value: JoinedUsersRange;
  label: string;
}> = [
  { value: "90d", label: "90 days" },
  { value: "60d", label: "60 days" },
  { value: "30d", label: "30 days" },
  { value: "15d", label: "15 days" },
  { value: "7d", label: "7 days" },
  { value: "1d", label: "1 day (today, hourly)" },
];
const BROADCAST_FORMATTED_TEXT_CLASS =
  "text-sm leading-6 text-main break-words [&_a]:font-medium [&_a]:text-[var(--accent)] [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:opacity-85 [&_b]:font-semibold [&_i]:italic [&_code]:rounded-md [&_code]:border [&_code]:border-[var(--surface-border)] [&_code]:bg-[var(--surface-2)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_s]:opacity-80 [&_tg-spoiler]:rounded [&_tg-spoiler]:bg-[var(--surface-3)] [&_tg-spoiler]:px-1.5 [&_tg-spoiler]:text-transparent hover:[&_tg-spoiler]:text-main";
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

function escapeBroadcastHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeBroadcastLinkUrl(urlRaw: string): string | null {
  const normalized = urlRaw.trim();

  if (!normalized || normalized.length > 2048) {
    return null;
  }

  if (!/^https?:\/\//i.test(normalized)) {
    return null;
  }

  try {
    const parsed = new URL(normalized);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function formatBroadcastMessageToHtml(messageRaw: string): string {
  const formattedFragments: string[] = [];
  const stash = (html: string): string => {
    const index = formattedFragments.length;
    formattedFragments.push(html);
    return `\u0000FMT${index}\u0000`;
  };

  let working = messageRaw;

  working = working.replace(/`([^`\r\n]+)`/g, (_match, code: string) =>
    stash(`<code>${escapeBroadcastHtml(code)}</code>`),
  );

  working = working.replace(
    /\[([^\]\r\n]{1,256})\]\(([^)\r\n]{1,2048})\)/g,
    (match, label: string, urlRaw: string) => {
      const normalizedUrl = normalizeBroadcastLinkUrl(urlRaw);

      if (!normalizedUrl) {
        return match;
      }

      return stash(
        `<a href="${escapeBroadcastHtml(normalizedUrl)}" target="_blank" rel="noreferrer noopener">${escapeBroadcastHtml(label)}</a>`,
      );
    },
  );

  working = working.replace(
    /\*\*([^*\r\n][^*\r\n]*?)\*\*/g,
    (_match, value: string) => stash(`<b>${escapeBroadcastHtml(value)}</b>`),
  );

  working = working.replace(/__([^_\r\n][^_\r\n]*?)__/g, (_match, value) =>
    stash(`<i>${escapeBroadcastHtml(value)}</i>`),
  );

  working = working.replace(
    /(^|[\s([{>])_([^_\r\n][^_\r\n]*?)_(?=$|[\s)\]}.!,?:;<])/g,
    (_match, prefix: string, value: string) =>
      `${prefix}${stash(`<i>${escapeBroadcastHtml(value)}</i>`)}`,
  );

  working = working.replace(
    /~~([^~\r\n][^~\r\n]*?)~~/g,
    (_match, value: string) => stash(`<s>${escapeBroadcastHtml(value)}</s>`),
  );

  working = working.replace(
    /\|\|([^|\r\n][^|\r\n]*?)\|\|/g,
    (_match, value: string) =>
      stash(`<tg-spoiler>${escapeBroadcastHtml(value)}</tg-spoiler>`),
  );

  const escaped = escapeBroadcastHtml(working).replace(/\r?\n/g, "<br />");

  return escaped.replace(
    /\u0000FMT(\d+)\u0000/g,
    (_match, indexRaw: string) => {
      const index = Number.parseInt(indexRaw, 10);
      return formattedFragments[index] ?? "";
    },
  );
}

function hasExistingBroadcastFormatting(
  messageRaw: string,
  selectionStart: number,
  selectionEnd: number,
): boolean {
  if (selectionStart >= selectionEnd) {
    return false;
  }

  const ranges: Array<{ start: number; end: number }> = [];

  const pushRange = (start: number, end: number) => {
    if (start < end) {
      ranges.push({ start, end });
    }
  };

  const collect = (
    pattern: RegExp,
    startResolver: (match: RegExpExecArray) => number,
    endResolver: (match: RegExpExecArray) => number,
  ) => {
    pattern.lastIndex = 0;

    while (true) {
      const match = pattern.exec(messageRaw);

      if (!match) {
        break;
      }

      pushRange(startResolver(match), endResolver(match));

      if (pattern.lastIndex === match.index) {
        pattern.lastIndex += 1;
      }
    }
  };

  collect(
    /`([^`\r\n]+)`/g,
    (match) => match.index + 1,
    (match) => {
      return match.index + match[0].length - 1;
    },
  );

  collect(
    /\*\*([^*\r\n][^*\r\n]*?)\*\*/g,
    (match) => {
      return match.index + 2;
    },
    (match) => {
      return match.index + match[0].length - 2;
    },
  );

  collect(
    /__([^_\r\n][^_\r\n]*?)__/g,
    (match) => match.index + 2,
    (match) => {
      return match.index + match[0].length - 2;
    },
  );

  collect(
    /(^|[\s([{>])_([^_\r\n][^_\r\n]*?)_(?=$|[\s)\]}.!,?:;<])/g,
    (match) => {
      const prefix = match[1] ?? "";
      return match.index + prefix.length + 1;
    },
    (match) => {
      const prefix = match[1] ?? "";
      const value = match[2] ?? "";
      return match.index + prefix.length + 1 + value.length;
    },
  );

  collect(
    /~~([^~\r\n][^~\r\n]*?)~~/g,
    (match) => match.index + 2,
    (match) => {
      return match.index + match[0].length - 2;
    },
  );

  collect(
    /\|\|([^|\r\n][^|\r\n]*?)\|\|/g,
    (match) => {
      return match.index + 2;
    },
    (match) => {
      return match.index + match[0].length - 2;
    },
  );

  collect(
    /\[([^\]\r\n]{1,256})\]\(([^)\r\n]{1,2048})\)/g,
    (match) => {
      return match.index + 1;
    },
    (match) => {
      const label = match[1] ?? "";
      return match.index + 1 + label.length;
    },
  );

  return ranges.some(
    (range) => selectionStart >= range.start && selectionEnd <= range.end,
  );
}

function hasInvalidBroadcastLinks(messageRaw: string): boolean {
  const linkPattern = /\[([^\]\r\n]{1,256})\]\(([^)\r\n]{1,2048})\)/g;

  while (true) {
    const match = linkPattern.exec(messageRaw);

    if (!match) {
      return false;
    }

    const urlRaw = match[2] ?? "";
    if (!normalizeBroadcastLinkUrl(urlRaw)) {
      return true;
    }

    if (linkPattern.lastIndex === match.index) {
      linkPattern.lastIndex += 1;
    }
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

function formatFileSizeMb(fileSizeKb: number | null | undefined): string {
  if (typeof fileSizeKb !== "number" || !Number.isFinite(fileSizeKb)) {
    return "-";
  }

  const fileSizeMb = fileSizeKb / 1024;

  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(fileSizeMb)} MB`;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middleIndex = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middleIndex - 1] + sorted[middleIndex]) / 2;
  }

  return sorted[middleIndex];
}

function normalizeRuntimeModelSuggestions(
  rawSuggestions: string[] | undefined,
): string[] {
  const normalizedSuggestions: string[] = [];
  const seen = new Set<string>();

  for (const rawSuggestion of rawSuggestions ?? []) {
    const suggestion = rawSuggestion.trim();

    if (!suggestion || suggestion.length > RUNTIME_MODEL_NAME_MAX_LENGTH) {
      continue;
    }

    const key = suggestion.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalizedSuggestions.push(suggestion);
  }

  return normalizedSuggestions;
}

function getPendingRecipientsCount(
  recipients: number,
  sent: number,
  failed: number,
): number {
  return Math.max(
    toNonNegative(recipients) - toNonNegative(sent) - toNonNegative(failed),
    0,
  );
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
  const [joinedUserDates, setJoinedUserDates] = useState<UserJoinedDateRow[]>(
    [],
  );
  const [presentationCreatedDates, setPresentationCreatedDates] = useState<
    PresentationCreatedDateRow[]
  >([]);
  const [joinedUsersRange, setJoinedUsersRange] =
    useState<JoinedUsersRange>("30d");
  const [hasLoadedJoinedUserDates, setHasLoadedJoinedUserDates] =
    useState(false);
  const [
    hasLoadedPresentationCreatedDates,
    setHasLoadedPresentationCreatedDates,
  ] = useState(false);
  const [cachedStatistics, setCachedStatistics] =
    useState<CachedStatistics | null>(null);
  const [presentations, setPresentations] = useState<PresentationRow[]>([]);
  const [selectedPresentation, setSelectedPresentation] =
    useState<PresentationRow | null>(null);
  const [admins, setAdmins] = useState<AdminProfile[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [isSyncingUserProfileImages, setIsSyncingUserProfileImages] =
    useState(false);
  const [profileSyncJob, setProfileSyncJob] =
    useState<SyncUserProfileImagesResponse | null>(null);
  const [isPresentationsLoading, setIsPresentationsLoading] = useState(true);
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);
  const [isAdminsLoading, setIsAdminsLoading] = useState(true);

  const [userSearch, setUserSearch] = useState("");
  const [debouncedUserSearch, setDebouncedUserSearch] = useState("");
  const [userRegistrationFilter, setUserRegistrationFilter] =
    useState<UserRegistrationFilter>("all");
  const [userSortOrder, setUserSortOrder] = useState<SortOrder>("desc");
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
  const [presentationLanguage, setPresentationLanguage] =
    useState<PresentationLanguageFilter>("all");
  const [presentationSortOrder, setPresentationSortOrder] =
    useState<SortOrder>("desc");
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
  const [broadcastTotalCount, setBroadcastTotalCount] = useState(0);
  const [broadcastPage, setBroadcastPage] = useState(1);
  const [broadcastAfterHistory, setBroadcastAfterHistory] = useState<
    Array<string | null>
  >([null]);
  const [broadcastPageInfo, setBroadcastPageInfo] =
    useState<ConnectionPageInfo>(EMPTY_CONNECTION_PAGE_INFO);
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
  const [geminiModelInput, setGeminiModelInput] = useState("");
  const [geminiImageModelInput, setGeminiImageModelInput] = useState("");
  const [activeRuntimeModelField, setActiveRuntimeModelField] =
    useState<RuntimeModelField | null>(null);
  const [isSavingRuntimeSettings, setIsSavingRuntimeSettings] = useState(false);
  const [systemPrompts, setSystemPrompts] = useState<SystemPromptResponse[]>(
    [],
  );
  const [systemPromptInputs, setSystemPromptInputs] = useState<
    Record<string, string>
  >({});
  const [isSystemPromptsLoading, setIsSystemPromptsLoading] = useState(true);
  const [savingSystemPromptKey, setSavingSystemPromptKey] = useState<
    string | null
  >(null);

  const [adminName, setAdminName] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminRole, setAdminRole] = useState<AdminRole>("ADMIN");
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);
  const [editingAdminId, setEditingAdminId] = useState<number | null>(null);
  const [editingAdminName, setEditingAdminName] = useState("");
  const [editingAdminUsername, setEditingAdminUsername] = useState("");
  const [editingAdminPassword, setEditingAdminPassword] = useState("");
  const [editingAdminRole, setEditingAdminRole] = useState<AdminRole>("ADMIN");
  const [isUpdatingAdmin, setIsUpdatingAdmin] = useState(false);
  const [deletingAdminId, setDeletingAdminId] = useState<number | null>(null);
  const [adminPendingDelete, setAdminPendingDelete] =
    useState<AdminProfile | null>(null);
  const [adminPendingPasswordUpdate, setAdminPendingPasswordUpdate] =
    useState<AdminProfile | null>(null);
  const [adminPasswordUpdateInput, setAdminPasswordUpdateInput] = useState("");
  const [updatingPasswordAdminId, setUpdatingPasswordAdminId] = useState<
    number | null
  >(null);
  const [ownAdminName, setOwnAdminName] = useState("");
  const [ownAdminUsername, setOwnAdminUsername] = useState("");
  const [ownAdminPassword, setOwnAdminPassword] = useState("");
  const [isUpdatingOwnAdmin, setIsUpdatingOwnAdmin] = useState(false);

  const usersRequestVersionRef = useRef(0);
  const joinedUserDatesRequestVersionRef = useRef(0);
  const presentationCreatedDatesRequestVersionRef = useRef(0);
  const presentationsRequestVersionRef = useRef(0);
  const broadcastRequestVersionRef = useRef(0);
  const profileSyncRequestInFlightRef = useRef(false);
  const profileSyncCompletionToastJobIdRef = useRef<number | null>(null);
  const profileSyncWasRunningRef = useRef(false);
  const lastDashboardPathRef = useRef<string | null>(null);
  const broadcastMessageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const broadcastImageInputRef = useRef<HTMLInputElement | null>(null);

  const currentAdminRole = profile?.role ?? session?.admin.role ?? null;
  const isSuperAdmin = currentAdminRole === "SUPERADMIN";

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
          throw new Error("Sign in first to access protected resources.");
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

  const syncAuthenticatedAdmin = useCallback((admin: AdminProfile) => {
    setProfile(admin);
    setSession((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        admin,
      };
    });
  }, []);

  const fetchMe = useCallback(async () => {
    const data = await apiRequest<AdminProfile>("/admin/auth/me");
    syncAuthenticatedAdmin(data);
  }, [apiRequest, syncAuthenticatedAdmin]);

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

        if (userRegistrationFilter !== "all") {
          query.set("registration", userRegistrationFilter);
        }

        query.set("sortOrder", userSortOrder);

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
    [
      apiRequest,
      debouncedUserSearch,
      userLimit,
      userRegistrationFilter,
      userSortOrder,
    ],
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

  const fetchLatestProfileSyncJob = useCallback(async () => {
    const data = await apiRequest<SyncUserProfileImagesResponse | null>(
      "/admin/users/profile-images/sync/latest",
    );

    setProfileSyncJob(data);

    if (!data) {
      setIsSyncingUserProfileImages(false);
      profileSyncWasRunningRef.current = false;
      return null;
    }

    const running = data.status === "queued" || data.status === "running";
    setIsSyncingUserProfileImages(running);

    return data;
  }, [apiRequest]);

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

  const fetchJoinedUserDates = useCallback(async () => {
    const requestVersion = ++joinedUserDatesRequestVersionRef.current;

    try {
      const data = await apiRequest<UserJoinedDateRow[]>(
        "/admin/users/joined-dates",
      );

      if (requestVersion !== joinedUserDatesRequestVersionRef.current) {
        return;
      }

      setJoinedUserDates(Array.isArray(data) ? data : []);
      setHasLoadedJoinedUserDates(true);
    } catch (error) {
      if (requestVersion === joinedUserDatesRequestVersionRef.current) {
        setHasLoadedJoinedUserDates(true);
      }

      throw error;
    }
  }, [apiRequest]);

  const fetchPresentationCreatedDates = useCallback(async () => {
    const requestVersion = ++presentationCreatedDatesRequestVersionRef.current;

    try {
      const data = await apiRequest<PresentationCreatedDateRow[]>(
        "/admin/presentations/created-dates",
      );

      if (
        requestVersion !== presentationCreatedDatesRequestVersionRef.current
      ) {
        return;
      }

      setPresentationCreatedDates(Array.isArray(data) ? data : []);
      setHasLoadedPresentationCreatedDates(true);
    } catch (error) {
      if (
        requestVersion === presentationCreatedDatesRequestVersionRef.current
      ) {
        setHasLoadedPresentationCreatedDates(true);
      }

      throw error;
    }
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

        if (presentationLanguage !== "all") {
          query.set("language", presentationLanguage);
        }

        query.set("sortOrder", presentationSortOrder);

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
    [
      apiRequest,
      presentationLanguage,
      presentationLimit,
      presentationSortOrder,
      presentationStatus,
    ],
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
      setGeminiModelInput(data.geminiModel);
      setGeminiImageModelInput(data.geminiImageModel);
      setActiveRuntimeModelField(null);
    } finally {
      setIsSettingsLoading(false);
    }
  }, [apiRequest]);

  const fetchSystemPrompts = useCallback(async () => {
    setIsSystemPromptsLoading(true);

    try {
      const data = await apiRequest<SystemPromptResponse[]>(
        "/admin/system-prompts",
      );

      setSystemPrompts(data);
      setSystemPromptInputs(
        Object.fromEntries(data.map((prompt) => [prompt.key, prompt.content])),
      );
    } catch (error) {
      setSystemPrompts([]);
      setSystemPromptInputs({});
      toast.error(toErrorMessage(error));
    } finally {
      setIsSystemPromptsLoading(false);
    }
  }, [apiRequest]);

  const fetchAdmins = useCallback(async () => {
    if (currentAdminRole !== "SUPERADMIN") {
      setAdmins([]);
      setIsAdminsLoading(false);
      return;
    }

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
  }, [apiRequest, currentAdminRole]);

  const fetchBroadcastPage = useCallback(
    async ({
      after = null,
      page = 1,
    }: {
      after?: string | null;
      page?: number;
    } = {}) => {
      setIsBroadcastHistoryLoading(true);
      const requestVersion = ++broadcastRequestVersionRef.current;

      try {
        const query = new URLSearchParams();
        query.set("first", `${BROADCAST_HISTORY_PAGE_SIZE}`);

        if (after) {
          query.set("after", after);
        }

        const data = await apiRequest<ConnectionResponse<BroadcastHistoryItem>>(
          `/admin/broadcasts?${query.toString()}`,
        );

        if (requestVersion !== broadcastRequestVersionRef.current) {
          return;
        }

        setBroadcastHistory(data.nodes);
        setBroadcastTotalCount(data.totalCount);
        setBroadcastPageInfo(data.pageInfo ?? EMPTY_CONNECTION_PAGE_INFO);
        setBroadcastPage(Math.max(1, page));
      } catch (error) {
        if (requestVersion !== broadcastRequestVersionRef.current) {
          return;
        }

        setBroadcastHistory([]);
        setBroadcastTotalCount(0);
        setBroadcastPageInfo(EMPTY_CONNECTION_PAGE_INFO);
        toast.error(toErrorMessage(error));
      } finally {
        if (requestVersion === broadcastRequestVersionRef.current) {
          setIsBroadcastHistoryLoading(false);
        }
      }
    },
    [apiRequest],
  );

  const fetchBroadcastFirstPage = useCallback(async () => {
    setBroadcastPage(1);
    setBroadcastAfterHistory([null]);
    setBroadcastPageInfo(EMPTY_CONNECTION_PAGE_INFO);

    await fetchBroadcastPage({ page: 1, after: null });
  }, [fetchBroadcastPage]);

  const fetchBroadcastCurrentPage = useCallback(async () => {
    const after = broadcastAfterHistory[broadcastPage - 1] ?? null;
    await fetchBroadcastPage({ page: broadcastPage, after });
  }, [broadcastAfterHistory, broadcastPage, fetchBroadcastPage]);

  const fetchBroadcastNextPage = useCallback(async () => {
    if (!broadcastPageInfo.hasNextPage || !broadcastPageInfo.endCursor) {
      return;
    }

    const nextPage = broadcastPage + 1;
    const nextAfter = broadcastPageInfo.endCursor;

    setBroadcastAfterHistory((previous) => {
      const trimmed = previous.slice(0, broadcastPage);
      return [...trimmed, nextAfter];
    });

    await fetchBroadcastPage({ page: nextPage, after: nextAfter });
  }, [
    broadcastPage,
    broadcastPageInfo.endCursor,
    broadcastPageInfo.hasNextPage,
    fetchBroadcastPage,
  ]);

  const fetchBroadcastPreviousPage = useCallback(async () => {
    if (broadcastPage <= 1) {
      return;
    }

    const previousPage = broadcastPage - 1;
    const previousAfter = broadcastAfterHistory[previousPage - 1] ?? null;

    setBroadcastAfterHistory((previous) => previous.slice(0, previousPage));

    await fetchBroadcastPage({ page: previousPage, after: previousAfter });
  }, [broadcastAfterHistory, broadcastPage, fetchBroadcastPage]);

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
      fetchJoinedUserDates(),
      fetchPresentationCreatedDates(),
      presentationFetchTask,
      ...(pathname.startsWith("/settings")
        ? [fetchRuntimeSettings(), fetchSystemPrompts()]
        : []),
      ...(pathname.startsWith("/users") ? [fetchUsersCurrentPage()] : []),
      ...(pathname.startsWith("/users") ? [fetchLatestProfileSyncJob()] : []),
      ...(pathname.startsWith("/admins") && currentAdminRole === "SUPERADMIN"
        ? [fetchAdmins()]
        : []),
      ...(pathname.startsWith("/broadcast")
        ? [fetchBroadcastCurrentPage()]
        : []),
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
    fetchJoinedUserDates,
    fetchPresentationCreatedDates,
    fetchBroadcastCurrentPage,
    fetchPresentationsCurrentPage,
    fetchPresentationsFirstPage,
    fetchRuntimeSettings,
    fetchSystemPrompts,
    fetchUsersCurrentPage,
    fetchLatestProfileSyncJob,
    currentAdminRole,
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
    if (!adminPendingDelete) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && deletingAdminId !== adminPendingDelete.id) {
        setAdminPendingDelete(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [adminPendingDelete, deletingAdminId]);

  useEffect(() => {
    if (!adminPendingPasswordUpdate) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        updatingPasswordAdminId !== adminPendingPasswordUpdate.id
      ) {
        setAdminPendingPasswordUpdate(null);
        setAdminPasswordUpdateInput("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [adminPendingPasswordUpdate, updatingPasswordAdminId]);

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
    if (!profile) {
      return;
    }

    setOwnAdminName(profile.name);
    setOwnAdminUsername(profile.username);
  }, [profile]);

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
    userRegistrationFilter,
    userLimit,
    userSortOrder,
    debouncedUserSearch,
  ]);

  useEffect(() => {
    if (
      !isHydrated ||
      !session?.accessToken ||
      !pathname.startsWith("/users")
    ) {
      return;
    }

    let disposed = false;

    const pollLatestProfileSyncJob = async () => {
      try {
        const latestJob = await fetchLatestProfileSyncJob();

        if (disposed || !latestJob) {
          return;
        }

        const isRunning =
          latestJob.status === "queued" || latestJob.status === "running";

        if (isRunning) {
          profileSyncWasRunningRef.current = true;
          return;
        }

        if (
          profileSyncWasRunningRef.current &&
          profileSyncCompletionToastJobIdRef.current !== latestJob.id
        ) {
          profileSyncCompletionToastJobIdRef.current = latestJob.id;
          profileSyncWasRunningRef.current = false;

          toast.success(
            `Profile sync done. Profile fields updated: ${latestJob.profileFieldsUpdated}, updated: ${latestJob.updated}, unchanged: ${latestJob.unchanged}, removed: ${latestJob.removed}, no photo: ${latestJob.noPhoto}, deactivated: ${latestJob.deactivated}, failed: ${latestJob.failed}.`,
          );

          await fetchUsersCurrentPage();
        }
      } catch {
        // ignore polling errors
      }
    };

    void pollLatestProfileSyncJob();

    const intervalId = window.setInterval(() => {
      void pollLatestProfileSyncJob();
    }, 2500);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [
    fetchLatestProfileSyncJob,
    fetchUsersCurrentPage,
    isHydrated,
    pathname,
    session?.accessToken,
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
    presentationLanguage,
    presentationLimit,
    presentationSortOrder,
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

  const isJoinedUsersHourlyRange = joinedUsersRange === "1d";

  const dailyJoinedUsersSeries = useMemo<DailyJoinedUsersPoint[]>(() => {
    if (joinedUserDates.length === 0) {
      return [];
    }

    const now = new Date();
    const todayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    if (joinedUsersRange === "1d") {
      const endHour = now.getUTCHours();
      const countsByHour = Array.from({ length: endHour + 1 }, () => 0);

      for (const row of joinedUserDates) {
        const parsedDate = new Date(row.createdAt);

        if (Number.isNaN(parsedDate.getTime())) {
          continue;
        }

        if (
          parsedDate.getUTCFullYear() !== now.getUTCFullYear() ||
          parsedDate.getUTCMonth() !== now.getUTCMonth() ||
          parsedDate.getUTCDate() !== now.getUTCDate()
        ) {
          continue;
        }

        const hour = parsedDate.getUTCHours();

        if (hour >= 0 && hour <= endHour) {
          countsByHour[hour] += 1;
        }
      }

      return countsByHour.map((count, hour) => {
        const normalizedHour = hour.toString().padStart(2, "0");

        return {
          dateKey: `${todayUtc.toISOString().slice(0, 10)}-${normalizedHour}`,
          label: `${normalizedHour}:00`,
          count,
        };
      });
    }

    const rangeDaysRaw = Number.parseInt(joinedUsersRange.slice(0, -1), 10);
    const rangeDays =
      Number.isFinite(rangeDaysRaw) && rangeDaysRaw > 0 ? rangeDaysRaw : 30;
    const startDate = new Date(todayUtc);
    startDate.setUTCDate(startDate.getUTCDate() - (rangeDays - 1));
    const countsByDate = new Map<string, number>();

    for (const row of joinedUserDates) {
      const parsedDate = new Date(row.createdAt);

      if (Number.isNaN(parsedDate.getTime())) {
        continue;
      }

      if (parsedDate < startDate || parsedDate > now) {
        continue;
      }

      const dateKey = parsedDate.toISOString().slice(0, 10);
      countsByDate.set(dateKey, (countsByDate.get(dateKey) ?? 0) + 1);
    }

    const labelFormatter = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    });
    const points: DailyJoinedUsersPoint[] = [];

    for (
      const cursor = new Date(startDate);
      cursor <= todayUtc;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const dateKey = cursor.toISOString().slice(0, 10);

      points.push({
        dateKey,
        label: labelFormatter.format(cursor),
        count: countsByDate.get(dateKey) ?? 0,
      });
    }

    return points;
  }, [joinedUserDates, joinedUsersRange]);

  const dailyJoinedUsersTotal = useMemo(
    () => dailyJoinedUsersSeries.reduce((sum, point) => sum + point.count, 0),
    [dailyJoinedUsersSeries],
  );

  const dailyJoinedUsersMax = useMemo(
    () =>
      dailyJoinedUsersSeries.reduce(
        (maxValue, point) => Math.max(maxValue, point.count),
        0,
      ),
    [dailyJoinedUsersSeries],
  );

  const chartPlotBottomY =
    DAILY_JOINED_USERS_CHART_HEIGHT - DAILY_JOINED_USERS_CHART_PADDING_BOTTOM;
  const chartPlotHeight =
    DAILY_JOINED_USERS_CHART_HEIGHT -
    DAILY_JOINED_USERS_CHART_PADDING_TOP -
    DAILY_JOINED_USERS_CHART_PADDING_BOTTOM;

  const dailyJoinedUsersChartPoints = useMemo<
    DailyJoinedUsersChartPoint[]
  >(() => {
    if (dailyJoinedUsersSeries.length === 0) {
      return [];
    }

    const maxValue = Math.max(dailyJoinedUsersMax, 1);
    const chartWidth =
      DAILY_JOINED_USERS_CHART_WIDTH - DAILY_JOINED_USERS_CHART_PADDING_X * 2;
    const slotWidth = chartWidth / dailyJoinedUsersSeries.length;

    return dailyJoinedUsersSeries.map((point, index) => ({
      ...point,
      x: DAILY_JOINED_USERS_CHART_PADDING_X + index * slotWidth + slotWidth / 2,
      y: chartPlotBottomY - (point.count / maxValue) * chartPlotHeight,
    }));
  }, [
    chartPlotBottomY,
    chartPlotHeight,
    dailyJoinedUsersMax,
    dailyJoinedUsersSeries,
  ]);

  const dailyJoinedUsersBarWidth = useMemo(() => {
    if (dailyJoinedUsersSeries.length === 0) {
      return 0;
    }

    const chartWidth =
      DAILY_JOINED_USERS_CHART_WIDTH - DAILY_JOINED_USERS_CHART_PADDING_X * 2;
    const slotWidth = chartWidth / dailyJoinedUsersSeries.length;
    const minBarWidth = dailyJoinedUsersSeries.length > 45 ? 0.48 : 0.95;

    return Math.max(Math.min(slotWidth * 0.62, 4.4), minBarWidth);
  }, [dailyJoinedUsersSeries.length]);

  const dailyJoinedUsersChartGuides = useMemo(() => {
    const maxValue = Math.max(dailyJoinedUsersMax, 1);

    return [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({
      ratio,
      value: Math.round(maxValue * ratio),
      y: chartPlotBottomY - ratio * chartPlotHeight,
    }));
  }, [chartPlotBottomY, chartPlotHeight, dailyJoinedUsersMax]);

  const dailyJoinedUsersAverage = useMemo(() => {
    if (dailyJoinedUsersSeries.length === 0) {
      return 0;
    }

    return dailyJoinedUsersTotal / dailyJoinedUsersSeries.length;
  }, [dailyJoinedUsersSeries, dailyJoinedUsersTotal]);

  const dailyJoinedUsersMedian = useMemo(
    () => calculateMedian(dailyJoinedUsersSeries.map((point) => point.count)),
    [dailyJoinedUsersSeries],
  );

  const dailyJoinedUsersAverageGuideY = useMemo(() => {
    const maxValue = Math.max(dailyJoinedUsersMax, 1);

    return (
      chartPlotBottomY - (dailyJoinedUsersAverage / maxValue) * chartPlotHeight
    );
  }, [
    chartPlotBottomY,
    chartPlotHeight,
    dailyJoinedUsersAverage,
    dailyJoinedUsersMax,
  ]);

  const dailyJoinedUsersActivePeriods = useMemo(
    () => dailyJoinedUsersSeries.filter((point) => point.count > 0).length,
    [dailyJoinedUsersSeries],
  );

  const dailyJoinedUsersActiveRate = useMemo(() => {
    if (dailyJoinedUsersSeries.length === 0) {
      return 0;
    }

    return (
      (dailyJoinedUsersActivePeriods / dailyJoinedUsersSeries.length) * 100
    );
  }, [dailyJoinedUsersActivePeriods, dailyJoinedUsersSeries.length]);

  const dailyJoinedUsersMiddlePoint =
    dailyJoinedUsersSeries[
      Math.floor((dailyJoinedUsersSeries.length - 1) / 2)
    ] ?? null;
  const dailyJoinedUsersPeakPoint = useMemo(() => {
    if (dailyJoinedUsersSeries.length === 0) {
      return null;
    }

    return dailyJoinedUsersSeries.reduce((peakPoint, point) => {
      return point.count > peakPoint.count ? point : peakPoint;
    }, dailyJoinedUsersSeries[0]);
  }, [dailyJoinedUsersSeries]);
  const dailyJoinedUsersLowPoint = useMemo(() => {
    if (dailyJoinedUsersSeries.length === 0) {
      return null;
    }

    return dailyJoinedUsersSeries.reduce((lowestPoint, point) => {
      return point.count < lowestPoint.count ? point : lowestPoint;
    }, dailyJoinedUsersSeries[0]);
  }, [dailyJoinedUsersSeries]);
  const dailyJoinedUsersLatestPoint =
    dailyJoinedUsersSeries[dailyJoinedUsersSeries.length - 1] ?? null;
  const dailyJoinedUsersPreviousPoint =
    dailyJoinedUsersSeries.length > 1
      ? dailyJoinedUsersSeries[dailyJoinedUsersSeries.length - 2]
      : null;

  const dailyJoinedUsersTrendDelta =
    dailyJoinedUsersLatestPoint && dailyJoinedUsersPreviousPoint
      ? dailyJoinedUsersLatestPoint.count - dailyJoinedUsersPreviousPoint.count
      : 0;

  const dailyJoinedUsersTrendLabel = useMemo(() => {
    if (!dailyJoinedUsersLatestPoint || !dailyJoinedUsersPreviousPoint) {
      return "N/A";
    }

    if (dailyJoinedUsersTrendDelta === 0) {
      return "Flat";
    }

    const direction = dailyJoinedUsersTrendDelta > 0 ? "Up" : "Down";
    const absoluteDelta = Math.abs(dailyJoinedUsersTrendDelta);

    if (dailyJoinedUsersPreviousPoint.count <= 0) {
      return `${direction} ${absoluteDelta}`;
    }

    const percent = (absoluteDelta / dailyJoinedUsersPreviousPoint.count) * 100;
    return `${direction} ${percent.toFixed(1)}%`;
  }, [
    dailyJoinedUsersLatestPoint,
    dailyJoinedUsersPreviousPoint,
    dailyJoinedUsersTrendDelta,
  ]);

  const dailyGenerationsSeries = useMemo<DailyJoinedUsersPoint[]>(() => {
    if (presentationCreatedDates.length === 0) {
      return [];
    }

    const now = new Date();
    const todayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    if (joinedUsersRange === "1d") {
      const endHour = now.getUTCHours();
      const countsByHour = Array.from({ length: endHour + 1 }, () => 0);

      for (const row of presentationCreatedDates) {
        const parsedDate = new Date(row.createdAt);

        if (Number.isNaN(parsedDate.getTime())) {
          continue;
        }

        if (
          parsedDate.getUTCFullYear() !== now.getUTCFullYear() ||
          parsedDate.getUTCMonth() !== now.getUTCMonth() ||
          parsedDate.getUTCDate() !== now.getUTCDate()
        ) {
          continue;
        }

        const hour = parsedDate.getUTCHours();

        if (hour >= 0 && hour <= endHour) {
          countsByHour[hour] += 1;
        }
      }

      return countsByHour.map((count, hour) => {
        const normalizedHour = hour.toString().padStart(2, "0");

        return {
          dateKey: `${todayUtc.toISOString().slice(0, 10)}-${normalizedHour}`,
          label: `${normalizedHour}:00`,
          count,
        };
      });
    }

    const rangeDaysRaw = Number.parseInt(joinedUsersRange.slice(0, -1), 10);
    const rangeDays =
      Number.isFinite(rangeDaysRaw) && rangeDaysRaw > 0 ? rangeDaysRaw : 30;
    const startDate = new Date(todayUtc);
    startDate.setUTCDate(startDate.getUTCDate() - (rangeDays - 1));
    const countsByDate = new Map<string, number>();

    for (const row of presentationCreatedDates) {
      const parsedDate = new Date(row.createdAt);

      if (Number.isNaN(parsedDate.getTime())) {
        continue;
      }

      if (parsedDate < startDate || parsedDate > now) {
        continue;
      }

      const dateKey = parsedDate.toISOString().slice(0, 10);
      countsByDate.set(dateKey, (countsByDate.get(dateKey) ?? 0) + 1);
    }

    const labelFormatter = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    });
    const points: DailyJoinedUsersPoint[] = [];

    for (
      const cursor = new Date(startDate);
      cursor <= todayUtc;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const dateKey = cursor.toISOString().slice(0, 10);

      points.push({
        dateKey,
        label: labelFormatter.format(cursor),
        count: countsByDate.get(dateKey) ?? 0,
      });
    }

    return points;
  }, [joinedUsersRange, presentationCreatedDates]);

  const dailyGenerationsTotal = useMemo(
    () => dailyGenerationsSeries.reduce((sum, point) => sum + point.count, 0),
    [dailyGenerationsSeries],
  );

  const dailyGenerationsMax = useMemo(
    () =>
      dailyGenerationsSeries.reduce(
        (maxValue, point) => Math.max(maxValue, point.count),
        0,
      ),
    [dailyGenerationsSeries],
  );

  const dailyGenerationsChartPoints = useMemo<
    DailyJoinedUsersChartPoint[]
  >(() => {
    if (dailyGenerationsSeries.length === 0) {
      return [];
    }

    const maxValue = Math.max(dailyGenerationsMax, 1);
    const chartWidth =
      DAILY_JOINED_USERS_CHART_WIDTH - DAILY_JOINED_USERS_CHART_PADDING_X * 2;
    const slotWidth = chartWidth / dailyGenerationsSeries.length;

    return dailyGenerationsSeries.map((point, index) => ({
      ...point,
      x: DAILY_JOINED_USERS_CHART_PADDING_X + index * slotWidth + slotWidth / 2,
      y: chartPlotBottomY - (point.count / maxValue) * chartPlotHeight,
    }));
  }, [
    chartPlotBottomY,
    chartPlotHeight,
    dailyGenerationsMax,
    dailyGenerationsSeries,
  ]);

  const dailyGenerationsBarWidth = useMemo(() => {
    if (dailyGenerationsSeries.length === 0) {
      return 0;
    }

    const chartWidth =
      DAILY_JOINED_USERS_CHART_WIDTH - DAILY_JOINED_USERS_CHART_PADDING_X * 2;
    const slotWidth = chartWidth / dailyGenerationsSeries.length;
    const minBarWidth = dailyGenerationsSeries.length > 45 ? 0.48 : 0.95;

    return Math.max(Math.min(slotWidth * 0.62, 4.4), minBarWidth);
  }, [dailyGenerationsSeries.length]);

  const dailyGenerationsChartGuides = useMemo(() => {
    const maxValue = Math.max(dailyGenerationsMax, 1);

    return [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({
      ratio,
      value: Math.round(maxValue * ratio),
      y: chartPlotBottomY - ratio * chartPlotHeight,
    }));
  }, [chartPlotBottomY, chartPlotHeight, dailyGenerationsMax]);

  const dailyGenerationsAverage = useMemo(() => {
    if (dailyGenerationsSeries.length === 0) {
      return 0;
    }

    return dailyGenerationsTotal / dailyGenerationsSeries.length;
  }, [dailyGenerationsSeries, dailyGenerationsTotal]);

  const dailyGenerationsMedian = useMemo(
    () => calculateMedian(dailyGenerationsSeries.map((point) => point.count)),
    [dailyGenerationsSeries],
  );

  const dailyGenerationsAverageGuideY = useMemo(() => {
    const maxValue = Math.max(dailyGenerationsMax, 1);

    return (
      chartPlotBottomY - (dailyGenerationsAverage / maxValue) * chartPlotHeight
    );
  }, [
    chartPlotBottomY,
    chartPlotHeight,
    dailyGenerationsAverage,
    dailyGenerationsMax,
  ]);

  const dailyGenerationsActivePeriods = useMemo(
    () => dailyGenerationsSeries.filter((point) => point.count > 0).length,
    [dailyGenerationsSeries],
  );

  const dailyGenerationsActiveRate = useMemo(() => {
    if (dailyGenerationsSeries.length === 0) {
      return 0;
    }

    return (
      (dailyGenerationsActivePeriods / dailyGenerationsSeries.length) * 100
    );
  }, [dailyGenerationsActivePeriods, dailyGenerationsSeries.length]);

  const dailyGenerationsMiddlePoint =
    dailyGenerationsSeries[
      Math.floor((dailyGenerationsSeries.length - 1) / 2)
    ] ?? null;
  const dailyGenerationsPeakPoint = useMemo(() => {
    if (dailyGenerationsSeries.length === 0) {
      return null;
    }

    return dailyGenerationsSeries.reduce((peakPoint, point) => {
      return point.count > peakPoint.count ? point : peakPoint;
    }, dailyGenerationsSeries[0]);
  }, [dailyGenerationsSeries]);
  const dailyGenerationsLowPoint = useMemo(() => {
    if (dailyGenerationsSeries.length === 0) {
      return null;
    }

    return dailyGenerationsSeries.reduce((lowestPoint, point) => {
      return point.count < lowestPoint.count ? point : lowestPoint;
    }, dailyGenerationsSeries[0]);
  }, [dailyGenerationsSeries]);
  const dailyGenerationsLatestPoint =
    dailyGenerationsSeries[dailyGenerationsSeries.length - 1] ?? null;
  const dailyGenerationsPreviousPoint =
    dailyGenerationsSeries.length > 1
      ? dailyGenerationsSeries[dailyGenerationsSeries.length - 2]
      : null;

  const dailyGenerationsTrendDelta =
    dailyGenerationsLatestPoint && dailyGenerationsPreviousPoint
      ? dailyGenerationsLatestPoint.count - dailyGenerationsPreviousPoint.count
      : 0;

  const dailyGenerationsTrendLabel = useMemo(() => {
    if (!dailyGenerationsLatestPoint || !dailyGenerationsPreviousPoint) {
      return "N/A";
    }

    if (dailyGenerationsTrendDelta === 0) {
      return "Flat";
    }

    const direction = dailyGenerationsTrendDelta > 0 ? "Up" : "Down";
    const absoluteDelta = Math.abs(dailyGenerationsTrendDelta);

    if (dailyGenerationsPreviousPoint.count <= 0) {
      return `${direction} ${absoluteDelta}`;
    }

    const percent = (absoluteDelta / dailyGenerationsPreviousPoint.count) * 100;
    return `${direction} ${percent.toFixed(1)}%`;
  }, [
    dailyGenerationsLatestPoint,
    dailyGenerationsPreviousPoint,
    dailyGenerationsTrendDelta,
  ]);

  const joinedUsersPeakLabel = isJoinedUsersHourlyRange
    ? "Peak/hour"
    : "Peak/day";
  const joinedUsersLatestLabel = isJoinedUsersHourlyRange
    ? "Latest hour"
    : "Latest day";
  const joinedUsersChartLabel = isJoinedUsersHourlyRange
    ? "Joined users by hour (UTC)"
    : "Daily joined users (UTC)";
  const generationsChartLabel = isJoinedUsersHourlyRange
    ? "Generations by hour (UTC)"
    : "Daily generations (UTC)";
  const hasLoadedGrowthCharts =
    hasLoadedJoinedUserDates && hasLoadedPresentationCreatedDates;

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
  const showSystemPromptsSkeleton =
    isSystemPromptsLoading && systemPrompts.length === 0;
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
          "Manage runtime limits, AI model routing, and editable system prompts.",
      },
      users: {
        eyebrow: "User Intelligence",
        title: "User Directory",
        description:
          "Search and audit user activity through the admin user directory.",
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
          "SUPERADMIN can manage all admins, while ADMIN can update only their own profile and password.",
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

  const broadcastMessagePreviewHtml = useMemo(
    () => formatBroadcastMessageToHtml(broadcastMessage),
    [broadcastMessage],
  );

  const geminiModelSuggestions = useMemo(
    () =>
      normalizeRuntimeModelSuggestions(runtimeSettings?.geminiModelSuggestions),
    [runtimeSettings?.geminiModelSuggestions],
  );

  const geminiImageModelSuggestions = useMemo(
    () =>
      normalizeRuntimeModelSuggestions(
        runtimeSettings?.geminiImageModelSuggestions,
      ),
    [runtimeSettings?.geminiImageModelSuggestions],
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
    setUserSearch("");
    setDebouncedUserSearch("");
    setUserRegistrationFilter("all");
    setUserSortOrder("desc");
    setUsersTotalCount(0);
    setUsersPage(1);
    setUsersAfterHistory([null]);
    setUsersPageInfo(EMPTY_CONNECTION_PAGE_INFO);
    setIsSyncingUserProfileImages(false);
    profileSyncRequestInFlightRef.current = false;
    setProfileSyncJob(null);
    profileSyncWasRunningRef.current = false;
    profileSyncCompletionToastJobIdRef.current = null;
    setOverviewUsers([]);
    setHasLoadedOverviewUsers(false);
    setJoinedUserDates([]);
    setPresentationCreatedDates([]);
    setJoinedUsersRange("30d");
    setHasLoadedJoinedUserDates(false);
    setHasLoadedPresentationCreatedDates(false);
    setPresentations([]);
    setPresentationStatus("all");
    setPresentationLanguage("all");
    setPresentationSortOrder("desc");
    setPresentationsTotalCount(0);
    setPresentationsPage(1);
    setPresentationsAfterHistory([null]);
    setPresentationsPageInfo(EMPTY_CONNECTION_PAGE_INFO);
    setBroadcastMessage("");
    setBroadcastResult(null);
    setBroadcastHistory([]);
    setBroadcastTotalCount(0);
    setBroadcastPage(1);
    setBroadcastAfterHistory([null]);
    setBroadcastPageInfo(EMPTY_CONNECTION_PAGE_INFO);
    setIsBroadcastHistoryLoading(false);
    setIsBroadcastSending(false);
    setBroadcastImageFile(null);
    if (broadcastImagePreviewUrl) {
      URL.revokeObjectURL(broadcastImagePreviewUrl);
    }
    setBroadcastImagePreviewUrl(null);
    setAdmins([]);
    setIsAdminsLoading(true);
    setAdminName("");
    setAdminUsername("");
    setAdminPassword("");
    setAdminRole("ADMIN");
    setIsCreatingAdmin(false);
    setEditingAdminId(null);
    setEditingAdminName("");
    setEditingAdminUsername("");
    setEditingAdminRole("ADMIN");
    setEditingAdminPassword("");
    setIsUpdatingAdmin(false);
    setDeletingAdminId(null);
    setAdminPendingDelete(null);
    setAdminPendingPasswordUpdate(null);
    setAdminPasswordUpdateInput("");
    setUpdatingPasswordAdminId(null);
    setOwnAdminName("");
    setOwnAdminUsername("");
    setOwnAdminPassword("");
    setIsUpdatingOwnAdmin(false);
    setRuntimeSettings(null);
    setMainThemePromptCharacterLimitInput("");
    setFreePresentationGenerationLimitInput("");
    setGeminiModelInput("");
    setGeminiImageModelInput("");
    setActiveRuntimeModelField(null);
    setIsSavingRuntimeSettings(false);
    setSystemPrompts([]);
    setSystemPromptInputs({});
    setIsSystemPromptsLoading(true);
    setSavingSystemPromptKey(null);
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

  const handleSyncAllUserProfileImages = async () => {
    if (profileSyncRequestInFlightRef.current || isSyncingUserProfileImages) {
      return;
    }

    profileSyncRequestInFlightRef.current = true;
    setIsSyncingUserProfileImages(true);
    profileSyncWasRunningRef.current = true;

    try {
      const result = await apiRequest<SyncUserProfileImagesResponse>(
        "/admin/users/profile-images/sync",
        {
          method: "POST",
        },
      );

      setProfileSyncJob(result);

      const isRunning =
        result.status === "queued" || result.status === "running";
      setIsSyncingUserProfileImages(isRunning);

      if (isRunning) {
        profileSyncWasRunningRef.current = true;
        toast.success(
          `Profile sync job #${result.id} started. Active users to sync: ${result.totalUsers}.`,
        );
      } else {
        profileSyncWasRunningRef.current = false;
        profileSyncCompletionToastJobIdRef.current = result.id;
        toast.success(
          `Profile sync done. Profile fields updated: ${result.profileFieldsUpdated}, updated: ${result.updated}, unchanged: ${result.unchanged}, removed: ${result.removed}, no photo: ${result.noPhoto}, deactivated: ${result.deactivated}, failed: ${result.failed}.`,
        );
      }

      await fetchUsersCurrentPage();
    } catch (error) {
      toast.error(toErrorMessage(error));
      setIsSyncingUserProfileImages(false);
      profileSyncWasRunningRef.current = false;
    } finally {
      profileSyncRequestInFlightRef.current = false;
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

  const handleBroadcastImageChange = (event: ChangeEvent<HTMLInputElement>) => {
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

  const focusBroadcastMessageSelection = (
    selectionStart: number,
    selectionEnd: number,
  ) => {
    window.requestAnimationFrame(() => {
      const textarea = broadcastMessageInputRef.current;

      if (!textarea) {
        return;
      }

      textarea.focus();
      textarea.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  const applyBroadcastWrapper = (
    wrapperStart: string,
    wrapperEnd: string,
    placeholder: string,
  ) => {
    const textarea = broadcastMessageInputRef.current;

    if (!textarea) {
      return;
    }

    const maxLength = broadcastImageFile ? 1024 : 4096;
    const currentValue = broadcastMessage;
    const rawSelectionStart = textarea.selectionStart ?? currentValue.length;
    const rawSelectionEnd = textarea.selectionEnd ?? currentValue.length;
    const selectionStart = Math.max(
      0,
      Math.min(rawSelectionStart, currentValue.length),
    );
    const selectionEnd = Math.max(
      selectionStart,
      Math.min(rawSelectionEnd, currentValue.length),
    );
    const selectedText = currentValue.slice(selectionStart, selectionEnd);

    if (
      selectedText &&
      hasExistingBroadcastFormatting(currentValue, selectionStart, selectionEnd)
    ) {
      toast.error("Selected text already has formatting.");
      return;
    }

    const before = currentValue.slice(0, selectionStart);
    const after = currentValue.slice(selectionEnd);
    const insertion = `${wrapperStart}${selectedText || placeholder}${wrapperEnd}`;
    const nextValue = `${before}${insertion}${after}`;

    if (nextValue.length > maxLength) {
      toast.error(`Message must be ${maxLength} characters or less.`);
      return;
    }

    setBroadcastMessage(nextValue);

    if (selectedText) {
      const cursorPosition = selectionStart + insertion.length;
      focusBroadcastMessageSelection(cursorPosition, cursorPosition);
      return;
    }

    const placeholderStart = selectionStart + wrapperStart.length;
    const placeholderEnd = placeholderStart + placeholder.length;
    focusBroadcastMessageSelection(placeholderStart, placeholderEnd);
  };

  const applyBroadcastLinkFormatting = () => {
    const textarea = broadcastMessageInputRef.current;

    if (!textarea) {
      return;
    }

    const maxLength = broadcastImageFile ? 1024 : 4096;
    const currentValue = broadcastMessage;
    const rawSelectionStart = textarea.selectionStart ?? currentValue.length;
    const rawSelectionEnd = textarea.selectionEnd ?? currentValue.length;
    const selectionStart = Math.max(
      0,
      Math.min(rawSelectionStart, currentValue.length),
    );
    const selectionEnd = Math.max(
      selectionStart,
      Math.min(rawSelectionEnd, currentValue.length),
    );
    const selectedText = currentValue.slice(selectionStart, selectionEnd);

    if (
      selectedText &&
      hasExistingBroadcastFormatting(currentValue, selectionStart, selectionEnd)
    ) {
      toast.error("Selected text already has formatting.");
      return;
    }

    const before = currentValue.slice(0, selectionStart);
    const after = currentValue.slice(selectionEnd);
    const linkText = selectedText || BROADCAST_LINK_PLACEHOLDER_TEXT;
    const insertion = `[${linkText}](${BROADCAST_LINK_PLACEHOLDER_URL})`;
    const nextValue = `${before}${insertion}${after}`;

    if (nextValue.length > maxLength) {
      toast.error(`Message must be ${maxLength} characters or less.`);
      return;
    }

    setBroadcastMessage(nextValue);

    if (selectedText) {
      const urlStart = selectionStart + linkText.length + 3;
      const urlEnd = urlStart + BROADCAST_LINK_PLACEHOLDER_URL.length;
      focusBroadcastMessageSelection(urlStart, urlEnd);
      return;
    }

    const textStart = selectionStart + 1;
    const textEnd = textStart + linkText.length;
    focusBroadcastMessageSelection(textStart, textEnd);
  };

  const applyBroadcastFormatting = (
    format: "bold" | "italic" | "code" | "link" | "spoiler",
  ) => {
    if (format === "link") {
      applyBroadcastLinkFormatting();
      return;
    }

    if (format === "bold") {
      applyBroadcastWrapper("**", "**", "bold text");
      return;
    }

    if (format === "italic") {
      applyBroadcastWrapper("__", "__", "italic text");
      return;
    }

    if (format === "code") {
      applyBroadcastWrapper("`", "`", "code");
      return;
    }

    applyBroadcastWrapper("||", "||", "spoiler");
  };

  const handleBroadcast = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedMessage = broadcastMessage.trim();

    if (!trimmedMessage) {
      toast.error("Message is required.");
      return;
    }

    if (hasInvalidBroadcastLinks(trimmedMessage)) {
      toast.error("Links must start with http:// or https://.");
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
      await fetchBroadcastFirstPage();
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
      setGeminiModelInput(updated.geminiModel);
      setGeminiImageModelInput(updated.geminiImageModel);
      setActiveRuntimeModelField(null);
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

    const nextGeminiModel = geminiModelInput.trim();
    const nextGeminiImageModel = geminiImageModelInput.trim();

    if (!nextGeminiModel) {
      toast.error("Gemini model is required.");
      return;
    }

    if (nextGeminiModel.length > RUNTIME_MODEL_NAME_MAX_LENGTH) {
      toast.error(
        `Gemini model must be at most ${RUNTIME_MODEL_NAME_MAX_LENGTH} characters.`,
      );
      return;
    }

    if (!nextGeminiImageModel) {
      toast.error("Gemini image model is required.");
      return;
    }

    if (nextGeminiImageModel.length > RUNTIME_MODEL_NAME_MAX_LENGTH) {
      toast.error(
        `Gemini image model must be at most ${RUNTIME_MODEL_NAME_MAX_LENGTH} characters.`,
      );
      return;
    }

    await saveRuntimeSettings(
      {
        mainThemePromptCharacterLimit: parsedMainThemeLimit,
        freePresentationGenerationLimit: parsedFreeGenerationLimit,
        geminiModel: nextGeminiModel,
        geminiImageModel: nextGeminiImageModel,
      },
      "Runtime settings updated.",
    );
  };

  const handleSystemPromptInputChange = (key: string, value: string) => {
    setSystemPromptInputs((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const handleSaveSystemPrompt = async (key: string) => {
    const nextContent = systemPromptInputs[key]?.trim() ?? "";

    if (!nextContent) {
      toast.error("System prompt content is required.");
      return;
    }

    setSavingSystemPromptKey(key);

    try {
      const updatedPrompt = await apiRequest<SystemPromptResponse>(
        `/admin/system-prompts/${encodeURIComponent(key)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            content: nextContent,
          }),
        },
      );

      setSystemPrompts((previous) =>
        previous.map((prompt) =>
          prompt.key === updatedPrompt.key ? updatedPrompt : prompt,
        ),
      );
      setSystemPromptInputs((previous) => ({
        ...previous,
        [updatedPrompt.key]: updatedPrompt.content,
      }));
      toast.success(`${updatedPrompt.title} prompt updated.`);
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setSavingSystemPromptKey(null);
    }
  };

  const handleCreateAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isSuperAdmin) {
      toast.error("Only SUPERADMIN can create admins.");
      return;
    }

    setIsCreatingAdmin(true);

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
    } finally {
      setIsCreatingAdmin(false);
    }
  };

  const startEditingAdmin = (admin: AdminProfile) => {
    setEditingAdminId(admin.id);
    setEditingAdminName(admin.name);
    setEditingAdminUsername(admin.username);
    setEditingAdminRole(admin.role);
    setEditingAdminPassword("");
  };

  const clearEditingAdmin = () => {
    setEditingAdminId(null);
    setEditingAdminName("");
    setEditingAdminUsername("");
    setEditingAdminRole("ADMIN");
    setEditingAdminPassword("");
  };

  const handleUpdateAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isSuperAdmin || editingAdminId === null) {
      toast.error("Only SUPERADMIN can update other admins.");
      return;
    }

    const payload: {
      name: string;
      username: string;
      role: AdminRole;
      password?: string;
    } = {
      name: editingAdminName,
      username: editingAdminUsername,
      role: editingAdminRole,
    };

    if (editingAdminPassword.trim()) {
      payload.password = editingAdminPassword;
    }

    setIsUpdatingAdmin(true);

    try {
      const updatedAdmin = await apiRequest<AdminProfile>(
        `/admin/admins/${editingAdminId}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
      );

      if (updatedAdmin.id === profile?.id) {
        syncAuthenticatedAdmin(updatedAdmin);
      }

      toast.success("Admin updated.");
      setEditingAdminPassword("");
      await fetchAdmins();
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setIsUpdatingAdmin(false);
    }
  };

  const handleUpdateAdminPassword = (admin: AdminProfile) => {
    if (!isSuperAdmin) {
      toast.error("Only SUPERADMIN can change other admin passwords.");
      return;
    }

    setAdminPendingPasswordUpdate(admin);
    setAdminPasswordUpdateInput("");
  };

  const closeUpdatePasswordDialog = () => {
    if (updatingPasswordAdminId !== null) {
      return;
    }

    setAdminPendingPasswordUpdate(null);
    setAdminPasswordUpdateInput("");
  };

  const confirmUpdateAdminPassword = async () => {
    if (!adminPendingPasswordUpdate) {
      return;
    }

    const nextPassword = adminPasswordUpdateInput.trim();

    setUpdatingPasswordAdminId(adminPendingPasswordUpdate.id);

    try {
      await apiRequest<AdminProfile>(
        `/admin/admins/${adminPendingPasswordUpdate.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            password: nextPassword,
          }),
        },
      );

      toast.success(
        `Password updated for @${adminPendingPasswordUpdate.username}.`,
      );
      setAdminPendingPasswordUpdate(null);
      setAdminPasswordUpdateInput("");
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setUpdatingPasswordAdminId(null);
    }
  };

  const handleDeleteAdmin = (admin: AdminProfile) => {
    if (!isSuperAdmin) {
      toast.error("Only SUPERADMIN can delete admins.");
      return;
    }

    if (admin.id === profile?.id) {
      toast.error("You cannot delete your own account.");
      return;
    }

    setAdminPendingDelete(admin);
  };

  const closeDeleteAdminDialog = () => {
    if (deletingAdminId !== null) {
      return;
    }

    setAdminPendingDelete(null);
  };

  const confirmDeleteAdmin = async () => {
    if (!adminPendingDelete) {
      return;
    }

    setDeletingAdminId(adminPendingDelete.id);

    try {
      await apiRequest<{ deleted: boolean; id: number }>(
        `/admin/admins/${adminPendingDelete.id}`,
        {
          method: "DELETE",
        },
      );

      if (editingAdminId === adminPendingDelete.id) {
        clearEditingAdmin();
      }

      toast.success(`@${adminPendingDelete.username} deleted.`);
      setAdminPendingDelete(null);
      await fetchAdmins();
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setDeletingAdminId(null);
    }
  };

  const handleUpdateOwnAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!profile) {
      toast.error("Admin profile is not available.");
      return;
    }

    const payload: {
      name: string;
      username: string;
      password?: string;
    } = {
      name: ownAdminName,
      username: ownAdminUsername,
    };

    if (ownAdminPassword.trim()) {
      payload.password = ownAdminPassword;
    }

    setIsUpdatingOwnAdmin(true);

    try {
      const updatedAdmin = await apiRequest<AdminProfile>(
        `/admin/admins/${profile.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
      );

      syncAuthenticatedAdmin(updatedAdmin);
      setOwnAdminPassword("");
      toast.success("Your admin profile was updated.");

      if (isSuperAdmin) {
        await fetchAdmins();
      }
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setIsUpdatingOwnAdmin(false);
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
                <h1 className="text-xl font-semibold tracking-tight text-main">
                  Admin Panel
                </h1>
                <p className="mt-2 text-xs text-muted">
                  Operating with real-time controls.
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

                        <div className="surface-glass order-3 space-y-0 rounded-3xl p-5 md:col-span-6 md:row-span-2">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <div className="flex items-center gap-2">
                              <label
                                htmlFor="joined-users-range"
                                className="sr-only"
                              >
                                Joined users range
                              </label>
                              <select
                                id="joined-users-range"
                                value={joinedUsersRange}
                                onChange={(event) => {
                                  setJoinedUsersRange(
                                    event.target.value as JoinedUsersRange,
                                  );
                                }}
                                className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-1)] px-2 py-1 text-xs text-main outline-none focus:border-[var(--accent)]"
                              >
                                {JOINED_USERS_RANGE_OPTIONS.map((option) => (
                                  <option
                                    key={`joined-users-range-${option.value}`}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {!hasLoadedGrowthCharts ? (
                            <div className="space-y-3">
                              <SkeletonBlock className="h-32 w-full rounded-xl md:h-36" />
                              <SkeletonBlock className="h-32 w-full rounded-xl md:h-36" />
                            </div>
                          ) : dailyJoinedUsersSeries.length === 0 &&
                            dailyGenerationsSeries.length === 0 ? (
                            <p className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-3)] px-3 py-2 text-sm text-muted">
                              No joined users or generations yet.
                            </p>
                          ) : (
                            <div className="space-y-12">
                              {dailyJoinedUsersSeries.length === 0 ? (
                                <p className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-3)] px-3 py-2 text-sm text-muted">
                                  No joined users yet.
                                </p>
                              ) : (
                                <div className="space-y-2.5">
                                  <div className="flex items-center justify-between text-xs text-muted">
                                    <span>{joinedUsersChartLabel}</span>
                                    <span>
                                      <NumberTicker
                                        value={dailyJoinedUsersTotal}
                                      />{" "}
                                      total
                                    </span>
                                  </div>

                                  <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-3)] p-2.5">
                                    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[0.66rem] text-muted">
                                      <span>
                                        Avg/
                                        {isJoinedUsersHourlyRange
                                          ? "hour"
                                          : "day"}
                                        : {dailyJoinedUsersAverage.toFixed(1)}
                                      </span>
                                      <span>
                                        Median:{" "}
                                        {dailyJoinedUsersMedian.toFixed(1)}
                                      </span>
                                      <span>
                                        Trend: {dailyJoinedUsersTrendLabel}
                                      </span>
                                    </div>

                                    <svg
                                      viewBox={`0 0 ${DAILY_JOINED_USERS_CHART_WIDTH} ${DAILY_JOINED_USERS_CHART_HEIGHT}`}
                                      preserveAspectRatio="none"
                                      className="h-28 w-full md:h-32"
                                      role="img"
                                      aria-label="Joined users bar chart"
                                    >
                                      <defs>
                                        <linearGradient
                                          id="daily-joined-users-chart-bg"
                                          x1="0"
                                          y1="0"
                                          x2="0"
                                          y2="1"
                                        >
                                          <stop
                                            offset="0%"
                                            stopColor="var(--accent)"
                                            stopOpacity="0.14"
                                          />
                                          <stop
                                            offset="100%"
                                            stopColor="var(--accent)"
                                            stopOpacity="0.02"
                                          />
                                        </linearGradient>
                                        <linearGradient
                                          id="daily-joined-users-bar-fill"
                                          x1="0"
                                          y1="0"
                                          x2="0"
                                          y2="1"
                                        >
                                          <stop
                                            offset="0%"
                                            stopColor="var(--accent)"
                                            stopOpacity="0.88"
                                          />
                                          <stop
                                            offset="100%"
                                            stopColor="var(--accent)"
                                            stopOpacity="0.24"
                                          />
                                        </linearGradient>
                                      </defs>

                                      <rect
                                        x="0"
                                        y="0"
                                        width={DAILY_JOINED_USERS_CHART_WIDTH}
                                        height={DAILY_JOINED_USERS_CHART_HEIGHT}
                                        fill="url(#daily-joined-users-chart-bg)"
                                      />

                                      {dailyJoinedUsersChartGuides.map(
                                        (guide) => (
                                          <g
                                            key={`joined-users-guide-${guide.ratio}`}
                                          >
                                            <line
                                              x1="0"
                                              y1={guide.y}
                                              x2={
                                                DAILY_JOINED_USERS_CHART_WIDTH
                                              }
                                              y2={guide.y}
                                              stroke="var(--surface-border)"
                                              strokeWidth={
                                                guide.ratio === 0 ? 1 : 0.8
                                              }
                                              strokeDasharray={
                                                guide.ratio === 0
                                                  ? undefined
                                                  : "1.4 2"
                                              }
                                              opacity={
                                                guide.ratio === 0 ? 0.85 : 0.5
                                              }
                                            />
                                            <text
                                              x={
                                                DAILY_JOINED_USERS_CHART_WIDTH -
                                                0.6
                                              }
                                              y={guide.y - 0.6}
                                              textAnchor="end"
                                              fill="var(--text-muted)"
                                              fontSize="2.6"
                                              opacity="0.9"
                                            >
                                              {guide.value}
                                            </text>
                                          </g>
                                        ),
                                      )}

                                      <line
                                        x1="0"
                                        y1={dailyJoinedUsersAverageGuideY}
                                        x2={DAILY_JOINED_USERS_CHART_WIDTH}
                                        y2={dailyJoinedUsersAverageGuideY}
                                        stroke="var(--accent)"
                                        strokeWidth="0.85"
                                        strokeDasharray="2 2"
                                        opacity="0.65"
                                      />

                                      {dailyJoinedUsersChartPoints.map(
                                        (point, index) => {
                                          const isPeak =
                                            !!dailyJoinedUsersPeakPoint &&
                                            point.dateKey ===
                                              dailyJoinedUsersPeakPoint.dateKey;
                                          const isLatest =
                                            index ===
                                            dailyJoinedUsersChartPoints.length -
                                              1;
                                          const rawBarHeight =
                                            chartPlotBottomY - point.y;
                                          const barHeight =
                                            point.count > 0
                                              ? Math.max(rawBarHeight, 0.7)
                                              : 0;

                                          return (
                                            <rect
                                              key={`joined-users-bar-${point.dateKey}`}
                                              x={
                                                point.x -
                                                dailyJoinedUsersBarWidth / 2
                                              }
                                              y={chartPlotBottomY - barHeight}
                                              width={dailyJoinedUsersBarWidth}
                                              height={barHeight}
                                              rx={Math.min(
                                                dailyJoinedUsersBarWidth / 2,
                                                1.2,
                                              )}
                                              fill={
                                                isPeak || isLatest
                                                  ? "var(--accent)"
                                                  : "url(#daily-joined-users-bar-fill)"
                                              }
                                              opacity={
                                                isPeak || isLatest ? 0.98 : 0.84
                                              }
                                            >
                                              <title>{`${point.label}: ${point.count}`}</title>
                                            </rect>
                                          );
                                        },
                                      )}
                                    </svg>

                                    <div className="mt-2 flex items-center justify-between text-[0.66rem] text-muted">
                                      <span>
                                        {dailyJoinedUsersSeries[0]?.label ??
                                          "-"}
                                      </span>
                                      <span>
                                        {dailyJoinedUsersMiddlePoint?.label ??
                                          "-"}
                                      </span>
                                      <span>
                                        {dailyJoinedUsersLatestPoint?.label ??
                                          "-"}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2 text-[0.72rem] text-muted sm:grid-cols-3 xl:grid-cols-6">
                                    <p>
                                      {joinedUsersPeakLabel}:{" "}
                                      <span className="text-main">
                                        {dailyJoinedUsersMax} (
                                        {dailyJoinedUsersPeakPoint?.label ??
                                          "-"}
                                        )
                                      </span>
                                    </p>
                                    <p>
                                      Low/
                                      {isJoinedUsersHourlyRange
                                        ? "hour"
                                        : "day"}
                                      :{" "}
                                      <span className="text-main">
                                        {dailyJoinedUsersLowPoint?.count ?? 0} (
                                        {dailyJoinedUsersLowPoint?.label ?? "-"}
                                        )
                                      </span>
                                    </p>
                                    <p>
                                      {joinedUsersLatestLabel}:{" "}
                                      <span className="text-main">
                                        {dailyJoinedUsersLatestPoint?.count ??
                                          0}
                                      </span>
                                    </p>
                                    <p>
                                      Median/
                                      {isJoinedUsersHourlyRange
                                        ? "hour"
                                        : "day"}
                                      :{" "}
                                      <span className="text-main">
                                        {dailyJoinedUsersMedian.toFixed(1)}
                                      </span>
                                    </p>
                                    <p>
                                      Active buckets:{" "}
                                      <span className="text-main">
                                        {dailyJoinedUsersActivePeriods}/
                                        {dailyJoinedUsersSeries.length} (
                                        {dailyJoinedUsersActiveRate.toFixed(0)}
                                        %)
                                      </span>
                                    </p>
                                    <p>
                                      Trend:{" "}
                                      <span className="text-main">
                                        {dailyJoinedUsersTrendLabel}
                                      </span>
                                    </p>
                                  </div>
                                </div>
                              )}

                              {dailyGenerationsSeries.length === 0 ? (
                                <p className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-3)] px-3 py-2 text-sm text-muted">
                                  No generations yet.
                                </p>
                              ) : (
                                <div className="space-y-2.5">
                                  <div className="flex items-center justify-between text-xs text-muted">
                                    <span>{generationsChartLabel}</span>
                                    <span>
                                      <NumberTicker
                                        value={dailyGenerationsTotal}
                                      />{" "}
                                      total
                                    </span>
                                  </div>

                                  <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-3)] p-2.5">
                                    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[0.66rem] text-muted">
                                      <span>
                                        Avg/
                                        {isJoinedUsersHourlyRange
                                          ? "hour"
                                          : "day"}
                                        : {dailyGenerationsAverage.toFixed(1)}
                                      </span>
                                      <span>
                                        Median:{" "}
                                        {dailyGenerationsMedian.toFixed(1)}
                                      </span>
                                      <span>
                                        Trend: {dailyGenerationsTrendLabel}
                                      </span>
                                    </div>

                                    <svg
                                      viewBox={`0 0 ${DAILY_JOINED_USERS_CHART_WIDTH} ${DAILY_JOINED_USERS_CHART_HEIGHT}`}
                                      preserveAspectRatio="none"
                                      className="h-28 w-full md:h-32"
                                      role="img"
                                      aria-label="Daily generations bar chart"
                                    >
                                      <defs>
                                        <linearGradient
                                          id="daily-generations-chart-bg"
                                          x1="0"
                                          y1="0"
                                          x2="0"
                                          y2="1"
                                        >
                                          <stop
                                            offset="0%"
                                            stopColor="#10b981"
                                            stopOpacity="0.18"
                                          />
                                          <stop
                                            offset="100%"
                                            stopColor="#10b981"
                                            stopOpacity="0.03"
                                          />
                                        </linearGradient>
                                        <linearGradient
                                          id="daily-generations-bar-fill"
                                          x1="0"
                                          y1="0"
                                          x2="0"
                                          y2="1"
                                        >
                                          <stop
                                            offset="0%"
                                            stopColor="#10b981"
                                            stopOpacity="0.9"
                                          />
                                          <stop
                                            offset="100%"
                                            stopColor="#10b981"
                                            stopOpacity="0.28"
                                          />
                                        </linearGradient>
                                      </defs>

                                      <rect
                                        x="0"
                                        y="0"
                                        width={DAILY_JOINED_USERS_CHART_WIDTH}
                                        height={DAILY_JOINED_USERS_CHART_HEIGHT}
                                        fill="url(#daily-generations-chart-bg)"
                                      />

                                      {dailyGenerationsChartGuides.map(
                                        (guide) => (
                                          <g
                                            key={`daily-generations-guide-${guide.ratio}`}
                                          >
                                            <line
                                              x1="0"
                                              y1={guide.y}
                                              x2={
                                                DAILY_JOINED_USERS_CHART_WIDTH
                                              }
                                              y2={guide.y}
                                              stroke="var(--surface-border)"
                                              strokeWidth={
                                                guide.ratio === 0 ? 1 : 0.8
                                              }
                                              strokeDasharray={
                                                guide.ratio === 0
                                                  ? undefined
                                                  : "1.4 2"
                                              }
                                              opacity={
                                                guide.ratio === 0 ? 0.85 : 0.5
                                              }
                                            />
                                            <text
                                              x={
                                                DAILY_JOINED_USERS_CHART_WIDTH -
                                                0.6
                                              }
                                              y={guide.y - 0.6}
                                              textAnchor="end"
                                              fill="var(--text-muted)"
                                              fontSize="2.6"
                                              opacity="0.9"
                                            >
                                              {guide.value}
                                            </text>
                                          </g>
                                        ),
                                      )}

                                      <line
                                        x1="0"
                                        y1={dailyGenerationsAverageGuideY}
                                        x2={DAILY_JOINED_USERS_CHART_WIDTH}
                                        y2={dailyGenerationsAverageGuideY}
                                        stroke="#10b981"
                                        strokeWidth="0.85"
                                        strokeDasharray="2 2"
                                        opacity="0.72"
                                      />

                                      {dailyGenerationsChartPoints.map(
                                        (point, index) => {
                                          const isPeak =
                                            !!dailyGenerationsPeakPoint &&
                                            point.dateKey ===
                                              dailyGenerationsPeakPoint.dateKey;
                                          const isLatest =
                                            index ===
                                            dailyGenerationsChartPoints.length -
                                              1;
                                          const rawBarHeight =
                                            chartPlotBottomY - point.y;
                                          const barHeight =
                                            point.count > 0
                                              ? Math.max(rawBarHeight, 0.7)
                                              : 0;

                                          return (
                                            <rect
                                              key={`daily-generations-bar-${point.dateKey}`}
                                              x={
                                                point.x -
                                                dailyGenerationsBarWidth / 2
                                              }
                                              y={chartPlotBottomY - barHeight}
                                              width={dailyGenerationsBarWidth}
                                              height={barHeight}
                                              rx={Math.min(
                                                dailyGenerationsBarWidth / 2,
                                                1.2,
                                              )}
                                              fill={
                                                isPeak || isLatest
                                                  ? "#10b981"
                                                  : "url(#daily-generations-bar-fill)"
                                              }
                                              opacity={
                                                isPeak || isLatest ? 0.98 : 0.84
                                              }
                                            >
                                              <title>{`${point.label}: ${point.count}`}</title>
                                            </rect>
                                          );
                                        },
                                      )}
                                    </svg>

                                    <div className="mt-2 flex items-center justify-between text-[0.66rem] text-muted">
                                      <span>
                                        {dailyGenerationsSeries[0]?.label ??
                                          "-"}
                                      </span>
                                      <span>
                                        {dailyGenerationsMiddlePoint?.label ??
                                          "-"}
                                      </span>
                                      <span>
                                        {dailyGenerationsLatestPoint?.label ??
                                          "-"}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2 text-[0.72rem] text-muted sm:grid-cols-3 xl:grid-cols-6">
                                    <p>
                                      {joinedUsersPeakLabel}:{" "}
                                      <span className="text-main">
                                        {dailyGenerationsMax} (
                                        {dailyGenerationsPeakPoint?.label ??
                                          "-"}
                                        )
                                      </span>
                                    </p>
                                    <p>
                                      Low/
                                      {isJoinedUsersHourlyRange
                                        ? "hour"
                                        : "day"}
                                      :{" "}
                                      <span className="text-main">
                                        {dailyGenerationsLowPoint?.count ?? 0} (
                                        {dailyGenerationsLowPoint?.label ?? "-"}
                                        )
                                      </span>
                                    </p>
                                    <p>
                                      {joinedUsersLatestLabel}:{" "}
                                      <span className="text-main">
                                        {dailyGenerationsLatestPoint?.count ??
                                          0}
                                      </span>
                                    </p>
                                    <p>
                                      Median/
                                      {isJoinedUsersHourlyRange
                                        ? "hour"
                                        : "day"}
                                      :{" "}
                                      <span className="text-main">
                                        {dailyGenerationsMedian.toFixed(1)}
                                      </span>
                                    </p>
                                    <p>
                                      Active buckets:{" "}
                                      <span className="text-main">
                                        {dailyGenerationsActivePeriods}/
                                        {dailyGenerationsSeries.length} (
                                        {dailyGenerationsActiveRate.toFixed(0)}
                                        %)
                                      </span>
                                    </p>
                                    <p>
                                      Trend:{" "}
                                      <span className="text-main">
                                        {dailyGenerationsTrendLabel}
                                      </span>
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
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
                                Manage generation limits and AI models used by
                                Telegram generation flow.
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
                                  !freePresentationGenerationLimitInput.trim() ||
                                  !geminiModelInput.trim() ||
                                  !geminiImageModelInput.trim()
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

                          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {showSettingsSkeleton ? (
                              Array.from({ length: 4 }).map((_, index) => (
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

                                <article className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] p-3">
                                  <div>
                                    <h4 className="text-xs font-semibold tracking-wide text-main uppercase">
                                      Gemini model
                                    </h4>
                                    <p className="mt-0.5 text-[0.72rem] text-muted">
                                      Model used for Gemini topic and slide
                                      generation.
                                    </p>
                                  </div>

                                  <div className="mt-2 space-y-2">
                                    <p className="text-xs text-main">
                                      Current:{" "}
                                      <span className="font-semibold">
                                        {runtimeSettings?.geminiModel ?? "-"}
                                      </span>
                                    </p>

                                    <div className="relative">
                                      <input
                                        type="text"
                                        maxLength={
                                          RUNTIME_MODEL_NAME_MAX_LENGTH
                                        }
                                        value={geminiModelInput}
                                        onChange={(event) => {
                                          setGeminiModelInput(
                                            event.target.value,
                                          );
                                        }}
                                        onFocus={() => {
                                          setActiveRuntimeModelField(
                                            "geminiModel",
                                          );
                                        }}
                                        onBlur={() => {
                                          setActiveRuntimeModelField(
                                            (current) =>
                                              current === "geminiModel"
                                                ? null
                                                : current,
                                          );
                                        }}
                                        className="w-full rounded-lg border border-[var(--surface-border)] bg-[var(--surface-1)] px-2.5 py-1.5 text-xs text-main outline-none focus:border-[var(--accent)]"
                                        placeholder="gemini-2.5-flash"
                                        autoComplete="off"
                                        required
                                      />

                                      {activeRuntimeModelField ===
                                      "geminiModel" ? (
                                        <div className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border border-[var(--surface-border)] bg-[var(--surface-1)] shadow-lg">
                                          {geminiModelSuggestions.length > 0 ? (
                                            geminiModelSuggestions.map(
                                              (suggestion) => (
                                                <button
                                                  key={`gemini-suggestion-${suggestion}`}
                                                  type="button"
                                                  onMouseDown={(event) => {
                                                    event.preventDefault();
                                                  }}
                                                  onClick={() => {
                                                    setGeminiModelInput(
                                                      suggestion,
                                                    );
                                                    setActiveRuntimeModelField(
                                                      null,
                                                    );
                                                  }}
                                                  className="block w-full px-2.5 py-1.5 text-left text-xs text-main transition hover:bg-[var(--surface-2)]"
                                                >
                                                  {suggestion}
                                                </button>
                                              ),
                                            )
                                          ) : (
                                            <p className="px-2.5 py-2 text-[0.72rem] text-muted">
                                              No saved model suggestions yet.
                                            </p>
                                          )}
                                        </div>
                                      ) : null}
                                    </div>

                                    <p className="text-[0.72rem] text-muted">
                                      Max {RUNTIME_MODEL_NAME_MAX_LENGTH}{" "}
                                      characters.
                                    </p>
                                  </div>
                                </article>

                                <article className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] p-3">
                                  <div>
                                    <h4 className="text-xs font-semibold tracking-wide text-main uppercase">
                                      Gemini image model
                                    </h4>
                                    <p className="mt-0.5 text-[0.72rem] text-muted">
                                      Model used for selecting slide-compatible
                                      images.
                                    </p>
                                  </div>

                                  <div className="mt-2 space-y-2">
                                    <p className="text-xs text-main">
                                      Current:{" "}
                                      <span className="font-semibold">
                                        {runtimeSettings?.geminiImageModel ??
                                          "-"}
                                      </span>
                                    </p>

                                    <div className="relative">
                                      <input
                                        type="text"
                                        maxLength={
                                          RUNTIME_MODEL_NAME_MAX_LENGTH
                                        }
                                        value={geminiImageModelInput}
                                        onChange={(event) => {
                                          setGeminiImageModelInput(
                                            event.target.value,
                                          );
                                        }}
                                        onFocus={() => {
                                          setActiveRuntimeModelField(
                                            "geminiImageModel",
                                          );
                                        }}
                                        onBlur={() => {
                                          setActiveRuntimeModelField(
                                            (current) =>
                                              current === "geminiImageModel"
                                                ? null
                                                : current,
                                          );
                                        }}
                                        className="w-full rounded-lg border border-[var(--surface-border)] bg-[var(--surface-1)] px-2.5 py-1.5 text-xs text-main outline-none focus:border-[var(--accent)]"
                                        placeholder="gemini-2.5-flash"
                                        autoComplete="off"
                                        required
                                      />

                                      {activeRuntimeModelField ===
                                      "geminiImageModel" ? (
                                        <div className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border border-[var(--surface-border)] bg-[var(--surface-1)] shadow-lg">
                                          {geminiImageModelSuggestions.length >
                                          0 ? (
                                            geminiImageModelSuggestions.map(
                                              (suggestion) => (
                                                <button
                                                  key={`gemini-image-suggestion-${suggestion}`}
                                                  type="button"
                                                  onMouseDown={(event) => {
                                                    event.preventDefault();
                                                  }}
                                                  onClick={() => {
                                                    setGeminiImageModelInput(
                                                      suggestion,
                                                    );
                                                    setActiveRuntimeModelField(
                                                      null,
                                                    );
                                                  }}
                                                  className="block w-full px-2.5 py-1.5 text-left text-xs text-main transition hover:bg-[var(--surface-2)]"
                                                >
                                                  {suggestion}
                                                </button>
                                              ),
                                            )
                                          ) : (
                                            <p className="px-2.5 py-2 text-[0.72rem] text-muted">
                                              No saved model suggestions yet.
                                            </p>
                                          )}
                                        </div>
                                      ) : null}
                                    </div>

                                    <p className="text-[0.72rem] text-muted">
                                      Max {RUNTIME_MODEL_NAME_MAX_LENGTH}{" "}
                                      characters.
                                    </p>
                                  </div>
                                </article>
                              </>
                            )}
                          </div>
                        </article>

                        <article className="surface-glass mt-4 rounded-3xl p-5">
                          <div className="flex flex-wrap items-end justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-semibold text-main">
                                System prompts
                              </h3>
                              <p className="text-sm text-muted">
                                Edit AI instruction templates used by topic,
                                slide, and image generation flows.
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  void fetchSystemPrompts();
                                }}
                                disabled={
                                  !session ||
                                  isSystemPromptsLoading ||
                                  savingSystemPromptKey !== null
                                }
                                aria-label="Reload system prompts"
                                title="Reload system prompts"
                                className="inline-flex size-9 items-center justify-center rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] text-main transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isSystemPromptsLoading ? (
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
                                  Reload system prompts
                                </span>
                              </button>
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                            {showSystemPromptsSkeleton ? (
                              Array.from({ length: 4 }).map((_, index) => (
                                <article
                                  key={`system-prompt-skeleton-${index}`}
                                  className="h-full rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] p-3"
                                >
                                  <SkeletonBlock className="h-4 w-48" />
                                  <SkeletonBlock className="mt-2 h-3 w-3/4" />
                                  <SkeletonBlock className="mt-4 h-32 w-full" />
                                  <SkeletonBlock className="mt-3 h-8 w-28" />
                                </article>
                              ))
                            ) : systemPrompts.length === 0 ? (
                              <p className="col-span-full rounded-xl border border-dashed border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-4 text-sm text-muted">
                                No system prompts found.
                              </p>
                            ) : (
                              systemPrompts.map((prompt) => {
                                const draftValue =
                                  systemPromptInputs[prompt.key] ??
                                  prompt.content;
                                const normalizedDraftValue = draftValue.trim();
                                const hasChanges =
                                  normalizedDraftValue !==
                                  prompt.content.trim();
                                const isSavingPrompt =
                                  savingSystemPromptKey === prompt.key;

                                return (
                                  <article
                                    key={prompt.key}
                                    className="h-full rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] p-3"
                                  >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1 px-1 py-0.5">
                                        <h4 className="text-xs font-semibold tracking-wide text-main uppercase">
                                          {prompt.title}
                                        </h4>
                                        <p className="mt-0.5 text-[0.72rem] text-muted">
                                          {prompt.description}
                                        </p>
                                        <p className="mt-1 text-[0.7rem] text-muted">
                                          Key:{" "}
                                          <span className="font-mono text-main">
                                            {prompt.key}
                                          </span>
                                        </p>
                                      </div>

                                      <div className="flex flex-wrap items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            void handleSaveSystemPrompt(
                                              prompt.key,
                                            );
                                          }}
                                          disabled={
                                            isSystemPromptsLoading ||
                                            savingSystemPromptKey !== null ||
                                            !normalizedDraftValue ||
                                            !hasChanges
                                          }
                                          className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-semibold text-main transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                          {isSavingPrompt ? (
                                            <Loader2
                                              className="size-3.5 animate-spin"
                                              aria-hidden="true"
                                            />
                                          ) : (
                                            <Save
                                              className="size-3.5"
                                              aria-hidden="true"
                                            />
                                          )}
                                          {isSavingPrompt
                                            ? "Saving"
                                            : "Save prompt"}
                                        </button>
                                      </div>
                                    </div>

                                    <textarea
                                      value={draftValue}
                                      onChange={(event) => {
                                        handleSystemPromptInputChange(
                                          prompt.key,
                                          event.target.value,
                                        );
                                      }}
                                      rows={8}
                                      className="mt-3 w-full min-h-[11rem] resize-y rounded-xl border border-[var(--surface-border)] bg-[var(--surface-1)] px-3 py-2 text-xs leading-6 text-main outline-none focus:border-[var(--accent)]"
                                    />

                                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[0.72rem] text-muted">
                                      <p>
                                        Updated: {formatDate(prompt.updatedAt)}
                                      </p>
                                      <p>
                                        {normalizedDraftValue.length} characters
                                      </p>
                                    </div>
                                  </article>
                                );
                              })
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

                            <div className="flex flex-wrap gap-2">
                              <input
                                value={userSearch}
                                onChange={(event) => {
                                  setUserSearch(event.target.value);
                                }}
                                placeholder="Search username, name, surname..."
                                className="w-48 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-main outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                              />

                              <select
                                value={userRegistrationFilter}
                                onChange={(event) => {
                                  setUserRegistrationFilter(
                                    event.target
                                      .value as UserRegistrationFilter,
                                  );
                                }}
                                className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-main outline-none focus:border-[var(--accent)]"
                              >
                                <option value="all">All users</option>
                                <option value="registered">Registered</option>
                                <option value="unregistered">
                                  Not registered
                                </option>
                              </select>

                              <select
                                value={userSortOrder}
                                onChange={(event) => {
                                  setUserSortOrder(
                                    event.target.value as SortOrder,
                                  );
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

                              <button
                                type="button"
                                onClick={() => {
                                  void handleSyncAllUserProfileImages();
                                }}
                                disabled={isSyncingUserProfileImages}
                                className="inline-flex items-center gap-2 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-xs font-medium text-main disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isSyncingUserProfileImages ? (
                                  <Loader2
                                    className="size-3.5 animate-spin"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <RefreshCw
                                    className="size-3.5"
                                    aria-hidden="true"
                                  />
                                )}
                                Sync profiles
                              </button>
                            </div>
                          </div>

                          {profileSyncJob ? (
                            <div className="mt-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-muted">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p>
                                  Sync job #{profileSyncJob.id}:{" "}
                                  {profileSyncJob.status} -{" "}
                                  {profileSyncJob.processed}/
                                  {profileSyncJob.totalUsers} (
                                  {profileSyncJob.progressPercent.toFixed(1)}%)
                                </p>
                                <p>
                                  profile fields{" "}
                                  {profileSyncJob.profileFieldsUpdated} |
                                  updated {profileSyncJob.updated} | deactivated{" "}
                                  {profileSyncJob.deactivated} | failed{" "}
                                  {profileSyncJob.failed}
                                </p>
                              </div>
                            </div>
                          ) : null}

                          <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--surface-border)]">
                            <table className="min-w-full text-sm">
                              <thead className="bg-[var(--surface-2)] text-left text-[0.72rem] tracking-[0.12em] text-muted uppercase">
                                <tr>
                                  <th className="px-3 py-2">User</th>
                                  <th className="px-3 py-2">Telegram</th>
                                  <th className="px-3 py-2">Joined</th>
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
                                            <SkeletonBlock className="h-4 w-32" />
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
                                          <div className="flex items-center gap-2">
                                            {user.profileImageUrl ? (
                                              <AvatarCircles
                                                avatarUrls={[
                                                  {
                                                    imageUrl:
                                                      user.profileImageUrl,
                                                    profileUrl: user.username
                                                      ? `https://t.me/${user.username}`
                                                      : undefined,
                                                    alt: user.firstName
                                                      ? `${user.firstName} profile photo`
                                                      : "User profile photo",
                                                  },
                                                ]}
                                              />
                                            ) : (
                                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--surface-border)] bg-[var(--surface-2)] text-[0.65rem] font-semibold text-muted">
                                                {(
                                                  user.firstName?.[0] ??
                                                  user.lastName?.[0] ??
                                                  "?"
                                                ).toUpperCase()}
                                              </span>
                                            )}

                                            <div>
                                              <p className="font-medium">
                                                {[user.firstName, user.lastName]
                                                  .filter(Boolean)
                                                  .join(" ") || "Unknown user"}
                                              </p>
                                              <p className="text-xs text-muted">
                                                {user.username ? (
                                                  <a
                                                    href={`https://t.me/${user.username}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="underline decoration-transparent transition hover:decoration-current"
                                                  >
                                                    @{user.username}
                                                  </a>
                                                ) : (
                                                  "@no_username"
                                                )}
                                              </p>
                                            </div>
                                          </div>
                                        </td>
                                        <td className="px-3 py-2 text-main">
                                          {user.telegramId}
                                        </td>
                                        <td className="px-3 py-2 text-main">
                                          {formatDate(user.createdAt)}
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
                                Review presentation records and mark entries as
                                failed when needed.
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
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

                              <select
                                value={presentationLanguage}
                                onChange={(event) => {
                                  setPresentationLanguage(
                                    event.target
                                      .value as PresentationLanguageFilter,
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
                                  setPresentationSortOrder(
                                    event.target.value as SortOrder,
                                  );
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

                                              {item.metadata?.downloadUrl ? (
                                                <a
                                                  href={
                                                    item.metadata.downloadUrl
                                                  }
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  aria-label={`Download presentation #${item.id}`}
                                                  title="Download presentation"
                                                  className="inline-flex size-7 items-center justify-center rounded-lg border border-[var(--surface-border)] bg-[var(--surface-2)] text-main"
                                                >
                                                  <Download
                                                    className="size-3.5"
                                                    aria-hidden="true"
                                                  />
                                                  <span className="sr-only">
                                                    Download presentation
                                                  </span>
                                                </a>
                                              ) : null}

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
                            Send broadcast messages and review delivery history.
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
                                  ref={broadcastMessageInputRef}
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

                                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-1)] p-2">
                                  <button
                                    type="button"
                                    onMouseDown={(event) => {
                                      event.preventDefault();
                                    }}
                                    onClick={() => {
                                      applyBroadcastFormatting("bold");
                                    }}
                                    disabled={isBroadcastSending}
                                    aria-label="Apply bold formatting"
                                    title="Bold (**text**)"
                                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-2)] px-2 text-xs text-main transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <Bold
                                      className="size-3.5"
                                      aria-hidden="true"
                                    />
                                    Bold
                                  </button>

                                  <button
                                    type="button"
                                    onMouseDown={(event) => {
                                      event.preventDefault();
                                    }}
                                    onClick={() => {
                                      applyBroadcastFormatting("italic");
                                    }}
                                    disabled={isBroadcastSending}
                                    aria-label="Apply italic formatting"
                                    title="Italic (__text__)"
                                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-2)] px-2 text-xs text-main transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <Italic
                                      className="size-3.5"
                                      aria-hidden="true"
                                    />
                                    Italic
                                  </button>

                                  <button
                                    type="button"
                                    onMouseDown={(event) => {
                                      event.preventDefault();
                                    }}
                                    onClick={() => {
                                      applyBroadcastFormatting("code");
                                    }}
                                    disabled={isBroadcastSending}
                                    aria-label="Apply code formatting"
                                    title="Code (`text`)"
                                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-2)] px-2 text-xs text-main transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <Code2
                                      className="size-3.5"
                                      aria-hidden="true"
                                    />
                                    Code
                                  </button>

                                  <button
                                    type="button"
                                    onMouseDown={(event) => {
                                      event.preventDefault();
                                    }}
                                    onClick={() => {
                                      applyBroadcastFormatting("link");
                                    }}
                                    disabled={isBroadcastSending}
                                    aria-label="Apply link formatting"
                                    title="Link ([text](https://...))"
                                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-2)] px-2 text-xs text-main transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <Link2
                                      className="size-3.5"
                                      aria-hidden="true"
                                    />
                                    Link
                                  </button>

                                  <button
                                    type="button"
                                    onMouseDown={(event) => {
                                      event.preventDefault();
                                    }}
                                    onClick={() => {
                                      applyBroadcastFormatting("spoiler");
                                    }}
                                    disabled={isBroadcastSending}
                                    aria-label="Apply spoiler formatting"
                                    title="Spoiler (||text||)"
                                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-2)] px-2 text-xs text-main transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <EyeOff
                                      className="size-3.5"
                                      aria-hidden="true"
                                    />
                                    Spoiler
                                  </button>
                                </div>

                                <p className="text-xs text-muted">
                                  Select text in the message box, then click a
                                  formatting button. Links must use
                                  <span className="mx-1 font-medium text-main">
                                    http://
                                  </span>
                                  or
                                  <span className="mx-1 font-medium text-main">
                                    https://
                                  </span>
                                  .
                                </p>

                                <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-1)] p-3">
                                  <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">
                                    Preview
                                  </p>

                                  {broadcastMessage.trim() ? (
                                    <div
                                      className={cn(
                                        "mt-2",
                                        BROADCAST_FORMATTED_TEXT_CLASS,
                                      )}
                                      dangerouslySetInnerHTML={{
                                        __html: broadcastMessagePreviewHtml,
                                      }}
                                    />
                                  ) : (
                                    <p className="mt-2 text-sm text-muted">
                                      Type a message to preview formatting.
                                    </p>
                                  )}
                                </div>

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

                                {broadcastImageFile &&
                                broadcastImagePreviewUrl ? (
                                  <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-1)] p-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="text-sm font-medium text-main">
                                          {broadcastImageFile.name}
                                        </p>
                                        <p className="text-xs text-muted">
                                          {(
                                            broadcastImageFile.size / 1024
                                          ).toFixed(1)}{" "}
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
                            </div>

                            <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-2)] p-4">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold tracking-wide text-main uppercase">
                                  Broadcasted messages
                                </p>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void fetchBroadcastCurrentPage();
                                  }}
                                  disabled={
                                    !session || isBroadcastHistoryLoading
                                  }
                                  aria-label="Reload broadcast messages"
                                  title="Reload broadcast messages"
                                  className="inline-flex size-9 items-center justify-center rounded-xl border border-[var(--surface-border)] bg-[var(--surface-1)] text-main transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isBroadcastHistoryLoading ? (
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
                                    Reload broadcast messages
                                  </span>
                                </button>
                              </div>

                              <div className="mt-3 space-y-3">
                                <div className="max-h-[30rem] space-y-3 overflow-y-auto pr-1">
                                  {isBroadcastHistoryLoading ? (
                                    Array.from({ length: 3 }).map(
                                      (_, index) => (
                                        <div
                                          key={`broadcast-history-skeleton-${index}`}
                                          className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-1)] p-3"
                                        >
                                          <SkeletonBlock className="h-3 w-28" />
                                          <SkeletonBlock className="mt-2 h-4 w-full" />
                                          <SkeletonBlock className="mt-3 h-20 w-full rounded-xl" />
                                        </div>
                                      ),
                                    )
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
                                              : (item.adminName ??
                                                "Unknown admin")}
                                          </p>
                                        </div>

                                        <div
                                          className={cn(
                                            "mt-2",
                                            BROADCAST_FORMATTED_TEXT_CLASS,
                                          )}
                                          dangerouslySetInnerHTML={{
                                            __html:
                                              formatBroadcastMessageToHtml(
                                                item.message,
                                              ),
                                          }}
                                        />

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
                                          Recipients: {item.recipients}, sent:{" "}
                                          {item.sent}, failed: {item.failed},
                                          pending:{" "}
                                          {getPendingRecipientsCount(
                                            item.recipients,
                                            item.sent,
                                            item.failed,
                                          )}
                                        </p>
                                      </article>
                                    ))
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--surface-border)] pt-3 text-xs text-muted">
                                  <p>
                                    Page {broadcastPage} -{" "}
                                    {broadcastHistory.length} shown of{" "}
                                    {broadcastTotalCount}
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void fetchBroadcastPreviousPage();
                                      }}
                                      disabled={
                                        isBroadcastHistoryLoading ||
                                        broadcastPage <= 1
                                      }
                                      className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-1)] px-2 py-1 text-main disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      Prev
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void fetchBroadcastNextPage();
                                      }}
                                      disabled={
                                        isBroadcastHistoryLoading ||
                                        !broadcastPageInfo.hasNextPage ||
                                        !broadcastPageInfo.endCursor
                                      }
                                      className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-1)] px-2 py-1 text-main disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      Next
                                    </button>
                                  </div>
                                </div>
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
                            {isSuperAdmin
                              ? "Manage admin accounts, including creating, updating, and removing access."
                              : "Manage your own account details."}
                          </p>

                          {isSuperAdmin ? (
                            <div className="mt-4 grid gap-4 lg:grid-cols-2">
                              <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-2)] p-3">
                                <p className="text-xs font-semibold tracking-wide text-main uppercase">
                                  Admin list
                                </p>
                                <div className="mt-3 space-y-2">
                                  {showAdminsSkeleton ? (
                                    Array.from({ length: 3 }).map(
                                      (_, index) => (
                                        <div
                                          key={`admins-skeleton-${index}`}
                                          className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-1)] px-3 py-2"
                                        >
                                          <SkeletonBlock className="h-4 w-28" />
                                          <SkeletonBlock className="mt-2 h-3 w-20" />
                                        </div>
                                      ),
                                    )
                                  ) : admins.length === 0 ? (
                                    <p className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-muted">
                                      No admins found.
                                    </p>
                                  ) : (
                                    admins.map((admin) => {
                                      const isSelfAdmin =
                                        admin.id === profile?.id;

                                      return (
                                        <div
                                          key={admin.id}
                                          className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-1)] px-3 py-2"
                                        >
                                          <div className="flex items-start justify-between gap-2">
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

                                          <div className="mt-2 flex flex-wrap gap-2">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                startEditingAdmin(admin);
                                              }}
                                              aria-label={`Edit @${admin.username}`}
                                              title={`Edit @${admin.username}`}
                                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-2)] px-2 py-1 text-xs text-main"
                                            >
                                              <Pencil
                                                className="size-3"
                                                aria-hidden="true"
                                              />
                                              Edit
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() => {
                                                handleUpdateAdminPassword(
                                                  admin,
                                                );
                                              }}
                                              disabled={
                                                updatingPasswordAdminId ===
                                                admin.id
                                              }
                                              aria-label={`Update password for @${admin.username}`}
                                              title={`Update password for @${admin.username}`}
                                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-2)] px-2 py-1 text-xs text-main disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                              {updatingPasswordAdminId ===
                                              admin.id ? (
                                                <Loader2
                                                  className="size-3 animate-spin"
                                                  aria-hidden="true"
                                                />
                                              ) : (
                                                <KeyRound
                                                  className="size-3"
                                                  aria-hidden="true"
                                                />
                                              )}
                                              Password
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() => {
                                                handleDeleteAdmin(admin);
                                              }}
                                              disabled={
                                                deletingAdminId === admin.id ||
                                                isSelfAdmin
                                              }
                                              aria-label={`Delete @${admin.username}`}
                                              title={
                                                isSelfAdmin
                                                  ? "You cannot delete your own account"
                                                  : `Delete @${admin.username}`
                                              }
                                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--danger-btn-border)] bg-[var(--danger-btn-bg)] px-2 py-1 text-xs text-[var(--danger-btn-text)] disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                              {deletingAdminId === admin.id ? (
                                                <Loader2
                                                  className="size-3 animate-spin"
                                                  aria-hidden="true"
                                                />
                                              ) : (
                                                <Trash2
                                                  className="size-3"
                                                  aria-hidden="true"
                                                />
                                              )}
                                              Delete
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              </div>

                              <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-2)] p-3">
                                <p className="text-xs font-semibold tracking-wide text-main uppercase">
                                  {editingAdminId === null
                                    ? "Create admin"
                                    : "Edit admin"}
                                </p>

                                <form
                                  className="mt-3 grid gap-2 sm:grid-cols-2"
                                  onSubmit={
                                    editingAdminId === null
                                      ? handleCreateAdmin
                                      : handleUpdateAdmin
                                  }
                                >
                                  <input
                                    value={
                                      editingAdminId === null
                                        ? adminName
                                        : editingAdminName
                                    }
                                    onChange={(event) => {
                                      if (editingAdminId === null) {
                                        setAdminName(event.target.value);
                                        return;
                                      }

                                      setEditingAdminName(event.target.value);
                                    }}
                                    placeholder="Name"
                                    className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-main outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                                    required
                                  />

                                  <input
                                    value={
                                      editingAdminId === null
                                        ? adminUsername
                                        : editingAdminUsername
                                    }
                                    onChange={(event) => {
                                      if (editingAdminId === null) {
                                        setAdminUsername(event.target.value);
                                        return;
                                      }

                                      setEditingAdminUsername(
                                        event.target.value,
                                      );
                                    }}
                                    placeholder="Username"
                                    className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-main outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                                    required
                                  />

                                  <input
                                    value={
                                      editingAdminId === null
                                        ? adminPassword
                                        : editingAdminPassword
                                    }
                                    onChange={(event) => {
                                      if (editingAdminId === null) {
                                        setAdminPassword(event.target.value);
                                        return;
                                      }

                                      setEditingAdminPassword(
                                        event.target.value,
                                      );
                                    }}
                                    placeholder={
                                      editingAdminId === null
                                        ? "Password"
                                        : "New password (optional)"
                                    }
                                    type="password"
                                    className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-main outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                                    required={editingAdminId === null}
                                  />

                                  <select
                                    value={
                                      editingAdminId === null
                                        ? adminRole
                                        : editingAdminRole
                                    }
                                    onChange={(event) => {
                                      if (editingAdminId === null) {
                                        setAdminRole(
                                          event.target.value as AdminRole,
                                        );
                                        return;
                                      }

                                      setEditingAdminRole(
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
                                    disabled={
                                      isCreatingAdmin || isUpdatingAdmin
                                    }
                                    aria-label={
                                      editingAdminId === null
                                        ? "Create admin"
                                        : "Save admin"
                                    }
                                    title={
                                      editingAdminId === null
                                        ? "Create admin"
                                        : "Save admin"
                                    }
                                    className="sm:col-span-2 inline-flex items-center justify-center rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-main"
                                  >
                                    {isCreatingAdmin || isUpdatingAdmin ? (
                                      <Loader2
                                        className="size-4 animate-spin"
                                        aria-hidden="true"
                                      />
                                    ) : editingAdminId === null ? (
                                      <UserPlus
                                        className="size-4"
                                        aria-hidden="true"
                                      />
                                    ) : (
                                      <Save
                                        className="size-4"
                                        aria-hidden="true"
                                      />
                                    )}
                                    <span className="sr-only">
                                      {editingAdminId === null
                                        ? "Create admin"
                                        : "Save admin"}
                                    </span>
                                  </button>

                                  {editingAdminId !== null ? (
                                    <button
                                      type="button"
                                      onClick={clearEditingAdmin}
                                      className="sm:col-span-2 inline-flex items-center justify-center rounded-xl border border-[var(--surface-border)] bg-[var(--surface-1)] px-3 py-2 text-main"
                                    >
                                      Cancel editing
                                    </button>
                                  ) : null}
                                </form>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-2)] p-3">
                              <p className="text-xs font-semibold tracking-wide text-main uppercase">
                                My admin profile
                              </p>
                              <p className="mt-2 text-xs text-muted">
                                You can update your own name, username, and
                                password. Role changes are restricted to
                                SUPERADMIN.
                              </p>

                              <form
                                className="mt-3 grid gap-2 sm:grid-cols-2"
                                onSubmit={handleUpdateOwnAdmin}
                              >
                                <input
                                  value={ownAdminName}
                                  onChange={(event) => {
                                    setOwnAdminName(event.target.value);
                                  }}
                                  placeholder="Name"
                                  className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-main outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                                  required
                                />

                                <input
                                  value={ownAdminUsername}
                                  onChange={(event) => {
                                    setOwnAdminUsername(event.target.value);
                                  }}
                                  placeholder="Username"
                                  className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-main outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                                  required
                                />

                                <input
                                  value={ownAdminPassword}
                                  onChange={(event) => {
                                    setOwnAdminPassword(event.target.value);
                                  }}
                                  placeholder="New password (optional)"
                                  type="password"
                                  className="sm:col-span-2 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-main outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                                />

                                <button
                                  type="submit"
                                  disabled={isUpdatingOwnAdmin}
                                  className="sm:col-span-2 inline-flex items-center justify-center rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-main disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isUpdatingOwnAdmin ? (
                                    <Loader2
                                      className="size-4 animate-spin"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <Save
                                      className="size-4"
                                      aria-hidden="true"
                                    />
                                  )}
                                  <span className="sr-only">
                                    Save my admin profile
                                  </span>
                                </button>
                              </form>
                            </div>
                          )}
                        </article>
                      </section>
                    ) : null}
                  </div>
                </>
              )}

              {adminPendingPasswordUpdate ? (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
                  onClick={closeUpdatePasswordDialog}
                >
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Update password for @${adminPendingPasswordUpdate.username}`}
                    className="surface-glass relative w-full max-w-md overflow-hidden rounded-2xl p-5"
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <ShineBorder
                      borderWidth={1}
                      duration={9}
                      shineColor={[
                        "rgba(56,189,248,0.52)",
                        "rgba(14,165,233,0.3)",
                      ]}
                    />

                    <p className="text-xs font-semibold tracking-[0.14em] uppercase text-muted">
                      Secure action
                    </p>
                    <h4 className="mt-2 text-lg font-semibold text-main">
                      Update password for @{adminPendingPasswordUpdate.username}
                    </h4>
                    <p className="mt-2 text-sm text-muted">
                      Enter a new password.
                    </p>

                    <form
                      className="mt-4 space-y-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void confirmUpdateAdminPassword();
                      }}
                    >
                      <input
                        value={adminPasswordUpdateInput}
                        onChange={(event) => {
                          setAdminPasswordUpdateInput(event.target.value);
                        }}
                        placeholder="New password"
                        type="password"
                        autoComplete="new-password"
                        className="w-full rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-main outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                        required
                      />

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={closeUpdatePasswordDialog}
                          disabled={
                            updatingPasswordAdminId ===
                            adminPendingPasswordUpdate.id
                          }
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-main disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <XCircle className="size-4" aria-hidden="true" />
                          Cancel
                        </button>

                        <button
                          type="submit"
                          disabled={
                            updatingPasswordAdminId ===
                            adminPendingPasswordUpdate.id
                          }
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--info-btn-border)] bg-[var(--info-btn-bg-strong)] px-3 py-2 text-sm text-[var(--info-btn-text)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {updatingPasswordAdminId ===
                          adminPendingPasswordUpdate.id ? (
                            <Loader2
                              className="size-4 animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <KeyRound className="size-4" aria-hidden="true" />
                          )}
                          Update
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              ) : null}

              {adminPendingDelete ? (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
                  onClick={closeDeleteAdminDialog}
                >
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Delete @${adminPendingDelete.username}`}
                    className="surface-glass relative w-full max-w-md overflow-hidden rounded-2xl p-5"
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <ShineBorder
                      borderWidth={1}
                      duration={9}
                      shineColor={[
                        "rgba(251,113,133,0.52)",
                        "rgba(244,63,94,0.3)",
                      ]}
                    />

                    <p className="text-xs font-semibold tracking-[0.14em] uppercase text-muted">
                      Confirm action
                    </p>
                    <h4 className="mt-2 text-lg font-semibold text-main">
                      Delete admin @{adminPendingDelete.username}?
                    </h4>
                    <p className="mt-2 text-sm text-muted">
                      This action is permanent and cannot be undone.
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={closeDeleteAdminDialog}
                        disabled={deletingAdminId === adminPendingDelete.id}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-main disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <XCircle className="size-4" aria-hidden="true" />
                        Cancel
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          void confirmDeleteAdmin();
                        }}
                        disabled={deletingAdminId === adminPendingDelete.id}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--danger-btn-border)] bg-[var(--danger-btn-bg-strong)] px-3 py-2 text-sm text-[var(--danger-btn-text)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingAdminId === adminPendingDelete.id ? (
                          <Loader2
                            className="size-4 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Trash2 className="size-4" aria-hidden="true" />
                        )}
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

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
                        <p className="mt-1">
                          File size: {formatFileSizeMb(selectedPresentation.metadata?.fileSizeKb)}
                        </p>
                        <p className="mt-1 break-all">
                          Download:{" "}
                          {selectedPresentation.metadata?.downloadUrl ? (
                            <a
                              href={selectedPresentation.metadata.downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold text-main underline"
                            >
                              Download PDF
                            </a>
                          ) : (
                            "-"
                          )}
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
