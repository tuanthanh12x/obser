"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { login } from "@/lib/api/auth";
import { getAccessToken } from "@/lib/api/tokenStorage";
import axios from "axios";

function extractApiErrorDetail(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const detail = (data as Record<string, unknown>).detail;
  return typeof detail === "string" ? detail : undefined;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If already logged in, go to dashboard
    if (getAccessToken()) router.replace("/dashboard");
  }, [router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await login(email.trim(), password);
      router.replace("/dashboard");
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? extractApiErrorDetail(err.response?.data) ?? err.message
        : err instanceof Error
          ? err.message
          : "Login failed. Please check your credentials and try again.";
      setError(String(msg));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-white focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:ring-offset-black dark:focus-visible:ring-zinc-50"
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-offset-white focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:ring-offset-black dark:focus-visible:ring-zinc-50"
                placeholder="••••••••"
              />
            </div>

            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                {error}
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign in"}
            </Button>

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              API base URL: <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-900">{process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}</code>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

