import axios, { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from "axios";

import { clearTokens, getAccessToken, getRefreshToken, setAccessToken } from "@/lib/api/tokenStorage";

// Prefer same-origin requests and let Next.js proxy `/api/*` to the backend.
// This avoids CORS issues and avoids hardcoding hostnames/IPs into the client bundle.
const baseURL = "";

type RefreshResponse = {
  access_token: string;
  token_type: "bearer" | string;
};

type FailedRequestQueueItem = {
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
};

let isRefreshing = false;
let failedQueue: FailedRequestQueueItem[] = [];

function processQueue(err: unknown, token: string | null) {
  failedQueue.forEach((p) => {
    if (err) p.reject(err);
    else if (token) p.resolve(token);
    else p.reject(new Error("No token"));
  });
  failedQueue = [];
}

const rawClient = axios.create({
  baseURL,
  maxRedirects: 0,
  validateStatus: (status) => status >= 200 && status < 400,
});

async function refreshAccessToken(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error("No refresh token");

  const res = await rawClient.post<RefreshResponse>("/api/v1/auth/token/refresh", {
    refresh_token: refreshToken,
  });

  const newAccessToken = res.data.access_token;
  if (!newAccessToken) throw new Error("No access token in refresh response");

  setAccessToken(newAccessToken);
  return newAccessToken;
}

export const apiClient: AxiosInstance = axios.create({
  baseURL,
  timeout: 30_000,
  // Disable redirect following to prevent axios from following Location headers
  // that might contain internal Docker hostnames (e.g., http://backend:8000).
  // Next.js rewrite proxy handles routing, so we should never see redirects.
  maxRedirects: 0,
  validateStatus: (status) => status >= 200 && status < 400, // Accept 2xx and 3xx without following
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

    if (!originalRequest) return Promise.reject(error);

    const status = error.response?.status;
    const isAuthEndpoint =
      typeof originalRequest.url === "string" &&
      (originalRequest.url.includes("/api/v1/auth/login") ||
        originalRequest.url.includes("/api/v1/auth/register") ||
        originalRequest.url.includes("/api/v1/auth/token/refresh"));

    if (status !== 401 || originalRequest._retry || isAuthEndpoint) {
      return Promise.reject(error);
    }

    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      clearTokens();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      try {
        const newToken = await new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        });
        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch (err) {
        return Promise.reject(err);
      }
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const newToken = await refreshAccessToken();
      processQueue(null, newToken);

      originalRequest.headers = originalRequest.headers ?? {};
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return apiClient(originalRequest);
    } catch (err) {
      processQueue(err, null);
      clearTokens();
      return Promise.reject(err);
    } finally {
      isRefreshing = false;
    }
  },
);

