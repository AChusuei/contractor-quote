import { useNavigate } from "react-router-dom"
import { Button } from "components"

export function IntakeCheckoutPage() {
  const navigate = useNavigate()

  return (
    <div className="max-w-xl mx-auto text-center py-12">
      <div className="mb-6">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Almost there</p>
        <h1 className="text-2xl font-semibold">Site Visit Deposit</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Online payment coming soon. We'll reach out to confirm your appointment and
          collect the deposit directly.
        </p>
      </div>

      <Button onClick={() => navigate("/")} className="w-full">
        Return home
      </Button>
    </div>
  )
}
