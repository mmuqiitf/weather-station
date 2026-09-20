"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { use, useMemo, useState } from "react"
import useSWR from "swr"
import {
  ArrowLeft,
  Check,
  CloudRain,
  Compass,
  Copy,
  Droplets,
  Gauge,
  KeyRound,
  Loader2,
  Pencil,
  Sun,
  Thermometer,
  Wind,
} from "lucide-react"
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
} from "recharts"
import { AppShell } from "@/components/app-shell"
import {
  DeleteDialog,
  DeviceStatusBadge,
  OnlineBadge,
  QualityBadge,
  ResultAlert,
  type SubmitResult,
} from "@/components/crud"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { api, type Paginated, type Resource } from "@/lib/api"
import { formatWib } from "@/lib/format"
import type {
  DeviceDetail,
  LatestResponse,
  SeriesPoint,
  Summary,
} from "@/lib/types"
import { cn } from "@/lib/utils"

type Range = "24h" | "7d" | "30d"

const RANGE_CFG: Record<
  Range,
  { label: string; hours: number; series: string; rain: string }
> = {
  "24h": { label: "24h", hours: 24, series: "raw", rain: "1h" },
  "7d": { label: "7d", hours: 168, series: "1m", rain: "1h" },
  "30d": { label: "30d", hours: 720, series: "1h", rain: "1d" },
}

const ROSE_SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]

const SENSOR_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  temp_air: { label: "Air temp", icon: Thermometer },
  humidity: { label: "Humidity", icon: Droplets },
  pressure: { label: "Pressure", icon: Gauge },
  rain_counter: { label: "Rain counter", icon: CloudRain },
  wind_speed: { label: "Wind speed", icon: Wind },
  wind_dir: { label: "Wind direction", icon: Compass },
  solar_rad: { label: "Solar radiation", icon: Sun },
}

const TOOLTIP_STYLE = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  color: "var(--popover-foreground)",
  fontSize: "12px",
} as const

type SeriesResponse = Resource<{ points: SeriesPoint[] }> | Paginated<SeriesPoint>

function normalizePoints(data: SeriesResponse | undefined): SeriesPoint[] {
  const inner = data?.data
  if (Array.isArray(inner)) return inner
  return (inner as { points?: SeriesPoint[] } | undefined)?.points ?? []
}

