import { apiClient } from "@/lib/api/client"

export type Project = {
  id: number
  code: string
  display_name: string
  kind?: string | null
  created_at: string
  updated_at?: string | null
}

export async function listProjects(params?: { skip?: number; limit?: number }): Promise<Project[]> {
  // Build URL manually to ensure trailing slash is preserved even with query params.
  // Axios may strip trailing slashes when params are present, which triggers FastAPI redirects
  // that can leak internal Docker hostnames (e.g., http://backend:8000) via Location header.
  const skip = params?.skip ?? 0
  const limit = params?.limit ?? 25
  const url = `/api/v1/projects/?skip=${skip}&limit=${limit}`
  const res = await apiClient.get<Project[]>(url)
  return res.data
}

export async function getProject(projectId: number): Promise<Project> {
  const res = await apiClient.get<Project>(`/api/v1/projects/${projectId}`)
  return res.data
}

export type ProjectCreate = {
  code: string
  display_name: string
  kind?: string | null
}

export async function createProject(data: ProjectCreate): Promise<Project> {
  const res = await apiClient.post<Project>("/api/v1/projects/", data)
  return res.data
}

export type ProjectUpdate = {
  code?: string | null
  display_name?: string | null
  kind?: string | null
}

export async function updateProject(projectId: number, data: ProjectUpdate): Promise<Project> {
  const res = await apiClient.patch<Project>(`/api/v1/projects/${projectId}`, data)
  return res.data
}

export async function deleteProject(projectId: number): Promise<void> {
  await apiClient.delete(`/api/v1/projects/${projectId}`)
}

export type ProjectMember = {
  id: number
  project_id: number
  user_id: number
  role: string
  created_at: string
  updated_at?: string | null
  user_email?: string | null
}

export type ProjectMemberCreate = {
  user_id: number
  role?: string
}

export type User = {
  id: number
  email: string
}

export async function listProjectMembers(projectId: number): Promise<ProjectMember[]> {
  const res = await apiClient.get<ProjectMember[]>(`/api/v1/projects/${projectId}/members`)
  return res.data
}

export async function addProjectMember(projectId: number, data: ProjectMemberCreate): Promise<ProjectMember> {
  const res = await apiClient.post<ProjectMember>(`/api/v1/projects/${projectId}/members`, data)
  return res.data
}

export async function removeProjectMember(projectId: number, userId: number): Promise<void> {
  await apiClient.delete(`/api/v1/projects/${projectId}/members/${userId}`)
}

export async function listUsers(): Promise<User[]> {
  const res = await apiClient.get<User[]>("/api/v1/projects/users")
  return res.data
}

export type Credential = {
  id: number
  project_id: number
  kind: string
  secret_ref: string
  expires_at?: string | null
  metadata?: Record<string, any> | null
  created_at: string
  updated_at?: string | null
}

export type CredentialCreate = {
  kind: string
  secret_ref: string
  expires_at?: string | null
  metadata?: Record<string, any> | null
}

export type CredentialUpdate = {
  kind?: string | null
  secret_ref?: string | null
  expires_at?: string | null
  metadata?: Record<string, any> | null
}

export async function listProjectCredentials(projectId: number): Promise<Credential[]> {
  const res = await apiClient.get<Credential[]>(`/api/v1/projects/${projectId}/credentials`)
  return res.data
}

export async function createProjectCredential(projectId: number, data: CredentialCreate): Promise<Credential> {
  const res = await apiClient.post<Credential>(`/api/v1/projects/${projectId}/credentials`, data)
  return res.data
}

export async function getProjectCredential(projectId: number, credentialId: number): Promise<Credential> {
  const res = await apiClient.get<Credential>(`/api/v1/projects/${projectId}/credentials/${credentialId}`)
  return res.data
}

export async function updateProjectCredential(
  projectId: number,
  credentialId: number,
  data: CredentialUpdate
): Promise<Credential> {
  const res = await apiClient.patch<Credential>(`/api/v1/projects/${projectId}/credentials/${credentialId}`, data)
  return res.data
}

export async function deleteProjectCredential(projectId: number, credentialId: number): Promise<void> {
  await apiClient.delete(`/api/v1/projects/${projectId}/credentials/${credentialId}`)
}

export type ServiceInstance = {
  id: number
  project_id: number
  service_type_id: number
  environment_id?: number | null
  name: string
  endpoint: string
  port?: number | null
  status: string
  metadata?: Record<string, any> | null
  created_at: string
  updated_at?: string | null
}

export type ServiceInstanceCreate = {
  service_type_id: number
  environment_id?: number | null
  name: string
  endpoint: string
  port?: number | null
  status?: string
  metadata?: Record<string, any> | null
}

export type ServiceInstanceUpdate = {
  service_type_id?: number | null
  environment_id?: number | null
  name?: string | null
  endpoint?: string | null
  port?: number | null
  status?: string | null
  metadata?: Record<string, any> | null
}

export async function listProjectServices(projectId: number): Promise<ServiceInstance[]> {
  const res = await apiClient.get<ServiceInstance[]>(`/api/v1/projects/${projectId}/services`)
  return res.data
}

export async function createProjectService(projectId: number, data: ServiceInstanceCreate): Promise<ServiceInstance> {
  const res = await apiClient.post<ServiceInstance>(`/api/v1/projects/${projectId}/services`, data)
  return res.data
}

export async function getProjectService(projectId: number, serviceId: number): Promise<ServiceInstance> {
  const res = await apiClient.get<ServiceInstance>(`/api/v1/projects/${projectId}/services/${serviceId}`)
  return res.data
}

export async function updateProjectService(
  projectId: number,
  serviceId: number,
  data: ServiceInstanceUpdate
): Promise<ServiceInstance> {
  const res = await apiClient.patch<ServiceInstance>(`/api/v1/projects/${projectId}/services/${serviceId}`, data)
  return res.data
}

export async function deleteProjectService(projectId: number, serviceId: number): Promise<void> {
  await apiClient.delete(`/api/v1/projects/${projectId}/services/${serviceId}`)
}

