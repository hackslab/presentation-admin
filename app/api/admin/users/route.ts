import { NextRequest, NextResponse } from "next/server";
import { botApiRequest, readBotApiPayload } from "@/lib/bot-api";

export async function GET(request: NextRequest) {
  const queryString = request.nextUrl.searchParams.toString();
  const path = queryString ? `/admin/users?${queryString}` : "/admin/users";

  const response = await botApiRequest(path);
  const payload = await readBotApiPayload(response);
  return NextResponse.json(payload, { status: response.status });
}
