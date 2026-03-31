import { useAuth } from "@clerk/clerk-react"
import { Navigate, useLocation } from "react-router-dom"

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isLoaded, isSignedIn } = useAuth()
  const location = useLocation()

  if (!isLoaded) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (!isSignedIn) {
    const returnUrl = location.pathname + location.search
    return <Navigate to={`/admin/sign-in?returnUrl=${encodeURIComponent(returnUrl)}`} replace />
  }

  return <>{children}</>
}
