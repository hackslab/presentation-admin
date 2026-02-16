import { NextResponse } from "next/server";
import {
  clearStoredAdminTokens,
  readStoredAdminTokens,
} from "@/lib/admin-session";
import { botApiRequest } from "@/lib/bot-api";

export async function POST() {
  const storedTokens = await readStoredAdminTokens();

  if (storedTokens.accessToken) {
    const headers = new Headers();
    headers.set("authorization", `Bearer ${storedTokens.accessToken}`);

    try {
      await botApiRequest("/admin/auth/logout", {
        method: "POST",
        headers,
      });
    } catch {
      // Ignore network failures while logging out.
    }
  }

  const response = NextResponse.json({ success: true });
  clearStoredAdminTokens(response);
  return response;
}
