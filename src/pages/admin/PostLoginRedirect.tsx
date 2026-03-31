import { useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useAuth } from "@clerk/clerk-react"
import { apiGet, setAuthProvider } from "@/lib/api"

/**
 * Lightweight redirect page after Clerk sign-in.
 * - If returnUrl query param is present, redirect there directly.
 * - Super users → /admin/select (portal switcher)
 * - Regular staff → /admin/quotes (contractor portal)
 */
export function PostLoginRedirect() {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    setAuthProvider(() => getToken())

    const returnUrl = searchParams.get("returnUrl")
    if (returnUrl) {
      navigate(returnUrl, { replace: true })
      return
    }

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
  }, [isLoaded, isSignedIn, getToken, navigate, searchParams])

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  )
}
