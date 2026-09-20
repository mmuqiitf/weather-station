"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import useSWR from "swr"
import {
  ArrowRight,
  Clock,
  Droplets,
  MapPin,
  RadioTower,
  Search,
  Thermometer,
  Wifi,
  WifiOff,
} from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { OnlineBadge } from "@/components/crud"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { formatWib } from "@/lib/format"
import type { Overview } from "@/lib/types"
import { cn } from "@/lib/utils"

type Filter = "all" | "online" | "offline"

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "online", label: "Online" },
  { id: "offline", label: "Offline" },
]

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex items-center gap-3 px-5 py-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-xs text-muted-foreground">{label}</span>
          <span className="block truncate text-xl leading-tight font-semibold">
            {value}
          </span>
          {hint && (
            <span className="block truncate text-xs text-muted-foreground">
              {hint}
            </span>
          )}
        </span>
      </CardContent>
    </Card>
  )
}

export default function OverviewPage() {
  const { data, error, isLoading, mutate } = useSWR<Overview>(
    "/dashboard/overview"
  )
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")

  const devices = useMemo(() => {
    const list = data?.devices ?? []
    const q = query.trim().toLowerCase()
    return list.filter((d) => {
      if (filter === "online" && !d.is_online) return false
      if (filter === "offline" && d.is_online) return false
      if (!q) return true
      return (
        d.name.toLowerCase().includes(q) ||
        d.device_id.toLowerCase().includes(q) ||
        (d.location ?? "").toLowerCase().includes(q)
      )
    })
  }, [data, query, filter])

  const avgTemp = useMemo(() => {
    const temps = (data?.devices ?? []).filter((d) => d.temp_air != null)
    if (temps.length === 0) return null
    return temps.reduce((s, d) => s + (d.temp_air ?? 0), 0) / temps.length
  }, [data])

  return (
    <AppShell
      title="Overview"
      description={
        data
          ? `${data.counts.online}/${data.counts.total} stations online · auto-refresh 60s`
          : "Live status of all weather stations"
      }
      actions={
        <Link href="/devices" className={buttonVariants()}>
          Manage devices
        </Link>
      }
    >
      {/* Stats */}
      {isLoading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[92px]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={RadioTower}
            label="Total stations"
            value={String(data.counts.total)}
            hint={`${data.devices.length} shown`}
          />
          <StatCard
            icon={Wifi}
            label="Online"
            value={String(data.counts.online)}
            hint="payload within 15 min"
          />
          <StatCard
            icon={WifiOff}
            label="Offline"
            value={String(data.counts.offline)}
            hint="no payload > 15 min"
          />
          <StatCard
            icon={Thermometer}
            label="Avg temperature"
            value={avgTemp != null ? `${avgTemp.toFixed(1)} °C` : "—"}
            hint="across reporting stations"
          />
        </div>
      )}

      {/* Filter bar */}
      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, device ID, or location…"
              aria-label="Search stations"
              className="pl-9"
            />
          </div>
          <div
            className="flex gap-1 rounded-lg border bg-muted/50 p-1"
            role="tablist"
            aria-label="Status filter"
          >
            {FILTERS.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  filter === f.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* States */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      )}
      {error && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <p className="text-sm text-destructive">
              Failed to load stations: {(error as Error).message}
            </p>
            <Button variant="outline" onClick={() => mutate()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}
      {!isLoading && !error && devices.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <CardTitle className="text-base">No stations match</CardTitle>
            <CardDescription>
              {data && data.devices.length > 0
                ? "Try a different search or status filter."
                : "No devices yet. Provision the first station."}
            </CardDescription>
            {data && data.devices.length === 0 && (
              <Link href="/devices/new" className={buttonVariants()}>
                New device
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {/* Device cards */}
      {!isLoading && !error && devices.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((d) => (
            <Link
              key={d.device_id}
              href={`/devices/${d.device_id}`}
              className="group rounded-xl border bg-card text-card-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring"
            >
              <div className="flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate leading-tight font-semibold">
                      {d.name}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <MapPin className="size-3 shrink-0" />
                      {d.device_id} · {d.location ?? "No location"}
                    </p>
                  </div>
                  <OnlineBadge online={d.is_online} />
                </div>
                <div className="flex items-center gap-6">
                  <span className="flex items-center gap-1.5">
                    <Thermometer className="size-4 text-muted-foreground" />
                    <span className="text-2xl font-semibold">
                      {d.temp_air ?? "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">°C</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Droplets className="size-4 text-muted-foreground" />
                    <span className="text-2xl font-semibold">
                      {d.humidity ?? "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">%RH</span>
                  </span>
                </div>
                <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3.5" />
                    {formatWib(d.last_seen_at)}
                    {!d.is_online && " · silent > 15 min"}
                  </span>
                  <span className="flex items-center gap-0.5 font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    Details <ArrowRight className="size-3.5" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  )
}
