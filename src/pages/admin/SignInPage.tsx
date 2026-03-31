import { SignIn } from "@clerk/clerk-react"

export function SignInPage() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <SignIn routing="path" path="/admin/sign-in" forceRedirectUrl="/admin/select" />
    </div>
  )
}
