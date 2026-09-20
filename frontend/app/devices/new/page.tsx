"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import useSWR from "swr"
import { ArrowLeft, Check, Copy, Loader2, Plus } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { ResultAlert } from "@/components/crud"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
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
import { ApiError, api, type Resource } from "@/lib/api"
import type { DeviceDetail, DeviceLocation } from "@/lib/types"

const NONE = "none"

export default function NewDevicePage() {
  const router = useRouter()
  const [deviceId, setDeviceId] = useState("")
  const [name, setName] = useState("")
  const [locationId, setLocationId] = useState(NONE)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<
    (DeviceDetail & { api_key_plain?: string }) | null
  >(null)
  const [copied, setCopied] = useState(false)

  const locations = useSWR("/locations", (p: string) =>
    api.get<Resource<DeviceLocation[]>>(p)
  )
  const locationOptions = locations.data?.data ?? []

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setFieldErrors({})
    setFormError(null)
    setBusy(true)
    try {
      const res = await api.post<
        Resource<DeviceDetail & { api_key_plain?: string }>
      >("/devices", {
        device_id: deviceId.trim(),
        name: name.trim(),
        ...(locationId !== NONE ? { location_id: Number(locationId) } : {}),
      })
      setCreated(res.data)
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

  function reset() {
    setDeviceId("")
    setName("")
    setLocationId(NONE)
    setCreated(null)
    setCopied(false)
  }

  async function copyKey() {
    if (!created?.api_key_plain) return
    try {
      await navigator.clipboard.writeText(created.api_key_plain)
      setCopied(true)
    } catch {
      // clipboard unavailable — key is still visible for manual copy
    }
  }

  return (
    <AppShell title="New device" description="Provision a weather station">
      <Link
        href="/devices"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All devices
      </Link>

      {created ? (
        <div className="flex flex-col gap-4">
          <Alert>
            <AlertTitle>Device {created.device_id} created</AlertTitle>
            <AlertDescription>
              {created.api_key_plain
                ? "Copy the API key now — it is shown only once. Flash it to the device firmware."
                : "The API key was not returned. Rotate the key from the device list if needed."}
            </AlertDescription>
          </Alert>
          {created.api_key_plain && (
            <Card>
              <CardContent className="flex flex-col gap-3 pt-6">
                <code className="rounded-lg border bg-muted/60 px-3 py-2.5 font-mono text-sm break-all">
                  {created.api_key_plain}
                </code>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={copyKey}>
                    {copied ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                    {copied ? "Copied" : "Copy key"}
                  </Button>
                  <Button variant="outline" onClick={reset}>
                    <Plus className="size-4" /> Add another
                  </Button>
                  <Link
                    href={`/devices/${created.device_id}`}
                    className={buttonVariants()}
                  >
                    View device
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Device details</CardTitle>
            <CardDescription>
              New devices start as “provisioned”. Activate them after the first
              payload arrives.
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
                <FieldLabel htmlFor="device_id">Device ID</FieldLabel>
                <Input
                  id="device_id"
                  placeholder="WS-GRT-004"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  required
                  aria-invalid={Boolean(fieldErrors.device_id)}
                  disabled={busy}
                />
                <FieldDescription>
                  Physical identity, e.g. WS-GRT-001. Must be unique.
                </FieldDescription>
                {fieldErrors.device_id && (
                  <FieldError>{fieldErrors.device_id.join(" ")}</FieldError>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="name">Display name</FieldLabel>
                <Input
                  id="name"
                  placeholder="Station Garut 4"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  aria-invalid={Boolean(fieldErrors.name)}
                  disabled={busy}
                />
                {fieldErrors.name && (
                  <FieldError>{fieldErrors.name.join(" ")}</FieldError>
                )}
              </Field>
              <Field>
                <FieldLabel>Location (optional)</FieldLabel>
                <Select
                  value={locationId}
                  onValueChange={(v) => setLocationId(v ?? NONE)}
                  disabled={busy}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No location</SelectItem>
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
                  Create device
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
