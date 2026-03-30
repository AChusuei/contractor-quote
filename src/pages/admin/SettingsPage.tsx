import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { useAuth } from "@clerk/clerk-react"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "components"
import { cn } from "@/lib/utils"
import { apiGet, apiPost, apiPatch, apiUpload, isNetworkError, setAuthProvider } from "@/lib/api"

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

type Theme = "light" | "dark" | "system"

const THEME_KEY = "cq_theme"

function getStoredTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === "light" || stored === "dark" || stored === "system") return stored
  return "system"
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    root.classList.toggle("dark", prefersDark)
  } else {
    root.classList.toggle("dark", theme === "dark")
  }
}

const themeOptions: { value: Theme; label: string; description: string }[] = [
  { value: "light", label: "Light", description: "Always use light mode" },
  { value: "dark", label: "Dark", description: "Always use dark mode" },
  { value: "system", label: "System", description: "Follow your device settings" },
]

// ---------------------------------------------------------------------------
// Contractor Profile
// ---------------------------------------------------------------------------

const PROFILE_KEY = "cq_contractor_profile"

const profileSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  contactName: z.string().min(1, "Contact name is required"),
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  phone: z.string().refine(
    (v) => v === "" || v.replace(/\D/g, "").length >= 10,
    "Enter a valid phone number",
  ),
  website: z.string().refine(
    (v) => v === "" || /^https?:\/\/.+/.test(v),
    "Enter a valid URL starting with http:// or https://",
  ).optional().or(z.literal("")),
  logoUrl: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  licenseNumber: z.string().optional().or(z.literal("")),
})

type ContractorProfile = z.infer<typeof profileSchema>

function loadProfile(): ContractorProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (raw) return JSON.parse(raw) as ContractorProfile
  } catch {
    // ignore corrupt data
  }
  return {
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    website: "",
    logoUrl: "",
    address: "",
    licenseNumber: "",
  }
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

const STAFF_STORAGE_KEY = "cq_staff"

const STAFF_ROLES = ["owner", "admin", "estimator", "field_tech"] as const
type StaffRole = (typeof STAFF_ROLES)[number]

const ROLE_LABELS: Record<StaffRole, string> = {
  owner: "Owner",
  admin: "Admin",
  estimator: "Estimator",
  field_tech: "Field Tech",
}

interface StaffMember {
  id: string
  name: string
  email: string
  role: StaffRole
  phone: string
  active: boolean
  createdAt: string
}

const staffFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  role: z.enum(STAFF_ROLES, { error: "Select a role" }),
  phone: z
    .string()
    .refine(
      (v) => v === "" || v.replace(/\D/g, "").length >= 10,
      "Enter a valid phone number (at least 10 digits)",
    )
    .optional()
    .or(z.literal("")),
})

type StaffFormData = z.infer<typeof staffFormSchema>

function loadStaffFromStorage(): StaffMember[] {
  try {
    const raw = localStorage.getItem(STAFF_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as StaffMember[]
  } catch {
    // ignore corrupt data
  }
  return []
}

function saveStaffToStorage(staff: StaffMember[]) {
  localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(staff))
}

type StaffApiResult = { ok: boolean; data?: unknown; error?: string; code?: string; fields?: Record<string, string> }

async function fetchStaffApi(
  method: string,
  path: string,
  body?: unknown,
): Promise<StaffApiResult> {
  if (method === "GET") {
    return apiGet(path) as Promise<StaffApiResult>
  } else if (method === "POST") {
    return apiPost(path, body) as Promise<StaffApiResult>
  } else if (method === "PATCH") {
    return apiPatch(path, body) as Promise<StaffApiResult>
  }
  return { ok: false, error: `Unsupported method: ${method}` }
}

function mapApiStaff(raw: Record<string, unknown>): StaffMember {
  return {
    id: raw.id as string,
    name: raw.name as string,
    email: raw.email as string,
    role: raw.role as StaffRole,
    phone: (raw.phone as string) ?? "",
    active: raw.active === 1 || raw.active === true,
    createdAt: raw.createdAt as string,
  }
}

// ---------------------------------------------------------------------------
// Shared UI helpers (match IntakePage conventions)
// ---------------------------------------------------------------------------

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium">
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
    hasError ? "border-destructive" : "border-input",
  )
}

