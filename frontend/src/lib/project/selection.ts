const KEY = "obser_selected_project_id"

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

export function getStoredProjectId(): number | null {
  if (!isBrowser()) return null
  const raw = window.localStorage.getItem(KEY)
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export function setStoredProjectId(projectId: number | null): void {
  if (!isBrowser()) return
  if (projectId === null) window.localStorage.removeItem(KEY)
  else window.localStorage.setItem(KEY, String(projectId))
}

