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
  const res = await apiClient.get<Project[]>("/api/v1/projects", {
    params: {
      skip: params?.skip ?? 0,
      limit: params?.limit ?? 25,
    },
  })
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
  const res = await apiClient.post<Project>("/api/v1/projects", data)
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

