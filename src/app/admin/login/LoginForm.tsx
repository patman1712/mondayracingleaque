"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const res = await signIn("credentials", {
          redirect: false,
          email,
          password,
          callbackUrl
        });

        setLoading(false);
        if (!res || res.error) {
          setError("Login fehlgeschlagen.");
          return;
        }
        router.push(res.url ?? "/admin");
      }}
    >
      <div>
        <label className="mb-1 block text-xs font-semibold text-white/70">
          Email
        </label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none ring-0 focus:border-white/25"
          placeholder="admin@mrl.de"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-white/70">
          Passwort
        </label>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none ring-0 focus:border-white/25"
          type="password"
        />
      </div>
      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
      >
        {loading ? "..." : "Einloggen"}
      </button>
    </form>
  );
}
