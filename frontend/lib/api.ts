export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1"

export const DOCS_URL =
  process.env.NEXT_PUBLIC_DOCS_URL ?? "http://localhost:8080/docs/api"

const TOKEN_KEY = "ws_token"

export function getToken(): string | null {
  if (typeof window === "undefined") return null
  try {
    return (
      window.localStorage.getItem(TOKEN_KEY) ??
      window.sessionStorage.getItem(TOKEN_KEY)
    )
  } catch {
    return null
  }
}

export function setToken(token: string, remember = true) {
  try {
    if (remember) {
      window.localStorage.setItem(TOKEN_KEY, token)
      window.sessionStorage.removeItem(TOKEN_KEY)
    } else {
      window.sessionStorage.setItem(TOKEN_KEY, token)
      window.localStorage.removeItem(TOKEN_KEY)
    }
  } catch {
    // storage unavailable — token stays in memory only
  }
}

export function clearToken() {
  try {
    window.localStorage.removeItem(TOKEN_KEY)
    window.sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
}

export class ApiError extends Error {
  status: number
  errors?: Record<string, string[]>

  constructor(
    status: number,
    message: string,
    errors?: Record<string, string[]>
  ) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function handleUnauthorized(status: number) {
  // Only dashboard (human) endpoints are called from here, so any 401
  // means the Sanctum token is missing or revoked.
  if (typeof window !== "undefined" && status === 401) {
    clearToken()
    if (!window.location.pathname.startsWith("/login")) {
      window.location.assign("/login")
    }
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  })
  const body = (await res.json().catch(() => null)) as
    | (T & {
        message?: string
        errors?: Record<string, string[]>
      })
    | null
  if (!res.ok) {
    handleUnauthorized(res.status)
    const message =
      (body as { message?: string } | null)?.message ??
      `Request failed with status ${res.status}`
    throw new ApiError(res.status, message, body?.errors)
  }
  return body as T
}

/** Laravel default pagination envelope: {data, links, meta{current_page,…,total}}. */
export interface Paginated<T> {
  data: T[]
  meta: {
    current_page: number
    per_page: number
    total: number
    last_page: number
  }
}

/** Single API Resource response: {data}. */
export interface Resource<T> {
  data: T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
}
