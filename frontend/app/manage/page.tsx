"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { formatWib } from "@/lib/format";
import type { DeviceDetail, Sensor, SensorType } from "@/lib/types";

export default function ManagePage() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({ device_id: "", name: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [cal, setCal] = useState({ sensor_id: "", offset: "0", scale: "1" });

  const query = `/devices?${new URLSearchParams({
    ...(status ? { status } : {}),
    ...(q ? { q } : {}),
    page: String(page),
  }).toString()}`;
  const { data, error, isLoading, mutate } = useSWR(query, (p: string) =>
    api.raw<DeviceDetail[]>(p),
  );
  const sensors = useSWR("/sensors", (p: string) => api.raw<Sensor[]>(p));
  const types = useSWR("/sensor-types", (p: string) => api.get<SensorType[]>(p));

  const devices = data?.data ?? [];
  const pagination = data?.meta.pagination;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const created = await api.post<DeviceDetail & { api_key_plain: string }>("/devices", form);
      setMsg(`Device ${created.device_id} dibuat. API key (sekali tampil): ${created.api_key_plain}`);
      setForm({ device_id: "", name: "" });
      mutate();
    } catch (err) {
      setMsg(`Gagal: ${(err as Error).message}`);
    }
  }

  async function submitCalibration(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await api.post(`/sensors/${cal.sensor_id}/calibrations`, {
        offset: Number(cal.offset),
        scale: Number(cal.scale),
        effective_at: new Date().toISOString(),
      });
      setMsg(`Kalibrasi sensor ${cal.sensor_id} tersimpan.`);
    } catch (err) {
      setMsg(`Gagal: ${(err as Error).message}`);
    }
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-sm text-muted-foreground">← Overview</Link>
          <h1 className="text-xl font-semibold">Kelola Device & Sensor</h1>
        </div>
      </header>

      {msg && <div className="rounded-lg border p-3 text-sm">{msg}</div>}

      <section className="rounded-lg border p-4">
        <h2 className="mb-2 text-sm font-medium">Tambah device</h2>
        <form onSubmit={submit} className="flex flex-wrap gap-2">
          <input
            className="rounded-md border px-3 py-1.5 text-sm"
            placeholder="device_id (WS-…)"
            value={form.device_id}
            onChange={(e) => setForm({ ...form, device_id: e.target.value })}
            required
          />
          <input
            className="rounded-md border px-3 py-1.5 text-sm"
            placeholder="nama"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <button type="submit" className="rounded-md border px-3 py-1.5 text-sm">Simpan</button>
        </form>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-2 text-sm font-medium">Daftar device</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          <select
            className="rounded-md border px-2 py-1.5 text-sm"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          >
            <option value="">semua status</option>
            <option value="provisioned">provisioned</option>
            <option value="active">active</option>
            <option value="decommissioned">decommissioned</option>
          </select>
          <input
            className="rounded-md border px-3 py-1.5 text-sm"
            placeholder="cari…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
        </div>
        {isLoading && <div className="p-4 text-center text-sm text-muted-foreground">Memuat…</div>}
        {error && <div className="p-4 text-center text-sm text-red-600">Gagal: {(error as Error).message}</div>}
        {devices.length === 0 && !isLoading && (
          <div className="p-4 text-center text-sm text-muted-foreground">Tidak ada device.</div>
        )}
        {devices.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-3">Device</th>
                  <th className="py-1 pr-3">Status</th>
                  <th className="py-1 pr-3">Online</th>
                  <th className="py-1 pr-3">Terakhir</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.device_id} className="border-t">
                    <td className="py-1.5 pr-3">
                      <Link className="underline" href={`/devices/${d.device_id}`}>{d.device_id}</Link>
                      <span className="text-muted-foreground"> · {d.name}</span>
                    </td>
                    <td className="py-1.5 pr-3">{d.status}</td>
                    <td className="py-1.5 pr-3">{d.is_online ? "ya" : "tidak"}</td>
                    <td className="py-1.5 pr-3">{formatWib(d.last_seen_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pagination && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <button
                  className="rounded-md border px-2 py-1 disabled:opacity-50"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  ←
                </button>
                <span className="text-muted-foreground">
                  {pagination.current_page}/{pagination.last_page} · {pagination.total} total
                </span>
                <button
                  className="rounded-md border px-2 py-1 disabled:opacity-50"
                  disabled={page >= pagination.last_page}
                  onClick={() => setPage(page + 1)}
                >
                  →
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-2 text-sm font-medium">Input kalibrasi</h2>
        <form onSubmit={submitCalibration} className="flex flex-wrap gap-2">
          <select
            className="rounded-md border px-2 py-1.5 text-sm"
            value={cal.sensor_id}
            onChange={(e) => setCal({ ...cal, sensor_id: e.target.value })}
            required
          >
            <option value="">pilih sensor…</option>
            {(sensors.data?.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.serial} ({s.sensor_type})</option>
            ))}
          </select>
          <input
            className="w-24 rounded-md border px-3 py-1.5 text-sm"
            placeholder="offset"
            value={cal.offset}
            onChange={(e) => setCal({ ...cal, offset: e.target.value })}
          />
          <input
            className="w-24 rounded-md border px-3 py-1.5 text-sm"
            placeholder="scale"
            value={cal.scale}
            onChange={(e) => setCal({ ...cal, scale: e.target.value })}
          />
          <button type="submit" className="rounded-md border px-3 py-1.5 text-sm">Simpan</button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Tipe sensor: {((types.data ?? []) as SensorType[]).map((t) => t.code).join(", ") || "memuat…"}
        </p>
      </section>
    </div>
  );
}
