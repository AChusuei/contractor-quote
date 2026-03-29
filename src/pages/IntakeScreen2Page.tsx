import { usePageTitle } from "@/hooks/usePageTitle"
import { useEffect } from "react"
import { useForm, Controller } from "react-hook-form"
import { useNavigate } from "react-router-dom"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "components"
import { cn } from "@/lib/utils"
import { attachScope } from "@/lib/quoteStore"
import { useQuoteContext } from "@/lib/QuoteContext"
import { apiPatch, isNetworkError } from "@/lib/api"

const applianceSchema = z.enum(["new", "existing", "none"])

const schema = z.object({
  scopeType: z.enum(["supply_only", "supply_install"], {
    message: "Select a scope type",
  }),
  layoutChanges: z.enum(["yes", "no"], {
    message: "Select an option",
  }),
  kitchenSize: z.enum(["small", "medium", "large", "open_concept"], {
    message: "Select a kitchen size",
  }),
  cabinets: z.enum(["new", "reface", "keep"], {
    message: "Select a cabinet option",
  }),
  cabinetDoorStyle: z.string().min(1, "Select a cabinet door style"),
  countertopMaterial: z.string().min(1, "Select a countertop material"),
  countertopEdge: z.string().min(1, "Select an edge profile"),
  sinkType: z.string().min(1, "Select a sink type"),
  backsplash: z.enum(["yes", "no", "undecided"], {
    message: "Select an option",
  }),
  flooringAction: z.enum(["keep", "replace"], {
    message: "Select a flooring option",
  }),
  flooringType: z.string().optional(),
  applianceFridge: applianceSchema,
  applianceRange: applianceSchema,
  applianceDishwasher: applianceSchema,
  applianceHood: applianceSchema,
  applianceMicrowave: applianceSchema,
  islandPeninsula: z.enum(["island", "peninsula", "both", "none"], {
    message: "Select an option",
  }),
  designHelp: z.enum(["yes", "no"], {
    message: "Select an option",
  }),
  additionalNotes: z.string().optional(),
}).refine(
  (data) => {
    if (data.flooringAction === "replace") {
      return data.flooringType && data.flooringType.trim().length > 0
    }
    return true
  },
  { message: "Enter flooring type", path: ["flooringType"] }
)

type IntakeScreen2Data = z.infer<typeof schema>

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

function RadioGroup({
  name,
  options,
  value,
  onChange,
  onBlur,
  error,
  disabled,
}: {
  name: string
  options: { value: string; label: string }[]
  value: string | undefined
  onChange: (v: string) => void
  onBlur?: () => void
  error?: string
  disabled?: boolean
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {options.map((opt) => (
          <label
            key={opt.value}
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-2 text-sm select-none",
              disabled ? "cursor-default opacity-75" : "cursor-pointer hover:bg-accent transition-colors",
              value === opt.value
                ? "border-primary bg-primary/5 font-medium"
                : "border-input bg-background"
            )}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => { if (!disabled) { onChange(opt.value); onBlur?.() } }}
              disabled={disabled}
              className="sr-only"
            />
            {opt.label}
          </label>
        ))}
      </div>
      <FieldError message={error} />
    </div>
  )
}

const APPLIANCE_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "Not included" },
  { value: "new", label: "New" },
  { value: "existing", label: "Existing / keep" },
]

function ApplianceRow({
  label,
  name,
  value,
  onChange,
  disabled,
}: {
  label: string
  name: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b last:border-0">
      <span className="text-sm font-medium w-28 shrink-0">{label}</span>
      <div className="flex gap-2">
        {APPLIANCE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs select-none",
              disabled ? "cursor-default opacity-75" : "cursor-pointer hover:bg-accent transition-colors",
              value === opt.value
                ? "border-primary bg-primary/5 font-medium"
                : "border-input bg-background"
            )}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => { if (!disabled) onChange(opt.value) }}
              disabled={disabled}
              className="sr-only"
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  )
}

const COUNTERTOP_MATERIALS = [
  "Quartz",
  "Granite",
  "Marble",
  "Quartzite",
  "Butcher block",
  "Concrete",
  "Laminate",
  "Solid surface (Corian)",
  "Porcelain / tile",
  "Stainless steel",
  "Soapstone",
  "Undecided",
  "Other",
]

const COUNTERTOP_EDGES = [
  "Eased",
  "Beveled",
  "Bullnose",
  "Half bullnose",
  "Ogee",
  "Waterfall / mitered",
  "Pencil / micro bevel",
  "Undecided",
  "Other",
]

const CABINET_DOOR_STYLES = [
  "Shaker",
  "Flat panel / slab",
  "Raised panel",
  "Beadboard",
  "Inset",
  "Glass front",
  "Open shelving",
  "Other",
]

const SINK_TYPES = [
  "Undermount single basin",
  "Undermount double basin",
  "Drop-in / top mount",
  "Farmhouse / apron front",
  "Bar / prep sink",
  "Other",
]

