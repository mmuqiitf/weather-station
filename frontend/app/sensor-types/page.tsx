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
import type { SensorType } from "@/lib/types"

const ALL = "all"
const IN_USE = "in-use"
const UNUSED = "unused"
const helper = serverColumnHelper<SensorType>()

function fmtBound(v: number | null): number | string {
  return v ?? "—"
}

function SensorTypesTable() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState("")
  const [unitFilter, setUnitFilter] = useState(searchParams.get("unit") ?? ALL)
  const [usageFilter, setUsageFilter] = useState(
    searchParams.get("in_use") === "1"
      ? IN_USE
      : searchParams.get("in_use") === "0"
        ? UNUSED
        : ALL
  )
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 15,
  })
  const [deleteTarget, setDeleteTarget] = useState<SensorType | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const q = useDebouncedValue(query.trim())
  const sort = sorting[0]

  const params = new URLSearchParams({
    ...(q ? { q } : {}),
    ...(unitFilter !== ALL ? { unit: unitFilter } : {}),
    ...(usageFilter === IN_USE ? { in_use: "1" } : {}),
    ...(usageFilter === UNUSED ? { in_use: "0" } : {}),
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
    `/sensor-types?${params}`,
    (p: string) => api.get<Paginated<SensorType>>(p),
    { keepPreviousData: true }
  )

  const rows = useMemo(() => data?.data ?? [], [data])
  const totalRows = data?.meta.total ?? 0
  const allTypes = useSWR("/sensor-types?per_page=100", (p: string) =>
    api.get<Paginated<SensorType>>(p)
  )
  const unitOptions = useMemo(
    () => [...new Set((allTypes.data?.data ?? []).map((t) => t.unit))].sort(),
    [allTypes.data]
  )

  function resetPage() {
    setPagination((p) => ({ ...p, pageIndex: 0 }))
  }

  const columns = useMemo<ServerColumnDef<SensorType>[]>(
    () => [
      helper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const t = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Actions for ${t.code}`}
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
                  onClick={() => router.push(`/sensor-types/${t.id}`)}
                >
                  <Eye className="size-4" /> View
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2.5 px-3 py-2.5"
                  onClick={() => router.push(`/sensor-types/${t.id}/edit`)}
                >
                  <Pencil className="size-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2.5 px-3 py-2.5"
                  variant="destructive"
                  onClick={() => setDeleteTarget(t)}
                >
                  <Trash2 className="size-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      }),
      helper.accessor("code", {
        header: "Code",
        cell: ({ row }) => (
          <Link
            href={`/sensor-types/${row.original.id}`}
            className="font-mono font-medium text-primary hover:underline"
          >
            {row.original.code}
          </Link>
        ),
      }),
      helper.accessor("unit", { header: "Unit" }),
      helper.display({
        id: "min_value",
        header: "Min",
        cell: ({ row }) => (
          <span className="font-mono">{fmtBound(row.original.min_value)}</span>
        ),
      }),
      helper.display({
        id: "max_value",
        header: "Max",
        cell: ({ row }) => (
          <span className="font-mono">{fmtBound(row.original.max_value)}</span>
        ),
      }),
      helper.display({
        id: "precision",
        header: "Precision",
        cell: ({ row }) => (
          <span className="font-mono">{row.original.precision}</span>
        ),
      }),
      helper.display({
        id: "sensors_count",
        header: "Sensors",
        cell: ({ row }) => (
          <Link
            href={`/sensors?sensor_type_id=${row.original.id}`}
            className="font-mono text-primary hover:underline"
          >
            {row.original.sensors_count ?? 0}
          </Link>
        ),
      }),
    ],
    [router]
  )

  const table = useTable({
    features: serverTableFeatures,
    columns,
    data: rows,
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
      await api.del(`/sensor-types/${deleteTarget.id}`)
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
      title="Sensor Types"
      description={
        data ? `${totalRows} defined types` : "Measurement definitions"
      }
      actions={
        <Link href="/sensor-types/new" className={buttonVariants()}>
          <Plus className="size-4" /> New type
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
              placeholder="Search by code…"
              aria-label="Search sensor types"
              className="pl-9"
            />
          </div>
          <Select
            value={unitFilter}
            onValueChange={(v) => {
              setUnitFilter(v ?? ALL)
              resetPage()
            }}
          >
            <SelectTrigger
              aria-label="Filter by unit"
              className="w-full sm:w-44"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All units</SelectItem>
              {unitOptions.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={usageFilter}
            onValueChange={(v) => {
              setUsageFilter(v ?? ALL)
              resetPage()
            }}
          >
            <SelectTrigger
              aria-label="Filter by usage"
              className="w-full sm:w-44"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Used + unused</SelectItem>
              <SelectItem value={IN_USE}>In use</SelectItem>
              <SelectItem value={UNUSED}>Unused</SelectItem>
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
            emptyTitle="No sensor types found"
            emptyDescription="Try a different search, or define the first type."
            emptyAction={
              <Link
                href="/sensor-types/new"
                className={buttonVariants({ variant: "outline" })}
              >
                <Plus className="size-4" /> New type
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
        title={`Delete type ${deleteTarget?.code}?`}
        description="Types in use by sensors cannot be deleted (409)."
        busy={deleteBusy}
        onConfirm={confirmDelete}
      />
    </AppShell>
  )
}

export default function SensorTypesPage() {
  return (
    <Suspense>
      <SensorTypesTable />
    </Suspense>
  )
}
