"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  BookOpen,
  CloudSun,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  RadioTower,
  Tags,
  Thermometer,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ThemeModeToggle, ThemeSwitcher } from "@/components/theme-switcher"
import { useAuth } from "@/lib/auth"
import { DOCS_URL } from "@/lib/api"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/devices", label: "Devices", icon: RadioTower, exact: false },
  { href: "/sensors", label: "Sensors", icon: Thermometer, exact: false },
  { href: "/sensor-types", label: "Sensor Types", icon: Tags, exact: true },
]

function isActive(pathname: string, href: string, exact: boolean) {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

interface AppSidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()

  async function handleLogout() {
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

  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2.5 px-5 pt-6 pb-5",
          collapsed && "justify-center px-0"
        )}
      >
        <Link
          href="/"
          className="flex items-center gap-2.5"
          title="Weather Station"
          aria-label="Weather Station home"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <CloudSun className="size-5" />
          </span>
          {!collapsed && (
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold">Weather Station</span>
              <span className="text-xs text-muted-foreground">
                Monitoring platform
              </span>
            </span>
          )}
        </Link>
      </div>

      <nav
        className={cn("flex flex-col gap-1 px-3", collapsed && "items-center")}
        aria-label="Primary"
      >
        {NAV.map((item) => {
          const Icon = item.icon
          const active = isActive(pathname, item.href, item.exact)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
              aria-label={item.label}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                collapsed && "w-11 justify-center px-0 py-2.5",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && item.label}
            </Link>
          )
        })}
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noreferrer"
          title={collapsed ? "API docs" : undefined}
          aria-label="API docs"
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground",
            collapsed && "w-11 justify-center px-0 py-2.5"
          )}
        >
          <BookOpen className="size-4 shrink-0" />
          {!collapsed && "API docs"}
        </a>
      </nav>

      <div
        className={cn(
          "mt-auto flex flex-col gap-4 px-5 pb-5",
          collapsed && "items-center px-0"
        )}
      >
        {collapsed ? <ThemeModeToggle /> : <ThemeSwitcher />}
        <Separator />
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <span
              aria-hidden
              title={user?.email ?? "Account"}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
            >
              {initials}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={handleLogout}
              title="Log out (revokes this token)"
              aria-label="Log out"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
            >
              {initials}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium">
                {user?.name ?? "…"}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {user?.email ?? "Loading session…"}
              </span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={handleLogout}
              title="Log out (revokes this token)"
              aria-label="Log out"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size={collapsed ? "icon-sm" : "sm"}
          onClick={onToggle}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={collapsed ? "" : "w-full"}
        >
          <CollapseIcon className="size-4" />
          {!collapsed && "Collapse"}
        </Button>
      </div>
    </aside>
  )
}
