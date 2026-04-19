import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@clerk/clerk-react"
import { Button } from "components"
import { apiGet, apiPost, isNetworkError, setAuthProvider } from "@/lib/api"

type BillingStatus = "active" | "past_due" | "suspended" | "exempt"

interface SuperContractor {
  id: string
  slug: string
  name: string
  email: string | null
  billingStatus: BillingStatus
  staffCount: number
  quoteCount: number
}

const BILLING_STATUS_BADGE: Record<BillingStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  past_due: { label: "Past due", className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  suspended: { label: "Suspended", className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  exempt: { label: "Exempt", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
}

function BillingStatusBadge({ status }: { status: string }) {
  const badge = BILLING_STATUS_BADGE[status as BillingStatus] ?? BILLING_STATUS_BADGE.active
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
      {badge.label}
    </span>
  )
}

export function SuperContractorsPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const navigate = useNavigate()
  const [contractors, setContractors] = useState<SuperContractor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState("")
  const [addSlug, setAddSlug] = useState("")
  const [addEmail, setAddEmail] = useState("")
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      setAuthProvider(() => getToken())
    }
  }, [isLoaded, isSignedIn, getToken])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await apiGet<SuperContractor[]>("/platform/contractors-extended")
    if (res.ok) {
      setContractors(res.data)
    } else if (isNetworkError(res)) {
      setError("API unreachable. Start the API server with wrangler dev.")
    } else {
      setError((res as { error?: string }).error ?? "Failed to load contractors")
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contractors</h1>
          <p className="text-sm text-muted-foreground">All contractors on the platform</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? "Cancel" : "+ Add Contractor"}
        </Button>
      </div>

      {showAdd && (
        <div className="rounded-lg border bg-background p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Name *</label>
              <input
                type="text"
                value={addName}
                onChange={(e) => {
                  setAddName(e.target.value)
                  setAddSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))
                }}
                placeholder="Central Cabinets"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Slug *</label>
              <input
                type="text"
                value={addSlug}
                onChange={(e) => setAddSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="central-cabinets"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Email</label>
              <input
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          {addError && <p className="text-sm text-destructive">{addError}</p>}
          <Button
            size="sm"
            disabled={adding || !addName.trim() || !addSlug.trim()}
            onClick={async () => {
              setAdding(true)
              setAddError(null)
              const res = await apiPost("/platform/contractors", {
                name: addName.trim(),
                slug: addSlug.trim(),
                email: addEmail.trim() || undefined,
              })
              if (res.ok) {
                setShowAdd(false)
                setAddName("")
                setAddSlug("")
                setAddEmail("")
                void load()
              } else {
                setAddError("error" in res ? res.error : "Failed to create contractor")
              }
              setAdding(false)
            }}
          >
            {adding ? "Creating…" : "Create Contractor"}
          </Button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading contractors...</p>
      ) : contractors.length === 0 ? (
        <p className="text-sm text-muted-foreground">No contractors found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Slug</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Billing</th>
                <th className="px-4 py-3 text-right font-medium">Staff</th>
                <th className="px-4 py-3 text-right font-medium">Quotes</th>
              </tr>
            </thead>
            <tbody>
              {contractors.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
                  onClick={() => navigate(`/admin/contractors/${c.id}`)}
                >
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{c.slug}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <BillingStatusBadge status={c.billingStatus ?? "active"} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.staffCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.quoteCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
