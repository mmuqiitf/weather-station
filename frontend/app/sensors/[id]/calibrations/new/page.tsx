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
import { ApiError, api, type Paginated } from "@/lib/api"
import type { Sensor } from "@/lib/types"

export default function NewCalibrationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const sensorId = Number(id)
  const router = useRouter()
  const [offset, setOffset] = useState("0")
  const [scale, setScale] = useState("1")
  const [effectiveAt, setEffectiveAt] = useState(() =>
    toInputDatetime(new Date())
  )
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

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setFieldErrors({})
    setFormError(null)
    setBusy(true)
    try {
      await api.post(`/sensors/${sensorId}/calibrations`, {
        offset: Number(offset),
        scale: Number(scale),
        effective_at: fromInputDatetime(effectiveAt),
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
      title={`Calibrate ${sensor?.serial ?? `#${id}`}`}
      description="Record a correction for future readings"
    >
      <Link
        href={`/sensors/${sensorId}`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to sensor
      </Link>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Calibration</CardTitle>
          <CardDescription>
            value = offset + scale × raw for readings at or after effective_at.
            Raw values are never mutated.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {formError && (
            <div className="mb-4">
              <ResultAlert result={{ kind: "err", title: formError }} />
            </div>
          )}
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="offset">Offset</FieldLabel>
                <Input
                  id="offset"
                  inputMode="decimal"
                  value={offset}
                  onChange={(e) => setOffset(e.target.value)}
                  disabled={busy}
                />
                {fieldErrors.offset && (
                  <FieldError>{fieldErrors.offset.join(" ")}</FieldError>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="scale">Scale</FieldLabel>
                <Input
                  id="scale"
                  inputMode="decimal"
                  value={scale}
                  onChange={(e) => setScale(e.target.value)}
                  disabled={busy}
                />
                {fieldErrors.scale && (
                  <FieldError>{fieldErrors.scale.join(" ")}</FieldError>
                )}
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="effective_at">Effective at</FieldLabel>
              <Input
                id="effective_at"
                type="datetime-local"
                value={effectiveAt}
                onChange={(e) => setEffectiveAt(e.target.value)}
                disabled={busy}
              />
              {fieldErrors.effective_at && (
                <FieldError>{fieldErrors.effective_at.join(" ")}</FieldError>
              )}
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                Save calibration
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
