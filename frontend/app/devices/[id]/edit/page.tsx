"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { use, useEffect, useState } from "react"
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError, api, type Paginated, type Resource } from "@/lib/api"
import type { DeviceDetail, DeviceLocation, DeviceStatus } from "@/lib/types"

const KEEP = "keep"
const STATUSES: DeviceStatus[] = ["provisioned", "active", "decommissioned"]

export default function EditDevicePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [name, setName] = useState("")
  const [status, setStatus] = useState<string>(KEEP)
  const [locationId, setLocationId] = useState<string>(KEEP)
  const [initialized, setInitialized] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const device = useSWR(`/devices/${id}`, (p: string) =>
    api.get<Resource<DeviceDetail>>(p)
  )
  const locations = useSWR("/locations?per_page=100", (p: string) =>
    api.get<Paginated<DeviceLocation>>(p)
  )

  const detail = device.data?.data
  const locationOptions = locations.data?.data ?? []

  useEffect(() => {
    if (detail && !initialized) {
      setName(detail.name)
      setInitialized(true)
    }
  }, [detail, initialized])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setFieldErrors({})
    setFormError(null)
    setBusy(true)
    try {
      const body: Record<string, string> = {}
      if (name.trim() && detail && name.trim() !== detail.name)
        body.name = name.trim()
      if (status !== KEEP) body.status = status
      if (locationId !== KEEP) body.location_id = locationId
      if (Object.keys(body).length === 0) {
        setFormError("No changes to save.")
        return
      }
      await api.patch<Resource<DeviceDetail>>(`/devices/${id}`, body)
      router.push(`/devices/${id}`)
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
      title={`Edit ${detail?.device_id ?? id}`}
      description="Update name, status, or location"
    >
      <Link
        href={`/devices/${id}`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to device
      </Link>

      {device.isLoading || !detail
        ? !device.error && (
            <Card className="max-w-xl">
              <CardContent className="flex flex-col gap-3 pt-6">
                <Skeleton className="h-9" />
                <Skeleton className="h-9" />
                <Skeleton className="h-9" />
              </CardContent>
            </Card>
          )
        : null}
      {device.error && (
        <ResultAlert
          result={{
            kind: "err",
            title: "Failed to load device",
            text: (device.error as Error).message,
          }}
        />
      )}

      {detail && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>{detail.device_id}</CardTitle>
            <CardDescription>
              Controlled transition: provisioned → active → decommissioned.
              Illegal moves are rejected with a 422.
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
                <FieldLabel htmlFor="name">Display name</FieldLabel>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.name)}
                  disabled={busy}
                />
                {fieldErrors.name && (
                  <FieldError>{fieldErrors.name.join(" ")}</FieldError>
                )}
              </Field>
              <Field>
                <FieldLabel>Status</FieldLabel>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v ?? KEEP)}
                  disabled={busy}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={KEEP}>
                      Keep current ({detail.status})
                    </SelectItem>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Decommissioning a station keeps its history but stops it from
                  ingesting.
                </FieldDescription>
                {fieldErrors.status && (
                  <FieldError>{fieldErrors.status.join(" ")}</FieldError>
                )}
              </Field>
              <Field>
                <FieldLabel>Location</FieldLabel>
                <Select
                  value={locationId}
                  onValueChange={(v) => setLocationId(v ?? KEEP)}
                  disabled={busy}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={KEEP}>
                      Keep current ({detail.location?.name ?? "none"})
                    </SelectItem>
                    {locationOptions.map((l) => (
                      <SelectItem key={l.id} value={String(l.id)}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldErrors.location_id && (
                  <FieldError>{fieldErrors.location_id.join(" ")}</FieldError>
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
