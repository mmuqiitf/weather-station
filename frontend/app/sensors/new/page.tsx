"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ApiError, api, type Paginated, type Resource } from "@/lib/api"
import type { Sensor, SensorType } from "@/lib/types"

export default function NewSensorPage() {
  const router = useRouter()
  const [serial, setSerial] = useState("")
  const [sensorTypeId, setSensorTypeId] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const types = useSWR("/sensor-types?per_page=100", (p: string) =>
    api.get<Paginated<SensorType>>(p)
  )
  const typeOptions = types.data?.data ?? []

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setFieldErrors({})
    setFormError(null)
    setBusy(true)
    try {
      const res = await api.post<Resource<Sensor>>("/sensors", {
        serial: serial.trim(),
        sensor_type_id: Number(sensorTypeId),
      })
      router.push(`/sensors/${res.data.id}`)
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
    <AppShell title="New sensor" description="Register a physical sensor unit">
      <Link
        href="/sensors"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All sensors
      </Link>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Sensor details</CardTitle>
          <CardDescription>
            Serial identifies the physical unit. Mount it onto a device
            afterwards.
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
                placeholder="SN-TEMP-042"
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
            <Field>
              <FieldLabel>Sensor type</FieldLabel>
              <Select
                value={sensorTypeId}
                onValueChange={(v) => setSensorTypeId(v ?? "")}
                disabled={busy}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a type…" />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.code} ({t.unit})
                      {t.min_value != null && t.max_value != null
                        ? ` · ${t.min_value}…${t.max_value}`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.sensor_type_id && (
                <FieldError>{fieldErrors.sensor_type_id.join(" ")}</FieldError>
              )}
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || !sensorTypeId}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                Create sensor
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
