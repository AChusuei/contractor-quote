/**
 * Quote store — persists quote data to localStorage.
 * Used by the intake flow (to save leads) and the admin portal (to read/update).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QuoteStatus =
  | "lead"
  | "measure_scheduled"
  | "quoted"
  | "accepted"
  | "rejected"

export type ApplianceChoice = "new" | "existing" | "none"

export type QuoteScope = {
  scopeType: "supply_only" | "supply_install"
  layoutChanges: "yes" | "no"
  kitchenSize: "small" | "medium" | "large" | "open_concept"
  cabinets: "new" | "reface" | "keep"
  cabinetDoorStyle: string
  countertopMaterial: string
  countertopEdge: string
  sinkType: string
  backsplash: "yes" | "no" | "undecided"
  flooringAction: "keep" | "replace"
  flooringType?: string
  applianceFridge: ApplianceChoice
  applianceRange: ApplianceChoice
  applianceDishwasher: ApplianceChoice
  applianceHood: ApplianceChoice
  applianceMicrowave: ApplianceChoice
  islandPeninsula: "island" | "peninsula" | "both" | "none"
  designHelp: "yes" | "no"
  additionalNotes?: string
}

export type StatusEvent = {
  status: QuoteStatus
  timestamp: string // ISO 8601
}

export type Quote = {
  id: string
  createdAt: string // ISO 8601
  // Step 1 — lead info
  name: string
  email: string
  phone: string
  cell?: string
  jobSiteAddress: string
  propertyType: "house" | "apt" | "building" | "townhouse"
  budgetRange: "<10k" | "10-25k" | "25-50k" | "50k+"
  howDidYouFindUs: string
  referredByContractor?: string
  // Step 2 — scope (optional, added after step 2)
  scope?: QuoteScope
  // Step 4 — quote path choice
  quotePath?: "site_visit" | "estimate_requested"
  // Storage
  photoSessionId?: string
  // Admin-managed fields
  status: QuoteStatus
  statusHistory: StatusEvent[]
  contractorNotes: string
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const STORE_KEY = "cq_quotes"
const ACTIVE_KEY = "cq_active_quote_id"

function readAll(): Quote[] {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? (JSON.parse(raw) as Quote[]) : []
  } catch {
    return []
  }
}

function writeAll(quotes: Quote[]): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(quotes))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new quote from step-1 lead data. Returns the new quote.
 * Sets the active quote ID for subsequent steps to attach data to.
 */
export function createQuote(
  lead: Omit<Quote, "id" | "createdAt" | "status" | "statusHistory" | "contractorNotes">
): Quote {
  const quote: Quote = {
    ...lead,
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    status: "lead",
    statusHistory: [{ status: "lead", timestamp: new Date().toISOString() }],
    contractorNotes: "",
  }
  const all = readAll()
  all.unshift(quote)
  writeAll(all)
  localStorage.setItem(ACTIVE_KEY, quote.id)
  return quote
}

/** Get the ID of the quote being built in the current intake session. */
export function getActiveQuoteId(): string | null {
  return localStorage.getItem(ACTIVE_KEY)
}

/** Patch the active quote with scope data from step 2. */
export function attachScope(scope: QuoteScope): void {
  const id = getActiveQuoteId()
  if (!id) return
  const all = readAll()
  const idx = all.findIndex((q) => q.id === id)
  if (idx === -1) return
  all[idx] = { ...all[idx], scope }
  writeAll(all)
}

/** Attach the photo session ID to the active quote. */
export function attachPhotoSession(photoSessionId: string): void {
  const id = getActiveQuoteId()
  if (!id) return
  const all = readAll()
  const idx = all.findIndex((q) => q.id === id)
  if (idx === -1) return
  all[idx] = { ...all[idx], photoSessionId }
  writeAll(all)
}

/** Record the quote path chosen in step 4. */
export function attachQuotePath(quotePath: "site_visit" | "estimate_requested"): void {
  const id = getActiveQuoteId()
  if (!id) return
  const all = readAll()
  const idx = all.findIndex((q) => q.id === id)
  if (idx === -1) return
  all[idx] = { ...all[idx], quotePath }
  writeAll(all)
}

/** Return all quotes sorted newest-first. */
export function listQuotes(): Quote[] {
  return readAll()
}

/** Return a single quote by ID, or null. */
export function getQuote(id: string): Quote | null {
  return readAll().find((q) => q.id === id) ?? null
}

/** Update the status of a quote and append to its history. */
export function updateStatus(id: string, status: QuoteStatus): void {
  const all = readAll()
  const idx = all.findIndex((q) => q.id === id)
  if (idx === -1) return
  all[idx] = {
    ...all[idx],
    status,
    statusHistory: [
      ...all[idx].statusHistory,
      { status, timestamp: new Date().toISOString() },
    ],
  }
  writeAll(all)
}

/** Update the contractor notes on a quote. */
export function updateNotes(id: string, notes: string): void {
  const all = readAll()
  const idx = all.findIndex((q) => q.id === id)
  if (idx === -1) return
  all[idx] = { ...all[idx], contractorNotes: notes }
  writeAll(all)
}
