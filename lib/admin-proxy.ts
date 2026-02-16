import { NextResponse } from "next/server";
import {
  clearStoredAdminTokens,
  readStoredAdminTokens,
  setStoredAdminTokens,
  type StoredAdminTokens,
} from "@/lib/admin-session";
import { botApiRequest, readBotApiPayload } from "@/lib/bot-api";

type RefreshResponsePayload = {
  accessToken?: string;
  refreshToken?: string;
};

function withBearerToken(init: RequestInit, accessToken: string): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${accessToken}`);

  return {
    ...init,
    headers,
  };
}

function parseTokens(payload: unknown): StoredAdminTokens | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const accessToken = (payload as RefreshResponsePayload).accessToken;
  const refreshToken = (payload as RefreshResponsePayload).refreshToken;

  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
  };
}

async function refreshSessionTokens(refreshToken: string) {
  const response = await botApiRequest("/admin/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = await readBotApiPayload(response);
  return parseTokens(payload);
}

function unauthorizedResponse() {
  const response = NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  clearStoredAdminTokens(response);
  return response;
}

export async function proxyAuthedAdminRequest(
  path: string,
  init: RequestInit = {},
) {
  const stored = await readStoredAdminTokens();

  if (!stored.accessToken && !stored.refreshToken) {
    return unauthorizedResponse();
  }

  let activeTokens: StoredAdminTokens | null =
    stored.accessToken && stored.refreshToken
      ? {
          accessToken: stored.accessToken,
          refreshToken: stored.refreshToken,
        }
      : null;

  let refreshedTokens: StoredAdminTokens | null = null;

  if (!activeTokens && stored.refreshToken) {
    refreshedTokens = await refreshSessionTokens(stored.refreshToken);
    if (!refreshedTokens) {
      return unauthorizedResponse();
    }

    activeTokens = refreshedTokens;
  }

  if (!activeTokens) {
    return unauthorizedResponse();
  }

  let backendResponse = await botApiRequest(
    path,
    withBearerToken(init, activeTokens.accessToken),
  );

  if (backendResponse.status === 401 && activeTokens.refreshToken) {
    const retriedTokens = await refreshSessionTokens(activeTokens.refreshToken);
    if (!retriedTokens) {
      return unauthorizedResponse();
    }

    refreshedTokens = retriedTokens;
    activeTokens = retriedTokens;
    backendResponse = await botApiRequest(
      path,
      withBearerToken(init, activeTokens.accessToken),
    );
  }

  const payload = await readBotApiPayload(backendResponse);
  const response = NextResponse.json(payload, { status: backendResponse.status });

  if (backendResponse.status === 401) {
    clearStoredAdminTokens(response);
    return response;
  }

  if (refreshedTokens) {
    setStoredAdminTokens(response, refreshedTokens);
  }

  return response;
}
