"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { use, useMemo, useState } from "react"
import useSWR from "swr"
import { ArrowLeft, Loader2 } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import {
  fromInputDatetime,
  ResultAlert,
  toInputDatetime,
} from "@/components/crud"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ApiError, api, type Paginated } from "@/lib/api"
import type { DeviceDetail, Sensor } from "@/lib/types"

export default function AttachSensorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const sensorId = Number(id)
  const router = useRouter()
  const [deviceId, setDeviceId] = useState("")
  const [installedAt, setInstalledAt] = useState(() =>
    toInputDatetime(new Date())
  )
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const sensors = useSWR("/sensors?per_page=100", (p: string) =>
    api.get<Paginated<Sensor>>(p)
  )
  const devices = useSWR("/devices?per_page=100", (p: string) =>
    api.get<Paginated<DeviceDetail>>(p)
  )

  const sensor = useMemo(
    () => (sensors.data?.data ?? []).find((s) => s.id === sensorId),
    [sensors.data, sensorId]
  )
  const deviceOptions = useMemo(() => devices.data?.data ?? [], [devices.data])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setFieldErrors({})
    setFormError(null)
    setBusy(true)
    try {
      await api.post(`/devices/${deviceId}/sensors`, {
        sensor_id: sensorId,
        installed_at: fromInputDatetime(installedAt),
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
      title={`Attach ${sensor?.serial ?? `#${id}`}`}
      description="Mount the sensor onto a device"
    >
      <Link
        href={`/sensors/${sensorId}`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to sensor
      </Link>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Installation</CardTitle>
          <CardDescription>
            An open slot of the same sensor type on the device is closed
            automatically. A sensor mounted elsewhere is rejected (409).
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
              <FieldLabel>Device</FieldLabel>
              <Select
                value={deviceId}
                onValueChange={(v) => setDeviceId(v ?? "")}
                disabled={busy}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a device…" />
                </SelectTrigger>
                <SelectContent>
                  {deviceOptions.map((d) => (
                    <SelectItem key={d.id} value={d.device_id}>
                      {d.device_id} · {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.sensor_id && (
                <FieldError>{fieldErrors.sensor_id.join(" ")}</FieldError>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="installed_at">Installed at</FieldLabel>
              <Input
                id="installed_at"
                type="datetime-local"
                value={installedAt}
                onChange={(e) => setInstalledAt(e.target.value)}
                disabled={busy}
              />
              {fieldErrors.installed_at && (
                <FieldError>{fieldErrors.installed_at.join(" ")}</FieldError>
              )}
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || !deviceId}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                Attach sensor
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
    </AppShell>
  )
}
