import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const ACCESS_TOKEN_MAX_AGE_SECONDS = 15 * 60;
const REFRESH_TOKEN_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export const ACCESS_TOKEN_COOKIE_NAME = "admin_access_token";
export const REFRESH_TOKEN_COOKIE_NAME = "admin_refresh_token";

export type StoredAdminTokens = {
  accessToken: string;
  refreshToken: string;
};

function baseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export async function readStoredAdminTokens() {
  const cookieStore = await cookies();

  return {
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value ?? null,
    refreshToken: cookieStore.get(REFRESH_TOKEN_COOKIE_NAME)?.value ?? null,
  };
}

export async function hasStoredAdminSession() {
  const tokens = await readStoredAdminTokens();
  return Boolean(tokens.accessToken || tokens.refreshToken);
}

export function setStoredAdminTokens(
  response: NextResponse,
  tokens: StoredAdminTokens,
) {
  response.cookies.set({
    ...baseCookieOptions(),
    name: ACCESS_TOKEN_COOKIE_NAME,
    value: tokens.accessToken,
    maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
  });

  response.cookies.set({
    ...baseCookieOptions(),
    name: REFRESH_TOKEN_COOKIE_NAME,
    value: tokens.refreshToken,
    maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
  });
}

export function clearStoredAdminTokens(response: NextResponse) {
  response.cookies.set({
    ...baseCookieOptions(),
    name: ACCESS_TOKEN_COOKIE_NAME,
    value: "",
    expires: new Date(0),
  });

  response.cookies.set({
    ...baseCookieOptions(),
    name: REFRESH_TOKEN_COOKIE_NAME,
    value: "",
    expires: new Date(0),
  });
}
