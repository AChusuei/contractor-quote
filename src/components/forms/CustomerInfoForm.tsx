import type { UseFormRegister, FieldErrors } from "react-hook-form"
import { z } from "zod"
import { Label, FieldError, inputClass } from "./formHelpers"

export const customerInfoSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().refine((v) => v.replace(/\D/g, "").length >= 10, "Enter a valid phone number"),
  howDidYouFindUs: z.string().min(1, "Please tell us how you found us"),
  referredByContractor: z.string().optional(),
})

export type CustomerInfoData = z.infer<typeof customerInfoSchema>

type CustomerInfoFormProps = {
  register: UseFormRegister<CustomerInfoData>
  errors: FieldErrors<CustomerInfoData>
  readOnly: boolean
  disabled?: boolean
}

export function CustomerInfoForm({ register, errors, readOnly, disabled = false }: CustomerInfoFormProps) {
  const isDisabled = readOnly || disabled
  return (
    <div className="space-y-4">
      {/* Name */}
      <div>
        <Label htmlFor="name">Full Name {!readOnly && "*"}</Label>
        <input
          id="name"
          type="text"
          autoComplete="name"
          {...register("name")}
          disabled={isDisabled}
          className={inputClass(!!errors.name)}
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
          {...register("email")}
          disabled={isDisabled}
          className={inputClass(!!errors.email)}
        />
        <FieldError message={errors.email?.message} />
      </div>

      {/* Phone */}
      <div>
        <Label htmlFor="phone">Phone {!readOnly && "*"}</Label>
        <input
          id="phone"
          type="tel"
          autoComplete="tel"
          {...register("phone")}
          disabled={isDisabled}
          className={inputClass(!!errors.phone)}
        />
        <FieldError message={errors.phone?.message} />
      </div>

      {/* How did you find us */}
      <div>
        <Label htmlFor="howDidYouFindUs">How Did You Find Us? {!readOnly && "*"}</Label>
        <select
          id="howDidYouFindUs"
          {...register("howDidYouFindUs")}
          disabled={isDisabled}
          className={inputClass(!!errors.howDidYouFindUs)}
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
          {...register("referredByContractor")}
          disabled={isDisabled}
          className={inputClass(!!errors.referredByContractor)}
        />
        <FieldError message={errors.referredByContractor?.message} />
      </div>
    </div>
  )
}
