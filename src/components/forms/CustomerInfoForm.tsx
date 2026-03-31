import { Controller } from "react-hook-form"
import type { UseFormRegister, Control, FieldErrors } from "react-hook-form"
import { z } from "zod"
import { AddressAutocomplete } from "@/components/AddressAutocomplete"
import { Label, FieldError, inputClass } from "./formHelpers"

export const customerInfoSchema = z.object({
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

export type CustomerInfoData = z.infer<typeof customerInfoSchema>

type CustomerInfoFormProps = {
  register: UseFormRegister<CustomerInfoData>
  control: Control<CustomerInfoData>
  errors: FieldErrors<CustomerInfoData>
  readOnly: boolean
}

export function CustomerInfoForm({ register, control, errors, readOnly }: CustomerInfoFormProps) {
  return (
    <div className="space-y-4">
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

      {/* Phone + Cell */}
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
    </div>
  )
}
