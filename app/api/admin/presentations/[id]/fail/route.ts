import { proxyAuthedAdminRequest } from "@/lib/admin-proxy";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyAuthedAdminRequest(`/admin/presentations/${id}/fail`, {
    method: "POST",
  });
}
