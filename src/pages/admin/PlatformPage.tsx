import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { useAuth, useUser } from "@clerk/clerk-react"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "components"
import { cn } from "@/lib/utils"
import { apiGet, apiPost, isNetworkError, setAuthProvider } from "@/lib/api"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContractorOwner {
  staffId: string
  name: string
  email: string
  clerkUserId: string | null
}

interface PlatformContractor {
  id: string
  slug: string
  name: string
  email: string | null
  phone: string | null
  owner: ContractorOwner | null
}

// ---------------------------------------------------------------------------
// Assign owner form schema
// ---------------------------------------------------------------------------

const assignOwnerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  clerkUserId: z.string().optional().or(z.literal("")),
})

type AssignOwnerForm = z.infer<typeof assignOwnerSchema>

// ---------------------------------------------------------------------------
// UI helpers (match SettingsPage conventions)
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
// Owner assignment form
// ---------------------------------------------------------------------------

function OwnerForm({
  contractorId,
  currentOwner,
  onComplete,
  onCancel,
}: {
  contractorId: string
  currentOwner: ContractorOwner | null
  onComplete: () => void
  onCancel: () => void
}) {
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AssignOwnerForm>({
    resolver: zodResolver(assignOwnerSchema),
    mode: "onTouched",
    defaultValues: {
      name: currentOwner?.name ?? "",
      email: currentOwner?.email ?? "",
      clerkUserId: currentOwner?.clerkUserId ?? "",
    },
  })

  async function onSubmit(data: AssignOwnerForm) {
    setSubmitError(null)
    const res = await apiPost(`/platform/contractors/${encodeURIComponent(contractorId)}/owner`, {
      name: data.name,
      email: data.email,
      clerkUserId: data.clerkUserId || undefined,
    })
    if (!res.ok) {
      const err = res as { error?: string; fields?: Record<string, string> }
      setSubmitError(err.fields ? Object.values(err.fields).join(", ") : (err.error ?? "Failed to assign owner"))
      return
    }
    onComplete()
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4 rounded-lg border border-border bg-muted/30 p-4"
    >
      <h3 className="text-sm font-medium">Assign Owner</h3>

      {submitError && (
        <p className="text-sm text-destructive">{submitError}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="ownerName">Name</Label>
          <input
            id="ownerName"
            type="text"
            className={inputClass(!!errors.name)}
            {...register("name")}
          />
          <FieldError message={errors.name?.message} />
        </div>

        <div>
          <Label htmlFor="ownerEmail">Email</Label>
          <input
            id="ownerEmail"
            type="email"
            className={inputClass(!!errors.email)}
            {...register("email")}
          />
          <FieldError message={errors.email?.message} />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="clerkUserId">Clerk User ID (optional)</Label>
          <input
            id="clerkUserId"
            type="text"
            placeholder="user_..."
            className={inputClass(!!errors.clerkUserId)}
            {...register("clerkUserId")}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Links this owner to their Clerk login. Found in the Clerk dashboard.
          </p>
          <FieldError message={errors.clerkUserId?.message} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : currentOwner ? "Update Owner" : "Assign Owner"}
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

export function PlatformPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const { user } = useUser()

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      setAuthProvider(() => getToken())
    }
  }, [isLoaded, isSignedIn, getToken])

  const [contractors, setContractors] = useState<PlatformContractor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingContractorId, setEditingContractorId] = useState<string | null>(null)

  const loadContractors = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiGet<PlatformContractor[]>("/platform/contractors")
      if (res.ok) {
        setContractors(res.data)
      } else if (isNetworkError(res)) {
        setError("API unreachable. Start the API server with wrangler dev.")
      } else {
        setError((res as { error?: string }).error ?? "Failed to load contractors")
      }
    } catch {
      setError("An unexpected error occurred")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadContractors()
  }, [loadContractors])

  function handleOwnerComplete() {
    setEditingContractorId(null)
    loadContractors()
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Platform Admin</h1>
        <p className="text-sm text-muted-foreground">
          Manage all contractors and assign ownership.
          {user?.primaryEmailAddress && (
            <> Signed in as <strong>{user.primaryEmailAddress.emailAddress}</strong>.</>
          )}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading contractors...</p>
      ) : contractors.length === 0 ? (
        <p className="text-sm text-muted-foreground">No contractors found.</p>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium">Contractor</th>
                  <th className="px-4 py-2 text-left font-medium">Slug</th>
                  <th className="px-4 py-2 text-left font-medium">Owner</th>
                  <th className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {contractors.map((contractor) => (
                  <tr key={contractor.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      <div>
                        <div className="font-medium">{contractor.name}</div>
                        {contractor.email && (
                          <div className="text-xs text-muted-foreground">{contractor.email}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {contractor.slug ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      {contractor.owner ? (
                        <div>
                          <span className="inline-block rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                            {contractor.owner.name}
                          </span>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {contractor.owner.email}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-amber-600 dark:text-amber-400">No owner assigned</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setEditingContractorId(
                            editingContractorId === contractor.id ? null : contractor.id
                          )
                        }
                      >
                        {editingContractorId === contractor.id
                          ? "Cancel"
                          : contractor.owner
                            ? "Change Owner"
                            : "Assign Owner"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {editingContractorId && (
            <OwnerForm
              key={editingContractorId}
              contractorId={editingContractorId}
              currentOwner={
                contractors.find((c) => c.id === editingContractorId)?.owner ?? null
              }
              onComplete={handleOwnerComplete}
              onCancel={() => setEditingContractorId(null)}
            />
          )}
        </div>
      )}
    </div>
  )
}
