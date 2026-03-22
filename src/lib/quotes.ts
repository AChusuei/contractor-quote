// Quotes service — fetches incoming quote leads for the admin portal.
// Controlled by VITE_CQ_QUOTES_API env var.
// When unset, returns mock data for local development.

const API_BASE = import.meta.env.VITE_CQ_QUOTES_API as string | undefined

export type QuoteStatus =
  | "lead"
  | "draft"
  | "submitted"
  | "measure_scheduled"

export type ScopeType = "supply_only" | "supply_install"

export type KitchenSize = "small" | "medium" | "large" | "open_concept"

export type BudgetRange = "<10k" | "10-25k" | "25-50k" | "50k+"

export type PropertyType = "house" | "apt" | "building" | "townhouse"

export interface Quote {
  id: string
  customerName: string
  address: string
  propertyType: PropertyType
  budgetRange: BudgetRange
  scopeType: ScopeType
  layoutChanges: boolean
  kitchenSize: KitchenSize
  submittedAt: string // ISO 8601
  status: QuoteStatus
}

function generateMockQuotes(): Quote[] {
  return [
    {
      id: "q-001",
      customerName: "Maria Santos",
      address: "842 Peachtree St NE, Atlanta, GA 30308",
      propertyType: "house",
      budgetRange: "25-50k",
      scopeType: "supply_install",
      layoutChanges: true,
      kitchenSize: "large",
      submittedAt: "2026-03-22T14:30:00Z",
      status: "submitted",
    },
    {
      id: "q-002",
      customerName: "James Okafor",
      address: "315 Spring St NW, Atlanta, GA 30303",
      propertyType: "apt",
      budgetRange: "10-25k",
      scopeType: "supply_only",
      layoutChanges: false,
      kitchenSize: "medium",
      submittedAt: "2026-03-21T10:15:00Z",
      status: "measure_scheduled",
    },
    {
      id: "q-003",
      customerName: "Priya Nair",
      address: "1080 Cascade Ave SW, Atlanta, GA 30311",
      propertyType: "building",
      budgetRange: "50k+",
      scopeType: "supply_install",
      layoutChanges: true,
      kitchenSize: "open_concept",
      submittedAt: "2026-03-20T16:45:00Z",
      status: "lead",
    },
    {
      id: "q-004",
      customerName: "Derek Williams",
      address: "520 Edgewood Ave SE, Atlanta, GA 30312",
      propertyType: "townhouse",
      budgetRange: "<10k",
      scopeType: "supply_only",
      layoutChanges: false,
      kitchenSize: "small",
      submittedAt: "2026-03-19T09:00:00Z",
      status: "draft",
    },
    {
      id: "q-005",
      customerName: "Angela Kim",
      address: "2200 Peachtree Rd NW, Atlanta, GA 30309",
      propertyType: "house",
      budgetRange: "25-50k",
      scopeType: "supply_install",
      layoutChanges: false,
      kitchenSize: "medium",
      submittedAt: "2026-03-18T13:20:00Z",
      status: "submitted",
    },
    {
      id: "q-006",
      customerName: "Robert Chen",
      address: "740 Ralph McGill Blvd NE, Atlanta, GA 30312",
      propertyType: "apt",
      budgetRange: "10-25k",
      scopeType: "supply_only",
      layoutChanges: false,
      kitchenSize: "small",
      submittedAt: "2026-03-17T11:05:00Z",
      status: "measure_scheduled",
    },
    {
      id: "q-007",
      customerName: "Fatima Hassan",
      address: "1560 Metropolitan Pkwy SW, Atlanta, GA 30310",
      propertyType: "building",
      budgetRange: "50k+",
      scopeType: "supply_install",
      layoutChanges: true,
      kitchenSize: "large",
      submittedAt: "2026-03-16T15:30:00Z",
      status: "lead",
    },
  ]
}

export async function fetchQuotes(): Promise<Quote[]> {
  if (API_BASE) {
    const res = await fetch(`${API_BASE}/quotes`)
    if (!res.ok) throw new Error(`Failed to fetch quotes: ${res.status}`)
    return res.json() as Promise<Quote[]>
  }

  // Mock: simulate a short network delay
  await new Promise((r) => setTimeout(r, 300))
  return generateMockQuotes()
}
