"use client"

import { CircleAlert, CircleCheck, Loader2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { DeviceStatus } from "@/lib/types"

export function OnlineBadge({ online }: { online: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        online
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-destructive/40 bg-destructive/10 text-destructive"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          online ? "bg-emerald-500" : "bg-destructive"
        )}
      />
      {online ? "online" : "offline"}
    </Badge>
  )
}

export function DeviceStatusBadge({ status }: { status: DeviceStatus }) {
  return (
    <Badge variant={status === "active" ? "default" : "secondary"}>
      {status}
    </Badge>
  )
}

export function QualityBadge({ quality }: { quality: string }) {
  if (quality === "ok") return null
  return (
    <Badge
      variant="outline"
      className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
    >
      {quality}
    </Badge>
  )
}

export interface SubmitResult {
  kind: "ok" | "err"
  title: string
  text?: string
}

export function ResultAlert({ result }: { result: SubmitResult | null }) {
  if (!result) return null
  const Icon = result.kind === "ok" ? CircleCheck : CircleAlert
  return (
    <Alert variant={result.kind === "err" ? "destructive" : "default"}>
      <Icon />
      <AlertTitle>{result.title}</AlertTitle>
      {result.text && (
        <AlertDescription className="break-all">{result.text}</AlertDescription>
      )}
    </Alert>
  )
}

interface DeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  busy: boolean
  onConfirm: () => void
  confirmLabel?: string
}

export function DeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  busy,
  onConfirm,
  confirmLabel = "Delete",
}: DeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Format a Date for `<input type="datetime-local">` (local time, no seconds). */
export function toInputDatetime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/** Parse a `datetime-local` value back to an ISO-8601 UTC string. */
export function fromInputDatetime(value: string): string {
  return new Date(value).toISOString()
}
