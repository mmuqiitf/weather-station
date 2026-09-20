"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useMemo, useState } from "react"
import useSWR from "swr"
import { useTable } from "@tanstack/react-table"
import { Eye, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import {
  DeleteDialog,
  DeviceStatusBadge,
  OnlineBadge,
  ResultAlert,
} from "@/components/crud"
import {
  DataTable,
  serverColumnHelper,
  serverTableFeatures,
  type PaginationState,
  type ServerColumnDef,
  type SortingState,
} from "@/components/data-table"
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
import { formatWib } from "@/lib/format"
import type { DeviceDetail, DeviceLocation } from "@/lib/types"

const ALL = "all"
const ONLINE = "online"
const OFFLINE = "offline"
const helper = serverColumnHelper<DeviceDetail>()

function DevicesTable() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState(searchParams.get("status") ?? ALL)
  const [locationId, setLocationId] = useState(
    searchParams.get("location_id") ?? ALL
  )
  const [onlineFilter, setOnlineFilter] = useState(
    searchParams.get("online") === "1"
      ? ONLINE
      : searchParams.get("online") === "0"
        ? OFFLINE
        : ALL
  )
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 15,
  })
  const [deleteTarget, setDeleteTarget] = useState<DeviceDetail | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const q = useDebouncedValue(query.trim())
  const sort = sorting[0]

  const params = new URLSearchParams({
    ...(status !== ALL ? { status } : {}),
    ...(locationId !== ALL ? { location_id: locationId } : {}),
    ...(onlineFilter === ONLINE ? { online: "1" } : {}),
    ...(onlineFilter === OFFLINE ? { online: "0" } : {}),
    ...(q ? { q } : {}),
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
    `/devices?${params}`,
    (p: string) => api.get<Paginated<DeviceDetail>>(p),
    { keepPreviousData: true }
  )
  const locations = useSWR("/locations?per_page=100", (p: string) =>
    api.get<Paginated<DeviceLocation>>(p)
  )

  const devices = useMemo(() => data?.data ?? [], [data])
  const totalRows = data?.meta.total ?? 0
  const locationOptions = locations.data?.data ?? []

  function resetPage() {
    setPagination((p) => ({ ...p, pageIndex: 0 }))
  }

  const columns = useMemo<ServerColumnDef<DeviceDetail>[]>(
    () => [
      helper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const d = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Actions for ${d.device_id}`}
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
                  onClick={() => router.push(`/devices/${d.device_id}`)}
                >
                  <Eye className="size-4" /> View details
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2.5 px-3 py-2.5"
                  onClick={() => router.push(`/devices/${d.device_id}/edit`)}
                >
                  <Pencil className="size-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2.5 px-3 py-2.5"
                  variant="destructive"
                  onClick={() => setDeleteTarget(d)}
                >
                  <Trash2 className="size-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      }),
      helper.accessor("device_id", {
        header: "Device",
        cell: ({ row }) => (
          <>
            <Link
              href={`/devices/${row.original.device_id}`}
              className="font-mono font-medium text-primary hover:underline"
            >
              {row.original.device_id}
            </Link>
            <span className="text-muted-foreground">
              {" "}
              · {row.original.name}
            </span>
          </>
        ),
      }),
      helper.accessor("status", {
        header: "Status",
        cell: ({ row }) => <DeviceStatusBadge status={row.original.status} />,
      }),
      helper.display({
        id: "online",
        header: "Online",
        cell: ({ row }) => <OnlineBadge online={row.original.is_online} />,
      }),
      helper.display({
        id: "location",
        header: "Location",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.location?.name ?? "—"}
          </span>
        ),
      }),
      helper.accessor("last_seen_at", {
        header: "Last seen",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatWib(row.original.last_seen_at)}
          </span>
        ),
      }),
    ],
    [router]
  )

  const table = useTable({
    features: serverTableFeatures,
    columns,
    data: devices,
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
      await api.del(`/devices/${deleteTarget.device_id}`)
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
      title="Devices"
      description={
        data
          ? `${totalRows} registered stations`
          : "Provisioned weather stations"
      }
      actions={
        <Link href="/devices/new" className={buttonVariants()}>
          <Plus className="size-4" /> New device
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
              placeholder="Search by name or device ID…"
              aria-label="Search devices"
              className="pl-9"
            />
          </div>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v ?? ALL)
              resetPage()
            }}
          >
            <SelectTrigger
              aria-label="Filter by status"
              className="w-full sm:w-44"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="provisioned">provisioned</SelectItem>
              <SelectItem value="active">active</SelectItem>
              <SelectItem value="decommissioned">decommissioned</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={locationId}
            onValueChange={(v) => {
              setLocationId(v ?? ALL)
              resetPage()
            }}
          >
            <SelectTrigger
              aria-label="Filter by location"
              className="w-full sm:w-44"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All locations</SelectItem>
              {locationOptions.map((l) => (
                <SelectItem key={l.id} value={String(l.id)}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={onlineFilter}
            onValueChange={(v) => {
              setOnlineFilter(v ?? ALL)
              resetPage()
            }}
          >
            <SelectTrigger
              aria-label="Filter by online state"
              className="w-full sm:w-44"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Online + offline</SelectItem>
              <SelectItem value={ONLINE}>Online</SelectItem>
              <SelectItem value={OFFLINE}>Offline</SelectItem>
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
            emptyTitle="No devices found"
            emptyDescription="Try a different filter, or provision the first station."
            emptyAction={
              <Link
                href="/devices/new"
                className={buttonVariants({ variant: "outline" })}
              >
                <Plus className="size-4" /> New device
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
        title={`Delete ${deleteTarget?.device_id}?`}
        description="Soft delete — readings and heartbeat history are preserved."
        busy={deleteBusy}
        onConfirm={confirmDelete}
      />
    </AppShell>
  )
}

export default function DevicesPage() {
  return (
    <Suspense>
      <DevicesTable />
    </Suspense>
  )
}
