"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { api, clearToken, getToken, setToken } from "@/lib/api"

export interface AuthUser {
  id: number
  name: string
  email: string
}

interface LoginResponse {
  token: string
  token_type: string
  user: AuthUser
}

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string, remember: boolean) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    const t = getToken()
    setTokenState(t)
    if (!t) {
      setUser(null)
      return
    }
    try {
      const me = await api.get<{ data?: AuthUser } | AuthUser>("/auth/me")
      const resolved = (me as { data?: AuthUser }).data ?? (me as AuthUser)
      setUser(resolved)
    } catch {
      // Invalid / revoked token — drop it; the api layer also redirects on 401.
      clearToken()
      setTokenState(null)
      setUser(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setIsLoading(true)
      await refresh()
      if (!cancelled) setIsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  const login = useCallback(
    async (email: string, password: string, remember: boolean) => {
      const res = await api.post<LoginResponse>("/auth/login", {
        email,
        password,
      })
      if (!res.token) throw new Error("Login failed: no token returned.")
      setToken(res.token, remember)
      setTokenState(res.token)
      setUser(res.user ?? null)
      if (!res.user) {
        await refresh()
      }
    },
    [refresh]
  )

  const logout = useCallback(async () => {
    try {
      await api.post<{ revoked: boolean }>("/auth/logout")
    } catch {
      // Token may already be invalid — still clear local state.
    }
    clearToken()
    setTokenState(null)
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated: Boolean(token && user),
      login,
      logout,
      refresh,
    }),
    [user, token, isLoading, login, logout, refresh]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>")
  return ctx
}
