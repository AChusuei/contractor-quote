import { usePageTitle } from "@/hooks/usePageTitle"
import { useNavigate } from "react-router-dom"
import { Button } from "components"

export function IntakeConfirmationPage() {
  const navigate = useNavigate()

  usePageTitle("Request Confirmed")
  return (
    <div className="max-w-xl mx-auto text-center py-12">
      <div className="mb-8">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-7 w-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold">Request Received</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Your quote request has been submitted successfully.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/50 p-6 text-left space-y-4 mb-8">
        <h2 className="text-base font-semibold">What happens next</h2>
        <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
          <li>We'll review the details you provided.</li>
          <li>A contractor will reach out to discuss your project and schedule a visit.</li>
          <li>Check your email for a tracking link to follow the status of your request.</li>
        </ol>
      </div>

      <Button onClick={() => navigate("/")} className="w-full">
        Return home
      </Button>
    </div>
  )
}
