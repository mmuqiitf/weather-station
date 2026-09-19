"use client";

import Link from "next/link";
import { use, useState } from "react";
import useSWR from "swr";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatWib } from "@/lib/format";
import type { LatestResponse, SeriesPoint } from "@/lib/types";

type Range = "24h" | "7d" | "30d";

const RANGE_CFG: Record<Range, { label: string; hours: number; series: string; rain: string }> = {
  "24h": { label: "24 jam", hours: 24, series: "raw", rain: "1h" },
  "7d": { label: "7 hari", hours: 168, series: "1m", rain: "1h" },
  "30d": { label: "30 hari", hours: 720, series: "1h", rain: "1d" },
};

function usePoints(deviceId: string, sensor: string, interval: string, agg = "avg") {
  const from = undefined; // server defaults to last 24h; range handled by interval coercion note below
  const { data, error, isLoading } = useSWR<{ points: SeriesPoint[] }>(
    `/readings?device_id=${deviceId}&sensor_type=${sensor}&interval=${interval}&agg=${agg}`,
  );
  return { data: data as unknown as { points: SeriesPoint[] } | undefined, error, isLoading, from };
}

function tickWib(t: string) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(t));
}

export default function DeviceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [range, setRange] = useState<Range>("24h");
  const cfg = RANGE_CFG[range];

  const latest = useSWR<LatestResponse>(`/devices/${id}/readings/latest`);
  const temp = usePoints(id, "temp_air", cfg.series);
  const hum = usePoints(id, "humidity", cfg.series);
  const rain = usePoints(id, "rain_counter", cfg.rain, "sum");
  const wind = usePoints(id, "wind_speed", cfg.rain);

  const latestData = latest.data as unknown as LatestResponse | undefined;

  // Merge temp + humidity by timestamp for the dual-axis chart.
  const merged = (() => {
    const map = new Map<string, { t: string; temp?: number; hum?: number }>();
    for (const p of temp.data?.points ?? []) {
      map.set(p.t, { t: p.t, temp: p.v, hum: map.get(p.t)?.hum });
    }
    for (const p of hum.data?.points ?? []) {
      map.set(p.t, { t: p.t, temp: map.get(p.t)?.temp, hum: p.v });
    }
    return [...map.values()].sort((a, b) => +new Date(a.t) - +new Date(b.t));
  })();

  return (
    <div className="mx-auto flex min-h-svh max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-sm text-muted-foreground">← Semua stasiun</Link>
          <h1 className="text-xl font-semibold">{latestData?.device_id ?? id}</h1>
          <p className="text-sm text-muted-foreground">
            {latestData
              ? `${latestData.is_online ? "online" : "offline"} · update ${formatWib(latestData.last_seen_at)}`
              : "Memuat…"}
          </p>
        </div>
        <div className="flex gap-2">
          {(Object.keys(RANGE_CFG) as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-md border px-3 py-1.5 text-sm ${range === r ? "bg-foreground text-background" : ""}`}
            >
              {RANGE_CFG[r].label}
            </button>
          ))}
        </div>
      </header>

      {latest.error && <div className="rounded-lg border p-8 text-center text-sm text-red-600">Gagal memuat: {(latest.error as Error).message}</div>}

      {latestData && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {latestData.sensors.map((s) => (
            <div key={s.sensor_type} className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{s.sensor_type}</div>
              <div className="text-lg font-semibold">
                {s.value} <span className="text-xs font-normal">{s.unit}</span>
              </div>
              {s.quality !== "ok" && (
                <div className="text-xs text-amber-600">flag: {s.quality}</div>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="rounded-lg border p-4">
        <h2 className="mb-2 text-sm font-medium">Suhu & kelembapan ({cfg.series})</h2>
        {temp.isLoading || hum.isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Memuat chart…</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={merged}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="t" tickFormatter={tickWib} minTickGap={40} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="temp" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="hum" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line yAxisId="temp" type="monotone" dataKey="temp" name="suhu °C" dot={false} connectNulls={false} />
              <Line yAxisId="hum" type="monotone" dataKey="hum" name="RH %" dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
        <p className="mt-1 text-xs text-muted-foreground">Gap = garis putus (data offline tidak diinterpolasi).</p>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-2 text-sm font-medium">Curah hujan per {cfg.rain} (mm, dari rain_counter)</h2>
        {rain.isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Memuat chart…</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={rain.data?.points ?? []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="t" tickFormatter={tickWib} minTickGap={40} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="v" name="mm" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-2 text-sm font-medium">Kecepatan angin (m/s)</h2>
        {wind.isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Memuat chart…</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={wind.data?.points ?? []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="t" tickFormatter={tickWib} minTickGap={40} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="v" name="m/s" dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>
    </div>
  );
}
