import { usePageTitle } from "@/hooks/usePageTitle"
import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { useNavigate } from "react-router-dom"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "components"
import { createQuote } from "@/lib/quoteStore"
import { useQuoteContext } from "@/lib/QuoteContext"
import { useTurnstile } from "@/components/Turnstile"
import { apiPost, apiPatch, apiGet, isNetworkError } from "@/lib/api"
import { getActiveDraft, saveDraft, touchDraft } from "@/lib/draftSession"
import { useDevAction } from "@/components/DevToolbar"
import { useSaveOnLeave } from "@/hooks/useSaveOnLeave"
import { CustomerInfoForm, customerInfoSchema, type CustomerInfoData } from "@/components/forms/CustomerInfoForm"

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

const HUBSPOT_PORTAL_ID = import.meta.env.VITE_HUBSPOT_PORTAL_ID as string | undefined
const HUBSPOT_FORM_ID = import.meta.env.VITE_HUBSPOT_FORM_ID as string | undefined

async function submitToHubSpot(data: CustomerInfoData): Promise<void> {
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

export function IntakePage() {
  usePageTitle("Customer Information")
  const navigate = useNavigate()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const ctx = useQuoteContext()
  const readOnly = ctx?.readOnly ?? false
  const quote = ctx?.quote
  const isAdminView = !!quote

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CustomerInfoData>({
    resolver: zodResolver(customerInfoSchema),
    mode: "onTouched",
    defaultValues: {
      name: quote?.name ?? "",
      email: quote?.email ?? "",
      phone: quote?.phone ?? "",
      cell: quote?.cell ?? "",
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
      howDidYouFindUs?: string; referredByContractor?: string
    }>(`/quotes/${encodeURIComponent(draft.quoteId)}/draft?publicToken=${encodeURIComponent(publicToken)}`)
      .then((res) => {
        if (res.ok) {
          reset({
            name: res.data.name ?? "",
            email: res.data.email ?? "",
            phone: res.data.phone ?? "",
            cell: res.data.cell ?? "",
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

  // Trigger auto-save on field changes in admin edit mode
  const onFieldChange = ctx?.onFieldChange
  useEffect(() => {
    if (readOnly || !onFieldChange) return
    const sub = watch(() => onFieldChange())
    return () => sub.unsubscribe()
  }, [readOnly, onFieldChange, watch])

  const onSubmit = async (data: CustomerInfoData) => {
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
    <div className={isAdminView ? "" : "max-w-xl mx-auto"}>
      {!isAdminView && (
        <div className="mb-6">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Step 1 of 4</p>
          <h1 className="text-2xl font-semibold">Request a Quote</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tell us about your project and we'll get back to you with a free estimate.
          </p>
        </div>
      )}

      <form onSubmit={readOnly ? undefined : handleSubmit(onSubmit)} noValidate>
        <CustomerInfoForm
          register={register}
          errors={errors}
          readOnly={readOnly}
        />

        {!isAdminView && TurnstileWidget}

        {!isAdminView && submitError && (
          <p className="text-sm text-destructive mt-4">{submitError}</p>
        )}

        {!isAdminView && (
          <div className="pt-6">
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Submitting\u2026" : "Continue"}
            </Button>
          </div>
        )}
      </form>
    </div>
  )
}