function usePoints(
  deviceId: string,
  sensor: string,
  interval: string,
  from: string,
  to: string,
  agg = "avg"
) {
  const { data, error, isLoading } = useSWR<SeriesResponse>(
    `/readings?device_id=${deviceId}&sensor_type=${sensor}&interval=${interval}&agg=${agg}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  )
  const points = useMemo(() => normalizePoints(data), [data])
  return {
    data: { points },
    error,
    isLoading,
  }
}

function tickWib(t: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(t))
}

function formatTooltipLabel(label: React.ReactNode) {
  return tickWib(String(label))
}

/** 8-sector wind rose (SVG, no extra lib): spoke length ∝ frequency per direction. */
function WindRose({ points }: { points: SeriesPoint[] }) {
  const size = 220
  const c = size / 2
  const maxR = c - 28
  const counts = useMemo(() => {
    const bins = new Array(8).fill(0)
    for (const p of points) {
      const deg = ((p.v % 360) + 360) % 360
      bins[Math.floor(((deg + 22.5) % 360) / 45)] += 1
    }
    return bins as number[]
  }, [points])
  const max = Math.max(1, ...counts)
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} role="img" aria-label="Wind rose">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <circle
            key={f}
            cx={c}
            cy={c}
            r={maxR * f}
            fill="none"
            strokeWidth={1}
            className="stroke-muted"
            strokeDasharray={f === 1 ? undefined : "2 3"}
          />
        ))}
        {counts.map((n, i) => {
          const angle = (i * 45 - 90) * (Math.PI / 180)
          const len = maxR * (n / max)
          const x2 = c + len * Math.cos(angle)
          const y2 = c + len * Math.sin(angle)
          const lx = c + (maxR + 16) * Math.cos(angle)
          const ly = c + (maxR + 16) * Math.sin(angle)
          return (
            <g key={ROSE_SECTORS[i]}>
              <line
                x1={c}
                y1={c}
                x2={x2}
                y2={y2}
                strokeWidth={n === max && n > 0 ? 5 : 3}
                className="stroke-primary"
                strokeLinecap="round"
              />
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={11}
                className="fill-muted-foreground"
              >
                {ROSE_SECTORS[i]}
              </text>
            </g>
          )
        })}
        <circle cx={c} cy={c} r={3} className="fill-primary" />
      </svg>
      <p className="text-xs text-muted-foreground">
        {points.length === 0
          ? "No wind-direction data in this range."
          : `n=${points.length} · prevailing ${ROSE_SECTORS[counts.indexOf(max)]} (${max} points)`}
      </p>
    </div>
  )
}

function ChartFallback({ message }: { message: string }) {
  return (
    <div className="p-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

/** Rainfall bar chart — mm per bucket, already summed server-side from mm_delta. */
function RainBarChart({
  points,
  isLoading,
  error,
}: {
  points?: SeriesPoint[]
  isLoading: boolean
  error?: unknown
}) {
  if (isLoading) return <ChartFallback message="Loading chart…" />
  if (error) return <ChartFallback message="Failed to load rainfall data." />
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={points ?? []}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="t"
          tickFormatter={tickWib}
          minTickGap={40}
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
        />
        <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
        <Tooltip
          contentStyle={{ ...TOOLTIP_STYLE }}
          labelFormatter={formatTooltipLabel}
        />
        <Bar dataKey="v" name="mm" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function DeviceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [range, setRange] = useState<Range>("24h")
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [rotateOpen, setRotateOpen] = useState(false)
  const [rotateBusy, setRotateBusy] = useState(false)
  const [rotatedKey, setRotatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const cfg = RANGE_CFG[range]

  // Window actually sent to the API — range buttons change the time window, not just the interval.
  const { from, to } = useMemo(() => {
    const end = new Date()
    const start = new Date(end.getTime() - cfg.hours * 3600 * 1000)
    return { from: start.toISOString(), to: end.toISOString() }
  }, [cfg.hours])

  const latest = useSWR<Resource<LatestResponse>>(
    `/devices/${id}/readings/latest`
  )
  const device = useSWR(`/devices/${id}`, (p: string) =>
    api.get<Resource<DeviceDetail>>(p)
  )
  const temp = usePoints(id, "temp_air", cfg.series, from, to)
  const hum = usePoints(id, "humidity", cfg.series, from, to)
  const rainHourly = usePoints(id, "rain_counter", "1h", from, to, "sum")
  const rainDaily = usePoints(id, "rain_counter", "1d", from, to, "sum")
  const wind = usePoints(id, "wind_speed", cfg.rain, from, to)
  const windDir = usePoints(id, "wind_dir", cfg.rain, from, to)
  const summary = useSWR<Resource<Summary>>(
    `/readings/summary?device_id=${id}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  )

  const latestData = latest.data?.data
  const summaryData = summary.data?.data
  const detail = device.data?.data
  const deviceKey = detail?.device_id ?? decodeURIComponent(id)

  // Merge temp + humidity by timestamp for the dual-axis chart.
  const merged = useMemo(() => {
    const map = new Map<string, { t: string; temp?: number; hum?: number }>()
    for (const p of temp.data?.points ?? []) {
      map.set(p.t, { t: p.t, temp: p.v, hum: map.get(p.t)?.hum })
    }
    for (const p of hum.data?.points ?? []) {
      map.set(p.t, { t: p.t, temp: map.get(p.t)?.temp, hum: p.v })
    }
    return [...map.values()].sort((a, b) => +new Date(a.t) - +new Date(b.t))
  }, [temp.data, hum.data])

  async function confirmDelete() {
    setDeleteBusy(true)
    try {
      await api.del(`/devices/${id}`)
      router.push("/devices")
    } catch (err) {
      setResult({
        kind: "err",
        title: "Delete failed",
        text: (err as Error).message,
      })
      setDeleteOpen(false)
    } finally {
      setDeleteBusy(false)
    }
  }

  async function confirmRotate() {
    setRotateBusy(true)
    try {
      const res = await api.post<
        Resource<{ device_id: string; api_key_plain: string }>
      >(`/devices/${id}/credentials/rotate`)
      setRotatedKey(res.data.api_key_plain)
    } catch (err) {
      setResult({
        kind: "err",
        title: "Rotate failed",
        text: (err as Error).message,
      })
      setRotateOpen(false)
    } finally {
      setRotateBusy(false)
    }
  }

  function closeRotate(open: boolean) {
    if (!open) {
      setRotateOpen(false)
      setRotatedKey(null)
      setCopied(false)
    }
  }

  async function copyKey() {
    if (!rotatedKey) return
    try {
      await navigator.clipboard.writeText(rotatedKey)
      setCopied(true)
    } catch {
      // clipboard unavailable — key is still visible for manual copy
    }
  }

  return (
    <AppShell
      title={deviceKey}
      description={
        detail
          ? `${detail.name} · ${detail.is_online ? "Online" : "Offline"}`
          : latestData
            ? `${latestData.is_online ? "Online" : "Offline"} · updated ${formatWib(latestData.last_seen_at)}`
            : "Loading station…"
      }
      actions={
        <div className="flex items-center gap-2">
          <Link
            href={`/devices/${id}/edit`}
            className={buttonVariants({ variant: "outline" })}
          >
            <Pencil className="size-4" /> Edit
          </Link>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            Delete
          </Button>
          <div
            className="flex gap-1 rounded-lg border bg-muted/50 p-1"
            role="tablist"
            aria-label="Time range"
          >
            {(Object.keys(RANGE_CFG) as Range[]).map((r) => (
              <button
                key={r}
                role="tab"
                aria-selected={range === r}
                onClick={() => setRange(r)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  range === r
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {RANGE_CFG[r].label}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <Link
        href="/devices"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All devices
      </Link>

      {result && <ResultAlert result={result} />}

      {device.isLoading || !detail ? (
        !device.error && <Skeleton className="h-48" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Station</CardTitle>
              <CardDescription>Identity, state, and placement.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Device ID</span>
                <span className="font-mono font-medium">
                  {detail.device_id}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Name</span>
                <span>{detail.name}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Status</span>
                <DeviceStatusBadge status={detail.status} />
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">State</span>
                <OnlineBadge online={detail.is_online} />
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Location</span>
                <span className="text-muted-foreground">
                  {detail.location?.name ?? "—"}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Firmware</span>
                <span className="font-mono">
                  {detail.firmware_version ?? "—"}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Last seen</span>
                <span className="text-muted-foreground">
                  {formatWib(detail.last_seen_at)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>API key</CardTitle>
              <CardDescription>
                The raw key is shown only at creation or rotation. Flash it to
                the device firmware.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setRotateOpen(true)
                    setRotatedKey(null)
                  }}
                >
                  <KeyRound className="size-4" /> Rotate API key
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Rotating revokes the current key immediately. The device must be
                re-provisioned with the new key.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
      {device.error && (
        <ResultAlert
          result={{
            kind: "err",
            title: "Failed to load station",
            text: (device.error as Error).message,
          }}
        />
      )}

      {latest.error && (
        <Card>
          <CardContent className="px-6 py-8 text-center text-sm text-destructive">
            Failed to load: {(latest.error as Error).message}
          </CardContent>
        </Card>
      )}

      {/* Latest readings */}
      {latest.isLoading || !latestData ? (
        !latest.error && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        )
      ) : (
        <section
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          aria-label="Latest readings"
        >
          {latestData.sensors.map((s) => {
            const meta = SENSOR_META[s.sensor_type] ?? {
              label: s.sensor_type,
              icon: Gauge,
            }
            const Icon = meta.icon
            return (
              <Card key={s.sensor_type} className="gap-0 py-0">
                <CardContent className="flex flex-col gap-1 px-4 py-3.5">
                  <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 truncate">
                      <Icon className="size-3.5 shrink-0" />
                      {meta.label}
                    </span>
                    {s.quality !== "ok" && (
                      <span className="shrink-0">
                        <QualityBadge quality={s.quality} />
                      </span>
                    )}
                  </span>
                  <span className="text-xl leading-tight font-semibold">
                    {s.value}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      {s.unit}
                    </span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatWib(s.device_time)}
                  </span>
                </CardContent>
              </Card>
            )
          })}
        </section>
      )}

      {/* Range summary */}
      <Card className="gap-0 py-0">
        <CardContent className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-5">
          {summary.isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))
          ) : summary.error || !summaryData ? (
            <p className="col-span-full text-sm text-muted-foreground">
              Summary unavailable for this range.
            </p>
          ) : (
            [
              [
                "Min temp",
                summaryData.temp_min != null
                  ? `${summaryData.temp_min.toFixed(1)} °C`
                  : "—",
              ],
              [
                "Max temp",
                summaryData.temp_max != null
                  ? `${summaryData.temp_max.toFixed(1)} °C`
                  : "—",
              ],
              [
                "Avg temp",
                summaryData.temp_avg != null
                  ? `${summaryData.temp_avg.toFixed(1)} °C`
                  : "—",
              ],
              ["Rain total", `${summaryData.rain_total_mm.toFixed(1)} mm`],
              [
                "Max wind",
                summaryData.wind_max != null
                  ? `${summaryData.wind_max.toFixed(1)} m/s`
                  : "—",
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg leading-tight font-semibold">{value}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Temperature & humidity ({cfg.series})</CardTitle>
          <CardDescription>
            Gaps are not interpolated — offline periods break the line.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {temp.isLoading || hum.isLoading ? (
            <ChartFallback message="Loading chart…" />
          ) : temp.error || hum.error ? (
            <ChartFallback message="Failed to load temperature/humidity series." />
          ) : merged.length === 0 ? (
            <ChartFallback message="No data in this range." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={merged}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="t"
                  tickFormatter={tickWib}
                  minTickGap={40}
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                />
                <YAxis
                  yAxisId="temp"
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                />
                <YAxis
                  yAxisId="hum"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                />
                <Tooltip
                  contentStyle={{ ...TOOLTIP_STYLE }}
                  labelFormatter={formatTooltipLabel}
                />
                <Legend />
                <Line
                  yAxisId="temp"
                  type="monotone"
                  dataKey="temp"
                  name="temp °C"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
                <Line
                  yAxisId="hum"
                  type="monotone"
                  dataKey="hum"
                  name="RH %"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Rainfall per hour (mm)</CardTitle>
            <CardDescription>
              Hourly totals derived from the rain counter.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RainBarChart
              points={rainHourly.data?.points}
              isLoading={rainHourly.isLoading}
              error={rainHourly.error}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rainfall per day (mm)</CardTitle>
            <CardDescription>
              Daily totals derived from the rain counter.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RainBarChart
              points={rainDaily.data?.points}
              isLoading={rainDaily.isLoading}
              error={rainDaily.error}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Wind speed (m/s)</CardTitle>
          <CardDescription>Aggregated per {cfg.rain}.</CardDescription>
        </CardHeader>
        <CardContent>
          {wind.isLoading ? (
            <ChartFallback message="Loading chart…" />
          ) : wind.error ? (
            <ChartFallback message="Failed to load wind data." />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={wind.data?.points ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="t"
                  tickFormatter={tickWib}
                  minTickGap={40}
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                />
                <Tooltip
                  contentStyle={{ ...TOOLTIP_STYLE }}
                  labelFormatter={formatTooltipLabel}
                />
                <Line
                  type="monotone"
                  dataKey="v"
                  name="m/s"
                  stroke="var(--chart-4)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Wind rose — direction ({cfg.rain})</CardTitle>
          <CardDescription>
            N = north (0°) · clockwise every 45° · spoke length ∝ frequency.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          {windDir.isLoading ? (
            <ChartFallback message="Loading wind rose…" />
          ) : windDir.error ? (
            <ChartFallback message="Failed to load wind direction." />
          ) : (
            <WindRose points={windDir.data?.points ?? []} />
          )}
        </CardContent>
      </Card>

      <Dialog open={rotateOpen} onOpenChange={closeRotate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {rotatedKey ? "New API key" : `Rotate key for ${deviceKey}?`}
            </DialogTitle>
            <DialogDescription>
              {rotatedKey
                ? "The old key is revoked immediately. Copy the new key now — it is shown only once."
                : "The current key is revoked immediately. The device must be re-provisioned with the new key."}
            </DialogDescription>
          </DialogHeader>
          {rotatedKey ? (
            <Alert>
              <KeyRound />
              <AlertTitle>Copy before closing</AlertTitle>
              <AlertDescription className="font-mono break-all">
                {rotatedKey}
              </AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            {rotatedKey ? (
              <>
                <Button variant="outline" onClick={copyKey}>
                  {copied ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                  {copied ? "Copied" : "Copy key"}
                </Button>
                <Button onClick={() => closeRotate(false)}>Done</Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => closeRotate(false)}
                  disabled={rotateBusy}
                >
                  Cancel
                </Button>
                <Button onClick={confirmRotate} disabled={rotateBusy}>
                  {rotateBusy && <Loader2 className="size-4 animate-spin" />}
                  Rotate key
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${deviceKey}?`}
        description="Soft delete — readings and heartbeat history are preserved."
        busy={deleteBusy}
        onConfirm={confirmDelete}
      />
    </AppShell>
  )
}
