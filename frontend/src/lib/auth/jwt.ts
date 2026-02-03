export type JwtPayload = Record<string, unknown>

function base64UrlDecode(input: string): string {
  // base64url → base64
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/")
  const pad = base64.length % 4
  const padded = pad ? base64 + "=".repeat(4 - pad) : base64

  // Browser-only. These pages/components are "use client".
  return decodeURIComponent(
    Array.prototype.map
      .call(atob(padded), (c: string) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join(""),
  )
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split(".")
  if (parts.length < 2) return null

  try {
    const json = base64UrlDecode(parts[1])
    const payload = JSON.parse(json) as JwtPayload
    return payload && typeof payload === "object" ? payload : null
  } catch {
    return null
  }
}

export function isSuperuserFromToken(token: string | null): boolean {
  if (!token) return false
  const payload = decodeJwtPayload(token)
  return Boolean(payload?.is_superuser)
}

