/**
 * Status transition map — synced with apps/api/src/validation.ts.
 * The frontend uses this to show only valid next statuses in the admin panel.
 */

export const QUOTE_STATUSES = [
  "draft",
  "lead",
  "reviewing",
  "site_visit_requested",
  "site_visit_scheduled",
  "site_visit_completed",
  "estimate_requested",
  "estimate_sent",
  "accepted",
  "rejected",
  "closed",
] as const

export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

export const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Draft",
  lead: "Lead",
  reviewing: "Reviewing",
  site_visit_requested: "Site visit requested",
  site_visit_scheduled: "Site visit scheduled",
  site_visit_completed: "Site visit completed",
  estimate_requested: "Estimate requested",
  estimate_sent: "Estimate sent",
  accepted: "Accepted",
  rejected: "Rejected",
  closed: "Closed",
}

export const STATUS_COLORS: Record<QuoteStatus, string> = {
  draft: "text-slate-500",
  lead: "text-blue-600 dark:text-blue-400",
  reviewing: "text-indigo-600 dark:text-indigo-400",
  site_visit_requested: "text-amber-600 dark:text-amber-400",
  site_visit_scheduled: "text-amber-600 dark:text-amber-400",
  site_visit_completed: "text-teal-600 dark:text-teal-400",
  estimate_requested: "text-purple-600 dark:text-purple-400",
  estimate_sent: "text-purple-600 dark:text-purple-400",
  accepted: "text-emerald-600 dark:text-emerald-400",
  rejected: "text-red-600 dark:text-red-400",
  closed: "text-gray-400 dark:text-gray-500",
}

/**
 * Valid status transitions. Each key lists the statuses it can move TO.
 * Must stay in sync with STATUS_TRANSITIONS in apps/api/src/validation.ts.
 */
export const STATUS_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  draft: ["lead", "closed"],
  lead: ["reviewing", "closed"],
  reviewing: ["site_visit_requested", "estimate_requested", "closed"],
  site_visit_requested: ["site_visit_scheduled", "closed"],
  site_visit_scheduled: ["site_visit_completed", "closed"],
  site_visit_completed: ["estimate_requested", "closed"],
  estimate_requested: ["estimate_sent", "closed"],
  estimate_sent: ["accepted", "rejected", "closed"],
  accepted: ["closed"],
  rejected: ["reviewing", "closed"],
  closed: ["reviewing"],
}

/** Statuses that require a confirmation dialog before transitioning. */
export const CONFIRMATION_STATUSES: ReadonlySet<QuoteStatus> = new Set(["closed", "rejected"])

/** Returns the "happy path" transitions (non-close, non-reject). */
export function getHappyPathTransitions(current: QuoteStatus): QuoteStatus[] {
  return (STATUS_TRANSITIONS[current] ?? []).filter(
    (s) => s !== "closed" && s !== "rejected"
  )
}

/** Returns the secondary transitions (close, reject). */
export function getSecondaryTransitions(current: QuoteStatus): QuoteStatus[] {
  return (STATUS_TRANSITIONS[current] ?? []).filter(
    (s) => s === "closed" || s === "rejected"
  )
}
