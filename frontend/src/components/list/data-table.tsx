"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export type DataTableColumn<T> = {
  id: string
  header: React.ReactNode
  className?: string
  headerClassName?: string
  cell?: (row: T) => React.ReactNode
}

export type DataTableProps<T> = {
  columns: Array<DataTableColumn<T>>
  data: T[]
  getRowKey: (row: T, index: number) => React.Key
  emptyMessage?: string
  rowClassName?: (row: T, index: number) => string | undefined
}

export function DataTable<T>({
  columns,
  data,
  getRowKey,
  emptyMessage = "No data.",
  rowClassName,
}: DataTableProps<T>) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((col) => (
            <TableHead key={col.id} className={cn(col.headerClassName)}>
              {col.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>

      <TableBody>
        {data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          data.map((row, index) => (
            <TableRow key={getRowKey(row, index)} className={cn(rowClassName?.(row, index))}>
              {columns.map((col) => (
                <TableCell key={col.id} className={cn(col.className)}>
                  {col.cell ? col.cell(row) : null}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}

