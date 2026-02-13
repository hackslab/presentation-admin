import { NextResponse } from "next/server";
import { botApiRequest, readBotApiPayload } from "@/lib/bot-api";

export async function GET() {
  const response = await botApiRequest("/admin/overview");
  const payload = await readBotApiPayload(response);
  return NextResponse.json(payload, { status: response.status });
}
