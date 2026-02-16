import { redirect } from "next/navigation";
import AdminDashboard from "@/components/admin-dashboard";
import { hasStoredAdminSession } from "@/lib/admin-session";

export default async function HomePage() {
  const hasSession = await hasStoredAdminSession();

  if (!hasSession) {
    redirect("/login");
  }

  return <AdminDashboard />;
}
