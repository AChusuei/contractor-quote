import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useAuth, useUser } from "@clerk/clerk-react"
import { Button } from "components"
import { Label, FieldError, inputClass } from "@/components/forms/formHelpers"
import { apiGet, apiPost, apiDelete, isNetworkError, setAuthProvider } from "@/lib/api"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SuperUser {
  id: string
  email: string
  name: string
  createdAt: string | null
}

// ---------------------------------------------------------------------------
// Add super user form
// ---------------------------------------------------------------------------

const addUserSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  name: z
    .string()
    .min(1, "Name is required"),
})

type AddUserForm = z.infer<typeof addUserSchema>

function AddSuperUserForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddUserForm>({
    resolver: zodResolver(addUserSchema),
    mode: "onTouched",
    defaultValues: { email: "", name: "" },
  })

  async function onSubmit(data: AddUserForm) {
    setSubmitError(null)
    const res = await apiPost("/platform/superusers", data)
    if (res.ok) {
      reset()
      setOpen(false)
      onAdded()
    } else {
      const err = res as { error?: string; fields?: Record<string, string> }
      setSubmitError(
        err.fields ? Object.values(err.fields).join(", ") : (err.error ?? "Failed to add super user")
      )
    }
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Add Super User
      </Button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4 rounded-lg border border-border bg-muted/30 p-4"
    >
      <h3 className="text-sm font-medium">Add Super User</h3>

      {submitError && <p className="text-sm text-destructive">{submitError}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Name *</Label>
          <input
            id="name"
            type="text"
            className={inputClass(!!errors.name)}
            {...register("name")}
          />
          <FieldError message={errors.name?.message} />
        </div>

        <div>
          <Label htmlFor="email">Email *</Label>
          <input
            id="email"
            type="email"
            className={inputClass(!!errors.email)}
            {...register("email")}
          />
          <FieldError message={errors.email?.message} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? "Adding\u2026" : "Add Super User"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            reset()
            setOpen(false)
            setSubmitError(null)
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SuperUsersPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const { user } = useUser()
  const [users, setUsers] = useState<SuperUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      setAuthProvider(() => getToken())
    }
  }, [isLoaded, isSignedIn, getToken])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await apiGet<SuperUser[]>("/platform/superusers")
    if (res.ok) {
      setUsers(res.data)
    } else if (isNetworkError(res)) {
      setError("API unreachable. Start the API server with wrangler dev.")
    } else {
      setError((res as { error?: string }).error ?? "Failed to load super users")
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleDelete(u: SuperUser) {
    if (!confirm(`Remove ${u.name} (${u.email}) as a super user?`)) return
    setDeletingId(u.id)
    const res = await apiDelete(`/platform/superusers/${encodeURIComponent(u.id)}`)
    setDeletingId(null)
    if (res.ok) {
      load()
    } else {
      alert((res as { error?: string }).error ?? "Failed to remove super user")
    }
  }

  const currentEmail = user?.primaryEmailAddress?.emailAddress?.toLowerCase()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Super Users</h1>
          <p className="text-sm text-muted-foreground">Platform administrators with full access</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <AddSuperUserForm onAdded={load} />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading\u2026</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-muted-foreground">No super users found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = currentEmail && u.email.toLowerCase() === currentEmail
                const isEnvAdmin = u.id.startsWith("env:")
                return (
                  <tr key={u.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">
                      {u.name}
                      {isSelf && (
                        <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3 text-right">
                      {isEnvAdmin ? (
                        <span className="text-xs text-muted-foreground">env var</span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={!!isSelf || deletingId === u.id}
                          onClick={() => handleDelete(u)}
                        >
                          {deletingId === u.id ? "Removing\u2026" : "Remove"}
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
