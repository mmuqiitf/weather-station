"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { use, useMemo, useState } from "react"
import useSWR from "swr"
import {
  createColumnHelper,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { ArrowLeft, Loader2, Pencil, PlugZap, Unplug } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { DeleteDialog, ResultAlert, type SubmitResult } from "@/components/crud"
import { TableSortIcon } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { api, type Paginated, type Resource } from "@/lib/api"
import { formatWib } from "@/lib/format"
import type { Calibration, DeviceDetail, Sensor, SensorType } from "@/lib/types"

const calFeatures = tableFeatures({ rowSortingFeature })
const calHelper = createColumnHelper<typeof calFeatures, Calibration>()

export default function SensorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const sensorId = Number(id)
  const router = useRouter()

  const [detachBusy, setDetachBusy] = useState(false)
  const [detachOpen, setDetachOpen] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [calSorting, setCalSorting] = useState<SortingState>([])

  const sensors = useSWR("/sensors?per_page=100", (p: string) =>
    api.get<Paginated<Sensor>>(p)
  )
  const types = useSWR("/sensor-types?per_page=100", (p: string) =>
    api.get<Paginated<SensorType>>(p)
  )
  const devices = useSWR("/devices?per_page=100", (p: string) =>
    api.get<Paginated<DeviceDetail>>(p)
  )
  const calibrations = useSWR(
    Number.isInteger(sensorId) ? `/sensors/${sensorId}/calibrations` : null,
    (p: string) => api.get<Resource<Calibration[]>>(p)
  )

  const sensor = useMemo(
    () => (sensors.data?.data ?? []).find((s) => s.id === sensorId),
    [sensors.data, sensorId]
  )
  const type = useMemo(
    () => (types.data?.data ?? []).find((t) => t.id === sensor?.sensor_type_id),
    [types.data, sensor]
  )
  const mountedDevice = useMemo(
    () =>
      (devices.data?.data ?? []).find(
        (d) => d.id === sensor?.current_device_id
      ),
    [devices.data, sensor]
  )
  const history = useMemo(
    () => calibrations.data?.data ?? [],
    [calibrations.data]
  )

  const calColumns = useMemo<ColumnDef<typeof calFeatures, Calibration, any>[]>(
    () => [
      calHelper.accessor("effective_at", {
        header: "Effective at (WIB)",
        cell: ({ row }) => formatWib(row.original.effective_at),
      }),
      calHelper.accessor("offset", {
        header: "Offset",
        cell: ({ row }) => (
          <span className="font-mono">{row.original.offset ?? "—"}</span>
        ),
      }),
      calHelper.accessor("scale", {
        header: "Scale",
        cell: ({ row }) => (
          <span className="font-mono">{row.original.scale ?? "—"}</span>
        ),
      }),
    ],
    []
  )

  const calTable = useTable({
    features: calFeatures,
    columns: calColumns,
    data: history,
    state: { sorting: calSorting },
    onSortingChange: setCalSorting,
  })

  async function confirmDetach() {
    if (!mountedDevice) return
    setDetachBusy(true)
    try {
      await api.del(`/devices/${mountedDevice.device_id}/sensors/${sensorId}`)
      setResult({ kind: "ok", title: "Sensor detached (history kept)." })
      setDetachOpen(false)
      sensors.mutate()
    } catch (err) {
      setResult({
        kind: "err",
        title: "Detach failed",
        text: (err as Error).message,
      })
      setDetachOpen(false)
    } finally {
      setDetachBusy(false)
    }
  }

  async function confirmDelete() {
    setDeleteBusy(true)
    try {
      await api.del(`/sensors/${sensorId}`)
      router.push("/sensors")
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

  const loading = sensors.isLoading && !sensor

  return (
    <AppShell
      title={sensor?.serial ?? `Sensor #${id}`}
      description={type ? `${type.code} · ${type.unit}` : "Sensor detail"}
      actions={
        sensor && (
          <div className="flex gap-2">
            <Link
              href={`/sensors/${sensorId}/edit`}
              className={buttonVariants({ variant: "outline" })}
            >
              <Pencil className="size-4" /> Edit
            </Link>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          </div>
        )
      }
    >
      <Link
        href="/sensors"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All sensors
      </Link>

      {result && <ResultAlert result={result} />}

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-48" />
        </div>
      ) : !sensor ? (
        <Card>
          <CardContent className="px-6 py-10 text-center text-sm text-muted-foreground">
            {sensors.error
              ? `Failed to load: ${(sensors.error as Error).message}`
              : `Sensor #${id} not found.`}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Sensor info</CardTitle>
                <CardDescription>
                  Physical unit and its type definition.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Serial</span>
                  <span className="font-mono font-medium">{sensor.serial}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Type</span>
                  <Badge variant="secondary">
                    {sensor.sensor_type ?? `#${sensor.sensor_type_id}`}
                  </Badge>
                </div>
                {type && (
                  <>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Unit</span>
                      <span>{type.unit}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Valid range</span>
                      <span>
                        {type.min_value ?? "−∞"} … {type.max_value ?? "+∞"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Precision</span>
                      <span>{type.precision} decimals</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Installation</CardTitle>
                <CardDescription>
                  {mountedDevice
                    ? `Currently mounted on ${mountedDevice.device_id}.`
                    : "Not mounted. Attach it to a device to start recording."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {mountedDevice ? (
                  <>
                    <div className="flex justify-between gap-4 text-sm">
                      <span className="text-muted-foreground">Device</span>
                      <Link
                        href={`/devices/${mountedDevice.device_id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {mountedDevice.device_id} · {mountedDevice.name}
                      </Link>
                    </div>
                    <div>
                      <Button
                        variant="outline"
                        onClick={() => setDetachOpen(true)}
                        disabled={detachBusy}
                      >
                        {detachBusy && (
                          <Loader2 className="size-4 animate-spin" />
                        )}
                        <Unplug className="size-4" /> Detach sensor
                      </Button>
                    </div>
                  </>
                ) : (
                  <div>
                    <Link
                      href={`/sensors/${sensorId}/attach`}
                      className={buttonVariants({ variant: "outline" })}
                    >
                      <PlugZap className="size-4" /> Attach to a device
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <CardTitle>Calibrations</CardTitle>
                <CardDescription>
                  value = offset + scale × raw for readings at or after
                  effective_at. Raw values are never mutated. Newest first.
                </CardDescription>
              </div>
              <Link
                href={`/sensors/${sensorId}/calibrations/new`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Add calibration
              </Link>
            </CardHeader>
            <CardContent className="px-0 pb-2">
              {calibrations.isLoading ? (
                <div className="px-6">
                  <Skeleton className="h-24" />
                </div>
              ) : calibrations.error ? (
                <p className="px-6 py-2 text-center text-sm text-destructive">
                  Failed to load: {(calibrations.error as Error).message}
                </p>
              ) : history.length === 0 ? (
                <p className="px-6 py-2 text-center text-sm text-muted-foreground">
                  No calibrations yet. Readings use raw values.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    {calTable.getHeaderGroups().map((group) => (
                      <TableRow key={group.id}>
                        {group.headers.map((header) => (
                          <TableHead key={header.id}>
                            {header.isPlaceholder ? null : (
                              <button
                                type="button"
                                onClick={header.column.getToggleSortingHandler()}
                                className="flex items-center gap-1.5 font-medium hover:text-foreground"
                              >
                                <calTable.FlexRender header={header} />
                                <TableSortIcon
                                  sorted={header.column.getIsSorted()}
                                />
                              </button>
                            )}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {calTable.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}>
                        {row.getAllCells().map((cell) => (
                          <TableCell key={cell.id}>
                            <calTable.FlexRender cell={cell} />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <DeleteDialog
        open={detachOpen}
        onOpenChange={setDetachOpen}
        title={`Detach sensor ${sensor?.serial ?? `#${id}`}?`}
        description={`Removes it from ${mountedDevice?.device_id ?? "the device"}. Installation history is kept.`}
        busy={detachBusy}
        onConfirm={confirmDetach}
        confirmLabel="Detach"
      />

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete sensor ${sensor?.serial ?? `#${id}`}?`}
        description="Attached sensors cannot be deleted — detach them first (409)."
        busy={deleteBusy}
        onConfirm={confirmDelete}
      />
    </AppShell>
  )
}
