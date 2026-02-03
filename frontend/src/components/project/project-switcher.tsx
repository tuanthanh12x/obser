"use client"

import * as React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { Project } from "@/lib/api/projects"

export type ProjectSwitcherProps = {
  projects: Project[]
  selectedProjectId: number | null
  onSelectProjectId: (projectId: number) => void
  onManageProjects: () => void
  disabled?: boolean
  error?: string | null
}

export function ProjectSwitcher({
  projects,
  selectedProjectId,
  onSelectProjectId,
  onManageProjects,
  disabled,
  error,
}: ProjectSwitcherProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const selected = useMemo(() => {
    if (selectedProjectId == null) return null
    return projects.find((p) => p.id === selectedProjectId) ?? null
  }, [projects, selectedProjectId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) => {
      return (
        p.display_name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        (p.kind ?? "").toLowerCase().includes(q)
      )
    })
  }, [projects, query])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const el = rootRef.current
      if (!el) return
      if (e.target instanceof Node && el.contains(e.target)) return
      setOpen(false)
    }
    window.addEventListener("mousedown", onPointerDown, true)
    window.addEventListener("touchstart", onPointerDown, true)
    return () => {
      window.removeEventListener("mousedown", onPointerDown, true)
      window.removeEventListener("touchstart", onPointerDown, true)
    }
  }, [open])

  // Keep UX clean when switching projects
  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="outline"
        disabled={disabled || projects.length === 0}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "h-9 border-slate-700/50 bg-slate-900/40 text-slate-200 hover:bg-slate-800/60",
          "px-3 rounded-full",
        )}
      >
        <span className="mr-2 text-xs text-slate-400">Project</span>
        <span className="max-w-[220px] truncate text-sm font-medium">
          {selected ? selected.display_name : projects.length ? "Select…" : "None"}
        </span>
        <ChevronDown className={cn("ml-2 h-4 w-4 text-slate-400 transition-transform", open && "rotate-180")} />
      </Button>

      {open ? (
        <div
          className={cn(
            "absolute right-0 mt-2 w-[360px] max-w-[calc(100vw-2rem)]",
            "rounded-xl border border-slate-700/60 bg-slate-950/90 shadow-2xl backdrop-blur",
            "overflow-hidden z-50",
          )}
        >
          <div className="p-3 border-b border-slate-800/60">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects…"
                autoFocus
                className="pl-9 bg-slate-900/60 border-slate-700/60 text-slate-100 placeholder:text-slate-500"
              />
            </div>
            {error ? <div className="mt-2 text-xs text-red-300">{error}</div> : null}
          </div>

          <div className="max-h-[320px] overflow-auto">
            {filtered.length === 0 ? (
              <div className="p-4 text-sm text-slate-400">No matches.</div>
            ) : (
              filtered.map((p) => {
                const active = p.id === selectedProjectId
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onSelectProjectId(p.id)
                      setOpen(false)
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2.5 flex items-center gap-3",
                      "hover:bg-slate-900/60 transition-colors",
                      active && "bg-slate-900/40",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-medium text-slate-100">{p.display_name}</div>
                        <div className="shrink-0 rounded-md border border-slate-700/60 bg-slate-900/50 px-1.5 py-0.5 text-[11px] text-slate-300 font-mono">
                          {p.code}
                        </div>
                        {p.kind ? (
                          <div className="shrink-0 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[11px] text-cyan-200">
                            {p.kind}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {active ? <Check className="h-4 w-4 text-cyan-400" /> : <div className="h-4 w-4" />}
                  </button>
                )
              })
            )}
          </div>

          <div className="p-3 border-t border-slate-800/60 flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false)
                onManageProjects()
              }}
              className="h-9 border-slate-700/50 bg-slate-900/40 text-slate-200 hover:bg-slate-800/60 rounded-full"
            >
              Manage projects
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

