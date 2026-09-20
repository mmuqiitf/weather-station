"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState, type ReactNode } from "react"
import {
  BookOpen,
  LayoutDashboard,
  LogOut,
  PanelLeft,
  RadioTower,
  Tags,
  Thermometer,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeModeToggle } from "@/components/theme-switcher"
import { useAuth } from "@/lib/auth"
import { DOCS_URL } from "@/lib/api"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/devices", label: "Devices", icon: RadioTower, exact: false },
  { href: "/sensors", label: "Sensors", icon: Thermometer, exact: false },
  { href: "/sensor-types", label: "Types", icon: Tags, exact: true },
]

interface AppHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
  onToggleSidebar?: () => void
}

export function AppHeader({
  title,
  description,
  actions,
  onToggleSidebar,
}: AppHeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleLogout() {
    setMenuOpen(false)
    await logout()
    router.replace("/login")
  }

  const initials = user
    ? user.name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "WS"

  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        {onToggleSidebar && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onToggleSidebar}
            title="Toggle sidebar"
            aria-label="Toggle sidebar"
            className="hidden lg:inline-flex"
          >
            <PanelLeft className="size-4" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg leading-tight font-semibold">
            {title}
          </h1>
          {description && (
            <p className="truncate text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
        <ThemeModeToggle />
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={user?.email ?? "Account"}
            className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            {initials}
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close account menu"
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setMenuOpen(false)}
              />
              <div
                role="menu"
                className="absolute right-0 z-50 mt-2 w-56 rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-md"
              >
                <div className="px-2.5 py-2">
                  <p className="truncate text-sm font-medium">
                    {user?.name ?? "…"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {user?.email ?? "Loading…"}
                  </p>
                </div>
                <a
                  href={DOCS_URL}
                  target="_blank"
                  rel="noreferrer"
                  role="menuitem"
                  className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-muted lg:hidden"
                  onClick={() => setMenuOpen(false)}
                >
                  <BookOpen className="size-4" /> API docs
                </a>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="size-4" /> Log out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {/* Mobile nav — sidebar is desktop-only */}
      <nav
        aria-label="Primary"
        className="mx-auto flex w-full max-w-6xl items-center gap-1 overflow-x-auto px-4 pb-2.5 sm:px-6 lg:hidden"
      >
        {NAV.map((item) => {
          const Icon = item.icon
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
