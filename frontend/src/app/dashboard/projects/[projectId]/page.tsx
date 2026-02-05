"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import axios from "axios"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getAccessToken } from "@/lib/api/tokenStorage"
import {
  deleteProject,
  getProject,
  updateProject,
  type Project,
  listProjectMembers,
  addProjectMember,
  removeProjectMember,
  listUsers,
  type ProjectMember,
  type User,
  listProjectCredentials,
  createProjectCredential,
  updateProjectCredential,
  deleteProjectCredential,
  type Credential,
  type CredentialCreate,
  listProjectServices,
  createProjectService,
  updateProjectService,
  deleteProjectService,
  type ServiceInstance,
  type ServiceInstanceCreate,
} from "@/lib/api/projects"
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

  const [members, setMembers] = useState<ProjectMember[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [isLoadingMembers, setIsLoadingMembers] = useState(false)
  const [isAddingMember, setIsAddingMember] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState("")
  const [selectedRole, setSelectedRole] = useState("member")

  const [credentials, setCredentials] = useState<Credential[]>([])
  const [isLoadingCredentials, setIsLoadingCredentials] = useState(false)
  const [isAddingCredential, setIsAddingCredential] = useState(false)
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null)
  const [credentialForm, setCredentialForm] = useState<CredentialCreate>({
    kind: "token",
    secret_ref: "",
    expires_at: null,
    metadata: null,
  })

  const [services, setServices] = useState<ServiceInstance[]>([])
  const [isLoadingServices, setIsLoadingServices] = useState(false)
  const [isAddingService, setIsAddingService] = useState(false)
  const [editingService, setEditingService] = useState<ServiceInstance | null>(null)
  const [serviceForm, setServiceForm] = useState<ServiceInstanceCreate>({
    service_type_id: 1,
    environment_id: null,
    name: "",
    endpoint: "",
    port: null,
    status: "unknown",
    metadata: null,
  })

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

  useEffect(() => {
    if (!projectId) return
    loadMembers()
    loadCredentials()
    loadServices()
    if (isAdmin) {
      loadUsers()
    }
  }, [projectId, isAdmin])

  async function loadMembers() {
    if (!projectId) return
    setIsLoadingMembers(true)
    try {
      const m = await listProjectMembers(projectId)
      setMembers(m)
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.message : err instanceof Error ? err.message : "Failed to load members"
      setError(String(msg))
    } finally {
      setIsLoadingMembers(false)
    }
  }

  async function loadUsers() {
    try {
      const u = await listUsers()
      setUsers(u)
    } catch (err: unknown) {
      // Silently fail - users list is optional
    }
  }

  async function onAddMember(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!projectId || !selectedUserId) return
    setIsAddingMember(true)
    setError(null)
    try {
      await addProjectMember(projectId, {
        user_id: Number(selectedUserId),
        role: selectedRole,
      })
      setSelectedUserId("")
      setSelectedRole("member")
      await loadMembers()
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.message : err instanceof Error ? err.message : "Failed to add member"
      setError(String(msg))
    } finally {
      setIsAddingMember(false)
    }
  }

  async function onRemoveMember(userId: number) {
    if (!projectId) return
    if (!window.confirm("Remove this member from the project?")) return
    setError(null)
    try {
      await removeProjectMember(projectId, userId)
      await loadMembers()
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.message : err instanceof Error ? err.message : "Failed to remove member"
      setError(String(msg))
    }
  }

  async function loadCredentials() {
    if (!projectId) return
    setIsLoadingCredentials(true)
    try {
      const c = await listProjectCredentials(projectId)
      setCredentials(c)
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.message : err instanceof Error ? err.message : "Failed to load credentials"
      setError(String(msg))
    } finally {
      setIsLoadingCredentials(false)
    }
  }

  async function onAddCredential(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!projectId) return
    setIsAddingCredential(true)
    setError(null)
    try {
      if (editingCredential) {
        await updateProjectCredential(projectId, editingCredential.id, credentialForm)
        setEditingCredential(null)
      } else {
        await createProjectCredential(projectId, credentialForm)
      }
      setCredentialForm({ kind: "token", secret_ref: "", expires_at: null, metadata: null })
      await loadCredentials()
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.message : err instanceof Error ? err.message : "Failed to save credential"
      setError(String(msg))
    } finally {
      setIsAddingCredential(false)
    }
  }

  async function onDeleteCredential(credentialId: number) {
    if (!projectId) return
    if (!window.confirm("Delete this credential?")) return
    setError(null)
    try {
      await deleteProjectCredential(projectId, credentialId)
      await loadCredentials()
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.message : err instanceof Error ? err.message : "Failed to delete credential"
      setError(String(msg))
    }
  }

  function onEditCredential(credential: Credential) {
    setEditingCredential(credential)
    setCredentialForm({
      kind: credential.kind,
      secret_ref: credential.secret_ref,
      expires_at: credential.expires_at ?? null,
      metadata: credential.metadata ?? null,
    })
  }

  async function loadServices() {
    if (!projectId) return
    setIsLoadingServices(true)
    try {
      const s = await listProjectServices(projectId)
      setServices(s)
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.message : err instanceof Error ? err.message : "Failed to load services"
      setError(String(msg))
    } finally {
      setIsLoadingServices(false)
    }
  }

  async function onAddService(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!projectId) return
    setIsAddingService(true)
    setError(null)
    try {
      if (editingService) {
        await updateProjectService(projectId, editingService.id, serviceForm)
        setEditingService(null)
      } else {
        await createProjectService(projectId, serviceForm)
      }
      setServiceForm({
        service_type_id: 1,
        environment_id: null,
        name: "",
        endpoint: "",
        port: null,
        status: "unknown",
        metadata: null,
      })
      await loadServices()
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.message : err instanceof Error ? err.message : "Failed to save service"
      setError(String(msg))
    } finally {
      setIsAddingService(false)
    }
  }

  async function onDeleteService(serviceId: number) {
    if (!projectId) return
    if (!window.confirm("Delete this service?")) return
    setError(null)
    try {
      await deleteProjectService(projectId, serviceId)
      await loadServices()
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.message : err instanceof Error ? err.message : "Failed to delete service"
      setError(String(msg))
    }
  }

  function onEditService(service: ServiceInstance) {
    setEditingService(service)
    setServiceForm({
      service_type_id: service.service_type_id,
      environment_id: service.environment_id ?? null,
      name: service.name,
      endpoint: service.endpoint,
      port: service.port ?? null,
      status: service.status,
      metadata: service.metadata ?? null,
    })
  }

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
      <div className="mx-auto w-full max-w-5xl space-y-6">
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
          <CardContent>
            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive mb-4">
                {error}
              </div>
            ) : null}

            {!projectId ? (
              <div className="text-sm text-muted-foreground">Invalid project id.</div>
            ) : isLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : !project ? (
              <div className="text-sm text-muted-foreground">Not found.</div>
            ) : (
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="members">Members</TabsTrigger>
                  <TabsTrigger value="credentials">Credentials</TabsTrigger>
                  <TabsTrigger value="services">Services</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4 mt-4">
                  {!isAdmin ? (
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
                </TabsContent>

                <TabsContent value="members" className="space-y-4 mt-4">
                  {isLoadingMembers ? (
                    <div className="text-sm text-muted-foreground">Loading members…</div>
                  ) : (
                    <>
                      {members.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No members yet.</div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Email</TableHead>
                              <TableHead>Role</TableHead>
                              {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {members.map((member) => (
                              <TableRow key={member.id}>
                                <TableCell>{member.user_email || `User ${member.user_id}`}</TableCell>
                                <TableCell>
                                  <Badge variant="secondary">{member.role}</Badge>
                                </TableCell>
                                {isAdmin && (
                                  <TableCell className="text-right">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => onRemoveMember(member.user_id)}
                                    >
                                      Remove
                                    </Button>
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}

                      {isAdmin && (
                        <form onSubmit={onAddMember} className="grid gap-4 border-t pt-4">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="user_id">User</Label>
                              <select
                                id="user_id"
                                value={selectedUserId}
                                onChange={(e) => setSelectedUserId(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                required
                              >
                                <option value="">Select a user</option>
                                {users
                                  .filter((u) => !members.some((m) => m.user_id === u.id))
                                  .map((user) => (
                                    <option key={user.id} value={user.id}>
                                      {user.email}
                                    </option>
                                  ))}
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="role">Role</Label>
                              <select
                                id="role"
                                value={selectedRole}
                                onChange={(e) => setSelectedRole(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                required
                              >
                                <option value="member">Member</option>
                                <option value="admin">Admin</option>
                                <option value="owner">Owner</option>
                                <option value="viewer">Viewer</option>
                              </select>
                            </div>
                          </div>
                          <Button type="submit" disabled={isAddingMember || !selectedUserId}>
                            {isAddingMember ? "Adding…" : "Add Member"}
                          </Button>
                        </form>
                      )}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="credentials" className="space-y-4 mt-4">
                  {isLoadingCredentials ? (
                    <div className="text-sm text-muted-foreground">Loading credentials…</div>
                  ) : (
                    <>
                      {credentials.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No credentials yet.</div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Kind</TableHead>
                              <TableHead>Secret Ref</TableHead>
                              <TableHead>Expires At</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {credentials.map((credential) => (
                              <TableRow key={credential.id}>
                                <TableCell>
                                  <Badge variant="secondary">{credential.kind}</Badge>
                                </TableCell>
                                <TableCell className="font-mono text-xs">{credential.secret_ref}</TableCell>
                                <TableCell>
                                  {credential.expires_at ? new Date(credential.expires_at).toLocaleDateString() : "Never"}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button variant="outline" size="sm" onClick={() => onEditCredential(credential)}>
                                      Edit
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => onDeleteCredential(credential.id)}
                                    >
                                      Delete
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}

                      <form onSubmit={onAddCredential} className="grid gap-4 border-t pt-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="cred_kind">Kind</Label>
                            <select
                              id="cred_kind"
                              value={credentialForm.kind}
                              onChange={(e) => setCredentialForm({ ...credentialForm, kind: e.target.value })}
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              required
                            >
                              <option value="token">Token</option>
                              <option value="api_key">API Key</option>
                              <option value="userpass">Username/Password</option>
                              <option value="oauth2">OAuth2</option>
                              <option value="tls_cert">TLS Certificate</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="cred_expires_at">Expires At (optional)</Label>
                            <Input
                              id="cred_expires_at"
                              type="datetime-local"
                              value={
                                credentialForm.expires_at
                                  ? new Date(credentialForm.expires_at).toISOString().slice(0, 16)
                                  : ""
                              }
                              onChange={(e) =>
                                setCredentialForm({
                                  ...credentialForm,
                                  expires_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                                })
                              }
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="cred_secret_ref">Secret Reference</Label>
                          <Input
                            id="cred_secret_ref"
                            value={credentialForm.secret_ref}
                            onChange={(e) => setCredentialForm({ ...credentialForm, secret_ref: e.target.value })}
                            required
                            placeholder="Reference to secret storage"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          {editingCredential && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setEditingCredential(null)
                                setCredentialForm({ kind: "token", secret_ref: "", expires_at: null, metadata: null })
                              }}
                            >
                              Cancel
                            </Button>
                          )}
                          <Button type="submit" disabled={isAddingCredential}>
                            {isAddingCredential ? "Saving…" : editingCredential ? "Update Credential" : "Add Credential"}
                          </Button>
                        </div>
                      </form>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="services" className="space-y-4 mt-4">
                  {isLoadingServices ? (
                    <div className="text-sm text-muted-foreground">Loading services…</div>
                  ) : (
                    <>
                      {services.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No services yet.</div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>Endpoint</TableHead>
                              <TableHead>Port</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {services.map((service) => (
                              <TableRow key={service.id}>
                                <TableCell className="font-medium">{service.name}</TableCell>
                                <TableCell className="font-mono text-xs">{service.endpoint}</TableCell>
                                <TableCell>{service.port ?? "-"}</TableCell>
                                <TableCell>
                                  <Badge variant="secondary">{service.status}</Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button variant="outline" size="sm" onClick={() => onEditService(service)}>
                                      Edit
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => onDeleteService(service.id)}>
                                      Delete
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}

                      <form onSubmit={onAddService} className="grid gap-4 border-t pt-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="svc_name">Name</Label>
                            <Input
                              id="svc_name"
                              value={serviceForm.name}
                              onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="svc_status">Status</Label>
                            <select
                              id="svc_status"
                              value={serviceForm.status}
                              onChange={(e) => setServiceForm({ ...serviceForm, status: e.target.value })}
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              required
                            >
                              <option value="unknown">Unknown</option>
                              <option value="active">Active</option>
                              <option value="inactive">Inactive</option>
                              <option value="error">Error</option>
                            </select>
                          </div>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="svc_endpoint">Endpoint</Label>
                            <Input
                              id="svc_endpoint"
                              value={serviceForm.endpoint}
                              onChange={(e) => setServiceForm({ ...serviceForm, endpoint: e.target.value })}
                              required
                              placeholder="http://example.com"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="svc_port">Port (optional)</Label>
                            <Input
                              id="svc_port"
                              type="number"
                              min="1"
                              max="65535"
                              value={serviceForm.port ?? ""}
                              onChange={(e) =>
                                setServiceForm({
                                  ...serviceForm,
                                  port: e.target.value ? Number(e.target.value) : null,
                                })
                              }
                            />
                          </div>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="svc_service_type_id">Service Type ID</Label>
                            <Input
                              id="svc_service_type_id"
                              type="number"
                              min="1"
                              value={serviceForm.service_type_id}
                              onChange={(e) =>
                                setServiceForm({ ...serviceForm, service_type_id: Number(e.target.value) })
                              }
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="svc_environment_id">Environment ID (optional)</Label>
                            <Input
                              id="svc_environment_id"
                              type="number"
                              min="1"
                              value={serviceForm.environment_id ?? ""}
                              onChange={(e) =>
                                setServiceForm({
                                  ...serviceForm,
                                  environment_id: e.target.value ? Number(e.target.value) : null,
                                })
                              }
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          {editingService && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setEditingService(null)
                                setServiceForm({
                                  service_type_id: 1,
                                  environment_id: null,
                                  name: "",
                                  endpoint: "",
                                  port: null,
                                  status: "unknown",
                                  metadata: null,
                                })
                              }}
                            >
                              Cancel
                            </Button>
                          )}
                          <Button type="submit" disabled={isAddingService}>
                            {isAddingService ? "Saving…" : editingService ? "Update Service" : "Add Service"}
                          </Button>
                        </div>
                      </form>
                    </>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

