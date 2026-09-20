"use client"

import type { ReactNode } from "react"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
import {
  createColumnHelper,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  type ColumnDef,
  type PaginationState,
  type ReactTable,
  type RowData,
  type SortingState,
} from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/** Shared TanStack Table v9 feature set: controlled sorting + pagination. */
export const serverTableFeatures = tableFeatures({
  rowPaginationFeature,
  rowSortingFeature,
})

/** Column helper bound to the shared feature set. */
export function serverColumnHelper<TData extends RowData>() {
  return createColumnHelper<typeof serverTableFeatures, TData>()
}

export type ServerTable<TData extends RowData> = ReactTable<
  typeof serverTableFeatures,
  TData
>

/** Column type for server tables — value types vary per column, hence `any`. */
export type ServerColumnDef<TData extends RowData> = ColumnDef<
  typeof serverTableFeatures,
  TData,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>

const DEFAULT_PAGE_SIZES = [10, 15, 25, 50, 100]

interface DataTableProps<TData extends RowData> {
  table: ServerTable<TData>
  /** Total rows on the server (Laravel `meta.total`). */
  totalRows: number
  pageIndex: number
  pageSize: number
  onPageIndexChange: (index: number) => void
  onPageSizeChange: (size: number) => void
  pageSizeOptions?: number[]
  isLoading?: boolean
  error?: Error | null
  onRetry?: () => void
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: ReactNode
}

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (sorted === "asc") return <ArrowUp className="size-3.5" />
  if (sorted === "desc") return <ArrowDown className="size-3.5" />
  return <ArrowUpDown className="size-3.5 opacity-50" />
}

export { SortIcon as TableSortIcon }

export function DataTable<TData extends RowData>({
  table,
  totalRows,
  pageIndex,
  pageSize,
  onPageIndexChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  isLoading,
  error,
  onRetry,
  emptyTitle = "No rows found",
  emptyDescription,
  emptyAction,
}: DataTableProps<TData>) {
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize))
  const safePageIndex = Math.min(pageIndex, pageCount - 1)
  const rows = table.getRowModel().rows
  const columnCount = table.getHeaderGroups()[0]?.headers.length ?? 3

  return (
    <div className="flex flex-col">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      title={`Sort by ${String(header.column.columnDef.header ?? header.id)}`}
                      className="flex items-center gap-1.5 font-medium hover:text-foreground"
                    >
                      <table.FlexRender header={header} />
                      <SortIcon sorted={header.column.getIsSorted()} />
                    </button>
                  ) : (
                    <table.FlexRender header={header} />
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: columnCount }).map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : error ? (
            <TableRow>
              <TableCell colSpan={columnCount} className="py-8 text-center">
                <p className="text-sm text-destructive">
                  Failed to load: {error.message}
                </p>
                {onRetry && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRetry}
                    className="mt-3"
                  >
                    Retry
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnCount} className="py-8">
                <div className="flex flex-col items-center gap-2 text-center">
                  <p className="font-medium">{emptyTitle}</p>
                  {emptyDescription && (
                    <p className="text-sm text-muted-foreground">
                      {emptyDescription}
                    </p>
                  )}
                  {emptyAction}
                </div>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4 text-sm">
        <span className="text-muted-foreground">
          {totalRows === 0
            ? "0 rows"
            : `${safePageIndex * pageSize + 1}–${Math.min((safePageIndex + 1) * pageSize, totalRows)} of ${totalRows} rows`}
        </span>
        <span className="flex items-center gap-2">
          <label htmlFor="datatable-pagesize" className="text-muted-foreground">
            Per page
          </label>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              if (v) onPageSizeChange(Number(v))
            }}
          >
            <SelectTrigger id="datatable-pagesize" size="sm" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
        <span className="ms-auto flex items-center gap-1">
          <span className="me-2 text-muted-foreground">
            Page {safePageIndex + 1} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={safePageIndex <= 0}
            onClick={() => onPageIndexChange(0)}
            aria-label="First page"
          >
            <ChevronsLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={safePageIndex <= 0}
            onClick={() => onPageIndexChange(safePageIndex - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={safePageIndex >= pageCount - 1}
            onClick={() => onPageIndexChange(safePageIndex + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={safePageIndex >= pageCount - 1}
            onClick={() => onPageIndexChange(pageCount - 1)}
            aria-label="Last page"
          >
            <ChevronsRight className="size-4" />
          </Button>
        </span>
      </div>
    </div>
  )
}

export type { PaginationState, SortingState }
