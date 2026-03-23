import { Hono } from "hono"
import { cors } from "hono/cors"
import type { AppointmentSlot, ApiOk } from "@contractor-quote/types"
import { apiError } from "./lib/errors"

// ---------------------------------------------------------------------------
// Bindings — mirrors wrangler.toml
// ---------------------------------------------------------------------------
type Bindings = {
  DB: D1Database
  STORAGE: R2Bucket
  TOKENS: KVNamespace
  ENVIRONMENT: string
  CORS_ORIGINS: string
  // Secrets (set via `wrangler secret put`)
  HUBSPOT_ACCESS_TOKEN: string
  TOKEN_SIGNING_SECRET: string
}

const app = new Hono<{ Bindings: Bindings }>().basePath("/api/v1")

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
app.use("*", async (c, next) => {
  const originsRaw = c.env.CORS_ORIGINS ?? "http://localhost:5173"
  const origins = originsRaw.split(",").map((o) => o.trim())
  return cors({
    origin: origins,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })(c, next)
})

// ---------------------------------------------------------------------------
// Global error handler — catches unhandled exceptions
// ---------------------------------------------------------------------------
app.onError((err, c) => {
  console.error("Unhandled error:", err)
  return apiError(c, "INTERNAL_ERROR", "An unexpected error occurred")
})

// ---------------------------------------------------------------------------
// 404 fallback
// ---------------------------------------------------------------------------
app.notFound((c) => {
  return apiError(c, "NOT_FOUND", `Route not found: ${c.req.method} ${c.req.path}`)
})

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get("/health", (c) => {
  const res: ApiOk<{ status: string; env: string }> = {
    ok: true,
    data: { status: "ok", env: c.env.ENVIRONMENT ?? "unknown" },
  }
  return c.json(res)
})

// ---------------------------------------------------------------------------
// Appointment windows (stub — returns mock slots; replace with real logic)
// ---------------------------------------------------------------------------
app.get("/appointment-windows", (c) => {
  const slots: AppointmentSlot[] = generateMockSlots()
  const res: ApiOk<AppointmentSlot[]> = { ok: true, data: slots }
  return c.json(res)
})

export default app

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function generateMockSlots(): AppointmentSlot[] {
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ]

  const slots: AppointmentSlot[] = []
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)

  for (let i = 0; i < 14 && slots.length < 10; i++) {
    const date = new Date(tomorrow)
    date.setDate(tomorrow.getDate() + i)
    const dow = date.getDay()
    if (dow === 0) continue // skip Sundays

    const dayLabel = `${DAYS[dow]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`
    const dateStr = date.toISOString().slice(0, 10)

    slots.push({
      id: `${dateStr}-morning`,
      label: `${dayLabel} · Morning (9am – 12pm)`,
      startAt: `${dateStr}T09:00:00`,
      endAt: `${dateStr}T12:00:00`,
    })

    if (slots.length < 10 && dow >= 1 && dow <= 5) {
      slots.push({
        id: `${dateStr}-afternoon`,
        label: `${dayLabel} · Afternoon (1pm – 5pm)`,
        startAt: `${dateStr}T13:00:00`,
        endAt: `${dateStr}T17:00:00`,
      })
    }
  }

  return slots
}
