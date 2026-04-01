export async function insertAuditEvent(
  db: D1Database,
  params: {
    actorEmail: string
    actorType: "super_admin" | "staff" | "system"
    entityType: "staff" | "contractor" | "super_user"
    entityId: string | undefined
    action: "create" | "update" | "delete" | "impersonate"
    details?: Record<string, unknown>
  }
): Promise<void> {
  const id = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO audit_events (id, actor_email, actor_type, entity_type, entity_id, action, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      params.actorEmail,
      params.actorType,
      params.entityType,
      params.entityId,
      params.action,
      params.details ? JSON.stringify(params.details) : null
    )
    .run()
}

export function extractEmailFromJwt(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null
  try {
    const token = authHeader.slice(7)
    const payload = JSON.parse(atob(token.split(".")[1]))
    return payload.email ?? payload.primary_email ?? payload.email_address ?? null
  } catch {
    return null
  }
}
