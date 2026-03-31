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
  draft: "rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700",
  lead: "rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800",
  reviewing: "rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800",
  site_visit_requested: "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800",
  site_visit_scheduled: "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800",
  site_visit_completed: "rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800",
  estimate_requested: "rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800",
  estimate_sent: "rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800",
  accepted: "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800",
  rejected: "rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800",
  closed: "rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500",
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
