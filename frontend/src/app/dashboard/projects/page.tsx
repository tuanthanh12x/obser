"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import axios from "axios"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ResourceList } from "@/components/list/resource-list"
import { getAccessToken } from "@/lib/api/tokenStorage"
import { createProject, listProjects, type Project } from "@/lib/api/projects"
import { isSuperuserFromToken } from "@/lib/auth/jwt"

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

export default function ProjectsPage() {
  const router = useRouter()
  const [reloadKey, setReloadKey] = useState(0)

  const [createCode, setCreateCode] = useState("")
  const [createName, setCreateName] = useState("")
  const [createKind, setCreateKind] = useState("")
  const [createError, setCreateError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    if (!getAccessToken()) router.replace("/login")
  }, [router])

  const isAdmin = isSuperuserFromToken(getAccessToken())

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsCreating(true)
    setCreateError(null)
    try {
      await createProject({
        code: createCode.trim(),
        display_name: createName.trim(),
        kind: createKind.trim() ? createKind.trim() : null,
      })
      setCreateCode("")
      setCreateName("")
      setCreateKind("")
      setReloadKey((k) => k + 1)
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? (typeof err.response?.data === "object" && err.response?.data
            ? (err.response?.data as Record<string, unknown>).detail
            : undefined) ?? err.message
        : err instanceof Error
          ? err.message
          : "Create project failed"
      setCreateError(typeof msg === "string" ? msg : "Create project failed")
    } finally {
      setIsCreating(false)
    }
  }

  const columns = useMemo(
    () => [
      {
        id: "code",
        header: "Code",
        cell: (p: Project) => <span className="font-medium">{p.code}</span>,
      },
      {
        id: "display_name",
        header: "Name",
        cell: (p: Project) => p.display_name,
      },
      {
        id: "kind",
        header: "Kind",
        cell: (p: Project) =>
          p.kind ? <Badge variant="secondary">{p.kind}</Badge> : <span className="text-muted-foreground">—</span>,
      },
      {
        id: "created_at",
        header: "Created",
        className: "text-muted-foreground",
        cell: (p: Project) => formatDate(p.created_at),
      },
      {
        id: "actions",
        header: "",
        className: "w-[1%] whitespace-nowrap text-right",
        cell: (p: Project) => (
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard?projectId=${p.id}`)}>
              Dashboard
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/projects/${p.id}`)}>
              Manage
            </Button>
          </div>
        ),
      },
    ],
    [router],
  )

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10 dark:bg-black">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <CardTitle>Projects</CardTitle>
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              Back to dashboard
            </Button>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This page is built on a reusable <code>ResourceList</code> component (columns + fetcher). You can reuse it
            for other lists by swapping the API function + columns.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create project</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isAdmin ? (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                Only admin can create projects.
              </div>
            ) : (
              <form onSubmit={onCreate} className="grid gap-3 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Code</Label>
                  <Input id="code" value={createCode} onChange={(e) => setCreateCode(e.target.value)} required />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="name">Display name</Label>
                  <Input id="name" value={createName} onChange={(e) => setCreateName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kind">Kind</Label>
                  <Input id="kind" value={createKind} onChange={(e) => setCreateKind(e.target.value)} placeholder="optional" />
                </div>

                <div className="md:col-span-4 flex items-center justify-between gap-3">
                  {createError ? (
                    <div className="text-sm text-destructive">{createError}</div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Creates via POST /api/v1/projects</div>
                  )}
                  <Button type="submit" disabled={isCreating}>
                    {isCreating ? "Creating…" : "Create"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <ResourceList<Project>
          title="All projects"
          columns={columns}
          getRowKey={(p) => p.id}
          fetchPage={({ skip, limit }) => listProjects({ skip, limit })}
          searchPlaceholder="Search code / name / kind…"
          searchFilter={(p, q) => {
            const qq = q.toLowerCase()
            return (
              p.code.toLowerCase().includes(qq) ||
              p.display_name.toLowerCase().includes(qq) ||
              (p.kind ?? "").toLowerCase().includes(qq)
            )
          }}
          // Re-mount list to refetch after create
          key={reloadKey}
        />
      </div>
    </div>
  )
}

