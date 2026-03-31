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
import { useDevAction } from "@/components/DevToolbar"
import { apiPatch, isNetworkError } from "@/lib/api"
import { ProjectScopeForm, projectScopeSchema, type ProjectScopeData } from "@/components/forms/ProjectScopeForm"

export function IntakeScreen2Page() {
  const navigate = useNavigate()
  const ctx = useQuoteContext()
  const readOnly = ctx?.readOnly ?? false
  const scope = ctx?.quote?.scope
  const isAdminView = !!ctx?.quote

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
      valuesRef.current = () => ({ scope: getValues() }) as Record<string, unknown>
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
    const contractorId = import.meta.env.VITE_CQ_CONTRACTOR_ID ?? "contractor-001"
    const draft = getActiveDraft(contractorId)
    if (!draft) return
    apiGet<{ scope: Record<string, unknown> | null }>(
      `/quotes/${encodeURIComponent(draft.quoteId)}/draft?publicToken=${encodeURIComponent(draft.publicToken)}`
    )
      .then((res) => {
        if (res.ok && res.data.scope) {
          reset(res.data.scope as ProjectScopeData)
        }
      })
      .catch(() => { /* draft fetch failed — start fresh */ })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  usePageTitle("Project Scope")
  useDevAction(readOnly ? null : {
    label: "Fill",
    onClick: () => reset({
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
    return { scope: getValues() }
  })

  const onSubmit = async (data: ProjectScopeData) => {
    const quoteId = sessionStorage.getItem("cq_active_quote_id")
    const publicToken = sessionStorage.getItem("cq_public_token")
    if (quoteId && publicToken) {
      const res = await apiPatch(`/quotes/${encodeURIComponent(quoteId)}/draft`, {
        publicToken,
        scope: data,
      })
      if (isNetworkError(res)) {
        console.warn("API unreachable — falling back to localStorage for scope")
        attachScope(data)
      }
    } else {
      attachScope(data)
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