// ---------------------------------------------------------------------------
// Staff inline form
// ---------------------------------------------------------------------------

function StaffForm({
  initialData,
  onSubmit,
  onCancel,
  isEdit,
}: {
  initialData?: StaffMember
  onSubmit: (data: StaffFormData) => Promise<void>
  onCancel: () => void
  isEdit: boolean
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StaffFormData>({
    resolver: zodResolver(staffFormSchema),
    mode: "onTouched",
    defaultValues: {
      name: initialData?.name ?? "",
      email: initialData?.email ?? "",
      role: initialData?.role ?? "estimator",
      phone: initialData?.phone ?? "",
    },
  })

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4 rounded-lg border border-border bg-muted/30 p-4"
    >
      <h3 className="text-sm font-medium">
        {isEdit ? "Edit Staff Member" : "Add Staff Member"}
      </h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="staffName">Name</Label>
          <input
            id="staffName"
            type="text"
            className={inputClass(!!errors.name)}
            {...register("name")}
          />
          <FieldError message={errors.name?.message} />
        </div>

        <div>
          <Label htmlFor="staffEmail">Email</Label>
          <input
            id="staffEmail"
            type="email"
            className={inputClass(!!errors.email)}
            {...register("email")}
          />
          <FieldError message={errors.email?.message} />
        </div>

        <div>
          <Label htmlFor="staffRole">Role</Label>
          <select
            id="staffRole"
            className={inputClass(!!errors.role)}
            {...register("role")}
          >
            {STAFF_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <FieldError message={errors.role?.message} />
        </div>

        <div>
          <Label htmlFor="staffPhone">Phone</Label>
          <input
            id="staffPhone"
            type="tel"
            className={inputClass(!!errors.phone)}
            {...register("phone")}
          />
          <FieldError message={errors.phone?.message} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : isEdit ? "Update" : "Add"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SettingsPage() {
  const { isLoaded, isSignedIn, getToken, userId } = useAuth()

  // Wire up Clerk auth for API calls
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      setAuthProvider(() => getToken())
    }
  }, [isLoaded, isSignedIn, getToken])

  // ---- Theme state ----
  const [theme, setTheme] = useState<Theme>(getStoredTheme)

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme)
    applyTheme(theme)

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)")
      const handler = () => applyTheme("system")
      mq.addEventListener("change", handler)
      return () => mq.removeEventListener("change", handler)
    }
  }, [theme])

  // ---- Staff state ----
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [staffLoading, setStaffLoading] = useState(true)
  const [showStaffForm, setShowStaffForm] = useState(false)
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null)
  const [staffError, setStaffError] = useState<string | null>(null)

  const loadStaff = useCallback(async () => {
    setStaffLoading(true)
    setStaffError(null)
    try {
      const res = await fetchStaffApi("GET", "/staff")
      if (res.ok && Array.isArray(res.data)) {
        setStaffList((res.data as Record<string, unknown>[]).map(mapApiStaff))
      } else if (isNetworkError(res)) {
        console.warn("API unreachable — falling back to localStorage for staff")
        setStaffList(loadStaffFromStorage())
      } else {
        setStaffList(loadStaffFromStorage())
      }
    } catch {
      setStaffList(loadStaffFromStorage())
    } finally {
      setStaffLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStaff()
  }, [loadStaff])

  async function handleStaffSubmit(data: StaffFormData) {
    setStaffError(null)
    try {
      if (editingStaffId) {
        const res = await fetchStaffApi("PATCH", `/staff/${editingStaffId}`, data)
        if (!res.ok) {
          if (isNetworkError(res)) {
            // localStorage fallback for edit
            setStaffList((prev) => {
              const updated = prev.map((s) =>
                s.id === editingStaffId
                  ? { ...s, name: data.name, email: data.email, role: data.role, phone: data.phone ?? "" }
                  : s,
              )
              saveStaffToStorage(updated)
              return updated
            })
          } else {
            const errRes = res
            setStaffError(errRes.fields ? Object.values(errRes.fields).join(", ") : (errRes.error ?? "Failed to update staff member"))
            return
          }
        } else {
          await loadStaff()
        }
      } else {
        const res = await fetchStaffApi("POST", "/staff", data)
        if (!res.ok) {
          if (isNetworkError(res)) {
            // localStorage fallback for create
            const newMember: StaffMember = {
              id: crypto.randomUUID(),
              name: data.name,
              email: data.email,
              role: data.role,
              phone: data.phone ?? "",
              active: true,
              createdAt: new Date().toISOString(),
            }
            setStaffList((prev) => {
              const updated = [...prev, newMember]
              saveStaffToStorage(updated)
              return updated
            })
          } else {
            const errRes = res
            setStaffError(errRes.fields ? Object.values(errRes.fields).join(", ") : (errRes.error ?? "Failed to create staff member"))
            return
          }
        } else {
          await loadStaff()
        }
      }
      setShowStaffForm(false)
      setEditingStaffId(null)
    } catch {
      setStaffError("An unexpected error occurred")
    }
  }

  async function handleDeactivateStaff(id: string) {
    setStaffError(null)
    try {
      const res = await fetchStaffApi("PATCH", `/staff/${id}`, { active: false })
      if (!res.ok) {
        if (isNetworkError(res)) {
          // localStorage fallback
          setStaffList((prev) => {
            const updated = prev.map((s) => (s.id === id ? { ...s, active: false } : s))
            saveStaffToStorage(updated)
            return updated
          })
        } else {
          setStaffError(res.error ?? "Failed to deactivate staff member")
          return
        }
      } else {
        await loadStaff()
      }
    } catch {
      setStaffError("Failed to deactivate staff member")
    }
  }

  function startEditStaff(member: StaffMember) {
    setEditingStaffId(member.id)
    setShowStaffForm(true)
    setStaffError(null)
  }

  function cancelStaffForm() {
    setShowStaffForm(false)
    setEditingStaffId(null)
    setStaffError(null)
  }

  // ---- Profile form ----
  const [saved, setSaved] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ContractorProfile>({
    resolver: zodResolver(profileSchema),
    mode: "onTouched",
    defaultValues: loadProfile(),
  })

  async function onSave(data: ContractorProfile) {
    // Save to localStorage as immediate cache
    localStorage.setItem(PROFILE_KEY, JSON.stringify(data))

    // Also try to save to API
    const contractorId = import.meta.env.VITE_CQ_CONTRACTOR_ID ?? "contractor-001"
    await apiPatch(`/contractors/${encodeURIComponent(contractorId)}`, data)

    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  // ---- Logo preview ----
  const [logoPreview, setLogoPreview] = useState<string>(() => loadProfile().logoUrl ?? "")

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Show preview immediately
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setLogoPreview(dataUrl)
      setValue("logoUrl", dataUrl, { shouldDirty: true })
    }
    reader.readAsDataURL(file)

    // Upload via API
    const contractorId = import.meta.env.VITE_CQ_CONTRACTOR_ID ?? "contractor-001"
    const formData = new FormData()
    formData.append("file", file)
    const res = await apiUpload<{ logoUrl: string }>(
      `/contractors/${encodeURIComponent(contractorId)}/logo`,
      formData,
    )
    if (res.ok) {
      setValue("logoUrl", res.data.logoUrl, { shouldDirty: true })
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your admin preferences.</p>
      </div>

      {/* ---- Contractor Profile ---- */}
      <form onSubmit={handleSubmit(onSave)} className="space-y-6">
        <div>
          <h2 className="text-lg font-medium">Contractor Profile</h2>
          <p className="text-sm text-muted-foreground">
            Your company info for emails, branding, and the contractor record.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Company Name */}
          <div>
            <Label htmlFor="companyName">Company Name</Label>
            <input
              id="companyName"
              type="text"
              className={inputClass(!!errors.companyName)}
              {...register("companyName")}
            />
            <FieldError message={errors.companyName?.message} />
          </div>

          {/* Contact Name */}
          <div>
            <Label htmlFor="contactName">Owner / Contact Name</Label>
            <input
              id="contactName"
              type="text"
              className={inputClass(!!errors.contactName)}
              {...register("contactName")}
            />
            <FieldError message={errors.contactName?.message} />
          </div>

          {/* Email */}
          <div>
            <Label htmlFor="profileEmail">Email</Label>
            <input
              id="profileEmail"
              type="email"
              placeholder="Used as from address for emails"
              className={inputClass(!!errors.email)}
              {...register("email")}
            />
            <FieldError message={errors.email?.message} />
          </div>

          {/* Phone */}
          <div>
            <Label htmlFor="profilePhone">Phone</Label>
            <input
              id="profilePhone"
              type="tel"
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
              className={inputClass(!!errors.licenseNumber)}
              {...register("licenseNumber")}
            />
            <FieldError message={errors.licenseNumber?.message} />
          </div>
        </div>

        {/* Address — full width */}
        <div>
          <Label htmlFor="address">Business Address</Label>
          <input
            id="address"
            type="text"
            className={inputClass(!!errors.address)}
            {...register("address")}
          />
          <FieldError message={errors.address?.message} />
        </div>

        {/* Logo Upload */}
        <div>
          <Label htmlFor="logoUpload">Logo</Label>
          <div className="flex items-center gap-4">
            {logoPreview && (
              <img
                src={logoPreview}
                alt="Logo preview"
                className="h-16 w-16 rounded-md border border-border object-contain"
              />
            )}
            <div className="flex-1">
              <input
                id="logoUpload"
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent/80"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                PNG, JPG, or SVG. Used in email signatures and white-label branding.
              </p>
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving\u2026" : "Save Profile"}
          </Button>
          {saved && (
            <span className="text-sm font-medium text-green-600 dark:text-green-400">
              Profile saved
            </span>
          )}
        </div>
      </form>

      {/* ---- Staff ---- */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium">Staff</h2>
            <p className="text-sm text-muted-foreground">
              Manage your team members and their roles.
            </p>
          </div>
          {!showStaffForm && (
            <Button
              size="sm"
              onClick={() => {
                setEditingStaffId(null)
                setShowStaffForm(true)
                setStaffError(null)
              }}
            >
              Add Staff
            </Button>
          )}
        </div>

        {staffError && (
          <p className="text-sm text-destructive">{staffError}</p>
        )}

        {showStaffForm && (
          <StaffForm
            key={editingStaffId ?? "new"}
            initialData={
              editingStaffId
                ? staffList.find((s) => s.id === editingStaffId)
                : undefined
            }
            onSubmit={handleStaffSubmit}
            onCancel={cancelStaffForm}
            isEdit={!!editingStaffId}
          />
        )}

        {staffLoading ? (
          <p className="text-sm text-muted-foreground">Loading staff...</p>
        ) : staffList.length === 0 ? (
          <p className="text-sm text-muted-foreground">No staff members yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium">Name</th>
                  <th className="px-4 py-2 text-left font-medium">Email</th>
                  <th className="px-4 py-2 text-left font-medium">Role</th>
                  <th className="px-4 py-2 text-left font-medium">Phone</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staffList.map((member) => (
                  <tr key={member.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">{member.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{member.email}</td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                          member.role === "owner"
                            ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                            : member.role === "admin"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                              : member.role === "estimator"
                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
                        )}
                      >
                        {ROLE_LABELS[member.role]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{member.phone || "—"}</td>
                    <td className="px-4 py-2">
                      {member.active ? (
                        <span className="text-xs font-medium text-green-600 dark:text-green-400">Active</span>
                      ) : (
                        <span className="text-xs font-medium text-muted-foreground">Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEditStaff(member)}
                        >
                          Edit
                        </Button>
                        {member.active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeactivateStaff(member.id)}
                          >
                            Deactivate
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- Appearance ---- */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Appearance</h2>
        <p className="text-sm text-muted-foreground">
          Choose how the admin panel looks to you.
        </p>

        <div className="grid gap-3">
          {themeOptions.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-center gap-4 rounded-lg border p-4 transition-colors ${
                theme === option.value
                  ? "border-primary bg-accent"
                  : "border-border hover:bg-accent/50"
              }`}
            >
              <input
                type="radio"
                name="theme"
                value={option.value}
                checked={theme === option.value}
                onChange={() => setTheme(option.value)}
                className="h-4 w-4 accent-primary"
              />
              <div>
                <div className="text-sm font-medium">{option.label}</div>
                <div className="text-xs text-muted-foreground">{option.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
