"use client"

import { Suspense, useEffect, useState, useRef, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  Bell,
  CircleOff,
  Cloud,
  Command,
  Cpu,
  Database,
  Download,
  Globe,
  HardDrive,
  Hexagon,
  LineChart,
  Lock,
  type LucideIcon,
  MessageSquare,
  Mic,
  Moon,
  Radio,
  RefreshCw,
  Search,
  Server,
  Settings,
  Shield,
  Sun,
  Terminal,
  Wifi,
  Zap,
  Layers,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { getAccessToken } from "@/lib/api/tokenStorage"
import { listProjects, type Project as ApiProject } from "@/lib/api/projects"
import { getStoredProjectId, setStoredProjectId } from "@/lib/project/selection"
import { ProjectSwitcher } from "@/components/project/project-switcher"

// System component types
type ComponentType = "cloudflare" | "frontend" | "backend" | "cache" | "openstack" | "database"

type Health = "healthy" | "warning" | "error"

type BackupStatus = "ok" | "running" | "failed" | "unknown"

type PerfBar = {
  cpuHeight: number
  memHeight: number
  netHeight: number
}

// Use a deterministic "now" for mock/demo data to keep rendering pure (lint rule `react-hooks/purity`).
const MOCK_NOW_MS = Date.parse("2026-02-03T00:00:00Z")

const DEFAULT_PERF_BARS: PerfBar[] = Array.from({ length: 24 }).map((_, i) => ({
  cpuHeight: 25 + ((i * 7) % 55),
  memHeight: 40 + ((i * 5) % 45),
  netHeight: 30 + ((i * 3) % 40),
}))

function formatTime(date: Date | null | undefined) {
  if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) return "—"
  // Deterministic time string (UTC) to avoid SSR hydration mismatches.
  return date.toISOString().slice(11, 19) // HH:MM:SS
}

function formatDate(date: Date | null | undefined) {
  if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) return "—"
  // Deterministic date string (UTC) to avoid SSR hydration mismatches.
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date)
}

interface DatabaseDetails {
  engine: "postgres" | "mysql" | "mongodb" | "redis" | "other"
  version?: string

  // backups
  lastBackupAt: Date | null
  lastBackupStatus: BackupStatus
  backupRpoMinutes?: number // how stale is acceptable (SLO)
  nextBackupAt?: Date | null

  // replication
  replicaCount: number
  replicaReady: number
  replicationLagSeconds?: number | null // max/avg tùy bạn
  primary?: boolean

  // connections & performance
  connectionsUsed?: number
  connectionsMax?: number
  p95QueryMs?: number
  slowQueries?: number

  // storage
  diskUsedGb?: number
  diskTotalGb?: number
}

interface BackendDetails {
  // Overview / Health
  availability24h: number // percentage
  downtimeEvents24h: number

  // Traffic / Load
  requestsPerSecond: number
  rpsByRoute: { route: string; rps: number }[]
  rpsByMethod: { method: string; rps: number }[]

  // Errors / Reliability
  errorRate5xx: number // percentage
  errors5xxPerSecond: number
  errorRate4xx: number // percentage
  successRate: number // percentage (2xx + 3xx)
  topRoutesBy5xxErrors: { route: string; errors: number }[]

  // User Latency / Experience
  latencyP50: number // ms
  latencyP95: number // ms
  latencyP99: number // ms
  averageResponseTime: number // ms
  topRoutesByP95Latency: { route: string; latency: number }[]

  // SLO / User Stability
  requestsUnder300ms: number // percentage
  requestsUnder1s: number // percentage

  // Stability / Anomaly Detection
  trafficSpikeRatio: number // 5m vs 1h
  errorRateSpikeRatio: number
  latencySpikeRatio: number // p95

  // Top Offenders
  topRoutesByTraffic: { route: string; requests: number }[]
  topRoutesByErrors: { route: string; errors: number }[]
  topRoutesByLatency: { route: string; latency: number }[]

  // Status Page (Exec Summary)
  availability24hStatus: number // percentage
  errorRate5xxStatus: number // percentage
}

interface SystemComponent {
  id: ComponentType
  name: string
  status: Health
  uptime: number
  responseTime: number
  requests: number
  errors: number
  cpu: number
  memory: number

  details?: DatabaseDetails | BackendDetails // chỉ dùng cho database hoặc backend
}

interface ExternalAPI {
  name: string
  url: string
  status: "online" | "offline" | "slow"
  responseTime: number
  lastCheck: Date
}

interface ServiceLog {
  id: string
  timestamp: Date
  level: "info" | "warning" | "error" | "success" | "debug"
  service: string
  message: string
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  )
}

