"use client"

import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export interface TypeFormValues {
  code: string
  unit: string
  minValue: string
  maxValue: string
  precision: string
}

interface TypeFieldsProps {
  values: TypeFormValues
  onChange: (key: keyof TypeFormValues, value: string) => void
  fieldErrors: Record<string, string[]>
  busy: boolean
}

/** Shared code/unit/range/precision fields for sensor-type create + edit. */
export function TypeFields({
  values,
  onChange,
  fieldErrors,
  busy,
}: TypeFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field>
        <FieldLabel htmlFor="code">Code</FieldLabel>
        <Input
          id="code"
          placeholder="temp_air"
          value={values.code}
          onChange={(e) => onChange("code", e.target.value)}
          required
          aria-invalid={Boolean(fieldErrors.code)}
          disabled={busy}
        />
        {fieldErrors.code && (
          <FieldError>{fieldErrors.code.join(" ")}</FieldError>
        )}
      </Field>
      <Field>
        <FieldLabel htmlFor="unit">Unit</FieldLabel>
        <Input
          id="unit"
          placeholder="°C"
          value={values.unit}
          onChange={(e) => onChange("unit", e.target.value)}
          required
          aria-invalid={Boolean(fieldErrors.unit)}
          disabled={busy}
        />
        {fieldErrors.unit && (
          <FieldError>{fieldErrors.unit.join(" ")}</FieldError>
        )}
      </Field>
      <Field>
        <FieldLabel htmlFor="min">Min (optional)</FieldLabel>
        <Input
          id="min"
          inputMode="decimal"
          placeholder="−50"
          value={values.minValue}
          onChange={(e) => onChange("minValue", e.target.value)}
          disabled={busy}
        />
        {fieldErrors.min_value && (
          <FieldError>{fieldErrors.min_value.join(" ")}</FieldError>
        )}
      </Field>
      <Field>
        <FieldLabel htmlFor="max">Max (optional)</FieldLabel>
        <Input
          id="max"
          inputMode="decimal"
          placeholder="60"
          value={values.maxValue}
          onChange={(e) => onChange("maxValue", e.target.value)}
          disabled={busy}
        />
        {fieldErrors.max_value && (
          <FieldError>{fieldErrors.max_value.join(" ")}</FieldError>
        )}
      </Field>
      <Field>
        <FieldLabel htmlFor="precision">Precision</FieldLabel>
        <Input
          id="precision"
          inputMode="numeric"
          value={values.precision}
          onChange={(e) => onChange("precision", e.target.value)}
          disabled={busy}
        />
        {fieldErrors.precision && (
          <FieldError>{fieldErrors.precision.join(" ")}</FieldError>
        )}
      </Field>
    </div>
  )
}

export function typeFormBody(values: TypeFormValues): Record<string, unknown> {
  return {
    code: values.code.trim(),
    unit: values.unit.trim(),
    min_value: values.minValue === "" ? null : Number(values.minValue),
    max_value: values.maxValue === "" ? null : Number(values.maxValue),
    precision: values.precision === "" ? null : Number(values.precision),
  }
}
