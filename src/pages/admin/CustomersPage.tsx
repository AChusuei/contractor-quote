import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@clerk/clerk-react"
import { RefreshCw } from "lucide-react"
import { format, formatDistanceToNowStrict } from "date-fns"
import { DataTable, type DataTableColumnDef } from "components"
import { apiGet, isNetworkError, setAuthProvider } from "@/lib/api"
import { useContractorSession } from "@/contexts/ContractorSession"

type Customer = {
  id: string
  name: string
  email: string
  phone: string
  quoteCount: number
  mostRecentQuoteDate: string | null
}

const columns: DataTableColumnDef<Customer>[] = [
  {
    id: "avatar",
    accessorKey: "name",
    header: "",
    cell: ({ getValue }) => {
      const name = String(getValue() ?? "")
      const initials = name
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("")
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
          {initials}
        </div>
      )
    },
    enableSorting: false,
    enableHiding: false,
    size: 48,
  },
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ getValue }) => <span className="font-medium">{String(getValue())}</span>,
    filterMeta: { filterVariant: "text" },
  },
  {
    id: "email",
    accessorKey: "email",
    header: "Email",
    cell: ({ getValue }) => <span className="text-muted-foreground">{String(getValue() ?? "")}</span>,
    filterMeta: { filterVariant: "text" },
  },
  {
    id: "phone",
    accessorKey: "phone",
    header: "Phone",
    cell: ({ getValue }) => <span className="text-muted-foreground">{String(getValue() ?? "")}</span>,
  },
  {
    id: "quoteCount",
    accessorKey: "quoteCount",
    header: "Quotes",
    cell: ({ getValue }) => getValue() as number,
  },
  {
    id: "mostRecentQuoteDate",
    accessorKey: "mostRecentQuoteDate",
    header: "Last Quote",
    cell: ({ getValue }) => {
      const raw = getValue() as string | null
      if (!raw) return <span className="text-muted-foreground">—</span>
      const d = new Date(raw)
      if (isNaN(d.getTime())) return <span className="text-muted-foreground">{raw}</span>
      const label = format(d, "MMM d")
      const relative = formatDistanceToNowStrict(d, { addSuffix: false })
      return (
        <div className="flex flex-col leading-tight">
          <span>{label}</span>
          <span className="text-muted-foreground text-xs">{relative} ago</span>
        </div>
      )
    },
  },
]

type ApiCustomer = Record<string, unknown>

export function CustomersPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const { contractorId } = useContractorSession()
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      setAuthProvider(() => getToken())
    }
  }, [isLoaded, isSignedIn, getToken])

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      navigate("/admin/sign-in", { replace: true })
    }
  }, [isLoaded, isSignedIn, navigate])

  const loadCustomers = useCallback(async () => {
    if (!contractorId) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await apiGet<{ customers: ApiCustomer[]; total: number; page: number }>(
        `/contractors/${encodeURIComponent(contractorId)}/customers?limit=100`
      )
      if (res.ok) {
        const mapped: Customer[] = res.data.customers.map((c) => ({
          id: c.id as string,
          name: c.name as string,
          email: c.email as string,
          phone: c.phone as string,
          quoteCount: (c.quoteCount as number) ?? 0,
          mostRecentQuoteDate: (c.mostRecentQuoteDate as string) ?? null,
        }))
        setCustomers(mapped)
      } else if (isNetworkError(res)) {
        setError("Unable to reach the server. Please try again.")
      } else {
        setError(res.error || "Failed to load customers.")
      }
    } catch {
      setError("Failed to load customers. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }, [contractorId])

  useEffect(() => {
    if (isLoaded && isSignedIn && contractorId) {
      void loadCustomers()
    }
  }, [isLoaded, isSignedIn, contractorId, loadCustomers])

  if (!isLoaded || (!isSignedIn && !error)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading\u2026</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Customers</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All customers with their quote history.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <DataTable
          columns={columns}
          data={customers}
          isLoading={isLoading}
          error={error}
          emptyMessage="No customers yet."
          onRowClick={(row) => navigate(`/admin/customers/${row.id}`)}
          enableGlobalFilter
          enableColumnFilters
          enableSorting
          enablePagination
          defaultPageSize={25}
          refreshSlot={
            <button
              onClick={() => void loadCustomers()}
              className="flex items-center gap-1.5 rounded border border-input bg-background px-2.5 py-1.5 text-xs hover:bg-accent"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
          }
        />
      </div>
    </div>
  )
}
