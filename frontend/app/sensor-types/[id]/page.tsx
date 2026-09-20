"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { use, useState } from "react"
import useSWR from "swr"
import { ArrowLeft, Pencil } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { DeleteDialog, ResultAlert } from "@/components/crud"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api, type Paginated, type Resource } from "@/lib/api"
import type { Sensor, SensorType } from "@/lib/types"

export default function SensorTypeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const type = useSWR(`/sensor-types/${id}`, (p: string) =>
    api.get<Resource<SensorType>>(p)
  )
  const sensors = useSWR(
    `/sensors?sensor_type_id=${id}&per_page=1`,
    (p: string) => api.get<Paginated<Sensor>>(p)
  )

  const detail = type.data?.data
  const usageCount = sensors.data?.meta.total

  async function confirmDelete() {
    setDeleteBusy(true)
    try {
      await api.del(`/sensor-types/${id}`)
      router.push("/sensor-types")
    } catch (err) {
      setError((err as Error).message)
      setDeleteOpen(false)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <AppShell
      title={detail ? detail.code : `Type #${id}`}
      description={
        detail
          ? `${detail.unit} · ${detail.precision} decimals`
          : "Sensor type detail"
      }
      actions={
        detail && (
          <div className="flex gap-2">
            <Link
              href={`/sensor-types/${id}/edit`}
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
        href="/sensor-types"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All types
      </Link>

      {error && (
        <ResultAlert
          result={{ kind: "err", title: "Delete failed", text: error }}
        />
      )}

      {type.isLoading && !detail ? (
        <Skeleton className="h-48" />
      ) : !detail ? (
        <Card>
          <CardContent className="px-6 py-10 text-center text-sm text-muted-foreground">
            {type.error
              ? `Failed to load: ${(type.error as Error).message}`
              : `Type #${id} not found.`}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Definition</CardTitle>
              <CardDescription>
                Unit, valid range, and precision.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Code</span>
                <span className="font-mono font-medium">{detail.code}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Unit</span>
                <span>{detail.unit}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Valid range</span>
                <span className="font-mono">
                  {detail.min_value ?? "−∞"} … {detail.max_value ?? "+∞"}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Precision</span>
                <span className="font-mono">{detail.precision} decimals</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Usage</CardTitle>
              <CardDescription>
                Sensors registered with this type.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-2xl font-semibold">
                {usageCount ?? "…"}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  sensors
                </span>
              </p>
              <div>
                <Link
                  href={`/sensors?sensor_type_id=${detail.id}`}
                  className={buttonVariants({ variant: "outline" })}
                >
                  View sensors
                </Link>
              </div>
              <p className="text-xs text-muted-foreground">
                Types in use cannot be deleted. Reassign or remove the sensors
                first.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete type ${detail?.code ?? `#${id}`}?`}
        description="Types in use by sensors cannot be deleted (409)."
        busy={deleteBusy}
        onConfirm={confirmDelete}
      />
    </AppShell>
  )
}
