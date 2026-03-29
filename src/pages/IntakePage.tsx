import { usePageTitle } from "@/hooks/usePageTitle"
import { useState, useEffect } from "react"
import { useForm, Controller } from "react-hook-form"
import { useNavigate } from "react-router-dom"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "components"
import { cn } from "@/lib/utils"
import { AddressAutocomplete } from "@/components/AddressAutocomplete"
import { createQuote } from "@/lib/quoteStore"
import { useQuoteContext } from "@/lib/QuoteContext"
import { useTurnstile } from "@/components/Turnstile"
import { apiPost, apiPatch, apiGet, isNetworkError } from "@/lib/api"
import { getActiveDraft, saveDraft, touchDraft } from "@/lib/draftSession"
import { useDevAction } from "@/components/DevToolbar"
import { useSaveOnLeave } from "@/hooks/useSaveOnLeave"

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().refine((v) => v.replace(/\D/g, "").length >= 10, "Enter a valid phone number"),
  cell: z.string().refine((v) => v === "" || v.replace(/\D/g, "").length >= 10, "Enter a valid phone number").optional(),
  jobSiteAddress: z.string().min(1, "Job site address is required"),
  propertyType: z.enum(["house", "apt", "building", "townhouse"], { error: "Please select an option" }),
  budgetRange: z.enum(["<10k", "10-25k", "25-50k", "50k+"], { error: "Please select an option" }),
  howDidYouFindUs: z.string().min(1, "Please tell us how you found us"),
  referredByContractor: z.string().optional(),
})

type IntakeFormData = z.infer<typeof schema>

const HUBSPOT_PORTAL_ID = import.meta.env.VITE_HUBSPOT_PORTAL_ID as string | undefined
const HUBSPOT_FORM_ID = import.meta.env.VITE_HUBSPOT_FORM_ID as string | undefined

