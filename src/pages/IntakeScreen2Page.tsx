import { useForm, Controller } from "react-hook-form"
import { useNavigate } from "react-router-dom"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "components"
import { cn } from "@/lib/utils"

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
}: {
  name: string
  options: { value: string; label: string }[]
  value: string | undefined
  onChange: (v: string) => void
  onBlur?: () => void
  error?: string
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {options.map((opt) => (
          <label
            key={opt.value}
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer select-none",
              "hover:bg-accent transition-colors",
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
              onChange={() => { onChange(opt.value); onBlur?.() }}
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
}: {
  label: string
  name: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b last:border-0">
      <span className="text-sm font-medium w-28 shrink-0">{label}</span>
      <div className="flex gap-2">
        {APPLIANCE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs cursor-pointer select-none",
              "hover:bg-accent transition-colors",
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
              onChange={() => onChange(opt.value)}
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
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<IntakeScreen2Data>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      applianceFridge: "none",
      applianceRange: "none",
      applianceDishwasher: "none",
      applianceHood: "none",
      applianceMicrowave: "none",
    },
  })

  const layoutChanges = watch("layoutChanges")
  const flooringAction = watch("flooringAction")

  const onSubmit = (_data: IntakeScreen2Data) => {
    navigate("/intake/photos")
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Step 2 of 4</p>
        <h1 className="text-2xl font-semibold">Project Scope</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tell us more about the scope and details of your kitchen project.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">

        {/* Scope type */}
        <div>
          <Label htmlFor="scopeType">What are you looking for? *</Label>
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
              />
            )}
          />
        </div>

        {/* Layout changes */}
        <div>
          <Label htmlFor="layoutChanges">Will this involve layout changes? *</Label>
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
          <Label htmlFor="kitchenSize">Kitchen size *</Label>
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
              />
            )}
          />
        </div>

        {/* Cabinets */}
        <div>
          <Label htmlFor="cabinets">Cabinets *</Label>
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
              />
            )}
          />
        </div>

        {/* Cabinet door style */}
        <div>
          <Label htmlFor="cabinetDoorStyle">Cabinet door style *</Label>
          <select
            id="cabinetDoorStyle"
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
            <Label htmlFor="countertopMaterial">Countertop material *</Label>
            <select
              id="countertopMaterial"
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
            <Label htmlFor="countertopEdge">Edge profile *</Label>
            <select
              id="countertopEdge"
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
          <Label htmlFor="sinkType">Sink type *</Label>
          <select
            id="sinkType"
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
          <Label htmlFor="backsplash">Backsplash *</Label>
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
              />
            )}
          />
        </div>

        {/* Flooring */}
        <div>
          <Label htmlFor="flooringAction">Flooring *</Label>
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
              />
            )}
          />
          {flooringAction === "replace" && (
            <div className="mt-2">
              <Label htmlFor="flooringType">Flooring type *</Label>
              <input
                id="flooringType"
                type="text"
                placeholder="e.g. Hardwood, Tile, LVP"
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
                <ApplianceRow label="Refrigerator" name="applianceFridge" value={field.value} onChange={field.onChange} />
              )}
            />
            <Controller
              name="applianceRange"
              control={control}
              render={({ field }) => (
                <ApplianceRow label="Range / Stove" name="applianceRange" value={field.value} onChange={field.onChange} />
              )}
            />
            <Controller
              name="applianceDishwasher"
              control={control}
              render={({ field }) => (
                <ApplianceRow label="Dishwasher" name="applianceDishwasher" value={field.value} onChange={field.onChange} />
              )}
            />
            <Controller
              name="applianceHood"
              control={control}
              render={({ field }) => (
                <ApplianceRow label="Range Hood" name="applianceHood" value={field.value} onChange={field.onChange} />
              )}
            />
            <Controller
              name="applianceMicrowave"
              control={control}
              render={({ field }) => (
                <ApplianceRow label="Microwave" name="applianceMicrowave" value={field.value} onChange={field.onChange} />
              )}
            />
          </div>
        </div>

        {/* Island / peninsula */}
        <div>
          <Label htmlFor="islandPeninsula">Island / peninsula *</Label>
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
              />
            )}
          />
        </div>

        {/* Design help */}
        <div>
          <Label htmlFor="designHelp">Do you need design help / direction? *</Label>
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
            placeholder="Any other details about your project…"
            className={inputClass(!!errors.additionalNotes)}
            {...register("additionalNotes")}
          />
          <FieldError message={errors.additionalNotes?.message} />
        </div>

        <div className="pt-2">
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Saving…" : "Continue"}
          </Button>
        </div>
      </form>
    </div>
  )
}
