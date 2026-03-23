import { createMiddleware } from "hono/factory"
import type { Bindings } from "../types"
import type { AuthVariables } from "./auth"
import { apiError } from "../lib/errors"

type TenantEnv = { Bindings: Bindings; Variables: AuthVariables }

// ---------------------------------------------------------------------------
// Quote ownership — verifies :quoteId belongs to the authenticated contractor
// ---------------------------------------------------------------------------
export const requireQuoteOwnership = createMiddleware<TenantEnv>(
  async (c, next) => {
    const quoteId = c.req.param("quoteId")
    if (!quoteId) {
      return apiError(c, "VALIDATION_ERROR", "Missing quote ID")
    }

    const contractorId = c.get("contractorId")
    const row = await c.env.DB.prepare(
      "SELECT contractor_id FROM quotes WHERE id = ?",
    )
      .bind(quoteId)
      .first<{ contractor_id: string }>()

    if (!row) {
      return apiError(c, "NOT_FOUND", "Quote not found")
    }
    if (row.contractor_id !== contractorId) {
      return apiError(c, "FORBIDDEN", "Forbidden")
    }

    await next()
  },
)

// ---------------------------------------------------------------------------
// Contractor self-access — verifies :contractorId matches the authenticated
// contractor (a contractor can only access their own record)
// ---------------------------------------------------------------------------
export const requireSelfContractor = createMiddleware<TenantEnv>(
  async (c, next) => {
    const paramId = c.req.param("contractorId")
    if (!paramId) {
      return apiError(c, "VALIDATION_ERROR", "Missing contractor ID")
    }

    const contractorId = c.get("contractorId")
    if (paramId !== contractorId) {
      return apiError(c, "FORBIDDEN", "Forbidden")
    }

    await next()
  },
)

// ---------------------------------------------------------------------------
// Appointment ownership — verifies :appointmentId belongs to the authenticated
// contractor
// ---------------------------------------------------------------------------
export const requireAppointmentOwnership = createMiddleware<TenantEnv>(
  async (c, next) => {
    const appointmentId = c.req.param("appointmentId")
    if (!appointmentId) {
      return apiError(c, "VALIDATION_ERROR", "Missing appointment ID")
    }

    const contractorId = c.get("contractorId")
    const row = await c.env.DB.prepare(
      "SELECT contractor_id FROM appointments WHERE id = ?",
    )
      .bind(appointmentId)
      .first<{ contractor_id: string }>()

    if (!row) {
      return apiError(c, "NOT_FOUND", "Appointment not found")
    }
    if (row.contractor_id !== contractorId) {
      return apiError(c, "FORBIDDEN", "Forbidden")
    }

    await next()
  },
)
