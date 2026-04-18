import { useEffect } from "react"
import { useClerk } from "@clerk/clerk-react"

export function LogoutPage() {
  const { signOut } = useClerk()

  useEffect(() => {
    void signOut({ redirectUrl: "/admin/sign-in" })
  }, [signOut])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Signing out…</p>
    </div>
  )
}