export function IntakeScreen2Page() {
  const navigate = useNavigate()
  const ctx = useQuoteContext()
  const readOnly = ctx?.readOnly ?? false
  const scope = ctx?.quote?.scope

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<IntakeScreen2Data>({
    resolver: zodResolver(schema),
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
  usePageTitle("Project Scope")
      return () => { valuesRef.current = null }
    }
  }, [readOnly, valuesRef, getValues])

  const layoutChanges = watch("layoutChanges")
  const flooringAction = watch("flooringAction")

  const onSubmit = async (data: IntakeScreen2Data) => {
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
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        {!readOnly && (
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Step 2 of 4</p>
        )}
        <h1 className="text-2xl font-semibold">Project Scope</h1>
        {!readOnly && (
          <p className="text-sm text-muted-foreground mt-1">
            Tell us more about the scope and details of your kitchen project.
          </p>
        )}
      </div>

      {!readOnly && import.meta.env.DEV && (
        <button
          type="button"
          onClick={() => reset({
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
          })}
          className="mb-4 w-full rounded border border-dashed border-amber-400 bg-amber-50 px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-100"
        >
          ⚡ Fill test data (dev only)
        </button>
      )}

      <form onSubmit={readOnly ? undefined : handleSubmit(onSubmit)} noValidate className="space-y-6">

        {/* Scope type */}
        <div>
          <Label htmlFor="scopeType">What are you looking for? {!readOnly && "*"}</Label>
          <Controller
            name="scopeType"
            control={control}
            render={({ field }) => (
              <RadioGroup
                name="scopeType"
                options={[
                  { value: "supply_only", label: "Supply only" },
                  { value: "supply_install", label: "Supply + install" },
                ]}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={errors.scopeType?.message}
                disabled={readOnly}
              />
            )}
          />
        </div>

        {/* Layout changes */}
        <div>
          <Label htmlFor="layoutChanges">Will this involve layout changes? {!readOnly && "*"}</Label>
          <Controller
            name="layoutChanges"
            control={control}
            render={({ field }) => (
              <RadioGroup
                name="layoutChanges"
                options={[
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                ]}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={errors.layoutChanges?.message}
                disabled={readOnly}
              />
            )}
          />
          {layoutChanges === "yes" && (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ⚠ Layout changes may require a building permit. We'll confirm permit requirements during your consultation.
            </div>
          )}
        </div>

        {/* Kitchen size */}
        <div>
          <Label htmlFor="kitchenSize">Kitchen size {!readOnly && "*"}</Label>
          <Controller
            name="kitchenSize"
            control={control}
            render={({ field }) => (
              <RadioGroup
                name="kitchenSize"
                options={[
                  { value: "small", label: "Small (< 70 sq ft)" },
                  { value: "medium", label: "Medium (70–150 sq ft)" },
                  { value: "large", label: "Large (150+ sq ft)" },
                  { value: "open_concept", label: "Open concept" },
                ]}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={errors.kitchenSize?.message}
                disabled={readOnly}
              />
            )}
          />
        </div>

        {/* Cabinets */}
        <div>
          <Label htmlFor="cabinets">Cabinets {!readOnly && "*"}</Label>
          <Controller
            name="cabinets"
            control={control}
            render={({ field }) => (
              <RadioGroup
                name="cabinets"
                options={[
                  { value: "new", label: "New cabinets" },
                  { value: "reface", label: "Reface existing" },
                  { value: "keep", label: "Keep as-is" },
                ]}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={errors.cabinets?.message}
                disabled={readOnly}
              />
            )}
          />
        </div>

        {/* Cabinet door style */}
        <div>
          <Label htmlFor="cabinetDoorStyle">Cabinet door style {!readOnly && "*"}</Label>
          <select
            id="cabinetDoorStyle"
            disabled={readOnly}
            className={inputClass(!!errors.cabinetDoorStyle)}
            {...register("cabinetDoorStyle")}
            defaultValue=""
          >
            <option value="" disabled>Select a style</option>
            {CABINET_DOOR_STYLES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <FieldError message={errors.cabinetDoorStyle?.message} />
        </div>

        {/* Countertop */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="countertopMaterial">Countertop material {!readOnly && "*"}</Label>
            <select
              id="countertopMaterial"
              disabled={readOnly}
              className={inputClass(!!errors.countertopMaterial)}
              {...register("countertopMaterial")}
              defaultValue=""
            >
              <option value="" disabled>Select material</option>
              {COUNTERTOP_MATERIALS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <FieldError message={errors.countertopMaterial?.message} />
          </div>
          <div>
            <Label htmlFor="countertopEdge">Edge profile {!readOnly && "*"}</Label>
            <select
              id="countertopEdge"
              disabled={readOnly}
              className={inputClass(!!errors.countertopEdge)}
              {...register("countertopEdge")}
              defaultValue=""
            >
              <option value="" disabled>Select edge</option>
              {COUNTERTOP_EDGES.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
            <FieldError message={errors.countertopEdge?.message} />
          </div>
        </div>

        {/* Sink type */}
        <div>
          <Label htmlFor="sinkType">Sink type {!readOnly && "*"}</Label>
          <select
            id="sinkType"
            disabled={readOnly}
            className={inputClass(!!errors.sinkType)}
            {...register("sinkType")}
            defaultValue=""
          >
            <option value="" disabled>Select sink type</option>
            {SINK_TYPES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <FieldError message={errors.sinkType?.message} />
        </div>

        {/* Backsplash */}
        <div>
          <Label htmlFor="backsplash">Backsplash {!readOnly && "*"}</Label>
          <Controller
            name="backsplash"
            control={control}
            render={({ field }) => (
              <RadioGroup
                name="backsplash"
                options={[
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                  { value: "undecided", label: "Undecided" },
                ]}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={errors.backsplash?.message}
                disabled={readOnly}
              />
            )}
          />
        </div>

        {/* Flooring */}
        <div>
          <Label htmlFor="flooringAction">Flooring {!readOnly && "*"}</Label>
          <Controller
            name="flooringAction"
            control={control}
            render={({ field }) => (
              <RadioGroup
                name="flooringAction"
                options={[
                  { value: "keep", label: "Keep existing" },
                  { value: "replace", label: "Replace" },
                ]}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={errors.flooringAction?.message}
                disabled={readOnly}
              />
            )}
          />
          {flooringAction === "replace" && (
            <div className="mt-2">
              <Label htmlFor="flooringType">Flooring type {!readOnly && "*"}</Label>
              <input
                id="flooringType"
                type="text"
                placeholder={readOnly ? "" : "e.g. Hardwood, Tile, LVP"}
                disabled={readOnly}
                className={inputClass(!!errors.flooringType)}
                {...register("flooringType")}
              />
              <FieldError message={errors.flooringType?.message} />
            </div>
          )}
        </div>

        {/* Appliances */}
        <div>
          <p className="text-sm font-medium text-foreground mb-2">Appliances</p>
          <div className="rounded-md border bg-background px-3">
            <Controller
              name="applianceFridge"
              control={control}
              render={({ field }) => (
                <ApplianceRow label="Refrigerator" name="applianceFridge" value={field.value} onChange={field.onChange} disabled={readOnly} />
              )}
            />
            <Controller
              name="applianceRange"
              control={control}
              render={({ field }) => (
                <ApplianceRow label="Range / Stove" name="applianceRange" value={field.value} onChange={field.onChange} disabled={readOnly} />
              )}
            />
            <Controller
              name="applianceDishwasher"
              control={control}
              render={({ field }) => (
                <ApplianceRow label="Dishwasher" name="applianceDishwasher" value={field.value} onChange={field.onChange} disabled={readOnly} />
              )}
            />
            <Controller
              name="applianceHood"
              control={control}
              render={({ field }) => (
                <ApplianceRow label="Range Hood" name="applianceHood" value={field.value} onChange={field.onChange} disabled={readOnly} />
              )}
            />
            <Controller
              name="applianceMicrowave"
              control={control}
              render={({ field }) => (
                <ApplianceRow label="Microwave" name="applianceMicrowave" value={field.value} onChange={field.onChange} disabled={readOnly} />
              )}
            />
          </div>
        </div>

        {/* Island / peninsula */}
        <div>
          <Label htmlFor="islandPeninsula">Island / peninsula {!readOnly && "*"}</Label>
          <Controller
            name="islandPeninsula"
            control={control}
            render={({ field }) => (
              <RadioGroup
                name="islandPeninsula"
                options={[
                  { value: "island", label: "Island" },
                  { value: "peninsula", label: "Peninsula" },
                  { value: "both", label: "Both" },
                  { value: "none", label: "None" },
                ]}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={errors.islandPeninsula?.message}
                disabled={readOnly}
              />
            )}
          />
        </div>

        {/* Design help */}
        <div>
          <Label htmlFor="designHelp">Do you need design help / direction? {!readOnly && "*"}</Label>
          <Controller
            name="designHelp"
            control={control}
            render={({ field }) => (
              <RadioGroup
                name="designHelp"
                options={[
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No, I have a clear vision" },
                ]}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={errors.designHelp?.message}
                disabled={readOnly}
              />
            )}
          />
        </div>

        {/* Additional notes */}
        <div>
          <Label htmlFor="additionalNotes">Additional notes</Label>
          <textarea
            id="additionalNotes"
            rows={4}
            placeholder={readOnly ? "" : "Any other details about your project…"}
            disabled={readOnly}
            className={inputClass(!!errors.additionalNotes)}
            {...register("additionalNotes")}
          />
          <FieldError message={errors.additionalNotes?.message} />
        </div>

        {!readOnly && (
          <div className="pt-2">
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Saving…" : "Continue"}
            </Button>
          </div>
        )}
      </form>
    </div>
  )
}
