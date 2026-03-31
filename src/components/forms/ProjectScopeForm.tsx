import { Controller } from "react-hook-form"
import type { UseFormRegister, Control, FieldErrors, UseFormWatch } from "react-hook-form"
import { z } from "zod"
import { Label, FieldError, inputClass, RadioGroup, ApplianceRow } from "./formHelpers"

const applianceSchema = z.enum(["new", "existing", "none"])

export const projectScopeSchema = z.object({
  jobSiteAddress: z.string().min(1, "Job site address is required"),
  propertyType: z.enum(["house", "apt", "building", "townhouse"], { error: "Please select an option" }),
  budgetRange: z.enum(["<10k", "10-25k", "25-50k", "50k+"], { error: "Please select an option" }),
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

export type ProjectScopeData = z.infer<typeof projectScopeSchema>

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

type ProjectScopeFormProps = {
  register: UseFormRegister<ProjectScopeData>
  control: Control<ProjectScopeData>
  errors: FieldErrors<ProjectScopeData>
  watch: UseFormWatch<ProjectScopeData>
  readOnly: boolean
}

export function ProjectScopeForm({ register, control, errors, watch, readOnly }: ProjectScopeFormProps) {
  const layoutChanges = watch("layoutChanges")
  const flooringAction = watch("flooringAction")

  return (
    <div className="space-y-6">
      {/* Job site address */}
      <div>
        <Label htmlFor="jobSiteAddress">Job Site Address {!readOnly && "*"}</Label>
        <input
          id="jobSiteAddress"
          type="text"
          autoComplete="street-address"
          placeholder={readOnly ? "" : "Enter job site address"}
          disabled={readOnly}
          className={inputClass(!!errors.jobSiteAddress)}
          {...register("jobSiteAddress")}
        />
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
            Layout changes may require a building permit. We'll confirm permit requirements during your consultation.
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
                { value: "medium", label: "Medium (70\u2013150 sq ft)" },
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <select
              id="flooringType"
              disabled={readOnly}
              className={inputClass(!!errors.flooringType)}
              {...register("flooringType")}
              defaultValue=""
            >
              <option value="" disabled>Select flooring type</option>
              <option value="lvp">Luxury Vinyl Plank (LVP)</option>
              <option value="lvt">Luxury Vinyl Tile (LVT)</option>
              <option value="hardwood">Hardwood</option>
              <option value="engineered_hardwood">Engineered Hardwood</option>
              <option value="ceramic_tile">Ceramic Tile</option>
              <option value="porcelain_tile">Porcelain Tile</option>
              <option value="natural_stone">Natural Stone (Marble, Slate, Travertine)</option>
              <option value="laminate">Laminate</option>
              <option value="linoleum">Linoleum / Sheet Vinyl</option>
              <option value="cork">Cork</option>
              <option value="concrete">Polished Concrete</option>
              <option value="undecided">Not sure yet</option>
            </select>
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
          placeholder={readOnly ? "" : "Any other details about your project\u2026"}
          disabled={readOnly}
          className={inputClass(!!errors.additionalNotes)}
          {...register("additionalNotes")}
        />
        <FieldError message={errors.additionalNotes?.message} />
      </div>
    </div>
  )
}
