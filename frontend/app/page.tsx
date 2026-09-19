"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { clearToken } from "@/lib/api";
import { formatWib } from "@/lib/format";
import type { Overview } from "@/lib/types";

function State({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">{children}</div>;
}

export default function OverviewPage() {
  const router = useRouter();
  const { data, error, isLoading } = useSWR<{ devices: Overview["devices"]; counts: Overview["counts"] }>(
    "/dashboard/overview",
  );
  const overview = data as unknown as Overview | undefined;

  return (
    <div className="mx-auto flex min-h-svh max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Stasiun Cuaca</h1>
          <p className="text-sm text-muted-foreground">
            {overview
              ? `${overview.counts.online}/${overview.counts.total} online`
              : "Memuat…"}
            · auto-refresh 60 dtk
          </p>
        </div>
        <nav className="flex gap-2 text-sm">
          <Link className="rounded-md border px-3 py-1.5" href="/">Overview</Link>
          <Link className="rounded-md border px-3 py-1.5" href="/manage">Kelola</Link>
          <button
            className="rounded-md border px-3 py-1.5"
            onClick={() => { clearToken(); router.push("/login"); }}
          >
            Keluar
          </button>
        </nav>
      </header>

      {isLoading && <State>Memuat stasiun…</State>}
      {error && (
        <State>
          Gagal memuat: {(error as Error).message}
        </State>
      )}
      {overview && overview.devices.length === 0 && <State>Belum ada device. Tambahkan di halaman Kelola.</State>}
      {overview && overview.devices.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {overview.devices.map((d) => (
            <Link
              key={d.device_id}
              href={`/devices/${d.device_id}`}
              className="rounded-lg border p-4 transition hover:shadow"
            >
              <div className="flex items-center justify-between">
                <div className="font-medium">{d.name}</div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    d.is_online ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                  }`}
                >
                  {d.is_online ? "online" : "offline"}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {d.device_id} · {d.location ?? "—"}
              </div>
              <div className="mt-3 flex gap-4 text-sm">
                <div>
                  <span className="text-2xl font-semibold">{d.temp_air ?? "—"}</span>
                  <span className="text-xs text-muted-foreground"> °C</span>
                </div>
                <div>
                  <span className="text-2xl font-semibold">{d.humidity ?? "—"}</span>
                  <span className="text-xs text-muted-foreground"> %RH</span>
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Update: {formatWib(d.last_seen_at)}
                {!d.is_online && " · tidak mengirim > 15 mnt"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
