"use client"

import { useRouter } from "next/navigation"
import { useEffect, type ReactNode } from "react"
import { useAuth } from "@/lib/auth"
import { Skeleton } from "@/components/ui/skeleton"

function GuardFallback() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6">
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}

/** Client route guard — redirects to /login when no Sanctum token is present. */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { token, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !token) {
      router.replace("/login")
    }
  }, [isLoading, token, router])

  if (isLoading) return <GuardFallback />
  if (!token) return <GuardFallback />
  return <>{children}</>
}
