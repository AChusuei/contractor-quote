import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@clerk/clerk-react"
import { Button } from "components"
import { apiGet, setAuthProvider } from "@/lib/api"

interface Contractor {
  id: string
  name: string
  slug: string
}

export function PortalSelectPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const navigate = useNavigate()
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    setAuthProvider(() => getToken())

    // Check if user is a platform admin
    apiGet("/platform/check").then((res) => {
      if (!res.ok) {
        // Not a platform admin — redirect to quotes
        navigate("/admin/quotes", { replace: true })
        return
      }
      setAuthChecked(true)
      // Load contractors
      apiGet<Contractor[]>("/platform/contractors").then((cRes) => {
        if (cRes.ok) {
          setContractors(cRes.data)
        } else {
          setError("Failed to load contractors")
        }
        setLoading(false)
      })
    }).catch(() => {
      navigate("/admin/quotes", { replace: true })
    })
  }, [isLoaded, isSignedIn, getToken, navigate])

  function enterAsContractor(contractor: Contractor) {
    sessionStorage.setItem("cq_super_contractor_id", contractor.id)
    sessionStorage.setItem("cq_super_contractor_name", contractor.name)
    navigate("/admin/quotes", { replace: true })
  }

  if (!isLoaded || !authChecked) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Choose a portal</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Select a context to enter as a super user.
        </p>
      </div>

      {/* Super Admin Portal option */}
      <div className="rounded-lg border border-border p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">Super Admin Portal</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Manage all contractors and platform settings.
            </p>
          </div>
          <Button onClick={() => navigate("/admin/platform")}>Enter</Button>
        </div>
      </div>

      {/* Contractor list */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Enter as contractor
        </h2>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading contractors...</p>
        ) : contractors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contractors found.</p>
        ) : (
          <div className="space-y-2">
            {contractors.map((contractor) => (
              <div
                key={contractor.id}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
              >
                <div>
                  <span className="font-medium">{contractor.name}</span>
                  {contractor.slug && (
                    <span className="ml-2 text-xs text-muted-foreground">{contractor.slug}</span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => enterAsContractor(contractor)}
                >
                  Enter as {contractor.name}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
