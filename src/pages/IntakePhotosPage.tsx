import { usePageTitle } from "@/hooks/usePageTitle"
import { useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "components"
import { useQuoteContext } from "@/lib/QuoteContext"
import { PhotosForm, type PhotosFormState } from "@/components/forms/PhotosForm"

/** Read quoteId and publicToken from sessionStorage (set during intake step 1). */
function getIntakeAuth(): { quoteId: string | null; publicToken: string | null } {
  return {
    quoteId: sessionStorage.getItem("cq_active_quote_id"),
    publicToken: sessionStorage.getItem("cq_public_token"),
  }
}

export function IntakePhotosPage() {
  const navigate = useNavigate()
  const ctx = useQuoteContext()
  const readOnly = ctx?.readOnly ?? false
  const isAdminView = !!ctx?.quote

  // For admin view: use ctx.quote.id (Clerk auth handles the rest)
  // For intake flow: use sessionStorage quoteId + publicToken
  const intakeAuth = !isAdminView ? getIntakeAuth() : null
  const quoteId = isAdminView ? ctx?.quote?.id : intakeAuth?.quoteId
  const publicToken = intakeAuth?.publicToken ?? undefined

  const [photoState, setPhotoState] = useState<PhotosFormState>({
    filesCount: 0,
    photosCount: 0,
    isUploading: false,
  })

  const handleStateChange = useCallback((state: PhotosFormState) => {
    setPhotoState(state)
  }, [])

  usePageTitle("Photos")

  const handleContinue = () => {
    navigate("/intake/review")
  }

  const handleSkip = () => {
    navigate("/intake/review")
  }

  return (
    <div className={isAdminView ? "" : "max-w-xl mx-auto"}>
      {!isAdminView && (
        <button
          type="button"
          onClick={() => navigate("/intake/scope")}
          className="mb-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Back
        </button>
      )}
      {!isAdminView && (
        <div className="mb-6">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Step 3 of 4</p>
          <h1 className="text-2xl font-semibold">Photos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload photos of your existing kitchen to help us give you a more accurate quote.
            Photos are optional — you can skip this step.
          </p>
        </div>
      )}

      <PhotosForm
        quoteId={quoteId}
        publicToken={publicToken}
        readOnly={readOnly}
        onStateChange={handleStateChange}
      />

      {!isAdminView && !readOnly && (
        <div className="flex flex-col gap-2 pt-6">
          <Button
            onClick={handleContinue}
            disabled={photoState.isUploading}
            className="w-full"
          >
            {photoState.isUploading ? "Uploading\u2026" : "Continue"}
          </Button>
          {photoState.filesCount === 0 && photoState.photosCount === 0 && (
            <Button
              variant="ghost"
              onClick={handleSkip}
              className="w-full"
            >
              Skip — no photos
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
