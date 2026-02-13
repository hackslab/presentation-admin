import { NextResponse } from "next/server";
import { botApiRequest, readBotApiPayload } from "@/lib/bot-api";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const response = await botApiRequest("/admin/broadcast", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const payload = await readBotApiPayload(response);
  return NextResponse.json(payload, { status: response.status });
}
