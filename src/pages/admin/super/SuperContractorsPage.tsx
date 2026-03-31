import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@clerk/clerk-react"
import { apiGet, isNetworkError, setAuthProvider } from "@/lib/api"

interface SuperContractor {
  id: string
  slug: string
  name: string
  email: string | null
  staffCount: number
  quoteCount: number
}

export function SuperContractorsPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const navigate = useNavigate()
  const [contractors, setContractors] = useState<SuperContractor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      </div>

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
                <th className="px-4 py-3 text-right font-medium">Staff</th>
                <th className="px-4 py-3 text-right font-medium">Quotes</th>
              </tr>
            </thead>
            <tbody>
              {contractors.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
                  onClick={() => navigate(`/admin/super/contractors/${c.id}`)}
                >
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{c.slug}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.email ?? "—"}</td>
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
