import type { Context, Next } from "hono"
import { apiError } from "../lib/errors"
import type { StaffRole } from "../validation"

export function requireStaffRole(allowedRoles: StaffRole[]) {
  return async (c: Context, next: Next) => {
    const staffId = (c.get("staffId") as string | null) ?? null

    let role: StaffRole
    if (staffId === null) {
      role = "owner"
    } else {
      const staff = await c.env.DB.prepare(
        "SELECT role FROM staff WHERE id = ? AND active = 1 LIMIT 1"
      )
        .bind(staffId)
        .first<{ role: StaffRole }>()

      if (!staff) {
        return apiError(c, "FORBIDDEN", "Insufficient role permissions")
      }

      role = staff.role
    }

    if (!allowedRoles.includes(role)) {
      return apiError(c, "FORBIDDEN", "Insufficient role permissions")
    }

    await next()
  }
}
