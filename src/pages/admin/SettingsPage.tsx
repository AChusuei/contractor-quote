import { useCallback, useEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useAuth } from "@clerk/clerk-react"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "components"
import { cn } from "@/lib/utils"
import { apiGet, apiPost, apiPatch, apiDelete, apiUpload, isNetworkError, setAuthProvider } from "@/lib/api"
import { useContractorSession } from "@/contexts/ContractorSession"
import { contractorProfileSchema, type ContractorProfileData, ContractorProfileForm } from "@/components/forms/ContractorProfileForm"
import { useAutoSave } from "@/hooks/useAutoSave"

// ---------------------------------------------------------------------------
// Contractor Profile
// ---------------------------------------------------------------------------

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
// Billing
// ---------------------------------------------------------------------------

interface BillingInfo {
  billingStatus: string
  monthlyRateCents: number | null
  nextBillingDate: string | null
  paddleCustomerId: string | null
  gracePeriodEndsAt: string | null
}

function formatDollars(cents: number | null): string {
  if (cents === null) return "—"
  return `$${(cents / 100).toFixed(0)}/mo`
}

function BillingStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    trial: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    past_due: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    suspended: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    canceled: "bg-muted text-muted-foreground",
  }
  const label: Record<string, string> = {
    active: "Active",
    trial: "Trial",
    past_due: "Past Due",
    suspended: "Suspended",
    canceled: "Canceled",
  }
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
        styles[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {label[status] ?? status}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type SettingsTab = "profile" | "staff" | "billing"

const ALL_SETTINGS_TABS: { id: SettingsTab; label: string; roles?: string[] }[] = [
  { id: "profile", label: "Profile" },
  { id: "staff", label: "Staff" },
  { id: "billing", label: "Billing", roles: ["owner", "admin"] },
]

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
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const { contractorId, userRole } = useContractorSession()
  const canAccessBilling = userRole === "owner" || userRole === "admin"
  const visibleTabs = ALL_SETTINGS_TABS.filter(
    (t) => !t.roles || t.roles.includes(userRole),
  )
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile")

  // ---- Billing state ----
  const [billing, setBilling] = useState<BillingInfo | null>(null)
  const [billingLoading, setBillingLoading] = useState(false)
  const [billingError, setBillingError] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const loadBilling = useCallback(async () => {
    if (!contractorId || !canAccessBilling) return
    setBillingLoading(true)
    setBillingError(null)
    try {
      const res = await apiGet<BillingInfo>(`/contractors/${encodeURIComponent(contractorId)}/billing`)
      if (res.ok) {
        setBilling(res.data)
      } else {
        setBillingError(res.error ?? "Failed to load billing info")
      }
    } finally {
      setBillingLoading(false)
    }
  }, [contractorId, canAccessBilling])

  useEffect(() => {
    if (activeTab === "billing") loadBilling()
  }, [activeTab, loadBilling])

  async function handleManagePayment() {
    if (!contractorId) return
    setPortalLoading(true)
    setBillingError(null)
    try {
      const res = await apiPost<{ portalUrl: string }>(
        `/contractors/${encodeURIComponent(contractorId)}/billing/portal`,
      )
      if (res.ok) {
        window.location.href = res.data.portalUrl
      } else {
        setBillingError(res.error ?? "Failed to open billing portal")
      }
    } finally {
      setPortalLoading(false)
    }
  }

  async function handleCancelSubscription() {
    if (!contractorId) return
    setCancelLoading(true)
    setCancelError(null)
    try {
      const res = await apiDelete<{ canceled: boolean }>(
        `/contractors/${encodeURIComponent(contractorId)}/billing/cancel`,
      )
      if (res.ok) {
        setShowCancelConfirm(false)
        await loadBilling()
      } else {
        setCancelError(res.error ?? "Failed to cancel subscription")
      }
    } finally {
      setCancelLoading(false)
    }
  }

  // Wire up Clerk auth for API calls
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      setAuthProvider(() => getToken())
    }
  }, [isLoaded, isSignedIn, getToken])

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
        if (import.meta.env.DEV) console.warn("API unreachable — falling back to localStorage for staff")
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
  const {
    register,
    reset,
    watch,
    getValues,
    formState: { errors },
  } = useForm<ContractorProfileData>({
    resolver: zodResolver(contractorProfileSchema),
    mode: "onTouched",
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      website: "",
      address: "",
      licenseNumber: "",
    },
  })

  // ---- Logo preview ----
  const [logoPreview, setLogoPreview] = useState<string>("")
  const [selectedFileName, setSelectedFileName] = useState<string>("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load profile from API on mount
  useEffect(() => {
    if (!contractorId) return
    apiGet<{
      name: string
      email: string | null
      phone: string | null
      address: string | null
      websiteUrl: string | null
      licenseNumber: string | null
      logoUrl: string | null
    }>(`/contractors/${encodeURIComponent(contractorId)}`).then((res) => {
      if (res.ok) {
        reset({
          name: res.data.name ?? "",
          email: res.data.email ?? "",
          phone: res.data.phone ?? "",
          website: res.data.websiteUrl ?? "",
          address: res.data.address ?? "",
          licenseNumber: res.data.licenseNumber ?? "",
        })
        setLogoPreview(res.data.logoUrl ?? "")
      }
    })
  }, [contractorId, reset])

  const performSave = useCallback(async () => {
    if (!contractorId) return
    const { website, ...rest } = getValues()
    await apiPatch(`/contractors/${encodeURIComponent(contractorId)}`, { ...rest, websiteUrl: website })
  }, [contractorId, getValues])

  const { trigger: triggerAutoSave } = useAutoSave(performSave)

  useEffect(() => {
    const sub = watch(() => triggerAutoSave())
    return () => sub.unsubscribe()
  }, [watch, triggerAutoSave])

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setSelectedFileName(file.name)

    // Show preview immediately
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setLogoPreview(dataUrl)
    }
    reader.readAsDataURL(file)

    // Upload via API
    const formData = new FormData()
    formData.append("file", file)
    if (!contractorId) return
    const res = await apiUpload<{ logoUrl: string }>(
      `/contractors/${encodeURIComponent(contractorId)}/logo`,
      formData,
    )
    if (res.ok) {
      setLogoPreview(res.data.logoUrl)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your admin preferences.</p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center border-b">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ---- Profile Tab ---- */}
      {activeTab === "profile" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-medium">Contractor Profile</h2>
            <p className="text-sm text-muted-foreground">
              Your company info for emails, branding, and the contractor record.
            </p>
          </div>

          <ContractorProfileForm register={register} errors={errors} />

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
                  ref={fileInputRef}
                  id="logoUpload"
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose File
                  </Button>
                  {selectedFileName && (
                    <span className="text-sm text-muted-foreground">{selectedFileName}</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  PNG, JPG, or SVG. Used in email signatures and white-label branding.
                </p>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ---- Billing Tab ---- */}
      {activeTab === "billing" && canAccessBilling && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-medium">Billing</h2>
            <p className="text-sm text-muted-foreground">
              Manage your subscription and payment method.
            </p>
          </div>

          {billingLoading && (
            <p className="text-sm text-muted-foreground">Loading billing info…</p>
          )}

          {billingError && !billingLoading && (
            <p className="text-sm text-destructive">{billingError}</p>
          )}

          {billing && !billingLoading && (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Status
                  </p>
                  <div className="mt-1">
                    <BillingStatusBadge status={billing.billingStatus} />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Monthly Rate
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {formatDollars(billing.monthlyRateCents)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Next Billing Date
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {billing.nextBillingDate
                      ? new Date(billing.nextBillingDate).toLocaleDateString()
                      : "—"}
                  </p>
                </div>
              </div>

              {billing.gracePeriodEndsAt && (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Grace period ends{" "}
                  {new Date(billing.gracePeriodEndsAt).toLocaleDateString()}
                </p>
              )}

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleManagePayment}
                  disabled={portalLoading}
                >
                  {portalLoading ? "Redirecting…" : "Manage payment method"}
                </Button>

                {userRole === "owner" &&
                  billing.billingStatus !== "canceled" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        setShowCancelConfirm(true)
                        setCancelError(null)
                      }}
                    >
                      Cancel subscription
                    </Button>
                  )}
              </div>

              {showCancelConfirm && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                  <p className="text-sm font-medium text-destructive">
                    Cancel your subscription?
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Your account will remain active until the end of the billing period,
                    then be deactivated.
                  </p>
                  {cancelError && (
                    <p className="text-sm text-destructive">{cancelError}</p>
                  )}
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      size="sm"
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={handleCancelSubscription}
                      disabled={cancelLoading}
                    >
                      {cancelLoading ? "Canceling…" : "Yes, cancel subscription"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowCancelConfirm(false)
                        setCancelError(null)
                      }}
                    >
                      Keep subscription
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---- Staff Tab ---- */}
      {activeTab === "staff" && (
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
                      <td className="px-4 py-2 text-muted-foreground">{member.phone || "\u2014"}</td>
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
      )}

    </div>
  )
}
