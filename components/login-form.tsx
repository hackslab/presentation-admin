"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";

type LoginResponse = {
  message?: string;
};

export default function LoginForm() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const panelClass =
    "rounded-2xl border border-[#dbe5ec] bg-[linear-gradient(160deg,rgba(255,255,255,0.95)_0%,rgba(247,251,254,0.95)_100%)] shadow-[0_16px_40px_rgba(26,44,63,0.1),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-[6px] animate-in fade-in slide-in-from-bottom-2 duration-500";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    if (!trimmedUsername || !trimmedPassword) {
      setError("Username and password are required.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          username: trimmedUsername,
          password: trimmedPassword,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as LoginResponse;
        setError(payload.message ?? "Unable to sign in.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Unable to sign in right now. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 sm:py-8">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(900px 380px at 80% -10%, rgba(197, 223, 245, 0.6) 0%, transparent 65%), radial-gradient(760px 360px at 0% 110%, rgba(255, 255, 255, 0.72) 0%, transparent 60%), linear-gradient(160deg, #d9e5f1 0%, #c5d3e3 100%)",
        }}
      />

      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1.1fr)_460px]">
        <section className={`${panelClass} hidden p-8 lg:block`}>
          <p className="text-xs font-mono uppercase tracking-[0.22em] text-[#4f6a81]">
            Telegram Operations
          </p>
          <h1 className="mt-3 text-4xl font-semibold text-[#10202f]">
            Control Room Access
          </h1>
          <p className="mt-3 max-w-xl text-base text-[#586f82]">
            This panel controls user insights, presentation queue actions, and
            outbound broadcasts. Access is restricted to authorized operators.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {[
              "Real-time queue monitoring",
              "Secure broadcast tooling",
              "User growth analytics",
              "Failure response controls",
            ].map((item) => (
              <div
                key={item}
                className="rounded-xl border border-[#dbe4ec] bg-[#f8fbfd] px-3 py-2 text-sm text-[#3f5b70]"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className={`${panelClass} p-6 sm:p-8`}>
          <p className="text-xs font-mono uppercase tracking-[0.22em] text-[#4f6a81]">
            Sign in
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-[#10202f]">Admin Login</h2>
          <p className="mt-2 text-sm text-[#5d7386]">
            Enter your admin credentials to open the operations dashboard.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Input
              label="Username"
              value={username}
              onChange={setUsername}
              autoComplete="username"
              isDisabled={submitting}
              wrapperClassName="!h-11 !rounded-xl !bg-white !ring-1 !ring-[#d4dee6] focus-within:!ring-[#4f84ac]"
              inputClassName="!px-3 !py-0 !text-sm !text-[#173248]"
              className="[&_[data-label]]:!text-sm [&_[data-label]]:!text-[#2b495f]"
            />

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              isDisabled={submitting}
              wrapperClassName="!h-11 !rounded-xl !bg-white !ring-1 !ring-[#d4dee6] focus-within:!ring-[#4f84ac]"
              inputClassName="!px-3 !py-0 !text-sm !text-[#173248]"
              className="[&_[data-label]]:!text-sm [&_[data-label]]:!text-[#2b495f]"
            />

            {error ? (
              <p className="rounded-xl border border-[#f4c5c5] bg-[#fff2f2] px-3 py-2 text-sm text-[#9a2c2c]">
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              isDisabled={submitting}
              className="h-11 w-full rounded-xl !bg-[#173d59] !text-sm !font-semibold !text-white hover:!bg-[#204e72] disabled:!opacity-60"
            >
              {submitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
