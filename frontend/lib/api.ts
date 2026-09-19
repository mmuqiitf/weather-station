const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";

const TOKEN_KEY = "ws_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function handleUnauthorized(status: number, code?: string) {
  if (typeof window !== "undefined" && status === 401 && code === "user_unauthenticated") {
    clearToken();
    if (!window.location.pathname.startsWith("/login")) {
      window.location.assign("/login");
    }
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => null)) as {
    data?: T;
    error?: { code?: string; message?: string };
    meta?: { request_id?: string };
  } | null;
  if (!res.ok) {
    const code = body?.error?.code ?? "unknown_error";
    handleUnauthorized(res.status, code);
    throw new ApiError(
      res.status,
      code,
      body?.error?.message ?? `Request failed with status ${res.status}`,
    );
  }
  return body?.data as T;
}

export interface Envelope<T> {
  data: T;
  error: null;
  meta: {
    request_id?: string;
    pagination?: { current_page: number; per_page: number; total: number; last_page: number };
    [k: string]: unknown;
  };
}

async function rawRequest<T>(path: string, init?: RequestInit): Promise<Envelope<T>> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => null)) as Envelope<T> & {
    error?: { code?: string; message?: string };
  };
  if (!res.ok) {
    const err = body as unknown as { error?: { code?: string; message?: string } };
    const code = err?.error?.code ?? "unknown_error";
    handleUnauthorized(res.status, code);
    throw new ApiError(
      res.status,
      code,
      err?.error?.message ?? `Request failed with status ${res.status}`,
    );
  }
  return body as Envelope<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  raw: <T>(path: string) => rawRequest<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
