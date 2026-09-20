"use client"

import { useEffect, useState } from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const MODES = [
  { id: "light", name: "Light", icon: Sun },
  { id: "dark", name: "Dark", icon: Moon },
  { id: "system", name: "System", icon: Monitor },
] as const

/** Icon-only button that cycles light → dark → system. Used in the topbar. */
export function ThemeModeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  function cycle() {
    if (theme === "light") setTheme("dark")
    else if (theme === "dark") setTheme("system")
    else setTheme("light")
  }

  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={cycle}
      title={
        mounted
          ? `Theme: ${theme ?? "system"} (click to change)`
          : "Toggle color mode"
      }
      aria-label="Toggle color mode"
      className={className}
    >
      {mounted ? <Icon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  )
}

/** Compact appearance switcher: light / dark / system segmented control. */
export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <p className="text-xs font-medium text-muted-foreground">Appearance</p>
      <div className="grid grid-cols-3 gap-1 rounded-lg border bg-muted/50 p-1">
        {MODES.map((m) => {
          const Icon = m.icon
          const active = mounted && theme === m.id
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setTheme(m.id)}
              aria-pressed={active}
              title={`${m.name} mode`}
              className={cn(
                "flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-3.5" />
              {m.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