async function submitToHubSpot(data: IntakeFormData): Promise<void> {
  if (!HUBSPOT_PORTAL_ID || !HUBSPOT_FORM_ID) {
    console.warn("HubSpot credentials not configured — skipping CRM submission")
    return
  }

  const fields = [
    { name: "firstname", value: data.name.split(" ")[0] },
    { name: "lastname", value: data.name.split(" ").slice(1).join(" ") },
    { name: "email", value: data.email },
    { name: "phone", value: data.phone },
    { name: "mobilephone", value: data.cell ?? "" },
    { name: "address", value: data.jobSiteAddress },
    { name: "property_type", value: data.propertyType },
    { name: "budget_range", value: data.budgetRange },
    { name: "how_did_you_find_us", value: data.howDidYouFindUs },
    { name: "referred_by_contractor", value: data.referredByContractor ?? "" },
  ]

  const res = await fetch(
    `https://api.hsforms.com/submissions/v3/integration/submit/${HUBSPOT_PORTAL_ID}/${HUBSPOT_FORM_ID}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    }
  )

  if (!res.ok) {
    throw new Error(`HubSpot submission failed: ${res.status}`)
  }
}

function Label({ htmlFor, children, className }: { htmlFor: string; children: React.ReactNode; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("block text-sm font-medium text-foreground mb-1", className)}>
      {children}
    </label>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1 text-xs text-destructive">{message}</p>
}

function inputClass(hasError?: boolean) {
  return cn(
    "w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm",
    "focus:outline-none focus:ring-1 focus:ring-ring",
    hasError ? "border-destructive" : "border-input"
  )
}

export function IntakePage() {
  usePageTitle("Customer Information")
  const navigate = useNavigate()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const ctx = useQuoteContext()
  const readOnly = ctx?.readOnly ?? false
  const quote = ctx?.quote

  const {
    register,
    handleSubmit,
    control,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<IntakeFormData>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      name: quote?.name ?? "",
      email: quote?.email ?? "",
      phone: quote?.phone ?? "",
      cell: quote?.cell ?? "",
      jobSiteAddress: quote?.jobSiteAddress ?? "",
      propertyType: quote?.propertyType,
      budgetRange: quote?.budgetRange,
      howDidYouFindUs: quote?.howDidYouFindUs ?? "",
      referredByContractor: quote?.referredByContractor ?? "",
    },
  })

  // Restore form from active draft when navigating back
  useEffect(() => {
    if (readOnly || quote) return // admin view or already have data
    const contractorId = import.meta.env.VITE_CQ_CONTRACTOR_ID ?? "contractor-001"
    const draft = getActiveDraft(contractorId)
    if (!draft) return
    const publicToken = draft.publicToken
    apiGet<{
      name: string; email: string; phone: string; cell?: string
      jobSiteAddress: string; propertyType: string; budgetRange: string
      howDidYouFindUs?: string; referredByContractor?: string
    }>(`/quotes/${encodeURIComponent(draft.quoteId)}/draft?publicToken=${encodeURIComponent(publicToken)}`)
      .then((res) => {
        if (res.ok) {
          reset({
            name: res.data.name ?? "",
            email: res.data.email ?? "",
            phone: res.data.phone ?? "",
            cell: res.data.cell ?? "",
            jobSiteAddress: res.data.jobSiteAddress ?? "",
            propertyType: res.data.propertyType as IntakeFormData["propertyType"],
            budgetRange: res.data.budgetRange as IntakeFormData["budgetRange"],
            howDidYouFindUs: res.data.howDidYouFindUs ?? "",
            referredByContractor: res.data.referredByContractor ?? "",
          })
          sessionStorage.setItem("cq_active_quote_id", draft.quoteId)
          sessionStorage.setItem("cq_public_token", draft.publicToken)
        }
      })
      .catch(() => { /* draft fetch failed — start fresh */ })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { getToken: getTurnstileToken, resetToken: resetTurnstile, TurnstileWidget } =
    useTurnstile(readOnly ? undefined : TURNSTILE_SITE_KEY)

  useDevAction(readOnly ? null : {
    label: "Fill",
    onClick: () => reset({
      name: "John Smith",
      email: "john.smith@example.com",
      phone: "(718) 555-1234",
      cell: "(718) 555-5678",
      jobSiteAddress: "148-03 Kalmia Avenue, Flushing, New York 11355, United States",
      propertyType: "house",
      budgetRange: "25-50k",
      howDidYouFindUs: "referral",
      referredByContractor: "Mike's Contracting",
    }),
  })

  // Save form state when tab switches, phone locks, or page unloads
  useSaveOnLeave(() => {
    if (readOnly) return null
    const v = getValues()
    if (!v.name && !v.email) return null // nothing to save
    return {
      name: v.name,
      email: v.email,
      phone: v.phone,
      cell: v.cell || undefined,
      jobSiteAddress: v.jobSiteAddress,
      propertyType: v.propertyType,
      budgetRange: v.budgetRange,
      howDidYouFindUs: v.howDidYouFindUs,
      referredByContractor: v.referredByContractor || undefined,
    }
  })

  const valuesRef = ctx?.valuesRef
  useEffect(() => {
    if (!readOnly && valuesRef) {
      valuesRef.current = () => getValues() as Record<string, unknown>
      return () => { valuesRef.current = null }
    }
  }, [readOnly, valuesRef, getValues])

  const onSubmit = async (data: IntakeFormData) => {
    setSubmitError(null)

    // Require Turnstile token when configured
    if (TURNSTILE_SITE_KEY) {
      const turnstileToken = getTurnstileToken()
      if (!turnstileToken) {
        setSubmitError("Please wait for the security check to complete, then try again.")
        return
      }
    }

    try {
      const turnstileToken = TURNSTILE_SITE_KEY ? getTurnstileToken() : undefined

      const contractorId = import.meta.env.VITE_CQ_CONTRACTOR_ID ?? "contractor-001"
      const existingDraft = getActiveDraft(contractorId)

      const payload = {
        schemaVersion: 1,
        contractorId,
        name: data.name,
        email: data.email,
        phone: data.phone,
        cell: data.cell || undefined,
        jobSiteAddress: data.jobSiteAddress,
        propertyType: data.propertyType,
        budgetRange: data.budgetRange,
        howDidYouFindUs: data.howDidYouFindUs,
        referredByContractor: data.referredByContractor || undefined,
        turnstileToken,
      }

      if (existingDraft && existingDraft.contractorId === contractorId) {
        // Resume existing draft — PATCH instead of POST
        const res = await apiPatch(
          `/quotes/${encodeURIComponent(existingDraft.quoteId)}/draft`,
          { ...payload, publicToken: existingDraft.publicToken }
        )
        if (res.ok) {
          touchDraft(contractorId)
          sessionStorage.setItem("cq_active_quote_id", existingDraft.quoteId)
          sessionStorage.setItem("cq_public_token", existingDraft.publicToken)
        } else if (isNetworkError(res)) {
          // API down — proceed with stale draft ID, will sync later
          sessionStorage.setItem("cq_active_quote_id", existingDraft.quoteId)
          sessionStorage.setItem("cq_public_token", existingDraft.publicToken)
        } else {
          // Draft expired or deleted server-side — create a new one
          const newRes = await apiPost<{ id: string; publicToken: string }>("/quotes", { ...payload, status: "draft" })
          if (newRes.ok) {
            saveDraft(newRes.data.id, newRes.data.publicToken, contractorId)
            sessionStorage.setItem("cq_active_quote_id", newRes.data.id)
            sessionStorage.setItem("cq_public_token", newRes.data.publicToken)
          } else {
            throw new Error(newRes.ok === false ? newRes.error || "Submission failed" : "Submission failed")
          }
        }
      } else {
        // No existing draft — create new
        const res = await apiPost<{ id: string; publicToken: string }>("/quotes", { ...payload, status: "draft" })
        if (res.ok) {
          saveDraft(res.data.id, res.data.publicToken, contractorId)
          sessionStorage.setItem("cq_active_quote_id", res.data.id)
          sessionStorage.setItem("cq_public_token", res.data.publicToken)
        } else if (isNetworkError(res)) {
          console.warn("API unreachable — falling back to localStorage")
          const localQuote = createQuote({
            name: data.name,
            email: data.email,
            phone: data.phone,
            cell: data.cell,
            jobSiteAddress: data.jobSiteAddress,
            propertyType: data.propertyType,
            budgetRange: data.budgetRange,
            howDidYouFindUs: data.howDidYouFindUs,
            referredByContractor: data.referredByContractor,
          })
          sessionStorage.setItem("cq_active_quote_id", localQuote.id)
        } else {
          throw new Error(res.error || "Submission failed")
        }
      }

      await submitToHubSpot(data)
      navigate("/intake/scope")
    } catch (err) {
      resetTurnstile()
      setSubmitError(err instanceof Error ? err.message : "Submission failed. Please try again.")
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        {!readOnly && (
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Step 1 of 4</p>
        )}
        <h1 className="text-2xl font-semibold">Request a Quote</h1>
        {!readOnly && (
          <p className="text-sm text-muted-foreground mt-1">
            Tell us about your project and we'll get back to you with a free estimate.
          </p>
        )}
      </div>


      <form onSubmit={readOnly ? undefined : handleSubmit(onSubmit)} noValidate className="space-y-4">
        {/* Name */}
        <div>
          <Label htmlFor="name">Full Name {!readOnly && "*"}</Label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            disabled={readOnly}
            className={inputClass(!!errors.name)}
            {...register("name")}
          />
          <FieldError message={errors.name?.message} />
        </div>

        {/* Email */}
        <div>
          <Label htmlFor="email">Email {!readOnly && "*"}</Label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            disabled={readOnly}
            className={inputClass(!!errors.email)}
            {...register("email")}
          />
          <FieldError message={errors.email?.message} />
        </div>

        {/* Phone + Cell — stacked on mobile, side-by-side on sm+ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="phone">Phone {!readOnly && "*"}</Label>
            <input
              id="phone"
              type="tel"
              autoComplete="tel"
              disabled={readOnly}
              className={inputClass(!!errors.phone)}
              {...register("phone")}
            />
            <FieldError message={errors.phone?.message} />
          </div>
          <div>
            <Label htmlFor="cell">Cell</Label>
            <input
              id="cell"
              type="tel"
              autoComplete="tel"
              disabled={readOnly}
              className={inputClass(!!errors.cell)}
              {...register("cell")}
            />
            <FieldError message={errors.cell?.message} />
          </div>
        </div>

        {/* Job site address */}
        <div>
          <Label htmlFor="jobSiteAddress">Job Site Address {!readOnly && "*"}</Label>
          {readOnly ? (
            <input
              id="jobSiteAddress"
              type="text"
              disabled
              className={inputClass()}
              {...register("jobSiteAddress")}
            />
          ) : (
            <Controller
              name="jobSiteAddress"
              control={control}
              render={({ field }) => (
                <AddressAutocomplete
                  id="jobSiteAddress"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  hasError={!!errors.jobSiteAddress}
                  autoComplete="street-address"
                  placeholder="Start typing an address…"
                />
              )}
            />
          )}
          <FieldError message={errors.jobSiteAddress?.message} />
        </div>

        {/* Property type */}
        <div>
          <Label htmlFor="propertyType">Property Type {!readOnly && "*"}</Label>
          <select
            id="propertyType"
            disabled={readOnly}
            className={inputClass(!!errors.propertyType)}
            {...register("propertyType")}
            defaultValue=""
          >
            <option value="" disabled>Select property type</option>
            <option value="house">House</option>
            <option value="apt">Apartment</option>
            <option value="building">Building</option>
            <option value="townhouse">Townhouse</option>
          </select>
          <FieldError message={errors.propertyType?.message} />
        </div>

        {/* Budget range */}
        <div>
          <Label htmlFor="budgetRange">Budget Range {!readOnly && "*"}</Label>
          <select
            id="budgetRange"
            disabled={readOnly}
            className={inputClass(!!errors.budgetRange)}
            {...register("budgetRange")}
            defaultValue=""
          >
            <option value="" disabled>Select budget range</option>
            <option value="<10k">Under $10,000</option>
            <option value="10-25k">$10,000 – $25,000</option>
            <option value="25-50k">$25,000 – $50,000</option>
            <option value="50k+">$50,000+</option>
          </select>
          <FieldError message={errors.budgetRange?.message} />
        </div>

        {/* How did you find us */}
        <div>
          <Label htmlFor="howDidYouFindUs">How Did You Find Us? {!readOnly && "*"}</Label>
          <select
            id="howDidYouFindUs"
            disabled={readOnly}
            className={inputClass(!!errors.howDidYouFindUs)}
            {...register("howDidYouFindUs")}
            defaultValue=""
          >
            <option value="" disabled>Select an option</option>
            <option value="google">Google Search</option>
            <option value="referral">Referral</option>
            <option value="social_media">Social Media</option>
            <option value="yelp">Yelp</option>
            <option value="flyer">Flyer / Mailer</option>
            <option value="other">Other</option>
          </select>
          <FieldError message={errors.howDidYouFindUs?.message} />
        </div>

        {/* Referred by contractor name */}
        <div>
          <Label htmlFor="referredByContractor">Referred By (Contractor Name)</Label>
          <input
            id="referredByContractor"
            type="text"
            placeholder={readOnly ? "" : "Leave blank if not applicable"}
            disabled={readOnly}
            className={inputClass(!!errors.referredByContractor)}
            {...register("referredByContractor")}
          />
          <FieldError message={errors.referredByContractor?.message} />
        </div>

        {!readOnly && TurnstileWidget}

        {!readOnly && submitError && (
          <p className="text-sm text-destructive">{submitError}</p>
        )}

        {!readOnly && (
          <div className="pt-2">
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Submitting…" : "Continue"}
            </Button>
          </div>
        )}
      </form>
    </div>
  )
}
