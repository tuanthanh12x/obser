import { apiClient } from "@/lib/api/client";
import { AuthTokens, clearTokens, setTokens } from "@/lib/api/tokenStorage";

type LoginResponse = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer" | string;
};

export async function login(email: string, password: string): Promise<AuthTokens> {
  const body = new URLSearchParams();
  body.set("username", email);
  body.set("password", password);

  const res = await apiClient.post<LoginResponse>("/api/v1/auth/login", body, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  const tokens: AuthTokens = {
    accessToken: res.data.access_token,
    refreshToken: res.data.refresh_token,
  };

  setTokens(tokens);
  return tokens;
}

export async function register(email: string, password: string, fullName?: string | null): Promise<AuthTokens> {
  const res = await apiClient.post<LoginResponse>("/api/v1/auth/register", {
    email,
    password,
    full_name: fullName ?? null,
  });

  const tokens: AuthTokens = {
    accessToken: res.data.access_token,
    refreshToken: res.data.refresh_token,
  };

  setTokens(tokens);
  return tokens;
}

export function logout(): void {
  clearTokens();
}

