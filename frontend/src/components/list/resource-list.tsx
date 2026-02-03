"use client"

import * as React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react"
import axios from "axios"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { DataTable, type DataTableColumn } from "@/components/list/data-table"

type FetchPageParams = { skip: number; limit: number }

export type ResourceListProps<T> = {
  title: string
  columns: Array<DataTableColumn<T>>
  fetchPage: (params: FetchPageParams) => Promise<T[]>
  getRowKey: (row: T, index: number) => React.Key

  pageSize?: number
  searchPlaceholder?: string
  searchFilter?: (row: T, query: string) => boolean

  headerActions?: React.ReactNode
}

function defaultSearchFilter(row: unknown, query: string): boolean {
  try {
    return JSON.stringify(row).toLowerCase().includes(query.toLowerCase())
  } catch {
    return false
  }
}

function extractApiErrorDetail(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined
  const detail = (data as Record<string, unknown>).detail
  return typeof detail === "string" ? detail : undefined
}

export function ResourceList<T>({
  title,
  columns,
  fetchPage,
  getRowKey,
  pageSize = 25,
  searchPlaceholder = "Search…",
  searchFilter,
  headerActions,
}: ResourceListProps<T>) {
  const [skip, setSkip] = useState(0)
  const [limit, setLimit] = useState(pageSize)
  const [rows, setRows] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await fetchPage({ skip, limit })
      setRows(data)
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? extractApiErrorDetail(err.response?.data) ?? err.message
        : err instanceof Error
          ? err.message
          : "Failed to load data"
      setError(String(msg))
    } finally {
      setIsLoading(false)
    }
  }, [fetchPage, limit, skip])

  useEffect(() => {
    void load()
  }, [load])

  // Keep limit in sync if pageSize prop changes.
  useEffect(() => {
    setLimit(pageSize)
  }, [pageSize])

  const filteredRows = useMemo(() => {
    const q = query.trim()
    if (!q) return rows
    const fn = searchFilter ?? defaultSearchFilter
    return rows.filter((r) => fn(r, q))
  }, [query, rows, searchFilter])

  const canPrev = skip > 0
  const canNext = rows.length === limit && !isLoading

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          <div className="text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${filteredRows.length} shown`}
            {query.trim() ? " (filtered)" : ""}
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {headerActions ? <div className="flex items-center gap-2">{headerActions}</div> : null}
          <div className="relative w-full sm:w-[280px]">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9"
            />
          </div>

          <Button variant="outline" onClick={() => void load()} disabled={isLoading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="rounded-md border">
          <DataTable
            columns={columns}
            data={filteredRows}
            getRowKey={getRowKey}
            emptyMessage={isLoading ? "Loading…" : "No results."}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page: {Math.floor(skip / limit) + 1}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSkip((s) => Math.max(0, s - limit))}
              disabled={!canPrev || isLoading}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSkip((s) => s + limit)}
              disabled={!canNext}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

