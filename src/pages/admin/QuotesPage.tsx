import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "@clerk/clerk-react"
import { DataTable, type DataTableColumnDef } from "components"
import { fetchQuotes, type Quote, type QuoteStatus } from "@/lib/quotes"
import { apiGet, isNetworkError, setAuthProvider } from "@/lib/api"

// ─── API quote shape (from backend) ──────────────────────────────────────────

type ApiQuote = Record<string, unknown>

// ─── Status display config ────────────────────────────────────────────────────

const STATUS_CONFIG: Record<QuoteStatus, { label: string; className: string }> = {
  lead: {
    label: "Lead",
    className: "rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800",
  },
  draft: {
    label: "Draft",
    className: "rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700",
  },
  submitted: {
    label: "Submitted",
    className: "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800",
  },
  measure_scheduled: {
    label: "Measure Scheduled",
    className: "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800",
  },
}

const SCOPE_LABELS: Record<string, string> = {
  supply_only: "Supply Only",
  supply_install: "Supply + Install",
}

const KITCHEN_SIZE_LABELS: Record<string, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  open_concept: "Open Concept",
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  house: "House",
  apt: "Apartment",
  building: "Building",
  townhouse: "Townhouse",
}

// ─── Column definitions ───────────────────────────────────────────────────────

const columns: DataTableColumnDef<Quote>[] = [
  {
    id: "customerName",
    accessorKey: "customerName",
    header: "Customer",
    filterMeta: { filterVariant: "text" },
  },
  {
    id: "address",
    accessorKey: "address",
    header: "Address",
    filterMeta: { filterVariant: "text" },
  },
  {
    id: "propertyType",
    accessorKey: "propertyType",
    header: "Property Type",
    cell: ({ getValue }) => PROPERTY_TYPE_LABELS[getValue() as string] ?? String(getValue()),
    filterMeta: {
      filterVariant: "select",
      options: [
        { label: "House", value: "house" },
        { label: "Apartment", value: "apt" },
        { label: "Building", value: "building" },
        { label: "Townhouse", value: "townhouse" },
      ],
    },
  },
  {
    id: "budgetRange",
    accessorKey: "budgetRange",
    header: "Budget",
    filterMeta: {
      filterVariant: "select",
      options: [
        { label: "< $10k", value: "<10k" },
        { label: "$10k – $25k", value: "10-25k" },
        { label: "$25k – $50k", value: "25-50k" },
        { label: "$50k+", value: "50k+" },
      ],
    },
  },
  {
    id: "scopeType",
    accessorKey: "scopeType",
    header: "Scope",
    cell: ({ getValue }) => SCOPE_LABELS[getValue() as string] ?? String(getValue()),
    filterMeta: {
      filterVariant: "select",
      options: [
        { label: "Supply Only", value: "supply_only" },
        { label: "Supply + Install", value: "supply_install" },
      ],
    },
  },
  {
    id: "layoutChanges",
    accessorKey: "layoutChanges",
    header: "Layout Changes",
    cell: ({ getValue }) => (
      <span className={getValue() ? "font-medium text-foreground" : "text-muted-foreground"}>
        {getValue() ? "Yes" : "No"}
      </span>
    ),
    filterMeta: {
      filterVariant: "select",
      options: [
        { label: "Yes", value: "true" },
        { label: "No", value: "false" },
      ],
    },
  },
  {
    id: "kitchenSize",
    accessorKey: "kitchenSize",
    header: "Kitchen Size",
    cell: ({ getValue }) => KITCHEN_SIZE_LABELS[getValue() as string] ?? String(getValue()),
    filterMeta: {
      filterVariant: "select",
      options: [
        { label: "Small", value: "small" },
        { label: "Medium", value: "medium" },
        { label: "Large", value: "large" },
        { label: "Open Concept", value: "open_concept" },
      ],
    },
  },
  {
    id: "submittedAt",
    accessorKey: "submittedAt",
    header: "Submitted",
    formatter: { type: "date" },
    filterMeta: { filterVariant: "dateRange" },
  },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    cell: ({ getValue }) => {
      const status = getValue() as QuoteStatus
      const cfg = STATUS_CONFIG[status]
      return <span className={cfg.className}>{cfg.label}</span>
    },
    filterMeta: {
      filterVariant: "select",
      options: [
        { label: "Lead", value: "lead" },
        { label: "Draft", value: "draft" },
        { label: "Submitted", value: "submitted" },
        { label: "Measure Scheduled", value: "measure_scheduled" },
      ],
    },
  },
  {
    id: "_actions",
    header: "",
    accessorKey: "id",
    cell: ({ getValue }) => (
      <Link
        to={`/admin/quotes/${getValue() as string}`}
        className="text-xs font-medium text-primary hover:underline whitespace-nowrap"
      >
        View →
      </Link>
    ),
  },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export function QuotesPage() {
  const { isLoaded, isSignedIn, getToken, userId } = useAuth()
  const navigate = useNavigate()
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Wire up Clerk auth for API calls
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      setAuthProvider(() => getToken())
    }
  }, [isLoaded, isSignedIn, getToken])

  // Redirect unauthenticated users to sign-in
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      navigate("/admin/sign-in", { replace: true })
    }
  }, [isLoaded, isSignedIn, navigate])

  const loadQuotes = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      // Try API first
      const contractorId = userId ?? "default"
      const res = await apiGet<{ quotes: ApiQuote[]; total: number; page: number }>(
        `/contractors/${encodeURIComponent(contractorId)}/quotes?limit=100`
      )
      if (res.ok) {
        // Map API response to the Quote shape expected by DataTable columns
        const mapped: Quote[] = res.data.quotes.map((q) => ({
          id: q.id as string,
          customerName: q.name as string,
          address: q.jobSiteAddress as string,
          propertyType: q.propertyType as Quote["propertyType"],
          budgetRange: q.budgetRange as Quote["budgetRange"],
          scopeType: (q.scope as Record<string, unknown>)?.scopeType as Quote["scopeType"] ?? "supply_install",
          layoutChanges: (q.scope as Record<string, unknown>)?.layoutChanges === "yes",
          kitchenSize: (q.scope as Record<string, unknown>)?.kitchenSize as Quote["kitchenSize"] ?? "medium",
          submittedAt: q.createdAt as string,
          status: q.status as Quote["status"],
        }))
        setQuotes(mapped)
      } else if (isNetworkError(res)) {
        // Fallback to mock data
        console.warn("API unreachable — falling back to mock quotes")
        const data = await fetchQuotes()
        setQuotes(data)
      } else {
        setError(res.error || "Failed to load quotes.")
      }
    } catch {
      setError("Failed to load quotes. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      void loadQuotes()
    }
  }, [isLoaded, isSignedIn, loadQuotes])

  if (!isLoaded || (!isSignedIn && !error)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Quotes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Incoming quote requests — sorted by most recent.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={quotes}
        isLoading={isLoading}
        error={error}
        emptyMessage="No quotes yet."
        enableGlobalFilter
        enableColumnFilters
        enableSorting
        enablePagination
        defaultPageSize={25}
        enableExport
        exportFilename="quotes"
        enableRowSelection
        bulkActions={[
          {
            label: "Email selected",
            onClick: (selectedQuotes) => {
              const ids = selectedQuotes.map((q) => q.id).join(",")
              navigate(`/admin/email/compose?quoteIds=${encodeURIComponent(ids)}`)
            },
          },
        ]}
        refreshSlot={
          <button
            onClick={() => void loadQuotes()}
            className="rounded border border-input bg-background px-3 py-1.5 text-xs hover:bg-accent"
          >
            Refresh
          </button>
        }
      />
    </div>
  )
}
