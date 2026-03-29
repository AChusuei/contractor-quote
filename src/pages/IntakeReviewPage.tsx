import { usePageTitle } from "@/hooks/usePageTitle"
import { useState, useEffect } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Button } from "components"
import { getQuote } from "@/lib/quoteStore"
import { apiPatch, apiGet, isNetworkError } from "@/lib/api"

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  house: "House",
  apt: "Apartment",
  building: "Building",
  townhouse: "Townhouse",
}

const BUDGET_LABELS: Record<string, string> = {
  "<10k": "Under $10,000",
  "10-25k": "$10,000 - $25,000",
  "25-50k": "$25,000 - $50,000",
  "50k+": "$50,000+",
}

const SCOPE_TYPE_LABELS: Record<string, string> = {
  supply_only: "Supply only",
  supply_install: "Supply + install",
}

const KITCHEN_SIZE_LABELS: Record<string, string> = {
  small: "Small (< 70 sq ft)",
  medium: "Medium (70-150 sq ft)",
  large: "Large (150+ sq ft)",
  open_concept: "Open concept",
}

const CABINET_LABELS: Record<string, string> = {
  new: "New cabinets",
  reface: "Reface existing",
  keep: "Keep as-is",
}

const APPLIANCE_LABELS: Record<string, string> = {
  new: "New",
  existing: "Existing / keep",
  none: "Not included",
}

const ISLAND_LABELS: Record<string, string> = {
  island: "Island",
  peninsula: "Peninsula",
  both: "Both",
  none: "None",
}

type ApiQuote = {
  id: string
  name: string
  email: string
  phone: string
  cell?: string | null
  jobSiteAddress: string
  propertyType: string
  budgetRange: string
  howDidYouFindUs?: string | null
  referredByContractor?: string | null
  scope?: Record<string, unknown> | null
  status: string
}

function SectionHeader({ title, editStep }: { title: string; editStep: string }) {
  return (
    <div className="flex items-center justify-between border-b pb-2 mb-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <Link
        to={editStep}
        className="text-xs font-medium text-primary hover:underline"
      >
        Edit
      </Link>
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="py-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value || "-"}</dd>
    </div>
  )
}

