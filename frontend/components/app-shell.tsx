"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { AuthGuard } from "@/components/auth-guard"

const SIDEBAR_KEY = "ws_sidebar"

interface AppShellProps {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}

export function AppShell({
  title,
  description,
  actions,
  children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_KEY) === "collapsed")
    } catch {
      // storage unavailable — keep expanded
    }
  }, [])

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(
          SIDEBAR_KEY,
          next ? "collapsed" : "expanded"
        )
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  return (
    <AuthGuard>
      <div className="flex min-h-svh bg-background text-foreground">
        <AppSidebar collapsed={collapsed} onToggle={toggle} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader
            title={title}
            description={description}
            actions={actions}
            onToggleSidebar={toggle}
          />
          <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
            {children}
          </main>
          <footer className="mx-auto w-full max-w-6xl px-4 pb-6 sm:px-6">
            <p className="text-xs text-muted-foreground">
              Timestamps stored UTC, displayed WIB (Asia/Jakarta) · auto-refresh
              60s · press{" "}
              <kbd className="rounded border bg-muted px-1 font-mono">D</kbd> to
              toggle light/dark
            </p>
          </footer>
        </div>
      </div>
    </AuthGuard>
  )
}
