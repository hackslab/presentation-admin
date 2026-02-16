import { NextResponse } from "next/server";
import { proxyAuthedAdminRequest } from "@/lib/admin-proxy";

export async function GET() {
  return proxyAuthedAdminRequest("/admin/admins");
}

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

  return proxyAuthedAdminRequest("/admin/admins", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
