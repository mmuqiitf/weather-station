"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowLeft, Loader2, Plus } from "lucide-react"
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
import { ApiError, api, type Resource } from "@/lib/api"
import type { SensorType } from "@/lib/types"
import { TypeFields, typeFormBody, type TypeFormValues } from "../type-form"

export default function NewSensorTypePage() {
  const router = useRouter()
  const [values, setValues] = useState<TypeFormValues>({
    code: "",
    unit: "",
    minValue: "",
    maxValue: "",
    precision: "2",
  })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function onChange(key: keyof TypeFormValues, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setFieldErrors({})
    setFormError(null)
    setBusy(true)
    try {
      const res = await api.post<Resource<SensorType>>(
        "/sensor-types",
        typeFormBody(values)
      )
      router.push(`/sensor-types/${res.data.id}`)
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
    <AppShell title="New sensor type" description="Define a measurement kind">
      <Link
        href="/sensor-types"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All types
      </Link>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Type details</CardTitle>
          <CardDescription>
            Codes must be unique, e.g. temp_air. Out-of-range readings are kept
            with a flag.
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
                <Plus className="size-4" /> Create type
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
