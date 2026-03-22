import { useNavigate } from "react-router-dom"
import { Button } from "components"
import { cn } from "@/lib/utils"
import { attachQuotePath } from "@/lib/quoteStore"

export type QuotePath = "site_visit" | "estimate_requested"

const QUOTE_PATH_KEY = "cq_quote_path"

export function saveQuotePath(path: QuotePath): void {
  sessionStorage.setItem(QUOTE_PATH_KEY, path)
}

export function getQuotePath(): QuotePath | null {
  const v = sessionStorage.getItem(QUOTE_PATH_KEY)
  return v === "site_visit" || v === "estimate_requested" ? v : null
}

export function IntakeChoicePage() {
  const navigate = useNavigate()

  const handleSiteVisit = () => {
    saveQuotePath("site_visit")
    attachQuotePath("site_visit")
    navigate("/intake/appointment")
  }

  const handleEstimate = () => {
    saveQuotePath("estimate_requested")
    attachQuotePath("estimate_requested")
    navigate("/intake/estimate")
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Step 4 of 4</p>
        <h1 className="text-2xl font-semibold">How would you like to proceed?</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Choose how you'd like to move forward with your kitchen project.
        </p>
      </div>

      <div className="space-y-4">
        <button
          type="button"
          onClick={handleSiteVisit}
          className={cn(
            "w-full text-left rounded-lg border-2 p-5 transition-colors",
            "border-input bg-background hover:border-primary hover:bg-primary/5",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          <p className="text-base font-semibold">Schedule a site visit</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pay a small deposit to book an on-site measurement and consultation. We'll
            give you a precise, itemized quote after seeing your space in person.
          </p>
        </button>

        <button
          type="button"
          onClick={handleEstimate}
          className={cn(
            "w-full text-left rounded-lg border-2 p-5 transition-colors",
            "border-input bg-background hover:border-primary hover:bg-primary/5",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          <p className="text-base font-semibold">Get a rough estimate</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Receive a ballpark range based on the information you've provided — no
            commitment required. We'll follow up to refine the estimate when you're ready.
          </p>
        </button>

        <p className="text-xs text-muted-foreground text-center pt-2">
          You can always change your mind later.
        </p>
      </div>

      <div className="mt-6">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="w-full"
        >
          Back
        </Button>
      </div>
    </div>
  )
}
