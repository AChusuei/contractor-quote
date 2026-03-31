import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@clerk/clerk-react"
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
    id: "name",
    accessorKey: "name",
    header: "Name",
    filterMeta: { filterVariant: "text" },
  },
  {
    id: "email",
    accessorKey: "email",
    header: "Email",
    filterMeta: { filterVariant: "text" },
  },
  {
    id: "phone",
    accessorKey: "phone",
    header: "Phone",
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
    formatter: { type: "date" },
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
        enableRowSelection
        bulkActions={[
          {
            label: "Email selected",
            onClick: (selectedCustomers) => {
              const ids = selectedCustomers.map((c) => c.id).join(",")
              navigate(`/admin/email/compose?customerIds=${encodeURIComponent(ids)}`)
            },
          },
        ]}
        refreshSlot={
          <button
            onClick={() => void loadCustomers()}
            className="rounded border border-input bg-background px-3 py-1.5 text-xs hover:bg-accent"
          >
            Refresh
          </button>
        }
      />
    </div>
  )
}