export function IntakeReviewPage() {
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [quote, setQuote] = useState<ApiQuote | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadQuote() {
      const quoteId = sessionStorage.getItem("cq_active_quote_id")
      if (!quoteId) {
        // Try localStorage fallback
        const localQuote = getQuote(quoteId ?? "")
        if (localQuote) {
          setQuote({
            id: localQuote.id,
            name: localQuote.name,
            email: localQuote.email,
            phone: localQuote.phone,
            cell: localQuote.cell,
            jobSiteAddress: localQuote.jobSiteAddress,
            propertyType: localQuote.propertyType,
            budgetRange: localQuote.budgetRange,
            howDidYouFindUs: localQuote.howDidYouFindUs,
            referredByContractor: localQuote.referredByContractor,
            scope: localQuote.scope as unknown as Record<string, unknown> | null,
            status: localQuote.status,
          })
        }
        setLoading(false)
        return
      }

      // Try to fetch from API via the public draft endpoint
      const publicToken = sessionStorage.getItem("cq_public_token")
      if (publicToken) {
        const res = await apiGet<ApiQuote>(`/quotes/${encodeURIComponent(quoteId)}/draft?publicToken=${encodeURIComponent(publicToken)}`)
        if (res.ok) {
          setQuote(res.data)
          setLoading(false)
          return
        }
      }

      // Fallback to localStorage
      const localQuote = getQuote(quoteId)
      if (localQuote) {
        setQuote({
          id: localQuote.id,
          name: localQuote.name,
          email: localQuote.email,
          phone: localQuote.phone,
          cell: localQuote.cell,
          jobSiteAddress: localQuote.jobSiteAddress,
          propertyType: localQuote.propertyType,
          budgetRange: localQuote.budgetRange,
          howDidYouFindUs: localQuote.howDidYouFindUs,
          referredByContractor: localQuote.referredByContractor,
          scope: localQuote.scope as unknown as Record<string, unknown> | null,
          status: localQuote.status,
        })
      }
      setLoading(false)
    }
    void loadQuote()
  }, [])

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const quoteId = sessionStorage.getItem("cq_active_quote_id")
      const publicToken = sessionStorage.getItem("cq_public_token")

      if (quoteId && publicToken) {
        const res = await apiPatch(`/quotes/${encodeURIComponent(quoteId)}/draft`, {
          publicToken,
          status: "lead",
        })

        if (!res.ok && !isNetworkError(res)) {
          throw new Error(res.error || "Submission failed")
        }
      }

      // Clean up session storage
      sessionStorage.removeItem("cq_active_quote_id")
      sessionStorage.removeItem("cq_public_token")
      sessionStorage.removeItem("cq_quote_session_id")

      navigate("/intake/confirmation")
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
  usePageTitle("Review \& Submit")
    return (
      <div className="max-w-xl mx-auto flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading your quote details...</p>
      </div>
    )
  }

  if (!quote) {
    return (
      <div className="max-w-xl mx-auto text-center py-12">
        <h1 className="text-2xl font-semibold mb-2">Quote not found</h1>
        <p className="text-sm text-muted-foreground mb-4">
          We couldn't find your quote draft. Please start over.
        </p>
        <Button onClick={() => navigate("/")} className="w-full">Start over</Button>
      </div>
    )
  }

  const scope = quote.scope

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Step 4 of 4</p>
        <h1 className="text-2xl font-semibold">Review Your Request</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Please review the details below before submitting your quote request.
        </p>
      </div>

      <div className="space-y-6">
        {/* Customer Info */}
        <section className="rounded-lg border bg-background p-4">
          <SectionHeader title="Customer Info" editStep="/" />
          <dl className="grid grid-cols-2 gap-x-4">
            <Field label="Name" value={quote.name} />
            <Field label="Email" value={quote.email} />
            <Field label="Phone" value={quote.phone} />
            <Field label="Cell" value={quote.cell} />
            <div className="col-span-2">
              <Field label="Job Site Address" value={quote.jobSiteAddress} />
            </div>
            <Field label="Property Type" value={PROPERTY_TYPE_LABELS[quote.propertyType]} />
            <Field label="Budget Range" value={BUDGET_LABELS[quote.budgetRange]} />
            <Field label="How did you find us?" value={quote.howDidYouFindUs} />
            {quote.referredByContractor && (
              <Field label="Referred by" value={quote.referredByContractor} />
            )}
          </dl>
        </section>

        {/* Project Scope */}
        <section className="rounded-lg border bg-background p-4">
          <SectionHeader title="Project Scope" editStep="/intake/scope" />
          {scope ? (
            <dl className="grid grid-cols-2 gap-x-4">
              <Field label="Scope Type" value={SCOPE_TYPE_LABELS[scope.scopeType as string]} />
              <Field label="Layout Changes" value={(scope.layoutChanges as string) === "yes" ? "Yes" : "No"} />
              <Field label="Kitchen Size" value={KITCHEN_SIZE_LABELS[scope.kitchenSize as string]} />
              <Field label="Cabinets" value={CABINET_LABELS[scope.cabinets as string]} />
              <Field label="Cabinet Door Style" value={scope.cabinetDoorStyle as string} />
              <Field label="Countertop Material" value={scope.countertopMaterial as string} />
              <Field label="Edge Profile" value={scope.countertopEdge as string} />
              <Field label="Sink Type" value={scope.sinkType as string} />
              <Field label="Backsplash" value={(scope.backsplash as string) === "yes" ? "Yes" : (scope.backsplash as string) === "no" ? "No" : "Undecided"} />
              <Field label="Flooring" value={(scope.flooringAction as string) === "keep" ? "Keep existing" : `Replace: ${scope.flooringType as string || "TBD"}`} />
              <Field label="Refrigerator" value={APPLIANCE_LABELS[scope.applianceFridge as string]} />
              <Field label="Range / Stove" value={APPLIANCE_LABELS[scope.applianceRange as string]} />
              <Field label="Dishwasher" value={APPLIANCE_LABELS[scope.applianceDishwasher as string]} />
              <Field label="Range Hood" value={APPLIANCE_LABELS[scope.applianceHood as string]} />
              <Field label="Microwave" value={APPLIANCE_LABELS[scope.applianceMicrowave as string]} />
              <Field label="Island / Peninsula" value={ISLAND_LABELS[scope.islandPeninsula as string]} />
              <Field label="Design Help" value={(scope.designHelp as string) === "yes" ? "Yes" : "No"} />
              {(scope.additionalNotes as string) && (
                <div className="col-span-2">
                  <Field label="Additional Notes" value={scope.additionalNotes as string} />
                </div>
              )}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">No project scope details provided.</p>
          )}
        </section>

        {/* Photos */}
        <section className="rounded-lg border bg-background p-4">
          <SectionHeader title="Photos" editStep="/intake/photos" />
          <p className="text-sm text-muted-foreground">
            Photos will be attached to your submission.
          </p>
        </section>

        {/* Submit */}
        {submitError && (
          <p className="text-sm text-destructive">{submitError}</p>
        )}

        <div className="flex flex-col gap-2 pt-2">
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Submitting..." : "Submit Request"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="w-full"
          >
            Back
          </Button>
        </div>
      </div>
    </div>
  )
}