function Dashboard() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!getAccessToken()) router.replace("/login")
  }, [router])

  // Projects context (selected project drives the dashboard view)
  const [projects, setProjects] = useState<ApiProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [projectLoadError, setProjectLoadError] = useState<string | null>(null)

  const selectedProject = useMemo(() => {
    if (selectedProjectId == null) return null
    return projects.find((p) => p.id === selectedProjectId) ?? null
  }, [projects, selectedProjectId])

  useEffect(() => {
    const token = getAccessToken()
    if (!token) return

    let cancelled = false
    ;(async () => {
      try {
        setProjectLoadError(null)
        const data = await listProjects({ skip: 0, limit: 1000 })
        if (cancelled) return
        setProjects(data)

        const qp = searchParams.get("projectId")
        const qpId = qp ? Number(qp) : null
        const storedId = getStoredProjectId()

        const candidateIds = [qpId, storedId, data[0]?.id ?? null].filter(
          (x): x is number => typeof x === "number" && Number.isFinite(x),
        )
        const nextId = candidateIds.find((id) => data.some((p) => p.id === id)) ?? null

        setSelectedProjectId(nextId)
        setStoredProjectId(nextId)
      } catch (err: unknown) {
        if (cancelled) return
        setProjectLoadError(err instanceof Error ? err.message : "Failed to load projects")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [searchParams])

  const [theme, setTheme] = useState<"dark" | "light">("dark")
  const [selectedChat, setSelectedChat] = useState<number | null>(null)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [systemStatus, setSystemStatus] = useState(85)
  const [cpuUsage, setCpuUsage] = useState(42)
  const [memoryUsage, setMemoryUsage] = useState(68)
  const [networkStatus, setNetworkStatus] = useState(92)
  const [securityLevel, setSecurityLevel] = useState(75)
  const [currentTime, setCurrentTime] = useState(() => new Date(MOCK_NOW_MS))
  const [isLoading, setIsLoading] = useState(true)
  const [viewMode, setViewMode] = useState<"full" | "component">("full")
  const [selectedComponent, setSelectedComponent] = useState<ComponentType | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)

  // System components state
  const [components, setComponents] = useState<SystemComponent[]>([
    {
      id: "cloudflare",
      name: "Cloudflare CDN",
      status: "healthy",
      uptime: 99.9,
      responseTime: 45,
      requests: 125000,
      errors: 12,
      cpu: 25,
      memory: 30,
    },
    {
      id: "frontend",
      name: "Frontend",
      status: "healthy",
      uptime: 99.8,
      responseTime: 120,
      requests: 98000,
      errors: 8,
      cpu: 45,
      memory: 55,
    },
    {
      id: "backend",
      name: "Backend API",
      status: "healthy",
      uptime: 99.7,
      responseTime: 180,
      requests: 75000,
      errors: 15,
      cpu: 60,
      memory: 70,
      details: {
        // Overview / Health
        availability24h: 99.7,
        downtimeEvents24h: 2,

        // Traffic / Load
        requestsPerSecond: 125.5,
        rpsByRoute: [
          { route: "/api/users", rps: 45.2 },
          { route: "/api/orders", rps: 32.8 },
          { route: "/api/products", rps: 28.5 },
          { route: "/api/auth", rps: 19.0 },
        ],
        rpsByMethod: [
          { method: "GET", rps: 85.3 },
          { method: "POST", rps: 28.7 },
          { method: "PUT", rps: 8.2 },
          { method: "DELETE", rps: 3.3 },
        ],

        // Errors / Reliability
        errorRate5xx: 0.02,
        errors5xxPerSecond: 0.025,
        errorRate4xx: 0.15,
        successRate: 99.83,
        topRoutesBy5xxErrors: [
          { route: "/api/orders", errors: 8 },
          { route: "/api/payments", errors: 5 },
          { route: "/api/users", errors: 2 },
        ],

        // User Latency / Experience
        latencyP50: 120,
        latencyP95: 280,
        latencyP99: 450,
        averageResponseTime: 180,
        topRoutesByP95Latency: [
          { route: "/api/reports", latency: 850 },
          { route: "/api/analytics", latency: 620 },
          { route: "/api/export", latency: 480 },
        ],

        // SLO / User Stability
        requestsUnder300ms: 94.5,
        requestsUnder1s: 98.2,

        // Stability / Anomaly Detection
        trafficSpikeRatio: 1.15,
        errorRateSpikeRatio: 0.95,
        latencySpikeRatio: 1.08,

        // Top Offenders
        topRoutesByTraffic: [
          { route: "/api/users", requests: 125000 },
          { route: "/api/orders", requests: 98000 },
          { route: "/api/products", requests: 85000 },
        ],
        topRoutesByErrors: [
          { route: "/api/orders", errors: 8 },
          { route: "/api/payments", errors: 5 },
          { route: "/api/users", errors: 2 },
        ],
        topRoutesByLatency: [
          { route: "/api/reports", latency: 850 },
          { route: "/api/analytics", latency: 620 },
          { route: "/api/export", latency: 480 },
        ],

        // Status Page (Exec Summary)
        availability24hStatus: 99.7,
        errorRate5xxStatus: 0.02,
      },
    },
    {
      id: "cache",
      name: "Cache Layer",
      status: "healthy",
      uptime: 99.9,
      responseTime: 15,
      requests: 200000,
      errors: 5,
      cpu: 35,
      memory: 40,
    },
    {
      id: "openstack",
      name: "OpenStack",
      status: "healthy",
      uptime: 99.5,
      responseTime: 220,
      requests: 45000,
      errors: 8,
      cpu: 55,
      memory: 72,
    },
    {
      id: "database",
      name: "Database",
      status: "healthy",
      uptime: 99.6,
      responseTime: 25,
      requests: 50000,
      errors: 3,
      cpu: 50,
      memory: 65,
      details: {
        engine: "postgres",
        version: "16.1",
        lastBackupAt: new Date(MOCK_NOW_MS - 35 * 60 * 1000), // 35m ago
        lastBackupStatus: "ok",
        backupRpoMinutes: 60,
        nextBackupAt: new Date(MOCK_NOW_MS + 25 * 60 * 1000),

        replicaCount: 2,
        replicaReady: 2,
        replicationLagSeconds: 1.2,
        primary: true,

        connectionsUsed: 143,
        connectionsMax: 300,
        p95QueryMs: 18,
        slowQueries: 2,

        diskUsedGb: 820,
        diskTotalGb: 1200,
      },
    },
  ])

  // External APIs state
  const [externalAPIs, setExternalAPIs] = useState<ExternalAPI[]>([
    {
      name: "Payment Gateway",
      url: "https://api.payment.com",
      status: "online",
      responseTime: 150,
      lastCheck: new Date(MOCK_NOW_MS - 60_000),
    },
    {
      name: "Email Service",
      url: "https://api.email.com",
      status: "online",
      responseTime: 200,
      lastCheck: new Date(MOCK_NOW_MS - 2 * 60_000),
    },
    {
      name: "SMS Service",
      url: "https://api.sms.com",
      status: "slow",
      responseTime: 850,
      lastCheck: new Date(MOCK_NOW_MS - 3 * 60_000),
    },
    {
      name: "Analytics API",
      url: "https://api.analytics.com",
      status: "online",
      responseTime: 120,
      lastCheck: new Date(MOCK_NOW_MS - 45_000),
    },
    {
      name: "OpenStack API - Production",
      url: "https://openstack-prod.example.com:5000/v3",
      status: "online",
      responseTime: 180,
      lastCheck: new Date(MOCK_NOW_MS - 90_000),
    },
    {
      name: "OpenStack API - Staging",
      url: "https://openstack-staging.example.com:5000/v3",
      status: "online",
      responseTime: 220,
      lastCheck: new Date(MOCK_NOW_MS - 2 * 60_000),
    },
    {
      name: "OpenStack API - Development",
      url: "https://openstack-dev.example.com:5000/v3",
      status: "slow",
      responseTime: 450,
      lastCheck: new Date(MOCK_NOW_MS - 4 * 60_000),
    },
    {
      name: "OpenStack API - Testing",
      url: "https://openstack-test.example.com:5000/v3",
      status: "online",
      responseTime: 195,
      lastCheck: new Date(MOCK_NOW_MS - 75_000),
    },
  ])

  // Service Logs state
  const [serviceLogs, setServiceLogs] = useState<ServiceLog[]>([
    {
      id: "1",
      timestamp: new Date(MOCK_NOW_MS - 5000),
      level: "info",
      service: "Frontend",
      message: "User session established successfully",
    },
    {
      id: "2",
      timestamp: new Date(MOCK_NOW_MS - 8000),
      level: "success",
      service: "Backend API",
      message: "API request processed successfully - 200 OK",
    },
    {
      id: "3",
      timestamp: new Date(MOCK_NOW_MS - 12000),
      level: "warning",
      service: "Database",
      message: "Connection pool usage at 85% - consider scaling",
    },
    {
      id: "4",
      timestamp: new Date(MOCK_NOW_MS - 15000),
      level: "info",
      service: "OpenStack",
      message: "Instance created: vm-12345",
    },
    {
      id: "5",
      timestamp: new Date(MOCK_NOW_MS - 18000),
      level: "error",
      service: "Cache Layer",
      message: "Redis connection timeout - retrying...",
    },
    {
      id: "6",
      timestamp: new Date(MOCK_NOW_MS - 22000),
      level: "debug",
      service: "Frontend",
      message: "Component render completed in 12ms",
    },
    {
      id: "7",
      timestamp: new Date(MOCK_NOW_MS - 25000),
      level: "info",
      service: "Backend API",
      message: "Health check passed - all services operational",
    },
    {
      id: "8",
      timestamp: new Date(MOCK_NOW_MS - 28000),
      level: "warning",
      service: "OpenStack",
      message: "High CPU usage detected on compute node 3",
    },
    {
      id: "9",
      timestamp: new Date(MOCK_NOW_MS - 32000),
      level: "success",
      service: "Database",
      message: "Backup completed successfully - 2.3GB",
    },
    {
      id: "10",
      timestamp: new Date(MOCK_NOW_MS - 35000),
      level: "info",
      service: "Cloudflare CDN",
      message: "Cache hit rate: 94.2%",
    },
  ])

  const [selectedLogService, setSelectedLogService] = useState<string>("all")
  const [logSearchQuery, setLogSearchQuery] = useState<string>("")

  const effectiveSelectedLogService = useMemo(() => {
    if (viewMode === "component" && selectedComponent) {
      const component = components.find((c) => c.id === selectedComponent)
      return component?.name ?? "all"
    }
    return selectedLogService
  }, [components, selectedComponent, selectedLogService, viewMode])

  // Simulate data loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 2000)

    return () => clearTimeout(timer)
  }, [])

  // Update time
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  // Simulate changing data
  useEffect(() => {
    const interval = setInterval(() => {
      setCpuUsage(Math.floor(Math.random() * 30) + 30)
      setMemoryUsage(Math.floor(Math.random() * 20) + 60)
      setNetworkStatus(Math.floor(Math.random() * 15) + 80)
      setSystemStatus(Math.floor(Math.random() * 10) + 80)

      // Update components data
      setComponents((prev) =>
        prev.map((comp) => {
          const base = {
            ...comp,
            responseTime: Math.max(1, Math.floor(Math.random() * 100) + comp.responseTime - 50),
            requests: comp.requests + Math.floor(Math.random() * 1000),
            errors: comp.errors + (Math.random() > 0.93 ? 1 : 0),
            cpu: Math.max(20, Math.min(90, comp.cpu + (Math.random() - 0.5) * 5)),
            memory: Math.max(20, Math.min(90, comp.memory + (Math.random() - 0.5) * 5)),
          }

          // enrich database signals
          if (comp.id === "database" && comp.details && "engine" in comp.details) {
            const dbDetails = comp.details as DatabaseDetails
            const lag = Math.max(0, (dbDetails.replicationLagSeconds ?? 0) + (Math.random() - 0.5) * 2)
            const replicaReady = Math.max(
              0,
              Math.min(dbDetails.replicaCount, dbDetails.replicaReady + (Math.random() > 0.98 ? -1 : 0))
            )
            const backupAgeMin = dbDetails.lastBackupAt
              ? (Date.now() - dbDetails.lastBackupAt.getTime()) / 60000
              : 9999

            // derive health from DB-specific signals
            const backupBad =
              backupAgeMin > (dbDetails.backupRpoMinutes ?? 60) || dbDetails.lastBackupStatus === "failed"
            const replBad = replicaReady < dbDetails.replicaCount || lag > 30

            const status: Health =
              backupBad || replBad || base.errors > 50 || base.responseTime > 500
                ? "error"
                : lag > 10 || base.errors > 20 || base.responseTime > 300
                  ? "warning"
                  : "healthy"

            return {
              ...base,
              status,
              details: {
                ...dbDetails,
                replicationLagSeconds: Number(lag.toFixed(1)),
                replicaReady,
                connectionsUsed: Math.max(
                  0,
                  Math.min(
                    dbDetails.connectionsMax ?? 300,
                    (dbDetails.connectionsUsed ?? 0) + Math.floor((Math.random() - 0.5) * 10)
                  )
                ),
                p95QueryMs: Math.max(1, Math.floor((dbDetails.p95QueryMs ?? 10) + (Math.random() - 0.5) * 5)),
                slowQueries: Math.max(0, (dbDetails.slowQueries ?? 0) + (Math.random() > 0.97 ? 1 : 0)),
              },
            }
          }

          // enrich backend signals
          if (comp.id === "backend" && comp.details && "availability24h" in comp.details) {
            const backendDetails = comp.details as BackendDetails
            const rpsVariation = (Math.random() - 0.5) * 10
            const latencyVariation = (Math.random() - 0.5) * 20

            return {
              ...base,
              details: {
                ...backendDetails,
                requestsPerSecond: Math.max(0, backendDetails.requestsPerSecond + rpsVariation),
                latencyP50: Math.max(50, backendDetails.latencyP50 + latencyVariation),
                latencyP95: Math.max(100, backendDetails.latencyP95 + latencyVariation * 1.5),
                latencyP99: Math.max(150, backendDetails.latencyP99 + latencyVariation * 2),
                averageResponseTime: Math.max(100, backendDetails.averageResponseTime + latencyVariation),
                errorRate5xx: Math.max(0, Math.min(5, backendDetails.errorRate5xx + (Math.random() - 0.5) * 0.01)),
                errors5xxPerSecond: Math.max(0, backendDetails.errors5xxPerSecond + (Math.random() - 0.5) * 0.01),
                successRate: Math.max(95, Math.min(100, backendDetails.successRate + (Math.random() - 0.5) * 0.1)),
                requestsUnder300ms: Math.max(90, Math.min(100, backendDetails.requestsUnder300ms + (Math.random() - 0.5) * 0.5)),
                requestsUnder1s: Math.max(95, Math.min(100, backendDetails.requestsUnder1s + (Math.random() - 0.5) * 0.2)),
                trafficSpikeRatio: Math.max(0.8, Math.min(2, backendDetails.trafficSpikeRatio + (Math.random() - 0.5) * 0.1)),
                errorRateSpikeRatio: Math.max(0.5, Math.min(2, backendDetails.errorRateSpikeRatio + (Math.random() - 0.5) * 0.1)),
                latencySpikeRatio: Math.max(0.8, Math.min(2, backendDetails.latencySpikeRatio + (Math.random() - 0.5) * 0.1)),
              },
            }
          }

          // default status rule for others
          const status: Health =
            base.errors > 50 || base.responseTime > 500
              ? "error"
              : base.errors > 20 || base.responseTime > 300
                ? "warning"
                : "healthy"

          return { ...base, status }
        })
      )

      // Update external APIs
      setExternalAPIs((prev) =>
        prev.map((api) => ({
          ...api,
          responseTime: Math.floor(Math.random() * 200) + api.responseTime - 100,
          status:
            api.responseTime > 1000
              ? "offline"
              : api.responseTime > 500
                ? "slow"
                : "online",
          lastCheck: new Date(),
        }))
      )

      // Add new log entries
      const services = ["Frontend", "Backend API", "Database", "OpenStack", "Cache Layer", "Cloudflare CDN"]
      const levels: ServiceLog["level"][] = ["info", "warning", "error", "success", "debug"]
      const messages = [
        "Request processed successfully",
        "Connection established",
        "Health check passed",
        "Resource allocation updated",
        "Cache miss detected",
        "API endpoint called",
        "Database query executed",
        "Instance status changed",
        "Configuration updated",
        "Performance metric recorded",
      ]

      if (Math.random() > 0.7) {
        const newLog: ServiceLog = {
          id: Date.now().toString(),
          timestamp: new Date(),
          level: levels[Math.floor(Math.random() * levels.length)],
          service: services[Math.floor(Math.random() * services.length)],
          message: messages[Math.floor(Math.random() * messages.length)],
        }
        setServiceLogs((prev) => [newLog, ...prev].slice(0, 100)) // Keep last 100 logs
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [])

  // Particle effect
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    type Particle = {
      x: number
      y: number
      size: number
      speedX: number
      speedY: number
      color: string
    }

    const particles: Particle[] = []
    const particleCount = 100

    // Store references after null checks - TypeScript understands these are non-null
    const canvasEl = canvas
    const ctxEl = ctx

    const createParticle = (): Particle => ({
      x: Math.random() * canvasEl.width,
      y: Math.random() * canvasEl.height,
      size: Math.random() * 3 + 1,
      speedX: (Math.random() - 0.5) * 0.5,
      speedY: (Math.random() - 0.5) * 0.5,
      color: `rgba(${Math.floor(Math.random() * 100) + 100}, ${Math.floor(Math.random() * 100) + 150}, ${Math.floor(Math.random() * 55) + 200}, ${Math.random() * 0.5 + 0.2})`,
    })

    const updateParticle = (p: Particle) => {
      p.x += p.speedX
      p.y += p.speedY

      if (p.x > canvasEl.width) p.x = 0
      if (p.x < 0) p.x = canvasEl.width
      if (p.y > canvasEl.height) p.y = 0
      if (p.y < 0) p.y = canvasEl.height
    }

    const drawParticle = (p: Particle) => {
      ctxEl.fillStyle = p.color
      ctxEl.beginPath()
      ctxEl.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctxEl.fill()
    }

    for (let i = 0; i < particleCount; i++) {
      particles.push(createParticle())
    }

    function animate() {
      if (!ctx || !canvas) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (const particle of particles) {
        updateParticle(particle)
        drawParticle(particle)
      }

      requestAnimationFrame(animate)
    }

    animate()

    const handleResize = () => {
      if (!canvas) return
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }

    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
    }
  }, [])

  // Toggle theme
  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  const selectProjectId = (nextId: number) => {
    setSelectedProjectId(nextId)
    setStoredProjectId(nextId)
    router.replace(`/dashboard?projectId=${nextId}`)
  }

  return (
    <div
      className={`${theme} min-h-screen bg-gradient-to-br from-black to-slate-900 text-slate-100 relative overflow-hidden`}
    >
      {/* Background particle effect */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-30" />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="flex flex-col items-center">
            <div className="relative w-24 h-24">
              <div className="absolute inset-0 border-4 border-cyan-500/30 rounded-full animate-ping"></div>
              <div className="absolute inset-2 border-4 border-t-cyan-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-4 border-4 border-r-purple-500 border-t-transparent border-b-transparent border-l-transparent rounded-full animate-spin-slow"></div>
              <div className="absolute inset-6 border-4 border-b-blue-500 border-t-transparent border-r-transparent border-l-transparent rounded-full animate-spin-slower"></div>
              <div className="absolute inset-8 border-4 border-l-green-500 border-t-transparent border-r-transparent border-b-transparent rounded-full animate-spin"></div>
            </div>
            <div className="mt-4 text-cyan-500 font-mono text-sm tracking-wider">SYSTEM INITIALIZING</div>
          </div>
        </div>
      )}

      <div className="container mx-auto p-3 xl:p-4 relative z-10 max-w-[2537px]">
        {/* Header */}
        <header className="flex items-center justify-between py-3 border-b border-slate-700/50 mb-4">
          <div className="flex items-center space-x-2 min-w-0">
            <Hexagon className="h-8 w-8 text-cyan-500" />
            <span className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent shrink-0">
              Greencloud Monitor
            </span>
            {selectedProject ? (
              <span className="hidden md:inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-100 min-w-0">
                <span className="truncate"> {selectedProject.display_name}</span>
                <span className="ml-2 rounded-md border border-slate-700/60 bg-slate-900/40 px-1.5 py-0.5 text-[11px] font-mono text-slate-200">
                  {selectedProject.code}
                </span>
              </span>
            ) : null}
          </div>

          <div className="flex items-center space-x-6">
            <div className="hidden lg:block">
              <ProjectSwitcher
                projects={projects}
                selectedProjectId={selectedProjectId}
                onSelectProjectId={selectProjectId}
                onManageProjects={() => router.push("/dashboard/projects")}
                disabled={Boolean(projectLoadError)}
                error={projectLoadError}
              />
            </div>

            <div className="hidden md:flex items-center space-x-1 bg-slate-800/50 rounded-full px-3 py-1.5 border border-slate-700/50 backdrop-blur-sm">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search systems..."
                className="bg-transparent border-none focus:outline-none text-sm w-40 placeholder:text-slate-500"
              />
            </div>

            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/dashboard/projects")}
                className="hidden md:inline-flex border-slate-700/50 bg-slate-900/40 text-slate-200 hover:bg-slate-800/60"
              >
                Projects
              </Button>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="relative text-slate-400 hover:text-slate-100">
                      <Bell className="h-5 w-5" />
                      <span className="absolute -top-1 -right-1 h-2 w-2 bg-cyan-500 rounded-full animate-pulse"></span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Notifications</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={toggleTheme}
                      className="text-slate-400 hover:text-slate-100"
                    >
                      {theme === "dark" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Toggle theme</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <Avatar>
                <AvatarImage src="/placeholder.svg?height=40&width=40" alt="User" />
                <AvatarFallback className="bg-slate-700 text-cyan-500">CM</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </header>

        {projectLoadError ? (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            Failed to load projects: {projectLoadError}
          </div>
        ) : null}

        {!projectLoadError && projects.length === 0 ? (
          <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm mb-4">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="text-slate-100 font-medium">No projects yet</div>
                <div className="text-xs text-slate-400">Create a project first, then come back to a project dashboard.</div>
              </div>
              <Button
                variant="outline"
                onClick={() => router.push("/dashboard/projects")}
                className="border-slate-700/50 bg-slate-900/40 text-slate-200 hover:bg-slate-800/60"
              >
                Go to Projects
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {/* Main content */}
        <div className="grid grid-cols-12 gap-4">
          {/* Sidebar */}
          <div className="col-span-12 md:col-span-2 lg:col-span-1 xl:col-span-1">
            <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm h-full">
              <CardContent className="p-3">
                <nav className="space-y-1.5">
                  <NavItem icon={Command} label="Dashboard" active />
                  <NavItem icon={Activity} label="Diagnostics" />
                  <NavItem icon={Database} label="Data Center" />
                  <NavItem icon={Globe} label="Network" />
                  <NavItem icon={Shield} label="Security" />
                  <NavItem icon={Terminal} label="Console" />
                  <NavItem icon={MessageSquare} label="Communications" />
                  <NavItem icon={Settings} label="Settings" />
                </nav>

                <div className="mt-6 pt-4 border-t border-slate-700/50">
                  <div className="text-xs text-slate-500 mb-2 font-mono">SYSTEM STATUS</div>
                  <div className="space-y-2">
                    <StatusItem label="Core Systems" value={systemStatus} color="cyan" />
                    <StatusItem label="Security" value={securityLevel} color="green" />
                    <StatusItem label="Network" value={networkStatus} color="blue" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main dashboard */}
          <div className="col-span-12 md:col-span-10 lg:col-span-8 xl:col-span-9">
            <div className="grid gap-4">
              {/* View Mode Toggle */}
              <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Layers className="h-5 w-5 text-cyan-500" />
                      <div>
                        <div className="text-sm font-medium text-slate-200">View Mode</div>
                        <div className="text-xs text-slate-400">
                          {viewMode === "full" ? "Full System" : "Individual Components"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <Label htmlFor="view-mode" className="text-sm text-slate-400">
                        {viewMode === "full" ? "Full System" : "Individual Components"}
                      </Label>
                      <Switch
                        id="view-mode"
                        checked={viewMode === "component"}
                        onCheckedChange={(checked) => {
                          setViewMode(checked ? "component" : "full")
                          if (!checked) setSelectedComponent(null)
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* System Architecture Flow */}
              {viewMode === "full" && (
                <>
                  {/* System Architecture and Logs side by side */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm overflow-hidden">
                      <CardHeader className="border-b border-slate-700/50 pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-slate-100 flex items-center text-base">
                            <Activity className="mr-2 h-4 w-4 text-cyan-500" />
                            System Architecture
                          </CardTitle>
                          <Badge variant="outline" className="bg-slate-800/50 text-cyan-400 border-cyan-500/50 text-xs">
                            <div className="h-1.5 w-1.5 rounded-full bg-cyan-500 mr-1 animate-pulse"></div>
                            LIVE
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4">
                        <SystemFlowView
                          components={components}
                          onComponentClick={(id) => {
                            setViewMode("component")
                            setSelectedComponent(id)
                          }}
                        />
                      </CardContent>
                    </Card>

                    {/* Service Logs */}
                    <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm overflow-hidden">
                      <CardHeader className="border-b border-slate-700/50 pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-slate-100 flex items-center text-base">
                            <Terminal className="mr-2 h-4 w-4 text-cyan-500" />
                            Service Logs
                          </CardTitle>
                          <Badge variant="outline" className="bg-slate-800/50 text-cyan-400 border-cyan-500/50 text-xs">
                            <div className="h-1.5 w-1.5 rounded-full bg-cyan-500 mr-1 animate-pulse"></div>
                            LIVE
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4">
                        <ServiceLogsView
                          logs={serviceLogs}
                          selectedService={effectiveSelectedLogService}
                          onServiceChange={setSelectedLogService}
                          searchQuery={logSearchQuery}
                          onSearchChange={setLogSearchQuery}
                        />
                      </CardContent>
                    </Card>
                  </div>

                  {/* External APIs Status */}
                  <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-slate-100 flex items-center text-base">
                        <Globe className="mr-2 h-5 w-5 text-blue-500" />
                        External API Connections
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Tabs defaultValue="all" className="w-full">
                        <TabsList className="bg-slate-800/50 p-1 mb-3">
                          <TabsTrigger
                            value="all"
                            className="data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400 text-xs"
                          >
                            All APIs
                          </TabsTrigger>
                          <TabsTrigger
                            value="openstack"
                            className="data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400 text-xs"
                          >
                            OpenStack APIs
                          </TabsTrigger>
                          <TabsTrigger
                            value="other"
                            className="data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400 text-xs"
                          >
                            Other APIs
                          </TabsTrigger>
                        </TabsList>
                        <TabsContent value="all" className="mt-0">
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-3">
                            {externalAPIs.map((api, index) => (
                              <ExternalAPIItem key={index} api={api} />
                            ))}
                          </div>
                        </TabsContent>
                        <TabsContent value="openstack" className="mt-0">
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-3">
                            {externalAPIs
                              .filter((api) => api.name.includes("OpenStack"))
                              .map((api, index) => (
                                <ExternalAPIItem key={index} api={api} />
                              ))}
                          </div>
                        </TabsContent>
                        <TabsContent value="other" className="mt-0">
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-3">
                            {externalAPIs
                              .filter((api) => !api.name.includes("OpenStack"))
                              .map((api, index) => (
                                <ExternalAPIItem key={index} api={api} />
                              ))}
                          </div>
                        </TabsContent>
                      </Tabs>
                    </CardContent>
                  </Card>

                  {/* Additional Data Sections - Horizontal Layout */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Quick Stats */}
                    <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-slate-100 text-sm flex items-center">
                          <BarChart3 className="mr-2 h-4 w-4 text-cyan-500" />
                          Quick Stats
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Total Requests</span>
                          <span className="text-cyan-400 font-mono">{(components.reduce((sum, c) => sum + c.requests, 0)).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Total Errors</span>
                          <span className="text-red-400 font-mono">{components.reduce((sum, c) => sum + c.errors, 0)}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Avg Response</span>
                          <span className="text-green-400 font-mono">
                            {Math.round(components.reduce((sum, c) => sum + c.responseTime, 0) / components.length)}ms
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Uptime Avg</span>
                          <span className="text-blue-400 font-mono">
                            {(components.reduce((sum, c) => sum + c.uptime, 0) / components.length).toFixed(1)}%
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* API Status Summary */}
                    <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-slate-100 text-sm flex items-center">
                          <Globe className="mr-2 h-4 w-4 text-blue-500" />
                          API Status
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Online</span>
                          <span className="text-green-400 font-mono">
                            {externalAPIs.filter((a) => a.status === "online").length}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Slow</span>
                          <span className="text-amber-400 font-mono">
                            {externalAPIs.filter((a) => a.status === "slow").length}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Offline</span>
                          <span className="text-red-400 font-mono">
                            {externalAPIs.filter((a) => a.status === "offline").length}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Avg Response</span>
                          <span className="text-cyan-400 font-mono">
                            {Math.round(externalAPIs.reduce((sum, a) => sum + a.responseTime, 0) / externalAPIs.length)}ms
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Log Summary */}
                    <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-slate-100 text-sm flex items-center">
                          <Terminal className="mr-2 h-4 w-4 text-purple-500" />
                          Log Summary
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Total Logs</span>
                          <span className="text-slate-200 font-mono">{serviceLogs.length}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Errors</span>
                          <span className="text-red-400 font-mono">
                            {serviceLogs.filter((l) => l.level === "error").length}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Warnings</span>
                          <span className="text-amber-400 font-mono">
                            {serviceLogs.filter((l) => l.level === "warning").length}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Last 5min</span>
                          <span className="text-cyan-400 font-mono">
                            {serviceLogs.filter((l) => currentTime.getTime() - l.timestamp.getTime() < 300000).length}
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* System Health */}
                    <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-slate-100 text-sm flex items-center">
                          <Shield className="mr-2 h-4 w-4 text-green-500" />
                          System Health
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Healthy</span>
                          <span className="text-green-400 font-mono">
                            {components.filter((c) => c.status === "healthy").length}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Warning</span>
                          <span className="text-amber-400 font-mono">
                            {components.filter((c) => c.status === "warning").length}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Error</span>
                          <span className="text-red-400 font-mono">
                            {components.filter((c) => c.status === "error").length}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Security</span>
                          <span className="text-cyan-400 font-mono">{securityLevel}%</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}

              {/* Component Detail View */}
              {viewMode === "component" && (
                <>
                  {/* Component Details and Logs side by side */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm overflow-hidden">
                      <CardHeader className="border-b border-slate-700/50 pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-slate-100 flex items-center text-base">
                            <Activity className="mr-2 h-4 w-4 text-cyan-500" />
                            Component Details
                          </CardTitle>
                          <div className="flex flex-wrap gap-2">
                            {components.map((comp) => (
                              <Button
                                key={comp.id}
                                variant={selectedComponent === comp.id ? "default" : "outline"}
                                size="sm"
                                onClick={() => setSelectedComponent(comp.id)}
                                className={
                                  selectedComponent === comp.id
                                    ? "bg-cyan-600 hover:bg-cyan-700 text-white"
                                    : "border-slate-700 text-slate-300 hover:bg-slate-800"
                                }
                              >
                                {comp.name}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4">
                        {selectedComponent ? (
                          <ComponentDetailView
                            component={components.find((c) => c.id === selectedComponent)!}
                          />
                        ) : (
                          <div className="text-center py-12 text-slate-400">
                            Select a component to view details
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Service Logs */}
                    <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm overflow-hidden">
                      <CardHeader className="border-b border-slate-700/50 pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-slate-100 flex items-center text-base">
                            <Terminal className="mr-2 h-4 w-4 text-cyan-500" />
                            Service Logs
                          </CardTitle>
                          <Badge variant="outline" className="bg-slate-800/50 text-cyan-400 border-cyan-500/50 text-xs">
                            <div className="h-1.5 w-1.5 rounded-full bg-cyan-500 mr-1 animate-pulse"></div>
                            LIVE
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4">
                        <ServiceLogsView
                          logs={serviceLogs}
                          selectedService={effectiveSelectedLogService}
                          onServiceChange={setSelectedLogService}
                          searchQuery={logSearchQuery}
                          onSearchChange={setLogSearchQuery}
                        />
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}

              {/* System overview */}
              <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm overflow-hidden">
                <CardHeader className="border-b border-slate-700/50 pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-slate-100 flex items-center text-base">
                      <Activity className="mr-2 h-4 w-4 text-cyan-500" />
                      System Overview
                    </CardTitle>
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline" className="bg-slate-800/50 text-cyan-400 border-cyan-500/50 text-xs">
                        <div className="h-1.5 w-1.5 rounded-full bg-cyan-500 mr-1 animate-pulse"></div>
                        LIVE
                      </Badge>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                    <MetricCard
                      title="CPU Usage"
                      value={cpuUsage}
                      icon={Cpu}
                      trend="up"
                      color="cyan"
                      detail="3.8 GHz | 12 Cores"
                    />
                    <MetricCard
                      title="Memory"
                      value={memoryUsage}
                      icon={HardDrive}
                      trend="stable"
                      color="purple"
                      detail="16.4 GB / 24 GB"
                    />
                    <MetricCard
                      title="Network"
                      value={networkStatus}
                      icon={Wifi}
                      trend="down"
                      color="blue"
                      detail="1.2 GB/s | 42ms"
                    />
                  </div>

                  <div className="mt-4">
                    <Tabs defaultValue="performance" className="w-full">
                      <div className="flex items-center justify-between mb-3">
                        <TabsList className="bg-slate-800/50 p-1">
                          <TabsTrigger
                            value="performance"
                            className="data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400"
                          >
                            Performance
                          </TabsTrigger>
                          <TabsTrigger
                            value="processes"
                            className="data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400"
                          >
                            Processes
                          </TabsTrigger>
                          <TabsTrigger
                            value="storage"
                            className="data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400"
                          >
                            Storage
                          </TabsTrigger>
                        </TabsList>

                        <div className="flex items-center space-x-2 text-xs text-slate-400">
                          <div className="flex items-center">
                            <div className="h-2 w-2 rounded-full bg-cyan-500 mr-1"></div>
                            CPU
                          </div>
                          <div className="flex items-center">
                            <div className="h-2 w-2 rounded-full bg-purple-500 mr-1"></div>
                            Memory
                          </div>
                          <div className="flex items-center">
                            <div className="h-2 w-2 rounded-full bg-blue-500 mr-1"></div>
                            Network
                          </div>
                        </div>
                      </div>

                      <TabsContent value="performance" className="mt-0">
                        <div className="h-64 w-full relative bg-slate-800/30 rounded-lg border border-slate-700/50 overflow-hidden">
                          <PerformanceChart />
                          <div className="absolute bottom-4 right-4 bg-slate-900/80 backdrop-blur-sm rounded-md px-3 py-2 border border-slate-700/50">
                            <div className="text-xs text-slate-400">System Load</div>
                            <div className="text-lg font-mono text-cyan-400">{cpuUsage}%</div>
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="processes" className="mt-0">
                        <div className="bg-slate-800/30 rounded-lg border border-slate-700/50 overflow-hidden">
                          <div className="grid grid-cols-12 text-xs text-slate-400 p-3 border-b border-slate-700/50 bg-slate-800/50">
                            <div className="col-span-1">PID</div>
                            <div className="col-span-4">Process</div>
                            <div className="col-span-2">User</div>
                            <div className="col-span-2">CPU</div>
                            <div className="col-span-2">Memory</div>
                            <div className="col-span-1">Status</div>
                          </div>

                          <div className="divide-y divide-slate-700/30">
                            <ProcessRow
                              pid="1024"
                              name="system_core.exe"
                              user="SYSTEM"
                              cpu={12.4}
                              memory={345}
                              status="running"
                            />
                            <ProcessRow
                              pid="1842"
                              name="nexus_service.exe"
                              user="SYSTEM"
                              cpu={8.7}
                              memory={128}
                              status="running"
                            />
                            <ProcessRow
                              pid="2156"
                              name="security_monitor.exe"
                              user="ADMIN"
                              cpu={5.2}
                              memory={96}
                              status="running"
                            />
                            <ProcessRow
                              pid="3012"
                              name="network_manager.exe"
                              user="SYSTEM"
                              cpu={3.8}
                              memory={84}
                              status="running"
                            />
                            <ProcessRow
                              pid="4268"
                              name="user_interface.exe"
                              user="USER"
                              cpu={15.3}
                              memory={256}
                              status="running"
                            />
                            <ProcessRow
                              pid="5124"
                              name="data_analyzer.exe"
                              user="ADMIN"
                              cpu={22.1}
                              memory={512}
                              status="running"
                            />
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="storage" className="mt-0">
                        <div className="bg-slate-800/30 rounded-lg border border-slate-700/50 p-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <StorageItem name="System Drive (C:)" total={512} used={324} type="SSD" />
                            <StorageItem name="Data Drive (D:)" total={2048} used={1285} type="HDD" />
                            <StorageItem name="Backup Drive (E:)" total={4096} used={1865} type="HDD" />
                            <StorageItem name="External Drive (F:)" total={1024} used={210} type="SSD" />
                          </div>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </div>
                </CardContent>
              </Card>

              {/* Security & Alerts */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-slate-100 flex items-center text-base">
                      <Shield className="mr-2 h-5 w-5 text-green-500" />
                      Security Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-slate-400">Firewall</div>
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/50">Active</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-slate-400">Intrusion Detection</div>
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/50">Active</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-slate-400">Encryption</div>
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/50">Active</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-slate-400">Threat Database</div>
                        <div className="text-sm text-cyan-400">
                          Updated <span className="text-slate-500">12 min ago</span>
                        </div>
                      </div>

                      <div className="pt-2 mt-2 border-t border-slate-700/50">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium">Security Level</div>
                          <div className="text-sm text-cyan-400">{securityLevel}%</div>
                        </div>
                        <Progress value={securityLevel} className="h-2 bg-slate-700">
                          <div
                            className="h-full bg-gradient-to-r from-green-500 to-cyan-500 rounded-full"
                            style={{ width: `${securityLevel}%` }}
                          />
                        </Progress>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-slate-100 flex items-center text-base">
                      <AlertCircle className="mr-2 h-5 w-5 text-amber-500" />
                      System Alerts
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <AlertItem
                        title="Security Scan Complete"
                        time="14:32:12"
                        description="No threats detected in system scan"
                        type="info"
                      />
                      <AlertItem
                        title="Bandwidth Spike Detected"
                        time="13:45:06"
                        description="Unusual network activity on port 443"
                        type="warning"
                      />
                      <AlertItem
                        title="System Update Available"
                        time="09:12:45"
                        description="Version 12.4.5 ready to install"
                        type="update"
                      />
                      <AlertItem
                        title="Backup Completed"
                        time="04:30:00"
                        description="Incremental backup to drive E: successful"
                        type="success"
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

            </div>
          </div>

          {/* Right sidebar */}
          <div className="col-span-12 lg:col-span-3 xl:col-span-2">
            <div className="grid gap-4">
              {/* System time */}
              <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm overflow-hidden">
                <CardContent className="p-0">
                  <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-4 border-b border-slate-700/50">
                    <div className="text-center">
                      <div className="text-xs text-slate-500 mb-1 font-mono">SYSTEM TIME</div>
                      <div className="text-2xl font-mono text-cyan-400 mb-1">{formatTime(currentTime)}</div>
                      <div className="text-xs text-slate-400">{formatDate(currentTime)}</div>
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-slate-800/50 rounded-md p-2 border border-slate-700/50">
                        <div className="text-xs text-slate-500 mb-1">Uptime</div>
                        <div className="text-sm font-mono text-slate-200">14d 06:42:18</div>
                      </div>
                      <div className="bg-slate-800/50 rounded-md p-2 border border-slate-700/50">
                        <div className="text-xs text-slate-500 mb-1">Time Zone</div>
                        <div className="text-xs font-mono text-slate-200">UTC-08:00</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quick actions */}
              <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-slate-100 text-base">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <ActionButton icon={Shield} label="Security Scan" />
                    <ActionButton icon={RefreshCw} label="Sync Data" />
                    <ActionButton icon={Download} label="Backup" />
                    <ActionButton icon={Terminal} label="Console" />
                  </div>
                </CardContent>
              </Card>

              {/* Resource allocation */}
              <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-slate-100 text-base">Resource Allocation</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm text-slate-400">Processing Power</div>
                        <div className="text-xs text-cyan-400">42% allocated</div>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                          style={{ width: "42%" }}
                        ></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm text-slate-400">Memory Allocation</div>
                        <div className="text-xs text-purple-400">68% allocated</div>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                          style={{ width: "68%" }}
                        ></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm text-slate-400">Network Bandwidth</div>
                        <div className="text-xs text-blue-400">35% allocated</div>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
                          style={{ width: "35%" }}
                        ></div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-700/50">
                      <div className="flex items-center justify-between text-sm">
                        <div className="text-slate-400">Priority Level</div>
                        <div className="flex items-center">
                          <Slider defaultValue={[3]} max={5} step={1} className="w-24 mr-2" />
                          <span className="text-cyan-400">3/5</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Environment controls */}
              <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-slate-100 text-base">Environment Controls</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Radio className="text-cyan-500 mr-2 h-4 w-4" />
                        <Label className="text-sm text-slate-400">Power Management</Label>
                      </div>
                      <Switch />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Lock className="text-cyan-500 mr-2 h-4 w-4" />
                        <Label className="text-sm text-slate-400">Security Protocol</Label>
                      </div>
                      <Switch defaultChecked />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Zap className="text-cyan-500 mr-2 h-4 w-4" />
                        <Label className="text-sm text-slate-400">Power Saving Mode</Label>
                      </div>
                      <Switch />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <CircleOff className="text-cyan-500 mr-2 h-4 w-4" />
                        <Label className="text-sm text-slate-400">Auto Shutdown</Label>
                      </div>
                      <Switch defaultChecked />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Bubble - Always visible at bottom right */}
      <ChatBubble 
        isOpen={isChatOpen} 
        onToggle={() => setIsChatOpen(!isChatOpen)}
        selectedChat={selectedChat}
        onChatSelect={setSelectedChat}
      />
    </div>
  )
}

// Component for nav items
function NavItem({ icon: Icon, label, active }: { icon: LucideIcon; label: string; active?: boolean }) {
  return (
    <Button
      variant="ghost"
      className={`w-full justify-start ${active ? "bg-slate-800/70 text-cyan-400" : "text-slate-400 hover:text-slate-100"}`}
    >
      <Icon className="mr-2 h-4 w-4" />
      {label}
    </Button>
  )
}

// Component for status items
function StatusItem({ label, value, color }: { label: string; value: number; color: string }) {
  const getColor = () => {
    switch (color) {
      case "cyan":
        return "from-cyan-500 to-blue-500"
      case "green":
        return "from-green-500 to-emerald-500"
      case "blue":
        return "from-blue-500 to-indigo-500"
      case "purple":
        return "from-purple-500 to-pink-500"
      default:
        return "from-cyan-500 to-blue-500"
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-slate-400">{label}</div>
        <div className="text-xs text-slate-400">{value}%</div>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full bg-gradient-to-r ${getColor()} rounded-full`} style={{ width: `${value}%` }}></div>
      </div>
    </div>
  )
}

// Component for metric cards
function MetricCard({
  title,
  value,
  icon: Icon,
  trend,
  color,
  detail,
}: {
  title: string
  value: number
  icon: LucideIcon
  trend: "up" | "down" | "stable"
  color: string
  detail: string
}) {
  const getColor = () => {
    switch (color) {
      case "cyan":
        return "from-cyan-500 to-blue-500 border-cyan-500/30"
      case "green":
        return "from-green-500 to-emerald-500 border-green-500/30"
      case "blue":
        return "from-blue-500 to-indigo-500 border-blue-500/30"
      case "purple":
        return "from-purple-500 to-pink-500 border-purple-500/30"
      default:
        return "from-cyan-500 to-blue-500 border-cyan-500/30"
    }
  }

  const getTrendIcon = () => {
    switch (trend) {
      case "up":
        return <BarChart3 className="h-4 w-4 text-amber-500" />
      case "down":
        return <BarChart3 className="h-4 w-4 rotate-180 text-green-500" />
      case "stable":
        return <LineChart className="h-4 w-4 text-blue-500" />
      default:
        return null
    }
  }

  return (
    <div className={`bg-slate-800/50 rounded-lg border ${getColor()} p-4 relative overflow-hidden`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-slate-400">{title}</div>
        <Icon className={`h-5 w-5 text-${color}-500`} />
      </div>
      <div className="text-2xl font-bold mb-1 bg-gradient-to-r bg-clip-text text-transparent from-slate-100 to-slate-300">
        {value}%
      </div>
      <div className="text-xs text-slate-500">{detail}</div>
      <div className="absolute bottom-2 right-2 flex items-center">{getTrendIcon()}</div>
      <div className="absolute -bottom-6 -right-6 h-16 w-16 rounded-full bg-gradient-to-r opacity-20 blur-xl from-cyan-500 to-blue-500"></div>
    </div>
  )
}

// Performance chart component
function PerformanceChart() {
  const bars = DEFAULT_PERF_BARS

  return (
    <div className="h-full w-full flex items-end justify-between px-4 pt-4 pb-8 relative">
      {/* Y-axis labels */}
      <div className="absolute left-2 top-0 h-full flex flex-col justify-between py-4">
        <div className="text-xs text-slate-500">100%</div>
        <div className="text-xs text-slate-500">75%</div>
        <div className="text-xs text-slate-500">50%</div>
        <div className="text-xs text-slate-500">25%</div>
        <div className="text-xs text-slate-500">0%</div>
      </div>

      {/* X-axis grid lines */}
      <div className="absolute left-0 right-0 top-0 h-full flex flex-col justify-between py-4 px-10">
        <div className="border-b border-slate-700/30 w-full"></div>
        <div className="border-b border-slate-700/30 w-full"></div>
        <div className="border-b border-slate-700/30 w-full"></div>
        <div className="border-b border-slate-700/30 w-full"></div>
        <div className="border-b border-slate-700/30 w-full"></div>
      </div>

      {/* Chart bars */}
      <div className="flex-1 h-full flex items-end justify-between px-2 z-10">
        {bars.map((bar, i) => {
          return (
            <div key={i} className="flex space-x-0.5">
              <div
                className="w-1 bg-gradient-to-t from-cyan-500 to-cyan-400 rounded-t-sm"
                style={{ height: `${bar.cpuHeight}%` }}
              ></div>
              <div
                className="w-1 bg-gradient-to-t from-purple-500 to-purple-400 rounded-t-sm"
                style={{ height: `${bar.memHeight}%` }}
              ></div>
              <div
                className="w-1 bg-gradient-to-t from-blue-500 to-blue-400 rounded-t-sm"
                style={{ height: `${bar.netHeight}%` }}
              ></div>
            </div>
          )
        })}
      </div>

      {/* X-axis labels */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between px-10">
        <div className="text-xs text-slate-500">00:00</div>
        <div className="text-xs text-slate-500">06:00</div>
        <div className="text-xs text-slate-500">12:00</div>
        <div className="text-xs text-slate-500">18:00</div>
        <div className="text-xs text-slate-500">24:00</div>
      </div>
    </div>
  )
}

// Process row component
function ProcessRow({
  pid,
  name,
  user,
  cpu,
  memory,
  status,
}: {
  pid: string
  name: string
  user: string
  cpu: number
  memory: number
  status: string
}) {
  return (
    <div className="grid grid-cols-12 py-2 px-3 text-sm hover:bg-slate-800/50">
      <div className="col-span-1 text-slate-500">{pid}</div>
      <div className="col-span-4 text-slate-300">{name}</div>
      <div className="col-span-2 text-slate-400">{user}</div>
      <div className="col-span-2 text-cyan-400">{cpu}%</div>
      <div className="col-span-2 text-purple-400">{memory} MB</div>
      <div className="col-span-1">
        <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30 text-xs">
          {status}
        </Badge>
      </div>
    </div>
  )
}

// Storage item component
function StorageItem({
  name,
  total,
  used,
  type,
}: {
  name: string
  total: number
  used: number
  type: string
}) {
  const percentage = Math.round((used / total) * 100)

  return (
    <div className="bg-slate-800/50 rounded-md p-3 border border-slate-700/50">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-slate-300">{name}</div>
        <Badge variant="outline" className="bg-slate-700/50 text-slate-300 border-slate-600/50 text-xs">
          {type}
        </Badge>
      </div>
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-slate-500">
            {used} GB / {total} GB
          </div>
          <div className="text-xs text-slate-400">{percentage}%</div>
        </div>
        <Progress value={percentage} className="h-1.5 bg-slate-700">
          <div
            className={`h-full rounded-full ${
              percentage > 90 ? "bg-red-500" : percentage > 70 ? "bg-amber-500" : "bg-cyan-500"
            }`}
            style={{ width: `${percentage}%` }}
          />
        </Progress>
      </div>
      <div className="flex items-center justify-between text-xs">
        <div className="text-slate-500">Free: {total - used} GB</div>
        <Button variant="ghost" size="sm" className="h-6 text-xs px-2 text-slate-400 hover:text-slate-100">
          Details
        </Button>
      </div>
    </div>
  )
}

// Alert item component
function AlertItem({
  title,
  time,
  description,
  type,
}: {
  title: string
  time: string
  description: string
  type: "info" | "warning" | "error" | "success" | "update"
}) {
  const getTypeStyles = () => {
    switch (type) {
      case "info":
        return { icon: Info, color: "text-blue-500 bg-blue-500/10 border-blue-500/30" }
      case "warning":
        return { icon: AlertCircle, color: "text-amber-500 bg-amber-500/10 border-amber-500/30" }
      case "error":
        return { icon: AlertCircle, color: "text-red-500 bg-red-500/10 border-red-500/30" }
      case "success":
        return { icon: Check, color: "text-green-500 bg-green-500/10 border-green-500/30" }
      case "update":
        return { icon: Download, color: "text-cyan-500 bg-cyan-500/10 border-cyan-500/30" }
      default:
        return { icon: Info, color: "text-blue-500 bg-blue-500/10 border-blue-500/30" }
    }
  }

  const { icon: Icon, color } = getTypeStyles()

  return (
    <div className="flex items-start space-x-3">
      <div className={`mt-0.5 p-1 rounded-full ${color.split(" ")[1]} ${color.split(" ")[2]}`}>
        <Icon className={`h-3 w-3 ${color.split(" ")[0]}`} />
      </div>
      <div>
        <div className="flex items-center">
          <div className="text-sm font-medium text-slate-200">{title}</div>
          <div className="ml-2 text-xs text-slate-500">{time}</div>
        </div>
        <div className="text-xs text-slate-400">{description}</div>
      </div>
    </div>
  )
}

// Communication Timeline View Component
interface CommunicationMessage {
  id: number
  sender: string
  time: string
  message: string
  avatar: string
  type?: "maintenance" | "security" | "network" | "backup" | "info" | "alert"
  unread?: boolean
  fullMessage?: string
}

// Chat Bubble Component - Floating button with chat window
function ChatBubble({
  isOpen,
  onToggle,
  selectedChat,
  onChatSelect,
}: {
  isOpen: boolean
  onToggle: () => void
  selectedChat: number | null
  onChatSelect: (id: number | null) => void
}) {
  const messages: CommunicationMessage[] = [
    {
      id: 1,
      sender: "System Administrator",
      time: "15:42:12",
      message: "Scheduled maintenance will occur at 02:00. All systems will be temporarily offline.",
      avatar: "/placeholder.svg?height=40&width=40",
      type: "maintenance",
      unread: true,
      fullMessage: "Scheduled maintenance will occur at 02:00 UTC. All systems will be temporarily offline for approximately 30 minutes. Please ensure all critical operations are completed before this time. We apologize for any inconvenience.",
    },
    {
      id: 2,
      sender: "Security Module",
      time: "14:30:45",
      message: "Unusual login attempt blocked from IP 192.168.1.45. Added to watchlist.",
      avatar: "/placeholder.svg?height=40&width=40",
      type: "security",
      unread: true,
      fullMessage: "Unusual login attempt detected and blocked from IP address 192.168.1.45. Multiple failed authentication attempts were recorded. The IP has been automatically added to the security watchlist. No further action required at this time.",
    },
    {
      id: 3,
      sender: "Network Control",
      time: "12:15:33",
      message: "Bandwidth allocation adjusted for priority services during peak hours.",
      avatar: "/placeholder.svg?height=40&width=40",
      type: "network",
      unread: true,
      fullMessage: "Bandwidth allocation has been automatically adjusted for priority services during peak hours. Critical services are now receiving 60% of available bandwidth, with standard services allocated 30% and background tasks limited to 10%. This optimization will remain active until 18:00 UTC.",
    },
    {
      id: 4,
      sender: "Data Center",
      time: "09:05:18",
      message: "Backup verification complete. All data integrity checks passed.",
      avatar: "/placeholder.svg?height=40&width=40",
      type: "backup",
      unread: true,
      fullMessage: "Backup verification process completed successfully. All data integrity checks passed with 100% accuracy. Total backup size: 2.4 TB. Backup location: Secondary data center (DC-02). Next scheduled backup: Tomorrow at 02:00 UTC.",
    },
  ]

  const getTypeColor = (type?: string) => {
    switch (type) {
      case "maintenance":
        return "bg-amber-500 ring-amber-500/30"
      case "security":
        return "bg-red-500 ring-red-500/30"
      case "network":
        return "bg-blue-500 ring-blue-500/30"
      case "backup":
        return "bg-green-500 ring-green-500/30"
      case "alert":
        return "bg-amber-500 ring-amber-500/30"
      default:
        return "bg-cyan-500 ring-cyan-500/30"
    }
  }

  const getTypeIcon = (type?: string) => {
    switch (type) {
      case "maintenance":
        return <Settings className="h-3 w-3 text-amber-400" />
      case "security":
        return <Shield className="h-3 w-3 text-red-400" />
      case "network":
        return <Wifi className="h-3 w-3 text-blue-400" />
      case "backup":
        return <Download className="h-3 w-3 text-green-400" />
      case "alert":
        return <AlertCircle className="h-3 w-3 text-amber-400" />
      default:
        return <MessageSquare className="h-3 w-3 text-cyan-400" />
    }
  }

  const selectedMessage = messages.find((m) => m.id === selectedChat)
  const unreadCount = messages.filter((m) => m.unread).length

  return (
    <>
      {/* Floating Chat Bubble Button */}
      <button
        onClick={onToggle}
        className="fixed bottom-6 right-6 z-40 w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full shadow-2xl hover:shadow-cyan-500/50 transition-all duration-300 hover:scale-110 flex items-center justify-center group"
        aria-label="Open chat"
      >
        <MessageSquare className="h-6 w-6 text-white" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center ring-2 ring-slate-900 animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-96 h-[600px] bg-slate-900 border border-slate-700 rounded-lg shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 border-b border-slate-700 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-cyan-400" />
              <div>
                <div className="text-sm font-semibold text-slate-100">Communications</div>
                <div className="text-xs text-slate-400">
                  {unreadCount > 0 ? `${unreadCount} new message${unreadCount > 1 ? 's' : ''}` : 'No new messages'}
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:text-slate-100 h-8 w-8"
              onClick={onToggle}
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </div>

          {/* Messages List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                onClick={() => onChatSelect(msg.id === selectedChat ? null : msg.id)}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedChat === msg.id
                    ? 'bg-cyan-500/10 border-cyan-500/50'
                    : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800/70'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full ${getTypeColor(msg.type)} flex items-center justify-center flex-shrink-0`}>
                    {getTypeIcon(msg.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-sm font-semibold text-slate-200 truncate">{msg.sender}</div>
                      <div className="text-xs text-slate-500 font-mono flex-shrink-0 ml-2">{msg.time}</div>
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2">{msg.message}</p>
                    {msg.unread && (
                      <Badge className="mt-1 bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-[10px] px-1.5 py-0 h-4">
                        NEW
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Message Detail Modal */}
      {selectedChat && selectedMessage && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => onChatSelect(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 border-b border-slate-700 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full ${getTypeColor(selectedMessage.type)} flex items-center justify-center`}>
                  {getTypeIcon(selectedMessage.type)}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-100">{selectedMessage.sender}</div>
                  <div className="text-xs text-slate-400 font-mono">{selectedMessage.time}</div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-slate-400 hover:text-slate-100"
                onClick={() => onChatSelect(null)}
              >
                <XCircle className="h-5 w-5" />
              </Button>
            </div>

            {/* Message Content */}
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="space-y-4">
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                  <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {selectedMessage.fullMessage || selectedMessage.message}
                  </p>
                </div>
                
                {/* Message metadata */}
                <div className="flex items-center gap-4 text-xs text-slate-500 pt-2 border-t border-slate-700/50">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>Sent at {selectedMessage.time}</span>
                  </div>
                  {selectedMessage.type && (
                    <Badge className={`${getTypeColor(selectedMessage.type)} text-white text-[10px] px-2 py-0.5`}>
                      {selectedMessage.type.toUpperCase()}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-800/50 border-t border-slate-700 p-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Reply
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Communication item component
function CommunicationItem({
  sender,
  time,
  message,
  avatar,
  type,
  unread,
}: {
  sender: string
  time: string
  message: string
  avatar: string
  type?: "maintenance" | "security" | "network" | "backup" | "info" | "alert"
  unread?: boolean
}) {
  const getTypeIcon = () => {
    switch (type) {
      case "maintenance":
        return <Settings className="h-4 w-4 text-amber-400" />
      case "security":
        return <Shield className="h-4 w-4 text-red-400" />
      case "network":
        return <Wifi className="h-4 w-4 text-blue-400" />
      case "backup":
        return <Download className="h-4 w-4 text-green-400" />
      case "alert":
        return <AlertCircle className="h-4 w-4 text-amber-400" />
      default:
        return <MessageSquare className="h-4 w-4 text-cyan-400" />
    }
  }

  const getTypeColor = () => {
    switch (type) {
      case "maintenance":
        return "border-l-amber-500/50 bg-amber-500/5"
      case "security":
        return "border-l-red-500/50 bg-red-500/5"
      case "network":
        return "border-l-blue-500/50 bg-blue-500/5"
      case "backup":
        return "border-l-green-500/50 bg-green-500/5"
      case "alert":
        return "border-l-amber-500/50 bg-amber-500/5"
      default:
        return "border-l-cyan-500/50 bg-cyan-500/5"
    }
  }

  return (
    <div
      className={`group flex items-start gap-3 p-3 rounded-lg border-l-4 transition-all hover:bg-slate-800/30 cursor-pointer ${
        unread ? `${getTypeColor()} border-l-4` : "border-l-transparent"
      }`}
    >
      <div className="relative flex-shrink-0">
        <Avatar className="h-10 w-10 ring-2 ring-slate-700/50 group-hover:ring-cyan-500/50 transition-all">
          <AvatarImage src={avatar} alt={sender} />
          <AvatarFallback className="bg-gradient-to-br from-slate-700 to-slate-800 text-cyan-400 font-semibold">
            {sender.charAt(0)}
          </AvatarFallback>
        </Avatar>
        {unread && (
          <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-cyan-500 ring-2 ring-slate-900 animate-pulse"></div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex-shrink-0">{getTypeIcon()}</div>
            <div className="text-sm font-semibold text-slate-200 truncate">{sender}</div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-xs text-slate-500 font-mono">{time}</div>
            {unread && (
              <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-[10px] px-1.5 py-0 h-4">
                NEW
              </Badge>
            )}
          </div>
        </div>
        <div className="text-xs text-slate-400 leading-relaxed line-clamp-2 group-hover:text-slate-300 transition-colors">
          {message}
        </div>
      </div>
    </div>
  )
}

// Action button component
function ActionButton({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <Button
      variant="outline"
      className="h-auto py-3 px-3 border-slate-700 bg-slate-800/50 hover:bg-slate-700/50 flex flex-col items-center justify-center space-y-1 w-full"
    >
      <Icon className="h-5 w-5 text-cyan-500" />
      <span className="text-xs">{label}</span>
    </Button>
  )
}

// Add missing imports
function Info(props: React.ComponentProps<typeof AlertCircle>) {
  return <AlertCircle {...props} />
}

function Check(props: React.ComponentProps<typeof Shield>) {
  return <Shield {...props} />
}

// System Flow View Component
function SystemFlowView({
  components,
  onComponentClick,
}: {
  components: SystemComponent[]
  onComponentClick: (id: ComponentType) => void
}) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "bg-green-500/20 border-green-500/50 text-green-400"
      case "warning":
        return "bg-amber-500/20 border-amber-500/50 text-amber-400"
      case "error":
        return "bg-red-500/20 border-red-500/50 text-red-400"
      default:
        return "bg-slate-500/20 border-slate-500/50 text-slate-400"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return <CheckCircle2 className="h-4 w-4" />
      case "warning":
        return <AlertCircle className="h-4 w-4" />
      case "error":
        return <XCircle className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  const getComponentIcon = (id: ComponentType) => {
    switch (id) {
      case "cloudflare":
        return <Cloud className="h-6 w-6" />
      case "frontend":
        return <Globe className="h-6 w-6" />
      case "backend":
        return <Server className="h-6 w-6" />
      case "cache":
        return <Zap className="h-6 w-6" />
      case "openstack":
        return <Cloud className="h-6 w-6" />
      case "database":
        return <Database className="h-6 w-6" />
      default:
        return <Activity className="h-6 w-6" />
    }
  }

  // Separate components into main flow and parallel components
  const mainFlowComponents = components.filter((c) => c.id !== "openstack" && c.id !== "database")
  const openstackComponent = components.find((c) => c.id === "openstack")
  const databaseComponent = components.find((c) => c.id === "database")

  const renderComponentCard = (comp: SystemComponent) => (
    <div className="flex flex-col items-center">
      <button
        onClick={() => onComponentClick(comp.id)}
        className={`group relative p-4 rounded-lg border-2 transition-all hover:scale-105 ${
          comp.status === "healthy"
            ? "bg-slate-800/50 border-cyan-500/30 hover:border-cyan-500/60"
            : comp.status === "warning"
              ? "bg-slate-800/50 border-amber-500/30 hover:border-amber-500/60"
              : "bg-slate-800/50 border-red-500/30 hover:border-red-500/60"
        }`}
      >
        <div
          className={`mb-2 ${
            comp.status === "healthy"
              ? "text-cyan-400"
              : comp.status === "warning"
                ? "text-amber-400"
                : "text-red-400"
          }`}
        >
          {getComponentIcon(comp.id)}
        </div>
        <div className="text-sm font-medium text-slate-200 mb-1">{comp.name}</div>
        <Badge className={`${getStatusColor(comp.status)} text-xs mb-2`}>
          <span className="mr-1">{getStatusIcon(comp.status)}</span>
          {comp.status === "healthy" ? "Healthy" : comp.status === "warning" ? "Warning" : "Error"}
        </Badge>
        <div className="text-xs text-slate-400 space-y-1">
          <div>Uptime: {comp.uptime}%</div>
          <div>Response: {comp.responseTime}ms</div>
          <div>Requests: {comp.requests.toLocaleString()}</div>
        </div>
        {comp.id === "database" && comp.details && "engine" in comp.details && (
          <div className="mt-2 text-xs text-slate-400 space-y-1 border-t border-slate-700/50 pt-2">
            {(() => {
              const dbDetails = comp.details as DatabaseDetails
              return (
                <>
                  <div className="flex justify-between">
                    <span>Last backup</span>
                    <span
                      className={dbDetails.lastBackupStatus === "failed" ? "text-red-400" : "text-green-400"}
                    >
                      {dbDetails.lastBackupAt
                        ? `${Math.floor((MOCK_NOW_MS - dbDetails.lastBackupAt.getTime()) / 60000)}m ago`
                        : "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Replica</span>
                    <span
                      className={
                        dbDetails.replicaReady < dbDetails.replicaCount ? "text-amber-400" : "text-green-400"
                      }
                    >
                      {dbDetails.replicaReady}/{dbDetails.replicaCount} ready
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Lag</span>
                    <span
                      className={(dbDetails.replicationLagSeconds ?? 0) > 10 ? "text-amber-400" : "text-slate-200"}
                    >
                      {dbDetails.replicationLagSeconds ?? "—"}s
                    </span>
                  </div>
                </>
              )
            })()}
          </div>
        )}
      </button>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center overflow-x-auto pb-4">
        {/* Main flow: Cloudflare -> Frontend -> Backend -> Cache */}
        <div className="flex items-center justify-center w-full mb-4">
          {mainFlowComponents.map((comp, index) => (
            <div key={comp.id} className="flex items-center flex-shrink-0">
              {renderComponentCard(comp)}
              {index < mainFlowComponents.length - 1 && (
                <div className="mx-4 flex-shrink-0">
                  <ArrowRight className="h-6 w-6 text-slate-600" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Parallel flow: OpenStack and Database side by side */}
        {openstackComponent && databaseComponent && (
          <div className="flex flex-col items-center w-full relative">
            {/* Arrow down from Cache */}
            <div className="mb-2">
              <ArrowRight className="h-6 w-6 text-slate-600 rotate-90" />
            </div>
            
            {/* OpenStack and Database side by side */}
            <div className="flex items-center space-x-8">
              {renderComponentCard(openstackComponent)}
              {renderComponentCard(databaseComponent)}
            </div>
          </div>
        )}
      </div>

      {/* System Health Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
        {components.map((comp) => (
          <div
            key={comp.id}
            className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/50"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs text-slate-400 truncate">{comp.name}</div>
              <div className={`h-2 w-2 rounded-full ${
                comp.status === "healthy" ? "bg-green-500" : comp.status === "warning" ? "bg-amber-500" : "bg-red-500"
              }`}></div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">CPU</span>
                <span className="text-cyan-400">{comp.cpu.toFixed(0)}%</span>
              </div>
              <Progress value={comp.cpu} className="h-1 bg-slate-700">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                  style={{ width: `${comp.cpu}%` }}
                />
              </Progress>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Memory</span>
                <span className="text-purple-400">{comp.memory.toFixed(0)}%</span>
              </div>
              <Progress value={comp.memory} className="h-1 bg-slate-700">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                  style={{ width: `${comp.memory}%` }}
                />
              </Progress>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// External API Item Component
function ExternalAPIItem({ api }: { api: ExternalAPI }) {
  const getStatusColor = () => {
    switch (api.status) {
      case "online":
        return "bg-green-500/20 border-green-500/50 text-green-400"
      case "slow":
        return "bg-amber-500/20 border-amber-500/50 text-amber-400"
      case "offline":
        return "bg-red-500/20 border-red-500/50 text-red-400"
      default:
        return "bg-slate-500/20 border-slate-500/50 text-slate-400"
    }
  }

  const getStatusIcon = () => {
    switch (api.status) {
      case "online":
        return <CheckCircle2 className="h-4 w-4" />
      case "slow":
        return <Clock className="h-4 w-4" />
      case "offline":
        return <XCircle className="h-4 w-4" />
      default:
        return <AlertCircle className="h-4 w-4" />
    }
  }

  const getStatusText = () => {
    switch (api.status) {
      case "online":
        return "Online"
      case "slow":
        return "Slow"
      case "offline":
        return "Offline"
      default:
        return "Unknown"
    }
  }

  const isOpenStack = api.name.includes("OpenStack")

  return (
    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-1">
            {isOpenStack ? (
              <Cloud className="h-4 w-4 text-cyan-400" />
            ) : (
              <Globe className="h-4 w-4 text-blue-400" />
            )}
            <div className="text-sm font-medium text-slate-200">{api.name}</div>
          </div>
          <div className="text-xs text-slate-500 truncate">{api.url}</div>
        </div>
        <Badge className={`${getStatusColor()} text-xs`}>
          <span className="mr-1">{getStatusIcon()}</span>
          {getStatusText()}
        </Badge>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Response Time</span>
          <span
            className={
              api.responseTime > 500
                ? "text-red-400"
                : api.responseTime > 300
                  ? "text-amber-400"
                  : "text-green-400"
            }
          >
            {api.responseTime}ms
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Last Check</span>
          <span className="text-slate-500 text-[10px]">
            {formatTime(api.lastCheck)}
          </span>
        </div>
      </div>
    </div>
  )
}

// Component Detail View
function ComponentDetailView({ component }: { component: SystemComponent }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "from-green-500 to-emerald-500"
      case "warning":
        return "from-amber-500 to-orange-500"
      case "error":
        return "from-red-500 to-rose-500"
      default:
        return "from-slate-500 to-slate-600"
    }
  }

  const getComponentIcon = (id: ComponentType) => {
    switch (id) {
      case "cloudflare":
        return <Cloud className="h-8 w-8" />
      case "frontend":
        return <Globe className="h-8 w-8" />
      case "backend":
        return <Server className="h-8 w-8" />
      case "cache":
        return <Zap className="h-8 w-8" />
      case "openstack":
        return <Cloud className="h-8 w-8" />
      case "database":
        return <Database className="h-8 w-8" />
      default:
        return <Activity className="h-8 w-8" />
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-700/50">
        <div className="flex items-center space-x-4">
          <div
            className={`p-3 rounded-lg bg-gradient-to-br ${getStatusColor(component.status)}`}
          >
            {getComponentIcon(component.id)}
          </div>
          <div>
            <div className="text-xl font-bold text-slate-200">{component.name}</div>
            <div className="text-sm text-slate-400">ID: {component.id}</div>
          </div>
        </div>
        <Badge
          className={`${
            component.status === "healthy"
              ? "bg-green-500/20 border-green-500/50 text-green-400"
              : component.status === "warning"
                ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                : "bg-red-500/20 border-red-500/50 text-red-400"
          }`}
        >
          {component.status === "healthy" ? "Healthy" : component.status === "warning" ? "Warning" : "Error"}
        </Badge>
      </div>

      {/* Backend-specific tabs */}
      {component.id === "backend" && component.details && "availability24h" in component.details && (
        <BackendTabsView details={component.details as BackendDetails} />
      )}

      {/* Database-specific tabs */}
      {component.id === "database" && component.details && "engine" in component.details && (() => {
        const dbDetails = component.details as DatabaseDetails
        return (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="bg-slate-800/50 p-1">
              <TabsTrigger
                value="overview"
                className="data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="replication"
                className="data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400"
              >
                Replication
              </TabsTrigger>
              <TabsTrigger
                value="backups"
                className="data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400"
              >
                Backups
              </TabsTrigger>
              <TabsTrigger
                value="storage"
                className="data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400"
              >
                Storage
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <MiniStat
                  label="Engine"
                  value={`${dbDetails.engine}${dbDetails.version ? ` ${dbDetails.version}` : ""}`}
                />
                <MiniStat label="p95 Query" value={`${dbDetails.p95QueryMs ?? "—"} ms`} />
                <MiniStat
                  label="Connections"
                  value={`${dbDetails.connectionsUsed ?? "—"}/${dbDetails.connectionsMax ?? "—"}`}
                />
              </div>
            </TabsContent>

            <TabsContent value="replication" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <MiniStat
                  label="Replica Ready"
                  value={`${dbDetails.replicaReady}/${dbDetails.replicaCount}`}
                />
                <MiniStat label="Lag" value={`${dbDetails.replicationLagSeconds ?? "—"} s`} />
                <MiniStat label="Role" value={dbDetails.primary ? "Primary" : "Replica"} />
              </div>
            </TabsContent>

            <TabsContent value="backups" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <MiniStat
                  label="Last Backup"
                  value={
                    dbDetails.lastBackupAt
                      ? `${formatDate(dbDetails.lastBackupAt)} ${formatTime(dbDetails.lastBackupAt)}`
                      : "N/A"
                  }
                />
                <MiniStat label="Status" value={dbDetails.lastBackupStatus.toUpperCase()} />
                <MiniStat label="RPO Target" value={`${dbDetails.backupRpoMinutes ?? "—"} min`} />
              </div>
            </TabsContent>

            <TabsContent value="storage" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <MiniStat label="Disk Used" value={`${dbDetails.diskUsedGb ?? "—"} GB`} />
                <MiniStat label="Disk Total" value={`${dbDetails.diskTotalGb ?? "—"} GB`} />
                <MiniStat
                  label="Free"
                  value={
                    dbDetails.diskUsedGb != null && dbDetails.diskTotalGb != null
                      ? `${dbDetails.diskTotalGb - dbDetails.diskUsedGb} GB`
                      : "—"
                  }
                />
              </div>
            </TabsContent>
          </Tabs>
        )
      })()}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <MetricCardDetail
          title="Uptime"
          value={`${component.uptime}%`}
          icon={Activity}
          color="cyan"
        />
        <MetricCardDetail
          title="Response Time"
          value={`${component.responseTime}ms`}
          icon={Zap}
          color="blue"
        />
        <MetricCardDetail
          title="Total Requests"
          value={component.requests.toLocaleString()}
          icon={BarChart3}
          color="purple"
        />
        <MetricCardDetail
          title="Errors"
          value={component.errors.toString()}
          icon={AlertCircle}
          color={component.errors > 20 ? "red" : "amber"}
        />
      </div>

      {/* Resource Usage */}
      <div className="space-y-3">
        <div className="text-sm font-medium text-slate-300 mb-2">Resource Usage</div>
        <div className="space-y-2">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <Cpu className="h-4 w-4 text-cyan-400" />
                <span className="text-sm text-slate-400">CPU Usage</span>
              </div>
              <span className="text-sm font-mono text-cyan-400">{component.cpu.toFixed(1)}%</span>
            </div>
            <Progress value={component.cpu} className="h-2 bg-slate-700">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                style={{ width: `${component.cpu}%` }}
              />
            </Progress>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <HardDrive className="h-4 w-4 text-purple-400" />
                <span className="text-sm text-slate-400">Memory Usage</span>
              </div>
              <span className="text-sm font-mono text-purple-400">{component.memory.toFixed(1)}%</span>
            </div>
            <Progress value={component.memory} className="h-2 bg-slate-700">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                style={{ width: `${component.memory}%` }}
              />
            </Progress>
          </div>
        </div>
      </div>

      {/* Performance Chart */}
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
        <div className="text-sm font-medium text-slate-300 mb-3">Performance Chart (24h)</div>
        <div className="h-32 w-full relative">
          <PerformanceChart />
        </div>
      </div>
    </div>
  )
}

// Service Logs View Component
function ServiceLogsView({
  logs,
  selectedService,
  onServiceChange,
  searchQuery,
  onSearchChange,
}: {
  logs: ServiceLog[]
  selectedService: string
  onServiceChange: (service: string) => void
  searchQuery: string
  onSearchChange: (query: string) => void
}) {
  const logContainerRef = useRef<HTMLDivElement>(null)

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    const matchesService = selectedService === "all" || log.service === selectedService
    const matchesSearch = searchQuery === "" || log.message.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesService && matchesSearch
  })

  // Get unique services
  const services = useMemo(() => {
    const uniqueServices = Array.from(new Set(logs.map((log) => log.service)))
    return ["all", ...uniqueServices]
  }, [logs])

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [filteredLogs])

  const getLevelColor = (level: ServiceLog["level"]) => {
    switch (level) {
      case "error":
        return "text-red-400 bg-red-500/10 border-red-500/30"
      case "warning":
        return "text-amber-400 bg-amber-500/10 border-amber-500/30"
      case "success":
        return "text-green-400 bg-green-500/10 border-green-500/30"
      case "debug":
        return "text-purple-400 bg-purple-500/10 border-purple-500/30"
      case "info":
      default:
        return "text-blue-400 bg-blue-500/10 border-blue-500/30"
    }
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-slate-800/50 border border-slate-700/50 rounded-md pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {services.map((service) => (
            <Button
              key={service}
              variant={selectedService === service ? "default" : "outline"}
              size="sm"
              onClick={() => onServiceChange(service)}
              className={
                selectedService === service
                  ? "bg-cyan-600 hover:bg-cyan-700 text-white text-xs h-7"
                  : "border-slate-700 text-slate-300 hover:bg-slate-800 text-xs h-7"
              }
            >
              {service === "all" ? "All Services" : service}
            </Button>
          ))}
        </div>
      </div>

      {/* Logs Container */}
      <div
        ref={logContainerRef}
        className="bg-slate-950/50 rounded-lg border border-slate-700/50 h-[500px] lg:h-[600px] overflow-y-auto font-mono text-xs"
      >
        <div className="p-3 space-y-1">
          {filteredLogs.length === 0 ? (
            <div className="text-center text-slate-500 py-8">No logs found</div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-3 p-2 rounded hover:bg-slate-800/30 transition-colors border-l-2 border-transparent hover:border-slate-700/50"
              >
                <div className="flex-shrink-0 w-20 text-slate-500 text-[10px] mt-0.5">
                  {formatTime(log.timestamp)}
                </div>
                <Badge
                  className={`${getLevelColor(log.level)} text-[10px] px-1.5 py-0.5 h-5 flex-shrink-0`}
                >
                  {log.level.toUpperCase()}
                </Badge>
                <div className="flex-shrink-0 w-24 text-slate-400 font-semibold text-[10px]">
                  {log.service}
                </div>
                <div className="flex-1 text-slate-300 text-[11px] break-words">{log.message}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Log Stats */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <div>
          Showing {filteredLogs.length} of {logs.length} logs
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-blue-500"></div>
            <span>Info</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-green-500"></div>
            <span>Success</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-amber-500"></div>
            <span>Warning</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-red-500"></div>
            <span>Error</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-purple-500"></div>
            <span>Debug</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Metric Card Detail Component
function MetricCardDetail({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string
  value: string
  icon: LucideIcon
  color: string
}) {
  const getColor = () => {
    switch (color) {
      case "cyan":
        return "from-cyan-500 to-blue-500 border-cyan-500/30"
      case "green":
        return "from-green-500 to-emerald-500 border-green-500/30"
      case "blue":
        return "from-blue-500 to-indigo-500 border-blue-500/30"
      case "purple":
        return "from-purple-500 to-pink-500 border-purple-500/30"
      case "amber":
        return "from-amber-500 to-orange-500 border-amber-500/30"
      case "red":
        return "from-red-500 to-rose-500 border-red-500/30"
      default:
        return "from-cyan-500 to-blue-500 border-cyan-500/30"
    }
  }

  return (
    <div className={`bg-slate-800/50 rounded-lg border ${getColor()} p-4`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-slate-400">{title}</div>
        <Icon className={`h-5 w-5 text-${color}-400`} />
      </div>
      <div className="text-2xl font-bold bg-gradient-to-r bg-clip-text text-transparent from-slate-100 to-slate-300">
        {value}
      </div>
    </div>
  )
}

// Backend Tabs View Component
function BackendTabsView({ details }: { details: BackendDetails }) {
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="bg-slate-800/50 p-1 flex-wrap">
        <TabsTrigger
          value="overview"
          className="data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400 text-xs"
        >
          Overview
        </TabsTrigger>
        <TabsTrigger
          value="traffic"
          className="data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400 text-xs"
        >
          Traffic
        </TabsTrigger>
        <TabsTrigger
          value="errors"
          className="data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400 text-xs"
        >
          Errors
        </TabsTrigger>
        <TabsTrigger
          value="latency"
          className="data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400 text-xs"
        >
          Latency
        </TabsTrigger>
        <TabsTrigger
          value="slo"
          className="data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400 text-xs"
        >
          SLO
        </TabsTrigger>
        <TabsTrigger
          value="stability"
          className="data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400 text-xs"
        >
          Stability
        </TabsTrigger>
        <TabsTrigger
          value="offenders"
          className="data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400 text-xs"
        >
          Top Offenders
        </TabsTrigger>
        <TabsTrigger
          value="status"
          className="data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400 text-xs"
        >
          Status
        </TabsTrigger>
      </TabsList>

      {/* Overview / Health */}
      <TabsContent value="overview" className="mt-4">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <MiniStat label="Service Status" value={details.availability24h >= 99.5 ? "Healthy" : "Degraded"} />
            <MiniStat label="Availability (24h)" value={`${details.availability24h.toFixed(2)}%`} />
            <MiniStat label="Downtime Events (24h)" value={details.downtimeEvents24h.toString()} />
          </div>
        </div>
      </TabsContent>

      {/* Traffic / Load */}
      <TabsContent value="traffic" className="mt-4">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <MiniStat label="Requests per Second" value={details.requestsPerSecond.toFixed(1)} />
          </div>
          <div>
            <div className="text-sm font-medium text-slate-300 mb-2">RPS by Route</div>
            <div className="space-y-2">
              {details.rpsByRoute.map((item, idx) => (
                <div key={idx} className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-mono">{item.route}</span>
                    <span className="text-sm font-mono text-cyan-400">{item.rps.toFixed(1)} RPS</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-slate-300 mb-2">RPS by Method</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {details.rpsByMethod.map((item, idx) => (
                <MiniStat key={idx} label={item.method} value={item.rps.toFixed(1)} />
              ))}
            </div>
          </div>
        </div>
      </TabsContent>

      {/* Errors / Reliability */}
      <TabsContent value="errors" className="mt-4">
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStat label="5xx Error Rate" value={`${details.errorRate5xx.toFixed(2)}%`} />
            <MiniStat label="5xx Errors/sec" value={details.errors5xxPerSecond.toFixed(3)} />
            <MiniStat label="4xx Error Rate" value={`${details.errorRate4xx.toFixed(2)}%`} />
            <MiniStat label="Success Rate" value={`${details.successRate.toFixed(2)}%`} />
          </div>
          <div>
            <div className="text-sm font-medium text-slate-300 mb-2">Top Routes by 5xx Errors</div>
            <div className="space-y-2">
              {details.topRoutesBy5xxErrors.map((item, idx) => (
                <div key={idx} className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-mono">{item.route}</span>
                    <span className="text-sm font-mono text-red-400">{item.errors} errors</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </TabsContent>

      {/* User Latency / Experience */}
      <TabsContent value="latency" className="mt-4">
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStat label="Latency p50" value={`${details.latencyP50}ms`} />
            <MiniStat label="Latency p95" value={`${details.latencyP95}ms`} />
            <MiniStat label="Latency p99" value={`${details.latencyP99}ms`} />
            <MiniStat label="Avg Response" value={`${details.averageResponseTime}ms`} />
          </div>
          <div>
            <div className="text-sm font-medium text-slate-300 mb-2">Top Routes by p95 Latency</div>
            <div className="space-y-2">
              {details.topRoutesByP95Latency.map((item, idx) => (
                <div key={idx} className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-mono">{item.route}</span>
                    <span className="text-sm font-mono text-amber-400">{item.latency}ms</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </TabsContent>

      {/* SLO / User Stability */}
      <TabsContent value="slo" className="mt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <MiniStat label="Requests < 300ms (SLO)" value={`${details.requestsUnder300ms.toFixed(1)}%`} />
          <MiniStat label="Requests < 1s (SLO)" value={`${details.requestsUnder1s.toFixed(1)}%`} />
        </div>
      </TabsContent>

      {/* Stability / Anomaly Detection */}
      <TabsContent value="stability" className="mt-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <MiniStat label="Traffic Spike Ratio" value={details.trafficSpikeRatio.toFixed(2)} />
          <MiniStat label="Error Rate Spike" value={details.errorRateSpikeRatio.toFixed(2)} />
          <MiniStat label="Latency Spike (p95)" value={details.latencySpikeRatio.toFixed(2)} />
        </div>
      </TabsContent>

      {/* Top Offenders */}
      <TabsContent value="offenders" className="mt-4">
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium text-slate-300 mb-2">Top Routes by Traffic</div>
            <div className="space-y-2">
              {details.topRoutesByTraffic.map((item, idx) => (
                <div key={idx} className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-mono">{item.route}</span>
                    <span className="text-sm font-mono text-cyan-400">{item.requests.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-slate-300 mb-2">Top Routes by Errors (5xx)</div>
            <div className="space-y-2">
              {details.topRoutesByErrors.map((item, idx) => (
                <div key={idx} className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-mono">{item.route}</span>
                    <span className="text-sm font-mono text-red-400">{item.errors} errors</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-slate-300 mb-2">Top Routes by Latency (p95)</div>
            <div className="space-y-2">
              {details.topRoutesByLatency.map((item, idx) => (
                <div key={idx} className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-mono">{item.route}</span>
                    <span className="text-sm font-mono text-amber-400">{item.latency}ms</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </TabsContent>

      {/* Status Page (Exec Summary) */}
      <TabsContent value="status" className="mt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <MiniStat label="Availability (24h)" value={`${details.availability24hStatus.toFixed(2)}%`} />
          <MiniStat label="5xx Error Rate" value={`${details.errorRate5xxStatus.toFixed(2)}%`} />
        </div>
      </TabsContent>
    </Tabs>
  )
}

// Mini Stat Component
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-sm font-mono text-slate-200">{value}</div>
    </div>
  )
}
