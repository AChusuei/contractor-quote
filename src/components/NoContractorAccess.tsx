import { useAuth } from "@clerk/clerk-react"

export function NoContractorAccess() {
  const { signOut } = useAuth()

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="max-w-md text-center space-y-4 px-6">
        <h1 className="text-xl font-semibold text-foreground">No Access</h1>
        <p className="text-muted-foreground">
          Your account is not associated with a contractor on this platform. Please contact your
          administrator to get access.
        </p>
        <button
          onClick={() => signOut()}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}
