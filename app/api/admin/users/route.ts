import { NextRequest } from "next/server";
import { proxyAuthedAdminRequest } from "@/lib/admin-proxy";

export async function GET(request: NextRequest) {
  const queryString = request.nextUrl.searchParams.toString();
  const path = queryString ? `/admin/users?${queryString}` : "/admin/users";
  return proxyAuthedAdminRequest(path);
}
