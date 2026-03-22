import { useNavigate } from "react-router-dom"
import { Button } from "components"

const CONTRACTOR_PHONE = import.meta.env.VITE_CQ_CONTRACTOR_PHONE as
  | string
  | undefined

export function IntakeConfirmationPage() {
  const navigate = useNavigate()

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
        <h1 className="text-2xl font-semibold">Thank you!</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Your quote request has been received.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/50 p-6 text-left space-y-4 mb-8">
        <h2 className="text-base font-semibold">What happens next</h2>
        <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
          <li>We'll review the details you provided.</li>
          <li>A contractor will reach out within 24 hours to discuss your project.</li>
          <li>We'll schedule a convenient time to visit your site and provide an accurate quote.</li>
        </ol>
      </div>

      {CONTRACTOR_PHONE && (
        <div className="rounded-lg border p-6 mb-8">
          <p className="text-sm text-muted-foreground mb-1">
            Have questions in the meantime? Give us a call:
          </p>
          <a
            href={`tel:${CONTRACTOR_PHONE.replace(/[^\d+]/g, "")}`}
            className="text-lg font-semibold text-primary hover:underline"
          >
            {CONTRACTOR_PHONE}
          </a>
        </div>
      )}

      <Button onClick={() => navigate("/")} className="w-full">
        Return home
      </Button>
    </div>
  )
}
