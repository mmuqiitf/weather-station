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
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError, api, type Resource } from "@/lib/api"
import type { SensorType } from "@/lib/types"
import { TypeFields, typeFormBody, type TypeFormValues } from "../../type-form"

export default function EditSensorTypePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [values, setValues] = useState<TypeFormValues | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const type = useSWR(`/sensor-types/${id}`, (p: string) =>
    api.get<Resource<SensorType>>(p)
  )
  const detail = type.data?.data

  useEffect(() => {
    if (detail && !values) {
      setValues({
        code: detail.code,
        unit: detail.unit,
        minValue: detail.min_value != null ? String(detail.min_value) : "",
        maxValue: detail.max_value != null ? String(detail.max_value) : "",
        precision: String(detail.precision),
      })
    }
  }, [detail, values])

  function onChange(key: keyof TypeFormValues, value: string) {
    setValues((v) => (v ? { ...v, [key]: value } : v))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!values) return
    setFieldErrors({})
    setFormError(null)
    setBusy(true)
    try {
      await api.patch<Resource<SensorType>>(
        `/sensor-types/${id}`,
        typeFormBody(values)
      )
      router.push(`/sensor-types/${id}`)
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
      title={`Edit ${detail?.code ?? `#${id}`}`}
      description="Update the type definition"
    >
      <Link
        href={`/sensor-types/${id}`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to type
      </Link>

      {type.isLoading || !values
        ? !type.error && (
            <Card className="max-w-xl">
              <CardContent className="flex flex-col gap-3 pt-6">
                <Skeleton className="h-9" />
                <Skeleton className="h-9" />
              </CardContent>
            </Card>
          )
        : null}
      {type.error && (
        <ResultAlert
          result={{
            kind: "err",
            title: "Failed to load type",
            text: (type.error as Error).message,
          }}
        />
      )}

      {values && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="font-mono">{detail?.code}</CardTitle>
            <CardDescription>
              Renaming a code changes what firmware payloads must send.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {formError && (
              <div className="mb-4">
                <ResultAlert result={{ kind: "err", title: formError }} />
              </div>
            )}
            <form onSubmit={submit} noValidate>
              <TypeFields
                values={values}
                onChange={onChange}
                fieldErrors={fieldErrors}
                busy={busy}
              />
              <div className="mt-4 flex gap-2">
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
