const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => null)) as {
    data?: T;
    error?: { code?: string; message?: string };
    meta?: { request_id?: string };
  } | null;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.error?.code ?? "unknown_error",
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
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => null)) as Envelope<T> & {
    error?: { code?: string; message?: string };
  };
  if (!res.ok) {
    const err = body as unknown as { error?: { code?: string; message?: string } };
    throw new ApiError(
      res.status,
      err?.error?.code ?? "unknown_error",
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
