"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type LoginResponse = {
  message?: string;
};

export default function LoginForm() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
      <div className="login-bg pointer-events-none absolute inset-0 -z-10" />

      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1.1fr)_460px]">
        <section className="panel-surface panel-enter hidden p-8 lg:block">
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

        <section className="panel-surface panel-enter p-6 sm:p-8">
          <p className="text-xs font-mono uppercase tracking-[0.22em] text-[#4f6a81]">
            Sign in
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-[#10202f]">Admin Login</h2>
          <p className="mt-2 text-sm text-[#5d7386]">
            Enter your admin credentials to open the operations dashboard.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block space-y-1">
              <span className="text-sm text-[#2b495f]">Username</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                disabled={submitting}
                className="h-11 w-full rounded-xl border border-[#d4dee6] bg-white px-3 text-sm text-[#173248] outline-none transition focus:border-[#4f84ac] disabled:cursor-not-allowed disabled:bg-[#f4f7fa]"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-[#2b495f]">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                disabled={submitting}
                className="h-11 w-full rounded-xl border border-[#d4dee6] bg-white px-3 text-sm text-[#173248] outline-none transition focus:border-[#4f84ac] disabled:cursor-not-allowed disabled:bg-[#f4f7fa]"
              />
            </label>

            {error ? (
              <p className="rounded-xl border border-[#f4c5c5] bg-[#fff2f2] px-3 py-2 text-sm text-[#9a2c2c]">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#173d59] px-4 text-sm font-semibold text-white transition hover:bg-[#204e72] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
