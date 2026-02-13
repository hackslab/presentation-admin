import { NextResponse } from "next/server";
import { botApiRequest, readBotApiPayload } from "@/lib/bot-api";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const response = await botApiRequest(`/admin/presentations/${id}/fail`, {
    method: "POST",
  });

  const payload = await readBotApiPayload(response);
  return NextResponse.json(payload, { status: response.status });
}
