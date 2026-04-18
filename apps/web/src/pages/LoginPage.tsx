import { SignIn } from "@clerk/clerk-react"

export function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignIn routing="path" path="/login" />
    </div>
  )
}
