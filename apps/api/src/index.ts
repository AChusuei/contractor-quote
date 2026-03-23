import { Hono } from "hono"
import { cors } from "hono/cors"
import type { AppointmentSlot, ApiOk } from "@contractor-quote/types"
import { apiError } from "./lib/errors"
import type { Bindings } from "./types"
import type { AuthVariables } from "./middleware/auth"
import { authMiddleware } from "./middleware/auth"
import {
  requireQuoteOwnership,
  requireSelfContractor,
  requireAppointmentOwnership,
} from "./middleware/tenant"

// ---------------------------------------------------------------------------
// App type — shared across all route groups
// ---------------------------------------------------------------------------
type AppEnv = { Bindings: Bindings; Variables: AuthVariables }

const app = new Hono<AppEnv>().basePath("/api/v1")

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
// Public routes (no auth required)
// ---------------------------------------------------------------------------
app.get("/health", (c) => {
  const res: ApiOk<{ status: string; env: string }> = {
    ok: true,
    data: { status: "ok", env: c.env.ENVIRONMENT ?? "unknown" },
  }
  return c.json(res)
})

app.get("/appointment-windows", (c) => {
  const slots: AppointmentSlot[] = generateMockSlots()
  const res: ApiOk<AppointmentSlot[]> = { ok: true, data: slots }
  return c.json(res)
})

// ---------------------------------------------------------------------------
// Public intake — unauthenticated quote submission
// POST /contractors/:contractorId/quotes
// ---------------------------------------------------------------------------
app.post("/contractors/:contractorId/quotes", async (c) => {
  // Public intake endpoint — no auth required
  // Route handler will be implemented in a separate bead
  return c.json({ ok: false, error: "Not implemented", code: "INTERNAL_ERROR" as const }, 501)
})

// ---------------------------------------------------------------------------
// Authenticated route groups — each group applies auth + tenant middleware
// Uses Hono sub-apps to keep public intake route outside the auth boundary.
// ---------------------------------------------------------------------------

// --- Quotes (auth + ownership) ---
const quotes = new Hono<AppEnv>()
quotes.use("*", authMiddleware)
quotes.use("/:quoteId", requireQuoteOwnership)
quotes.use("/:quoteId/*", requireQuoteOwnership)

quotes.get("/:quoteId", async (c) => {
  return apiError(c, "INTERNAL_ERROR", "Not implemented")
})
quotes.patch("/:quoteId", async (c) => {
  return apiError(c, "INTERNAL_ERROR", "Not implemented")
})
quotes.delete("/:quoteId", async (c) => {
  return apiError(c, "INTERNAL_ERROR", "Not implemented")
})
quotes.post("/:quoteId/status", async (c) => {
  return apiError(c, "INTERNAL_ERROR", "Not implemented")
})
quotes.get("/:quoteId/photos", async (c) => {
  return apiError(c, "INTERNAL_ERROR", "Not implemented")
})
quotes.post("/:quoteId/photos", async (c) => {
  return apiError(c, "INTERNAL_ERROR", "Not implemented")
})
quotes.delete("/:quoteId/photos/:photoId", async (c) => {
  return apiError(c, "INTERNAL_ERROR", "Not implemented")
})

app.route("/quotes", quotes)

// --- Contractors (auth + self-access, EXCLUDING public intake) ---
const contractors = new Hono<AppEnv>()
contractors.use("*", authMiddleware)
contractors.use("/:contractorId", requireSelfContractor)
contractors.use("/:contractorId/*", requireSelfContractor)

contractors.get("/:contractorId", async (c) => {
  return apiError(c, "INTERNAL_ERROR", "Not implemented")
})
contractors.patch("/:contractorId", async (c) => {
  return apiError(c, "INTERNAL_ERROR", "Not implemented")
})

app.route("/contractors", contractors)

// --- Appointments (auth + ownership) ---
const appointments = new Hono<AppEnv>()
appointments.use("*", authMiddleware)
appointments.use("/:appointmentId", requireAppointmentOwnership)
appointments.use("/:appointmentId/*", requireAppointmentOwnership)

appointments.get("/:appointmentId", async (c) => {
  return apiError(c, "INTERNAL_ERROR", "Not implemented")
})
appointments.patch("/:appointmentId", async (c) => {
  return apiError(c, "INTERNAL_ERROR", "Not implemented")
})
appointments.delete("/:appointmentId", async (c) => {
  return apiError(c, "INTERNAL_ERROR", "Not implemented")
})

app.route("/appointments", appointments)

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
