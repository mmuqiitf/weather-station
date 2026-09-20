"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { use, useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { ArrowLeft, Loader2 } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { ResultAlert } from "@/components/crud"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError, api, type Paginated, type Resource } from "@/lib/api"
import type { Sensor } from "@/lib/types"

export default function EditSensorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const sensorId = Number(id)
  const router = useRouter()
  const [serial, setSerial] = useState("")
  const [initialized, setInitialized] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const sensors = useSWR("/sensors?per_page=100", (p: string) =>
    api.get<Paginated<Sensor>>(p)
  )
  const sensor = useMemo(
    () => (sensors.data?.data ?? []).find((s) => s.id === sensorId),
    [sensors.data, sensorId]
  )

  useEffect(() => {
    if (sensor && !initialized) {
      setSerial(sensor.serial)
      setInitialized(true)
    }
  }, [sensor, initialized])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setFieldErrors({})
    setFormError(null)
    if (sensor && serial.trim() === sensor.serial) {
      setFormError("No changes to save.")
      return
    }
    setBusy(true)
    try {
      await api.patch<Resource<Sensor>>(`/sensors/${sensorId}`, {
        serial: serial.trim(),
      })
      router.push(`/sensors/${sensorId}`)
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.errors ?? {})
        setFormError(err.message)
      } else {
        setFormError((err as Error).message)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppShell
      title={`Edit sensor #${id}`}
      description="Only the serial can be changed"
    >
      <Link
        href={`/sensors/${sensorId}`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to sensor
      </Link>

      {sensors.isLoading || (!sensor && !sensors.error) ? (
        <Card className="max-w-xl">
          <CardContent className="pt-6">
            <Skeleton className="h-9" />
          </CardContent>
        </Card>
      ) : !sensor ? (
        <ResultAlert
          result={{
            kind: "err",
            title: sensors.error ? "Failed to load sensor" : "Sensor not found",
            text: sensors.error ? (sensors.error as Error).message : undefined,
          }}
        />
      ) : (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="font-mono">{sensor.serial}</CardTitle>
            <CardDescription>
              Type, mounting, and calibrations are managed on the sensor detail
              page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {formError && (
              <div className="mb-4">
                <ResultAlert result={{ kind: "err", title: formError }} />
              </div>
            )}
            <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
              <Field>
                <FieldLabel htmlFor="serial">Serial</FieldLabel>
                <Input
                  id="serial"
                  value={serial}
                  onChange={(e) => setSerial(e.target.value)}
                  required
                  aria-invalid={Boolean(fieldErrors.serial)}
                  disabled={busy}
                />
                {fieldErrors.serial && (
                  <FieldError>{fieldErrors.serial.join(" ")}</FieldError>
                )}
              </Field>
              <div className="flex gap-2">
                <Button type="submit" disabled={busy}>
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  Save changes
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </AppShell>
  )
}
