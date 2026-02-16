import { redirect } from "next/navigation";
import LoginForm from "@/components/login-form";
import { hasStoredAdminSession } from "@/lib/admin-session";

export default async function LoginPage() {
  const hasSession = await hasStoredAdminSession();

  if (hasSession) {
    redirect("/");
  }

  return <LoginForm />;
}
