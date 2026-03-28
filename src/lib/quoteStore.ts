/**
 * Quote store — persists quote data to localStorage.
 * Used by the intake flow (to save leads) and the admin portal (to read/update).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QuoteStatus =
  | "draft"
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
    status: "draft",
    statusHistory: [{ status: "draft", timestamp: new Date().toISOString() }],
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

/** Update lead/scope fields on a quote (for admin edits). */
export function updateQuote(
  id: string,
  updates: Partial<Omit<Quote, "id" | "createdAt" | "status" | "statusHistory" | "contractorNotes">>
): void {
  const all = readAll()
  const idx = all.findIndex((q) => q.id === id)
  if (idx === -1) return
  all[idx] = { ...all[idx], ...updates }
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

/** Seed localStorage with realistic mock quotes for dev. Idempotent. */
export function seedMockQuotes(): void {
  if (readAll().length > 0) return
  const mocks: Quote[] = [
    {
      id: "q-001",
      createdAt: "2026-03-22T14:30:00Z",
      name: "Maria Santos",
      email: "maria.santos@example.com",
      phone: "(404) 555-1234",
      cell: "(404) 555-5678",
      jobSiteAddress: "842 Peachtree St NE, Atlanta, GA 30308",
      propertyType: "house",
      budgetRange: "25-50k",
      howDidYouFindUs: "referral",
      referredByContractor: "Mike's Contracting",
      scope: {
        scopeType: "supply_install",
        layoutChanges: "yes",
        kitchenSize: "large",
        cabinets: "new",
        cabinetDoorStyle: "shaker",
        countertopMaterial: "quartz",
        countertopEdge: "eased",
        sinkType: "undermount",
        backsplash: "yes",
        flooringAction: "replace",
        flooringType: "lvp",
        applianceFridge: "new",
        applianceRange: "new",
        applianceDishwasher: "existing",
        applianceHood: "new",
        applianceMicrowave: "existing",
        islandPeninsula: "island",
        designHelp: "yes",
        additionalNotes: "Want to open up the wall between kitchen and dining room.",
      },
      quotePath: "site_visit",
      status: "measure_scheduled",
      statusHistory: [
        { status: "lead", timestamp: "2026-03-22T14:30:00Z" },
        { status: "measure_scheduled", timestamp: "2026-03-22T16:00:00Z" },
      ],
      contractorNotes: "Large kitchen, load-bearing wall — need structural engineer consult.",
    },
    {
      id: "q-002",
      createdAt: "2026-03-21T10:15:00Z",
      name: "James Okafor",
      email: "james.okafor@example.com",
      phone: "(404) 555-9012",
      jobSiteAddress: "315 Spring St NW, Atlanta, GA 30303",
      propertyType: "apt",
      budgetRange: "10-25k",
      howDidYouFindUs: "google",
      scope: {
        scopeType: "supply_only",
        layoutChanges: "no",
        kitchenSize: "medium",
        cabinets: "reface",
        cabinetDoorStyle: "flat_panel",
        countertopMaterial: "laminate",
        countertopEdge: "bullnose",
        sinkType: "drop_in",
        backsplash: "undecided",
        flooringAction: "keep",
        applianceFridge: "existing",
        applianceRange: "existing",
        applianceDishwasher: "existing",
        applianceHood: "none",
        applianceMicrowave: "existing",
        islandPeninsula: "none",
        designHelp: "no",
      },
      quotePath: "estimate_requested",
      status: "quoted",
      statusHistory: [
        { status: "lead", timestamp: "2026-03-21T10:15:00Z" },
        { status: "quoted", timestamp: "2026-03-21T18:00:00Z" },
      ],
      contractorNotes: "",
    },
    {
      id: "q-003",
      createdAt: "2026-03-20T16:45:00Z",
      name: "Priya Nair",
      email: "priya.nair@example.com",
      phone: "(404) 555-3456",
      jobSiteAddress: "1080 Cascade Ave SW, Atlanta, GA 30311",
      propertyType: "townhouse",
      budgetRange: "50k+",
      howDidYouFindUs: "social_media",
      scope: {
        scopeType: "supply_install",
        layoutChanges: "yes",
        kitchenSize: "open_concept",
        cabinets: "new",
        cabinetDoorStyle: "shaker",
        countertopMaterial: "granite",
        countertopEdge: "ogee",
        sinkType: "farmhouse",
        backsplash: "yes",
        flooringAction: "replace",
        flooringType: "hardwood",
        applianceFridge: "new",
        applianceRange: "new",
        applianceDishwasher: "new",
        applianceHood: "new",
        applianceMicrowave: "new",
        islandPeninsula: "both",
        designHelp: "yes",
        additionalNotes: "Full gut renovation. Moving gas line for range relocation.",
      },
      quotePath: "site_visit",
      status: "lead",
      statusHistory: [
        { status: "lead", timestamp: "2026-03-20T16:45:00Z" },
      ],
      contractorNotes: "",
    },
  ]
  writeAll(mocks)
}
