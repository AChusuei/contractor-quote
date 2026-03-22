import { useNavigate } from "react-router-dom"
import { Button } from "components"

export function IntakeEstimatePage() {
  const navigate = useNavigate()

  return (
    <div className="max-w-xl mx-auto text-center py-12">
      <div className="mb-6">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Request received</p>
        <h1 className="text-2xl font-semibold">We'll be in touch</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Thanks for submitting your project details. We'll review your information and
          send a rough estimate to your email within 1–2 business days.
        </p>
      </div>

      <Button onClick={() => navigate("/")} className="w-full">
        Return home
      </Button>
    </div>
  )
}
