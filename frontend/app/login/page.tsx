"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { CloudSun, Eye, EyeOff, Loader2 } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ThemeModeToggle } from "@/components/theme-switcher"
import { useAuth } from "@/lib/auth"
import { ApiError, DOCS_URL } from "@/lib/api"

const DEMO_EMAIL = "admin@weather.local"
const DEMO_PASSWORD = "admin123"

export default function LoginPage() {
  const router = useRouter()
  const { token, isLoading: sessionLoading, login } = useAuth()
  const [email, setEmail] = useState(DEMO_EMAIL)
  const [password, setPassword] = useState(DEMO_PASSWORD)
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!sessionLoading && token) {
      router.replace("/")
    }
  }, [sessionLoading, token, router])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    if (!email.trim() || !password) {
      setError("Enter your email and password to continue.")
      return
    }
    setLoading(true)
    try {
      await login(email.trim(), password, remember)
      router.replace("/")
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.errors ?? {})
        setError(err.message || "Login failed. Please try again.")
      } else {
        setError((err as Error).message || "Login failed. Please try again.")
      }
    } finally {
      setLoading(false)
    }
  }

  function fillDemo() {
    setEmail(DEMO_EMAIL)
    setPassword(DEMO_PASSWORD)
    setError(null)
    setFieldErrors({})
  }

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 80% 60%, white 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary-foreground/15">
            <CloudSun className="size-5" />
          </span>
          <span className="text-sm font-semibold">Weather Station</span>
        </div>
        <div className="relative flex flex-col gap-4">
          <h2 className="max-w-md text-3xl leading-tight font-semibold">
            Live weather intelligence for every station.
          </h2>
          <p className="max-w-md text-sm text-primary-foreground/80">
            Stream telemetry from firmware to dashboard — calibrated readings,
            quality flags, rain deltas, and wind roses, refreshed every 60
            seconds.
          </p>
          <dl className="grid max-w-md grid-cols-3 gap-3 pt-2">
            {[
              ["60/min", "ingest limit"],
              ["15 min", "online window"],
              ["5k", "points cap"],
            ].map(([v, l]) => (
              <div key={l} className="rounded-lg bg-primary-foreground/10 p-3">
                <dt className="text-lg font-semibold">{v}</dt>
                <dd className="text-xs text-primary-foreground/75">{l}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="relative text-xs text-primary-foreground/70">
          Device auth uses per-device API keys · humans sign in with Sanctum
          tokens.
        </p>
      </div>

      {/* Form column */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between p-4">
          <span className="flex items-center gap-2 text-sm font-semibold lg:hidden">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <CloudSun className="size-4" />
            </span>
            Weather Station
          </span>
          <span className="hidden lg:block" />
          <ThemeModeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <Card className="w-full max-w-sm gap-0 py-0">
            <CardHeader className="gap-1.5 px-6 pt-6">
              <CardTitle className="text-xl">Welcome back</CardTitle>
              <CardDescription>
                Sign in to the operations dashboard. Sessions use short-lived
                Sanctum tokens.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 px-6 pt-4 pb-6">
              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                >
                  {error}
                </div>
              )}
              <form
                onSubmit={submit}
                className="flex flex-col gap-4"
                noValidate
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@station.local"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    aria-invalid={Boolean(fieldErrors.email)}
                    disabled={loading}
                  />
                  {fieldErrors.email && (
                    <p className="text-xs text-destructive">
                      {fieldErrors.email.join(" ")}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      aria-pressed={showPassword}
                    >
                      {showPassword ? (
                        <EyeOff className="size-3.5" />
                      ) : (
                        <Eye className="size-3.5" />
                      )}
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    aria-invalid={Boolean(fieldErrors.password)}
                    disabled={loading}
                  />
                  {fieldErrors.password && (
                    <p className="text-xs text-destructive">
                      {fieldErrors.password.join(" ")}
                    </p>
                  )}
                </div>
                <Field orientation="horizontal">
                  <Checkbox
                    id="remember"
                    checked={remember}
                    onCheckedChange={(checked) => setRemember(checked === true)}
                    disabled={loading}
                  />
                  <FieldLabel
                    htmlFor="remember"
                    className="text-sm font-normal text-muted-foreground"
                  >
                    Remember me on this device
                  </FieldLabel>
                </Field>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading && <Loader2 className="size-4 animate-spin" />}
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
              </form>
              <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                <p>
                  Demo account (seeder):{" "}
                  <code className="font-mono text-foreground">
                    {DEMO_EMAIL}
                  </code>{" "}
                  /{" "}
                  <code className="font-mono text-foreground">
                    {DEMO_PASSWORD}
                  </code>
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={fillDemo}
                  >
                    Autofill demo
                  </Button>
                  <a
                    href={DOCS_URL}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({ variant: "ghost", size: "xs" })}
                  >
                    API docs
                  </a>
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Signed-in sessions redirect automatically ·{" "}
                <Link href="/" className="underline">
                  Back to overview
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
