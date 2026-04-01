import { SignIn } from "@clerk/clerk-react"
import { useEffect } from "react"
import { useSearchParams } from "react-router-dom"

export function SignInPage() {
  useEffect(() => {
    sessionStorage.removeItem("cq_super_contractor_id")
    sessionStorage.removeItem("cq_super_contractor_name")
  }, [])

  const [searchParams] = useSearchParams()
  const returnUrl = searchParams.get("returnUrl")
  const redirectUrl = returnUrl
    ? `/admin/redirect?returnUrl=${encodeURIComponent(returnUrl)}`
    : "/admin/redirect"

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <SignIn routing="path" path="/admin/sign-in" forceRedirectUrl={redirectUrl} />
    </div>
  )
}
