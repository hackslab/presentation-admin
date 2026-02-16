import { proxyAuthedAdminRequest } from "@/lib/admin-proxy";

export async function GET() {
  return proxyAuthedAdminRequest("/admin/auth/me");
}
