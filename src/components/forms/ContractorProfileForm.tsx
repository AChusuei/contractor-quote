import type { UseFormRegister, FieldErrors } from "react-hook-form"
import { z } from "zod"
import { Label, FieldError, inputClass } from "./formHelpers"

export const contractorProfileSchema = z.object({
  name: z.string().min(1, "Company name is required"),
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address")
    .or(z.literal(""))
    .optional(),
  phone: z
    .string()
    .refine(
      (v) => v === "" || v.replace(/\D/g, "").length >= 10,
      "Enter a valid phone number",
    )
    .optional()
    .or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  website: z
    .string()
    .refine(
      (v) => v === "" || /^https?:\/\/.+/.test(v),
      "Enter a valid URL starting with http:// or https://",
    )
    .optional()
    .or(z.literal("")),
  licenseNumber: z.string().optional().or(z.literal("")),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens")
    .optional()
    .or(z.literal("")),
})

export type ContractorProfileData = z.infer<typeof contractorProfileSchema>

type ContractorProfileFormProps = {
  register: UseFormRegister<ContractorProfileData>
  errors: FieldErrors<ContractorProfileData>
  readOnly?: boolean
  /** When true, renders the slug field (super admin only). */
  showSlug?: boolean
}

export function ContractorProfileForm({
  register,
  errors,
  readOnly = false,
  showSlug = false,
}: ContractorProfileFormProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Company Name */}
      <div>
        <Label htmlFor="name">Company Name {!readOnly && "*"}</Label>
        <input
          id="name"
          type="text"
          disabled={readOnly}
          className={inputClass(!!errors.name)}
          {...register("name")}
        />
        <FieldError message={errors.name?.message} />
      </div>

      {/* Slug — super admin only */}
      {showSlug && (
        <div>
          <Label htmlFor="slug">Slug *</Label>
          <input
            id="slug"
            type="text"
            disabled={readOnly}
            className={inputClass(!!errors.slug)}
            {...register("slug")}
          />
          <FieldError message={errors.slug?.message} />
        </div>
      )}

      {/* Email */}
      <div>
        <Label htmlFor="email">Email</Label>
        <input
          id="email"
          type="email"
          disabled={readOnly}
          className={inputClass(!!errors.email)}
          {...register("email")}
        />
        <FieldError message={errors.email?.message} />
      </div>

      {/* Phone */}
      <div>
        <Label htmlFor="phone">Phone</Label>
        <input
          id="phone"
          type="tel"
          disabled={readOnly}
          className={inputClass(!!errors.phone)}
          {...register("phone")}
        />
        <FieldError message={errors.phone?.message} />
      </div>

      {/* Website */}
      <div>
        <Label htmlFor="website">Website</Label>
        <input
          id="website"
          type="url"
          placeholder="https://example.com"
          disabled={readOnly}
          className={inputClass(!!errors.website)}
          {...register("website")}
        />
        <FieldError message={errors.website?.message} />
      </div>

      {/* License Number */}
      <div>
        <Label htmlFor="licenseNumber">License Number</Label>
        <input
          id="licenseNumber"
          type="text"
          disabled={readOnly}
          className={inputClass(!!errors.licenseNumber)}
          {...register("licenseNumber")}
        />
        <FieldError message={errors.licenseNumber?.message} />
      </div>

      {/* Address — full width */}
      <div className="sm:col-span-2">
        <Label htmlFor="address">Business Address</Label>
        <input
          id="address"
          type="text"
          disabled={readOnly}
          className={inputClass(!!errors.address)}
          {...register("address")}
        />
        <FieldError message={errors.address?.message} />
      </div>
    </div>
  )
}
