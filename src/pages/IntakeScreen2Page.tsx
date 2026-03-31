import { usePageTitle } from "@/hooks/usePageTitle"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { useNavigate } from "react-router-dom"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "components"
import { attachScope } from "@/lib/quoteStore"
import { useQuoteContext } from "@/lib/QuoteContext"
import { apiGet } from "@/lib/api"
import { getActiveDraft } from "@/lib/draftSession"
import { useSaveOnLeave } from "@/hooks/useSaveOnLeave"
import { useContractor } from "@/hooks/useContractor"
import { useDevAction } from "@/components/DevToolbar"
import { apiPatch, isNetworkError } from "@/lib/api"
import { ProjectScopeForm, projectScopeSchema, type ProjectScopeData } from "@/components/forms/ProjectScopeForm"

export function IntakeScreen2Page() {
  const navigate = useNavigate()
  const ctx = useQuoteContext()
  const readOnly = ctx?.readOnly ?? false
  const quote = ctx?.quote
  const scope = quote?.scope
  const isAdminView = !!quote
  const { contractor } = useContractor()
  const contractorId = contractor?.id ?? ""

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ProjectScopeData>({
    resolver: zodResolver(projectScopeSchema),
    mode: "onTouched",
    defaultValues: {
      jobSiteAddress: quote?.jobSiteAddress ?? "",
      propertyType: quote?.propertyType,
      budgetRange: quote?.budgetRange,
      scopeType: scope?.scopeType,
      layoutChanges: scope?.layoutChanges,
      kitchenSize: scope?.kitchenSize,
      cabinets: scope?.cabinets,
      cabinetDoorStyle: scope?.cabinetDoorStyle ?? "",
      countertopMaterial: scope?.countertopMaterial ?? "",
      countertopEdge: scope?.countertopEdge ?? "",
      sinkType: scope?.sinkType ?? "",
      backsplash: scope?.backsplash,
      flooringAction: scope?.flooringAction,
      flooringType: scope?.flooringType ?? "",
      applianceFridge: scope?.applianceFridge ?? "none",
      applianceRange: scope?.applianceRange ?? "none",
      applianceDishwasher: scope?.applianceDishwasher ?? "none",
      applianceHood: scope?.applianceHood ?? "none",
      applianceMicrowave: scope?.applianceMicrowave ?? "none",
      islandPeninsula: scope?.islandPeninsula,
      designHelp: scope?.designHelp,
      additionalNotes: scope?.additionalNotes ?? "",
    },
  })

  const valuesRef = ctx?.valuesRef
  useEffect(() => {
    if (!readOnly && valuesRef) {
      valuesRef.current = () => {
        const { jobSiteAddress, propertyType, budgetRange, ...scopeFields } = getValues()
        return { jobSiteAddress, propertyType, budgetRange, scope: scopeFields } as Record<string, unknown>
      }
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

  // Restore scope from active draft when navigating back
  useEffect(() => {
    if (readOnly || scope) return
    if (!contractorId) return
    const draft = getActiveDraft(contractorId)
    if (!draft) return
    apiGet<{ jobSiteAddress?: string; propertyType?: string; budgetRange?: string; scope: Record<string, unknown> | null }>(
      `/quotes/${encodeURIComponent(draft.quoteId)}/draft?publicToken=${encodeURIComponent(draft.publicToken)}`
    )
      .then((res) => {
        if (res.ok && res.data.scope) {
          reset({
            jobSiteAddress: res.data.jobSiteAddress ?? "",
            propertyType: res.data.propertyType as ProjectScopeData["propertyType"],
            budgetRange: res.data.budgetRange as ProjectScopeData["budgetRange"],
            ...(res.data.scope as Omit<ProjectScopeData, "jobSiteAddress" | "propertyType" | "budgetRange">),
          })
        }
      })
      .catch(() => { /* draft fetch failed — start fresh */ })
  }, [contractorId]) // eslint-disable-line react-hooks/exhaustive-deps

  usePageTitle("Project Scope")
  useDevAction(readOnly ? null : {
    label: "Fill",
    onClick: () => reset({
      jobSiteAddress: "148-03 Kalmia Avenue, Flushing, New York 11355, United States",
      propertyType: "house",
      budgetRange: "25-50k",
      scopeType: "supply_install",
      layoutChanges: "no",
      kitchenSize: "medium",
      cabinets: "new",
      cabinetDoorStyle: "Shaker",
      countertopMaterial: "Quartz",
      countertopEdge: "Eased",
      sinkType: "Undermount single basin",
      backsplash: "yes",
      flooringAction: "keep",
      applianceFridge: "existing",
      applianceRange: "new",
      applianceDishwasher: "new",
      applianceHood: "none",
      applianceMicrowave: "existing",
      islandPeninsula: "none",
      designHelp: "no",
      additionalNotes: "Looking to do a full kitchen reno, open to suggestions on layout.",
    }),
  })

  // Save scope when tab switches, phone locks, or page unloads
  useSaveOnLeave(() => {
    if (readOnly) return null
    const v = getValues()
    const { jobSiteAddress, propertyType, budgetRange, ...scopeFields } = v
    return { jobSiteAddress, propertyType, budgetRange, scope: scopeFields }
  }, contractorId)

  const onSubmit = async (data: ProjectScopeData) => {
    const { jobSiteAddress, propertyType, budgetRange, ...scopeFields } = data
    const quoteId = sessionStorage.getItem("cq_active_quote_id")
    const publicToken = sessionStorage.getItem("cq_public_token")
    if (quoteId && publicToken) {
      const res = await apiPatch(`/quotes/${encodeURIComponent(quoteId)}/draft`, {
        publicToken,
        jobSiteAddress,
        propertyType,
        budgetRange,
        scope: scopeFields,
      })
      if (isNetworkError(res)) {
        console.warn("API unreachable — falling back to localStorage for scope")
        attachScope(scopeFields)
      }
    } else {
      attachScope(scopeFields)
    }
    navigate("/intake/photos")
  }

  return (
    <div className={isAdminView ? "" : "max-w-xl mx-auto"}>
      {!isAdminView && (
        <button
          type="button"
          onClick={async () => {
            const quoteId = sessionStorage.getItem("cq_active_quote_id")
            const publicToken = sessionStorage.getItem("cq_public_token")
            if (quoteId && publicToken) {
              await apiPatch(`/quotes/${encodeURIComponent(quoteId)}/draft`, {
                publicToken,
                scope: getValues(),
              }).catch(() => {})
            }
            navigate("/")
          }}
          className="mb-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Back
        </button>
      )}
      {!isAdminView && (
        <div className="mb-6">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Step 2 of 4</p>
          <h1 className="text-2xl font-semibold">Project Scope</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tell us more about the scope and details of your kitchen project.
          </p>
        </div>
      )}

      <form onSubmit={readOnly ? undefined : handleSubmit(onSubmit)} noValidate>
        <ProjectScopeForm
          register={register}
          control={control}
          errors={errors}
          watch={watch}
          readOnly={readOnly}
        />

        {!isAdminView && (
          <div className="pt-6">
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Saving\u2026" : "Continue"}
            </Button>
          </div>
        )}
      </form>
    </div>
  )
}
