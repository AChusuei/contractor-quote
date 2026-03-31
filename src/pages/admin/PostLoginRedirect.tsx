import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@clerk/clerk-react"
import { apiGet, setAuthProvider } from "@/lib/api"

/**
 * Lightweight redirect page after Clerk sign-in.
 * - Super users → /admin/select (portal switcher)
 * - Regular staff → /admin/quotes (contractor portal)
 */
export function PostLoginRedirect() {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    setAuthProvider(() => getToken())

    apiGet("/platform/check")
      .then((res) => {
        if (res.ok) {
          navigate("/admin/select", { replace: true })
        } else {
          navigate("/admin/quotes", { replace: true })
        }
      })
      .catch(() => {
        navigate("/admin/quotes", { replace: true })
      })
  }, [isLoaded, isSignedIn, getToken, navigate])

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  )
}
