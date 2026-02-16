import { NextResponse } from "next/server";
import { proxyAuthedAdminRequest } from "@/lib/admin-proxy";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const { id } = await params;
  return proxyAuthedAdminRequest(`/admin/admins/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyAuthedAdminRequest(`/admin/admins/${id}`, {
    method: "DELETE",
  });
}
