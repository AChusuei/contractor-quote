import { useCallback, useEffect, useState } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAuth } from "@clerk/clerk-react"
import { Button } from "components"
import { apiGet, apiPatch, setAuthProvider } from "@/lib/api"
import { useAutoSave } from "@/hooks/useAutoSave"
import {
  contractorProfileSchema,
  type ContractorProfileData,
  ContractorProfileForm,
} from "@/components/forms/ContractorProfileForm"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StaffMember {
  id: string
  name: string
  email: string
  role: string
  phone: string | null
  active: boolean
  createdAt: string
  clerkUserId: string | null
}

interface ContractorDetail {
  id: string
  slug: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  websiteUrl: string | null
  licenseNumber: string | null
  logoUrl: string | null
  quoteCount: number
  customerCount: number
  staff: StaffMember[]
}

// ---------------------------------------------------------------------------
// Auto-save indicator
// ---------------------------------------------------------------------------

function SaveIndicator({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
  if (status === "idle") return null
  return (
    <span className={`text-xs ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
      {status === "saving" ? "Saving\u2026" : status === "saved" ? "Saved" : "Save failed"}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Role badge
// ---------------------------------------------------------------------------

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  admin: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  estimator: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  field_tech: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
}

function RoleBadge({ role }: { role: string }) {
  const colorClass = ROLE_COLORS[role] ?? "bg-muted text-muted-foreground"
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {role.replace("_", " ")}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SuperContractorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const navigate = useNavigate()
  const [contractor, setContractor] = useState<ContractorDetail | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      setAuthProvider(() => getToken())
    }
  }, [isLoaded, isSignedIn, getToken])

  const loadContractor = useCallback(async () => {
    if (!id || !isLoaded || !isSignedIn) return
    const res = await apiGet<ContractorDetail>(`/platform/contractors/${encodeURIComponent(id)}`)
    if (res.ok) {
      setContractor(res.data)
    } else {
      setNotFound(true)
    }
  }, [id, isLoaded, isSignedIn])

  useEffect(() => {
    loadContractor()
  }, [loadContractor])

  const {
    register,
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
      address: "",
      website: "",
      licenseNumber: "",
      slug: "",
    },
    values: contractor
      ? {
          name: contractor.name ?? "",
          email: contractor.email ?? "",
          phone: contractor.phone ?? "",
          address: contractor.address ?? "",
          website: contractor.websiteUrl ?? "",
          licenseNumber: contractor.licenseNumber ?? "",
          slug: contractor.slug ?? "",
        }
      : undefined,
  })

  const performSave = useCallback(async () => {
    if (!id || !contractor) return
    const { website, ...rest } = getValues()
    await apiPatch(`/platform/contractors/${encodeURIComponent(id)}`, { ...rest, websiteUrl: website })
  }, [id, contractor, getValues])

  const { trigger: triggerAutoSave, status: saveStatus } = useAutoSave(performSave)

  useEffect(() => {
    const sub = watch(() => triggerAutoSave())
    return () => sub.unsubscribe()
  }, [watch, triggerAutoSave])

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading\u2026</p>
      </div>
    )
  }

  if (notFound || !contractor) {
    if (notFound) {
      return (
        <div className="max-w-3xl mx-auto">
          <Link to="/admin/super/contractors" className="text-sm text-muted-foreground hover:text-foreground">
            &larr; Back to contractors
          </Link>
          <p className="mt-8 text-center text-muted-foreground">Contractor not found.</p>
        </div>
      )
    }
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading\u2026</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <Link to="/admin/super/contractors" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back to contractors
        </Link>
        <SaveIndicator status={saveStatus} />
      </div>

      <div>
        <h1 className="text-2xl font-semibold">{contractor.name}</h1>
        <p className="text-sm text-muted-foreground mt-1 font-mono">{contractor.slug}</p>
      </div>

      {/* Stats */}
      <div className="flex gap-6 text-sm">
        <div>
          <span className="font-medium">{contractor.quoteCount}</span>
          <span className="text-muted-foreground ml-1">quotes</span>
        </div>
        <div>
          <span className="font-medium">{contractor.customerCount}</span>
          <span className="text-muted-foreground ml-1">customers</span>
        </div>
        <div>
          <span className="font-medium">{contractor.staff.length}</span>
          <span className="text-muted-foreground ml-1">staff</span>
        </div>
      </div>

      {/* Portal link */}
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            sessionStorage.setItem("cq_super_contractor_id", contractor.id)
            sessionStorage.setItem("cq_super_contractor_name", contractor.name)
            navigate("/admin/quotes", { replace: true })
          }}
        >
          View Portal
        </Button>
        <p className="mt-1 text-xs text-muted-foreground">
          Enter the contractor portal as this contractor.
        </p>
      </div>

      {/* Contractor fields — always editable, auto-save */}
      <div>
        <h2 className="text-sm font-semibold text-foreground border-b pb-2 mb-4">
          Contractor Info
        </h2>
        <ContractorProfileForm register={register} errors={errors} showSlug />
      </div>

      {/* Staff list */}
      <div>
        <h2 className="text-sm font-semibold text-foreground border-b pb-2 mb-4">
          Staff ({contractor.staff.length})
        </h2>
        {contractor.staff.length === 0 ? (
          <p className="text-sm text-muted-foreground">No staff members.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium">Name</th>
                  <th className="px-4 py-2 text-left font-medium">Email</th>
                  <th className="px-4 py-2 text-left font-medium">Role</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {contractor.staff.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium">{s.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{s.email}</td>
                    <td className="px-4 py-2">
                      <RoleBadge role={s.role} />
                    </td>
                    <td className="px-4 py-2">
                      {s.active ? (
                        <span className="text-xs text-green-700 dark:text-green-400">Active</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Inactive</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
