import { NextRequest } from "next/server";
import { proxyAuthedAdminRequest } from "@/lib/admin-proxy";

export async function GET(request: NextRequest) {
  const queryString = request.nextUrl.searchParams.toString();
  const path = queryString
    ? `/admin/presentations?${queryString}`
    : "/admin/presentations";
  return proxyAuthedAdminRequest(path);
}
