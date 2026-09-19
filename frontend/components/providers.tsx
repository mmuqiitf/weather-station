"use client"

import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { api } from "@/lib/api";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: (path: string) => api.get(path),
        refreshInterval: 60_000,
        revalidateOnFocus: false,
        shouldRetryOnError: (err) =>
          err?.status === 429 || (err?.status ?? 500) >= 500,
      }}
    >
      {children}
    </SWRConfig>
  );
}
