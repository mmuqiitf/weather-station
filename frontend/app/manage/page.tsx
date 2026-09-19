"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { api, clearToken } from "@/lib/api";
import { formatWib } from "@/lib/format";
import type { DeviceDetail, DeviceLocation, Sensor, SensorType } from "@/lib/types";

export default function ManagePage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [locationId, setLocationId] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({ device_id: "", name: "" });
  const [edit, setEdit] = useState({ device_id: "", name: "", status: "", location_id: "" });
  const [attach, setAttach] = useState({ device_id: "", sensor_id: "" });
  const [detach, setDetach] = useState({ device_id: "", sensor_id: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [cal, setCal] = useState({ sensor_id: "", offset: "0", scale: "1" });

  function resetPage() {
    setPage(1);
  }

  const query = `/devices?${new URLSearchParams({
    ...(status ? { status } : {}),
    ...(locationId ? { location_id: locationId } : {}),
    ...(q ? { q } : {}),
    page: String(page),
  }).toString()}`;
  const { data, error, isLoading, mutate } = useSWR(query, (p: string) =>
    api.raw<DeviceDetail[]>(p),
  );
  const sensors = useSWR("/sensors", (p: string) => api.raw<Sensor[]>(p));
  const types = useSWR("/sensor-types", (p: string) => api.get<SensorType[]>(p));
  const locations = useSWR("/locations", (p: string) => api.get<DeviceLocation[]>(p));

  const devices = data?.data ?? [];
  const pagination = data?.meta.pagination;

  function logout() {
    clearToken();
    router.push("/login");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const created = await api.post<DeviceDetail & { api_key_plain: string }>("/devices", form);
      setMsg(`Device ${created.device_id} dibuat. API key (sekali tampil): ${created.api_key_plain}`);
      setForm({ device_id: "", name: "" });
      mutate();
      sensors.mutate();
    } catch (err) {
      setMsg(`Gagal: ${(err as Error).message}`);
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const body: Record<string, string> = {};
      if (edit.name) body.name = edit.name;
      if (edit.status) body.status = edit.status;
      if (edit.location_id) body.location_id = edit.location_id;
      const updated = await api.patch<DeviceDetail>(`/devices/${edit.device_id}`, body);
      setMsg(`Device ${updated.device_id} diperbarui (status: ${updated.status}).`);
      setEdit({ device_id: "", name: "", status: "", location_id: "" });
      mutate();
    } catch (err) {
      setMsg(`Gagal: ${(err as Error).message}`);
    }
  }

  async function remove(deviceId: string) {
    if (!window.confirm(`Hapus (soft delete) device ${deviceId}? Histori tetap tersimpan.`)) return;
    setMsg(null);
    try {
      await api.del(`/devices/${deviceId}`);
      setMsg(`Device ${deviceId} dihapus (soft delete).`);
      mutate();
    } catch (err) {
      setMsg(`Gagal: ${(err as Error).message}`);
    }
  }

  async function submitAttach(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await api.post(`/devices/${attach.device_id}/sensors`, { sensor_id: Number(attach.sensor_id) });
      setMsg(`Sensor ${attach.sensor_id} dipasang ke ${attach.device_id}.`);
      setAttach({ device_id: "", sensor_id: "" });
      sensors.mutate();
    } catch (err) {
      setMsg(`Gagal: ${(err as Error).message}`);
    }
  }

  async function submitDetach(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await api.del(`/devices/${detach.device_id}/sensors/${detach.sensor_id}`);
      setMsg(`Sensor ${detach.sensor_id} dilepas dari ${detach.device_id} (riwayat tercatat).`);
      setDetach({ device_id: "", sensor_id: "" });
      sensors.mutate();
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

  const locationOptions = (locations.data ?? []) as DeviceLocation[];
  const sensorOptions = sensors.data?.data ?? [];

  return (
    <div className="mx-auto flex min-h-svh max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-sm text-muted-foreground">← Overview</Link>
          <h1 className="text-xl font-semibold">Kelola Device & Sensor</h1>
        </div>
        <button onClick={logout} className="rounded-md border px-3 py-1.5 text-sm">Keluar</button>
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
        <h2 className="mb-2 text-sm font-medium">Ubah device (nama / status / lokasi)</h2>
        <form onSubmit={submitEdit} className="flex flex-wrap gap-2">
          <input
            className="rounded-md border px-3 py-1.5 text-sm"
            placeholder="device_id"
            value={edit.device_id}
            onChange={(e) => setEdit({ ...edit, device_id: e.target.value })}
            required
          />
          <input
            className="rounded-md border px-3 py-1.5 text-sm"
            placeholder="nama baru (opsional)"
            value={edit.name}
            onChange={(e) => setEdit({ ...edit, name: e.target.value })}
          />
          <select
            className="rounded-md border px-2 py-1.5 text-sm"
            value={edit.status}
            onChange={(e) => setEdit({ ...edit, status: e.target.value })}
          >
            <option value="">status tetap</option>
            <option value="active">active</option>
            <option value="decommissioned">decommissioned</option>
          </select>
          <select
            className="rounded-md border px-2 py-1.5 text-sm"
            value={edit.location_id}
            onChange={(e) => setEdit({ ...edit, location_id: e.target.value })}
          >
            <option value="">lokasi tetap</option>
            {locationOptions.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <button type="submit" className="rounded-md border px-3 py-1.5 text-sm">Perbarui</button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">Transisi terkontrol: provisioned → active → decommissioned.</p>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-2 text-sm font-medium">Daftar device</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          <select
            className="rounded-md border px-2 py-1.5 text-sm"
            value={status}
            onChange={(e) => { setStatus(e.target.value); resetPage(); }}
          >
            <option value="">semua status</option>
            <option value="provisioned">provisioned</option>
            <option value="active">active</option>
            <option value="decommissioned">decommissioned</option>
          </select>
          <select
            className="rounded-md border px-2 py-1.5 text-sm"
            value={locationId}
            onChange={(e) => { setLocationId(e.target.value); resetPage(); }}
          >
            <option value="">semua lokasi</option>
            {locationOptions.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <input
            className="rounded-md border px-3 py-1.5 text-sm"
            placeholder="cari…"
            value={q}
            onChange={(e) => { setQ(e.target.value); resetPage(); }}
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
                  <th className="py-1 pr-3"><span className="sr-only">Aksi</span></th>
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
                    <td className="py-1.5 pr-3 text-right">
                      <button
                        onClick={() => remove(d.device_id)}
                        className="rounded-md border px-2 py-0.5 text-xs text-red-600"
                      >
                        Hapus
                      </button>
                    </td>
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
        <h2 className="mb-2 text-sm font-medium">Pasang sensor ke device</h2>
        <form onSubmit={submitAttach} className="flex flex-wrap gap-2">
          <input
            className="rounded-md border px-3 py-1.5 text-sm"
            placeholder="device_id"
            value={attach.device_id}
            onChange={(e) => setAttach({ ...attach, device_id: e.target.value })}
            required
          />
          <select
            className="rounded-md border px-2 py-1.5 text-sm"
            value={attach.sensor_id}
            onChange={(e) => setAttach({ ...attach, sensor_id: e.target.value })}
            required
          >
            <option value="">pilih sensor…</option>
            {sensorOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.serial} ({s.sensor_type})</option>
            ))}
          </select>
          <button type="submit" className="rounded-md border px-3 py-1.5 text-sm">Pasang</button>
        </form>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-2 text-sm font-medium">Lepas sensor dari device</h2>
        <form onSubmit={submitDetach} className="flex flex-wrap gap-2">
          <input
            className="rounded-md border px-3 py-1.5 text-sm"
            placeholder="device_id"
            value={detach.device_id}
            onChange={(e) => setDetach({ ...detach, device_id: e.target.value })}
            required
          />
          <select
            className="rounded-md border px-2 py-1.5 text-sm"
            value={detach.sensor_id}
            onChange={(e) => setDetach({ ...detach, sensor_id: e.target.value })}
            required
          >
            <option value="">pilih sensor…</option>
            {sensorOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.serial} ({s.sensor_type})</option>
            ))}
          </select>
          <button type="submit" className="rounded-md border px-3 py-1.5 text-sm">Lepas</button>
        </form>
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
            {sensorOptions.map((s) => (
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
