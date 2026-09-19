"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setToken } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@weather.local");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await res.json().catch(() => null)) as {
        token?: string;
        message?: string;
        errors?: Record<string, string[]>;
      } | null;
      if (!res.ok || !body?.token) {
        const detail = body?.errors ? Object.values(body.errors).flat().join(" ") : undefined;
        throw new Error(body?.message ?? detail ?? `Login gagal (${res.status})`);
      }
      setToken(body.token);
      router.push("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Masuk Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kredensial demo (seeder): <code>admin@weather.local</code> / <code>admin123</code>
        </p>
      </div>
      {error && <div className="rounded-lg border p-3 text-sm text-red-600">{error}</div>}
      <form onSubmit={submit} className="flex flex-col gap-2">
        <input
          className="rounded-md border px-3 py-2 text-sm"
          type="email"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="rounded-md border px-3 py-2 text-sm"
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Memeriksa…" : "Masuk"}
        </button>
      </form>
    </div>
  );
}
