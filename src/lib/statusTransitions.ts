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
  draft: "rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-xs font-medium dark:bg-slate-800 dark:text-slate-300",
  lead: "rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-xs font-medium dark:bg-blue-900/40 dark:text-blue-300",
  reviewing: "rounded-full bg-indigo-100 text-indigo-800 px-2 py-0.5 text-xs font-medium dark:bg-indigo-900/40 dark:text-indigo-300",
  site_visit_requested: "rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-medium dark:bg-amber-900/40 dark:text-amber-300",
  site_visit_scheduled: "rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-medium dark:bg-amber-900/40 dark:text-amber-300",
  site_visit_completed: "rounded-full bg-teal-100 text-teal-800 px-2 py-0.5 text-xs font-medium dark:bg-teal-900/40 dark:text-teal-300",
  estimate_requested: "rounded-full bg-purple-100 text-purple-800 px-2 py-0.5 text-xs font-medium dark:bg-purple-900/40 dark:text-purple-300",
  estimate_sent: "rounded-full bg-purple-100 text-purple-800 px-2 py-0.5 text-xs font-medium dark:bg-purple-900/40 dark:text-purple-300",
  accepted: "rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs font-medium dark:bg-emerald-900/40 dark:text-emerald-300",
  rejected: "rounded-full bg-red-100 text-red-800 px-2 py-0.5 text-xs font-medium dark:bg-red-900/40 dark:text-red-300",
  closed: "rounded-full bg-gray-100 text-gray-500 px-2 py-0.5 text-xs font-medium dark:bg-gray-800 dark:text-gray-400",
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
