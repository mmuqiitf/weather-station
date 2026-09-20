"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useMemo, useState } from "react"
import useSWR from "swr"
import { useTable } from "@tanstack/react-table"
import { Eye, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { DeleteDialog, ResultAlert } from "@/components/crud"
import {
  DataTable,
  serverColumnHelper,
  serverTableFeatures,
  type PaginationState,
  type ServerColumnDef,
  type SortingState,
} from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { api, type Paginated } from "@/lib/api"
import type { DeviceDetail, Sensor, SensorType } from "@/lib/types"

const ALL = "all"
const ATTACHED = "attached"
const UNATTACHED = "unattached"
const helper = serverColumnHelper<Sensor>()

function SensorsTable() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState(
    searchParams.get("sensor_type_id") ?? ALL
  )
  const [mountedFilter, setMountedFilter] = useState(ALL)
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 15,
  })
  const [deleteTarget, setDeleteTarget] = useState<Sensor | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const q = useDebouncedValue(query.trim())
  const sort = sorting[0]

  const params = new URLSearchParams({
    ...(q ? { q } : {}),
    ...(typeFilter !== ALL ? { sensor_type_id: typeFilter } : {}),
    ...(mountedFilter === ATTACHED ? { mounted: "1" } : {}),
    ...(mountedFilter === UNATTACHED ? { mounted: "0" } : {}),
    ...(sort ? { sort: sort.id, direction: sort.desc ? "desc" : "asc" } : {}),
    page: String(pagination.pageIndex + 1),
    per_page: String(pagination.pageSize),
  }).toString()

  const {
    data,
    error: loadError,
    isLoading,
    mutate,
  } = useSWR(
    `/sensors?${params}`,
    (p: string) => api.get<Paginated<Sensor>>(p),
    { keepPreviousData: true }
  )
  const types = useSWR("/sensor-types?per_page=100", (p: string) =>
    api.get<Paginated<SensorType>>(p)
  )
  const devices = useSWR("/devices?per_page=100", (p: string) =>
    api.get<Paginated<DeviceDetail>>(p)
  )

  const sensors = useMemo(() => data?.data ?? [], [data])
  const totalRows = data?.meta.total ?? 0
  const typeOptions = useMemo(() => types.data?.data ?? [], [types.data])
  const deviceById = useMemo(() => {
    const map = new Map<number, DeviceDetail>()
    for (const d of devices.data?.data ?? []) map.set(d.id, d)
    return map
  }, [devices.data])

  function resetPage() {
    setPagination((p) => ({ ...p, pageIndex: 0 }))
  }

  const columns = useMemo<ServerColumnDef<Sensor>[]>(
    () => [
      helper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const s = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Actions for ${s.serial}`}
                  />
                }
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={8}
                className="min-w-52 p-2"
              >
                <DropdownMenuItem
                  className="gap-2.5 px-3 py-2.5"
                  onClick={() => router.push(`/sensors/${s.id}`)}
                >
                  <Eye className="size-4" /> View & calibrate
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2.5 px-3 py-2.5"
                  onClick={() => router.push(`/sensors/${s.id}/edit`)}
                >
                  <Pencil className="size-4" /> Edit serial
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2.5 px-3 py-2.5"
                  variant="destructive"
                  onClick={() => setDeleteTarget(s)}
                >
                  <Trash2 className="size-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      }),
      helper.accessor("serial", {
        header: "Serial",
        cell: ({ row }) => (
          <Link
            href={`/sensors/${row.original.id}`}
            className="font-mono font-medium text-primary hover:underline"
          >
            {row.original.serial}
          </Link>
        ),
      }),
      helper.accessor("sensor_type_id", {
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="secondary">
            {row.original.sensor_type ?? `#${row.original.sensor_type_id}`}
          </Badge>
        ),
      }),
      helper.display({
        id: "mounted",
        header: "Mounted on",
        cell: ({ row }) => {
          const mounted =
            row.original.current_device_id != null
              ? deviceById.get(row.original.current_device_id)
              : undefined
          if (mounted) {
            return (
              <Link
                href={`/devices/${mounted.device_id}`}
                className="text-primary hover:underline"
              >
                {mounted.device_id}
              </Link>
            )
          }
          return <span className="text-muted-foreground">—</span>
        },
      }),
    ],
    [router, deviceById]
  )

  const table = useTable({
    features: serverTableFeatures,
    columns,
    data: sensors,
    rowCount: totalRows,
    state: { sorting, pagination },
    onSortingChange: (updater) => {
      setSorting(updater)
      resetPage()
    },
    onPaginationChange: setPagination,
    manualSorting: true,
    manualPagination: true,
  })

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleteBusy(true)
    setError(null)
    try {
      await api.del(`/sensors/${deleteTarget.id}`)
      setDeleteTarget(null)
      mutate()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <AppShell
      title="Sensors"
      description={
        data ? `${totalRows} registered sensors` : "Physical sensor inventory"
      }
      actions={
        <Link href="/sensors/new" className={buttonVariants()}>
          <Plus className="size-4" /> New sensor
        </Link>
      }
    >
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                resetPage()
              }}
              placeholder="Search by serial…"
              aria-label="Search sensors"
              className="pl-9"
            />
          </div>
          <Select
            value={typeFilter}
            onValueChange={(v) => {
              setTypeFilter(v ?? ALL)
              resetPage()
            }}
          >
            <SelectTrigger
              aria-label="Filter by sensor type"
              className="w-full sm:w-52"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              {typeOptions.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.code} ({t.unit})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={mountedFilter}
            onValueChange={(v) => {
              setMountedFilter(v ?? ALL)
              resetPage()
            }}
          >
            <SelectTrigger
              aria-label="Filter by mount state"
              className="w-full sm:w-44"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All sensors</SelectItem>
              <SelectItem value={ATTACHED}>Mounted</SelectItem>
              <SelectItem value={UNATTACHED}>Unmounted</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {error && (
        <ResultAlert
          result={{ kind: "err", title: "Action failed", text: error }}
        />
      )}

      <Card>
        <CardContent className="px-0 pb-2">
          <DataTable
            table={table}
            totalRows={totalRows}
            pageIndex={pagination.pageIndex}
            pageSize={pagination.pageSize}
            onPageIndexChange={(i) =>
              setPagination((p) => ({ ...p, pageIndex: i }))
            }
            onPageSizeChange={(s) =>
              setPagination({ pageIndex: 0, pageSize: s })
            }
            isLoading={isLoading}
            error={loadError as Error | null}
            onRetry={() => mutate()}
            emptyTitle="No sensors found"
            emptyDescription="Try a different filter, or register the first sensor."
            emptyAction={
              <Link
                href="/sensors/new"
                className={buttonVariants({ variant: "outline" })}
              >
                <Plus className="size-4" /> New sensor
              </Link>
            }
          />
        </CardContent>
      </Card>

      <DeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={`Delete sensor ${deleteTarget?.serial}?`}
        description="Attached sensors cannot be deleted — detach them first (409)."
        busy={deleteBusy}
        onConfirm={confirmDelete}
      />
    </AppShell>
  )
}

export default function SensorsPage() {
  return (
    <Suspense>
      <SensorsTable />
    </Suspense>
  )
}
