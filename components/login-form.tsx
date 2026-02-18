"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import ThemeToggle from "@/components/theme-toggle";

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
    <div className="login-shell relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-6 sm:px-6 sm:py-8">
      <div
        className="login-backdrop pointer-events-none absolute inset-0 -z-10"
        style={{
          background: "var(--login-page-bg)",
        }}
      />

      <div className="mx-auto w-full max-w-[460px]">
        <section className={`${panelClass} login-panel p-6 sm:p-8`}>
          <div className="mb-5 flex justify-end">
            <ThemeToggle className="w-full max-w-[220px]" />
          </div>

          <p className="login-eyebrow text-xs font-mono uppercase tracking-[0.22em] text-[#4f6a81]">
            Sign in
          </p>
          <h2 className="login-title mt-2 text-3xl font-semibold text-[#10202f]">Admin Login</h2>
          <p className="login-copy mt-2 text-sm text-[#5d7386]">
            Enter your admin credentials to open the operations dashboard.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Input
              label="Username"
              value={username}
              onChange={setUsername}
              autoComplete="username"
              isDisabled={submitting}
              wrapperClassName="login-input-wrapper !h-11 !rounded-xl !bg-white !ring-1 !ring-[#d4dee6] focus-within:!ring-[#4f84ac]"
              inputClassName="login-input-text !px-3 !py-0 !text-sm !text-[#173248]"
              className="login-input-field [&_[data-label]]:!text-sm [&_[data-label]]:!text-[#2b495f]"
            />

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              isDisabled={submitting}
              wrapperClassName="login-input-wrapper !h-11 !rounded-xl !bg-white !ring-1 !ring-[#d4dee6] focus-within:!ring-[#4f84ac]"
              inputClassName="login-input-text !px-3 !py-0 !text-sm !text-[#173248]"
              className="login-input-field [&_[data-label]]:!text-sm [&_[data-label]]:!text-[#2b495f]"
            />

            {error ? (
              <p className="login-error rounded-xl border border-[#f4c5c5] bg-[#fff2f2] px-3 py-2 text-sm text-[#9a2c2c]">
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              isDisabled={submitting}
              className="login-submit-btn h-11 w-full rounded-xl !bg-[#173d59] !text-sm !font-semibold !text-white hover:!bg-[#204e72] disabled:!opacity-60"
            >
              {submitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
