import { NextResponse } from "next/server";
import {
  clearStoredAdminTokens,
  setStoredAdminTokens,
  type StoredAdminTokens,
} from "@/lib/admin-session";
import { botApiRequest, readBotApiPayload } from "@/lib/bot-api";

type LoginRequestBody = {
  username?: string;
  password?: string;
};

type LoginSuccessPayload = {
  accessToken?: string;
  refreshToken?: string;
  admin?: unknown;
};

function parseTokens(payload: unknown): StoredAdminTokens | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const accessToken = (payload as LoginSuccessPayload).accessToken;
  const refreshToken = (payload as LoginSuccessPayload).refreshToken;

  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
  };
}

export async function POST(request: Request) {
  let body: LoginRequestBody;

  try {
    body = (await request.json()) as LoginRequestBody;
  } catch {
    return NextResponse.json(
      { message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const username = body.username?.trim() ?? "";
  const password = body.password?.trim() ?? "";

  if (!username || !password) {
    return NextResponse.json(
      { message: "Username and password are required." },
      { status: 400 },
    );
  }

  const backendResponse = await botApiRequest("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

  const payload = await readBotApiPayload(backendResponse);
  if (!backendResponse.ok) {
    const response = NextResponse.json(payload, { status: backendResponse.status });

    if (backendResponse.status === 401) {
      clearStoredAdminTokens(response);
    }

    return response;
  }

  const tokens = parseTokens(payload);
  if (!tokens) {
    return NextResponse.json(
      { message: "Authentication response is invalid." },
      { status: 502 },
    );
  }

  const response = NextResponse.json({
    success: true,
    admin: (payload as LoginSuccessPayload).admin ?? null,
  });
  setStoredAdminTokens(response, tokens);
  return response;
}
