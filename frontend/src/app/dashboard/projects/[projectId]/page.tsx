"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import axios from "axios"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { getAccessToken } from "@/lib/api/tokenStorage"
import { deleteProject, getProject, updateProject, type Project } from "@/lib/api/projects"
import { isSuperuserFromToken } from "@/lib/auth/jwt"

function toInt(x: string | string[] | undefined): number | null {
  if (!x) return null
  const s = Array.isArray(x) ? x[0] : x
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export default function ProjectDetailPage() {
  const router = useRouter()
  const params = useParams<{ projectId: string }>()
  const projectId = useMemo(() => toInt(params?.projectId), [params])

  const [project, setProject] = useState<Project | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [code, setCode] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [kind, setKind] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (!getAccessToken()) router.replace("/login")
  }, [router])

  const isAdmin = isSuperuserFromToken(getAccessToken())

  useEffect(() => {
    if (!projectId) return
    setIsLoading(true)
    setError(null)
    ;(async () => {
      try {
        const p = await getProject(projectId)
        setProject(p)
        setCode(p.code)
        setDisplayName(p.display_name)
        setKind(p.kind ?? "")
      } catch (err: unknown) {
        const msg = axios.isAxiosError(err) ? err.message : err instanceof Error ? err.message : "Failed to load project"
        setError(String(msg))
      } finally {
        setIsLoading(false)
      }
    })()
  }, [projectId])

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!projectId) return
    setIsSaving(true)
    setError(null)
    try {
      const updated = await updateProject(projectId, {
        code: code.trim(),
        display_name: displayName.trim(),
        kind: kind.trim() ? kind.trim() : null,
      })
      setProject(updated)
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.message : err instanceof Error ? err.message : "Save failed"
      setError(String(msg))
    } finally {
      setIsSaving(false)
    }
  }

  async function onDelete() {
    if (!projectId) return
    if (!window.confirm("Delete this project? This cannot be undone.")) return
    setIsDeleting(true)
    setError(null)
    try {
      await deleteProject(projectId)
      router.push("/dashboard/projects")
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.message : err instanceof Error ? err.message : "Delete failed"
      setError(String(msg))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10 dark:bg-black">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <div className="space-y-1">
              <CardTitle>Project</CardTitle>
              {project ? (
                <div className="text-sm text-muted-foreground">
                  <span className="font-mono">{project.code}</span>{" "}
                  {project.kind ? <Badge variant="secondary">{project.kind}</Badge> : null}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => router.push("/dashboard/projects")}>
                Back
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {!projectId ? (
              <div className="text-sm text-muted-foreground">Invalid project id.</div>
            ) : isLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : !project ? (
              <div className="text-sm text-muted-foreground">Not found.</div>
            ) : !isAdmin ? (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                You can view this project, but only admin can edit/delete.
              </div>
            ) : (
              <form onSubmit={onSave} className="grid gap-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="code">Code</Label>
                    <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="kind">Kind</Label>
                    <Input id="kind" value={kind} onChange={(e) => setKind(e.target.value)} placeholder="optional" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="display_name">Display name</Label>
                  <Input
                    id="display_name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Button type="button" variant="destructive" onClick={onDelete} disabled={isDeleting || isSaving}>
                    {isDeleting ? "Deleting…" : "Delete"}
                  </Button>
                  <Button type="submit" disabled={isSaving || isDeleting}>
                    {isSaving ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

