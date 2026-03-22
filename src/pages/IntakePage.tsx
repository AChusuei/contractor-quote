import { useState } from "react"
import { useForm, Controller } from "react-hook-form"
import { useNavigate } from "react-router-dom"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "components"
import { cn } from "@/lib/utils"
import { AddressAutocomplete } from "@/components/AddressAutocomplete"

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().refine((v) => v.replace(/\D/g, "").length >= 10, "Enter a valid phone number"),
  cell: z.string().refine((v) => v === "" || v.replace(/\D/g, "").length >= 10, "Enter a valid phone number").optional(),
  jobSiteAddress: z.string({ required_error: "Job site address is required" }).min(1, "Job site address is required"),
  propertyType: z.enum(["house", "apt", "building", "townhouse"]).refine(
    (v) => v.length > 0,
    { message: "Select a property type" }
  ),
  budgetRange: z.enum(["<10k", "10-25k", "25-50k", "50k+"]).refine(
    (v) => v.length > 0,
    { message: "Select a budget range" }
  ),
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
  const navigate = useNavigate()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<IntakeFormData>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      cell: "",
      jobSiteAddress: "",
      howDidYouFindUs: "",
      referredByContractor: "",
    },
  })

  const onSubmit = async (data: IntakeFormData) => {
    setSubmitError(null)
    try {
      await submitToHubSpot(data)
      navigate("/intake/scope")
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed. Please try again.")
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Request a Quote</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tell us about your project and we'll get back to you with a free estimate.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {/* Name */}
        <div>
          <Label htmlFor="name">Full Name *</Label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            className={inputClass(!!errors.name)}
            {...register("name")}
          />
          <FieldError message={errors.name?.message} />
        </div>

        {/* Email */}
        <div>
          <Label htmlFor="email">Email *</Label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className={inputClass(!!errors.email)}
            {...register("email")}
          />
          <FieldError message={errors.email?.message} />
        </div>

        {/* Phone + Cell */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="phone">Phone *</Label>
            <input
              id="phone"
              type="tel"
              autoComplete="tel"
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
              className={inputClass(!!errors.cell)}
              {...register("cell")}
            />
            <FieldError message={errors.cell?.message} />
          </div>
        </div>

        {/* Job site address */}
        <div>
          <Label htmlFor="jobSiteAddress">Job Site Address *</Label>
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
          <FieldError message={errors.jobSiteAddress?.message} />
        </div>

        {/* Property type */}
        <div>
          <Label htmlFor="propertyType">Property Type *</Label>
          <select
            id="propertyType"
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
          <Label htmlFor="budgetRange">Budget Range *</Label>
          <select
            id="budgetRange"
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
          <Label htmlFor="howDidYouFindUs">How Did You Find Us? *</Label>
          <select
            id="howDidYouFindUs"
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
            placeholder="Leave blank if not applicable"
            className={inputClass(!!errors.referredByContractor)}
            {...register("referredByContractor")}
          />
          <FieldError message={errors.referredByContractor?.message} />
        </div>

        {submitError && (
          <p className="text-sm text-destructive">{submitError}</p>
        )}

        <div className="pt-2">
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Submitting…" : "Continue"}
          </Button>
        </div>
      </form>
    </div>
  )
}
